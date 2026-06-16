import type { CompletionMessage, NormalizedChunk, UsageInfo } from '@agentsy/types';

/** @internal — accumulated state while reading a stream chunk by chunk */
interface ChunkProcessingState {
  accText: string;
  accThinking: string;
  done: boolean;
  finishReason: string | undefined;
  usage: UsageInfo | undefined;
}

/** @internal — callbacks passed into the chunk-processing helpers */
interface ChunkCallbacks {
  onText?: (delta: string) => void;
  onThinking?: (delta: string) => void;
  onToolCall?: (id: string, name: string, args: unknown) => void;
}

/** @internal — a tool call extracted from the stream, pending storage in history */
interface ExtractedToolCall {
  id: string;
  name: string;
  args: unknown;
}

/**
 * Minimal streaming handler interface — avoids direct @agentsy/core/@agentsy/providers dependency.
 * Both `LoadBalancedClient` from @agentsy/gateway and the mock client satisfy this interface.
 */
export interface TurnHandler {
  stream(request: {
    messages: CompletionMessage[];
    model: string;
    stream?: boolean;
  }): Promise<ReadableStream<NormalizedChunk>>;
}

export interface TurnEventOptions {
  onDone?: (finishReason?: string, usage?: UsageInfo) => void;
  onError?: (error: Error) => void;
  onText?: (delta: string) => void;
  onThinking?: (delta: string) => void;
  onToolCall?: (id: string, name: string, args: unknown) => void;
}

export interface TurnResult {
  finishReason?: string;
  text: string;
  thinking: string;
  usage?: UsageInfo;
}

export interface SimpleTurnLoop {
  abort(): void;
  getMessages(): readonly CompletionMessage[];
  reset(): void;
  run(userInput: string, events?: TurnEventOptions): Promise<TurnResult>;
}

export interface SimpleTurnLoopOptions {
  handler: TurnHandler;
  model: string;
  systemPrompt?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers (extracted to reduce cognitive complexity of `run`)
// ---------------------------------------------------------------------------

/** Apply one chunk's fields to the accumulating state. */
function processChunk(chunk: NormalizedChunk, state: ChunkProcessingState, callbacks: ChunkCallbacks): void {
  if (chunk.content) {
    state.accText += chunk.content;
    callbacks.onText?.(chunk.content);
  }

  if (chunk.thinking) {
    state.accThinking += chunk.thinking;
    callbacks.onThinking?.(chunk.thinking);
  }

  if (chunk.tool_calls) {
    for (const toolCall of chunk.tool_calls) {
      const name = toolCall.function?.name ?? '';
      const args = toolCall.function?.arguments ?? {};
      const id = (toolCall as { id?: string }).id ?? `tool-${Date.now()}`;
      if (name) {
        callbacks.onToolCall?.(id, name, args);
      }
    }
  }

  if (chunk.usage) {
    state.usage = chunk.usage;
  }

  if (chunk.done) {
    state.finishReason = chunk.finishReason;
    state.done = true;
  }
}

/**
 * Read chunks from the stream until exhaustion or `chunk.done`.
 * Returns the accumulated text, thinking, finish reason, and usage.
 */
async function readStream(
  reader: ReadableStreamDefaultReader<NormalizedChunk>,
  callbacks: ChunkCallbacks
): Promise<{
  accText: string;
  accThinking: string;
  finishReason: string | undefined;
  usage: UsageInfo | undefined;
}> {
  const state: ChunkProcessingState = {
    accText: '',
    accThinking: '',
    finishReason: undefined,
    usage: undefined,
    done: false
  };

  while (!state.done) {
    const { done, value: chunk } = await reader.read();
    if (done) {
      break;
    }
    processChunk(chunk, state, callbacks);
  }

  return {
    accText: state.accText,
    accThinking: state.accThinking,
    finishReason: state.finishReason,
    usage: state.usage
  };
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

export function createSimpleTurnLoop(options: SimpleTurnLoopOptions): SimpleTurnLoop {
  const { handler, model, systemPrompt } = options;

  const messages: CompletionMessage[] = systemPrompt ? [{ role: 'system', content: systemPrompt }] : [];

  let activeReader: ReadableStreamDefaultReader<NormalizedChunk> | null = null;

  const run = async (userInput: string, events: TurnEventOptions = {}): Promise<TurnResult> => {
    const { onText, onThinking, onToolCall, onDone, onError } = events;

    messages.push({ role: 'user', content: userInput });

    let accText = '';
    let accThinking = '';
    let finishReason: string | undefined;
    let usage: UsageInfo | undefined;
    const extractedToolCalls: ExtractedToolCall[] = [];

    try {
      const stream = await handler.stream({ messages, model, stream: true });
      const reader = stream.getReader();
      activeReader = reader;

      const callbacks: ChunkCallbacks = {};
      if (onText) {
        callbacks.onText = onText;
      }
      if (onThinking) {
        callbacks.onThinking = onThinking;
      }
      // Always capture tool calls for history, forwarding to user callback if provided
      callbacks.onToolCall = (id: string, name: string, args: unknown): void => {
        extractedToolCalls.push({ id, name, args });
        onToolCall?.(id, name, args);
      };

      const result = await readStream(reader, callbacks);
      activeReader = null;

      accText = result.accText;
      accThinking = result.accThinking;
      finishReason = result.finishReason;
      usage = result.usage;
    } catch (err) {
      activeReader = null;
      const error = err instanceof Error ? err : new Error(String(err));
      onError?.(error);
      // Remove the user message we pushed since the turn failed
      messages.pop();
      throw error;
    }

    // Append assistant response to history, including tool calls
    if (accText || accThinking || extractedToolCalls.length > 0) {
      const assistantMessage: CompletionMessage = {
        role: 'assistant',
        content: accText || null
      };

      if (extractedToolCalls.length > 0) {
        assistantMessage.tool_calls = extractedToolCalls.map(tc => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args)
          }
        }));
      }

      messages.push(assistantMessage);
    }

    const result: TurnResult = {
      text: accText,
      thinking: accThinking,
      ...(finishReason === undefined ? {} : { finishReason }),
      ...(usage === undefined ? {} : { usage })
    };
    onDone?.(finishReason, usage);
    return result;
  };

  const getMessages = (): readonly CompletionMessage[] => messages;

  const reset = (): void => {
    messages.length = 0;
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
  };

  const abort = (): void => {
    if (activeReader) {
      activeReader.cancel();
      activeReader = null;
    }
  };

  return { run, getMessages, reset, abort };
}
