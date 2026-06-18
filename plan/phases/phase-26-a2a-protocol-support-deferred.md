

## 48. Phase 26 — A2A Protocol Support (DEFERRED — Post-v1)

**Priority**: P4 — Deferred. Ships after Phase 24 (Teams) — A2A is most valuable in a federated multi-agent context.
**Story points**: ~15 (preliminary)
**Branch**: `feat/a2a-protocol` (not yet created)
**Depends on**: Phase 14 (ACP agent — A2A builds on the same transport and session model), Phase 23 (task board — A2A tasks map to the task board), Phase 24 (Teams — A2A is most useful in server mode with authenticated agents)
**Unblocks**: federated agents, cross-daemon agent delegation, agent marketplace
**Status**: DEFERRED — design complete, implementation not started
**Source**: gemini-cli (§A.15) — full `@a2a-js/sdk` implementation with `TaskStore`, `AgentExecutor`, `AgentExecutionEvent`, `RequestContext`, `ExecutionEventBus`

### 41.1 Goal

Implement the [A2A (Agent-to-Agent) protocol](https://github.com/a2a-io/a2a-js) so agentsy agents can:
1. **Act as an A2A server** — expose agentsy agents as A2A-callable services that other A2A-compatible clients (gemini-cli, other agentsy instances, third-party A2A agents) can invoke.
2. **Invoke remote A2A agents as subagents** — an agentsy agent can delegate a sub-task to a remote A2A agent (e.g. a specialized research agent running on another server) and receive the result.
3. **Federate across daemons** — multiple agentsy daemons (e.g. one per team, one per region) can delegate to each other, enabling distributed agent topologies.

### 41.2 Design

#### 41.2.1 A2A server

The agentsy daemon exposes an A2A server endpoint (alongside the existing ACP endpoint). A2A uses JSON-RPC 2.0 over HTTP/SSE — same wire format as ACP, different method set.

```typescript
// packages/daemon/src/a2a/a2a-server.ts (NEW)

import { TaskStore, AgentExecutor, AgentExecutionEvent, RequestContext, ExecutionEventBus } from '@a2a-js/sdk';

export class AgentsyA2AServer {
  constructor(
    private agentHost: AgentHost,
    private taskBoard: TaskBoard,
    private scopeManager: ScopeManager,
  ) {}

  async handleTaskCreate(params: A2ATaskCreateParams): Promise<A2ATask> {
    // 1. Create a agentsy agent for the A2A task
    const agentId = await this.agentHost.spawn({
      spec: resolveAgentSpecForA2ATask(params),
      scope: this.scopeManager.deriveScopeKey(params.context?.cwd),
    });

    // 2. Create a task-board entry linking A2A task → agentsy agent
    const task = await this.taskBoard.create({
      planId: `a2a:${params.taskId}`,
      stepId: 'a2a-root',
      parentTaskId: params.parentTaskId,
      metadata: { a2aTaskId: params.taskId, agentId },
    });

    return { id: params.taskId, agentId, status: 'running' };
  }

  async handleTaskCancel(taskId: string): Promise<void> {
    const task = await this.taskBoard.getByMetadata('a2aTaskId', taskId);
    if (task) {
      await this.agentHost.kill(task.metadata.agentId);
      await this.taskBoard.cancel(task.id);
    }
  }

  // Stream A2A events (agent output → A2A client)
  async *streamTaskEvents(taskId: string): AsyncGenerator<AgentExecutionEvent> {
    const task = await this.taskBoard.getByMetadata('a2aTaskId', taskId);
    const agent = this.agentHost.getAgent(task.metadata.agentId);

    for await (const chunk of agent.stream) {
      yield mapAgentsyChunkToA2AEvent(chunk);
    }
  }
}
```

#### 41.2.2 A2A client (remote subagent invocation)

An agentsy agent can delegate to a remote A2A agent via a new tool:

```typescript
// packages/tools/src/tools/a2a/index.ts (NEW)

export function createA2ADelegateTool(deps: { a2aClient: A2AClient }): ToolDefinition {
  return {
    name: 'a2a_delegate',
    description: 'Delegate a sub-task to a remote A2A-compatible agent. ' +
                 'The remote agent runs independently and returns its result.',
    parameters: [
      { name: 'agentUrl', type: 'string', required: true, description: 'URL of the remote A2A agent' },
      { name: 'task', type: 'string', required: true, description: 'Task description for the remote agent' },
      { name: 'context', type: 'object', required: false, description: 'Additional context (cwd, files, etc.)' },
    ],
    handler: async (input) => {
      const task = await deps.a2aClient.createTask(input.agentUrl, {
        task: input.task,
        context: input.context,
      });

      // Stream events until completion
      const events = [];
      for await (const event of deps.a2aClient.streamTaskEvents(input.agentUrl, task.id)) {
        events.push(event);
        if (event.type === 'completion') break;
      }

      return { ok: true, data: { taskId: task.id, events, result: events.find(e => e.type === 'completion')?.result } };
    },
  };
}
```

#### 41.2.3 Integration with Phase 24 (Teams)

In server mode (Topology C), the A2A server endpoint is exposed alongside the ACP endpoint. Authentication uses the same OAuth/session-JWT mechanism (§38.2.2). Each A2A task is attributed to the authenticated user for spend tracking and audit logging.

#### 41.2.4 Security

- A2A delegation respects the same guardrail pipeline (Phase 4/9/10/12) — the remote agent's response is scanned by `IngressScanner` before being passed to the local agent.
- The `a2a_delegate` tool requires explicit user approval (Phase 4 `ApprovalManager`) for the first call to a new agent URL. Subsequent calls to the same URL are auto-approved (configurable).
- A2A agent URLs are subject to the `EgressScanner` (Phase 10) URL allowlist.

### 41.3 Verification (when activated)

- [ ] A2A server endpoint accepts task creation, streaming, cancellation
- [ ] External A2A client (gemini-cli) can invoke an agentsy agent and receive streamed results
- [ ] `a2a_delegate` tool delegates to a remote A2A agent and returns the result
- [ ] A2A task attribution to user (spend tracking, audit logging) works in server mode
- [ ] A2A delegation respects guardrails (remote response scanned by `IngressScanner`)
- [ ] First call to a new A2A agent URL requires approval; subsequent calls auto-approved
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

---

