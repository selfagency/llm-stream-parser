import type { StreamChunk } from '@agentsy/shared';

import { estimateChunkSize } from './chunk-utils.js';
import type { ProcessedOutput } from './llm-stream-processor.types.js';
import type { ProcessorStats } from './processor-stats.js';

export function recordChunkStats(stats: ProcessorStats, chunk: StreamChunk, encoder: TextEncoder): void {
  const chunkSize = estimateChunkSize(chunk, encoder);
  stats.chunksProcessed++;
  stats.bytesProcessed += chunkSize;
  stats.firstChunkAt ??= new Date();
  stats.lastChunkAt = new Date();
}

export function getChunkInputFlags(chunk: StreamChunk): {
  hasContentInput: boolean;
  hasThinkingInput: boolean;
} {
  return {
    hasContentInput: typeof chunk.content === 'string' && chunk.content.length > 0,
    hasThinkingInput: typeof chunk.thinking === 'string' && chunk.thinking.length > 0
  };
}

export function updatePostProcessStats(params: {
  stats: ProcessorStats;
  startTime: number;
  hasThinkingInput: boolean;
  hasContentInput: boolean;
  bufferSize: number;
  output: ProcessedOutput;
}): void {
  const { stats, startTime, hasThinkingInput, hasContentInput, bufferSize, output } = params;
  stats.parseTimeMs += performance.now() - startTime;
  if (hasThinkingInput) {
    stats.thinkingBlocksCount++;
  }
  if (hasContentInput) {
    stats.contentDeltasCount++;
  }
  stats.toolCallsCount += output.toolCalls.length;

  stats.currentBufferSize = bufferSize;
  if (bufferSize > stats.peakBufferSize) {
    stats.peakBufferSize = bufferSize;
  }
  if (stats.chunksProcessed > 0) {
    stats.averageChunkSize = stats.bytesProcessed / stats.chunksProcessed;
  }
}
