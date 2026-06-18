/**
 * RAG index job handler.
 *
 * Called by the TimerScheduler on the configured interval.
 * Indexes unindexed semantic memory items into the vector store.
 *
 * @module
 */

import type { RetrievalService } from '../services/retrieval-service.js';

export interface RagIndexJobPayload {
  scope?: string;
}

/**
 * Run the RAG indexing pass.
 *
 * This function is invoked by the job queue when the scheduled
 * rag-index job fires.  It delegates to RetrievalService.indexNewContent().
 */
export function runRagIndex(
  retrieval: RetrievalService,
  payload: RagIndexJobPayload = {}
): Promise<{ indexed: number; skipped: number }> {
  return retrieval.indexNewContent(payload.scope ?? 'default');
}
