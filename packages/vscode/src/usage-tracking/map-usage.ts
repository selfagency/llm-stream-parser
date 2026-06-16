import type { UsageInfo } from '@agentsy/shared';

export interface VSCodeUsage {
  completionTokens: number;
  outputBuffer?: number;
  promptTokens: number;
}

/**
 * Maps core usage fields to VS Code-style token usage fields.
 */
export function mapUsageToVSCode(usage: UsageInfo | undefined): VSCodeUsage | undefined {
  if (usage === undefined) {
    return;
  }

  return {
    completionTokens: usage.outputTokens ?? 0,
    promptTokens: usage.inputTokens ?? 0
  };
}
