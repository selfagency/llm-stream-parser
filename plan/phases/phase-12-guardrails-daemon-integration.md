

## 17. Phase 12 — Guardrails Daemon Integration

**Priority**: P0 — Sprint 6
**Story points**: 5
**Branch**: `feat/guardrails-daemon-integration`
**Depends on**: Phase 1 ✅ (daemon, `UnifiedDB`), Phase 4 ✅ (audit logger)
**Unblocks**: Phase 13 (release gate requires guardrails wired into the daemon)
**Closes findings**: E-21

> **🛑 BLOCK GATE**: No first-party agent template may ship until this phase is complete and Phase 13's release-gate script passes in CI.


> ⚠️ **2026-06-17 Audit Finding — Memory IPC Stubs**: The daemon's `memory.recall`, `memory.capture`,
> and `memory.search` IPC handlers are currently stubs (return `{ recalled: true }` etc.). Phase 12
> must wire the injected `MemoryEngine` to these handlers in addition to the guardrails integration.
> The `MemoryEngine` is already passed via `DaemonDeps.memoryEngine` — this is a wiring gap, not an
> architectural gap.

### 17.1 Finding E-21 — `@agentsy/daemon` has no guardrails integration

- **Severity**: CRITICAL
- **Files**: `packages/daemon/src/daemon.ts` (entire file), `packages/daemon/src/ipc/server.ts`, `packages/daemon/package.json` (no `@agentsy/guardrails` dependency)
- **Policy requirement**: `GOVERNANCE.md` §Safety enforcement: *"No first-party agentsy template, agent, or app may ship unless it satisfies all of the following: Anti-sycophancy and anti-anthropomorphism modules are enabled by default... Auditable records of policy selection and policy firing are produced at runtime."*
- **Implementation**: The daemon package — which is the central long-lived process owning all agent execution — has zero guardrails integration. Its IPC handlers accept unvalidated `Record<string, unknown>` and cast with `as string` / `as unknown as SubprocessSpec`.
- **Why it matters**: Every guardrail commitment in `SAFETY.md` is moot if the daemon doesn't invoke the guardrails. The runtime package has the wiring, but the daemon doesn't use the runtime. As shipped, an agent running in the daemon bypasses every guardrail.
- **Recommended fix**:

**Step 1**: Add `@agentsy/guardrails` and `@agentsy/runtime` as dependencies of `@agentsy/daemon`:

```json
// packages/daemon/package.json
{
  "dependencies": {
    "@agentsy/guardrails": "workspace:*",
    "@agentsy/runtime": "workspace:*",
    // ... existing deps
  }
}
```

**Step 2**: In `Daemon.start()`, after the IPC server starts, instantiate a `GuardrailPipeline` with `createBuiltinScanners()` plus all Phase 9/10/11 scanners. Register it via `registerBuiltinGuardrails(this.hookRegistry, pipelines)`.

```typescript
// packages/daemon/src/daemon.ts (UPDATED)

export class Daemon {
  private hookRegistry: HookRegistry;  // interface, not class
  private guardrailPipeline: GuardrailPipeline;
  private auditLogger: AuditLogger;

  async start(): Promise<void> {
    // ... existing startup (UnifiedDB, IPC server, etc.)

    // Wire guardrails
    this.auditLogger = new SqliteAuditLogger(this.db);  // Persists to UnifiedDB.guardrail_decisions
    this.guardrailPipeline = new GuardrailPipeline({
      scanners: [
        ...createBuiltinScanners(),                    // 7 original security scanners
        new SycophancyScanner(),                        // Phase 9
        new AnthropomorphismScanner(),                  // Phase 9
        new DependencyScanner(),                        // Phase 9
        new HighRiskDomainScanner(),                    // Phase 9
        new DarkPatternScanner(),                       // Phase 9
        new PrivacyScanner(),                           // Phase 9
        new AGIFramingScanner(),                        // Phase 9
        new ProfessionalDisplacementScanner(),          // Phase 9
        new BiasScanner(),                              // Phase 9
        new RetrievalFirewallScanner(),                 // Phase 10
        new MemoryPoisoningScanner(),                   // Phase 10
        new ActionScanner(),                            // Phase 10
        new EgressScanner(),                            // Phase 10
        new InteractionSafeguardsScanner(),             // Phase 10
        new CrisisEscalationScanner(),                  // Phase 10
        new ScopeDriftScanner(),                        // Phase 10
        new ScopeDeclarationScanner(),                  // Phase 11
        new RequestClassifierScanner(),                 // Phase 11
      ],
      auditLogger: this.auditLogger,
    });

    this.hookRegistry = createRuntimeHookRegistry();  // factory function, not class constructor
    registerBuiltinGuardrails(this.hookRegistry, [this.guardrailPipeline]);
  }
}
```

**Step 3**: Route every IPC handler through the hook registry:

```typescript
// packages/daemon/src/ipc/handlers.ts (UPDATED)

// agent.spawn → UserPromptSubmit-equivalent
ipcServer.register('agent.spawn', async (params) => {
  const result = await this.hookRegistry.fire('UserPromptSubmit', {
    sessionId: params.sessionId,
    prompt: params.prompt,
    scope: params.scope,
  });

  if (result.stopped) {
    return { error: { code: -32005, message: 'Guardrail blocked', data: result.stoppedBy } };
  }

  // Use the (possibly transformed) payload
  return this.agentHost.spawn({ ...params, prompt: result.payload.prompt });
});

// process.spawn → PreToolCall
ipcServer.register('process.spawn', async (params) => {
  const result = await this.hookRegistry.fire('PreToolCall', {
    sessionId: params.sessionId,
    toolName: params.spec.command,
    args: params.spec.args,
  });

  if (result.stopped) {
    return { error: { code: -32005, message: 'Guardrail blocked tool call', data: result.stoppedBy } };
  }

  return this.subprocessManager.spawnProcess(result.payload.args);
});

// stream.start → PreResponse (output guardrails run on streamed chunks)
ipcServer.register('stream.start', async (params) => {
  // Pre-response hook fires before the LLM call
  await this.hookRegistry.fire('PreResponse', { sessionId: params.sessionId });

  // The output guardrails run on each chunk via the StreamManager (Phase 6)
  return this.streamManager.startStream(params);
});
```

**Step 4**: Add a `DaemonConfig.guardrails` config section:

```typescript
// packages/daemon/src/config/schema.ts (UPDATED)

export interface DaemonConfig {
  // ... existing fields
  guardrails?: {
    enabled: boolean;
    configPath?: string;                 // Path to a GuardrailsConfig YAML file
    auditLogPath?: string;               // Override default UnifiedDB persistence
    metricsThresholds?: Partial<Record<MetricKey, number>>;
  };
}
```

**Step 5**: Persist audit logs to `UnifiedDB.guardrail_decisions`:

```sql
-- Migration in packages/daemon/src/db/migrations/00X_guardrail_decisions.sql

CREATE TABLE guardrail_decisions (
  id TEXT PRIMARY KEY,
  policy_id TEXT NOT NULL,
  decision TEXT NOT NULL,                -- pass|block|transform|quarantine|escalate|allow-with-approval
  reason_code TEXT NOT NULL,
  risk_tier TEXT NOT NULL,               -- low|moderate|high|prohibited
  surface TEXT NOT NULL,                 -- input|retrieval|memory|tool|action|output|egress
  phase TEXT NOT NULL,
  timestamp TEXT NOT NULL,               -- ISO 8601
  correlation_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  detections_json TEXT NOT NULL,         -- JSON array
  sanitized_text TEXT,                   -- For transform
  redacted_fields_json TEXT,             -- For redaction
  raw_receipt_json TEXT NOT NULL         -- Full receipt for traceability
);

CREATE INDEX idx_guardrail_decisions_session ON guardrail_decisions(session_id);
CREATE INDEX idx_guardrail_decisions_timestamp ON guardrail_decisions(timestamp);
CREATE INDEX idx_guardrail_decisions_decision ON guardrail_decisions(decision);
```

### 17.2 Tests

- Integration: send a malicious `process.spawn` request via IPC, verify it's blocked by `CommandValidationScanner`.
- Integration: send a sycophantic agent response, verify it's flagged by `SycophancyScanner` and the receipt is persisted to `UnifiedDB.guardrail_decisions`.
- Integration: verify audit receipts persist across daemon restarts.
- Integration: verify `DaemonConfig.guardrails.enabled = false` disables all guardrails (for testing only — never in production).

### 17.3 Verification

- [ ] `@agentsy/daemon` depends on `@agentsy/guardrails` and `@agentsy/runtime`
- [ ] `GuardrailPipeline` and `HookRegistry` instantiated in `Daemon.start()`
- [ ] All 18 scanners (7 security + 9 behavioral + 4 surface + 3 interaction + 2 scope/classification) wired
- [ ] IPC handlers `agent.spawn`, `process.spawn`, `stream.start` route through hooks
- [ ] `DaemonConfig.guardrails` config section works
- [ ] Audit receipts persisted to `UnifiedDB.guardrail_decisions`
- [ ] Integration test: malicious IPC blocked
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

---

