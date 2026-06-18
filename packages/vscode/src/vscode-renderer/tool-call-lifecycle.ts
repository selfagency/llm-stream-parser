import type { OutputPart } from '@agentsy/core/processor';
import { parseJson } from '@agentsy/core/structured';

export interface VSCodeToolCallPartLike {
  callId: string;
  input: Record<string, unknown>;
  name: string;
}

interface PendingDeltaCall {
  argumentsBuffer: string;
  id?: string;
  name?: string;
}

/**
 * Converts a processor `tool_call` output part into a VS Code-like tool-call payload.
 */
export function toVSCodeToolCallPart(
  part: Extract<OutputPart, { type: 'tool_call' }>,
  options?: { fallbackCallId?: string | (() => string) }
): VSCodeToolCallPartLike {
  const fallbackCallId =
    typeof options?.fallbackCallId === 'function'
      ? options.fallbackCallId()
      : (options?.fallbackCallId ?? `${part.call.name}_call`);

  return {
    callId: part.call.id ?? fallbackCallId,
    input: part.call.parameters,
    name: part.call.name
  };
}

/**
 * Stateful accumulator for streaming `tool_call_delta` parts.
 */
export class ToolCallDeltaAccumulator {
  private readonly calls = new Map<number, PendingDeltaCall>();

  add(delta: Extract<OutputPart, { type: 'tool_call_delta' }>): void {
    const existing = this.calls.get(delta.index);
    if (existing !== undefined) {
      if (delta.id !== undefined) {
        existing.id = delta.id;
      }
      existing.name = delta.name;
      existing.argumentsBuffer += delta.argumentsDelta;
      return;
    }

    this.calls.set(delta.index, {
      ...(delta.id === undefined ? {} : { id: delta.id }),
      argumentsBuffer: delta.argumentsDelta,
      name: delta.name
    });
  }

  finalize(options?: {
    repairIncomplete?: boolean;
    onWarning?: (message: string, context?: Record<string, unknown>) => void;
  }): VSCodeToolCallPartLike[] {
    const repairIncomplete = options?.repairIncomplete ?? true;
    const parts: VSCodeToolCallPartLike[] = [];

    for (const [index, call] of this.calls.entries()) {
      const fallbackId = call.id ?? `native_${index}`;
      const fallbackName = call.name ?? 'tool_call';
      const parsed = this.parseArgumentsBuffer(call.argumentsBuffer, index, repairIncomplete, options?.onWarning);

      parts.push({
        callId: fallbackId,
        input: parsed,
        name: fallbackName
      });
    }

    this.calls.clear();
    return parts;
  }

  reset(): void {
    this.calls.clear();
  }

  private parseArgumentsBuffer(
    argumentsBuffer: string,
    index: number,
    repairIncomplete: boolean,
    onWarning?: (message: string, context?: Record<string, unknown>) => void
  ): Record<string, unknown> {
    if (argumentsBuffer.length === 0) {
      return {};
    }

    const parsed = this.parseStrictJsonObject(argumentsBuffer);
    if (parsed !== null) {
      return parsed;
    }

    if (!repairIncomplete) {
      onWarning?.('Malformed tool_call_delta arguments; using empty input.', {
        index
      });
      return {};
    }

    const repaired = this.parseRepairedJsonObject(argumentsBuffer);
    if (repaired !== null) {
      return repaired;
    }

    onWarning?.('Unable to repair malformed tool_call_delta arguments; using empty input.', {
      index
    });
    return {};
  }

  private parseStrictJsonObject(value: string): Record<string, unknown> | null {
    try {
      const json = JSON.parse(value) as unknown;
      return this.asObjectRecord(json);
    } catch {
      return null;
    }
  }

  private parseRepairedJsonObject(value: string): Record<string, unknown> | null {
    const repaired = parseJson(value, { repairIncomplete: true });
    return this.asObjectRecord(repaired);
  }

  private asObjectRecord(value: unknown): Record<string, unknown> | null {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }
}

/** Convenience function wrapper around ToolCallDeltaAccumulator#add. */
export function accumulateToolCallDeltas(
  accumulator: ToolCallDeltaAccumulator,
  delta: Extract<OutputPart, { type: 'tool_call_delta' }>
): void {
  accumulator.add(delta);
}
