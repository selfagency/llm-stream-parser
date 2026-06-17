import type { NativeToolCallDelta } from '@agentsy/shared';

import type { ToolCallParser, ToolCallParserContext, ToolCallParserResult } from './tool-call-parser.js';

const TOOL_CALL_BEGIN = '<|tool_call_begin|>';
const TOOL_CALL_ARGUMENT_BEGIN = '<|tool_call_argument_begin|>';
const TOOL_CALL_END = '<|tool_call_end|>';

type ParseState = 'idle' | 'reading-name' | 'reading-arguments';

function getTrailingPartialPrefixLength(value: string, token: string): number {
  const max = Math.min(value.length, token.length - 1);
  for (let len = max; len > 0; len--) {
    if (value.endsWith(token.slice(0, len))) {
      return len;
    }
  }
  return 0;
}

function getMaxTrailingPartialPrefixLength(value: string, tokens: string[]): number {
  let maxLen = 0;
  for (const token of tokens) {
    const len = getTrailingPartialPrefixLength(value, token);
    if (len > maxLen) {
      maxLen = len;
    }
  }
  return maxLen;
}

/**
 * Parses Z.ai inline tool-call control tokens from text content.
 *
 * Token format handled:
 * - `<|tool_call_begin|>`
 * - `<|tool_call_argument_begin|>`
 * - `<|tool_call_end|>`
 */
export class ZAiInlineToolCallParser implements ToolCallParser {
  private residual = '';
  private state: ParseState = 'idle';
  private currentIndex = 0;
  private currentName = '';
  private currentArgsSeen = false;
  private headerEmitted = false;

  parse(content: string, _context: ToolCallParserContext): ToolCallParserResult {
    if (content.length === 0 && this.residual.length === 0) {
      return { content };
    }

    let visibleContent = '';
    const deltas: NativeToolCallDelta[] = [];
    const appendVisibleContent = (value: string) => {
      visibleContent += value;
    };

    this.residual += content;

    while (this.residual.length > 0) {
      const shouldContinue = this.processCurrentState(deltas, appendVisibleContent);
      if (!shouldContinue) {
        break;
      }
    }

    return {
      content: visibleContent,
      ...(deltas.length > 0 ? { nativeToolCallDeltas: deltas } : {})
    };
  }

  reset(): void {
    this.residual = '';
    this.state = 'idle';
    this.currentIndex = 0;
    this.currentName = '';
    this.currentArgsSeen = false;
    this.headerEmitted = false;
  }

  private emitHeaderIfNeeded(deltas: NativeToolCallDelta[]): void {
    if (this.headerEmitted) {
      return;
    }
    const trimmedName = this.currentName.trim();
    const safeName = trimmedName.length > 0 ? trimmedName : 'tool_call';
    deltas.push({ index: this.currentIndex, name: safeName });
    this.headerEmitted = true;
  }

  private completeCurrentCall(): void {
    this.state = 'idle';
    this.currentIndex += 1;
    this.currentName = '';
    this.currentArgsSeen = false;
    this.headerEmitted = false;
  }

  private processCurrentState(deltas: NativeToolCallDelta[], appendVisibleContent: (value: string) => void): boolean {
    if (this.state === 'idle') {
      return this.processIdleState(appendVisibleContent);
    }

    if (this.state === 'reading-name') {
      return this.processReadingNameState(deltas);
    }

    return this.processReadingArgumentsState(deltas);
  }

  private processIdleState(appendVisibleContent: (value: string) => void): boolean {
    const beginAt = this.residual.indexOf(TOOL_CALL_BEGIN);
    if (beginAt === -1) {
      const partial = getTrailingPartialPrefixLength(this.residual, TOOL_CALL_BEGIN);
      const keep = partial > 0 ? this.residual.slice(-partial) : '';
      const emit = partial > 0 ? this.residual.slice(0, -partial) : this.residual;
      appendVisibleContent(emit);
      this.residual = keep;
      return false;
    }

    appendVisibleContent(this.residual.slice(0, beginAt));
    this.residual = this.residual.slice(beginAt + TOOL_CALL_BEGIN.length);
    this.state = 'reading-name';
    this.currentName = '';
    this.currentArgsSeen = false;
    this.headerEmitted = false;
    return true;
  }

  private processReadingNameState(deltas: NativeToolCallDelta[]): boolean {
    const argBeginAt = this.residual.indexOf(TOOL_CALL_ARGUMENT_BEGIN);
    const endAt = this.residual.indexOf(TOOL_CALL_END);

    const hasArgBegin = argBeginAt !== -1;
    const hasEnd = endAt !== -1;

    if (!(hasArgBegin || hasEnd)) {
      const partial = getMaxTrailingPartialPrefixLength(this.residual, [TOOL_CALL_ARGUMENT_BEGIN, TOOL_CALL_END]);
      const consume = partial > 0 ? this.residual.slice(0, -partial) : this.residual;
      this.currentName += consume;
      this.residual = partial > 0 ? this.residual.slice(-partial) : '';
      return false;
    }

    const useArgBegin = hasArgBegin && (!hasEnd || argBeginAt <= endAt);

    if (useArgBegin) {
      this.currentName += this.residual.slice(0, argBeginAt);
      this.residual = this.residual.slice(argBeginAt + TOOL_CALL_ARGUMENT_BEGIN.length);
      this.emitHeaderIfNeeded(deltas);
      this.state = 'reading-arguments';
      return true;
    }

    this.currentName += this.residual.slice(0, endAt);
    this.residual = this.residual.slice(endAt + TOOL_CALL_END.length);
    this.emitHeaderIfNeeded(deltas);
    if (!this.currentArgsSeen) {
      deltas.push({ argumentsDelta: '{}', index: this.currentIndex });
    }
    this.completeCurrentCall();
    return true;
  }

  private processReadingArgumentsState(deltas: NativeToolCallDelta[]): boolean {
    const endAt = this.residual.indexOf(TOOL_CALL_END);
    if (endAt === -1) {
      const partial = getTrailingPartialPrefixLength(this.residual, TOOL_CALL_END);
      const emitArgs = partial > 0 ? this.residual.slice(0, -partial) : this.residual;
      if (emitArgs.length > 0) {
        deltas.push({ argumentsDelta: emitArgs, index: this.currentIndex });
        this.currentArgsSeen = true;
      }
      this.residual = partial > 0 ? this.residual.slice(-partial) : '';
      return false;
    }

    const argumentChunk = this.residual.slice(0, endAt);
    if (argumentChunk.length > 0) {
      deltas.push({ argumentsDelta: argumentChunk, index: this.currentIndex });
      this.currentArgsSeen = true;
    } else if (!this.currentArgsSeen) {
      deltas.push({ argumentsDelta: '{}', index: this.currentIndex });
    }
    this.residual = this.residual.slice(endAt + TOOL_CALL_END.length);
    this.completeCurrentCall();
    return true;
  }
}

/** Create a built-in parser for Z.ai inline tool-call token format. */
export function createZAiInlineToolCallParser(): ToolCallParser {
  return new ZAiInlineToolCallParser();
}
