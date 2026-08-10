import { applyConversationEvent } from './event-sourcing.js';
import type { ConversationEvent, UIConversation } from './types.js';

/**
 * Listener callback type for store changes.
 */
export type StoreListener = (state: UIConversation) => void;

/**
 * Reactive store for conversation state with event sourcing.
 * State is immutable; listeners are notified on every event.
 */
export interface ConversationStore {
  /** Apply event to store (synchronously updates state, notifies listeners). */
  dispatch(event: ConversationEvent): void;

  /** Get all events applied since store creation (for debugging/audit). */
  getEventLog(): ConversationEvent[];
  /** Get current conversation state. */
  getState(): UIConversation;

  /** Subscribe to state changes. Returns unsubscribe function. */
  subscribe(listener: StoreListener): () => void;
}

/**
 * Create a new conversation store with initial empty state.
 *
 * @param conversationId - Unique identifier for this conversation
 * @returns A ConversationStore instance
 *
 * @example
 * ```typescript
 * const store = createConversationStore('conv-123');
 *
 * // Subscribe to changes
 * const unsubscribe = store.subscribe((state) => {
 *   console.log('New state:', state);
 * });
 *
 * // Dispatch events
 * store.dispatch({
 *   type: 'message_started',
 *   role: 'user',
 *   messageId: 'msg-1',
 * });
 *
 * store.dispatch({
 *   type: 'text_part_added',
 *   messageId: 'msg-1',
 *   text: 'Hello!',
 * });
 *
 * // Unsubscribe when done
 * unsubscribe();
 * ```
 */
export function createConversationStore(conversationId: string): ConversationStore {
  let state: UIConversation = {
    id: conversationId,
    lastEventAt: new Date(),
    messages: [],
    metadata: undefined,
    status: 'idle',
    stepIndex: 0,
    totalTokens: 0,
    totalUsage: {}
  };

  const listeners = new Set<StoreListener>();
  const eventLog: ConversationEvent[] = [];

  function notifyListeners(): void {
    for (const listener of listeners) {
      listener(state);
    }
  }

  return {
    dispatch(event: ConversationEvent): void {
      // Apply event to state
      state = applyConversationEvent(state, event);

      // Log event for audit trail
      eventLog.push(event);

      // Notify all listeners
      notifyListeners();
    },

    getEventLog(): ConversationEvent[] {
      // Return copy of event log
      return [...eventLog];
    },

    getState(): UIConversation {
      // Return a shallow copy to prevent external mutations
      return {
        ...state,
        messages: [...state.messages]
      };
    },

    subscribe(listener: StoreListener): () => void {
      listeners.add(listener);

      // Return unsubscribe function
      return () => {
        listeners.delete(listener);
      };
    }
  };
}
