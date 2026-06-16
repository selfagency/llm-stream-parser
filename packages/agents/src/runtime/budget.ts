import type { AgentExecutionContext } from './types.js';

/**
 * Allocate tokens for a task
 */
export function allocateTokens(context: AgentExecutionContext, amount: number, description: string): void {
  const { tokens } = context;

  if (amount > tokens.remaining) {
    throw new Error(`Insufficient tokens: need ${amount}, have ${tokens.remaining}`);
  }

  tokens.used += amount;
  tokens.remaining -= amount;
  context.agent.budget.allocations.set(description, amount);
}

/**
 * Check if tokens are available
 */
export function checkTokens(context: AgentExecutionContext, amount: number): boolean {
  return context.tokens.remaining >= amount;
}

/**
 * Get token budget summary
 */
export function getTokenSummary(context: AgentExecutionContext): {
  total: number;
  used: number;
  remaining: number;
  allocations: Map<string, number>;
} {
  const { agent, tokens } = context;

  return {
    total: agent.budget.total,
    used: tokens.used,
    remaining: tokens.remaining,
    allocations: new Map(agent.budget.allocations)
  };
}
