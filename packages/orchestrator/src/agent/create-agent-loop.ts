import { randomUUID } from 'node:crypto';

import { LLMStreamProcessor } from '@agentsy/core/processor';
import type { AgUiEvent, InterruptReason } from '@agentsy/runtime/ag-ui';
import { createInterruptEvent, EventType } from '@agentsy/runtime/ag-ui';

import type {
  AgentLoopContext,
  AgentLoopFinalContext,
  AgentLoopHandle,
  AgentLoopOptions,
  AgentLoopState,
  AgentLoopStepContext,
  AgentLoopStepOverrides,
  AgentLoopToolContext,
  OutputPart,
  ProcessedOutput,
  StepResult,
  ToolApprovalDecision,
  ToolApprovalMode,
  ToolApprovalResult
} from './types.js';
import { mergeCallbacks } from './utils.js';

/**
 * Checks if both values are objects with matching keys.
 * @internal
 */
function objectKeysMatch(aKeys: string[], bKeys: string[]): boolean {
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  return aKeys.every((k, i) => k === bKeys[i]);
}

function getSortedEntries(value: object): [string, unknown][] {
  return Object.entries(value).toSorted(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
}

function assignCallbackIfDefined<K extends keyof AgentLoopOptions>(
  target: AgentLoopOptions,
  key: K,
  callback: AgentLoopOptions[K] | undefined
): void {
  if (callback !== undefined) {
    target[key] = callback;
  }
}

/**
 * Deep equality comparison for tool parameters.
 * Compares objects structurally rather than by reference.
 * @internal
 */
function parametersEqual(a: unknown, b: unknown): boolean {
  // Handle primitives and identity
  if (Object.is(a, b)) {
    return true;
  }

  // Check if both are objects
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }

  // Compare sorted keys
  const aEntries = getSortedEntries(a);
  const bEntries = getSortedEntries(b);
  const aKeys = aEntries.map(([key]) => key);
  const bKeys = bEntries.map(([key]) => key);

  if (!objectKeysMatch(aKeys, bKeys)) {
    return false;
  }

  return aEntries.every(([, aValue], index) => {
    const bEntry = bEntries[index];
    return bEntry !== undefined && parametersEqual(aValue, bEntry[1]);
  });
}

function toolCallsEqual(
  a: { name: string; parameters: unknown; id?: string },
  b: { name: string; parameters: unknown; id?: string }
) {
  const idsMatch = a.id !== undefined && b.id !== undefined ? a.id === b.id : true;
  return a.name === b.name && idsMatch && parametersEqual(a.parameters, b.parameters);
}

function mergeStepCallbacks(base: AgentLoopOptions, overrides: AgentLoopStepOverrides, merged: AgentLoopOptions): void {
  assignCallbackIfDefined(merged, 'beforeStep', mergeCallbacks(base.beforeStep, overrides.beforeStep));
  assignCallbackIfDefined(merged, 'onStep', mergeCallbacks(base.onStep, overrides.onStep));
  assignCallbackIfDefined(merged, 'afterStep', mergeCallbacks(base.afterStep, overrides.afterStep));
}

function mergeToolAndFinalCallbacks(
  base: AgentLoopOptions,
  overrides: AgentLoopStepOverrides,
  merged: AgentLoopOptions
): void {
  const beforeToolCall = mergeCallbacks(base.beforeToolCall, overrides.beforeToolCall);
  const afterToolCall = mergeCallbacks(base.afterToolCall, overrides.afterToolCall);
  const onAbort = mergeCallbacks(base.onAbort, overrides.onAbort);
  const onError = mergeCallbacks(base.onError, overrides.onError);
  const beforeFinal = mergeCallbacks(base.beforeFinal, overrides.beforeFinal);
  const afterFinal = mergeCallbacks(base.afterFinal, overrides.afterFinal);
  assignCallbackIfDefined(merged, 'beforeToolCall', beforeToolCall);
  assignCallbackIfDefined(merged, 'afterToolCall', afterToolCall);
  assignCallbackIfDefined(merged, 'onAbort', onAbort);
  assignCallbackIfDefined(merged, 'onError', onError);
  assignCallbackIfDefined(merged, 'beforeFinal', beforeFinal);
  assignCallbackIfDefined(merged, 'afterFinal', afterFinal);
}

function mergeLifecycleCallbacks(
  base: AgentLoopOptions,
  overrides: AgentLoopStepOverrides,
  merged: AgentLoopOptions
): void {
  mergeStepCallbacks(base, overrides, merged);
  mergeToolAndFinalCallbacks(base, overrides, merged);
}

function resolveBuildToolResultMessages(
  base: AgentLoopOptions,
  overrides: AgentLoopStepOverrides
): AgentLoopOptions['buildToolResultMessages'] {
  return overrides.buildToolResultMessages ?? base.buildToolResultMessages;
}

function resolveApproveToolCalls(
  baseApproveToolCalls: AgentLoopOptions['approveToolCalls'],
  overrideApproveToolCalls: AgentLoopStepOverrides['approveToolCalls']
): AgentLoopOptions['approveToolCalls'] {
  return overrideApproveToolCalls ?? baseApproveToolCalls;
}

function createRunId(): string {
  return `run_${randomUUID()}`;
}

function mapApprovalDecision(
  toolCalls: AgentLoopToolContext['toolCalls'],
  decision: ToolApprovalDecision
): {
  approvedToolCalls: AgentLoopToolContext['toolCalls'];
  deniedToolCalls: AgentLoopToolContext['toolCalls'];
} {
  return decision === 'allow'
    ? { approvedToolCalls: [...toolCalls], deniedToolCalls: [] }
    : { approvedToolCalls: [], deniedToolCalls: [...toolCalls] };
}

function deriveDeniedToolCalls(
  toolCalls: AgentLoopToolContext['toolCalls'],
  approvedToolCalls: AgentLoopToolContext['toolCalls']
): AgentLoopToolContext['toolCalls'] {
  return toolCalls.filter(toolCall => !approvedToolCalls.some(candidate => toolCallsEqual(candidate, toolCall)));
}

function normalizeApprovalResult(
  toolCalls: AgentLoopToolContext['toolCalls'],
  result: ToolApprovalResult,
  fallbackDecision: ToolApprovalDecision
): {
  approvedToolCalls: AgentLoopToolContext['toolCalls'];
  deniedToolCalls: AgentLoopToolContext['toolCalls'];
} {
  if (result.approvedToolCalls) {
    return {
      approvedToolCalls: [...result.approvedToolCalls],
      deniedToolCalls: result.deniedToolCalls
        ? [...result.deniedToolCalls]
        : deriveDeniedToolCalls(toolCalls, result.approvedToolCalls)
    };
  }

  if (result.deniedToolCalls && result.decision !== 'allow') {
    return {
      approvedToolCalls: deriveDeniedToolCalls(toolCalls, result.deniedToolCalls),
      deniedToolCalls: [...result.deniedToolCalls]
    };
  }

  return mapApprovalDecision(toolCalls, result.decision ?? fallbackDecision);
}

async function resolveToolApproval(
  options: AgentLoopOptions,
  toolContext: AgentLoopToolContext
): Promise<{
  approvedToolCalls: AgentLoopToolContext['toolCalls'];
  deniedToolCalls: AgentLoopToolContext['toolCalls'];
}> {
  const mode: ToolApprovalMode = options.toolApprovalMode ?? 'allow';

  if (mode === 'allow') {
    return mapApprovalDecision(toolContext.toolCalls, 'allow');
  }

  if (mode === 'deny') {
    return mapApprovalDecision(toolContext.toolCalls, 'deny');
  }

  if (!options.approveToolCalls) {
    return mode === 'ask'
      ? mapApprovalDecision(toolContext.toolCalls, 'deny')
      : mapApprovalDecision(toolContext.toolCalls, 'allow');
  }

  const result = await options.approveToolCalls({
    ...toolContext,
    mode
  });

  if (typeof result === 'boolean') {
    return mapApprovalDecision(toolContext.toolCalls, result ? 'allow' : 'deny');
  }

  if (result === 'allow' || result === 'deny') {
    return mapApprovalDecision(toolContext.toolCalls, result);
  }

  return normalizeApprovalResult(toolContext.toolCalls, result, mode === 'ask' ? 'deny' : 'allow');
}

function mergeStepOptions(base: AgentLoopOptions, overrides?: AgentLoopStepOverrides): AgentLoopOptions {
  if (!overrides) {
    return base;
  }

  const { approveToolCalls: baseApproveToolCalls, ...baseWithoutApprove } = base;
  const { approveToolCalls: overrideApproveToolCalls, ...overrideWithoutApprove } = overrides;

  const merged = {
    ...baseWithoutApprove,
    ...overrideWithoutApprove,
    buildToolResultMessages: resolveBuildToolResultMessages(base, overrides),
    stopWhen: overrides.stopWhen ?? base.stopWhen
  } as AgentLoopOptions;

  mergeLifecycleCallbacks(base, overrides, merged);

  const resolvedApproveToolCalls = resolveApproveToolCalls(baseApproveToolCalls, overrideApproveToolCalls);
  if (resolvedApproveToolCalls) {
    merged.approveToolCalls = resolvedApproveToolCalls;
  }

  return merged;
}

/**
 * Safely emit an AG-UI event with error handling.
 * @internal
 */
async function safeEmitEvent(
  event: AgUiEvent,
  callbackName: string,
  onAgUiEvent?: (event: AgUiEvent) => void | Promise<void>
): Promise<void> {
  if (!onAgUiEvent) {
    return;
  }
  try {
    await Promise.resolve(onAgUiEvent(event));
  } catch (error) {
    console.error(`Error in onAgUiEvent callback for ${callbackName}:`, error);
  }
}

/**
 * Add optional threadId to an event object.
 * @internal
 */
function withThreadId(event: AgUiEvent, threadId?: string): AgUiEvent {
  if (threadId === undefined) {
    return event;
  }
  return { ...event, threadId } as AgUiEvent;
}

/**
 * Processes a single step of the agent loop and updates state.
 * @internal
 */
// fallow-ignore-next-line complexity
async function processSingleStep(
  state: AgentLoopState,
  options: AgentLoopOptions,
  context: AgentLoopContext,
  currentMessages: unknown[],
  abortController: AbortController,
  stopConditions: ((state: AgentLoopState) => boolean)[]
): Promise<{
  parts: OutputPart[];
  continueLoop: boolean;
  nextMessages?: unknown[];
}> {
  await options.beforeStep?.(context);

  const { processor, parts: streamedParts, isAborted } = await executeStep(options, currentMessages, abortController);

  if (isAborted) {
    return { continueLoop: false, parts: [] };
  }

  const flushedOutput = processor.flush();
  const { accumulatedMessage } = processor;
  const finalOutput: ProcessedOutput = {
    ...flushedOutput,
    content: accumulatedMessage.content,
    parts: [...streamedParts, ...flushedOutput.parts],
    thinking: accumulatedMessage.thinking,
    toolCalls: accumulatedMessage.toolCalls,
    ...(accumulatedMessage.usage === undefined ? {} : { usage: accumulatedMessage.usage })
  };
  const { parts } = finalOutput;

  state.lastOutput = finalOutput;

  // Build step result
  const stepResult: StepResult = {
    finishReason: finalOutput.finishReason ?? undefined,
    output: finalOutput,
    toolCalls: finalOutput.toolCalls,
    usage: finalOutput.usage ?? undefined
  };

  state.steps.push(stepResult);
  state.stepIndex = state.steps.length - 1;
  updateConsecutiveIdenticalCalls(state, stepResult);
  state.toolCallCount += stepResult.toolCalls.length;

  if (options.onStep) {
    await options.onStep(stepResult);
  }

  const stepContext: AgentLoopStepContext = {
    ...context,
    state,
    stepIndex: state.stepIndex,
    stepResult
  };

  await options.afterStep?.(stepContext);

  // Check stop conditions
  if (stopConditions.some(condition => condition(state)) || stepResult.toolCalls.length === 0) {
    return { continueLoop: false, parts };
  }

  // Build next messages with conversation trimming
  const toolContext: AgentLoopToolContext = {
    ...stepContext,
    toolApprovalMode: options.toolApprovalMode ?? 'allow',
    toolCalls: stepResult.toolCalls
  };

  await options.beforeToolCall?.(toolContext);
  const { approvedToolCalls, deniedToolCalls } = await resolveToolApproval(options, toolContext);

  if (approvedToolCalls.length === 0) {
    await options.afterToolCall?.({
      ...toolContext,
      approvedToolCalls,
      deniedToolCalls,
      toolResultMessages: []
    });
    return { continueLoop: false, parts };
  }

  const toolResultMessages = await options.buildToolResultMessages(approvedToolCalls);
  await options.afterToolCall?.({
    ...toolContext,
    approvedToolCalls,
    deniedToolCalls,
    toolCalls: approvedToolCalls,
    toolResultMessages
  });
  const newMessages = [...currentMessages, { content: finalOutput.content, role: 'assistant' }, ...toolResultMessages];

  const nextMessages =
    options.maxConversationMessages && newMessages.length > options.maxConversationMessages
      ? newMessages.slice(newMessages.length - options.maxConversationMessages)
      : newMessages;

  return { continueLoop: true, nextMessages, parts };
}

/**
 * Updates the consecutive identical calls counter for doom-loop detection.
 * Compares the first tool call of the current step with the previous step.
 * @internal
 */
function updateConsecutiveIdenticalCalls(state: AgentLoopState, stepResult: StepResult): void {
  if (state.steps.length >= 2 && stepResult.toolCalls.length > 0) {
    const prevStep = state.steps.at(-2);
    if (prevStep && prevStep.toolCalls.length > 0) {
      const prev = prevStep.toolCalls[0];
      const curr = stepResult.toolCalls[0];
      if (!(prev && curr)) {
        return;
      }
      if (prev.name === curr.name && parametersEqual(prev.parameters, curr.parameters)) {
        state.consecutiveIdenticalCalls += 1;
      } else {
        state.consecutiveIdenticalCalls = 0;
      }
    }
  }
}

/**
 * Processes a single step of the agent loop: executes LLM and flushes output.
 * @internal
 */
async function executeStep(
  options: AgentLoopOptions,
  currentMessages: unknown[],
  abortController: AbortController
): Promise<{
  processor: LLMStreamProcessor;
  parts: OutputPart[];
  isAborted: boolean;
}> {
  const processor = new LLMStreamProcessor();
  const parts: OutputPart[] = [];

  try {
    for await (const chunk of options.execute(currentMessages)) {
      const output = processor.process(chunk);
      parts.push(...output.parts);
    }
  } catch (error) {
    processor.flush();
    throw error;
  }

  return {
    isAborted: abortController.signal.aborted,
    parts,
    processor
  };
}

export function createAgentLoop(options: AgentLoopOptions): AgentLoopHandle {
  let aborted = false;
  const abortController = new AbortController();

  function createContext(
    runId: string,
    threadId: string | undefined,
    stepIndex: number,
    messages: unknown[],
    state: AgentLoopState
  ): AgentLoopContext {
    return {
      messages,
      runId,
      signal: abortController.signal,
      state,
      stepIndex,
      ...(threadId === undefined ? {} : { threadId })
    };
  }

  type LoopIterationResult =
    | { interrupted: true }
    | {
        interrupted: false;
        parts: OutputPart[];
        continueLoop: boolean;
        nextMessages: unknown[] | undefined;
      };

  async function executeLoopIteration(
    runId: string,
    threadId: string | undefined,
    state: AgentLoopState,
    currentMessages: unknown[]
  ): Promise<LoopIterationResult> {
    const { onAgUiEvent, interruptController } = options;
    const loopContext = createContext(runId, threadId, state.steps.length, currentMessages, state);
    const stepOverrides = (await options.prepareStep?.(loopContext)) ?? undefined;
    const stepOptions = mergeStepOptions(options, stepOverrides);
    const stepMessages = stepOverrides?.messages ?? currentMessages;
    const { stopWhen } = stepOptions;
    const stepStopConditions = Array.isArray(stopWhen) ? stopWhen : [stopWhen];

    if (interruptController?.isInterrupted()) {
      await stepOptions.onAbort?.('interrupt', loopContext);
      const interruptEvent = createInterruptEvent(
        runId,
        interruptController.getReason() as InterruptReason | undefined,
        interruptController.getMessage(),
        threadId
      );
      await safeEmitEvent(interruptEvent, 'interrupt', onAgUiEvent);
      return { interrupted: true };
    }

    await safeEmitEvent(
      withThreadId(
        {
          runId,
          stepIndex: state.steps.length,
          timestamp: new Date().toISOString(),
          type: EventType.STEP_STARTED
        },
        threadId
      ),
      'STEP_STARTED',
      onAgUiEvent
    );

    const result = await processSingleStep(
      state,
      stepOptions,
      loopContext,
      stepMessages,
      abortController,
      stepStopConditions
    );

    await safeEmitEvent(
      withThreadId(
        {
          outputLength: result.parts.length,
          runId,
          stepIndex: state.stepIndex,
          timestamp: new Date().toISOString(),
          type: EventType.STEP_FINISHED
        },
        threadId
      ),
      'STEP_FINISHED',
      onAgUiEvent
    );

    let nextMessages: unknown[] | undefined;
    if (result.nextMessages) {
      ({ nextMessages } = result);
    } else if (stepOverrides?.messages) {
      nextMessages = stepMessages;
    }

    return {
      continueLoop: result.continueLoop,
      interrupted: false,
      nextMessages,
      parts: result.parts
    };
  }

  /**
   * Handle an unrecoverable error in the agent loop.
   *
   * Fires the `onError` callback and `RUN_ERROR` event, invokes final
   * lifecycle hooks (`beforeFinal` / `afterFinal`), then re-throws the
   * original error so the caller can handle it.
   *
   * @param error - The error that caused the agent loop to fail.
   * @param runId - Current run identifier.
   * @param threadId - Optional thread identifier for multi-turn conversations.
   * @param state - Current agent loop state snapshot.
   * @param currentMessages - Messages at the point of failure.
   * @throws {unknown} Always throws the original `error` after cleanup.
   */
  async function handleRunError(
    error: unknown,
    runId: string,
    threadId: string | undefined,
    state: AgentLoopState,
    currentMessages: unknown[]
  ): Promise<never> {
    const { onAgUiEvent } = options;
    const errorMessage = error instanceof Error ? error.message : 'Unknown agent loop error';
    const errorObj = error instanceof Error ? error : new Error(errorMessage);
    await options.onError?.(errorObj, createContext(runId, threadId, state.steps.length, currentMessages, state));
    await safeEmitEvent(
      withThreadId(
        {
          error: { message: errorMessage },
          runId,
          timestamp: new Date().toISOString(),
          type: EventType.RUN_ERROR
        },
        threadId
      ),
      'RUN_ERROR',
      onAgUiEvent
    );

    const finalContext: AgentLoopFinalContext = {
      ...createContext(runId, threadId, state.steps.length, currentMessages, state),
      finalOutput: state.lastOutput,
      outcome: 'error'
    };

    await options.beforeFinal?.(finalContext);
    await options.afterFinal?.(finalContext);
    throw error;
  }

  // fallow-ignore-next-line complexity
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: refactor planned
  async function* run(initialMessages: unknown[]): AsyncGenerator<OutputPart> {
    const runId = options.runId ?? createRunId();
    const { threadId, onAgUiEvent } = options;

    const state: AgentLoopState = {
      consecutiveIdenticalCalls: 0,
      lastOutput: {
        content: '',
        done: false,
        incomplete: false,
        incompleteness: [],
        parts: [],
        thinking: '',
        toolCalls: []
      },
      stepIndex: 0,
      steps: [],
      toolCallCount: 0
    };

    const maxSteps = options.maxSteps ?? 20;

    let currentMessages = initialMessages;
    const initialContext = createContext(runId, threadId, state.steps.length, currentMessages, state);

    await options.beforeInit?.(initialContext);

    // Emit RUN_STARTED
    await safeEmitEvent(
      withThreadId(
        {
          runId,
          timestamp: new Date().toISOString(),
          type: EventType.RUN_STARTED
        },
        threadId
      ),
      'RUN_STARTED',
      onAgUiEvent
    );

    await options.afterInit?.(initialContext);

    let abortReason: 'success' | 'interrupt' | 'error' | 'abort' = 'success';

    try {
      while (!aborted && state.steps.length < maxSteps) {
        const iteration = await executeLoopIteration(runId, threadId, state, currentMessages);
        if (iteration.interrupted) {
          abortReason = 'interrupt';
          break;
        }
        for (const part of iteration.parts) {
          yield part;
        }
        if (!iteration.continueLoop) {
          break;
        }
        if (iteration.nextMessages) {
          currentMessages = iteration.nextMessages;
        }
      }

      if (aborted && abortReason === 'success') {
        abortReason = 'abort';
        await options.onAbort?.('abort', createContext(runId, threadId, state.steps.length, currentMessages, state));
      }

      const finalContext: AgentLoopFinalContext = {
        ...createContext(runId, threadId, state.steps.length, currentMessages, state),
        finalOutput: state.lastOutput,
        outcome: abortReason
      };

      await options.beforeFinal?.(finalContext);

      const finishedOutcomeType = abortReason === 'abort' ? 'interrupt' : abortReason;

      // Emit RUN_FINISHED with appropriate outcome
      await safeEmitEvent(
        withThreadId(
          {
            outcome: { type: finishedOutcomeType },
            runId,
            timestamp: new Date().toISOString(),
            type: EventType.RUN_FINISHED
          },
          threadId
        ),
        'RUN_FINISHED',
        onAgUiEvent
      );

      await options.afterFinal?.(finalContext);
    } catch (error) {
      await handleRunError(error, runId, threadId, state, currentMessages);
    }
  }

  return {
    abort: () => {
      aborted = true;
      abortController.abort();
    },
    run
  };
}

// fallow-ignore-next-line unused-type
export type AgentLoop = ReturnType<typeof createAgentLoop>;
