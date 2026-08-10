import type {
  ConversationEvent,
  FinishReason,
  NativeToolCallDelta,
  StreamChunk,
  ToolCallState,
  UsageInfo
} from '@agentsy/shared';

import { ThinkingParser } from '../../thinking/index.js';
import type { NativeToolCall, XmlToolCall } from '../../tool-calls/index.js';
import { extractXmlToolCalls, ToolCallAccumulator } from '../../tool-calls/index.js';
import type { XmlStreamFilter } from '../../xml-filter/index.js';
import { createXmlStreamFilter } from '../../xml-filter/index.js';
import type { AccumulatedMessage } from './accumulated-message.js';
import { enforceMaxLength, ensureText, mapNativeToolCalls } from './chunk-utils.js';
import { detectIncompleteness } from './incompleteness.js';
import { getChunkInputFlags, recordChunkStats, updatePostProcessStats } from './llm-stream-processor.stats.js';
import type {
  IncompletenessDetail,
  OutputPart,
  ProcessedOutput,
  ProcessorOptions,
  StreamEventMap
} from './llm-stream-processor.types.js';
import type { ProcessorStats } from './processor-stats.js';
import { createEmptyStats } from './processor-stats.js';
import type { ToolCallParser } from './tool-call-parser.js';

export type { StreamChunk } from '@agentsy/shared';
export type {
  IncompletenessDetail,
  IncompletenessType,
  OutputPart,
  ProcessedOutput,
  ProcessorOptions,
  StreamEventMap
} from './llm-stream-processor.types.js';

const DEFAULT_MAX_INPUT_LENGTH = 256 * 1024;
const DEFAULT_MAX_TOOL_CALLS_PER_MESSAGE = 64;
const DEFAULT_MAX_TOOL_ARGUMENT_BYTES = 128 * 1024;
const _DEFAULT_MAX_XML_NESTING_DEPTH = 64; // Reserved for future XML nesting depth limits
const DEFAULT_MAX_RESIDUAL_BYTES = 1024 * 1024; // 1 MiB
const DEFAULT_MAX_WARNINGS = 100;
const SHARED_TEXT_ENCODER = new TextEncoder();

/**
 * Processes a normalised LLM stream chunk-by-chunk, extracting thinking blocks,
 * filtering XML tags, accumulating tool calls, and emitting typed events.
 *
 * @example
 * ```ts
 * const processor = new LLMStreamProcessor({ parseThinkTags: true });
 *
 * for await (const chunk of normalizedStream) {
 *   const output = processor.process(chunk);
 *   if (output.content) process.stdout.write(output.content);
 * }
 *
 * const final = processor.flush();
 * if (final.incomplete) console.warn('Stream cut short', final.incompleteness);
 * ```
 */
export class LLMStreamProcessor {
  private readonly options: Required<Pick<ProcessorOptions, 'parseThinkTags' | 'scrubContextTags'>> & ProcessorOptions;
  private thinkingParser: ThinkingParser | null;
  private xmlFilter: XmlStreamFilter | null;
  private readonly nativeAccumulator: ToolCallAccumulator | null;
  private readonly toolCallParsers: ToolCallParser[];

  private _accumulatedThinking = '';
  private _accumulatedContent = '';
  private _accumulatedToolCalls: XmlToolCall[] = [];
  private _accumulatedUsage: UsageInfo | undefined = undefined;
  private _lastFinishReason: FinishReason | undefined = undefined;
  private doneEmitted = false;
  private _warningCount = 0;
  private _stats: ProcessorStats;
  /** Tracks which accumulator indices have been emitted mid-stream to avoid double-emission at flush. */
  private readonly _midStreamEmittedCallIndices = new Set<number>();
  // Accumulate filtered XML fragments returned by the XmlStreamFilter so
  // that tool-call blocks spanning multiple chunks can be reconstructed and
  // extracted when they become complete.
  private _filteredResidual = '';
  // Accumulate raw (unfiltered) incoming content fragments to allow
  // reconstruction of tool_call blocks that were split across chunks
  // even when the xmlFilter will scrub those tags.
  private _rawResidual = '';

  private _partsController: ReadableStreamDefaultController<OutputPart> | null = null;
  private _partsSource: ReadableStream<OutputPart>;
  private _cachedPartsStream: ReadableStream<OutputPart> | null = null;
  private _conversationMessageId: string | null = null;
  private _conversationMessageCounter = 0;
  private _lastConversationStepIndex: number | undefined = undefined;
  private _lastConversationStepUsage: UsageInfo | undefined = undefined;
  private _syntheticToolCallCounter = 0;
  private readonly _conversationToolCallsByKey = new Map<string, string>();
  private readonly _seenConversationToolCallIds = new Set<string>();
  private readonly _conversationToolCallObjectIds = new WeakMap<XmlToolCall, string>();
  private readonly _warnCallback: (message: string, context?: Record<string, unknown>) => void;
  private conversationDoneEmitted = false;

  private get usagePayload(): { usage: UsageInfo } | Record<string, never> {
    if (this._accumulatedUsage !== undefined) {
      return { usage: this._accumulatedUsage };
    }
    return {};
  }

  private readonly listeners: {
    [K in keyof StreamEventMap]: Set<StreamEventMap[K]>;
  } = {
    conversation_event: new Set(),
    done: new Set(),
    text: new Set(),
    thinking: new Set(),
    tool_call: new Set(),
    tool_call_delta: new Set(),
    tool_call_part: new Set(),
    usage: new Set(),
    warning: new Set()
  };

  /** Creates a new processor instance. Reuse across a single conversation; call `reset()` between conversations. */
  public constructor(options: ProcessorOptions = {}) {
    this.options = {
      ...options,
      parseThinkTags: options.parseThinkTags ?? true,
      scrubContextTags: options.scrubContextTags ?? true
    };

    this.thinkingParser = this.createThinkingParser();
    this.xmlFilter = this.createXmlFilter();
    this.nativeAccumulator = (options.accumulateNativeToolCalls ?? true) ? new ToolCallAccumulator() : null;
    this.toolCallParsers = options.toolCallParsers ?? [];
    this._stats = createEmptyStats();
    this._warnCallback = this.warn.bind(this);
    this._partsSource = new ReadableStream<OutputPart>({
      start: controller => {
        this._partsController = controller;
      }
    });
  }

  /**
   * A `ReadableStream<OutputPart>` that emits every part produced by `process()` and `flush()`.
   *
   * If `transforms` were supplied in the constructor options, the stream is the result of
   * chaining each transform via `pipeThrough()`. The stream is closed automatically after
   * the first chunk with `done: true` is processed, or when `reset()` is called.
   *
   * **Note on stream completion**: Consumers should not assume the stream closes immediately
   * after processing a chunk with `done: true`. The stream is closed when the processor is
   * explicitly reset or destroyed. Call `reset()` or rely on the processor lifecycle methods
   * to properly complete and reuse the stream.
   *
   * Note: the stream may only be read once; subsequent accesses return the cached stream.
   */
  public get partsStream(): ReadableStream<OutputPart> {
    // Cache the stream to prevent multiple locks on the same stream
    if (this._cachedPartsStream !== null) {
      return this._cachedPartsStream;
    }

    const transforms = this.options.transforms ?? [];
    this._cachedPartsStream = transforms.reduce<ReadableStream<OutputPart>>(
      (stream, transform) => stream.pipeThrough(transform),
      this._partsSource
    );

    return this._cachedPartsStream;
  }

  /**
   * Processes a single stream chunk and returns the processed output delta.
   * May be called any number of times before `flush()`.
   */
  public process(chunk: StreamChunk): ProcessedOutput {
    const startTime = performance.now();
    recordChunkStats(this._stats, chunk, SHARED_TEXT_ENCODER);
    const { hasContentInput, hasThinkingInput } = getChunkInputFlags(chunk);
    const done = chunk.done === true;

    const preparedInput = this.prepareChunkInput(chunk, done);
    const parsedThinking = this.applyThinkingParserToContent(preparedInput.rawThinking, preparedInput.content);
    const { thinking } = parsedThinking;
    let { content } = parsedThinking;

    const toolCallState = this.computeToolCallState({
      chunk,
      content,
      done,
      nativeToolCallDeltas: preparedInput.nativeToolCallDeltas,
      rawContent: preparedInput.content
    });
    ({ content } = toolCallState);

    // Note: xmlFilter.write() was already invoked earlier to reassemble
    // fragments before extraction.

    const output = this.buildOutput({
      thinking,
      content,
      toolCalls: toolCallState.completedToolCalls,
      toolCallParts: toolCallState.toolCallParts,
      ...(toolCallState.toolCallDeltas.length > 0 ? { toolCallDeltas: toolCallState.toolCallDeltas } : {}),
      done,
      ...(chunk.stepIndex === undefined ? {} : { stepIndex: chunk.stepIndex }),
      ...(chunk.stepUsage === undefined ? {} : { stepUsage: chunk.stepUsage }),
      ...(done && this._lastFinishReason !== undefined ? { finishReason: this._lastFinishReason } : {}),
      ...this.usagePayload
    });
    this.recordOutput(output);
    this.emitOutput(output);
    const bufferSize = this._accumulatedContent.length + this._accumulatedThinking.length;
    updatePostProcessStats({
      bufferSize,
      hasContentInput,
      hasThinkingInput,
      output,
      startTime,
      stats: this._stats
    });

    return output;
  }

  private prepareChunkInput(
    chunk: StreamChunk,
    done: boolean
  ): {
    rawThinking: string;
    content: string;
    nativeToolCallDeltas: NativeToolCallDelta[];
  } {
    const maxInputLength = this.options.maxInputLength ?? DEFAULT_MAX_INPUT_LENGTH;
    const rawThinking = enforceMaxLength(ensureText(chunk.thinking), 'thinking', maxInputLength, this._warnCallback);
    const rawContent = enforceMaxLength(ensureText(chunk.content), 'content', maxInputLength, this._warnCallback);

    const inlineToolCallParse = this.parseInlineToolCalls(rawContent, done);
    return {
      content: inlineToolCallParse.content,
      nativeToolCallDeltas: [
        ...(Array.isArray(chunk.nativeToolCallDeltas) ? chunk.nativeToolCallDeltas : []),
        ...(inlineToolCallParse.nativeToolCallDeltas ?? [])
      ],
      rawThinking
    };
  }

  private applyThinkingParserToContent(rawThinking: string, rawContent: string): { thinking: string; content: string } {
    if (!(this.thinkingParser && rawContent)) {
      return { content: rawContent, thinking: rawThinking };
    }

    const [thinkingDelta, contentDelta] = this.thinkingParser.addContent(rawContent);
    return {
      content: contentDelta,
      thinking: rawThinking + thinkingDelta
    };
  }

  private computeToolCallState(params: {
    chunk: StreamChunk;
    rawContent: string;
    content: string;
    nativeToolCallDeltas: NativeToolCallDelta[];
    done: boolean;
  }): {
    content: string;
    completedToolCalls: XmlToolCall[];
    toolCallParts: Extract<OutputPart, { type: 'tool_call' }>[];
    toolCallDeltas: Extract<OutputPart, { type: 'tool_call_delta' }>[];
  } {
    const { chunk, rawContent, nativeToolCallDeltas, done } = params;
    const extraction = this.extractToolCallsFromXmlBuffers(rawContent, params.content);
    const { content, extractedXmlToolCalls } = extraction;

    const nativeToolCalls = mapNativeToolCalls(chunk.tool_calls);
    if (chunk.finishReason !== undefined) {
      this._lastFinishReason = chunk.finishReason;
    }

    this.accumulateUsage(chunk);
    this.accumulateNativeDeltas(nativeToolCallDeltas);

    const toolCallDeltas = this.buildToolCallDeltaParts(nativeToolCallDeltas);
    const midStreamCalls = this.collectMidStreamCompletedToolCalls();

    const accumulatedNativeCalls: Extract<OutputPart, { type: 'tool_call' }>[] =
      done && this.nativeAccumulator
        ? this.mapAccumulatedNativeCallsWithIndices(this.nativeAccumulator.flushWithIndices(), 'input-complete')
        : [];

    const completedToolCalls = this.enforceToolCallLimits([
      ...extractedXmlToolCalls,
      ...nativeToolCalls,
      ...midStreamCalls.map(part => part.call),
      ...accumulatedNativeCalls.map(part => part.call)
    ]);

    const pendingToolCallParts = this.nativeAccumulator
      ? this.buildPendingNativeToolCallParts(nativeToolCallDeltas)
      : [];

    const toolCallParts = this.composeToolCallParts(
      pendingToolCallParts,
      midStreamCalls,
      accumulatedNativeCalls,
      completedToolCalls
    );

    return {
      completedToolCalls,
      content,
      toolCallDeltas,
      toolCallParts
    };
  }

  private extractToolCallsFromXmlBuffers(
    rawContent: string,
    initialContent: string
  ): { content: string; extractedXmlToolCalls: XmlToolCall[] } {
    let content = initialContent;
    const extractedFromRaw =
      this.options.knownTools && rawContent ? extractXmlToolCalls(rawContent, this.options.knownTools) : [];

    const extractedFromRawResidual = this.extractFromRawResidual(rawContent);
    content = this.appendFilteredResidualContent(content);

    const extractedFromFiltered =
      this.options.knownTools && content ? extractXmlToolCalls(content, this.options.knownTools) : [];

    return {
      content,
      extractedXmlToolCalls: this.mergeUniqueToolCalls(
        extractedFromRaw,
        extractedFromRawResidual,
        extractedFromFiltered
      )
    };
  }

  private extractFromRawResidual(rawContent: string): XmlToolCall[] {
    if (!(this.options.knownTools && rawContent)) {
      return [];
    }

    const maxResidualBytes = this.options.maxResidualBytes ?? DEFAULT_MAX_RESIDUAL_BYTES;
    const newResidualSize = this._rawResidual.length + this._filteredResidual.length + rawContent.length;
    if (maxResidualBytes > 0 && newResidualSize > maxResidualBytes) {
      this.warn(`Residual buffer would exceed maxResidualBytes (${maxResidualBytes}), skipping raw content append`, {
        currentSize: this._rawResidual.length + this._filteredResidual.length,
        incomingBytes: rawContent.length
      });
      return [];
    }

    this._rawResidual += rawContent;
    const extracted: XmlToolCall[] = [];
    const completeTagRe = /<([A-Za-z0-9_:-]+)(?:\s[^>]*)?>([\s\S]*?)<\/\1\s*>/gu;
    let mm = completeTagRe.exec(this._rawResidual);
    while (mm !== null) {
      const full = mm[0];
      try {
        extracted.push(...extractXmlToolCalls(full, this.options.knownTools));
      } catch {
        break;
      }
      this._rawResidual = this._rawResidual.replace(full, '');
      completeTagRe.lastIndex = 0;
      mm = completeTagRe.exec(this._rawResidual);
    }

    return extracted;
  }

  private appendFilteredResidualContent(content: string): string {
    if (!(this.xmlFilter && content)) {
      return content;
    }

    const delta = this.xmlFilter.write(content);
    let result = delta;
    const maxResidualBytes = this.options.maxResidualBytes ?? DEFAULT_MAX_RESIDUAL_BYTES;
    const newResidualSize = this._rawResidual.length + this._filteredResidual.length + delta.length;
    if (maxResidualBytes > 0 && newResidualSize > maxResidualBytes) {
      this.warn(`Residual buffer would exceed maxResidualBytes (${maxResidualBytes}), skipping filtered delta append`, {
        currentSize: this._rawResidual.length + this._filteredResidual.length,
        incomingBytes: delta.length
      });
      return result;
    }

    this._filteredResidual += delta;
    const completeTagRe = /<([A-Za-z0-9_:-]+)(?:\s[^>]*)?>([\s\S]*?)<\/\1\s*>/gu;
    let m = completeTagRe.exec(this._filteredResidual);
    while (m !== null) {
      const full = m[0];
      try {
        this._filteredResidual = this._filteredResidual.replace(full, '');
        result += full;
        completeTagRe.lastIndex = 0;
        m = completeTagRe.exec(this._filteredResidual);
      } catch {
        break;
      }
    }
    return result;
  }

  private mergeUniqueToolCalls(...groups: XmlToolCall[][]): XmlToolCall[] {
    const seen = new Set<string>();
    const merged: XmlToolCall[] = [];
    for (const group of groups) {
      for (const call of group) {
        const key = `${call.name}|${JSON.stringify(call.parameters)}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        merged.push(call);
      }
    }
    return merged;
  }

  private buildToolCallDeltaParts(
    nativeToolCallDeltas: NativeToolCallDelta[]
  ): Extract<OutputPart, { type: 'tool_call_delta' }>[] {
    const toolCallDeltas: Extract<OutputPart, { type: 'tool_call_delta' }>[] = [];
    if (!this.nativeAccumulator || nativeToolCallDeltas.length === 0) {
      return toolCallDeltas;
    }

    for (const delta of nativeToolCallDeltas) {
      if (typeof delta.argumentsDelta !== 'string') {
        continue;
      }
      const pending = this.nativeAccumulator.getPendingCallInfo(delta.index);
      const name = delta.name ?? pending?.name;
      if (!name) {
        continue;
      }
      const id = delta.id ?? pending?.id;
      toolCallDeltas.push({
        argumentsDelta: delta.argumentsDelta,
        index: delta.index,
        name,
        type: 'tool_call_delta',
        ...(id === undefined ? {} : { id })
      });
    }

    return toolCallDeltas;
  }

  private collectMidStreamCompletedToolCalls(): Extract<OutputPart, { type: 'tool_call' }>[] {
    const midStreamCalls: Extract<OutputPart, { type: 'tool_call' }>[] = [];
    if (!this.nativeAccumulator) {
      return midStreamCalls;
    }

    for (const { index, call } of this.nativeAccumulator.getCompletedCallsWithIndices()) {
      if (this._midStreamEmittedCallIndices.has(index)) {
        continue;
      }

      this._midStreamEmittedCallIndices.add(index);
      this.nativeAccumulator.removeCall(index);
      midStreamCalls.push(...this.mapAccumulatedNativeCallsWithIndices([{ call, index }], 'input-complete'));
    }

    return midStreamCalls;
  }

  private composeToolCallParts(
    pendingToolCallParts: Extract<OutputPart, { type: 'tool_call' }>[],
    midStreamCalls: Extract<OutputPart, { type: 'tool_call' }>[],
    accumulatedNativeCalls: Extract<OutputPart, { type: 'tool_call' }>[],
    completedToolCalls: XmlToolCall[]
  ): Extract<OutputPart, { type: 'tool_call' }>[] {
    const completeParts = completedToolCalls
      .filter(
        call =>
          !(midStreamCalls.some(part => part.call === call) || accumulatedNativeCalls.some(part => part.call === call))
      )
      .map(call => ({
        call,
        state: 'input-complete' as const,
        type: 'tool_call' as const
      }));

    return [...pendingToolCallParts, ...midStreamCalls, ...accumulatedNativeCalls, ...completeParts];
  }

  /**
   * Convenience method for non-streaming responses. Processes the response as a
   * complete chunk and immediately flushes, combining both outputs into one.
   */
  public processComplete(response: StreamChunk): ProcessedOutput {
    const out = this.process({ ...response, done: true });
    const flushed = this.flush();

    return this.buildOutput({
      content: out.content + flushed.content,
      done: true,
      thinking: out.thinking + flushed.thinking,
      toolCalls: [...out.toolCalls, ...flushed.toolCalls],
      ...(out.stepIndex === undefined ? {} : { stepIndex: out.stepIndex }),
      ...(out.stepUsage === undefined ? {} : { stepUsage: out.stepUsage }),
      ...this.usagePayload
    });
  }

  private _flushThinkingContent(): {
    thinking: string;
    content: string;
    incomplete: boolean;
  } {
    const incomplete = this.thinkingParser?.isIncomplete() ?? false;
    if (!this.thinkingParser) {
      return { content: '', incomplete, thinking: '' };
    }
    const [thinkingDelta, contentDelta] = this.thinkingParser.flush();
    const content = this.xmlFilter && contentDelta ? this.xmlFilter.write(contentDelta) : contentDelta;
    return { content, incomplete, thinking: thinkingDelta };
  }

  /**
   * Flushes any buffered state (thinking parser, XML filter, native tool call
   * accumulator) and returns a final `ProcessedOutput` with `done: true`.
   * Always call `flush()` after the last chunk to ensure partial buffers are drained.
   * Returns `incomplete: true` if the stream appeared to end prematurely.
   */
  public flush(): ProcessedOutput {
    const { thinking, content: thinkingContent, incomplete: thinkingParserIncomplete } = this._flushThinkingContent();
    let content = thinkingContent;

    if (this.xmlFilter) {
      content += this.xmlFilter.end();
    }

    // Flush any remaining accumulated native tool calls that arrived before the done signal.
    const accumulatedNativeCalls = this.nativeAccumulator
      ? this.mapAccumulatedNativeCallsWithIndices(this.nativeAccumulator.flushWithIndices(), 'input-complete')
      : [];

    const toolCalls = this.enforceToolCallLimits(accumulatedNativeCalls.map(part => part.call));

    const incompleteness = this.detectIncompleteness(thinking, content, toolCalls);

    const output = this.buildOutput({
      content,
      done: true,
      thinking,
      toolCallParts: accumulatedNativeCalls,
      toolCalls,
      ...(this._lastFinishReason === undefined ? {} : { finishReason: this._lastFinishReason }),
      ...this.usagePayload
    });

    // Add incompleteness for thinking tags if detected before flush
    if (thinkingParserIncomplete) {
      incompleteness.push({
        reason: 'Unclosed thinking tag',
        type: 'thinking'
      });
    }
    output.incomplete = incompleteness.length > 0;
    output.incompleteness = incompleteness;

    this.recordOutput(output);
    this.emitOutput(output);
    this._partsController?.close();
    this._partsController = null;
    return output;
  }

  /** Returns all thinking text accumulated so far across every processed chunk. */
  public get accumulatedThinking(): string {
    return this._accumulatedThinking;
  }

  /** Returns the complete accumulated message (thinking, content, tool calls, usage) as a snapshot. */
  public get accumulatedMessage(): AccumulatedMessage {
    const msg: AccumulatedMessage = {
      content: this._accumulatedContent,
      thinking: this._accumulatedThinking,
      toolCalls: [...this._accumulatedToolCalls]
    };
    if (this._accumulatedUsage != null) {
      msg.usage = this._accumulatedUsage;
    }
    return msg;
  }

  /** Returns current processing statistics including buffer usage and performance metrics. */
  public getStats(): ProcessorStats {
    return { ...this._stats };
  }

  /**
   * Resets the processor to its initial state so it can be reused for a new conversation.
   * Must be called between conversations when reusing an instance.
   */
  public reset(): void {
    this.thinkingParser = this.createThinkingParser();
    this.xmlFilter = this.createXmlFilter();
    this.nativeAccumulator?.reset();
    for (const parser of this.toolCallParsers) {
      parser.reset?.();
    }
    this._accumulatedThinking = '';
    this._accumulatedContent = '';
    this._accumulatedToolCalls = [];
    this._accumulatedUsage = undefined;
    this._lastFinishReason = undefined;
    this.doneEmitted = false;
    this._warningCount = 0;
    this._stats = createEmptyStats();
    this._midStreamEmittedCallIndices.clear();
    this._conversationMessageId = null;
    this._conversationMessageCounter = 0;
    this._lastConversationStepIndex = undefined;
    this._lastConversationStepUsage = undefined;
    this._syntheticToolCallCounter = 0;
    this._conversationToolCallsByKey.clear();
    this._seenConversationToolCallIds.clear();
    this.conversationDoneEmitted = false;
    this._partsController?.close();
    this._partsController = null;
    this._partsSource = new ReadableStream<OutputPart>({
      start: controller => {
        this._partsController = controller;
      }
    });
  }

  private createThinkingParser(): ThinkingParser | null {
    if (!this.options.parseThinkTags) {
      return null;
    }

    const parserOptions: { openingTag?: string; closingTag?: string } = {};
    if (this.options.thinkingOpenTag !== undefined) {
      parserOptions.openingTag = this.options.thinkingOpenTag;
    }
    if (this.options.thinkingCloseTag !== undefined) {
      parserOptions.closingTag = this.options.thinkingCloseTag;
    }

    if (parserOptions.openingTag !== undefined || parserOptions.closingTag !== undefined) {
      return new ThinkingParser(parserOptions);
    }

    if (this.options.modelId !== undefined) {
      return ThinkingParser.forModel(this.options.modelId, this.options.thinkingTagMap);
    }

    return new ThinkingParser();
  }

  private createXmlFilter(): XmlStreamFilter | null {
    if (!this.options.scrubContextTags) {
      return null;
    }

    const filterOptions: {
      extraScrubTags?: Set<string>;
      overrideScrubTags?: Set<string>;
      enforcePrivacyTags?: boolean;
      maxXmlNestingDepth?: number;
      onWarning?: (message: string, context?: Record<string, unknown>) => void;
    } = {};
    if (this.options.enforcePrivacyTags !== undefined) {
      filterOptions.enforcePrivacyTags = this.options.enforcePrivacyTags;
    }
    if (this.options.onWarning !== undefined) {
      filterOptions.onWarning = this.options.onWarning;
    }
    if (this.options.maxXmlNestingDepth !== undefined) {
      filterOptions.maxXmlNestingDepth = this.options.maxXmlNestingDepth;
    }
    if (this.options.extraScrubTags !== undefined) {
      filterOptions.extraScrubTags = this.options.extraScrubTags;
    }
    if (this.options.overrideScrubTags !== undefined) {
      filterOptions.overrideScrubTags = this.options.overrideScrubTags;
    }

    return createXmlStreamFilter(filterOptions);
  }

  /** Subscribes to a stream event. Returns `this` for chaining. */
  public on<K extends keyof StreamEventMap>(event: K, listener: StreamEventMap[K]): this {
    // Security: `this.listeners` is a Map, not a plain object. Maps don't
    // have prototype chains, so dynamic key access is safe from prototype pollution.
    const listenerSet = this.listeners[event];
    if (listenerSet === undefined) {
      return this;
    }
    listenerSet.add(listener);
    return this;
  }

  /** Unsubscribes a previously registered event listener. Returns `this` for chaining. */
  public off<K extends keyof StreamEventMap>(event: K, listener: StreamEventMap[K]): this {
    // Security: `this.listeners` is a Map, not a plain object. Maps don't
    // have prototype chains, so dynamic key access is safe from prototype pollution.
    const listenerSet = this.listeners[event];
    if (listenerSet === undefined) {
      return this;
    }
    listenerSet.delete(listener);
    return this;
  }

  private buildOutput(params: {
    thinking: string;
    content: string;
    toolCalls: XmlToolCall[];
    toolCallParts?: Extract<OutputPart, { type: 'tool_call' }>[];
    toolCallDeltas?: Extract<OutputPart, { type: 'tool_call_delta' }>[];
    done: boolean;
    stepIndex?: number;
    stepUsage?: UsageInfo;
    usage?: UsageInfo;
    finishReason?: FinishReason;
  }): ProcessedOutput {
    const parts: OutputPart[] = [];

    if (params.toolCallDeltas && params.toolCallDeltas.length > 0) {
      for (const delta of params.toolCallDeltas) {
        parts.push(delta);
      }
    }

    if (params.thinking) {
      parts.push({ text: params.thinking, type: 'thinking' });
    }

    if (params.content) {
      parts.push({ text: params.content, type: 'text' });
    }

    if (params.toolCallParts && params.toolCallParts.length > 0) {
      parts.push(...params.toolCallParts);
    } else {
      for (const call of params.toolCalls) {
        parts.push({ call, state: 'input-complete', type: 'tool_call' });
      }
    }

    const result: ProcessedOutput = {
      content: params.content,
      done: params.done,
      incomplete: false,
      incompleteness: [],
      parts,
      thinking: params.thinking,
      toolCalls: params.toolCalls
    };
    if (params.usage !== undefined) {
      result.usage = params.usage;
    }
    if (params.stepIndex !== undefined) {
      result.stepIndex = params.stepIndex;
    }
    if (params.stepUsage !== undefined) {
      result.stepUsage = params.stepUsage;
    }
    if (params.finishReason !== undefined) {
      result.finishReason = params.finishReason;
    }
    return result;
  }

  private detectIncompleteness(_thinking: string, _content: string, toolCalls: XmlToolCall[]): IncompletenessDetail[] {
    return detectIncompleteness(this._accumulatedContent, toolCalls);
  }

  private recordOutput(output: ProcessedOutput): void {
    if (output.thinking) {
      this._accumulatedThinking += output.thinking;
    }
    if (output.content) {
      this._accumulatedContent += output.content;
    }
    if (output.toolCalls.length > 0) {
      this._accumulatedToolCalls.push(...output.toolCalls);
    }
  }

  private emitOutput(output: ProcessedOutput): void {
    this.emitConversationLifecycle(output);
    this.emitParts(output.parts);
    if (output.thinking) {
      this.emitThinking(output.thinking);
    }
    if (output.content) {
      this.emitText(output.content);
    }
    this.emitDoneIfNeeded(output.done);
  }

  private emitParts(parts: OutputPart[]): void {
    for (const part of parts) {
      if (part.type === 'tool_call_delta') {
        for (const listener of this.listeners.tool_call_delta) {
          listener(part);
        }
        this.emitConversationToolCallDelta(part);
      }
      if (part.type === 'tool_call') {
        this.emitToolCallPart(part);
      }
      this._partsController?.enqueue(part);
    }
  }

  private emitToolCallPart(part: Extract<OutputPart, { type: 'tool_call' }>): void {
    for (const listener of this.listeners.tool_call_part) {
      listener(part);
    }
    if (part.state === 'input-complete' || part.state === 'output-available' || part.state === 'output-error') {
      for (const listener of this.listeners.tool_call) {
        listener(part.call);
      }
    }
    this.emitConversationToolCallPart(part);
  }

  private emitThinking(thinking: string): void {
    for (const listener of this.listeners.thinking) {
      listener(thinking);
    }
  }

  private emitText(content: string): void {
    for (const listener of this.listeners.text) {
      listener(content);
    }
  }

  private emitDoneIfNeeded(done: boolean): void {
    if (done && !this.doneEmitted) {
      this.doneEmitted = true;
      for (const listener of this.listeners.done) {
        listener();
      }
    }
  }

  private accumulateUsage(chunk: StreamChunk): void {
    if (chunk.usage === undefined) {
      return;
    }
    this._accumulatedUsage = { ...this._accumulatedUsage, ...chunk.usage };
    for (const listener of this.listeners.usage) {
      listener(this._accumulatedUsage);
    }
  }

  private accumulateNativeDeltas(nativeToolCallDeltas: NativeToolCallDelta[]): void {
    if (!this.nativeAccumulator || nativeToolCallDeltas.length === 0) {
      return;
    }
    const maxArgumentBytes = this.options.maxToolArgumentBytes ?? DEFAULT_MAX_TOOL_ARGUMENT_BYTES;
    for (const delta of nativeToolCallDeltas) {
      if (
        maxArgumentBytes > 0 &&
        typeof delta.argumentsDelta === 'string' &&
        delta.argumentsDelta.length > maxArgumentBytes
      ) {
        this.warn('Native tool call argumentsDelta exceeded maxToolArgumentBytes; truncating before accumulation.', {
          maxToolArgumentBytes: maxArgumentBytes
        });
        this.nativeAccumulator.addDelta({
          ...delta,
          argumentsDelta: delta.argumentsDelta.slice(0, maxArgumentBytes)
        });
      } else {
        this.nativeAccumulator.addDelta(delta);
      }
    }
  }

  private mapAccumulatedNativeCallsWithIndices(
    calls: { index: number; call: NativeToolCall }[],
    state: ToolCallState
  ): Extract<OutputPart, { type: 'tool_call' }>[] {
    return calls.map(({ index, call }) => {
      const mapped: XmlToolCall = {
        format: 'native-json' as const,
        name: call.name,
        parameters: call.arguments
      };
      mapped.id = call.id ?? `native_${index}`;
      return { call: mapped, state, type: 'tool_call' };
    });
  }

  private buildPendingNativeToolCallParts(
    nativeToolCallDeltas: NativeToolCallDelta[]
  ): Extract<OutputPart, { type: 'tool_call' }>[] {
    if (nativeToolCallDeltas.length === 0 || !this.nativeAccumulator) {
      return [];
    }

    const seen = new Set<number>();
    const parts: Extract<OutputPart, { type: 'tool_call' }>[] = [];
    for (const delta of nativeToolCallDeltas) {
      if (seen.has(delta.index)) {
        continue;
      }
      seen.add(delta.index);

      const pending = this.nativeAccumulator.getPendingCallInfo(delta.index);
      const state = this.nativeAccumulator.getPendingToolCallState(delta.index);
      const name = pending?.name ?? delta.name;
      if (name === undefined || state === undefined || state === 'input-complete') {
        continue;
      }

      const call: XmlToolCall = {
        format: 'native-json',
        name,
        parameters: {}
      };
      const id = pending?.id ?? delta.id ?? `native_${delta.index}`;
      call.id = id;
      parts.push({ call, state, type: 'tool_call' });
    }

    return parts;
  }

  private parseInlineToolCalls(
    content: string,
    done: boolean
  ): { content: string; nativeToolCallDeltas?: NativeToolCallDelta[] } {
    if (this.toolCallParsers.length === 0 || content.length === 0) {
      return { content };
    }

    let currentContent = content;
    const nativeToolCallDeltas: NativeToolCallDelta[] = [];

    for (const parser of this.toolCallParsers) {
      try {
        const parsed = parser.parse(currentContent, { done });
        currentContent = parsed.content;
        if (Array.isArray(parsed.nativeToolCallDeltas) && parsed.nativeToolCallDeltas.length > 0) {
          nativeToolCallDeltas.push(...parsed.nativeToolCallDeltas);
        }
      } catch {
        // Non-fatal parser errors must not interrupt stream processing.
      }
    }

    return {
      content: currentContent,
      ...(nativeToolCallDeltas.length > 0 ? { nativeToolCallDeltas } : {})
    };
  }

  private emitConversationEvent(event: ConversationEvent): void {
    for (const listener of this.listeners.conversation_event) {
      listener(event);
    }
  }

  private ensureConversationMessageId(): string {
    if (this._conversationMessageId === null) {
      this._conversationMessageCounter += 1;
      this._conversationMessageId = `msg_${this._conversationMessageCounter}`;
      this.emitConversationEvent({
        messageId: this._conversationMessageId,
        role: 'assistant',
        type: 'message_started'
      });
    }
    return this._conversationMessageId;
  }

  private allocateSyntheticToolCallId(name: string): string {
    this._syntheticToolCallCounter += 1;
    return `${name}_${this._syntheticToolCallCounter}`;
  }

  private resolveConversationToolCallIdFromDelta(part: Extract<OutputPart, { type: 'tool_call_delta' }>): string {
    if (part.id !== undefined) {
      return part.id;
    }

    const fallbackKey = `native-index:${part.index}`;
    const existing = this._conversationToolCallsByKey.get(fallbackKey);
    if (existing !== undefined) {
      return existing;
    }

    const syntheticId = `native_${part.index}`;
    this._conversationToolCallsByKey.set(fallbackKey, syntheticId);
    return syntheticId;
  }

  private resolveConversationToolCallIdFromPart(part: Extract<OutputPart, { type: 'tool_call' }>): string {
    if (part.call.id !== undefined) {
      return part.call.id;
    }

    const existing = this._conversationToolCallObjectIds.get(part.call);
    if (existing !== undefined) {
      return existing;
    }

    const syntheticId = this.allocateSyntheticToolCallId(part.call.name);
    this._conversationToolCallObjectIds.set(part.call, syntheticId);
    return syntheticId;
  }

  private emitConversationLifecycle(output: ProcessedOutput): void {
    this.handleConversationStepLifecycle(output);

    if (this.shouldEnsureConversationMessage(output)) {
      this.ensureConversationMessageId();
    }

    if (output.thinking) {
      this.emitConversationEvent({
        messageId: this.ensureConversationMessageId(),
        text: output.thinking,
        type: 'thinking_part_added'
      });
    }

    if (output.content) {
      this.emitConversationEvent({
        messageId: this.ensureConversationMessageId(),
        text: output.content,
        type: 'text_part_added'
      });
    }

    this.handleConversationDone(output);
  }

  private handleConversationStepLifecycle(output: ProcessedOutput): void {
    if (output.stepIndex !== undefined && output.stepIndex !== this._lastConversationStepIndex) {
      if (this._lastConversationStepIndex !== undefined) {
        this.emitConversationEvent({
          stepIndex: this._lastConversationStepIndex,
          type: 'step_finished',
          ...(this._conversationMessageId === null ? {} : { messageId: this._conversationMessageId }),
          ...(this._lastConversationStepUsage === undefined ? {} : { usage: this._lastConversationStepUsage })
        });
      }
      this._lastConversationStepIndex = output.stepIndex;
      this.emitConversationEvent({
        messageId: this.ensureConversationMessageId(),
        stepIndex: output.stepIndex,
        type: 'step_started',
        ...(output.stepUsage === undefined ? {} : { usage: output.stepUsage })
      });
      this._lastConversationStepUsage = output.stepUsage;
    } else if (output.stepUsage !== undefined) {
      this._lastConversationStepUsage = output.stepUsage;
    }
  }

  private shouldEnsureConversationMessage(output: ProcessedOutput): boolean {
    const hasConversationPayload =
      output.thinking.length > 0 ||
      output.content.length > 0 ||
      output.parts.some(part => part.type === 'tool_call' || part.type === 'tool_call_delta');

    return hasConversationPayload && this._conversationMessageId === null;
  }

  private handleConversationDone(output: ProcessedOutput): void {
    if (output.done && !this.conversationDoneEmitted && this._conversationMessageId !== null) {
      this.conversationDoneEmitted = true;
      this.emitConversationEvent({
        messageId: this._conversationMessageId,
        type: 'message_finished',
        ...(output.finishReason === undefined ? {} : { finishReason: output.finishReason }),
        ...(output.usage === undefined ? {} : { usage: output.usage })
      });
      if (this._lastConversationStepIndex !== undefined) {
        this.emitConversationEvent({
          messageId: this._conversationMessageId,
          stepIndex: this._lastConversationStepIndex,
          type: 'step_finished',
          ...(this._lastConversationStepUsage === undefined ? {} : { usage: this._lastConversationStepUsage })
        });
      }
      this._conversationMessageId = null;
      this._lastConversationStepIndex = undefined;
      this._lastConversationStepUsage = undefined;
      this._conversationToolCallsByKey.clear();
      this._seenConversationToolCallIds.clear();
    }
  }

  private emitConversationToolCallDelta(part: Extract<OutputPart, { type: 'tool_call_delta' }>): void {
    const messageId = this.ensureConversationMessageId();
    const toolCallId = this.resolveConversationToolCallIdFromDelta(part);

    if (!this._seenConversationToolCallIds.has(toolCallId)) {
      this._seenConversationToolCallIds.add(toolCallId);
      this.emitConversationEvent({
        messageId,
        toolCall: {
          id: toolCallId,
          name: part.name,
          parameters: {},
          state: 'input-streaming'
        },
        type: 'tool_call_part_added'
      });
    }

    this.emitConversationEvent({
      argumentsTextDelta: part.argumentsDelta,
      messageId,
      state: 'input-streaming',
      toolCallId,
      type: 'tool_call_updated'
    });
  }

  private emitConversationToolCallPart(part: Extract<OutputPart, { type: 'tool_call' }>): void {
    const messageId = this.ensureConversationMessageId();
    const toolCallId = this.resolveConversationToolCallIdFromPart(part);

    if (!this._seenConversationToolCallIds.has(toolCallId)) {
      this._seenConversationToolCallIds.add(toolCallId);
      this.emitConversationEvent({
        messageId,
        toolCall: {
          id: toolCallId,
          name: part.call.name,
          parameters: part.call.parameters,
          state: part.state,
          ...(part.state === 'input-complete' ? { argumentsText: JSON.stringify(part.call.parameters) } : {})
        },
        type: 'tool_call_part_added'
      });
      return;
    }

    this.emitConversationEvent({
      messageId,
      parameters: part.call.parameters,
      state: part.state,
      toolCallId,
      type: 'tool_call_updated'
    });
  }

  private enforceToolCallLimits(toolCalls: XmlToolCall[]): XmlToolCall[] {
    const maxToolCalls = this.options.maxToolCallsPerMessage ?? DEFAULT_MAX_TOOL_CALLS_PER_MESSAGE;
    const maxToolArgumentBytes = this.options.maxToolArgumentBytes ?? DEFAULT_MAX_TOOL_ARGUMENT_BYTES;

    // Account for tool calls already accumulated from previous process() calls so
    // the per-message cap is enforced across the full stream, not just per-chunk.
    const alreadyAccumulated = this._accumulatedToolCalls.length;

    const limitedCalls = this.limitToolCallCount(toolCalls, maxToolCalls, alreadyAccumulated);

    const keptCalls: XmlToolCall[] = [];
    for (const call of limitedCalls) {
      if (this.filterByArgumentSize(call, maxToolArgumentBytes)) {
        keptCalls.push(call);
      }
    }

    return keptCalls;
  }

  private limitToolCallCount(
    toolCalls: XmlToolCall[],
    maxToolCalls: number,
    alreadyAccumulated: number
  ): XmlToolCall[] {
    if (maxToolCalls <= 0) {
      return toolCalls;
    }

    const remaining = maxToolCalls - alreadyAccumulated;
    if (remaining <= 0) {
      if (toolCalls.length > 0) {
        this.warn('Tool call count exceeded maxToolCallsPerMessage; dropping all new tool calls.', {
          accumulated: alreadyAccumulated,
          maxToolCallsPerMessage: maxToolCalls
        });
      }
      return [];
    }

    if (toolCalls.length > remaining) {
      this.warn('Tool call count exceeded maxToolCallsPerMessage; truncating tool call list.', {
        maxToolCallsPerMessage: maxToolCalls,
        originalCount: toolCalls.length
      });
      return toolCalls.slice(0, remaining);
    }

    return toolCalls;
  }

  private filterByArgumentSize(call: XmlToolCall, maxToolArgumentBytes: number): boolean {
    if (maxToolArgumentBytes <= 0) {
      return true;
    }
    let argsBytes: number;
    try {
      const argsJson = JSON.stringify(call.parameters);
      argsBytes = SHARED_TEXT_ENCODER.encode(argsJson).byteLength;
    } catch {
      this.warn('Tool call arguments could not be serialized; dropping tool call.', {
        toolName: call.name
      });
      return false;
    }
    if (argsBytes > maxToolArgumentBytes) {
      this.warn('Tool call arguments exceeded maxToolArgumentBytes; dropping tool call.', {
        actualBytes: argsBytes,
        maxToolArgumentBytes,
        toolName: call.name
      });
      return false;
    }
    return true;
  }

  private warn(message: string, context?: Record<string, unknown>): void {
    const max = this.options.maxWarnings ?? DEFAULT_MAX_WARNINGS;
    if (max === 0 || this._warningCount >= max) {
      return;
    }
    this._warningCount++;
    this.options.onWarning?.(message, context);
    for (const listener of this.listeners.warning) {
      listener(message, context);
    }
  }
}
