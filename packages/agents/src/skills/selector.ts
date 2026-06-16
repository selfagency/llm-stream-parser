import type { AgentExecutionContext } from '../runtime/types.js';
import type { SkillMetadata, TokenBudget } from '../specs/types.js';
import { parseCostRange } from './types.js';

/**
 * Select skills to apply based on budget and task
 */
export function selectSkills(
  context: AgentExecutionContext,
  applicableSkills: SkillMetadata[],
  budget: TokenBudget
): SkillMetadata[] {
  const selected: SkillMetadata[] = [];

  for (const skill of applicableSkills) {
    const [minCost, maxCost] = parseCostRange(skill.cost);
    const averageCost = (minCost + maxCost) / 2;

    if (averageCost > budget.remaining) {
      continue;
    }

    selected.push(skill);
    budget.used += averageCost;
    budget.remaining -= averageCost;
  }

  return selected.sort((a: SkillMetadata, b: SkillMetadata): number => {
    const [aMin] = parseCostRange(a.cost);
    const [bMin] = parseCostRange(b.cost);
    return aMin - bMin;
  });
}

/**
 * Activate a skill in the execution context
 */
export function activateSkill(context: AgentExecutionContext, skill: SkillMetadata): void {
  const { agent, state } = context;
  state.completedSteps.push(skill.name);
  agent.budget.allocations.set(`skill:${skill.name}`, 0);
}

/**
 * Deactivate a skill
 */
export function deactivateSkill(context: AgentExecutionContext, skillName: string): void {
  const { state, agent } = context;

  const index = state.completedSteps.indexOf(skillName);
  if (index !== -1) {
    state.completedSteps.splice(index, 1);
  }

  agent.budget.allocations.delete(`skill:${skillName}`);
}

/**
 * Track cost for a skill during selection
 */
export class SelectionCostTracker {
  private costs = new Map<string, number>();

  addCost(skillName: string, cost: number): void {
    this.costs.set(skillName, (this.costs.get(skillName) ?? 0) + cost);
  }

  getTotalCost(): number {
    let total = 0;
    for (const cost of this.costs.values()) {
      total += cost;
    }
    return total;
  }

  getSkillCost(skillName: string): number {
    return this.costs.get(skillName) ?? 0;
  }

  getAllCosts(): Map<string, number> {
    return new Map(this.costs);
  }
}
