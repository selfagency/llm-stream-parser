import type {
  CouncilDefinition,
  CouncilResult,
  CouncilEvent,
  FirstOpinion,
} from './types.js';
import { collectFirstOpinions } from './stage1-opinions.js';
import { collectCrossReviews, calculateRankings } from './stage2-review.js';
import { synthesizeFinalAnswer } from './stage3-chairman.js';

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

/**
 * Execute a full council deliberation (3 stages)
 */
export async function executeCouncil(
  council: CouncilDefinition,
  query: string,
  options: CouncilExecutorOptions
): Promise<CouncilResult> {
  const start = Date.now();

  options.onEvent?.({
    type: 'council_started',
    councilName: council.name,
    memberCount: council.members.length
  });

  // Stage 1: Collect first opinions
  options.onEvent?.({ type: 'stage1_started', memberCount: council.members.length });
  const opinions = await collectFirstOpinions(council, query, options, event => {
    options.onEvent?.({
      type: 'opinion_complete',
      member: event.member,
      tokenUsage: event.tokenUsage
    });
  });
  options.onEvent?.({ type: 'stage1_complete', opinionCount: opinions.length });

  // Stage 2: Cross-review
  const reviewCount = opinions.length * (opinions.length - 1);
  options.onEvent?.({ type: 'stage2_started', reviewCount });
  const reviews = await collectCrossReviews(council, opinions, options, event => {
    options.onEvent?.({
      type: 'review_complete',
      reviewer: event.reviewer,
      target: event.target
    });
  });
  const rankings = calculateRankings(reviews);
  options.onEvent?.({ type: 'stage2_complete', rankings });

  // Stage 3: Chairman synthesis
  options.onEvent?.({ type: 'stage3_started', chairman: council.chairman });
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
  options.onEvent?.({ type: 'council_complete', result });

  return result;
}
