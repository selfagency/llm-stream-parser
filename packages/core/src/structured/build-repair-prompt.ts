import type { JsonObject } from '@agentsy/shared';

export interface BuildRepairPromptOptions {
  error: string;
  failedOutput: string;
  originalPrompt?: string;
  schema?: JsonObject;
}

export function buildRepairPrompt(options: BuildRepairPromptOptions): string {
  const sections = [
    'The previous response could not be parsed as valid structured output.',
    'Please return a corrected response as valid JSON only (no markdown fences, no prose).',
    `Parse/validation error:\n${options.error}`,
    `Failed output:\n${options.failedOutput}`
  ];

  if (options.originalPrompt) {
    sections.push(`Original prompt:\n${options.originalPrompt}`);
  }

  if (options.schema) {
    sections.push(`Required JSON Schema:\n${JSON.stringify(options.schema, null, 2)}`);
  }

  return sections.join('\n\n');
}
