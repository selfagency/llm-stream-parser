/**
 * ACP Server — Agent Client Protocol JSON-RPC 2.0 interface.
 * Phase 18: image/audio, MCP manager, session persistence.
 * @module
 */

import { randomUUID } from 'node:crypto';
import type { Daemon } from '../daemon.js';
import type { SubprocessManager } from '../processes/subprocess-manager.js';
import type { ACPEventLedger } from '../services/acp-event-ledger.js';
import type { Logger } from '../types.js';
import { AGENT_CAPABILITIES } from './acp-capabilities.js';
import { ACPSessionBridge } from './acp-session-bridge.js';
import { parsePromptContent } from './capabilities.js';
import { ACPMCPManager, type MCPServerDefinition } from './mcp-manager.js';
import { ACPSessionPersistence, type ACPSessionRecord } from './session-persistence.js';

export interface ACPServerConfig {
  enabled: boolean;
  ledgerDbPath?: string | undefined;
  maxSessions?: number | undefined;
  persistenceDbPath?: string | undefined;
  transport: 'stdio' | 'websocket';
  websocketPort?: number | undefined;
}

export interface ACPServerDeps {
  daemon: Daemon;
  ledger?: ACPEventLedger | undefined;
  logger: Logger;
  persistenceDbPath?: string | undefined;
  sessionPersistence?: ACPSessionPersistence | undefined;
  subprocessManager: SubprocessManager;
}

interface ACPRequest {
  id: number | string;
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown> | undefined;
}

interface ACPResponse {
  error?: { code: number; message: string } | undefined;
  id: number | string;
  jsonrpc: '2.0';
  result?: unknown;
}

type NotificationHandler = (method: string, params: unknown) => void;
type SendFn = (result: unknown, error?: { code: number; message: string }) => void;

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

export class ACPServer {
  #connection: {
    sendResponse: (response: ACPResponse) => void;
    sendNotification: (method: string, params: unknown) => void;
    close: () => Promise<void>;
  } | null = null;
  readonly #sessions = new Map<string, ACPSessionBridge>();
  readonly #terminals = new Map<string, { processId: string; dirs: string[] }>();
  readonly #deps: ACPServerDeps;
  readonly #mcpManager: ACPMCPManager;
  #persistence: ACPSessionPersistence | null = null;
  readonly #ledger: ACPEventLedger | null;

  constructor(deps: ACPServerDeps) {
    this.#deps = deps;
    this.#mcpManager = new ACPMCPManager({
      logger: deps.logger,
      subprocessManager: deps.subprocessManager
    });
    this.#persistence = deps.sessionPersistence ?? null;
    this.#ledger = deps.ledger ?? null;
  }

  #initPersistence(config: ACPServerConfig): void {
    if (this.#persistence) {
      return;
    }
    const dbPath = config.persistenceDbPath ?? this.#deps.persistenceDbPath ?? ':memory:';
    try {
      this.#persistence = new ACPSessionPersistence(dbPath, this.#deps.logger, this.#ledger ?? this.#deps.ledger);
    } catch (err) {
      this.#deps.logger.warn('Failed to init ACP persistence, falling back to memory-only', {
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  #restoreSessions(): void {
    if (!this.#persistence) {
      return;
    }
    try {
      const restored = this.#persistence.restoreOnStartup();
      for (const rec of restored) {
        if (!this.#sessions.has(rec.sessionId)) {
          const bridge = this.#createBridgeFromRecord(rec);
          this.#sessions.set(rec.sessionId, bridge);
        }
      }
      this.#deps.logger.info(`Restored ${restored.length} persisted ACP sessions`);
    } catch (err) {
      this.#deps.logger.warn('Failed to restore ACP sessions', {
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  #createBridgeFromRecord(rec: ACPSessionRecord): ACPSessionBridge {
    return new ACPSessionBridge({
      sessionId: rec.sessionId,
      agentId: `acp-${rec.sessionId}`,
      daemon: this.#deps.daemon,
      logger: this.#deps.logger,
      cwd: rec.cwd,
      additionalDirectories: rec.additionalDirectories ? [...rec.additionalDirectories] : []
    });
  }

  async start(config: ACPServerConfig): Promise<void> {
    if (!config.enabled) {
      this.#deps.logger.info('ACP server disabled');
      return;
    }
    this.#initPersistence(config);
    this.#restoreSessions();
    this.#deps.logger.info('ACP server started', {
      transport: config.transport,
      port: config.websocketPort,
      capabilities: {
        image: AGENT_CAPABILITIES.promptCapabilities.image,
        audio: AGENT_CAPABILITIES.promptCapabilities.audio,
        http: AGENT_CAPABILITIES.mcpCapabilities.http,
        sse: AGENT_CAPABILITIES.mcpCapabilities.sse
      }
    });
    await Promise.resolve();
  }

  async stop(): Promise<void> {
    for (const [id, bridge] of this.#sessions) {
      await bridge.close();
      this.#sessions.delete(id);
    }
    for (const [termId, term] of this.#terminals) {
      try {
        this.#deps.subprocessManager.killProcess(term.processId);
      } catch {
        // process may already be dead
      }
      this.#terminals.delete(termId);
    }
    try {
      await this.#mcpManager.stopAll();
    } catch {
      // ignore
    }
    if (this.#connection) {
      await this.#connection.close();
      this.#connection = null;
    }
    if (this.#persistence) {
      try {
        this.#persistence.close();
      } catch {
        // ignore
      }
      this.#persistence = null;
    }
    this.#deps.logger.info('ACP server stopped');
  }

  setConnection(conn: {
    sendResponse: (response: ACPResponse) => void;
    sendNotification: (method: string, params: unknown) => void;
    close: () => Promise<void>;
  }): void {
    this.#connection = conn;
  }

  async handleRequest(request: ACPRequest): Promise<void> {
    const { id, method, params } = request;
    const send = (result: unknown, error?: { code: number; message: string }): void => {
      if (!this.#connection) {
        return;
      }
      if (error === undefined) {
        this.#connection.sendResponse({ jsonrpc: '2.0', id, result });
      } else {
        this.#connection.sendResponse({ jsonrpc: '2.0', id, result, error });
      }
    };

    try {
      const handler = this.#methodHandlers().get(method);
      if (!handler) {
        send(undefined, { code: -32_601, message: `Method not found: ${method}` });
        return;
      }
      if (method === 'session/prompt') {
        await handler(params, send);
      } else {
        const result = await handler(params);
        send(result);
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

  #handleInitialize(_params?: Record<string, unknown>): unknown {
    return {
      protocolVersion: '2025-03-26',
      capabilities: AGENT_CAPABILITIES,
      serverInfo: { name: 'agentsy', version: '0.1.0' }
    };
  }

  #handleAuthenticate(_params?: Record<string, unknown>): unknown {
    return { authenticated: true, identity: 'local' };
  }

  async #spawnAgent(cwd: string, additionalDirectories: string[]): Promise<void> {
    const scopeKey = `folder:${cwd}`;
    const agentHost = this.#deps.daemon.agents;
    if (!agentHost) {
      return;
    }
    try {
      await agentHost.spawn({
        spec: { id: 'default', role: 'coder' },
        scope: scopeKey,
        additionalDirectories
      });
    } catch (err) {
      this.#deps.logger.warn('Agent spawn failed (non-fatal)', {
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  async #startMcpForSession(
    sessionId: string,
    mcpServers: Record<string, MCPServerDefinition> | undefined
  ): Promise<{ started: readonly { name: string }[]; failed: readonly { name: string }[] } | undefined> {
    try {
      const res = await this.#mcpManager.startServers(sessionId, mcpServers);
      if (res.failed.length > 0) {
        this.#deps.logger.warn('Some MCP servers failed to start', {
          sessionId,
          failed: res.failed.map(f => f.name)
        });
      }
      return { started: res.started, failed: res.failed };
    } catch (err) {
      this.#deps.logger.warn('MCP manager failed', {
        sessionId,
        error: err instanceof Error ? err.message : String(err)
      });
      return;
    }
  }

  async #handleSessionNew(params?: Record<string, unknown>): Promise<unknown> {
    const sessionId = randomUUID();
    const cwd = (params?.cwd as string) ?? process.cwd();
    const additionalDirectories = (params?.additionalDirectories as string[]) ?? [];
    const mcpServers = params?.mcpServers as Record<string, MCPServerDefinition> | undefined;

    await this.#spawnAgent(cwd, additionalDirectories);
    const mcpResult = await this.#startMcpForSession(sessionId, mcpServers);

    const bridge = new ACPSessionBridge({
      sessionId,
      agentId: `acp-${sessionId}`,
      daemon: this.#deps.daemon,
      logger: this.#deps.logger,
      cwd,
      additionalDirectories
    });
    this.#sessions.set(sessionId, bridge);

    this.#persistNewSession(sessionId, cwd, additionalDirectories, mcpServers);
    this.#recordLedger(sessionId, 'session.create', { cwd, additionalDirectories, mcpServers });

    return { sessionId, mode: 'code', mcpServers: mcpResult };
  }

  #persistNewSession(
    sessionId: string,
    cwd: string,
    additionalDirectories: string[],
    mcpServers: Record<string, MCPServerDefinition> | undefined
  ): void {
    if (!this.#persistence) {
      return;
    }
    try {
      const rec: Omit<ACPSessionRecord, 'createdAt' | 'lastActiveAt'> = {
        sessionId,
        cwd,
        additionalDirectories,
        mcpServers,
        mode: 'code'
      };
      this.#persistence.saveSession(rec);
    } catch (err) {
      this.#deps.logger.warn('Failed to persist ACP session', {
        sessionId,
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  #recordLedger(
    sessionId: string,
    eventType: 'session.create' | 'session.close' | 'session.prompt' | 'stream.end',
    data: Record<string, unknown>
  ): void {
    if (!this.#ledger) {
      return;
    }
    try {
      this.#ledger.record(sessionId, eventType, data);
    } catch {
      // ignore
    }
  }

  async #handleSessionPrompt(
    params?: Record<string, unknown>,
    send?: (result: unknown, error?: { code: number; message: string }) => void
  ): Promise<void> {
    const sessionId = params?.sessionId as string;
    const rawPrompt = params?.prompt as unknown;
    const bridge = this.#sessions.get(sessionId);

    if (!bridge) {
      send?.(undefined, { code: -32_002, message: 'Session not found' });
      return;
    }
    if (rawPrompt === undefined || rawPrompt === null) {
      send?.(undefined, { code: -32_003, message: 'Prompt is required' });
      return;
    }

    try {
      const parsed = parsePromptContent(rawPrompt);
      if (parsed.images.length > 0 || parsed.audios.length > 0) {
        this.#deps.logger.debug('Prompt contains media', {
          sessionId,
          images: parsed.images.length,
          audios: parsed.audios.length
        });
      }
    } catch {
      // non-fatal
    }

    send?.(null);

    const notificationCallback: NotificationHandler = (method, notificationParams) => {
      this.#connection?.sendNotification(method, notificationParams);
    };

    const result = await bridge.handlePrompt(rawPrompt, {
      onChunk: chunk => {
        notificationCallback('session/update', { type: 'agent_message_chunk', content: chunk.text });
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
        const payload: Record<string, unknown> = {
          type: 'tool_call_update',
          toolCallId: update.toolCallId,
          status: update.status
        };
        if (update.output !== undefined) {
          payload.output = update.output;
        }
        notificationCallback('session/update', payload);
      },
      onUsage: usage => {
        notificationCallback('session/update', { type: 'usage_update', usage });
      }
    });

    this.#recordLedger(sessionId, 'session.prompt', { prompt: rawPrompt });
    this.#recordLedger(sessionId, 'stream.end', { stopReason: result.stopReason });

    if (this.#persistence) {
      try {
        this.#persistence.updateSession(sessionId, {});
      } catch {
        // ignore
      }
    }

    notificationCallback('session/update', { type: 'prompt_result', stopReason: result.stopReason });
  }

  #loadPersistedForLoad(sessionId: string): ReturnType<ACPSessionPersistence['loadPersistedState']> | null {
    if (!this.#persistence) {
      return null;
    }
    try {
      return this.#persistence.loadPersistedState(sessionId);
    } catch {
      return null;
    }
  }

  #handleSessionLoad(params?: Record<string, unknown>): unknown {
    const sessionId = params?.sessionId as string;
    if (!sessionId) {
      return { error: { code: -32_002, message: 'Session not found' } };
    }

    const bridge = this.#sessions.get(sessionId);
    if (bridge) {
      const persistedState = this.#loadPersistedForLoad(sessionId);
      return {
        sessionId: bridge.sessionId,
        agentId: bridge.agentId,
        cwd: bridge.cwd,
        mode: 'code',
        additionalDirectories: bridge.additionalDirectories,
        events: persistedState?.events ?? [],
        conversation: persistedState?.materializedViews.conversation ?? []
      };
    }

    const state = this.#loadPersistedForLoad(sessionId);
    if (state) {
      const newBridge = this.#createBridgeFromRecord(state.record);
      this.#sessions.set(sessionId, newBridge);
      return {
        sessionId: state.record.sessionId,
        agentId: newBridge.agentId,
        cwd: state.record.cwd,
        mode: state.record.mode ?? 'code',
        additionalDirectories: state.record.additionalDirectories,
        mcpServers: state.record.mcpServers,
        events: state.events,
        conversation: state.materializedViews.conversation,
        fromPersistence: true
      };
    }

    return { error: { code: -32_002, message: 'Session not found' } };
  }

  #handleSessionList(): unknown {
    const inMemory = Array.from(this.#sessions.entries()).map(([id, bridge]) => ({
      sessionId: id,
      agentId: bridge.agentId,
      cwd: bridge.cwd,
      source: 'memory' as const
    }));

    const persisted = this.#collectPersistedNotInMemory();
    return { sessions: [...inMemory, ...persisted] };
  }

  #collectPersistedNotInMemory(): Array<{ sessionId: string; agentId: string; cwd: string; source: 'persistence' }> {
    const out: Array<{ sessionId: string; agentId: string; cwd: string; source: 'persistence' }> = [];
    if (!this.#persistence) {
      return out;
    }
    try {
      const recs = this.#persistence.listSessions();
      for (const rec of recs) {
        const already = this.#sessions.has(rec.sessionId);
        if (!already) {
          out.push({
            sessionId: rec.sessionId,
            agentId: `acp-${rec.sessionId}`,
            cwd: rec.cwd,
            source: 'persistence'
          });
        }
      }
    } catch {
      // ignore
    }
    return out;
  }

  async #handleSessionClose(params?: Record<string, unknown>): Promise<unknown> {
    const sessionId = params?.sessionId as string;
    const bridge = this.#sessions.get(sessionId);
    const persistedExists = this.#persistence?.loadSession(sessionId);
    const sessionExists = Boolean(bridge ?? persistedExists);
    if (!sessionExists) {
      return { error: { code: -32_002, message: 'Session not found' } };
    }
    if (bridge) {
      await bridge.close();
      this.#sessions.delete(sessionId);
    }
    try {
      this.#mcpManager.stopServers(sessionId);
    } catch {
      // ignore
    }
    this.#recordLedger(sessionId, 'session.close', {});
    return { closed: true };
  }

  async #handleSessionDelete(params?: Record<string, unknown>): Promise<unknown> {
    const closeResult = await this.#handleSessionClose(params);
    const sessionId = params?.sessionId as string;
    if (this.#persistence && sessionId) {
      try {
        this.#persistence.deleteSession(sessionId);
      } catch {
        // ignore
      }
    }
    return closeResult;
  }

  #handleSessionResume(params?: Record<string, unknown>): unknown {
    const sessionId = params?.sessionId as string;
    if (!sessionId) {
      return { error: { code: -32_002, message: 'Session not found' } };
    }
    const bridge = this.#sessions.get(sessionId);
    if (bridge) {
      return { resumed: true, sessionId: bridge.sessionId, source: 'memory' };
    }
    if (!this.#persistence) {
      return { error: { code: -32_002, message: 'Session not found' } };
    }
    try {
      const state = this.#persistence.resumeSession(sessionId);
      if (state) {
        const newBridge = this.#createBridgeFromRecord(state.record);
        this.#sessions.set(sessionId, newBridge);
        return {
          resumed: true,
          sessionId: state.record.sessionId,
          source: 'persistence',
          events: state.events.length,
          conversation: state.materializedViews.conversation
        };
      }
    } catch (err) {
      this.#deps.logger.warn('Failed to resume persisted session', {
        sessionId,
        error: err instanceof Error ? err.message : String(err)
      });
    }
    return { error: { code: -32_002, message: 'Session not found' } };
  }

  #handleSessionCancel(params?: Record<string, unknown>): unknown {
    const sessionId = params?.sessionId as string;
    const bridge = this.#sessions.get(sessionId);
    if (!bridge) {
      return { error: { code: -32_002, message: 'Session not found' } };
    }
    bridge.cancel();
    return { cancelled: true };
  }

  #handleSessionSetMode(params?: Record<string, unknown>): unknown {
    const sessionId = params?.sessionId as string;
    const mode = params?.mode as string;
    const bridge = this.#sessions.get(sessionId);
    if (!bridge) {
      return { error: { code: -32_002, message: 'Session not found' } };
    }
    bridge.setMode(mode);
    if (this.#persistence) {
      try {
        this.#persistence.updateSession(sessionId, { mode });
      } catch {
        // ignore
      }
    }
    return { modeSet: true, mode };
  }

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

  async #handleFsReadTextFile(params?: Record<string, unknown>): Promise<unknown> {
    const filePath = params?.filePath as string;
    const sessionId = params?.sessionId as string;
    const dirs = this.#getSessionDirs(sessionId);
    const within = filePath ? isWithinScope(filePath, dirs) : false;
    if (!within) {
      scopeDenied();
    }
    const fs = await import('node:fs/promises');
    const content = await fs.readFile(filePath, 'utf-8');
    return { content };
  }

  async #handleFsWriteTextFile(params?: Record<string, unknown>): Promise<unknown> {
    const filePath = params?.filePath as string;
    const content = params?.content as string;
    const sessionId = params?.sessionId as string;
    const dirs = this.#getSessionDirs(sessionId);
    const within = filePath ? isWithinScope(filePath, dirs) : false;
    if (!within) {
      scopeDenied();
    }
    const fs = await import('node:fs/promises');
    await fs.writeFile(filePath, content, 'utf-8');
    return { written: true };
  }

  #handleRequestPermission(params?: Record<string, unknown>): unknown {
    const permission = params?.permission as string;
    this.#deps.logger.info('ACP permission request (auto-approved)', { permission });
    return { approved: true };
  }

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

  async #handleTerminalWaitForExit(params?: Record<string, unknown>): Promise<unknown> {
    const terminalId = params?.terminalId as string;
    const term = this.#terminals.get(terminalId);
    if (!term) {
      return { error: { code: -32_006, message: 'Terminal not found' } };
    }
    try {
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

  #handleTerminalKill(params?: Record<string, unknown>): unknown {
    const terminalId = params?.terminalId as string;
    const term = this.#requireTerminal(terminalId);
    try {
      this.#deps.subprocessManager.killProcess(term.processId);
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

  #requireTerminal(terminalId: string): { processId: string; dirs: string[] } {
    const term = this.#terminals.get(terminalId);
    if (!term) {
      throw new ACPError(-32_006, 'Terminal not found');
    }
    return term;
  }

  async #waitForSubprocessExit(processId: string): Promise<number | null> {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const allProcs = this.#deps.subprocessManager.listProcesses();
      const proc = allProcs.find(p => p.id === processId);
      const isDone = !proc || proc.status === 'stopped' || proc.status === 'crashed' || proc.status === 'killed';
      if (isDone) {
        return proc?.exitCode ?? null;
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    return null;
  }

  #getSessionDirs(sessionId: string): string[] {
    const bridge = this.#sessions.get(sessionId);
    if (bridge) {
      return [bridge.cwd, ...bridge.additionalDirectories];
    }
    if (this.#persistence) {
      try {
        const rec = this.#persistence.loadSession(sessionId);
        if (rec) {
          return [rec.cwd, ...(rec.additionalDirectories ?? [])];
        }
      } catch {
        // ignore
      }
    }
    return [process.cwd()];
  }
}
