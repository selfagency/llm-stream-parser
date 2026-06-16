/**
 * Event-sourced UI state machine for managing conversation state.
 *
 * Provides immutable conversation state management with reactive listeners.
 * All state transitions are driven by discrete events.
 *
 * @example
 * ```typescript
 * import {
 *   createConversationStore,
 *   applyConversationEvent,
 *   type UIMessage,
 *   type ConversationEvent,
 * } from '@selfagency/llm-stream-parser/ui';
 *
 * // Create store
 * const store = createConversationStore('conv-1');
 *
 * // Subscribe to changes
 * store.subscribe((state) => {
 *   console.log(`Conversation has ${state.messages.length} messages`);
 * });
 *
 * // Dispatch events
 * store.dispatch({ type: 'message_started', role: 'user', messageId: 'msg-1' });
 * store.dispatch({ type: 'text_part_added', messageId: 'msg-1', text: 'Hello' });
 * store.dispatch({ type: 'message_finished', messageId: 'msg-1' });
 * ```
 */

export { applyConversationEvent } from './event-sourcing.js';
export {
  bindProcessorToConversationStore,
  type ConversationStoreBridge,
  createConversationStoreFromProcessor
} from './processor-bridge.js';
export { type ConversationStore, createConversationStore, type StoreListener } from './store.js';
export type {
  ConversationEvent,
  UIConversation,
  UIErrorPart,
  UIMessage,
  UIMessagePart,
  UIStepPart,
  UITextPart,
  UIThinkingPart,
  UIToolCallPart
} from './types.js';
