import type { AgentExecutionContext, ExecuteOptions, ExecutionResult } from './types.js';
import type { AgentLayer, AgentSpec } from '../specs/types.js';

/**
 * Execute an agent with the given context and options
 */
export async function executeAgent(
  context: AgentExecutionContext,
  options: ExecuteOptions = {}
): Promise<ExecutionResult> {
  const startTime = performance.now();
  const { agent } = context;

  try {
    // Pre-execution hooks
    await executeAgentHooks('preInit', context);

    // Execute based on execution mode
    const orchestrator = agent.spec.orchestrator ?? 'sequential';

    switch (orchestrator) {
      case 'sequential':
        await executeSequential(context, options);
        break;
      case 'parallel':
        await executeParallel(context, options);
        break;
      case 'sisyphus':
        await executeSisyphus(context, options);
        break;
      default:
        throw new Error(`Unknown orchestrator: ${orchestrator}`);
    }

    // Post-execution hooks
    await executeAgentHooks('postCleanup', context);

    const duration = performance.now() - startTime;

    return {
      duration,
      errors: [],
      success: true,
      stepsCompleted: context.state.completedSteps,
      stepsFailed: context.state.failedSteps,
      tokensUsed: context.tokens.used
    };
  } catch (error) {
    await executeAgentHooks('onError', context);
    const duration = performance.now() - startTime;

    return {
      duration,
      errors: [error instanceof Error ? error : new Error(String(error))],
      success: false,
      stepsCompleted: context.state.completedSteps,
      stepsFailed: context.state.failedSteps,
      tokensUsed: context.tokens.used
    };
  }
}

/**
 * Sequential execution mode (gpt-pilot pattern)
 */
async function executeSequential(context: AgentExecutionContext, options: ExecuteOptions): Promise<void> {
  const steps = await decomposeSteps(context.task, context);

  for (const step of steps) {
    if (!step) continue;

    await executeAgentHooks('preSkill', context);

    const result = await executeStep(step, context, options);
    context.results.set(step.id, result);
    context.state.completedSteps.push(step.id);

    await executeAgentHooks('postSkill', context);
  }
}

/**
 * Parallel execution mode (planner-executor pattern)
 */
async function executeParallel(context: AgentExecutionContext, options: ExecuteOptions): Promise<void> {
  const layers = context.spec.layers ?? [];

  await Promise.all(layers.map((layer: AgentLayer) => executeLayer(layer, context, options)));
}

/**
 * Atomic step execution mode (Sisyphus pattern)
 */
async function executeSisyphus(context: AgentExecutionContext, options: ExecuteOptions): Promise<void> {
  const steps = await decomposeSteps(context.task, context);
  context.state.currentStep = 0;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step) continue;

    context.state.currentStep = i;

    await executeAgentHooks('stepExecute', context);

    const result = await executeStep(step, context, options);
    context.results.set(step.id, result);
    context.state.completedSteps.push(step.id);

    if (step.dependsOn) {
      const dependenciesMet = step.dependsOn.every((depId: string) => context.state.completedSteps.includes(depId));

      if (!dependenciesMet) {
        throw new Error(`Dependencies not met for step: ${step.id}`);
      }
    }

    await executeAgentHooks('stepTransition', context);
  }
}

/**
 * Execute a single step
 */
async function executeStep(
  step: { id: string; goal: string; dependsOn?: string[] },
  context: AgentExecutionContext,
  options: ExecuteOptions
): Promise<unknown> {
  if (options.validate) {
    await validatePreconditions(step, context);
  }

  const result = { success: true, output: step.goal };

  if (options.validate) {
    await validatePostconditions(step, result, context);
  }

  return result;
}

/**
 * Validate step preconditions
 */
async function validatePreconditions(step: { id: string }, context: AgentExecutionContext): Promise<void> {
  // Implementation: validate step dependencies, budget, etc.
}

/**
 * Validate step postconditions
 */
async function validatePostconditions(
  step: { id: string },
  result: unknown,
  context: AgentExecutionContext
): Promise<void> {
  // Implementation: validate step output, etc.
}

/**
 * Execute a layer (for parallel mode)
 */
async function executeLayer(layer: AgentLayer, context: AgentExecutionContext, options: ExecuteOptions): Promise<void> {
  context.state.currentLayer = layer.role;
  await executeAgentHooks('layerTransition', context);

  for (const _skillName of layer.skills) {
    await executeAgentHooks('preSkill', context);
    // Implementation: execute skill
    await executeAgentHooks('postSkill', context);
  }

  context.results.set(layer.role, { completed: true });
}

/**
 * Decompose a task into steps
 */
async function decomposeSteps(
  task: string,
  context: AgentExecutionContext
): Promise<Array<{ id: string; goal: string; dependsOn?: string[] }>> {
  // Implementation: decompose task into atomic steps
  // For now, return a placeholder
  return [
    {
      id: 'step-1',
      goal: 'Analyze goal and detect constraints'
    },
    {
      id: 'step-2',
      goal: 'Decompose goal into atomic steps',
      dependsOn: ['step-1']
    }
  ];
}

/**
 * Execute agent hooks
 */
async function executeAgentHooks(lifecycle: string, context: AgentExecutionContext): Promise<void> {
  const hooks = context.agent.hooks.get(lifecycle) ?? [];
  for (const hook of hooks) {
    await hook(context);
  }
}

export * from './types.js';
export * from './budget.js';
export * from './context.js';
