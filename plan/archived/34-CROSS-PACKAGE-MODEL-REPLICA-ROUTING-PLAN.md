---
goal: Canonical cross-package plan for model-tier routing, replica-aware load balancing, and local-first lightweight task execution
version: 1.0
date_created: 2026-06-06
last_updated: 2026-06-06
owner: architecture-maintainers
status: Canonical active plan
tags: [architecture, gateway, tokenomics, runtime, orchestrator, routing, local-first, replica-balancing]
supersedes:
  - plan/GREENFIELD.md
  - plan/25-PHASE-16-SMALL-MODEL-PARITY.md
  - plan/26-PHASE-17-APFEL-ONDEVICE-OFFLOAD.md
  - plan/26-PHASE-17-MICRO-TIER-SUMMARY.md
  - plan/29-PHASE-20-TOKENOMICS.md
---

# Cross-Package Plan — Model-Tier Routing, Replica Balancing, and Local-First Lightweight Execution

## 1. Purpose

This is the new canonical cross-package implementation plan for routing and cost-aware execution across the Agentsy stack.

It supersedes the previous greenfield routing plan and incorporates the intent of:

- Phase 16 — small-model parity
- Phase 17 — local micro-tier offload (Apfel, Ollama, Jan, LM Studio, LocalAI, vLLM)
- Phase 20 — tokenomics attribution and routing intelligence

The resulting system routes by **task tier → model tier → logical model → replica**, where a **replica** is one provider/account/backend that serves the same logical model.

This plan is **greenfield** for routing semantics:

- no backwards compatibility constraints
- no provider-tier abstraction
- no compatibility shims
- no orchestrator-owned routing tables

## 2. Executive Summary

Implement a routing architecture where:

- **tiers belong to models, not providers**
- **task tier corresponds to model tier**
- **logical models** are routed across **multiple replicas**
- **replicas** may be cloud accounts or local backends
- **local replicas** are preferred for `micro` and `small` tasks
- **tokenomics** computes hourly/weekly/monthly headroom per replica
- **gateway** selects the best replica using local policy, quota headroom, health, latency, and cost
- **runtime** emits lifecycle and checkpoint state needed for deterministic retries and failover
- **orchestrator** requests by task tier and constraints only
- **guardrails** may constrain routing but do not route

## 3. Non-Negotiable Architecture Decisions

### 3.1 No provider-tier abstraction

Delete all canonical use of:

- `ProviderTier`
- provider-level tier metadata
- provider-tier routing APIs
- provider-tier fallback logic

A provider may host many model tiers. Tier cannot live there.

### 3.2 Tier is model-level only

Canonical shared tier enum:

```ts
export type ModelTier = "micro" | "small" | "mid" | "frontier";
```

### 3.3 Task tier corresponds to model tier

```ts
export type TaskTier = ModelTier;
```

Task decomposition determines tier. Gateway chooses a logical model and replica for that tier.

### 3.4 Replica-aware routing is first-class

The target routing entity is not just “provider” and not just “model”.

- **LogicalModel** = canonical model identity
- **ModelReplica** = one concrete provider/account/backend serving that logical model

Routing selects a **replica** for a **logical model**.

### 3.5 Local-first only for lightweight tasks

Default policy:

- `micro`: strong local preference
- `small`: prefer local
- `mid`: slight local preference only if capable
- `frontier`: no local preference

This is a routing policy, not a special-case scattered across packages.

### 3.6 Tokenomics is authoritative for headroom

Gateway may ingest provider headers, but tokenomics is the authoritative source for:

- rolling hourly headroom
- rolling weekly headroom
- rolling monthly headroom
- same-model replica saturation/skew

### 3.7 Orchestrator does not own routing facts

All cost/capability/routing facts live in gateway/tokenomics.
Orchestrator requests by tier and constraints only.

## 4. Canonical Architecture

```text
Workflow Node / Task
    ↓
@agentsy/orchestrator
    - infers TaskTier
    - infers useCase
    - requests a model selection result from gateway
    ↓
@agentsy/gateway
    - resolves tier -> candidate logical models
    - resolves logical model -> candidate replicas
    - scores replicas using:
        local policy
        health
        latency
        cost
        quota headroom
    - executes through provider transport
    ↓
@agentsy/tokenomics
    - tracks usage by replica/account
    - computes hour/week/month headroom
    - exposes routing signals
    ↓
@agentsy/runtime
    - emits model lifecycle events
    - checkpoints routing state
    - supports retry/failover
```

## 5. Data Model

### 5.1 ProviderEntry

Transport/auth only.

```ts
export interface ProviderEntry {
  id: string;
  provider: string;
  apiKey?: string;
  baseUrl?: string;
  accountId?: string;
  region?: string;
  tags?: string[];
}
```

### 5.2 LogicalModel

```ts
export interface LogicalModel {
  id: string; // "claude-sonnet-4", "gpt-4o-mini", "llama-3.3-70b"
  tier: ModelTier;
  useCases: Array<"chat" | "code" | "search" | "embed" | "vision">;
  capabilities: ModelCapabilities;
  contextWindow: number;
  maxOutputTokens: number;
  paramCount?: number;
  knowledgeCutoff?: string;
  releaseDate?: string;
}
```

### 5.3 ModelCapabilities

```ts
export interface ModelCapabilities {
  tools: boolean;
  jsonMode: boolean;
  vision: boolean;
  audio: boolean;
  reasoning: boolean;
  embeddings: boolean;
}
```

### 5.4 ModelCost

```ts
export interface ModelCost {
  inputPer1MTokens: number;
  outputPer1MTokens: number;
  cachedInputPer1MTokens?: number;
  cacheWritePer1MTokens?: number;
}
```

### 5.5 ModelReplica

```ts
export interface ModelReplica {
  id: string; // "anthropic-main/claude-sonnet-4"
  logicalModelId: string;
  providerId: string;
  upstreamModelName: string;
  isLocal: boolean;
  cost: ModelCost;
  health: ReplicaHealthSnapshot;
  quota: ReplicaQuotaSnapshot;
}
```

### 5.6 ReplicaHealthSnapshot

```ts
export interface ReplicaHealthSnapshot {
  available: boolean;
  latencyMs?: number;
  errorRate?: number;
  circuitState?: "closed" | "open" | "half-open";
  lastCheckedAt: string;
}
```

### 5.7 ReplicaQuotaSnapshot

```ts
export interface ReplicaQuotaSnapshot {
  remainingTokensHour?: number;
  remainingTokensWeek?: number;
  remainingTokensMonth?: number;
  remainingRequestsMinute?: number;
  remainingTokensMinute?: number;
  remainingCostHour?: number;
  remainingCostWeek?: number;
  remainingCostMonth?: number;
  lastUpdatedAt: string;
  confidence: "header-derived" | "tokenomics-derived" | "estimated";
}
```

### 5.8 ModelSelectionResult

```ts
export interface ModelSelectionResult {
  logicalModelId: string;
  replicaId: string;
  providerId: string;
  selectedBecause: string[];
  rejectedCandidates: Array<{
    id: string;
    reasons: string[];
  }>;
}
```

## 6. Package Responsibilities

| Package | Responsibility |
|---|---|
| `@agentsy/gateway` | logical model registry, replica registry, selector, local detection, execution |
| `@agentsy/tokenomics` | usage tracking, rolling windows, quota headroom, cost/budget intelligence |
| `@agentsy/runtime` | model call lifecycle events, checkpointing, retry state |
| `@agentsy/orchestrator` | task tiering, model request intent, failover policy orchestration |
| `@agentsy/guardrails` | routing constraints, not routing logic |
| `@agentsy/types` | optional shared routing types if needed |
| `@agentsy/core` | no routing responsibility |

## 7. Package-by-Package Implementation Plan

## 7.1 `@agentsy/gateway`

### Goal

Replace provider-centric routing with **model-tier + replica-aware routing**.

### Phase GW-0 — Delete incorrect abstractions

| Task | Description | Effort |
|---|---|---:|
| `TASK-GW-000` | Remove `ProviderTier` from all gateway types and strategy code | 1h |
| `TASK-GW-001` | Remove provider-tier docs/tests/config references | 1h |
| `TASK-GW-002` | Fail build if provider-tier remains referenced | 0.5h |

### Phase GW-1 — Model and replica foundation

| Task | Description | Effort |
|---|---|---:|
| `TASK-GW-003` | Define `LogicalModel` and canonical `ModelTier` types | 1h |
| `TASK-GW-004` | Define `ModelReplica` and replica identity model | 1h |
| `TASK-GW-005` | Build `LogicalModelRegistry` indexed by tier/useCase/alias | 1.5h |
| `TASK-GW-006` | Build `ReplicaRegistry` indexed by logical model/provider | 1.5h |

### Phase GW-2 — Local discovery and health

| Task | Description | Effort |
|---|---|---:|
| `TASK-GW-007` | Implement `LocalModelDetector` for Apfel, Ollama, Jan | 2h |
| `TASK-GW-008` | Add optional backend adapters for LM Studio, LocalAI, vLLM | 2h |
| `TASK-GW-009` | Implement `ModelAvailabilityTracker` with TTL + cooldowns | 1.5h |

### Phase GW-3 — Replica scoring and selection

| Task | Description | Effort |
|---|---|---:|
| `TASK-GW-010` | Encode local preference policy by tier | 1h |
| `TASK-GW-011` | Implement quota-aware replica scoring | 2h |
| `TASK-GW-012` | Implement `selectReplicaForLogicalModel` | 1.5h |
| `TASK-GW-013` | Implement `selectModelForTier` | 1.5h |
| `TASK-GW-014` | Implement same-model spillover and same-tier fallback chain | 1.5h |

### Phase GW-4 — Client API and diagnostics

| Task | Description | Effort |
|---|---|---:|
| `TASK-GW-015` | Make gateway client model-centric (`callByTier`, `callLogicalModel`, `callReplica`) | 1.5h |
| `TASK-GW-016` | Emit routing diagnostics and rejection reasons | 1h |
| `TASK-GW-017` | Rewrite gateway README/docs to be model-tier/replica-aware only | 1h |

### Gateway acceptance criteria

- no provider-tier abstraction remains
- same logical model can route across multiple replicas
- local replicas preferred only for micro/small tasks
- unhealthy or quota-starved replicas are skipped
- routing decisions are explainable

## 7.2 `@agentsy/tokenomics`

### Goal

Provide gateway with **replica-specific headroom** and track usage at the correct granularity.

### Phase TKN-0 — Identity normalization

| Task | Description | Effort |
|---|---|---:|
| `TASK-TKN-000` | Normalize usage identity to `logicalModelId`, `replicaId`, `providerId`, `accountId` | 1h |

### Phase TKN-1 — Replica budgets and windows

| Task | Description | Effort |
|---|---|---:|
| `TASK-TKN-001` | Define `ReplicaBudget` | 1h |
| `TASK-TKN-002` | Aggregate usage by replica over rolling hour/week/month windows | 1.5h |
| `TASK-TKN-003` | Compute `ReplicaQuotaSnapshot` headroom | 1.5h |

### Phase TKN-2 — Gateway-facing routing signals

| Task | Description | Effort |
|---|---|---:|
| `TASK-TKN-004` | Build headroom provider API for gateway | 1h |
| `TASK-TKN-005` | Merge provider-header and tokenomics-derived quota truth with confidence labels | 1.5h |
| `TASK-TKN-006` | Add saturation/skew signals for same-model replicas | 1h |

### Phase TKN-3 — Ledger and reporting updates

| Task | Description | Effort |
|---|---|---:|
| `TASK-TKN-007` | Extend session ledger to record logical model, replica, and failover chain | 1h |
| `TASK-TKN-008` | Expose replica headroom and hot-replica diagnostics in reports | 1h |

### Tokenomics acceptance criteria

- usage can be aggregated by replica
- headroom is available for hour/week/month
- gateway can query replica headroom directly
- same-model replica skew is observable

## 7.3 `@agentsy/runtime`

### Goal

Emit enough lifecycle to support replica-aware routing and deterministic retries.

### Phase RT-1 — Lifecycle events

| Task | Description | Effort |
|---|---|---:|
| `TASK-RT-001` | Add `PreModelCall`, `PostModelCall`, `ModelCallFailed`, `ModelReplicaSwitched` events | 1.5h |
| `TASK-RT-002` | Include logical model, replica, provider, estimated and actual usage in events | 1h |

### Phase RT-2 — Routing-aware state

| Task | Description | Effort |
|---|---|---:|
| `TASK-RT-003` | Extend checkpoint metadata with routing state | 1h |
| `TASK-RT-004` | Extend interruption/resume metadata with attempted replicas and escalation state | 1h |
| `TASK-RT-005` | Add retry-aware execution context for failover chains | 1h |

### Runtime acceptance criteria

- routing lifecycle events are emitted for every model call
- checkpoints preserve model/replica/failover state
- resumed sessions avoid already failed replicas

## 7.4 `@agentsy/orchestrator`

### Goal

Task tiering + gateway delegation only. No provider knowledge.

### Phase ORCH-1 — Tier and routing interface

| Task | Description | Effort |
|---|---|---:|
| `TASK-ORCH-001` | Define `TaskTier = ModelTier` | 0.5h |
| `TASK-ORCH-002` | Implement `GatewayBackedModelRouter` | 1h |

### Phase ORCH-2 — Failover policy

| Task | Description | Effort |
|---|---|---:|
| `TASK-ORCH-003` | Encode failover order: next replica → same-tier next model → optional tier escalation | 1.5h |
| `TASK-ORCH-004` | Record routing intent in execution state | 1h |
| `TASK-ORCH-005` | Integrate recovery path with gateway excluding prior attempts | 1h |
| `TASK-ORCH-006` | Enforce no duplicate routing facts in orchestrator | 0.5h |

### Orchestrator acceptance criteria

- orchestrator never routes by provider
- orchestrator requests by tier and use case only
- fallback order is deterministic and testable

## 7.5 `@agentsy/guardrails`

### Goal

Provide constraints, not routing behavior.

### Phase GR-1 — Routing constraints

| Task | Description | Effort |
|---|---|---:|
| `TASK-GR-001` | Add routing-relevant policy constraints (`local-only`, `excludeProviders`, `requireReasoning`, `requireJsonMode`) | 1h |
| `TASK-GR-002` | Emit contestable denial reasons when no route satisfies policy | 0.5h |

### Guardrails acceptance criteria

- policies can constrain gateway selection
- guardrails do not contain routing logic

## 8. Routing Algorithm

### 8.1 Selection order

1. task → `TaskTier`
2. `TaskTier` → candidate logical models
3. logical model → candidate replicas
4. replicas filtered by:
   - health
   - policy constraints
   - capability constraints
   - quota headroom
5. replicas scored
6. best replica selected
7. on failure:
   - next replica for same logical model
   - next logical model in same tier
   - next tier only if orchestrator policy allows

### 8.2 Local-first policy

```text
if taskTier in {micro, small}:
    strong local bonus
elif taskTier == mid:
    small local bonus
else:
    no local bonus
```

### 8.3 Quota-aware balancing

For replicas serving the same logical model, rank by:

- highest headroom
- acceptable latency
- lowest error rate
- lowest cost
- tie-break with round-robin to avoid hot-spotting

## 9. Testing Plan

### 9.1 Unit tests

## Gateway

- logical model registry indexes correctly
- replica registry indexes correctly
- local detector discovers Apfel/Ollama/Jan
- availability tracker respects TTL and cooldown
- local bonus changes by tier
- quota-aware scoring prefers higher-headroom replica
- selector chooses another replica for same logical model when one is near exhaustion

## Tokenomics

- usage aggregates by hour/week/month
- replica headroom computed correctly
- confidence labels correct after header reconciliation

## Runtime

- model call lifecycle events emitted
- checkpoint stores attempted replicas
- interruption/resume preserves failover chain

## Orchestrator

- task tier delegated to gateway
- failover order correct
- no direct provider logic

### 9.2 Integration tests

1. same logical model, two cloud accounts; one near hourly cap → other replica chosen
2. same logical model, local + cloud; small task → local chosen
3. frontier task with local available → cloud frontier chosen
4. selected replica errors → next replica chosen and checkpoint updated
5. local-only policy with no local available → clean denial

### 9.3 End-to-end tests

Full session with:

- task decomposition
- gateway selection
- runtime events
- tokenomics usage recording
- retry on alternate replica
- final ledger entry including replica/fallback metadata

## 10. Acceptance Criteria

### Functional

- same logical model routes across multiple provider/accounts
- hour/week/month headroom influences selection
- local replicas are preferred for micro/small
- frontier tasks do not inherit a local bias
- retry avoids already failed replicas
- orchestrator requests by tier, not provider
- tokenomics tracks usage by replica

### Architectural

- no provider-tier abstraction remains
- no compat layer exists
- orchestrator does not own routing facts
- gateway is the single routing authority
- tokenomics is the single headroom authority

### Observability

- routing decisions explainable
- fallback chain visible
- quota influence visible
- local/cloud decision visible

## 11. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| stale quota info | reconcile header-derived and accounting-derived values |
| local probes unreliable | TTL caching + cooldowns + health confidence |
| score weights mis-tuned | keep weights configurable and test against fixtures |
| routing logic leaks into orchestrator | enforce gateway-only selection APIs |
| circular dependencies | keep shared types minimal or centralize carefully |

## 12. Suggested File Layout

### Gateway

```text
packages/gateway/src/
├── types.ts
├── logical-models.ts
├── model-registry.ts
├── replica-registry.ts
├── replica-selector.ts
├── local-detector.ts
├── availability-tracker.ts
├── quota-headroom.ts
├── spillover.ts
├── score/
│   ├── compute-replica-score.ts
│   ├── local-bonus.ts
│   └── tier-policy.ts
└── client.ts
```

### Tokenomics

```text
packages/tokenomics/src/
├── quotas/
│   ├── replica-budget.ts
│   ├── usage-aggregator.ts
│   ├── headroom.ts
│   └── windows.ts
├── routing/
│   └── headroom-provider.ts
└── ledger/
    └── types.ts
```

### Runtime

```text
packages/runtime/src/
├── hooks/
│   ├── types.ts
│   └── registry.ts
├── checkpoint.ts
└── interruption.ts
```

### Orchestrator

```text
packages/orchestrator/src/
├── intelligence/
│   └── model-router.ts
├── recovery/
│   └── model-failover.ts
└── types/
    └── routing.ts
```

## 13. Effort Summary

| Package | Tasks | Effort |
|---|---:|---:|
| gateway | 18 | 17–20h |
| tokenomics | 9 | 8–10h |
| runtime | 5 | 4–5h |
| orchestrator | 6 | 4–5h |
| guardrails | 2 | 1–2h |
| docs/tests | — | 4–6h |

**Total:** ~38–48h

## 14. Compatibility Statement

This plan assumes **zero backwards compatibility requirements**.

Therefore:

- incorrect abstractions are removed, not adapted
- no deprecation shims are added
- no transitional APIs are introduced
- all docs/tests target the final architecture only

## 15. Supersession Note

This document supersedes the current greenfield routing plan and any phase-local plan text that still frames routing in terms of provider-tier or backend-specific offload semantics.

Phase 16, 17, and 20 remain useful as source material, but this document is the canonical implementation authority for routing, replica balancing, and local-first lightweight execution.
