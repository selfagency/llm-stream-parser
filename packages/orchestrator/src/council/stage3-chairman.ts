import { calculateRankings } from './stage2-review.js';
import type { CouncilDefinition, CouncilMember, FirstOpinion, ReviewScore } from './types.js';

interface ExecuteModelOptions {
  messages: Array<{ role: string; content: string }>;
  model: string;
  provider: string;
}

/**
 * Identify dissenting opinions (lowest-ranked responses with valid reasoning)
 */
function identifyDissentingOpinions(
  opinions: FirstOpinion[],
  rankings: Array<{ member: CouncilMember; avgScore: number }>
): Array<{ member: CouncilMember; opinion: string }> {
  if (rankings.length < 2) {
    return [];
  }

  const lowest = rankings.at(-1);
  if (!lowest) {
    return [];
  }

  const dissenting = opinions.find(
    o => o.member.model === lowest.member.model && o.member.provider === lowest.member.provider
  );

  return dissenting ? [{ member: dissenting.member, opinion: dissenting.response }] : [];
}

/**
 * Build the synthesis prompt for the chairman
 */
function buildSynthesisPrompt(params: {
  opinions: FirstOpinion[];
  reviews: ReviewScore[];
  rankings: Array<{ member: CouncilMember; avgScore: number }>;
  dissentingOpinions: Array<{ member: CouncilMember; opinion: string }>;
}): string {
  const opinionsSection = params.opinions
    .map((o, i) => `## Opinion ${i + 1} (${o.member.role ?? o.member.model})\n\n${o.response}`)
    .join('\n\n');

  const reviewsSection = params.reviews
    .map(
      r =>
        `- ${r.reviewer.role ?? r.reviewer.model} reviewed ${r.target.role ?? r.target.model}: accuracy=${r.accuracy}/10, insight=${r.insight}/10`
    )
    .join('\n');

  const rankingsSection = params.rankings
    .map((r, i) => `${i + 1}. ${r.member.role ?? r.member.model}: ${r.avgScore.toFixed(1)}/20`)
    .join('\n');

  const dissentSection =
    params.dissentingOpinions.length > 0
      ? `\n## Dissenting Opinions\n\n${params.dissentingOpinions.map(d => `- ${d.member.role ?? d.member.model}: ${d.opinion.slice(0, 500)}...`).join('\n')}`
      : '\nNo dissenting opinions.';

  return `You are the chairman synthesizing multiple expert opinions into a final answer.

## Query
${params.opinions[0]?.response ? 'See opinions below.' : ''}

## Expert Opinions

${opinionsSection}

## Cross-Review Scores

${reviewsSection}

## Rankings

${rankingsSection}
${dissentSection}

## Your Task

As chairman, synthesize these opinions into a comprehensive final answer. Consider:
1. Areas of agreement across experts
2. Notable insights from each perspective
3. The rankings and review scores
4. Any dissenting viewpoints

Provide a well-structured final answer that represents the council's best collective judgment.`;
}

/**
 * Synthesize final answer from chairman
 */
export async function synthesizeFinalAnswer(
  council: CouncilDefinition,
  opinions: FirstOpinion[],
  reviews: ReviewScore[],
  options: {
    execute: (opts: ExecuteModelOptions) => Promise<{ text: string; usage: { input: number; output: number } }>;
  }
): Promise<{ finalAnswer: string; dissentingOpinions: Array<{ member: CouncilMember; opinion: string }> }> {
  const rankings = calculateRankings(reviews);
  const dissentingOpinions = identifyDissentingOpinions(opinions, rankings);

  const synthesisPrompt = buildSynthesisPrompt({
    opinions,
    reviews,
    rankings,
    dissentingOpinions
  });

  const result = await options.execute({
    model: council.chairman.model,
    provider: council.chairman.provider,
    messages: [{ role: 'user', content: synthesisPrompt }]
  });

  return {
    finalAnswer: result.text,
    dissentingOpinions
  };
}
