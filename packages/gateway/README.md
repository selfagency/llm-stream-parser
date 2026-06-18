# @agentsy/gateway

Canonical model-routing layer for multi-provider LLM access. The gateway selects a logical model and a concrete replica, then executes through the provider transport. It adds circuit breaking, rate-limit tracking, strategy-based model selection, local-first routing, replica-aware spillover, and observability.

This is now the canonical routing spine for the repo: task tier → logical model → replica → provider transport.

## Features

> The gateway is the canonical routing spine for the repo: task tier → logical model → replica → provider transport.

- **Model-tier routing** — Tiers are defined on **models** (`ModelEntry.tier`), not providers. A single provider hosts models across all tiers. Supports `micro`, `small`, `mid`, `frontier`.
- **Local-first for lightweight tasks** — `LocalModelDetector` auto-discovers local backends (Ollama, Apfel, Jan AI). `ModelAvailabilityTracker` health-checks models with 30s TTL. Scoring gives local models a large bonus for micro/small tasks, slight preference for mid, and none for frontier.
- **Circuit breaking** — Automatic failover on provider outages via `ProviderHealthRegistry` (per-provider circuit breaker).
- **Rate limit tracking** — `QuotaTracker` wraps `@agentsy/tokenomics` and tracks per-provider RPM/TPM budgets from server response headers.
- **Routing strategies** — `round-robin`, `weighted`, `least-connections`, `latency`, `priority-fallback`, `cost-based`, `adaptive`, and `tier-aware` (legacy provider-facing path; prefer model-tier selector).
- **Active usage probing** — `ProviderProfile.usageProbes[]` (CodexBar-style) describes how to query the provider's quota endpoint.
- **Mid-conversation model switching** — `ModelSwitcher` resolves aliases (e.g. `gpt-4o`, `claude-opus-4`) to provider-specific upstream ids and updates the active model in place. CLI `/model select` wired.
- **Metrics** — `MetricsCollector` records per-(provider, model) request counts, error rates, token usage, USD cost, and latency percentiles (p50 / p95 / p99).

## Architecture: Model-Tier Routing

Tiers are defined on **models**, not providers. A single provider (e.g. OpenAI) hosts models across all tiers (`gpt-4o-mini` = small, `gpt-4o` = mid, `o1` = frontier).

```typescript
// Core types (from @agentsy/gateway)
type ModelTier = 'micro' | 'small' | 'mid' | 'frontier';

interface ModelEntry {
  id: string;                          // 'openai/gpt-4o-mini'
  providerId: string;                  // FK -> ProviderEntry.id
  modelName: string;                   // upstream API name
  tier: ModelTier;                     // THE tier — on model, not provider
  cost: ModelCost;                     // inputPer1MTokens, outputPer1MTokens
  capabilities: ModelCapabilities;     // tools, jsonMode, vision, etc.
  contextWindow: number;
  isLocal?: boolean;                   // true for ollama/apfel/jan
}
```

### Local-First Scoring

The `DefaultTierAwareModelSelector` scores candidates with a tier-aware local bonus and quota-aware replica ranking:

| Task Tier | Local Bonus | Behavior |
|-----------|-------------|----------|
| `micro` | +100 | Always prefer local (classifications, lookups) |
| `small` | +80 | Strongly prefer local (summarization) |
| `mid` | +20 | Slight local preference if capable (coding) |
| `frontier` | +0 | No preference — use best model (synthesis) |

Override via `ModelSelectionConstraints.localPreference`:

- `'preferred'` — default scoring-based
- `'required'` — throws if no local model available
- `'disabled'` — cloud only

### Availability Tracking

`ModelAvailabilityTracker` health-checks all models every 30 seconds. Local models are probed via their provider endpoint; cloud models are assumed available unless a stale failure exists. Replica cooldown and stale failure state are considered during scoring.

### Local Model Detection

`LocalModelDetector` probes well-known localhost endpoints at startup:

| Backend | Default URL | Endpoint |
|---------|-------------|----------|
| Ollama | `localhost:11434` | `/api/tags` |
| Apfel | `localhost:8080` | `/health` |
| Jan AI | `localhost:1337` | `/v1/models` |

Model tier is inferred from model name size heuristics (`1b` → micro, `7b` → small, `70b` → mid).

## Public surface

```typescript
// Client
createLoadBalancedClient(config, options?): LoadBalancedClient;

// Model-tier routing (new)
ModelTier, ModelEntry, ModelCost, ModelCapabilities,
ModelSelectionConstraints, TierAwareModelSelector,
DefaultTierAwareModelSelector,
ModelRegistry, modelRegistry,
ModelAvailabilityTracker, ModelAvailability,
LocalModelDetector,
GatewayClient;

// Strategies
createStrategy(name, options?): RoutingStrategy;
RoundRobinStrategy, WeightedStrategy, LeastConnectionsStrategy,
LatencyBasedStrategy, PriorityFallbackStrategy, CostBasedStrategy,
AdaptiveStrategy, TierAwareStrategy, buildTierOf;

// Health + circuit breaking
ProviderHealthRegistry, CircuitBreaker, HealthTracker, LatencyTracker;

// Quota
QuotaTracker, QuotaTrackerRegistry, parseRateLimitHeaders,
RateLimitHeaderSnapshot;

// Probes (CodexBar-style descriptors)
runProbe, defaultApiParse, ProbeContext, probeProvider, probesAreEmpty;

// Retry / failover
retryWithFailover, RetryWithFailoverContext, RetryWithFailoverOptions,
buildStrategy, AllProvidersExhaustedError, ProviderFailureDetail;

// Local providers
registerLocalProviders, LocalPlatformProfile, LocalAccelerator,
LocalBackendProfile, LOCAL_BACKEND_PROFILES;

// Model switching
ModelSwitcher, ModelSwitchConfig, ModelSwitcherOptions, ModelInfo;

// Metrics
MetricsCollector, MetricsSnapshot, ProviderAggregate, LatencyPercentiles,
RequestMetric, TokenCounts;

// Config
LoadBalancerConfig, LoadBalancerConfigSchema, ProviderEntry,
ProviderEntrySchema, RoutingState, ProviderStatus, ProviderStatusSchema,
StrategyName, StrategyNameSchema, ProviderUsageSnapshot;
```

## Migration from `UniversalClient`

```typescript
// Before
import { createUniversalClient } from '@agentsy/providers';
const client = createUniversalClient({ provider: 'openai', apiKey });

// After
import { createLoadBalancedClient } from '@agentsy/gateway';
const client = createLoadBalancedClient({
  providers: [{ id: 'openai-main', name: 'OpenAI', provider: 'openai', apiKey }],
  strategy: 'adaptive'  // default
});
```

The returned `LoadBalancedClient` extends `UniversalClient`, so existing call sites work unchanged. New methods:

- `getRoutingState()` — `{ strategy, providerId, providerStatus, providerCount }`
- `getUsageSnapshot()` — per-provider RPM/TPM/latency/error rate
- `getMetricsSnapshot()` — aggregated metrics across all providers
- `getMetricsProviderAggregate(providerId)` — single-provider metrics
- `getModelSelector()` — `TierAwareModelSelector` for orchestrator integration
- `createModelSwitcher()` — alias-based model switching
- `markProviderHealthy(id)` / `markProviderUnhealthy(id)` — manual control
- `shutdown()` — release resources

## Routing strategy selection

| Strategy | When to use |
| --- | --- |
| `adaptive` | Production default. Composite score from health, latency, quota, and cost. |
| `round-robin` | Load distribution across equal providers. |
| `weighted` | Capacity-weighted distribution. |
| `least-connections` | Burst protection; routes to the provider with the fewest in-flight requests. |
| `latency` | Pick the provider with the lowest recorded latency. |
| `priority-fallback` | Try providers in declared order; first eligible wins. |
| `cost-based` | Pick the lowest cost per 1K input tokens. |
| `tier-aware` | Filter by provider-level complexity bucket (legacy — prefer `DefaultTierAwareModelSelector`). |

## Replica-aware model selection (orchestrator integration)

```typescript
import { DefaultTierAwareModelSelector } from '@agentsy/gateway';

const selector = new DefaultTierAwareModelSelector();

// Select a model for a code task at the 'mid' tier
const model = await selector.selectModelForTier({
  tier: 'mid',
  useCase: 'code',
  constraints: {
    requireTools: true,
    localPreference: 'preferred'  // local preferred only for lightweight tasks
  }
});
// model.id may be a local or cloud replica depending on quota/health
```

## Local provider registration

```typescript
import { registerLocalProviders, type LocalPlatformProfile } from '@agentsy/gateway';

const profile: LocalPlatformProfile = {
  accelerators: [
    { id: 'ollama', available: true, baseUrl: 'http://nas.lan:11434/v1' },
    { id: 'apfel', available: true }
  ]
};

const entries: ProviderEntry[] = [{ id: 'openai', name: 'OpenAI', provider: 'openai' }];
const { registered, providers } = registerLocalProviders(profile, entries, {
  preferProvider: 'apfel'
});
// entries is now: [openai, local-apfel, local-ollama]
```

## Model-Centric Client API

The gateway is the **single routing authority** — it owns all model-selection and replica-selection logic. The orchestrator requests by tier and use case only; the gateway resolves the best model and replica.

Three invocation methods provide increasing levels of control:

### `callByTier(tier, useCase, request)`

Let the gateway select the best logical model and replica for a given capability tier and use case. Ideal for normal task execution.

```typescript
import { createModelGatewayClient } from '@agentsy/gateway';

const client = createModelGatewayClient({ /* registries, selectors, transport */ });

const { response, selection } = await client.callByTier('mid', 'code', {
  messages: [{ role: 'user', content: 'Refactor this function' }]
});

console.log(selection.selectedBecause);
// ["Model selected by tier-aware selector for tier=mid, useCase=code",
//  "Replica selected by replica scorer"]
```

### `callLogicalModel(logicalModelId, request)`

Pin a specific logical model (e.g. `claude-sonnet-4`, `gpt-4o-mini`) but let the gateway select the best available replica. Use when you know which model you need.

```typescript
const { response, selection } = await client.callLogicalModel('claude-sonnet-4', {
  messages: [{ role: 'user', content: 'Explain quantum computing' }]
});
// Gateway picks the best replica for claude-sonnet-4
```

### `callReplica(replicaId, request)`

Pin a specific replica — a particular provider account or local backend. No model or replica selection occurs. Use for debugging, testing, or explicit routing.

```typescript
const { response, selection } = await client.callReplica(
  'anthropic-main/claude-sonnet-4',
  { messages: [{ role: 'user', content: 'Hello' }] }
);
// Direct invocation — no selection overhead
```

### Selection result

All three methods return a `ModelSelectionResult` alongside the completion response:

```typescript
interface ModelSelectionResult {
  logicalModelId: string;      // "claude-sonnet-4"
  replicaId: string;           // "anthropic-main/claude-sonnet-4"
  providerId: string;          // "anthropic-main"
  selectedBecause: string[];   // Human-readable reasons
  rejectedCandidates: Array<{  // Other candidates and why they lost
    id: string;
    reasons: string[];
  }>;
}
```

This makes every routing decision **explainable** — the consumer can see which model was chosen, which replica, and why all other candidates were rejected.

### How the client interacts with the routing stack

| Method | Model Selection | Replica Selection | Use Case |
|---|---|---|---|
| `callByTier` | Tier-aware selector picks model | Replica scorer picks best replica | Normal execution |
| `callLogicalModel` | Skips (model specified) | Replica scorer picks best replica | Known model, best replica |
| `callReplica` | Skips (replica specified) | Skips — direct pin | Debug/testing/explicit |

For `callByTier`, the flow is:

1. Tier-aware selector resolves `(tier, useCase)` → candidate models
2. Replica registry resolves logical model → candidate replicas
3. Replica selector scores replicas (health, quota, latency, cost, local bonus)
4. Provider transport executes against the winning replica
5. Failover chain: next replica → next same-tier model → tier escalation (if policy allows)

## Subpath exports

The gateway re-exports from `@agentsy/providers` and `@agentsy/tokenomics` for the bits it depends on:

- `createLoadBalancedClient` (the main entry)
- `TierAwareStrategy`, `AdaptiveStrategy`, etc. (strategies)
- `registerLocalProviders` (local provider registration)
- `ModelSwitcher` (mid-conversation switching)
- `MetricsCollector` (observability)
- `DefaultTierAwareModelSelector` (model-tier routing)
- `ModelAvailabilityTracker` (health checking)
- `LocalModelDetector` (backend discovery)
- `ReplicaRegistry` (same-model, multi-provider routing)
- `ReplicaQuotaSnapshot` / headroom signals (tokenomics-driven selection)
- `ReplicaRegistry` (index replicas by logical model and provider)
- `DefaultReplicaSelector` (filter + score + rank replicas)
- `computeReplicaScore` (tunable scoring formula)
- `spillover` (failover chain: same replica → same tier → escalate)

## Phase 5 — Reusable Gateway Library (New API)

The gateway is now a **standalone, reusable library** that any agentic platform can consume directly. The daemon *hosts* the gateway with `UnifiedDB`-backed persistence; external consumers use the library with in-memory defaults.

### Quick Start (External Consumer)

```typescript
import { createGateway } from '@agentsy/gateway';
import { createProviderRegistry } from '@agentsy/gateway';

const gateway = createGateway({
  strategy: 'adaptive',
  providers: [
    { id: 'openai', name: 'OpenAI', provider: openaiProvider, model: 'gpt-4o' },
    { id: 'anthropic', name: 'Anthropic', provider: anthropicProvider, model: 'claude-sonnet-4' },
  ],
});

const decision = await gateway.selectModel({ tier: 'frontier' });
console.log(`Selected: ${decision.providerId}/${decision.modelId}`);
```

### Pluggable Persistence

By default, state is in-memory. Supply a `PersistenceAdapter` for restart-safe operation:

```typescript
import { createGateway, type PersistenceAdapter } from '@agentsy/gateway';

class MyPostgresAdapter implements PersistenceAdapter {
  async saveQuotaState(providerId: string, state: QuotaSnapshot): Promise<void> { /* ... */ }
  async loadQuotaState(providerId: string): Promise<QuotaSnapshot | null> { /* ... */ }
  // ... other methods
}

const gateway = createGateway({ persistence: new MyPostgresAdapter() });
```

### Pluggable Ethics Policy

Filter providers based on ethical rules. The agentsy daemon uses this for its `PROVIDER_ETHICS_POLICY` (Phase 20):

```typescript
import { createGateway, type ProviderEthicsPolicyHook } from '@agentsy/gateway';

const gateway = createGateway({
  ethicsPolicy: {
    filter(candidates, request) {
      // Block a provider, require ack for another
      const blocked = candidates.filter(r => r.providerId !== 'xai');
      return {
        candidates: blocked,
        blockedProviders: ['xai'],
        requiresAcknowledgement: [],
      };
    },
  },
});
```

### GatewayClient IPC Shim (Daemon-Connected)

For CLI/TUI consumers that connect to a running daemon:

```typescript
import { GatewayClientShim } from '@agentsy/gateway';
// Works with the daemon's IPCClient
const client = new GatewayClientShim(ipcClient);
const decision = await client.selectModel({ tier: 'mid' });
```

### New Exports

- `createGateway(options?)` — Factory function
- `Gateway` — Main routing class
- `GatewayOptions` — Factory options (persistence, strategy, ethicsPolicy, providers, logger)
- `PersistenceAdapter` — Interface for custom persistence
- `InMemoryPersistenceAdapter` — Default in-memory adapter
- `HealthRecord`, `QuotaSnapshot`, `RoutingDecision` — Persistence record types
- `ProviderEthicsPolicyHook` — Pluggable ethics filter
- `RoutingRequest` — Model selection request
- `EthicsFilterResult` — Ethics filter result
- `GatewayClientShim` — IPC client that delegates to daemon
- `GatewayIPCClient` — Minimal IPC client interface
