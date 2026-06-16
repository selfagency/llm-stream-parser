import type { JsonObject, NativeToolCallDelta, ToolCallState } from '@agentsy/shared';

import { parseJson } from '../structured/index.js';

/** A native (JSON-format) tool call that has been fully assembled from streaming deltas. */
export interface NativeToolCall {
  arguments: JsonObject;
  /** Provider-assigned call ID, present when supplied by the provider (e.g. OpenAI `id` field). */
  id?: string;
  name: string;
}

interface PendingCall {
  argumentsBuffer: string;
  id?: string;
  name?: string;
}

/**
 * Accumulates incremental native tool call argument deltas from streaming LLM providers
 * (e.g. OpenAI `tool_calls[].function.arguments` deltas, Anthropic `input_json_delta`).
 *
 * Multiple tool calls may arrive in parallel, distinguished by their numeric `index`.
 * Call `addDelta()` for each incoming delta, then either poll `getCompletedCalls()` during
 * streaming (to detect calls whose JSON is already complete) or call `flush()` at stream end
 * to force-complete any pending calls via JSON repair.
 */
export class ToolCallAccumulator {
  private readonly calls = new Map<number, PendingCall>();

  /**
   * Accumulate a streaming delta. Updates the name, id, and/or argument buffer for
   * the call identified by `delta.index`.
   */
  public addDelta(delta: NativeToolCallDelta): void {
    const existing = this.calls.get(delta.index);
    if (existing) {
      if (delta.id !== undefined) {
        existing.id = delta.id;
      }
      if (delta.name !== undefined) {
        existing.name = delta.name;
      }
      if (delta.argumentsDelta !== undefined) {
        existing.argumentsBuffer += delta.argumentsDelta;
      }
    } else {
      const pending: PendingCall = {
        argumentsBuffer: delta.argumentsDelta ?? ''
      };
      if (delta.id !== undefined) {
        pending.id = delta.id;
      }
      if (delta.name !== undefined) {
        pending.name = delta.name;
      }
      this.calls.set(delta.index, pending);
    }
  }

  /**
   * Returns tool calls whose accumulated argument buffer is currently valid JSON.
   * Does NOT remove them from the accumulator — call `reset()` when done.
   *
   * Useful for emitting tool calls mid-stream when multiple parallel calls are in flight
   * and some complete before others.
   */
  // fallow-ignore-next-line unused-class-member
  public getCompletedCalls(): NativeToolCall[] {
    const result: NativeToolCall[] = [];
    for (const pending of this.calls.values()) {
      if (!pending.name) {
        continue;
      }
      try {
        const parsed = JSON.parse(pending.argumentsBuffer) as JsonObject;
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const call: NativeToolCall = {
            arguments: parsed,
            name: pending.name
          };
          if (pending.id !== undefined) {
            call.id = pending.id;
          }
          result.push(call);
        }
      } catch {
        // Arguments not yet complete.
      }
    }
    return result;
  }

  /**
   * Returns calls whose accumulated argument buffer is valid JSON, together with their
   * numeric `index` within this accumulator. Does NOT remove them from the accumulator
   * — call `removeCall(index)` on each one after emitting mid-stream to prevent
   * double-emission at `flush()` time.
   */
  public getCompletedCallsWithIndices(): {
    index: number;
    call: NativeToolCall;
  }[] {
    const result: { index: number; call: NativeToolCall }[] = [];
    for (const [index, pending] of this.calls.entries()) {
      if (!pending.name) {
        continue;
      }
      try {
        const parsed = JSON.parse(pending.argumentsBuffer) as JsonObject;
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const call: NativeToolCall = {
            arguments: parsed,
            name: pending.name
          };
          if (pending.id !== undefined) {
            call.id = pending.id;
          }
          result.push({ call, index });
        }
      } catch {
        // Not yet complete.
      }
    }
    return result;
  }

  /**
   * Removes the pending call at the given `index`. Call this after emitting a mid-stream
   * completed call so that `flush()` does not re-emit it.
   */
  public removeCall(index: number): void {
    this.calls.delete(index);
  }

  /**
   * Returns the `name` and `id` accumulated so far for the call at the given `index`.
   * Useful for building `tool_call_delta` OutputParts for deltas that arrive after
   * the initial header delta (which carries the name/id).
   */
  public getPendingCallInfo(index: number): { name?: string; id?: string } | undefined {
    const pending = this.calls.get(index);
    if (pending === undefined) {
      return;
    }
    const result: { name?: string; id?: string } = {};
    if (pending.name !== undefined) {
      result.name = pending.name;
    }
    if (pending.id !== undefined) {
      result.id = pending.id;
    }
    return result;
  }

  /**
   * Returns the best-known lifecycle state for the pending call at `index`.
   */
  public getPendingToolCallState(index: number): ToolCallState | undefined {
    const pending = this.calls.get(index);
    if (pending?.name === undefined) {
      return;
    }

    if (pending.argumentsBuffer.length === 0) {
      return 'awaiting-input';
    }

    try {
      const parsed = JSON.parse(pending.argumentsBuffer) as JsonObject;
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return 'input-complete';
      }
    } catch {
      // Still streaming.
    }

    return 'input-streaming';
  }

  private _flushPendingCall(pending: PendingCall): NativeToolCall | null {
    if (!pending.name) {
      return null;
    }

    try {
      const parsed = JSON.parse(pending.argumentsBuffer) as Record<string, unknown>;

      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const call: NativeToolCall = {
          arguments: parsed as JsonObject,
          name: pending.name
        };
        if (pending.id !== undefined) {
          call.id = pending.id;
        }
        return call;
      }
    } catch {
      // Fall through to repair.
    }

    const repaired = parseJson(pending.argumentsBuffer, {
      repairIncomplete: true
    });
    const flushedCall: NativeToolCall = {
      arguments:
        repaired !== null && typeof repaired === 'object' && !Array.isArray(repaired) ? (repaired as JsonObject) : {},
      name: pending.name
    };
    if (pending.id !== undefined) {
      flushedCall.id = pending.id;
    }
    return flushedCall;
  }

  /**
   * Force-completes all pending calls, attempting JSON repair on any incomplete argument
   * buffers via `parseJson`. Returns all calls that have a name, even if their arguments
   * could not be parsed (in which case `arguments` will be `{}`).
   *
   * Drains all accumulated state after returning — subsequent calls to `flush()` or
   * `getCompletedCalls()` will return empty until new deltas are added. Call `reset()`
   * if you also need to discard any state that was accumulated mid-stream.
   *
   * Call this when the stream ends to capture any calls whose arguments never formed
   * complete JSON during streaming.
   */
  // fallow-ignore-next-line unused-class-member
  public flush(): NativeToolCall[] {
    const result: NativeToolCall[] = [];
    for (const pending of this.calls.values()) {
      const call = this._flushPendingCall(pending);
      if (call !== null) {
        result.push(call);
      }
    }
    this.calls.clear();
    return result;
  }

  /**
   * Like `flush()`, but preserves each call's accumulator index for consumers
   * that need stable synthetic IDs derived from index.
   */
  public flushWithIndices(): { index: number; call: NativeToolCall }[] {
    const result: { index: number; call: NativeToolCall }[] = [];
    for (const [index, pending] of this.calls.entries()) {
      const call = this._flushPendingCall(pending);
      if (call !== null) {
        result.push({ call, index });
      }
    }
    this.calls.clear();
    return result;
  }

  /** Clears all accumulated state. */
  public reset(): void {
    this.calls.clear();
  }
}
