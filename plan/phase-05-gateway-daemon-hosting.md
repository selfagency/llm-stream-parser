
## 10. Phase 5 — Gateway Daemon Hosting & Independent Package ✅ COMPLETE

**Status**: Landed on `develop` (branch `feat/gateway-daemon-hosting` merged via PR #128).
**Story points**: 6 (actuals reconciled at merge).
**Priority**: P1 — Sprint 2
**Branch**: `feat/gateway-daemon-hosting`
**Depends on**: Phase 1 ✅ (daemon foundation; `ServiceHost` lifecycle, `UnifiedDB`)
**Unblocks**: Phase 6 (streaming needs routing decisions in the daemon), Phase 14 (ACP agent needs routing), Phase 20 (provider-ethics policy hooks into the gateway's `RoutingRequest` filter chain)
**Closes**: nothing from the guardrails gap analysis; structurally fixes the Phase 0.5 quota map bug permanently

### 10.1 Design principle: gateway is a library, daemon is a host

The `@agentsy/gateway` package is **not** gutted into a thin IPC client. It remains a standalone, reusable library that any agentic platform can consume directly. The daemon *hosts* the gateway — it instantiates the gateway's routing classes, manages their lifecycle, and adds `UnifiedDB`-backed persistence. External consumers can use the gateway without the daemon, with in-memory defaults.

**Three consumer profiles**:

| Consumer | How they use the gateway | Persistence | Ethics policy |
|---|---|---|---|
| **agentsy daemon** (internal) | Daemon's `RoutingService` instantiates gateway classes + plugs in `UnifiedDB` adapters | `UnifiedDB` (survives restarts) | agentsy's `PROVIDER_ETHICS_POLICY` (Phase 20) |
| **agentsy CLI/TUI** (internal) | Optional `GatewayClient` IPC shim → calls daemon over Unix socket | Delegated to daemon | Delegated to daemon |
| **External platform** (e.g. another agentic framework) | Imports `@agentsy/gateway` as a library; calls `createGateway()` programmatically | In-memory (default) or consumer-supplied adapter | Consumer-supplied or none |

### 10.2 Current Architecture

```text
CLI → Runtime → Gateway → Providers → LLM APIs
                  ↑
           (routing, health,
            quota, circuit breaker)
```

Every CLI invocation instantiates its own gateway. Health probes run per-process. Quota tracking is per-process. There's no shared state across CLI invocations.

### 10.3 Target Architecture

```text
┌─────────────────────────────────────────────────────┐
│ @agentsy/gateway (independent reusable package)     │
│                                                      │
│  createGateway(options) → Gateway                   │
│  ├── ModelRegistry                                   │
│  ├── ReplicaRegistry + ReplicaSelector              │
│  ├── HealthRegistry                                  │
│  ├── QuotaRegistry (per-provider trackers)           │
│  ├── CircuitBreaker                                  │
│  ├── SelectionStrategy (pluggable)                   │
│  ├── ProviderEthicsPolicyHook (pluggable)            │
│  └── PersistenceAdapter (pluggable; in-memory default)│
│                                                      │
│  Public API:                                         │
│    gateway.selectModel(request) → RoutingDecision    │
│    gateway.spillover(decision) → RoutingDecision|null│
│    gateway.registerProvider(provider)                │
│    gateway.health.report() → HealthReport            │
└────────────────────────┬────────────────────────────┘
                         │ used by
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
   ┌──────────┐  ┌──────────┐  ┌──────────────────┐
   │ Daemon   │  │ CLI/TUI  │  │ External         │
   │ Routing  │  │ Gateway  │  │ Consumer         │
   │ Service  │  │ Client   │  │ (programmatic)   │
   │ (hosts + │  │ (IPC     │  │ (imports gateway │
   │  UnifiedDB│  │  shim)   │  │  as library)     │
   │  adapters)│  │          │  │                  │
   └──────────┘  └──────────┘  └──────────────────┘
```

### 10.4 Gateway package — public API and persistence interface

The gateway package gains a clean `createGateway()` factory and a `PersistenceAdapter` interface. The routing classes themselves don't change — they gain constructor-injected persistence hooks.

```typescript
// packages/gateway/src/index.ts (PUBLIC API)

export interface GatewayOptions {
  /** Persistence adapter (default: InMemoryPersistenceAdapter). */
  persistence?: PersistenceAdapter;
  /** Selection strategy (default: ScoreBasedStrategy). */
  strategy?: SelectionStrategy;
  /** Provider ethics policy hook (default: none; agentsy daemon plugs in Phase 20). */
  ethicsPolicy?: ProviderEthicsPolicyHook;
  /** Initial model definitions. */
  models?: ModelEntry[];
  /** Logger. */
  logger?: Logger;
}

export interface PersistenceAdapter {
  // Quota state — survives restarts when backed by UnifiedDB
  saveQuotaState(providerId: string, state: QuotaSnapshot): Promise<void>;
  loadQuotaState(providerId: string): Promise<QuotaSnapshot | null>;
  // Health history — for trend analysis
  saveHealthRecord(providerId: string, record: HealthRecord): Promise<void>;
  loadHealthHistory(providerId: string, since: Date): Promise<HealthRecord[]>;
  // Routing decisions — for audit
  saveRoutingDecision(decision: RoutingDecision): Promise<void>;
  // Circuit breaker state
  saveCircuitBreakerState(providerId: string, state: CircuitBreakerState): Promise<void>;
  loadCircuitBreakerState(providerId: string): Promise<CircuitBreakerState | null>;
}

export interface ProviderEthicsPolicyHook {
  /** Called during selectModel after filtering but before selection.
   *  Returns filtered candidates + any acknowledgement-required flags. */
  filter(candidates: Replica[], request: RoutingRequest): {
    candidates: Replica[];
    blockedProviders: string[];
    requiresAcknowledgement: string[];
  };
}

export function createGateway(options?: GatewayOptions): Gateway {
  const persistence = options?.persistence ?? new InMemoryPersistenceAdapter();
  const strategy = options?.strategy ?? new ScoreBasedStrategy();
  const ethicsPolicy = options?.ethicsPolicy;

  const modelRegistry = new ModelRegistry(persistence);
  const replicaRegistry = new ReplicaRegistry(persistence);
  const healthRegistry = new HealthRegistry(persistence);
  const quotaRegistry = new QuotaRegistry(persistence);  // Per-provider
  const circuitBreaker = new CircuitBreaker(persistence);

  return new Gateway({
    modelRegistry, replicaRegistry, healthRegistry,
    quotaRegistry, circuitBreaker, strategy, ethicsPolicy, persistence,
  });
}

export class Gateway {
  async selectModel(request: RoutingRequest): Promise<RoutingDecision> {
    // 1. Filter by tier, capabilities, cost (units now correct post-Phase-0.4)
    let candidates = this.modelRegistry.filter({
      tier: request.tier,
      capabilities: request.capabilities,
      maxCostPer1MInput: request.maxCostPer1KInput
        ? request.maxCostPer1KInput * 1000 : undefined,
    });

    // 2. Apply ethics policy (Phase 20 hook — pluggable, optional)
    if (this.ethicsPolicy) {
      const ethicsResult = this.ethicsPolicy.filter(candidates, request);
      candidates = ethicsResult.candidates;
      // Blocked providers removed; acknowledgement flags attached to decision
    }

    // 3. Get healthy replicas with per-provider quota (fixes E-0.5 structurally)
    const healthy = this.healthRegistry.healthy(candidates);
    const quotaOk = healthy.filter(r =>
      this.quotaRegistry.getTracker(r.providerId)?.canRequest() ?? true
    );

    // 4. Score-based selection
    const decision = this.strategy.select(quotaOk, request);

    // 5. Persist decision for audit
    await this.persistence.saveRoutingDecision(decision);

    return decision;
  }

  async spillover(routing: RoutingDecision): Promise<RoutingDecision | null> {
    // Same-tier spillover when the selected replica fails
  }

  async registerProvider(provider: ProviderConfig): Promise<void> {
    // Register a provider + its replicas
  }

  async healthReport(): Promise<HealthReport> {
    // Aggregate health status for diagnostics
  }
}
```

### 10.5 Daemon's RoutingService — hosts the gateway + plugs in UnifiedDB

The daemon's `RoutingService` is a thin host that instantiates `createGateway()` with `UnifiedDB`-backed persistence and agentsy's `PROVIDER_ETHICS_POLICY`. It does **not** reimplement routing logic.

```typescript
// packages/daemon/src/services/routing-service.ts

import { createGateway, type Gateway, type PersistenceAdapter } from '@agentsy/gateway';

export class RoutingService implements Service {
  readonly name = 'routing';
  private _state: ServiceState = 'stopped';
  private gateway: Gateway | null = null;

  constructor(private deps: {
    db: UnifiedDB;
    serviceHost: ServiceHost;
    ethicsPolicy?: ProviderEthicsPolicyHook;  // From Phase 20
  }) {}

  async start(): Promise<void> {
    this._state = 'starting';

    // Create UnifiedDB-backed persistence adapter
    const persistence = new UnifiedDBPersistenceAdapter(this.deps.db);

    // Instantiate the gateway library with daemon-backed persistence + ethics policy
    this.gateway = createGateway({
      persistence,
      ethicsPolicy: this.deps.ethicsPolicy,  // Phase 20's PROVIDER_ETHICS_POLICY
    });

    // Load model definitions from config
    await this.loadModels();

    // Restore quota + circuit-breaker state from UnifiedDB
    await this.restoreState();

    this._state = 'active';
  }

  async selectModel(request: RoutingRequest): Promise<RoutingDecision> {
    this.deps.serviceHost.touch('routing');
    return this.gateway!.selectModel(request);
  }

  async spillover(routing: RoutingDecision): Promise<RoutingDecision | null> {
    return this.gateway!.spillover(routing);
  }

  async sleep(): Promise<void> { this._state = 'sleeping'; }
  async wakeup(): Promise<void> { this._state = 'active'; }

  async stop(): Promise<void> {
    // Flush state to UnifiedDB
    await this.gateway?.flush();
    this._state = 'stopped';
  }

  get gatewayInstance(): Gateway | null {
    // Exposed for other daemon services that need direct gateway access
    return this.gateway;
  }
}
```

```typescript
// packages/daemon/src/services/unified-db-persistence-adapter.ts (NEW)

import type { PersistenceAdapter } from '@agentsy/gateway';

export class UnifiedDBPersistenceAdapter implements PersistenceAdapter {
  constructor(private db: UnifiedDB) {}

  async saveQuotaState(providerId: string, state: QuotaSnapshot): Promise<void> {
    await this.db.execute(
      `INSERT INTO daemon_quota_state (provider_id, state_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(provider_id) DO UPDATE SET state_json = ?, updated_at = ?`,
      [providerId, JSON.stringify(state), new Date().toISOString(),
       JSON.stringify(state), new Date().toISOString()]
    );
  }

  async loadQuotaState(providerId: string): Promise<QuotaSnapshot | null> {
    const row = await this.db.querySingle<{ state_json: string }>(
      'SELECT state_json FROM daemon_quota_state WHERE provider_id = ?', [providerId]
    );
    return row ? JSON.parse(row.state_json) : null;
  }

  async saveRoutingDecision(decision: RoutingDecision): Promise<void> {
    await this.db.execute(
      `INSERT INTO daemon_routing_decisions (id, decision_json, timestamp)
       VALUES (?, ?, ?)`,
      [decision.id, JSON.stringify(decision), new Date().toISOString()]
    );
  }

  // ... other methods
}
```

### 10.6 Optional GatewayClient IPC shim (for CLI/TUI)

For agentsy's own CLI and TUI that connect to the daemon, an optional `GatewayClient` provides the same `Gateway` interface but delegates to the daemon over IPC. This is a convenience — external consumers don't use it.

```typescript
// packages/gateway/src/client.ts (NEW — optional IPC shim)

import type { Gateway, RoutingRequest, RoutingDecision } from './index.js';

export class GatewayClient implements Gateway {
  constructor(private ipc: IPCClient) {}

  async selectModel(request: RoutingRequest): Promise<RoutingDecision> {
    return this.ipc.call('routing.selectModel', request);
  }

  async spillover(routing: RoutingDecision): Promise<RoutingDecision | null> {
    return this.ipc.call('routing.spillover', routing);
  }

  async registerProvider(provider: ProviderConfig): Promise<void> {
    return this.ipc.call('routing.registerProvider', provider);
  }

  async healthReport(): Promise<HealthReport> {
    return this.ipc.call('routing.healthReport');
  }
}

/** Create a GatewayClient connected to a running daemon. */
export function connectToDaemon(socketPath: string): GatewayClient {
  const ipc = new IPCClient({ socketPath });
  return new GatewayClient(ipc);
}
```

### 10.7 External consumer usage (the point of keeping it independent)

```typescript
// Example: another agentic platform uses @agentsy/gateway as a library

import { createGateway } from '@agentsy/gateway';

// Minimal usage — in-memory persistence, no ethics policy
const gateway = createGateway({
  models: [
    { id: 'gpt-4o', provider: 'openai', tier: 'frontier', pricing: { inputPer1MTokens: 2.5, outputPer1MTokens: 10 } },
    { id: 'claude-sonnet-4', provider: 'anthropic', tier: 'frontier', pricing: { inputPer1MTokens: 3, outputPer1MTokens: 15 } },
  ],
});

const decision = await gateway.selectModel({
  tier: 'frontier',
  capabilities: ['tool-use'],
  maxCostPer1KInput: 0.005,
});

console.log(`Selected: ${decision.replica.modelId} on ${decision.replica.providerId}`);

// With custom persistence + custom ethics policy
const gateway2 = createGateway({
  persistence: new MyPostgresPersistenceAdapter(),
  ethicsPolicy: {
    filter(candidates, request) {
      // Block a provider, require ack for another
      const blocked = candidates.filter(r => r.providerId !== 'xai');
      return { candidates: blocked, blockedProviders: ['xai'], requiresAcknowledgement: [] };
    },
  },
});
```

### 10.8 Per-Provider Quota Registry

The Phase 0.5 fix added `quotaRegistry` to `RetryContext`. This phase makes `QuotaRegistry` a first-class gateway component with pluggable persistence. Each provider gets its own `QuotaTracker` instance. When the daemon hosts the gateway, quota state persists to `UnifiedDB.daemon_quota_state` and survives daemon restarts. When an external consumer uses the gateway directly, quota state is in-memory (lost on process restart) unless they supply a `PersistenceAdapter`.

### 10.9 Gateway package README and npm publication

The gateway package gets a proper README documenting:

1. **Quick start** for external consumers (the example in §10.7)
2. **PersistenceAdapter interface** for custom persistence
3. **ProviderEthicsPolicyHook** for custom ethics filtering
4. **SelectionStrategy** for custom routing strategies
5. **Daemon hosting** (how agentsy uses it — as a reference for other platforms that want daemon-hosted routing)

The package is published to npm as `@agentsy/gateway` with stable semver. Breaking changes to the public API (`createGateway`, `Gateway`, `PersistenceAdapter`, `ProviderEthicsPolicyHook`, `SelectionStrategy`) require a major version bump.

### 10.10 What shipped

**`@agentsy/gateway`** (independent reusable library):

| File | Purpose |
|------|---------|
| `src/gateway.ts` | `Gateway` class + `createGateway()` factory — `selectModel()`, `spillover()`, `registerProvider()`, `healthReport()`, `flush()` |
| `src/persistence/types.ts` | `PersistenceAdapter` interface (7 methods: quota state, health history, routing decisions, circuit breaker state) |
| `src/persistence/records.ts` | `QuotaSnapshot`, `HealthRecord`, `RoutingDecision`, `RejectedCandidate` types |
| `src/persistence/in-memory.ts` | `InMemoryPersistenceAdapter` — default adapter for standalone use |
| `src/ethics/types.ts` | `ProviderEthicsPolicyHook`, `RoutingRequest`, `EthicsFilterResult` — pluggable ethics filter interface |
| `src/gateway-client.ts` | `GatewayClientShim` — IPC shim for daemon-connected CLI/TUI consumers |
| `src/index.ts` | All new exports wired |
| `README.md` | Phase 5 Quick Start, persistence + ethics plugin docs, IPC shim docs |

**`@agentsy/daemon`** (central process):

| File | Purpose |
|------|---------|
| `src/services/routing-service.ts` | `RoutingService` — hosts `createGateway()` with `UnifiedDBPersistenceAdapter`, managed via `ServiceHost` |
| `src/services/unified-db-persistence-adapter.ts` | `UnifiedDBPersistenceAdapter` — all 7 `PersistenceAdapter` methods backed by SQLite |
| `src/db/unified-db.ts` | 4 new migration tables: `daemon_quota_state`, `daemon_routing_decisions`, `daemon_circuit_breaker_state`, `daemon_health_history` |
| `src/daemon.ts` | `RoutingService` wired into constructor + start sequence |
| `package.json` | `@agentsy/gateway: workspace:*` dependency added |

**Circuit breaker state persistence**: On daemon shutdown, `RoutingService.stop()` calls `gateway.flush()` which persists circuit-breaker state for all providers. On daemon restart, `RoutingService.start()` iterates registered providers, loads circuit-breaker state from `UnifiedDB`, and restores it via the `restoreCircuitBreakerState` chain: `Gateway` → `ProviderHealthRegistry` → `HealthTracker` → `CircuitBreaker`.

**Test coverage**: 3 new test files (30+ tests) covering Gateway class, InMemoryPersistenceAdapter, RoutingService lifecycle, and UnifiedDBPersistenceAdapter.

### 10.11 Verification

- [x] `@agentsy/gateway` package is independently consumable (no daemon dependency required)
- [x] `createGateway()` factory works with in-memory defaults
- [x] `PersistenceAdapter` interface defined; `InMemoryPersistenceAdapter` is the default
- [x] `UnifiedDBPersistenceAdapter` saves/loads quota state, health history, routing decisions, circuit-breaker state
- [x] `ProviderEthicsPolicyHook` interface defined; pluggable via `GatewayOptions.ethicsPolicy`
- [x] Daemon's `RoutingService` instantiates `createGateway()` with `UnifiedDBPersistenceAdapter` + Phase 20 ethics policy
- [x] Daemon's `RoutingService` does NOT reimplement routing logic (delegates to `Gateway`)
- [x] `GatewayClient` IPC shim provides same interface as `Gateway` over IPC
- [x] External consumer example (§10.7) works as documented
- [x] Gateway package README published with quick start, API reference, and extension points
- [x] Per-provider `QuotaRegistry` persists to `UnifiedDB` when daemon-hosted; in-memory when standalone
- [x] Routing decisions logged for audit when daemon-hosted
- [x] Daemon restart preserves quota state and circuit-breaker state
- [x] `pnpm check-types && pnpm lint && pnpm test` green across both `@agentsy/gateway` and `@agentsy/daemon`
- [x] All 11 CI checks passing (SonarCloud, Codacy, Fallow, Semgrep, Socket, Codecov, CLI E2E)

---
