import { randomUUID } from 'node:crypto';
import type { Daemon } from '../daemon.js';
import type { Logger } from '../types.js';

export interface ACPSessionBridgeDeps {
  additionalDirectories?: string[];
  agentId?: string;
  cwd?: string;
  daemon: Daemon;
  logger: Logger;
  sessionId?: string;
}

export class ACPSessionBridge {
  readonly sessionId: string;
  readonly agentId: string;
  readonly cwd: string;
  readonly additionalDirectories: string[];
  private readonly configOptions = new Map<string, unknown>();
  private abortController: AbortController | null = null;
  private readonly deps: ACPSessionBridgeDeps;

  constructor(deps: ACPSessionBridgeDeps) {
    this.deps = deps;
    this.sessionId = deps.sessionId ?? randomUUID();
    this.agentId = deps.agentId ?? this.sessionId;
    this.cwd = deps.cwd ?? process.cwd();
    this.additionalDirectories = deps.additionalDirectories ?? [];
  }

  async handlePrompt(
    _prompt: string,
    _callbacks: {
      images?: Array<{ type: string; data: string; mimeType: string }>;
      embeddedContext?: unknown[];
      onChunk: (chunk: { text: string }) => void;
      onToolCall: (toolCall: { id: string; name: string; arguments: string }) => void;
      onToolCallUpdate: (update: { toolCallId: string; status: string; output?: string }) => void;
      onUsage: (usage: { inputTokens: number; outputTokens: number; costUsd?: number }) => void;
    }
  ): Promise<{ stopReason: string }> {
    this.abortController = new AbortController();

    try {
      // Stub: In production, this would route the prompt through the daemon's
      // agent system and stream responses back through the callbacks.
      this.deps.logger.info('ACP session/prompt', {
        sessionId: this.sessionId,
        promptLength: _prompt.length
      });

      return { stopReason: 'end_turn' };
    } finally {
      this.abortController = null;
    }
  }

  cancel(): void {
    this.abortController?.abort();
  }

  setMode(mode: string): void {
    this.mode = mode;
    this.deps.logger.debug(`Session mode set to "${mode}"`, { sessionId: this.sessionId });
  }

  setConfigOption(key: string, value: unknown): void {
    this.configOptions.set(key, value);
    this.deps.logger.debug('Config option set', { sessionId: this.sessionId, key, value });
  }

  async close(): Promise<void> {
    this.cancel();
    this.deps.logger.info('ACP session closed', { sessionId: this.sessionId });
  }
}
