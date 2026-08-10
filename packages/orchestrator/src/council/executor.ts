import { collectFirstOpinions } from './stage1-opinions.js';
import { calculateRankings, collectCrossReviews } from './stage2-review.js';
import { synthesizeFinalAnswer } from './stage3-chairman.js';
import type { CouncilDefinition, CouncilEvent, CouncilResult, FirstOpinion } from './types.js';

export interface CouncilExecutorOptions {
  execute: (opts: {
    model: string;
    provider: string;
    messages: Array<{ role: string; content: string }>;
  }) => Promise<{ text: string; usage: { input: number; output: number } }>;
  onEvent?: (event: CouncilEvent) => void;
}

function calculateTotalUsage(opinions: FirstOpinion[]): { input: number; output: number } {
  return opinions.reduce(
    (acc, o) => ({
      input: acc.input + o.tokenUsage.input,
      output: acc.output + o.tokenUsage.output
    }),
    { input: 0, output: 0 }
  );
}

function emitCouncilStarted(council: CouncilDefinition, options: CouncilExecutorOptions): void {
  options.onEvent?.({
    type: 'council_started',
    councilName: council.name,
    memberCount: council.members.length
  });
}

function emitStage1Started(council: CouncilDefinition, options: CouncilExecutorOptions): void {
  options.onEvent?.({ type: 'stage1_started', memberCount: council.members.length });
}

function emitOpinionComplete(
  options: CouncilExecutorOptions,
  member: CouncilDefinition['members'][number],
  tokenUsage: { input: number; output: number }
): void {
  options.onEvent?.({
    type: 'opinion_complete',
    member,
    tokenUsage
  });
}

function emitStage1Complete(opinionCount: number, options: CouncilExecutorOptions): void {
  options.onEvent?.({ type: 'stage1_complete', opinionCount });
}

function emitStage2Started(reviewCount: number, options: CouncilExecutorOptions): void {
  options.onEvent?.({ type: 'stage2_started', reviewCount });
}

function emitReviewComplete(
  options: CouncilExecutorOptions,
  reviewer: CouncilDefinition['members'][number],
  target: CouncilDefinition['members'][number]
): void {
  options.onEvent?.({
    type: 'review_complete',
    reviewer,
    target
  });
}

function emitStage2Complete(
  rankings: Array<{ member: CouncilDefinition['members'][number]; avgScore: number }>,
  options: CouncilExecutorOptions
): void {
  options.onEvent?.({ type: 'stage2_complete', rankings });
}

function emitStage3Started(council: CouncilDefinition, options: CouncilExecutorOptions): void {
  options.onEvent?.({ type: 'stage3_started', chairman: council.chairman });
}

function emitCouncilComplete(result: CouncilResult, options: CouncilExecutorOptions): void {
  options.onEvent?.({ type: 'council_complete', result });
}

/**
 * Execute a full council deliberation (3 stages)
 */
export async function executeCouncil(
  council: CouncilDefinition,
  query: string,
  options: CouncilExecutorOptions
): Promise<CouncilResult> {
  const start = Date.now();

  emitCouncilStarted(council, options);

  // Stage 1: Collect first opinions
  emitStage1Started(council, options);
  const opinions = await collectFirstOpinions(council, query, options, event => {
    emitOpinionComplete(options, event.member, event.tokenUsage);
  });
  emitStage1Complete(opinions.length, options);

  // Stage 2: Cross-review
  const reviewCount = opinions.length * (opinions.length - 1);
  emitStage2Started(reviewCount, options);
  const reviews = await collectCrossReviews(council, opinions, options, event => {
    emitReviewComplete(options, event.reviewer, event.target);
  });
  const rankings = calculateRankings(reviews);
  emitStage2Complete(rankings, options);

  // Stage 3: Chairman synthesis
  emitStage3Started(council, options);
  const { finalAnswer, dissentingOpinions } = await synthesizeFinalAnswer(council, opinions, reviews, options);
  const result: CouncilResult = {
    finalAnswer,
    opinions,
    reviews,
    rankings,
    dissentingOpinions,
    totalTokenUsage: calculateTotalUsage(opinions),
    totalDurationMs: Date.now() - start,
    chairman: council.chairman
  };
  emitCouncilComplete(result, options);

  return result;
}
