/**
 * ACP MCP Manager — manages MCP servers spawned via session/new
 * @module
 */

import type { SubprocessManager } from '../processes/subprocess-manager.js';
import type { Logger } from '../types.js';

export interface MCPServerDefinition {
  readonly args?: readonly string[] | undefined;
  readonly command?: string | undefined;
  readonly env?: Record<string, string> | undefined;
  readonly headers?: Record<string, string> | undefined;
  readonly type?: 'http' | 'sse' | 'stdio' | undefined;
  readonly url?: string | undefined;
}

export type MCPServerStatus = 'error' | 'running' | 'stopped';

export interface ManagedMCPServer {
  readonly definition: MCPServerDefinition;
  readonly name: string;
  readonly processId: string;
  readonly sessionId: string;
  readonly startedAt: string;
  readonly status: MCPServerStatus;
}

export interface ACPMCPManagerDeps {
  readonly logger: Logger;
  readonly subprocessManager: SubprocessManager;
}

export interface StartResult {
  readonly failed: readonly { error: string; name: string }[];
  readonly started: readonly ManagedMCPServer[];
}

interface StartOneResult {
  readonly failed?: { error: string; name: string };
  readonly started?: ManagedMCPServer;
}

export class ACPMCPManager {
  readonly #deps: ACPMCPManagerDeps;
  readonly #servers = new Map<string, Map<string, ManagedMCPServer>>();

  constructor(deps: ACPMCPManagerDeps) {
    this.#deps = deps;
  }

  async startServers(
    sessionId: string,
    mcpServers: Record<string, MCPServerDefinition> | undefined
  ): Promise<StartResult> {
    if (!mcpServers || Object.keys(mcpServers).length === 0) {
      return { started: [], failed: [] };
    }
    if (!sessionId) {
      throw new Error('sessionId is required to start MCP servers');
    }

    const started: ManagedMCPServer[] = [];
    const failed: { error: string; name: string }[] = [];

    let sessionMap = this.#servers.get(sessionId);
    if (!sessionMap) {
      sessionMap = new Map<string, ManagedMCPServer>();
      this.#servers.set(sessionId, sessionMap);
    }

    for (const [name, def] of Object.entries(mcpServers)) {
      if (!name) {
        continue;
      }
      const validation = validateDefinition(def);
      if (!validation.valid) {
        this.#deps.logger.warn(`Invalid MCP server definition for ${name}: ${validation.error}`);
        failed.push({ name, error: validation.error ?? 'invalid definition' });
        continue;
      }
      const result = await this.#startOne(sessionId, name, def, sessionMap);
      if (result.started) {
        started.push(result.started);
      }
      if (result.failed) {
        failed.push(result.failed);
      }
    }

    return { started, failed };
  }

  async #startOne(
    sessionId: string,
    name: string,
    def: MCPServerDefinition,
    sessionMap: Map<string, ManagedMCPServer>
  ): Promise<StartOneResult> {
    const processId = `acp-mcp-${sessionId}-${name}`;
    const startedAt = new Date().toISOString();

    const existing = sessionMap.get(name);
    if (existing) {
      const procList = this.#deps.subprocessManager.listProcesses();
      const stillRunning = procList.some(p => p.id === processId && p.status === 'running');
      if (stillRunning) {
        return { started: existing };
      }
    }

    const isHttpOrSse = def.type === 'http' || def.type === 'sse';
    if (isHttpOrSse && def.url && !def.command) {
      const managed: ManagedMCPServer = {
        name,
        definition: def,
        processId: `config-${processId}`,
        sessionId,
        startedAt,
        status: 'running'
      };
      sessionMap.set(name, managed);
      this.#deps.logger.info(`MCP server ${name} registered as ${def.type}`, { sessionId, name, type: def.type });
      return { started: managed };
    }

    if (!def.command) {
      this.#deps.logger.warn(`MCP server ${name} missing command, skipping`, { sessionId });
      return { failed: { name, error: 'command is required for stdio servers' } };
    }

    try {
      const spec: Record<string, unknown> = {
        id: processId,
        command: def.command,
        args: def.args ? [...def.args] : [],
        restartPolicy: 'always',
        stallTimeoutMs: 120_000
      };
      if (def.env) {
        spec.env = def.env;
      }
      await this.#deps.subprocessManager.spawnProcess(spec as never);
      const managed: ManagedMCPServer = {
        name,
        definition: def,
        processId,
        sessionId,
        startedAt,
        status: 'running'
      };
      sessionMap.set(name, managed);
      this.#deps.logger.info(`MCP server ${name} spawned`, { sessionId, name, processId, command: def.command });
      return { started: managed };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.#deps.logger.warn(`Failed to spawn MCP server ${name}`, { sessionId, error: msg });
      return { failed: { name, error: msg } };
    }
  }

  stopServers(sessionId: string): number {
    const sessionMap = this.#servers.get(sessionId);
    if (!sessionMap) {
      return 0;
    }
    let stopped = 0;
    for (const [name, managed] of sessionMap) {
      const isConfigOnly = managed.processId.startsWith('config-');
      if (isConfigOnly) {
        stopped++;
        continue;
      }
      try {
        this.#deps.subprocessManager.killProcess(managed.processId);
        stopped++;
        this.#deps.logger.info(`MCP server ${name} stopped`, { sessionId, processId: managed.processId });
      } catch {
        // already dead
      }
    }
    this.#servers.delete(sessionId);
    return stopped;
  }

  listServers(sessionId?: string): readonly ManagedMCPServer[] {
    if (sessionId) {
      return this.#listForSession(sessionId);
    }
    return this.#listAll();
  }

  #listForSession(sessionId: string): readonly ManagedMCPServer[] {
    const map = this.#servers.get(sessionId);
    if (map) {
      return Array.from(map.values());
    }
    return [];
  }

  #listAll(): readonly ManagedMCPServer[] {
    const all: ManagedMCPServer[] = [];
    for (const map of this.#servers.values()) {
      all.push(...map.values());
    }
    return all;
  }

  getServer(sessionId: string, name: string): ManagedMCPServer | undefined {
    return this.#servers.get(sessionId)?.get(name);
  }

  async stopAll(): Promise<number> {
    await Promise.resolve();
    let total = 0;
    const sessionIds = Array.from(this.#servers.keys());
    for (const sid of sessionIds) {
      const count = this.stopServers(sid);
      total += count;
    }
    return total;
  }

  count(): number {
    let c = 0;
    for (const m of this.#servers.values()) {
      c += m.size;
    }
    return c;
  }
}

function isHttpProtocol(protocol: string): boolean {
  return protocol === 'http:' || protocol === 'https:';
}

function validateUrl(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url);
    if (!isHttpProtocol(parsed.protocol)) {
      return { valid: false, error: `url must be http or https, got ${parsed.protocol}` };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: `invalid url: ${url}` };
  }
}

function validateDefinition(def: MCPServerDefinition): { valid: boolean; error?: string } {
  if (!def) {
    return { valid: false, error: 'definition is empty' };
  }
  const type = def.type ?? (def.url ? 'http' : 'stdio');
  const cmd = def.command;
  const hasCommand = typeof cmd === 'string' && cmd.trim().length > 0;

  if (type === 'stdio' && !hasCommand) {
    return { valid: false, error: 'command is required for stdio type' };
  }

  if (type === 'http' || type === 'sse') {
    return validateHttpDef(def, hasCommand);
  }

  if (def.args !== undefined) {
    const argsOk = Array.isArray(def.args);
    if (!argsOk) {
      return { valid: false, error: 'args must be an array' };
    }
  }

  return { valid: true };
}

function validateHttpDef(def: MCPServerDefinition, hasCommand: boolean): { valid: boolean; error?: string } {
  if (def.url) {
    const urlCheck = validateUrl(def.url);
    if (!urlCheck.valid) {
      return urlCheck;
    }
  }
  const hasUrlOrCommand = Boolean(def.url) || hasCommand;
  if (!hasUrlOrCommand) {
    return { valid: false, error: 'http/sse server requires url or command' };
  }
  return { valid: true };
}

export function createMCPManager(deps: ACPMCPManagerDeps): ACPMCPManager {
  if (!deps.subprocessManager) {
    throw new Error('subprocessManager is required');
  }
  if (!deps.logger) {
    throw new Error('logger is required');
  }
  return new ACPMCPManager(deps);
}
