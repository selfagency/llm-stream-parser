/**
 * ACP Server — Agent Client Protocol JSON-RPC 2.0 interface.
 *
 * Handles all 20 ACP methods from the compatibility matrix:
 * initialize, authenticate, session/new, session/prompt, session/load,
 * session/list, session/close, session/delete, session/resume,
 * session/cancel, session/set_mode, session/set_config_option,
 * fs/readTextFile, fs/writeTextFile, requestPermission,
 * terminal/create, terminal/output, terminal/wait_for_exit,
 * terminal/kill, terminal/release.
 *
 * @module
 */

import { randomUUID } from 'node:crypto';
import type { Daemon } from '../daemon.js';
import type { SubprocessManager } from '../processes/subprocess-manager.js';
import type { Logger } from '../types.js';
import { AGENT_CAPABILITIES } from './acp-capabilities.js';
import { ACPSessionBridge } from './acp-session-bridge.js';

// ── Types ───────────────────────────────────────────────

export interface ACPServerConfig {
  enabled: boolean;
  maxSessions?: number;
  transport: 'stdio' | 'websocket';
  websocketPort?: number;
}

export interface ACPServerDeps {
  daemon: Daemon;
  logger: Logger;
  subprocessManager: SubprocessManager;
}

interface ACPRequest {
  id: string | number;
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
}

interface ACPResponse {
  error?: { code: number; message: string } | undefined;
  id: string | number;
  jsonrpc: '2.0';
  result?: unknown;
}

type NotificationHandler = (method: string, params: unknown) => void;
type SendFn = (result: unknown, error?: { code: number; message: string }) => void;

// ── Helpers ─────────────────────────────────────────────

function isWithinScope(filePath: string, allowedDirs: string[]): boolean {
  return allowedDirs.some(dir => filePath.startsWith(dir));
}

function scopeDenied(): never {
  throw new ACPError(-32_001, 'Path outside workspace scope');
}

class ACPError extends Error {
  readonly code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
    this.name = 'ACPError';
  }
}

// ── Server ──────────────────────────────────────────────

export class ACPServer {
  #connection: {
    sendResponse: (response: ACPResponse) => void;
    sendNotification: (method: string, params: unknown) => void;
    close: () => Promise<void>;
  } | null = null;
  readonly #sessions = new Map<string, ACPSessionBridge>();
  readonly #terminals = new Map<string, { processId: string; dirs: string[] }>();
  readonly #deps: ACPServerDeps;

  constructor(deps: ACPServerDeps) {
    this.#deps = deps;
  }

  async start(config: ACPServerConfig): Promise<void> {
    if (!config.enabled) {
      this.#deps.logger.info('ACP server disabled');
      return;
    }

    this.#deps.logger.info('ACP server started', {
      transport: config.transport,
      port: config.websocketPort
    });
    await Promise.resolve();
  }

  async stop(): Promise<void> {
    // Close all sessions
    for (const [id, bridge] of this.#sessions) {
      await bridge.close();
      this.#sessions.delete(id);
    }

    // Kill all terminals
    for (const [termId, term] of this.#terminals) {
      try {
        this.#deps.subprocessManager.killProcess(term.processId);
      } catch {
        // process may already be dead
      }
      this.#terminals.delete(termId);
    }

    if (this.#connection) {
      await this.#connection.close();
      this.#connection = null;
    }

    this.#deps.logger.info('ACP server stopped');
  }

  /** Register the transport connection handler. */
  setConnection(conn: {
    sendResponse: (response: ACPResponse) => void;
    sendNotification: (method: string, params: unknown) => void;
    close: () => Promise<void>;
  }): void {
    this.#connection = conn;
  }

  /** Handle an incoming JSON-RPC 2.0 request. */
  async handleRequest(request: ACPRequest): Promise<void> {
    const { id, method, params } = request;
    const send = (result: unknown, error?: { code: number; message: string }): void => {
      this.#connection?.sendResponse(
        error === undefined ? { jsonrpc: '2.0', id, result } : { jsonrpc: '2.0', id, result, error }
      );
    };

    try {
      const handler = this.#methodHandlers().get(method);
      if (handler) {
        if (method === 'session/prompt') {
          await handler(params, send);
        } else {
          const result = await handler(params);
          send(result);
        }
      } else {
        send(undefined, { code: -32_601, message: `Method not found: ${method}` });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.#deps.logger.error('ACP handler error', { method, error: message });
      send(undefined, { code: -32_603, message: `Internal error: ${message}` });
    }
  }

  #methodHandlers(): Map<string, (params?: Record<string, unknown>, send?: SendFn) => unknown | Promise<unknown>> {
    return new Map([
      ['initialize', this.#handleInitialize.bind(this)],
      ['authenticate', this.#handleAuthenticate.bind(this)],
      ['session/new', this.#handleSessionNew.bind(this)],
      ['session/prompt', this.#handleSessionPrompt.bind(this)],
      ['session/load', this.#handleSessionLoad.bind(this)],
      ['session/list', this.#handleSessionList.bind(this)],
      ['session/close', this.#handleSessionClose.bind(this)],
      ['session/delete', this.#handleSessionDelete.bind(this)],
      ['session/resume', this.#handleSessionResume.bind(this)],
      ['session/cancel', this.#handleSessionCancel.bind(this)],
      ['session/set_mode', this.#handleSessionSetMode.bind(this)],
      ['session/set_config_option', this.#handleSessionSetConfigOption.bind(this)],
      ['fs/readTextFile', this.#handleFsReadTextFile.bind(this)],
      ['fs/writeTextFile', this.#handleFsWriteTextFile.bind(this)],
      ['requestPermission', this.#handleRequestPermission.bind(this)],
      ['terminal/create', this.#handleTerminalCreate.bind(this)],
      ['terminal/output', this.#handleTerminalOutput.bind(this)],
      ['terminal/wait_for_exit', this.#handleTerminalWaitForExit.bind(this)],
      ['terminal/kill', this.#handleTerminalKill.bind(this)],
      ['terminal/release', this.#handleTerminalRelease.bind(this)]
    ]);
  }

  // ── Handler: initialize ─────────────────────────

  #handleInitialize(_params?: Record<string, unknown>): unknown {
    return {
      protocolVersion: '2025-03-26',
      capabilities: AGENT_CAPABILITIES,
      serverInfo: {
        name: 'agentsy',
        version: '0.1.0'
      }
    };
  }

  // ── Handler: authenticate ───────────────────────

  #handleAuthenticate(_params?: Record<string, unknown>): unknown {
    return { authenticated: true, identity: 'local' };
  }

  // ── Handler: session/new ────────────────────────

  async #handleSessionNew(params?: Record<string, unknown>): Promise<unknown> {
    const sessionId = randomUUID();
    const cwd = (params?.cwd as string) ?? process.cwd();
    const additionalDirectories = (params?.additionalDirectories as string[]) ?? [];
    const mcpServers = params?.mcpServers as
      | Record<string, { command: string; args?: string[]; env?: Record<string, string> }>
      | undefined;

    // Derive scope from cwd (folder-based scoping)
    const scopeKey = `folder:${cwd}`;

    // Spawn agent with folder scope
    const agentId = `acp-${sessionId}`;
    const agentHost = this.#deps.daemon.agents;
    if (agentHost) {
      try {
        await agentHost.spawn({
          spec: { id: 'default', role: 'coder' },
          scope: scopeKey,
          additionalDirectories
        });
      } catch (err) {
        this.#deps.logger.warn('Agent spawn failed (non-fatal)', {
          sessionId,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    // Start MCP servers provided by the client
    await this.#spawnMcpServers(mcpServers, sessionId);

    // Create session bridge
    const bridge = new ACPSessionBridge({
      sessionId,
      agentId,
      daemon: this.#deps.daemon,
      logger: this.#deps.logger,
      cwd,
      additionalDirectories
    });
    this.#sessions.set(sessionId, bridge);

    return { sessionId, mode: 'code' };
  }

  // ── Handler: session/prompt ─────────────────────

  async #handleSessionPrompt(
    params?: Record<string, unknown>,
    send?: (result: unknown, error?: { code: number; message: string }) => void
  ): Promise<void> {
    const sessionId = params?.sessionId as string;
    const prompt = params?.prompt as string;
    const bridge = this.#sessions.get(sessionId);

    if (!bridge) {
      send?.(undefined, { code: -32_002, message: 'Session not found' });
      return;
    }

    if (!prompt) {
      send?.(undefined, { code: -32_003, message: 'Prompt is required' });
      return;
    }

    // Send acknowledgement immediately
    send?.(null);

    const notificationCallback: NotificationHandler = (method, notificationParams) => {
      this.#connection?.sendNotification(method, notificationParams);
    };

    const result = await bridge.handlePrompt(prompt, {
      onChunk: chunk => {
        notificationCallback('session/update', {
          type: 'agent_message_chunk',
          content: chunk.text
        });
      },
      onToolCall: toolCall => {
        notificationCallback('session/update', {
          type: 'tool_call',
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          arguments: toolCall.arguments,
          status: 'running'
        });
      },
      onToolCallUpdate: update => {
        notificationCallback('session/update', {
          type: 'tool_call_update',
          toolCallId: update.toolCallId,
          status: update.status,
          ...(update.output === undefined ? {} : { output: update.output })
        });
      },
      onUsage: usage => {
        notificationCallback('session/update', {
          type: 'usage_update',
          usage
        });
      }
    });

    // Send prompt result as notification
    notificationCallback('session/update', {
      type: 'prompt_result',
      stopReason: result.stopReason
    });
  }

  // ── Handler: session/load ───────────────────────

  #handleSessionLoad(params?: Record<string, unknown>): unknown {
    const sessionId = params?.sessionId as string;
    const bridge = this.#sessions.get(sessionId);

    if (!bridge) {
      return { error: { code: -32_002, message: 'Session not found' } };
    }

    return {
      sessionId: bridge.sessionId,
      agentId: bridge.agentId,
      cwd: bridge.cwd,
      mode: 'code'
    };
  }

  // ── Handler: session/list ───────────────────────

  #handleSessionList(): unknown {
    const sessions = Array.from(this.#sessions.entries()).map(([id, bridge]) => ({
      sessionId: id,
      agentId: bridge.agentId,
      cwd: bridge.cwd
    }));
    return { sessions };
  }

  // ── Handler: session/close ──────────────────────

  async #handleSessionClose(params?: Record<string, unknown>): Promise<unknown> {
    const sessionId = params?.sessionId as string;
    const bridge = this.#sessions.get(sessionId);
    if (!bridge) {
      return { error: { code: -32_002, message: 'Session not found' } };
    }
    await bridge.close();
    this.#sessions.delete(sessionId);
    return { closed: true };
  }

  // ── Handler: session/delete ─────────────────────

  #handleSessionDelete(params?: Record<string, unknown>): Promise<unknown> {
    return this.#handleSessionClose(params);
  }

  // ── Handler: session/resume ─────────────────────

  #handleSessionResume(params?: Record<string, unknown>): unknown {
    const sessionId = params?.sessionId as string;
    const bridge = this.#sessions.get(sessionId);
    if (!bridge) {
      return { error: { code: -32_002, message: 'Session not found' } };
    }
    return { resumed: true, sessionId: bridge.sessionId };
  }

  // ── Handler: session/cancel ─────────────────────

  #handleSessionCancel(params?: Record<string, unknown>): unknown {
    const sessionId = params?.sessionId as string;
    const bridge = this.#sessions.get(sessionId);
    if (!bridge) {
      return { error: { code: -32_002, message: 'Session not found' } };
    }
    bridge.cancel();
    return { cancelled: true };
  }

  // ── Handler: session/set_mode ───────────────────

  #handleSessionSetMode(params?: Record<string, unknown>): unknown {
    const sessionId = params?.sessionId as string;
    const mode = params?.mode as string;
    const bridge = this.#sessions.get(sessionId);
    if (!bridge) {
      return { error: { code: -32_002, message: 'Session not found' } };
    }
    bridge.setMode(mode);
    return { modeSet: true, mode };
  }

  // ── Handler: session/set_config_option ──────────

  #handleSessionSetConfigOption(params?: Record<string, unknown>): unknown {
    const sessionId = params?.sessionId as string;
    const key = params?.key as string;
    const value = params?.value;
    const bridge = this.#sessions.get(sessionId);
    if (!bridge) {
      return { error: { code: -32_002, message: 'Session not found' } };
    }
    bridge.setConfigOption(key, value);
    return { configured: true };
  }

  // ── Handler: fs/readTextFile ───────────────────

  async #handleFsReadTextFile(params?: Record<string, unknown>): Promise<unknown> {
    const filePath = params?.filePath as string;
    const sessionId = params?.sessionId as string;
    const dirs = this.#getSessionDirs(sessionId);
    if (!(filePath && isWithinScope(filePath, dirs))) {
      scopeDenied();
    }
    const fs = await import('node:fs/promises');
    const content = await fs.readFile(filePath, 'utf-8');
    return { content };
  }

  // ── Handler: fs/writeTextFile ──────────────────

  async #handleFsWriteTextFile(params?: Record<string, unknown>): Promise<unknown> {
    const filePath = params?.filePath as string;
    const content = params?.content as string;
    const sessionId = params?.sessionId as string;
    const dirs = this.#getSessionDirs(sessionId);
    if (!(filePath && isWithinScope(filePath, dirs))) {
      scopeDenied();
    }
    const fs = await import('node:fs/promises');
    await fs.writeFile(filePath, content, 'utf-8');
    return { written: true };
  }

  // ── Handler: requestPermission ──────────────────

  #handleRequestPermission(params?: Record<string, unknown>): unknown {
    const permission = params?.permission as string;
    // Local mode: auto-approve
    this.#deps.logger.info('ACP permission request (auto-approved)', { permission });
    return { approved: true };
  }

  // ── Handler: terminal/create ────────────────────

  async #handleTerminalCreate(params?: Record<string, unknown>): Promise<unknown> {
    const sessionId = params?.sessionId as string;
    const command = params?.command as string;
    const args = (params?.args as string[]) ?? [];
    const dirs = this.#getSessionDirs(sessionId);

    const termId = `term-${randomUUID().slice(0, 8)}`;
    const processId = `acp-term-${termId}`;

    try {
      await this.#deps.subprocessManager.spawnProcess({
        id: processId,
        command,
        args,
        cwd: dirs[0] ?? process.cwd()
      });
      this.#terminals.set(termId, { processId, dirs });
      return { terminalId: termId, processId };
    } catch (err) {
      return {
        error: {
          code: -32_005,
          message: `Failed to create terminal: ${err instanceof Error ? err.message : String(err)}`
        }
      };
    }
  }

  // ── Handler: terminal/output ───────────────────

  #handleTerminalOutput(params?: Record<string, unknown>): unknown {
    const terminalId = params?.terminalId as string;
    const term = this.#terminals.get(terminalId);
    if (!term) {
      return { error: { code: -32_006, message: 'Terminal not found' } };
    }

    try {
      const output = this.#deps.subprocessManager.getOutput(term.processId);
      if (!output) {
        return { output: '', exitCode: null };
      }
      return { output: output.stdout.join('\n'), exitCode: null };
    } catch {
      return { output: '', exitCode: null };
    }
  }

  // ── Handler: terminal/wait_for_exit ─────────────

  async #handleTerminalWaitForExit(params?: Record<string, unknown>): Promise<unknown> {
    const terminalId = params?.terminalId as string;
    const term = this.#terminals.get(terminalId);
    if (!term) {
      return { error: { code: -32_006, message: 'Terminal not found' } };
    }

    try {
      // ACP terminal/wait_for_exit — poll until the process exits or times out
      const exitCode = await this.#waitForSubprocessExit(term.processId);
      return { exitCode };
    } catch (err) {
      return {
        error: {
          code: -32_007,
          message: `Failed to wait for terminal: ${err instanceof Error ? err.message : String(err)}`
        }
      };
    }
  }

  // ── Handler: terminal/kill ─────────────────────

  async #handleTerminalKill(params?: Record<string, unknown>): Promise<unknown> {
    const terminalId = params?.terminalId as string;
    const term = this.#requireTerminal(terminalId);

    try {
      await this.#deps.subprocessManager.killProcess(term.processId);
      return { killed: true };
    } catch (err) {
      return {
        error: {
          code: -32_008,
          message: `Failed to kill terminal: ${err instanceof Error ? err.message : String(err)}`
        }
      };
    }
  }

  // ── Handler: terminal/release ──────────────────

  #handleTerminalRelease(params?: Record<string, unknown>): unknown {
    const terminalId = params?.terminalId as string;
    const term = this.#terminals.get(terminalId);
    if (!term) {
      return { error: { code: -32_006, message: 'Terminal not found' } };
    }

    try {
      this.#deps.subprocessManager.killProcess(term.processId);
    } catch {
      // already unregistered
    }
    this.#terminals.delete(terminalId);
    return { released: true };
  }

  // ── Helpers ───────────────────────────────────

  /** Get a terminal by ID or throw a not-found error. */
  #requireTerminal(terminalId: string): { processId: string; dirs: string[] } {
    const term = this.#terminals.get(terminalId);
    if (!term) {
      throw new ACPError(-32_006, 'Terminal not found');
    }
    return term;
  }

  /** Spawn MCP servers provided by the ACP client. */
  async #spawnMcpServers(
    mcpServers: Record<string, { command: string; args?: string[]; env?: Record<string, string> }> | undefined,
    sessionId: string
  ): Promise<void> {
    if (!mcpServers) {
      return;
    }
    for (const [name, server] of Object.entries(mcpServers)) {
      try {
        await this.#deps.subprocessManager.spawnProcess({
          id: `acp-mcp-${sessionId}-${name}`,
          command: server.command,
          ...(server.args ? { args: server.args } : {}),
          ...(server.env ? { env: server.env } : {}),
          restartPolicy: 'always'
        });
      } catch (err) {
        this.#deps.logger.warn('Failed to spawn client MCP server', {
          name,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }
  }

  /** Poll a subprocess until it exits, with a 30s timeout. */
  async #waitForSubprocessExit(processId: string): Promise<number | null> {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const allProcs = this.#deps.subprocessManager.listProcesses();
      const proc = allProcs.find(p => p.id === processId);
      if (!proc || proc.status === 'stopped' || proc.status === 'crashed' || proc.status === 'killed') {
        return proc?.exitCode ?? null;
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    return null;
  }

  #getSessionDirs(sessionId: string): string[] {
    const bridge = this.#sessions.get(sessionId);
    if (!bridge) {
      return [process.cwd()];
    }
    return [bridge.cwd, ...bridge.additionalDirectories];
  }
}
