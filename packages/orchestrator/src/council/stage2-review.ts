import type { CouncilDefinition, FirstOpinion, ReviewScore } from './types.js';

interface ExecuteModelOptions {
  messages: Array<{ role: string; content: string }>;
  model: string;
  provider: string;
}

/**
 * Build a review prompt for a reviewer to evaluate anonymized responses
 */
function buildReviewPrompt(
  reviewer: CouncilDefinition['members'][number],
  anonymizedOpinions: Array<{ label: string; content: string }>,
  _targetOpinion: FirstOpinion
): string {
  const responses = anonymizedOpinions
    .map(o => `<response label="${o.label}">\n${o.content}\n</response>`)
    .join('\n\n');

  return `You are a reviewer${reviewer.role ? ` specializing in ${reviewer.role}` : ''}.

Review the following responses to a query. For each response, evaluate:
1. **Accuracy** (1-10): How correct and factual is the response?
2. **Insight** (1-10): How deep and valuable is the analysis?

Provide your scores and reasoning.

${responses}

Format your response as:
Accuracy: <score>/10
Insight: <score>/10
Reasoning: <your detailed reasoning>`;
}

/**
 * Parse a score from review text for a known field.
 */
const SCORE_PATTERNS: Record<string, RegExp> = {
  Correctness: /Correctness:\s*(\d+)\/10/i,
  Clarity: /Clarity:\s*(\d+)\/10/i,
  Relevance: /Relevance:\s*(\d+)\/10/i,
  Thoroughness: /Thoroughness:\s*(\d+)\/10/i,
  Feasibility: /Feasibility:\s*(\d+)\/10/i
};

function parseScore(text: string, field: string): number {
  if (!Object.hasOwn(SCORE_PATTERNS, field)) {
    return 5;
  }
  const pattern = SCORE_PATTERNS[field];
  if (pattern === undefined) {
    return 5;
  }
  const match = text.match(pattern);
  return match ? Number.parseInt(match[1] ?? '5', 10) : 5;
}

/**
 * Extract reasoning from review text
 */
function extractReasoning(text: string): string {
  const match = text.match(/Reasoning:\s*([\s\S]*?)(?:\n\n|$)/);
  return match?.[1]?.trim() ?? text;
}

/**
 * Anonymize opinions for cross-review
 */
function anonymizeOpinions(opinions: FirstOpinion[]): Array<{ label: string; content: string }> {
  return opinions.map((o, i) => ({
    label: `Response ${i + 1}`,
    content: o.response
  }));
}

/**
 * Process a single review for a reviewer-opinion pair
 */
async function processReview(
  reviewer: CouncilDefinition['members'][number],
  opinion: FirstOpinion,
  opinions: FirstOpinion[],
  options: {
    execute: (opts: ExecuteModelOptions) => Promise<{ text: string; usage: { input: number; output: number } }>;
  }
): Promise<ReviewScore> {
  const anonymizedOpinions = anonymizeOpinions(opinions);
  const reviewPrompt = buildReviewPrompt(reviewer, anonymizedOpinions, opinion);
  const review = await options.execute({
    model: reviewer.model,
    provider: reviewer.provider,
    messages: [{ role: 'user', content: reviewPrompt }]
  });

  return {
    reviewer,
    target: opinion.member,
    accuracy: parseScore(review.text, 'accuracy'),
    insight: parseScore(review.text, 'insight'),
    reasoning: extractReasoning(review.text)
  };
}

/**
 * Collect cross-reviews from all council members (anonymized)
 */
export async function collectCrossReviews(
  council: CouncilDefinition,
  opinions: FirstOpinion[],
  options: {
    execute: (opts: ExecuteModelOptions) => Promise<{ text: string; usage: { input: number; output: number } }>;
  },
  onEvent?: (event: {
    type: string;
    reviewer: CouncilDefinition['members'][number];
    target: CouncilDefinition['members'][number];
  }) => void
): Promise<ReviewScore[]> {
  const reviews: ReviewScore[] = [];

  for (const reviewer of council.members) {
    for (const opinion of opinions) {
      if (opinion.member.model === reviewer.model) {
        continue;
      }

      const review = await processReview(reviewer, opinion, opinions, options);
      reviews.push(review);

      onEvent?.({
        type: 'review_complete',
        reviewer,
        target: opinion.member
      });
    }
  }

  return reviews;
}

/**
 * Calculate rankings from review scores
 */
export function calculateRankings(
  reviews: ReviewScore[]
): Array<{ member: CouncilDefinition['members'][number]; avgScore: number }> {
  const scores = new Map<string, { member: CouncilDefinition['members'][number]; total: number; count: number }>();

  for (const review of reviews) {
    const key = `${review.target.provider}:${review.target.model}`;
    const existing = scores.get(key) ?? {
      member: review.target,
      total: 0,
      count: 0
    };
    existing.total += review.accuracy + review.insight;
    existing.count += 1;
    scores.set(key, existing);
  }

  return Array.from(scores.values())
    .map(s => ({ member: s.member, avgScore: s.total / s.count }))
    .sort((a, b) => b.avgScore - a.avgScore);
}
