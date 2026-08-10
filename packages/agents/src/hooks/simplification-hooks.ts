/**
 * Simplification hook — post-implementation pass to counter agent's
 * bias toward writing more code.
 *
 * Inspired by Claude Code Tip 40 ("simplify overcomplicated code"). Runs
 * AFTER the implementer layer, BEFORE the code-reviewer layer. Produces
 * suggestions, not blocks.
 *
 * Only runs when the agent's Atlas manifest includes `task_generate` in
 * aiTasks — this is a generation-specific hook, not a universal one.
 */

import type { AgentExecutionContext, AgentHook } from '../specs/types.js';

// ── Hook ─────────────────────────────────────────────────────────────────

/**
 * Check if this agent should run the simplification pass.
 * Only agents with `task_generate` in their Atlas aiTasks qualify.
 */
function shouldSimplify(context: AgentExecutionContext): boolean {
  const atlas = context.spec.atlas;
  if (!atlas) {
    return false;
  }
  return atlas.aiTasks.includes('task_generate');
}

/**
 * Simplification hook — runs after the implementer layer.
 *
 * Produces a list of simplification suggestions that the code-reviewer
 * layer can act on. Does NOT block — it's advisory.
 */
// biome-ignore lint/suspicious/useAwait: async required by AgentHook interface, may become async in future
export const simplificationHook: AgentHook = async context => {
  if (!shouldSimplify(context)) {
    return;
  }

  // Only run after the implementer layer
  if (context.state.currentLayer !== 'implementer') {
    return;
  }

  // Collect simplification suggestions based on what was done
  const suggestions: SimplificationSuggestion[] = [];

  // Check for common over-engineering patterns in results
  for (const [key, value] of context.results) {
    const strValue = typeof value === 'string' ? value : JSON.stringify(value);

    // Pattern 1: excessive abstraction
    if (strValue.includes('abstract class') && strValue.includes('extends')) {
      suggestions.push({
        file: key,
        pattern: 'excessive-abstraction',
        suggestion:
          'Consider whether the abstract class hierarchy is necessary or if a simpler interface would suffice.'
      });
    }

    // Pattern 2: unused parameters (heuristic — check for params not referenced)
    if (strValue.match(/function\s+\w+\s*\([^)]*\)/) && strValue.length > 500) {
      suggestions.push({
        file: key,
        pattern: 'potential-unused-params',
        suggestion: 'Review function parameters — some may be unused. Remove if not needed.'
      });
    }

    // Pattern 3: overly defensive null checks
    const nullCheckCount = (strValue.match(/\?\./g) ?? []).length;
    if (nullCheckCount > 10) {
      suggestions.push({
        file: key,
        pattern: 'excessive-null-checks',
        suggestion: `${nullCheckCount} optional chaining operators found. Some may be unnecessary if the type system already guarantees non-null.`
      });
    }

    // Pattern 4: code exceeds estimated complexity
    const lineCount = strValue.split('\n').length;
    if (lineCount > 200) {
      suggestions.push({
        file: key,
        pattern: 'excessive-length',
        suggestion: `${lineCount} lines generated. Consider splitting into smaller modules or removing redundant logic.`
      });
    }
  }

  // Store suggestions in context for the code-reviewer layer to pick up
  context.results.set('__simplification_suggestions__', suggestions);
};

export interface SimplificationSuggestion {
  file: string;
  pattern: string;
  suggestion: string;
}

export { shouldSimplify };
