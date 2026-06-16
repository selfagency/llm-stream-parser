import { LLMStreamProcessor } from '@agentsy/core/processor';
import type { FinishReason, JsonObject } from '@agentsy/shared';
import { describe, expect, it, vi } from 'vitest';

import { applyConversationEvent } from './event-sourcing.js';
import { createConversationStoreFromProcessor } from './processor-bridge.js';
import type { StoreListener } from './store.js';
import { createConversationStore } from './store.js';
import type { ConversationEvent, UIConversation } from './types.js';

// Helper functions for ConversationStore tests
function startMessage(
  store: ReturnType<typeof createConversationStore>,
  role: 'user' | 'assistant',
  messageId: string
): void {
  store.dispatch({ messageId, role, type: 'message_started' });
}

function addTextPart(store: ReturnType<typeof createConversationStore>, messageId: string, text: string): void {
  store.dispatch({ messageId, text, type: 'text_part_added' });
}

function addThinkingPart(store: ReturnType<typeof createConversationStore>, messageId: string, text: string): void {
  store.dispatch({ messageId, text, type: 'thinking_part_added' });
}

function addToolCallPart(
  store: ReturnType<typeof createConversationStore>,
  messageId: string,
  toolCall: { id: string; name: string; parameters: JsonObject }
): void {
  store.dispatch({ messageId, toolCall, type: 'tool_call_part_added' });
}

function finishMessage(
  store: ReturnType<typeof createConversationStore>,
  messageId: string,
  finishReason?: FinishReason,
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number }
): void {
  if (finishReason && usage) {
    store.dispatch({
      finishReason,
      messageId,
      type: 'message_finished',
      usage
    });
  } else if (finishReason) {
    store.dispatch({ finishReason, messageId, type: 'message_finished' });
  } else {
    store.dispatch({ messageId, type: 'message_finished' });
  }
}

describe('UI Event Sourcing', () => {
  describe(applyConversationEvent, () => {
    const initialState: UIConversation = {
      id: 'conv-1',
      lastEventAt: new Date('2025-01-01'),
      messages: [],
      metadata: undefined,
      status: 'idle',
      stepIndex: 0,
      totalTokens: 0,
      totalUsage: {}
    };

    it('should add a new message on message_started event', () => {
      const event: ConversationEvent = {
        messageId: 'msg-1',
        role: 'user',
        type: 'message_started'
      };

      const newState = applyConversationEvent(initialState, event);

      expect(newState.messages).toHaveLength(1);
      expect(newState.messages[0]?.id).toBe('msg-1');
      expect(newState.messages[0]?.role).toBe('user');
      expect(newState.messages[0]?.parts).toHaveLength(0);
    });

    it('should add text part to message on text_part_added event', () => {
      let state = applyConversationEvent(initialState, {
        messageId: 'msg-1',
        role: 'assistant',
        type: 'message_started'
      });

      state = applyConversationEvent(state, {
        messageId: 'msg-1',
        text: 'Hello, world!',
        type: 'text_part_added'
      });

      expect(state.messages[0]?.parts).toHaveLength(1);
      expect(state.messages[0]?.parts?.[0]?.type).toBe('text');
      expect(state.messages[0]?.parts?.[0]?.type === 'text' && state.messages[0]?.parts[0]?.text).toBe('Hello, world!');
    });

    it('should add thinking part to message on thinking_part_added event', () => {
      let state = applyConversationEvent(initialState, {
        messageId: 'msg-1',
        role: 'assistant',
        type: 'message_started'
      });

      state = applyConversationEvent(state, {
        messageId: 'msg-1',
        text: 'Let me think about this...',
        type: 'thinking_part_added'
      });

      expect(state.messages[0]?.parts).toHaveLength(1);
      expect(state.messages[0]?.parts?.[0]?.type).toBe('thinking');
      expect(state.messages[0]?.parts?.[0]?.type === 'thinking' && state.messages[0]?.parts[0]?.text).toBe(
        'Let me think about this...'
      );
    });

    it('should add tool call part to message on tool_call_part_added event', () => {
      let state = applyConversationEvent(initialState, {
        messageId: 'msg-1',
        role: 'assistant',
        type: 'message_started'
      });

      state = applyConversationEvent(state, {
        messageId: 'msg-1',
        toolCall: {
          id: 'call-1',
          name: 'search',
          parameters: { query: 'TypeScript best practices' }
        },
        type: 'tool_call_part_added'
      });

      expect(state.messages[0]?.parts).toHaveLength(1);
      const part = state.messages[0]?.parts?.[0];

      // Type guard to narrow type
      if (part?.type !== 'tool_call') {
        throw new Error('Expected tool_call part');
      }

      expect(part.name).toBe('search');
      expect(part.parameters).toStrictEqual({
        query: 'TypeScript best practices'
      });
      expect(part.state).toBe('input-complete');
    });

    it('should update tool call state and argument text incrementally', () => {
      let state = applyConversationEvent(initialState, {
        messageId: 'msg-1',
        role: 'assistant',
        type: 'message_started'
      });

      state = applyConversationEvent(state, {
        messageId: 'msg-1',
        toolCall: {
          id: 'call-1',
          name: 'search',
          parameters: {},
          state: 'awaiting-input'
        },
        type: 'tool_call_part_added'
      });

      state = applyConversationEvent(state, {
        argumentsTextDelta: '{"q":',
        messageId: 'msg-1',
        state: 'input-streaming',
        toolCallId: 'call-1',
        type: 'tool_call_updated'
      });

      const part = state.messages[0]?.parts?.[0];
      if (part?.type !== 'tool_call') {
        throw new Error('Expected tool_call part');
      }

      expect(part.state).toBe('input-streaming');
      expect(part.argumentsText).toBe('{"q":');
    });

    it('should store tool call results and move state to output-available', () => {
      let state = applyConversationEvent(initialState, {
        messageId: 'msg-1',
        role: 'assistant',
        type: 'message_started'
      });

      state = applyConversationEvent(state, {
        messageId: 'msg-1',
        toolCall: {
          id: 'call-1',
          name: 'search',
          parameters: { q: 'ts' }
        },
        type: 'tool_call_part_added'
      });

      state = applyConversationEvent(state, {
        messageId: 'msg-1',
        result: { ok: true },
        toolCallId: 'call-1',
        type: 'tool_call_result_added'
      });

      const part = state.messages[0]?.parts?.[0];
      if (part?.type !== 'tool_call') {
        throw new Error('Expected tool_call part');
      }

      expect(part.state).toBe('output-available');
      expect(part.result).toStrictEqual({ ok: true });
    });

    it('should set finishReason and usage on message_finished event', () => {
      let state = applyConversationEvent(initialState, {
        messageId: 'msg-1',
        role: 'assistant',
        type: 'message_started'
      });

      state = applyConversationEvent(state, {
        finishReason: 'stop',
        messageId: 'msg-1',
        type: 'message_finished',
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }
      });

      expect(state.messages[0]?.finishReason).toBe('stop');
      expect(state.messages[0]?.usage).toStrictEqual({
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30
      });
      expect(state.totalTokens).toBe(30);
    });

    it('should accumulate totalTokens across multiple messages', () => {
      let state = applyConversationEvent(initialState, {
        messageId: 'msg-1',
        role: 'assistant',
        type: 'message_started'
      });

      state = applyConversationEvent(state, {
        messageId: 'msg-1',
        type: 'message_finished',
        usage: { totalTokens: 30 }
      });

      state = applyConversationEvent(state, {
        messageId: 'msg-2',
        role: 'assistant',
        type: 'message_started'
      });

      state = applyConversationEvent(state, {
        messageId: 'msg-2',
        type: 'message_finished',
        usage: { totalTokens: 20 }
      });

      expect(state.totalTokens).toBe(50);
    });

    it('should update stepIndex on step_updated event', () => {
      const event: ConversationEvent = {
        stepIndex: 3,
        type: 'step_updated'
      };

      const newState = applyConversationEvent(initialState, event);

      expect(newState.stepIndex).toBe(3);
    });

    it('should track status and total usage across step and message lifecycle', () => {
      let state = applyConversationEvent(initialState, {
        messageId: 'msg-1',
        role: 'assistant',
        type: 'message_started'
      });

      state = applyConversationEvent(state, {
        messageId: 'msg-1',
        stepIndex: 1,
        type: 'step_started',
        usage: { inputTokens: 3 }
      });

      state = applyConversationEvent(state, {
        messageId: 'msg-1',
        type: 'message_finished',
        usage: { inputTokens: 3, outputTokens: 7, totalTokens: 10 }
      });

      expect(state.status).toBe('idle');
      expect(state.totalUsage).toStrictEqual({
        inputTokens: 3,
        outputTokens: 7,
        totalTokens: 10
      });
      expect(state.totalTokens).toBe(10);
    });

    it('should reset conversation on conversation_reset event', () => {
      let state = applyConversationEvent(initialState, {
        messageId: 'msg-1',
        role: 'user',
        type: 'message_started'
      });

      state = applyConversationEvent(state, {
        messageId: 'msg-1',
        text: 'Hello',
        type: 'text_part_added'
      });

      expect(state.messages).toHaveLength(1);

      state = applyConversationEvent(state, {
        type: 'conversation_reset'
      });

      expect(state.messages).toHaveLength(0);
      expect(state.stepIndex).toBe(0);
      expect(state.totalTokens).toBe(0);
    });

    it('should never mutate original state', () => {
      const originalState = JSON.stringify(initialState);

      applyConversationEvent(initialState, {
        messageId: 'msg-1',
        role: 'user',
        type: 'message_started'
      });

      expect(JSON.stringify(initialState)).toBe(originalState);
    });

    it('should build complex multi-part message', () => {
      let state = applyConversationEvent(initialState, {
        messageId: 'msg-1',
        role: 'assistant',
        type: 'message_started'
      });

      state = applyConversationEvent(state, {
        messageId: 'msg-1',
        text: 'Processing request...',
        type: 'thinking_part_added'
      });

      state = applyConversationEvent(state, {
        messageId: 'msg-1',
        text: 'I found something relevant.',
        type: 'text_part_added'
      });

      state = applyConversationEvent(state, {
        messageId: 'msg-1',
        toolCall: {
          id: 'call-1',
          name: 'verify',
          parameters: { data: 'test' }
        },
        type: 'tool_call_part_added'
      });

      state = applyConversationEvent(state, {
        finishReason: 'tool-calls',
        messageId: 'msg-1',
        type: 'message_finished',
        usage: { totalTokens: 100 }
      });

      expect(state.messages[0]?.parts).toHaveLength(3);
      expect(state.messages[0]?.finishReason).toBe('tool-calls');
      expect(state.totalTokens).toBe(100);
    });
  });

  describe('ConversationStore', () => {
    it('should initialize with empty state', () => {
      const store = createConversationStore('conv-1');
      const state = store.getState();

      expect(state.id).toBe('conv-1');
      expect(state.messages).toHaveLength(0);
      expect(state.stepIndex).toBe(0);
      expect(state.totalTokens).toBe(0);
    });

    it('should dispatch events and update state', () => {
      const store = createConversationStore('conv-1');

      store.dispatch({
        messageId: 'msg-1',
        role: 'user',
        type: 'message_started'
      });

      const state = store.getState();
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0]?.id).toBe('msg-1');
    });

    it('should notify listeners on dispatch', () => {
      const store = createConversationStore('conv-1');
      // eslint-disable-next-line vitest/prefer-spy-on
      const listener = vi.fn<StoreListener>();

      store.subscribe(listener);

      store.dispatch({
        messageId: 'msg-1',
        role: 'user',
        type: 'message_started'
      });

      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0]).toBeDefined();
      const [calledWithState] = listener.mock.calls[0] ?? [];
      expect(calledWithState?.messages).toHaveLength(1);
      expect(calledWithState?.messages[0]?.id).toBe('msg-1');
    });

    it('should unsubscribe listener', () => {
      const store = createConversationStore('conv-1');
      const listener = vi.fn<() => void>();

      const unsubscribe = store.subscribe(listener);

      store.dispatch({
        messageId: 'msg-1',
        role: 'user',
        type: 'message_started'
      });

      unsubscribe();

      store.dispatch({
        messageId: 'msg-2',
        role: 'assistant',
        type: 'message_started'
      });

      expect(listener).toHaveBeenCalledOnce(); // Still only 1 call
    });

    it('should track event log for audit trail', () => {
      const store = createConversationStore('conv-1');

      const event1: ConversationEvent = {
        messageId: 'msg-1',
        role: 'user',
        type: 'message_started'
      };

      const event2: ConversationEvent = {
        messageId: 'msg-1',
        text: 'Hello',
        type: 'text_part_added'
      };

      store.dispatch(event1);
      store.dispatch(event2);

      const eventLog = store.getEventLog();
      expect(eventLog).toHaveLength(2);
      expect(eventLog[0]).toStrictEqual(event1);
      expect(eventLog[1]).toStrictEqual(event2);
    });

    it('should return shallow copy of state to prevent mutations', () => {
      const store = createConversationStore('conv-1');

      store.dispatch({
        messageId: 'msg-1',
        role: 'user',
        type: 'message_started'
      });

      const state1 = store.getState();
      const state2 = store.getState();

      // Should be different objects
      expect(state1).not.toBe(state2);
      expect(state1.messages).not.toBe(state2.messages);

      // But have same content
      expect(state1).toStrictEqual(state2);
    });

    it('should support multiple subscribers', () => {
      const store = createConversationStore('conv-1');
      const listener1 = vi.fn<() => void>();
      const listener2 = vi.fn<() => void>();

      store.subscribe(listener1);
      store.subscribe(listener2);

      store.dispatch({
        messageId: 'msg-1',
        role: 'user',
        type: 'message_started'
      });

      expect(listener1).toHaveBeenCalledOnce();
      expect(listener2).toHaveBeenCalledOnce();
    });

    it('should handle complex conversation flow', () => {
      const store = createConversationStore('conv-1');

      // User message
      startMessage(store, 'user', 'msg-1');
      addTextPart(store, 'msg-1', 'What is TypeScript?');
      finishMessage(store, 'msg-1');

      // Assistant message with thinking, text, and tool call
      startMessage(store, 'assistant', 'msg-2');
      addThinkingPart(store, 'msg-2', 'The user is asking about TypeScript...');
      addTextPart(store, 'msg-2', 'TypeScript is a typed superset of JavaScript.');
      addToolCallPart(store, 'msg-2', {
        id: 'call-1',
        name: 'search_docs',
        parameters: { query: 'TypeScript documentation' }
      });
      finishMessage(store, 'msg-2', 'tool-calls', {
        inputTokens: 20,
        outputTokens: 50,
        totalTokens: 70
      });

      const state = store.getState();
      expect(state.messages).toHaveLength(2);
      expect(state.messages[1]?.parts).toHaveLength(3); // thinking, text, tool_call
      expect(state.totalTokens).toBe(70);
      expect(state.messages[1]?.finishReason).toBe('tool-calls');
    });

    it('should bridge processor conversation events into the store automatically', () => {
      const processor = new LLMStreamProcessor({
        accumulateNativeToolCalls: true,
        scrubContextTags: false
      });
      const bridge = createConversationStoreFromProcessor(processor, {
        conversationId: 'conv-processor'
      });

      processor.process({ stepIndex: 0, thinking: 'plan' });
      processor.process({ content: 'hello' });
      processor.process({
        nativeToolCallDeltas: [{ id: 'call_1', index: 0, name: 'lookup' }]
      });
      processor.process({
        nativeToolCallDeltas: [{ argumentsDelta: '{"q":"ts"}', index: 0 }]
      });
      processor.process({
        done: true,
        finishReason: 'tool-calls',
        usage: { totalTokens: 12 }
      });

      const state = bridge.store.getState();
      expect(state.messages).toHaveLength(1);
      // eslint-disable-next-line vitest/max-expects
      expect({
        text: state.messages[0]?.parts.some(part => part.type === 'text'),
        thinking: state.messages[0]?.parts.some(part => part.type === 'thinking'),
        toolCall: state.messages[0]?.parts.some(part => part.type === 'tool_call')
      }).toStrictEqual({ text: true, thinking: true, toolCall: true });
      expect(state.messages[0]?.finishReason).toBe('tool-calls');
      expect(state.totalTokens).toBe(12);

      bridge.dispose();
    });
  });
});
