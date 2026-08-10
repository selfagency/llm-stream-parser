/**
 * Skill metadata for cost-aware selection
 */
export interface SkillCost {
  /** Historical average cost */
  averageCost: number;

  /** Current cost estimate */
  cost: number;

  /** Number of times executed */
  executionCount: number;

  /** Last execution timestamp */
  lastExecuted?: Date;
  /** Skill name */
  name: string;
}

/**
 * Track skill execution costs for learning
 * Phase 4: Skill Bindings
 */
export class SkillCostTracker {
  private readonly costs: Map<string, SkillCost> = new Map();

  /**
   * Record skill execution cost
   */
  record(skillName: string, cost: number): void {
    const existing = this.costs.get(skillName);

    if (existing) {
      const newAverage = (existing.averageCost * existing.executionCount + cost) / (existing.executionCount + 1);
      this.costs.set(skillName, {
        ...existing,
        averageCost: newAverage,
        executionCount: existing.executionCount + 1,
        lastExecuted: new Date()
      });
    } else {
      this.costs.set(skillName, {
        name: skillName,
        cost,
        averageCost: cost,
        executionCount: 1,
        lastExecuted: new Date()
      });
    }
  }

  /**
   * Get cost data for a skill
   */
  get(skillName: string): SkillCost | undefined {
    return this.costs.get(skillName);
  }

  /**
   * Get all cost data
   */
  getAll(): Map<string, SkillCost> {
    return new Map(this.costs);
  }

  /**
   * Get estimated cost for a skill
   */
  getEstimatedCost(skillName: string): number {
    const cost = this.costs.get(skillName);
    return cost?.averageCost ?? 0;
  }
}
