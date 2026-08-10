import type { LLMStreamProcessor, StreamEventMap } from '@agentsy/core/processor';
import type { ConversationStore } from './store.js';
import { createConversationStore } from './store.js';
import type { ConversationEvent } from './types.js';

export interface ConversationStoreBridge {
  dispose(): void;
  store: ConversationStore;
}

interface BridgeOptions {
  conversationId: string;
}

function addListener<K extends keyof StreamEventMap>(
  processor: LLMStreamProcessor,
  event: K,
  listener: StreamEventMap[K],
  listeners: (() => void)[]
): void {
  processor.on(event, listener);
  listeners.push(() => {
    processor.off(event, listener);
  });
}

export function bindProcessorToConversationStore(processor: LLMStreamProcessor, store: ConversationStore): () => void {
  const removers: (() => void)[] = [];

  addListener(
    processor,
    'conversation_event',
    ((event: ConversationEvent) => {
      store.dispatch(event);
    }) as StreamEventMap['conversation_event'],
    removers
  );

  return () => {
    for (const remove of removers) {
      remove();
    }
  };
}

export function createConversationStoreFromProcessor(
  processor: LLMStreamProcessor,
  options: BridgeOptions
): ConversationStoreBridge {
  const store = createConversationStore(options.conversationId);
  const dispose = bindProcessorToConversationStore(processor, store);

  return {
    dispose,
    store
  };
}
