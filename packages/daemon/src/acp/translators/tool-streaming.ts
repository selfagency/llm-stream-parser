/**
 * Tool-Streaming Translator — streams tool-call progress (partial args,
 * status updates) to the editor client.
 *
 * @module
 */

import type { Translator, TranslatorContext, TranslatorResult } from './types.js';

export interface ToolStreamEvent {
  output?: string;
  partialArgs?: string;
  progress?: number; // 0-100
  status: 'running' | 'completed' | 'failed';
  readonly toolCallId: string;
  readonly toolName: string;
}

export class ToolStreamingTranslator implements Translator<ToolStreamEvent[]> {
  readonly name = 'tool-streaming';
  readonly #events: ToolStreamEvent[] = [];
  readonly #maxEvents = 100;

  /** Record a tool call start. */
  recordStart(toolCallId: string, toolName: string, partialArgs?: string): void {
    this.#events.push(
      partialArgs === undefined
        ? { toolCallId, toolName, status: 'running' as const }
        : { toolCallId, toolName, status: 'running' as const, partialArgs }
    );
    if (this.#events.length > this.#maxEvents) {
      this.#events.shift();
    }
  }

  /** Record a tool call progress update. */
  recordProgress(toolCallId: string, progress: number, partialArgs?: string): void {
    const event = this.#events.find(e => e.toolCallId === toolCallId && e.status === 'running');
    if (event) {
      event.progress = progress;
      if (partialArgs !== undefined) {
        event.partialArgs = partialArgs;
      }
    }
  }

  /** Record a tool call completion. */
  recordComplete(toolCallId: string, output?: string): void {
    const event = this.#events.find(e => e.toolCallId === toolCallId && e.status === 'running');
    if (event) {
      event.status = 'completed';
      if (output !== undefined) {
        event.output = output;
      }
    }
  }

  /** Record a tool call failure. */
  recordFailure(toolCallId: string, output?: string): void {
    const event = this.#events.find(e => e.toolCallId === toolCallId && e.status === 'running');
    if (event) {
      event.status = 'failed';
      if (output !== undefined) {
        event.output = output;
      }
    }
  }

  translate(_context: TranslatorContext): TranslatorResult<ToolStreamEvent[]> {
    return {
      success: true,
      data: Array.from(this.#events)
    };
  }
}
