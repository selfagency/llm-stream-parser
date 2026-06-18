
## 23. Phase 18 — Missing Capabilities

**Priority**: P3 — Sprints 10–11
**Story points**: 9 (includes Council CLI surface — +2 SP from 2026-06-17 audit)
**Branch**: `feat/missing-capabilities`
**Depends on**: Phase 14 ✅ (ACP agent)
**Closes**: v2.3 Phase 9 items

### 23.1 Structured Output with Schema Validation

The `@agentsy/core` structured output module exists but lacks integration with the streaming pipeline. The daemon should validate all structured outputs against their JSON schemas before returning them to the client.

```typescript
// packages/daemon/src/services/output-validator.ts (NEW)

export class OutputValidator {
  async validate<T>(
    output: string,
    schema: JSONSchema,
    options: { autoRepair: boolean; maxRepairAttempts: number }
  ): Promise<ValidationResult<T>> {
    let parsed = parseJSON(output);
    if (!parsed.success && options.autoRepair) {
      for (let attempt = 0; attempt < options.maxRepairAttempts; attempt++) {
        const repaired = autoRepair(output, schema, attempt);
        parsed = parseJSON(repaired);
        if (parsed.success) break;
      }
    }
    if (!parsed.success) return { valid: false, error: parsed.error };

    const validation = validateJSONSchema(parsed.data, schema);
    if (!validation.valid) return { valid: false, error: validation.errors };

    return { valid: true, data: parsed.data as T };
  }
}
```

### 23.2 Conversation Checkpointing & Recovery

Agents need the ability to save and restore conversation state. Partially implemented in `@agentsy/runtime/src/checkpoint.ts` but not integrated with the daemon.

```typescript
// packages/daemon/src/services/checkpoint-manager.ts (NEW)

export class CheckpointManager {
  async createCheckpoint(agentId: string, name: string): Promise<string> {
    const agent = this.agentHost.getAgent(agentId);
    const memorySnapshot = await this.memory.snapshot(agent.spec.memoryScope);

    const checkpoint: AgentCheckpoint = {
      id: randomUUID(),
      agentId,
      name,
      timestamp: new Date(),
      messageHistory: agent.messages,
      memorySnapshot,
      tokenBudget: agent.budget,
      metadata: {
        turnsCompleted: agent.turnsCompleted,
        tokensUsed: agent.tokensUsed,
      },
    };

    await this.db.execute(
      'INSERT INTO agent_checkpoints (id, agent_id, name, timestamp, data) VALUES (?, ?, ?, ?, ?)',
      [checkpoint.id, agentId, name, checkpoint.timestamp.toISOString(), JSON.stringify(checkpoint)]
    );

    return checkpoint.id;
  }

  async restoreCheckpoint(checkpointId: string): Promise<string> {
    const row = await this.db.querySingle<{ data: string }>(
      'SELECT data FROM agent_checkpoints WHERE id = ?', [checkpointId]
    );
    if (!row) throw new Error(`Checkpoint "${checkpointId}" not found`);

    const checkpoint = JSON.parse(row.data);
    const newAgentId = await this.agentHost.spawn({
      ...checkpoint,
      id: `${checkpoint.agentId}_restored_${Date.now()}`,
    });
    await this.memory.restoreSnapshot(checkpoint.memorySnapshot);
    return newAgentId;
  }
}
```

### 23.3 Tool Execution Sandbox

The daemon must sandbox tool execution to prevent arbitrary code execution:

```typescript
// packages/daemon/src/services/sandbox-service.ts (NEW)

export class SandboxService implements Service {
  readonly name = 'sandbox';

  async execute(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
    // 1. Verify tool is registered and agent has permission
    const tool = this.toolRegistry.get(request.toolName);
    if (!tool) throw new Error(`Unknown tool: ${request.toolName}`);

    const agent = this.agentHost.getAgent(request.agentId);
    if (!agent.spec.capabilities.includes(request.toolName)) {
      throw new Error(`Agent "${request.agentId}" lacks capability: ${request.toolName}`);
    }

    // 2. Check budget
    if (agent.budget && agent.tokensUsed >= agent.budget.max_tokens_per_session) {
      throw new Error(`Agent "${request.agentId}" exceeded token budget`);
    }

    // 3. Execute in sandbox (Docker, E2B, or virtual vm)
    const result = await this.virtualSandbox.execute({
      tool,
      args: request.args,
      agentId: request.agentId,
      timeout: tool.timeout ?? 30_000,
      secrets: this.secretsGuard.getAllowedSecrets(request.agentId),
    });

    // 4. Audit trail
    await this.audit(request, result);

    return result;
  }
}
```

### 23.4 Cross-Session Memory Persistence

```typescript
// packages/daemon/src/services/cross-session-memory.ts (NEW)

export class CrossSessionMemory {
  async getCrossSessionInsights(scope: string): Promise<CrossSessionInsight[]> {
    const memories = await this.memory.recall({
      query: '*',
      scope,
      kind: 'semantic',
      limit: 100,
    });

    const grouped = this.groupByTopic(memories);
    return grouped.map(group => ({
      topic: group.key,
      memoryCount: group.items.length,
      earliestMemory: group.items[group.items.length - 1].timestamp,
      latestMemory: group.items[0].timestamp,
      confidence: this.calculateConfidence(group.items),
      summary: this.summarize(group.items),
    }));
  }
}
```

### 23.5 Graceful Degradation & Circuit Breaking

```typescript
// packages/daemon/src/services/resilience-service.ts (NEW)

export class ResilienceService implements Service {
  readonly name = 'resilience';
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private fallbackChain: ModelTier[] = ['frontier', 'mid', 'small', 'micro'];

  async resilientCall(request: ModelCallRequest): Promise<ModelCallResult> {
    const providerId = request.routing.replica.providerId;
    const cb = this.getOrCreateCircuitBreaker(providerId);

    if (cb.state === 'open') {
      this.logger.warn(`Circuit breaker open for ${providerId}, trying failover`);
      return this.failoverCall(request);
    }

    try {
      return await cb.execute(async () => this.streamManager.executeCall(request));
    } catch (error) {
      this.logger.warn(`Primary call failed, trying failover`, { providerId, error });
      return this.failoverCall(request);
    }
  }

  private async failoverCall(request: ModelCallRequest): Promise<ModelCallResult> {
    const spilloverResult = await this.routingService.spillover(request.routing);
    if (spilloverResult) {
      return this.resilientCall({ ...request, routing: spilloverResult });
    }

    const currentTierIdx = this.fallbackChain.indexOf(request.routing.tier);
    for (let i = currentTierIdx + 1; i < this.fallbackChain.length; i++) {
      const fallbackTier = this.fallbackChain[i];
      const fallbackRouting = await this.routingService.selectModel({ tier: fallbackTier });
      if (fallbackRouting) {
        this.logger.info(`Degrading from ${request.routing.tier} to ${fallbackTier}`);
        return this.resilientCall({ ...request, routing: fallbackRouting });
      }
    }

    const cached = await this.tryCache(request);
    if (cached) {
      this.logger.info('Returning cached response (all providers failed)');
      return { ...cached, fromCache: true };
    }

    throw new AllProvidersExhaustedError('All model providers are unavailable');
  }
}
```

### 23.6 Telemetry & Diagnostics

```typescript
// packages/daemon/src/services/diagnostics-service.ts (NEW)

export class DiagnosticsService implements Service {
  readonly name = 'diagnostics';

  async getHealthReport(): Promise<DaemonHealthReport> {
    return {
      daemon: { state: this.daemon.state, uptime: process.uptime(), pid: process.pid, memory: process.memoryUsage() },
      services: this.serviceHost.listStates(),
      agents: this.agentHost.list().map(a => ({
        id: a.spec.id, role: a.spec.role, state: a.state,
        tokensUsed: a.tokensUsed, turnsCompleted: a.turnsCompleted,
        memoryScope: a.spec.memoryScope,
      })),
      routing: {
        modelsRegistered: this.routingService.getModelCount(),
        healthyProviders: this.routingService.getHealthyProviderCount(),
        totalProviders: this.routingService.getTotalProviderCount(),
      },
      memory: {
        scopes: this.memory.getScopeCount(),
        totalItems: await this.memory.getTotalItemCount(),
        lastConsolidation: this.memory.getLastConsolidationTime(),
      },
      jobs: { scheduled: await this.jobScheduler.list(), running: this.jobScheduler.getRunningCount() },
      streams: { active: this.streamManager.getActiveStreamCount() },
      subprocesses: this.subprocessManager.listProcesses().map(p => ({
        id: p.id, pid: p.pid, status: p.status,
        memoryUsageMb: p.memoryUsageMb, restartCount: p.restartCount,
      })),
      acp: { enabled: this.daemon.acp !== null, activeSessions: this.activeACPSessions.size },
    };
  }
}
```

### 23.7 ACP-Specific Capabilities

- **Image support in prompts** (`promptCapabilities.image: true`) — accept base64-encoded images from ACP client, forward to vision-capable models.
- **Audio support in prompts** (`promptCapabilities.audio: true`) — integrate ASR pipeline.
- **MCP server management via ACP** — when ACP client provides `mcpServers` in `session/new`, start them as managed subprocesses.
- **ACP session persistence** — ACP sessions survive daemon restarts; `session/load` and `session/resume` query persisted state.

### 23.8 Verification

- [ ] `OutputValidator` validates and auto-repairs structured output
- [ ] `CheckpointManager` creates and restores checkpoints
- [ ] `SandboxService` sandboxes tool execution
- [ ] `CrossSessionMemory` aggregates across sessions
- [ ] `ResilienceService` circuit breaks and falls back gracefully
- [ ] `DiagnosticsService` exposes comprehensive health report
- [ ] Image support in prompts works
- [ ] ACP session persistence works across daemon restarts
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

---

### 23.X Council Mode CLI Surface (Addition from 2026-06-17 audit)

> **Audit finding**: `@agentsy/orchestrator` has a production-quality Council Mode implementation
> (3-stage: opinions → review → chairman synthesis) with `CouncilDefinition`, `CouncilResult`,
> `stage1-opinions.ts`, `stage2-review.ts`, `stage3-chairman.ts`, and `presets.ts`. There is no
> CLI command to invoke it.

**Gap**: There is no `agentsy council <preset|definition>` CLI command. Council Mode is Agentsy's
most distinctive multi-model capability — not having a CLI surface makes it invisible to users.

**Deliverables**:

1. **`agentsy council list`** — List available presets (coding, research, review, architecture, general)
2. **`agentsy council run <preset> "<prompt>"`** — Run a council session with a preset definition
3. **`agentsy council run --members "claude-4,gemini-2.5-pro" --chairman "claude-4-opus" "<prompt>"`** — Ad-hoc council
4. **`agentsy council status`** — Show active council sessions (in daemon mode)

```typescript
// packages/cli/src/commands/council.ts (NEW)

import { Command } from 'commander';
import type { CouncilDefinition } from '@agentsy/orchestrator';
import { COUNCIL_PRESETS, runCouncil } from '@agentsy/orchestrator';

export function buildCouncilCommand(): Command {
  const cmd = new Command('council').description('Run a multi-model Council Mode deliberation');

  cmd.command('list')
    .description('List available council presets')
    .action(() => {
      for (const [name, def] of Object.entries(COUNCIL_PRESETS)) {
        console.log(`  ${name.padEnd(16)} ${def.description} (${def.members.length} members)`);
      }
    });

  cmd.command('run <preset> [prompt]')
    .description('Run a council session')
    .option('--members <models>', 'Comma-separated list of model IDs')
    .option('--chairman <model>', 'Chairman model ID')
    .option('--timeout <ms>', 'Timeout in milliseconds', '120000')
    .action(async (preset, prompt, opts) => {
      const definition: CouncilDefinition = COUNCIL_PRESETS[preset] ?? {
        name: 'custom',
        description: 'Ad-hoc council',
        domain: 'general',
        chairman: { model: opts.chairman, provider: 'auto' },
        members: opts.members.split(',').map((m: string) => ({ model: m.trim(), provider: 'auto' })),
        timeoutMs: parseInt(opts.timeout, 10)
      };
      const result = await runCouncil(definition, prompt ?? '');
      console.log('\n## Chairman Synthesis\n');
      console.log(result.finalAnswer);
      if (result.dissentingOpinions.length > 0) {
        console.log('\n## Dissenting Opinions\n');
        for (const d of result.dissentingOpinions) {
          console.log(`[${d.member.model}] ${d.opinion}`);
        }
      }
    });

  return cmd;
}
```

**Story points**: +2 SP (added to Phase 18 total → 9 SP)
