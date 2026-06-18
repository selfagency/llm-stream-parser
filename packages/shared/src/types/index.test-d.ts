import { assertType, expectTypeOf, test } from 'vitest';

import type {
  FinishReason,
  JsonObject,
  JsonValue,
  NativeToolCallDelta,
  PartialDeep,
  StreamChunk,
  ToolCallState,
  UsageInfo
} from './index.js';

test('UsageInfo shape', () => {
  expectTypeOf<UsageInfo>().toHaveProperty('inputTokens');
  expectTypeOf<UsageInfo>().toHaveProperty('outputTokens');
  expectTypeOf<UsageInfo>().toHaveProperty('totalTokens');
});

test('UsageInfo allows optional properties', () => {
  const partialUsageInfo: UsageInfo = { inputTokens: 10 };
  expectTypeOf(partialUsageInfo).toEqualTypeOf<UsageInfo>();
});

test('NativeToolCallDelta field types', () => {
  expectTypeOf<NativeToolCallDelta['index']>().toBeNumber();
  expectTypeOf<NativeToolCallDelta['id']>().toEqualTypeOf<string | undefined>();
  expectTypeOf<NativeToolCallDelta['name']>().toEqualTypeOf<string | undefined>();
  expectTypeOf<NativeToolCallDelta['argumentsDelta']>().toEqualTypeOf<string | undefined>();
});

test('FinishReason closed union', () => {
  assertType<FinishReason>('stop');
  assertType<FinishReason>('length');
  assertType<FinishReason>('tool-calls');
  assertType<FinishReason>('content-filter');
  assertType<FinishReason>('other');
  assertType<FinishReason>('error');
  // @ts-expect-error 'unknown-reason' is not a valid FinishReason
  assertType<FinishReason>('unknown-reason');
});

test('ToolCallState closed union', () => {
  assertType<ToolCallState>('awaiting-input');
  assertType<ToolCallState>('input-streaming');
  assertType<ToolCallState>('input-complete');
  assertType<ToolCallState>('output-available');
  assertType<ToolCallState>('output-error');
  // @ts-expect-error 'pending' is not a valid ToolCallState
  assertType<ToolCallState>('pending');
});

test('StreamChunk all fields optional', () => {
  const chunk: StreamChunk = { content: 'hello', done: true };
  // Verify all fields are optional by checking the chunk satisfies the interface
  expectTypeOf(chunk).toEqualTypeOf<StreamChunk>();

  expectTypeOf(chunk.content).toEqualTypeOf<string | undefined>();
  expectTypeOf(chunk.thinking).toEqualTypeOf<string | undefined>();
  expectTypeOf(chunk.done).toEqualTypeOf<boolean | undefined>();
  expectTypeOf(chunk.stepIndex).toEqualTypeOf<number | undefined>();
  expectTypeOf(chunk.finishReason).toEqualTypeOf<FinishReason | undefined>();
  expectTypeOf(chunk.usage).toEqualTypeOf<UsageInfo | undefined>();
  expectTypeOf(chunk.stepUsage).toEqualTypeOf<UsageInfo | undefined>();
  expectTypeOf(chunk.nativeToolCallDeltas).toEqualTypeOf<NativeToolCallDelta[] | undefined>();
});

test('StreamChunk.tool_calls element shape', () => {
  type ToolCallEntry = NonNullable<StreamChunk['tool_calls']>[number];
  const _entry = {} as ToolCallEntry;
  expectTypeOf(_entry.function).toEqualTypeOf<{ name?: string | undefined; arguments?: unknown } | undefined>();
});

test('JsonObject and JsonValue exports are available', () => {
  const jsonObject: JsonObject = {
    items: [1, 'two', null],
    label: 'agentsy',
    nested: { enabled: true }
  };

  const jsonValue: JsonValue = jsonObject;

  expectTypeOf(jsonObject).toHaveProperty('items');
  expectTypeOf(jsonValue).toHaveProperty('label');
  expectTypeOf(jsonValue).toHaveProperty('nested');
});

test('PartialDeep supports recursive array partials when requested', () => {
  interface Input {
    items: {
      id: string;
      metadata: {
        count: number;
      };
    }[];
  }

  type PartialInput = PartialDeep<Input, { recurseIntoArrays: true }>;

  const value1: PartialInput = { items: [{ metadata: {} }] };
  const value2: PartialInput = {
    items: [{ id: 'abc', metadata: { count: 1 } }]
  };

  expectTypeOf(value1).toEqualTypeOf<PartialInput>();
  expectTypeOf(value2).toEqualTypeOf<PartialInput>();
});
