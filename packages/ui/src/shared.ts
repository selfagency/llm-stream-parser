import type { OutputPart, StreamChunk } from '@agentsy/core/processor';
import { LLMStreamProcessor } from '@agentsy/core/processor';
import type { FinishReason, UsageInfo } from '@agentsy/shared';
import type { BaseRendererOptions, RendererHandle } from './types.js';

export function createStepChangeEmitter(
  onStep: BaseRendererOptions['onStep'] | undefined
): (chunk: StreamChunk | ReturnType<LLMStreamProcessor['flush']>) => Promise<void> {
  let lastReportedStepIndex: number | undefined;

  return async (chunk: StreamChunk | ReturnType<LLMStreamProcessor['flush']>): Promise<void> => {
    if (onStep === undefined || chunk.stepIndex === undefined || chunk.stepIndex === lastReportedStepIndex) {
      return;
    }

    lastReportedStepIndex = chunk.stepIndex;
    await onStep(chunk.stepIndex, chunk.stepUsage ?? chunk.usage);
  };
}

/**
 * Shared renderer handler builder to reduce duplication across renderers.
 * Handles common pattern: processor initialization, write/writeChunk dispatch to handlers.
 *
 * @internal
 */
export function createSharedRendererHandle(
  options: BaseRendererOptions,
  handlers: {
    onText: (text: string) => Promise<void>;
    onThinking: (text: string) => Promise<void>;
    onToolCall?: (part: OutputPart & { type: 'tool_call' }) => Promise<void>;
    onToolCallDelta?: (part: OutputPart & { type: 'tool_call_delta' }) => Promise<void>;
    onEnd?: () => Promise<void>;
  },
  onError?: (error: Error) => void
): RendererHandle {
  const { processor, onFinish } = options;

  // Create processor if not provided (owns it internally)
  const llmProcessor = processor ?? new LLMStreamProcessor();

  // Guard flag to prevent double onFinish callback invocation
  let finished = false;
  const emitStepChange = createStepChangeEmitter(options.onStep);

  /**
   * Process output parts through registered handlers.
   */
  async function processParts(parts: OutputPart[]): Promise<void> {
    for (const part of parts) {
      switch (part.type) {
        case 'text': {
          await handlers.onText(part.text);
          break;
        }
        case 'thinking': {
          await handlers.onThinking(part.text);
          break;
        }
        case 'tool_call': {
          if (handlers.onToolCall) {
            await handlers.onToolCall(part);
          }
          break;
        }
        case 'tool_call_delta': {
          if (handlers.onToolCallDelta) {
            await handlers.onToolCallDelta(part);
          }
          break;
        }
        default: {
          break;
        }
      }
    }
  }

  return {
    async end(): Promise<void> {
      try {
        const result = llmProcessor.flush();
        await processParts(result.parts);
        await emitStepChange(result);

        // Fire onFinish if not already fired in writeChunk
        if (!finished && onFinish) {
          finished = true;
          await onFinish(result.finishReason, result.usage);
        }

        // Call stream-specific end handler if provided
        if (handlers.onEnd) {
          await handlers.onEnd();
        }
      } catch (error) {
        if (onError && error instanceof Error) {
          onError(error);
        } else {
          throw error;
        }
      }
    },

    async write(chunk: string): Promise<void> {
      try {
        const result = llmProcessor.process({ content: chunk });
        await processParts(result.parts);
      } catch (error) {
        if (onError && error instanceof Error) {
          onError(error);
        } else {
          throw error;
        }
      }
    },

    async writeChunk(chunk: StreamChunk): Promise<void> {
      try {
        const result = llmProcessor.process(chunk);
        await processParts(result.parts);
        await emitStepChange(result);

        // Fire onFinish callback if stream is done (guard against double invocation)
        if (chunk.done === true && !finished && onFinish) {
          finished = true;
          await onFinish(chunk.finishReason, chunk.usage);
        }
      } catch (error) {
        if (onError && error instanceof Error) {
          onError(error);
        } else {
          throw error;
        }
      }
    }
  };
}

/**
 * Shared writeChunk handler to reduce duplication across renderers.
 * Captures the common try/catch, process, emit step, and onFinish pattern.
 * @internal
 */
export function createWriteChunkHandler(
  llmProcessor: LLMStreamProcessor,
  processParts: (parts: OutputPart[]) => void,
  emitStepChange: (chunk: StreamChunk | ReturnType<LLMStreamProcessor['flush']>) => Promise<void>,
  finishedRef: { current: boolean },
  onFinish:
    | ((finishReason: FinishReason | undefined, usage: UsageInfo | undefined) => void | Promise<void>)
    | undefined,
  onError: ((error: Error) => void) | undefined
): (chunk: StreamChunk) => Promise<void> {
  return async (chunk: StreamChunk): Promise<void> => {
    try {
      const result = llmProcessor.process(chunk);
      processParts(result.parts);
      await emitStepChange(result);

      // Fire onFinish callback if stream is done (guard against double invocation)
      if (chunk.done === true && !finishedRef.current && onFinish) {
        finishedRef.current = true;
        await onFinish(chunk.finishReason, chunk.usage);
      }
    } catch (error) {
      if (onError && error instanceof Error) {
        onError(error);
      } else {
        throw error;
      }
    }
  };
}

/**
 * Shared output writer that handles both function and stream interfaces.
 * @internal
 */
export function createOutputWriter(
  output: NodeJS.WritableStream | ((text: string) => void) | { write: (text: string) => void }
): (text: string) => void {
  return (text: string): void => {
    if (typeof output === 'function') {
      output(text);
    } else if ('write' in output && typeof output.write === 'function') {
      output.write(text);
    }
  };
}
