/**
 * ACP Notification Adapter — maps daemon stream events to ACP
 * `session/update` notifications.
 *
 * | Daemon Event              | ACP `session/update` Type        | Content                                                |
 * |---------------------------|-----------------------------------|--------------------------------------------------------|
 * | `stream.chunk` (content)  | `agent_message_chunk`             | `{ content: string }`                                  |
 * | `stream.chunk` (thinking) | `agent_thought_chunk`             | `{ content: string }`                                  |
 * | `stream.chunk` (tc_start) | `tool_call`                       | `{ toolCallId, toolName, arguments, status: "running" }` |
 * | `stream.chunk` (tc_end)   | `tool_call_update`                | `{ toolCallId, status, output }`                       |
 * | `stream.end` (usage)      | `usage_update`                    | `{ usage: { inputTokens, outputTokens, costUsd } }`   |
 *
 * @module
 */

import type { StreamChunk } from '@agentsy/shared';
import type { Logger } from '../types.js';

export interface ACPNotificationAdapterDeps {
  logger: Logger;
}

export type ACPNotificationCallback = (method: string, params: unknown) => void;

/**
 * Per-session wiring state: tracks which ACP session is subscribed
 * to which agent stream and holds the ACP notification callback.
 */
interface SessionWire {
  agentId: string;
  notify: ACPNotificationCallback;
  sessionId: string;
}

/**
 * Maps daemon stream events to ACP `session/update` notifications.
 *
 * Call `wireAgentToSession()` when an ACP session is established
 * to subscribe to stream events for that agent. Call `unwireSession()`
 * on session close.
 */
export class ACPNotificationAdapter {
  private readonly deps: ACPNotificationAdapterDeps;
  private readonly wires = new Map<string, SessionWire>();

  constructor(deps: ACPNotificationAdapterDeps) {
    this.deps = deps;
  }

  /**
   * Wire an agent stream to an ACP session. Future stream chunks
   * for this agent will be forwarded as ACP `session/update`
   * notifications.
   *
   * @param agentId - The agent whose stream events to subscribe to.
   * @param sessionId - The ACP session that receives notifications.
   * @param notify - Callback to send an ACP notification.
   */
  wireAgentToSession(agentId: string, sessionId: string, notify: ACPNotificationCallback): void {
    this.wires.set(agentId, { agentId, sessionId, notify });
    this.deps.logger.debug('ACP notification wired', { agentId, sessionId });
  }

  /**
   * Unwire a session. Call when the ACP session closes.
   */
  unwireSession(sessionId: string): void {
    for (const [agentId, wire] of this.wires) {
      if (wire.sessionId === sessionId) {
        this.wires.delete(agentId);
        this.deps.logger.debug('ACP notification unwired', { agentId, sessionId });
      }
    }
  }

  /**
   * Emit a `StreamChunk` as an ACP `session/update` notification.
   * Called by the `StreamManager` for each chunk emitted during
   * a stream that has a wired ACP session.
   *
   * Returns the number of wired sessions the chunk was forwarded to.
   */
  emitChunk(agentId: string, chunk: StreamChunk): number {
    const wire = this.wires.get(agentId);
    if (!wire) {
      return 0;
    }

    let count = 0;

    if (chunk.content) {
      wire.notify('session/update', {
        type: 'agent_message_chunk',
        content: chunk.content
      });
      count++;
    }

    // Thinking chunk → agent_thought_chunk
    if (chunk.thinking) {
      wire.notify('session/update', {
        type: 'agent_thought_chunk',
        content: chunk.thinking
      });
      count++;
    }

    // Tool call deltas
    if (chunk.nativeToolCallDeltas) {
      for (const delta of chunk.nativeToolCallDeltas) {
        // Starting a tool call
        if (delta.id && delta.name) {
          wire.notify('session/update', {
            type: 'tool_call',
            toolCallId: delta.id,
            toolName: delta.name,
            arguments: delta.argumentsDelta ?? '',
            status: 'running'
          });
          count++;
        }
        // Tool call update (delta has id but not name — it's a continuation)
        // These are sent as tool_call_update deltas.
        // In ACP, tool_call_update carries status+output, so we
        // only emit meaningful deltas here. The accumulator in the
        // runtime layer will emit the final tool_call_end.
      }
    }

    return count;
  }

  /**
   * Emit a tool call end event as an ACP `session/update` notification.
   */
  emitToolCallEnd(agentId: string, toolCallId: string, status: string, output: string | undefined): number {
    const wire = this.wires.get(agentId);
    if (!wire) {
      return 0;
    }

    wire.notify('session/update', {
      type: 'tool_call_update',
      toolCallId,
      status,
      ...(output === undefined ? {} : { output })
    });

    return 1;
  }

  /**
   * Emit a usage update as an ACP `session/update` notification.
   */
  emitUsage(agentId: string, usage: { inputTokens: number; outputTokens: number; costUsd: number }): number {
    const wire = this.wires.get(agentId);
    if (!wire) {
      return 0;
    }

    wire.notify('session/update', {
      type: 'usage_update',
      usage: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: usage.costUsd
      }
    });

    return 1;
  }

  /**
   * Emit a stream error as an ACP `session/update` error notification.
   */
  emitError(agentId: string, errorMessage: string): number {
    const wire = this.wires.get(agentId);
    if (!wire) {
      return 0;
    }

    wire.notify('session/update', {
      type: 'error',
      error: errorMessage
    });

    return 1;
  }
}
