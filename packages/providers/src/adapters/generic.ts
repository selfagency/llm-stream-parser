import type { ProcessedOutput, ProcessorOptions, StreamChunk } from '@agentsy/core/processor';
import { LLMStreamProcessor } from '@agentsy/core/processor';
import type { ValidateJsonSchemaOptions } from '@agentsy/core/structured';
import { validateJsonSchema } from '@agentsy/core/structured';
import type { XmlToolCall } from '@agentsy/core/tool-calls';
import type { JsonObject } from '@agentsy/shared';

/**
 * Async generator that processes every chunk from a normalised LLM stream
 * and yields a `ProcessedOutput` for each chunk, finishing with a final flush output.
 */
export async function* processStream(
  source: AsyncIterable<StreamChunk>,
  options: ProcessorOptions = {}
): AsyncGenerator<ProcessedOutput> {
  const processor = new LLMStreamProcessor(options);

  for await (const chunk of source) {
    yield processor.process(chunk);
  }

  yield processor.flush();
}

/**
 * Async generator that normalises provider events and processes them through `LLMStreamProcessor`.
 */
export async function* processRawStream<TRawChunk>(
  source: AsyncIterable<TRawChunk>,
  normalize: (_chunk: TRawChunk) => StreamChunk | { chunk: StreamChunk } | null | undefined,
  options: ProcessorOptions = {}
): AsyncGenerator<ProcessedOutput> {
  const processor = new LLMStreamProcessor(options);

  for await (const rawChunk of source) {
    const normalized = normalize(rawChunk);
    if (normalized === null || normalized === undefined) {
      continue;
    }

    const chunk = 'chunk' in normalized ? normalized.chunk : normalized;
    yield processor.process(chunk);
  }

  yield processor.flush();
}

export interface RunStructuredDecisionFromRawStreamOptions<TRawChunk> {
  normalize: (_chunk: TRawChunk) => StreamChunk | { chunk: StreamChunk } | null | undefined;
  onOutput?: (_output: ProcessedOutput) => void | Promise<void>;
  processorOptions?: ProcessorOptions;
  schema: JsonObject;
  selectValidationText?: (_context: { processor: LLMStreamProcessor; finalOutput: ProcessedOutput }) => string;
  source: AsyncIterable<TRawChunk>;
  validationOptions?: ValidateJsonSchemaOptions;
}

export type StructuredDecisionResult<TDecision> =
  | {
      success: true;
      decision: TDecision;
      finalOutput: ProcessedOutput;
      validationText: string;
    }
  | {
      success: false;
      errors: string[];
      finalOutput: ProcessedOutput;
      validationText: string;
    };

export async function runStructuredDecisionFromRawStream<TRawChunk, TDecision = unknown>(
  options: RunStructuredDecisionFromRawStreamOptions<TRawChunk>
): Promise<StructuredDecisionResult<TDecision>> {
  const processor = new LLMStreamProcessor(options.processorOptions);

  for await (const rawChunk of options.source) {
    const normalized = options.normalize(rawChunk);
    if (normalized === null || normalized === undefined) {
      continue;
    }

    const chunk = 'chunk' in normalized ? normalized.chunk : normalized;
    const output = processor.process(chunk);
    if (options.onOutput !== undefined) {
      await options.onOutput(output);
    }
  }

  const finalOutput = processor.flush();
  if (options.onOutput !== undefined) {
    await options.onOutput(finalOutput);
  }

  const validationText =
    options.selectValidationText?.({ finalOutput, processor }) ?? processor.accumulatedMessage.content;

  const validated = validateJsonSchema<TDecision>(validationText, options.schema, options.validationOptions);
  if (!validated.success) {
    return {
      errors: validated.errors,
      finalOutput,
      success: false,
      validationText
    };
  }

  return {
    decision: validated.data,
    finalOutput,
    success: true,
    validationText
  };
}

export interface ApplyDecisionActionOptions<TDecision, TResult> {
  action: (_decision: TDecision) => Promise<TResult> | TResult;
  onSkip?: (_decision: TDecision) => void | Promise<void>;
  shouldAct: (_decision: TDecision) => boolean;
}

export type ApplyDecisionActionResult<TResult> =
  | {
      acted: true;
      result: TResult;
    }
  | {
      acted: false;
    };

export async function applyDecisionAction<TDecision, TResult>(
  decision: TDecision,
  options: ApplyDecisionActionOptions<TDecision, TResult>
): Promise<ApplyDecisionActionResult<TResult>> {
  if (!options.shouldAct(decision)) {
    if (options.onSkip !== undefined) {
      await options.onSkip(decision);
    }
    return { acted: false };
  }

  const result = await options.action(decision);
  return { acted: true, result };
}

export interface GenericAdapterCallbacks {
  onContent?: (_text: string) => void | Promise<void>;
  onDone?: () => void | Promise<void>;
  onError?: (_error: Error, _context: { type: string; chunk?: StreamChunk }) => void | Promise<void>;
  onThinking?: (_text: string) => void | Promise<void>;
  onToolCall?: (_call: XmlToolCall) => void | Promise<void>;
}

export interface GenericAdapterOptions extends ProcessorOptions {
  showThinking?: boolean;
}

async function safeCall<T>(
  callback: (() => Promise<T>) | undefined,
  fallback: T,
  onError?: (_error: Error) => void
): Promise<T> {
  if (!callback) {
    return fallback;
  }
  try {
    return await callback();
  } catch (error) {
    const err = error as Error;
    onError?.(err);
    return fallback;
  }
}

export function createGenericAdapter(
  callbacks: GenericAdapterCallbacks,
  options: GenericAdapterOptions = {}
): {
  write(chunk: StreamChunk): Promise<void>;
  end(): Promise<void>;
} {
  const processor = new LLMStreamProcessor(options);
  const showThinking = options.showThinking ?? true;

  async function emit(output: ProcessedOutput, chunk?: StreamChunk): Promise<void> {
    if (output.thinking && showThinking) {
      await safeCall(
        () => callbacks.onThinking?.(output.thinking) ?? Promise.resolve(),
        undefined,
        error => {
          callbacks.onError?.(error, {
            type: 'thinking',
            ...(chunk !== undefined && { chunk })
          });
        }
      );
    }

    if (output.content) {
      await safeCall(
        () => callbacks.onContent?.(output.content) ?? Promise.resolve(),
        undefined,
        error => {
          callbacks.onError?.(error, {
            type: 'content',
            ...(chunk !== undefined && { chunk })
          });
        }
      );
    }

    for (const toolCall of output.toolCalls) {
      await safeCall(
        () => callbacks.onToolCall?.(toolCall) ?? Promise.resolve(),
        undefined,
        error => {
          callbacks.onError?.(error, {
            type: 'tool_call',
            ...(chunk !== undefined && { chunk })
          });
        }
      );
    }
  }

  return {
    async end(): Promise<void> {
      await emit(processor.flush());
      await safeCall(
        async () => callbacks.onDone?.() ?? Promise.resolve(),
        undefined,
        error => {
          callbacks.onError?.(error, { type: 'done' });
        }
      );
    },
    async write(chunk: StreamChunk): Promise<void> {
      await emit(processor.process(chunk), chunk);
    }
  };
}
