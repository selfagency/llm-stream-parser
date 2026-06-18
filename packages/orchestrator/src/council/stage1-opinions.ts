import type { CouncilDefinition, FirstOpinion } from './types.js';

interface ExecuteModelOptions {
  messages: Array<{ role: string; content: string }>;
  model: string;
  provider: string;
}

/**
 * Collect first opinions from all council members in parallel
 */
export function collectFirstOpinions(
  council: CouncilDefinition,
  query: string,
  options: {
    execute: (opts: ExecuteModelOptions) => Promise<{ text: string; usage: { input: number; output: number } }>;
  },
  onEvent?: (event: {
    type: string;
    member: CouncilDefinition['members'][number];
    tokenUsage: { input: number; output: number };
  }) => void
): Promise<FirstOpinion[]> {
  const promises = council.members.map(async member => {
    const start = Date.now();
    const response = await options.execute({
      model: member.model,
      provider: member.provider,
      messages: [{ role: 'user', content: query }]
    });

    const opinion: FirstOpinion = {
      member,
      response: response.text,
      tokenUsage: response.usage,
      durationMs: Date.now() - start
    };

    onEvent?.({
      type: 'opinion_complete',
      member,
      tokenUsage: response.usage
    });

    return opinion;
  });

  return Promise.all(promises);
}
