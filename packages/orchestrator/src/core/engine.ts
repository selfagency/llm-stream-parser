import { EventEmitter } from 'node:events';

import type { AgentRegistry } from '../agents/registry.js';
import type { TaskScheduler } from '../scheduler/index.js';
import { createTaskScheduler } from '../scheduler/index.js';
import type { AgentCapabilities, WorkflowResult, WorkflowSpec } from '../types/index.js';
import { NodeType, WorkflowStatus } from '../types/index.js';

type RuntimeWorkflowNode = WorkflowSpec['nodes'][number];
type RuntimeTaskNode = Extract<RuntimeWorkflowNode, { type: 'task' }>;
type RuntimeDecisionNode = Extract<RuntimeWorkflowNode, { type: 'decision' }>;
type RuntimeParallelNode = Extract<RuntimeWorkflowNode, { type: 'parallel' }>;
type RuntimeSequenceNode = Extract<RuntimeWorkflowNode, { type: 'sequence' }>;
type RuntimeMergeNode = Extract<RuntimeWorkflowNode, { type: 'merge' }>;

export type { TaskScheduler } from '../scheduler/index.js';

// Exported interfaces for public API
/** Runtime context for an in-progress workflow execution. */
export interface WorkflowContext {
  context: Record<string, unknown>;
  endTime: Date | null;
  startTime: Date | null;
  status: WorkflowStatus;
  workflow: Workflow;
}

/** Options that control workflow execution behavior. */
export interface ExecutionOptions {
  monitoring?: boolean;
  recovery?: boolean;
  registry?: AgentRegistry;
  resourceLimits?: {
    maxAgents?: number;
    maxCost?: number;
    maxDuration?: number;
  };
  scheduler?: TaskScheduler;
}

// fallow-ignore-next-line unused-export
export class Workflow {
  public id: string;
  readonly #spec: WorkflowSpec;
  readonly #registry: AgentRegistry;
  readonly #scheduler: TaskScheduler;

  constructor(spec: WorkflowSpec, registry: AgentRegistry, scheduler: TaskScheduler) {
    this.id = spec.id;
    this.#spec = spec;
    this.#registry = registry;
    this.#scheduler = scheduler;
  }

  getSpec(): WorkflowSpec {
    return this.#spec;
  }

  getId(): string {
    return this.id;
  }

  getRegistry(): AgentRegistry {
    return this.#registry;
  }

  getScheduler(): TaskScheduler {
    return this.#scheduler;
  }
}

// fallow-ignore-next-line unused-export
export class WorkflowMonitor {
  readonly #context: WorkflowContext;

  constructor(context: WorkflowContext) {
    this.#context = context;
  }

  getStatus(): WorkflowStatus {
    return this.#context.status;
  }

  getDuration(): number | null {
    if (!this.#context.startTime) {
      return null;
    }
    const endTime = this.#context.endTime ?? new Date();
    return endTime.getTime() - this.#context.startTime.getTime();
  }

  isRunning(): boolean {
    return this.#context.status === WorkflowStatus.RUNNING;
  }

  isCompleted(): boolean {
    const terminalStatuses: readonly string[] = [
      WorkflowStatus.COMPLETED,
      WorkflowStatus.FAILED,
      WorkflowStatus.CANCELLED
    ];
    return terminalStatuses.includes(this.#context.status);
  }
}

// Internal interfaces (not exported)
interface WorkflowExecution {
  cancel(): Promise<void>;
  options: ExecutionOptions;
  run(): Promise<WorkflowResult>;
  workflow: Workflow;
}

// Workflow execution factory
function createWorkflowExecution(workflow: Workflow, options: ExecutionOptions): WorkflowExecution {
  const registry = options.registry ?? workflow.getRegistry();
  const scheduler = options.scheduler ?? workflow.getScheduler();

  let cancelled = false;
  const nodeResults = new Map<string, unknown>();

  return {
    // biome-ignore lint/suspicious/useAwait: matches WorkflowExecution interface
    async cancel(): Promise<void> {
      cancelled = true;
    },
    options,
    async run(): Promise<WorkflowResult> {
      const spec = this.workflow.getSpec();
      const startNode = spec.nodes[0]; // Start from first node
      if (!startNode) {
        throw new Error('Workflow must have at least one node');
      }

      const results = await executeNode(startNode, this.workflow, registry, scheduler, cancelled, nodeResults);

      return {
        errors: [],
        metrics: {
          agentsUsed: 0,
          cost: 0,
          duration: 0 // Will be calculated by orchestration engine,
        },
        results: (results ?? {}) as Record<string, unknown>,
        status: WorkflowStatus.COMPLETED,
        workflowId: this.workflow.getId()
      };
    },
    workflow
  };
}

// Helper function to execute nodes
async function executeNode(
  node: RuntimeWorkflowNode,
  workflow: Workflow,
  registry: AgentRegistry,
  scheduler: TaskScheduler,
  cancelled: boolean,
  nodeResults: Map<string, unknown>
): Promise<unknown> {
  if (cancelled) {
    throw new Error('Workflow cancelled');
  }

  let result: unknown;

  switch (node.type) {
    case NodeType.TASK: {
      result = await executeTaskNode(node, registry, scheduler);
      break;
    }
    case NodeType.DECISION: {
      result = await executeDecisionNode(node, workflow, registry, scheduler, cancelled, nodeResults);
      break;
    }
    case NodeType.PARALLEL: {
      result = await executeParallelNode(node, workflow, registry, scheduler, cancelled, nodeResults);
      break;
    }
    case NodeType.SEQUENCE: {
      result = await executeSequenceNode(node, workflow, registry, scheduler, cancelled, nodeResults);
      break;
    }
    case NodeType.MERGE: {
      result = executeMergeNode(node, nodeResults);
      break;
    }
    default: {
      throw new Error(`Unsupported node type: ${String(node)}`);
    }
  }

  nodeResults.set(node.id, result);
  return result;
}

async function executeTaskNode(
  node: RuntimeTaskNode,
  registry: AgentRegistry,
  scheduler: TaskScheduler
): Promise<unknown> {
  // Find suitable agent
  const availableAgents = registry.getAllAgents().filter((a: AgentCapabilities) => a.available);

  return await scheduler
    .schedule({
      agents: availableAgents,
      taskInfo: {
        id: node.id,
        input: node.input,
        name: node.name,
        priority: 'high',
        requirements: [],
        type: node.type
      }
    })
    .then(decision => {
      if (!decision) {
        throw new Error(`No suitable agent found for task ${node.id}`);
      }

      // Execute task (placeholder - would integrate with actual agent execution)
      return {
        result: `Task ${node.id} executed by agent ${(decision as { agentId: string }).agentId}`
      };
    });
}

async function executeSequenceNode(
  node: RuntimeSequenceNode,
  workflow: Workflow,
  registry: AgentRegistry,
  scheduler: TaskScheduler,
  cancelled: boolean,
  nodeResults: Map<string, unknown>
): Promise<unknown> {
  const results: unknown[] = [];

  for (const stepId of node.steps) {
    const stepNode = findNodeById(stepId, workflow);
    if (!stepNode) {
      throw new Error(`Step node ${stepId} not found`);
    }

    const result = await executeNode(stepNode, workflow, registry, scheduler, cancelled, nodeResults);
    results.push(result);
  }

  return results;
}

async function executeDecisionNode(
  node: RuntimeDecisionNode,
  workflow: Workflow,
  registry: AgentRegistry,
  scheduler: TaskScheduler,
  cancelled: boolean,
  nodeResults: Map<string, unknown>
): Promise<unknown> {
  const condition = node.condition.trim();
  const decision = (() => {
    if (condition === 'true') {
      return true;
    }
    if (condition === 'false') {
      return false;
    }
    const resultKey = condition.startsWith('result:') ? condition.slice('result:'.length) : condition;
    return Boolean(nodeResults.get(resultKey));
  })();

  const selectedBranch = decision ? node.trueBranch : node.falseBranch;
  const results: unknown[] = [];

  for (const targetId of selectedBranch) {
    const targetNode = findNodeById(targetId, workflow);
    if (!targetNode) {
      throw new Error(`Decision branch node ${targetId} not found`);
    }
    const branchResult = await executeNode(targetNode, workflow, registry, scheduler, cancelled, nodeResults);
    results.push(branchResult);
  }

  return { branch: decision ? 'true' : 'false', decision, results };
}

async function executeParallelNode(
  node: RuntimeParallelNode,
  workflow: Workflow,
  registry: AgentRegistry,
  scheduler: TaskScheduler,
  cancelled: boolean,
  nodeResults: Map<string, unknown>
): Promise<unknown> {
  const failFast = node.failFast ?? true;
  const maxConcurrency = Math.max(node.maxConcurrency ?? node.branches.length, 1);

  const branchNodes = node.branches.map(branchId => {
    const branchNode = findNodeById(branchId, workflow);
    if (!branchNode) {
      throw new Error(`Parallel branch node ${branchId} not found`);
    }
    return branchNode;
  });

  const results = Array.from<unknown>({ length: branchNodes.length });
  const errors: Error[] = [];
  let cursor = 0;

  const runNext = async (): Promise<void> => {
    if (cursor >= branchNodes.length) {
      return;
    }

    const currentIndex = cursor;
    cursor += 1;
    const branchNode = branchNodes[currentIndex];

    if (!branchNode) {
      return;
    }

    try {
      results[currentIndex] = await executeNode(branchNode, workflow, registry, scheduler, cancelled, nodeResults);
    } catch (error) {
      const executionError = error instanceof Error ? error : new Error(String(error));
      errors.push(executionError);
      if (failFast) {
        throw executionError;
      }
    }

    await runNext();
  };

  const workers = Array.from({ length: Math.min(maxConcurrency, branchNodes.length) }, async () => await runNext());
  await Promise.all(workers);

  if (errors.length > 0) {
    throw new Error(`Parallel node ${node.id} failed: ${errors.map(error => error.message).join('; ')}`);
  }

  return results;
}

function executeMergeNode(node: RuntimeMergeNode, nodeResults: Map<string, unknown>): unknown {
  const inputs = node.inputs.map(inputId => nodeResults.get(inputId));

  switch (node.strategy) {
    case 'first': {
      return inputs.find(input => input !== undefined) ?? null;
    }
    case 'all':
    case 'join': {
      return inputs;
    }
    case 'majority': {
      const frequency = new Map<string, { value: unknown; count: number }>();
      for (const input of inputs) {
        const key = JSON.stringify(input);
        const existing = frequency.get(key);
        if (existing) {
          existing.count += 1;
        } else {
          frequency.set(key, { count: 1, value: input });
        }
      }

      let majorityValue: unknown = null;
      let maxCount = 0;
      for (const entry of frequency.values()) {
        if (entry.count > maxCount) {
          majorityValue = entry.value;
          maxCount = entry.count;
        }
      }

      return majorityValue;
    }
    default: {
      return inputs;
    }
  }
}

function findNodeById(id: string, workflow: Workflow): RuntimeWorkflowNode | undefined {
  const spec = workflow.getSpec();
  return spec.nodes.find(node => node.id === id);
}

function getNodeReferences(node: RuntimeWorkflowNode): string[] {
  switch (node.type) {
    case NodeType.DECISION: {
      return [...node.trueBranch, ...node.falseBranch];
    }
    case NodeType.SEQUENCE: {
      return node.steps;
    }
    case NodeType.PARALLEL: {
      return node.branches;
    }
    case NodeType.MERGE: {
      return node.inputs;
    }
    case NodeType.TASK: {
      return [];
    }
    default: {
      return [];
    }
  }
}

function getNodeTypeLabel(node: RuntimeWorkflowNode): string {
  switch (node.type) {
    case NodeType.DECISION: {
      return 'Decision';
    }
    case NodeType.SEQUENCE: {
      return 'Sequence';
    }
    case NodeType.PARALLEL: {
      return 'Parallel';
    }
    case NodeType.MERGE: {
      return 'Merge';
    }
    case NodeType.TASK: {
      return 'Task';
    }
    default: {
      return 'Node';
    }
  }
}

function validateNodeReferences(node: RuntimeWorkflowNode, nodeIds: Set<string>): void {
  const references = getNodeReferences(node);
  if (references.length === 0) {
    return;
  }

  for (const targetId of references) {
    if (!nodeIds.has(targetId)) {
      throw new Error(`${getNodeTypeLabel(node)} node ${node.id} references unknown node: ${targetId}`);
    }
  }
}

export class OrchestrationEngine extends EventEmitter {
  private readonly workflows = new Map<string, WorkflowContext>();
  private readonly activeExecutions = new Map<string, WorkflowExecution>();
  readonly #registry: AgentRegistry;
  readonly #scheduler: TaskScheduler;

  constructor(registry: AgentRegistry, scheduler: TaskScheduler = createTaskScheduler()) {
    super();
    this.#registry = registry;
    this.#scheduler = scheduler;
  }

  create(spec: WorkflowSpec): Workflow {
    const workflow = new Workflow(spec, this.#registry, this.#scheduler);

    // Validate workflow
    this.validateWorkflow(workflow);

    this.workflows.set(workflow.id, {
      context: {},
      endTime: null,
      startTime: null,
      status: WorkflowStatus.PENDING,
      workflow
    });

    this.emit('workflow:created', workflow.id);
    return workflow;
  }

  /**
   * Execute a workflow that was created via `create()`.
   *
   * @param workflow - The workflow to execute.
   * @param options - Execution options (progress callbacks, etc.).
   * @returns The workflow result with status, metrics, and outputs.
   * @throws {Error} If `workflow` was not created via `create()` on this engine.
   * @throws {Error} If `workflow` is already executing.
   */
  async execute(workflow: Workflow, options: ExecutionOptions = {}): Promise<WorkflowResult> {
    const context = this.workflows.get(workflow.id);
    if (!context) {
      throw new Error(`Workflow ${workflow.id} not found`);
    }

    if (this.activeExecutions.has(workflow.id)) {
      throw new Error(`Workflow ${workflow.id} already executing`);
    }

    const execution = createWorkflowExecution(workflow, options);
    this.activeExecutions.set(workflow.id, execution);

    context.status = WorkflowStatus.RUNNING;
    context.startTime = new Date();
    this.emit('workflow:started', workflow.id);

    try {
      const result = await execution.run();

      context.status = result.status;
      context.endTime = new Date();
      this.activeExecutions.delete(workflow.id);

      this.emit('workflow:completed', workflow.id, result);
      return result;
    } catch (error) {
      context.status = WorkflowStatus.FAILED;
      context.endTime = new Date();
      this.activeExecutions.delete(workflow.id);

      const result: WorkflowResult = {
        errors: [error instanceof Error ? error.message : String(error)],
        metrics: {
          agentsUsed: 0,
          cost: 0,
          duration: context.startTime ? Date.now() - context.startTime.getTime() : 0
        },
        results: {},
        status: WorkflowStatus.FAILED,
        workflowId: workflow.id
      };

      this.emit('workflow:failed', workflow.id, result);
      return result;
    }
  }

  monitor(workflowId: string): WorkflowMonitor {
    const context = this.workflows.get(workflowId);
    if (!context) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    return new WorkflowMonitor(context);
  }

  async cancel(workflowId: string): Promise<void> {
    const execution = this.activeExecutions.get(workflowId);
    if (execution) {
      await execution.cancel();

      const context = this.workflows.get(workflowId);
      if (context) {
        context.status = WorkflowStatus.CANCELLED;
        context.endTime = new Date();
      }

      this.activeExecutions.delete(workflowId);
      this.emit('workflow:cancelled', workflowId);
    }
  }

  private validateWorkflow(workflow: Workflow): void {
    const spec = workflow.getSpec();

    // Check for required nodes
    if (!spec.nodes || spec.nodes.length === 0) {
      throw new Error('Workflow must have at least one node');
    }

    // Validate node connections
    const nodeIds = new Set(spec.nodes.map(node => node.id));
    for (const node of spec.nodes) {
      validateNodeReferences(node, nodeIds);
    }
  }
}
