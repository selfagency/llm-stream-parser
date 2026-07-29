/**
 * SandboxService — capability/budget checks + virtualSandbox delegation.
 *
 * Phase 18: Missing Capabilities — Tool Execution Sandbox
 *
 * Flow:
 *  1. Verify tool is registered and agent has permission (capabilities includes toolName)
 *  2. Respect tool deny-rule filtering (subtask 06) — denied tools behave as unknown/blocked
 *  3. Check budget: throws if tokensUsed >= max_tokens_per_session
 *  4. Execute in sandbox (Docker, E2B, or virtual vm) via virtualSandbox
 *  5. Allowed secrets via secretsGuard
 *  6. Audit trail via audit()
 *
 * @module
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface ToolExecutionRequest {
  readonly agentId: string;
  readonly args: Record<string, unknown>;
  readonly requestId?: string;
  readonly timeoutMs?: number;
  readonly toolName: string;
}

export interface SandboxInput {
  readonly agentId: string;
  readonly args: Record<string, unknown>;
  readonly secrets: Record<string, string>;
  readonly timeout: number;
  readonly tool: SandboxTool;
}

export interface SandboxTool {
  readonly handler?: (
    args: Record<string, unknown>,
    ctx?: { agentId?: string; secrets?: Record<string, string> }
  ) => Promise<unknown> | unknown;
  readonly name: string;
  readonly timeout?: number;
  readonly [key: string]: unknown;
}

export type SandboxExecutionStatus = 'ok' | 'error' | 'timeout' | 'blocked';

export interface SandboxOutput {
  readonly data?: unknown;
  readonly durationMs: number;
  readonly error?: string;
  readonly status: SandboxExecutionStatus;
  readonly stderr?: string;
  readonly stdout?: string;
}

export interface ToolExecutionResult {
  readonly agentId: string;
  readonly data?: unknown;
  readonly durationMs: number;
  readonly error?: string;
  readonly ok: boolean;
  readonly status: SandboxExecutionStatus;
  readonly stderr?: string;
  readonly stdout?: string;
  readonly toolName: string;
}

// ── Dependencies ─────────────────────────────────────────────────────────────

export interface ToolRegistryLike {
  get(name: string): SandboxTool | undefined;
  list?(): SandboxTool[];
}

export interface AgentSpec {
  readonly capabilities: readonly string[];
}

export interface AgentBudget {
  readonly max_tokens_per_session?: number;
  readonly max_tokens_per_turn?: number;
  readonly [key: string]: unknown;
}

export interface AgentRecord {
  readonly budget?: AgentBudget;
  readonly id?: string;
  readonly spec: AgentSpec;
  readonly tokensUsed?: number;
  readonly [key: string]: unknown;
}

export interface AgentHostLike {
  getAgent(agentId: string): AgentRecord | null | undefined;
}

export interface VirtualSandboxLike {
  execute(input: SandboxInput): Promise<SandboxOutput>;
}

export interface SecretsGuardLike {
  getAllowedSecrets(agentId: string): Record<string, string>;
}

export interface ToolFilterConfig {
  readonly allow?: readonly string[];
  readonly deny?: readonly string[];
}

export interface AuditEvent {
  readonly agentId: string;
  readonly args: Record<string, unknown>;
  readonly data?: unknown;
  readonly durationMs: number;
  readonly error?: string;
  readonly ok: boolean;
  readonly requestId?: string;
  readonly status: SandboxExecutionStatus;
  readonly timestamp: string;
  readonly toolName: string;
}

export type AuditSink = (event: AuditEvent) => Promise<void> | void;

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
}

export interface SandboxServiceDeps {
  readonly agentHost: AgentHostLike;
  readonly auditSink?: AuditSink;
  readonly logger?: Logger;
  readonly secretsGuard?: SecretsGuardLike;
  readonly toolFilterConfig?: ToolFilterConfig;
  readonly toolRegistry: ToolRegistryLike;
  readonly virtualSandbox: VirtualSandboxLike;
}

export interface SandboxServiceOptions {
  readonly auditEnabled?: boolean;
  readonly defaultTimeoutMs?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function createNoopLogger(): Logger {
  return {
    debug(_msg: string, _meta?: Record<string, unknown>) {
      // noop
    },
    error(_msg: string, _meta?: Record<string, unknown>) {
      // noop
    },
    info(_msg: string, _meta?: Record<string, unknown>) {
      // noop
    },
    warn(_msg: string, _meta?: Record<string, unknown>) {
      // noop
    }
  };
}

function validateString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid ${field}: must be a non-empty string`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`Invalid ${field}: must be a non-empty string`);
  }
  return trimmed;
}

function assertValidArgs(args: unknown): asserts args is Record<string, unknown> {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw new Error('Invalid args: must be a Record<string, unknown>');
  }
}

function matchesPattern(name: string, pattern: string): boolean {
  if (!pattern) {
    return false;
  }
  if (pattern === '*') {
    return true;
  }
  if (!pattern.includes('*')) {
    return name === pattern;
  }
  const escaped = pattern.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&');
  const re = new RegExp(`^${escaped.replace(/\*/g, '.*')}$`);
  return re.test(name);
}

function matchesAnyPattern(name: string, patterns: readonly string[]): boolean {
  for (const p of patterns) {
    if (matchesPattern(name, p)) {
      return true;
    }
  }
  return false;
}

function isToolAllowedByFilter(toolName: string, config: ToolFilterConfig): boolean {
  const allow = config.allow ?? [];
  const deny = config.deny ?? [];
  if (allow.length > 0 && !matchesAnyPattern(toolName, allow)) {
    return false;
  }
  if (deny.length > 0 && matchesAnyPattern(toolName, deny)) {
    return false;
  }
  return true;
}

function nowIso(): string {
  return new Date().toISOString();
}

function checkBudget(agent: AgentRecord, agentId: string): void {
  const maxTokens = agent.budget?.max_tokens_per_session;
  const tokensUsed = agent.tokensUsed ?? 0;
  if (typeof maxTokens === 'number' && maxTokens > 0 && tokensUsed >= maxTokens) {
    throw new Error(`Agent "${agentId}" exceeded token budget`);
  }
}

function resolveSecrets(guard: SecretsGuardLike | undefined, agentId: string, logger: Logger): Record<string, string> {
  if (!guard?.getAllowedSecrets) {
    return {};
  }
  try {
    return guard.getAllowedSecrets(agentId) ?? {};
  } catch (err) {
    logger.warn('secretsGuard.getAllowedSecrets failed', {
      agentId,
      error: err instanceof Error ? err.message : String(err)
    });
    return {};
  }
}

function buildResult(agentId: string, toolName: string, output: SandboxOutput): ToolExecutionResult {
  let result: ToolExecutionResult = {
    agentId,
    toolName,
    ok: output.status === 'ok',
    status: output.status,
    durationMs: output.durationMs
  };
  if (output.data !== undefined) {
    result = { ...result, data: output.data };
  }
  if (output.stdout !== undefined) {
    result = { ...result, stdout: output.stdout };
  }
  if (output.stderr !== undefined) {
    result = { ...result, stderr: output.stderr };
  }
  if (output.error) {
    result = { ...result, error: output.error };
  }
  return result;
}

// ── Core interface ───────────────────────────────────────────────────────────

export interface SandboxService {
  readonly auditTrail: readonly AuditEvent[];
  execute(request: ToolExecutionRequest): Promise<ToolExecutionResult>;
  getAuditTrail(): AuditEvent[];
  readonly name: string;
  sleep(): Promise<void>;
  start(): Promise<void>;
  readonly state: 'stopped' | 'running' | 'sleeping';
  stop(): Promise<void>;
  wakeup(): Promise<void>;
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function createSandboxService(deps: SandboxServiceDeps, options: SandboxServiceOptions = {}): SandboxService {
  if (!deps.toolRegistry || typeof deps.toolRegistry.get !== 'function') {
    throw new Error('SandboxService requires toolRegistry with get()');
  }
  if (!deps.agentHost || typeof deps.agentHost.getAgent !== 'function') {
    throw new Error('SandboxService requires agentHost with getAgent()');
  }
  if (!deps.virtualSandbox || typeof deps.virtualSandbox.execute !== 'function') {
    throw new Error('SandboxService requires virtualSandbox with execute()');
  }

  const logger = deps.logger ?? createNoopLogger();
  const defaultTimeoutMs = options.defaultTimeoutMs ?? 30_000;
  const auditEnabled = options.auditEnabled ?? true;
  const toolFilterConfig = deps.toolFilterConfig;

  let _state: 'stopped' | 'running' | 'sleeping' = 'stopped';
  const auditTrail: AuditEvent[] = [];

  async function auditEvent(request: ToolExecutionRequest, result: ToolExecutionResult): Promise<void> {
    if (!auditEnabled) {
      return;
    }
    const event: AuditEvent = {
      timestamp: nowIso(),
      agentId: request.agentId,
      toolName: request.toolName,
      args: request.args,
      data: result.data,
      durationMs: result.durationMs,
      ok: result.ok,
      status: result.status,
      ...(request.requestId ? { requestId: request.requestId } : {}),
      ...(result.error ? { error: result.error } : {})
    };
    auditTrail.push(event);
    if (deps.auditSink) {
      try {
        const maybePromise = deps.auditSink(event);
        if (maybePromise instanceof Promise) {
          await maybePromise;
        }
      } catch (err) {
        logger.warn('auditSink failed', {
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
    logger.info('Tool execution audited', {
      agentId: request.agentId,
      toolName: request.toolName,
      status: result.status,
      ok: result.ok,
      durationMs: result.durationMs
    });
  }

  async function doExecute(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
    const toolName = validateString(request.toolName, 'toolName');
    const agentId = validateString(request.agentId, 'agentId');
    assertValidArgs(request.args);

    if (toolFilterConfig) {
      const allowed = isToolAllowedByFilter(toolName, toolFilterConfig);
      if (!allowed) {
        logger.debug('Tool blocked by filter config', {
          toolName,
          filter: toolFilterConfig
        });
        throw new Error(`Tool "${toolName}" is blocked by deny-rule filtering`);
      }
    }

    const tool = deps.toolRegistry.get(toolName);
    if (!tool) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    const agent = deps.agentHost.getAgent(agentId);
    if (!agent) {
      throw new Error(`Unknown agent: ${agentId}`);
    }

    const capabilities = agent.spec?.capabilities;
    if (!Array.isArray(capabilities)) {
      throw new Error(`Agent "${agentId}" lacks capability: ${toolName}`);
    }
    if (!capabilities.includes(toolName)) {
      throw new Error(`Agent "${agentId}" lacks capability: ${toolName}`);
    }

    checkBudget(agent, agentId);

    const allowedSecrets = resolveSecrets(deps.secretsGuard, agentId, logger);
    const timeout = request.timeoutMs ?? tool.timeout ?? defaultTimeoutMs;

    const sandboxInput: SandboxInput = {
      tool,
      args: request.args,
      agentId,
      timeout,
      secrets: allowedSecrets
    };

    let sandboxOutput: SandboxOutput;
    try {
      sandboxOutput = await deps.virtualSandbox.execute(sandboxInput);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const errorResult: ToolExecutionResult = {
        agentId,
        toolName,
        ok: false,
        status: 'error',
        durationMs: 0,
        error: message
      };
      await auditEvent(request, errorResult);
      throw new Error(`Sandbox execution failed for tool "${toolName}": ${message}`);
    }

    const result = buildResult(agentId, toolName, sandboxOutput);
    await auditEvent(request, result);
    return result;
  }

  const service: SandboxService = {
    name: 'sandbox',

    get state() {
      return _state;
    },

    get auditTrail(): readonly AuditEvent[] {
      return auditTrail;
    },

    // biome-ignore lint/suspicious/useAwait: lifecycle interface requires Promise
    async start(): Promise<void> {
      _state = 'running';
      logger.info('SandboxService started');
    },

    // biome-ignore lint/suspicious/useAwait: lifecycle interface requires Promise
    async stop(): Promise<void> {
      _state = 'stopped';
      logger.info('SandboxService stopped');
    },

    // biome-ignore lint/suspicious/useAwait: lifecycle interface requires Promise
    async sleep(): Promise<void> {
      _state = 'sleeping';
      logger.info('SandboxService sleeping');
    },

    // biome-ignore lint/suspicious/useAwait: lifecycle interface requires Promise
    async wakeup(): Promise<void> {
      _state = 'running';
      logger.info('SandboxService woke up');
    },

    execute(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
      return doExecute(request);
    },

    getAuditTrail(): AuditEvent[] {
      return [...auditTrail];
    }
  };

  return service;
}

// ── Class wrapper for spec compatibility ────────────────────────────────────

export class SandboxServiceImpl implements SandboxService {
  readonly #inner: SandboxService;
  readonly name = 'sandbox';

  constructor(deps: SandboxServiceDeps, options: SandboxServiceOptions = {}) {
    this.#inner = createSandboxService(deps, options);
  }

  get state(): 'stopped' | 'running' | 'sleeping' {
    return this.#inner.state;
  }

  get auditTrail(): readonly AuditEvent[] {
    return this.#inner.auditTrail;
  }

  async start(): Promise<void> {
    await this.#inner.start();
  }

  async stop(): Promise<void> {
    await this.#inner.stop();
  }

  async sleep(): Promise<void> {
    await this.#inner.sleep();
  }

  async wakeup(): Promise<void> {
    await this.#inner.wakeup();
  }

  async execute(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
    return await this.#inner.execute(request);
  }

  getAuditTrail(): AuditEvent[] {
    return this.#inner.getAuditTrail();
  }
}

export const SandboxService = SandboxServiceImpl;
