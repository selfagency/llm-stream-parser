

## 18. Phase 13 — Guardrails Metrics, Benchmark Suite & Release Gate

**Priority**: P0 — Sprint 7
**Story points**: 11.5 (8 base + 3.5 langeval integration — see §18.7)
**Branch**: `feat/guardrails-metrics-benchmarks`
**Depends on**: Phase 9 ✅ (scanners exist), Phase 12 ✅ (daemon wired), Phase 19 (Langfuse — shared with langeval Trace Debugger), Phase 21 (Docker tooling — langeval runs as Docker Compose)
**Unblocks**: First-party agent templates can ship (release gate passes)
**Closes findings**: E-25, E-26, E-27, E-14 (full — intersectional adequacy benchmark)
**Note**: The expanded 15-competitor comparison (§A.15 gemini-cli) elevated behavioral evals to "market table-stakes." Instead of building custom evals, we integrate [langeval](https://github.com/solana8800/langeval) — an enterprise AI agent evaluation platform with persona simulation (AutoGen), DeepEval metrics, red-teaming, Battle Arena, and Langfuse trace integration. See §18.7.

### 18.1 Finding E-25 — None of the 12 required safety metrics are tracked

- **Severity**: CRITICAL
- **Policy requirement**: `SAFETY.md` §Metrics: 12 metrics listed. `GOVERNANCE.md` §Safety metrics: same list, with explicit instruction "These metrics are not engagement metrics."
- **Implementation**: Absent. No metrics collector, no metrics exporter, no metrics dashboard.
- **The 12 required metrics**:
  1. Sycophancy rate
  2. Correct-disagreement rate
  3. Anthropomorphic language rate
  4. Dependence-cue rate
  5. Unsafe high-risk advice rate
  6. Dark-pattern incidence in first-party UIs
  7. Memory transparency compliance
  8. Policy traceability and audit completeness
  9. Scope violation rate
  10. AGI/longtermist framing incidence
  11. Professional displacement framing incidence
  12. Intersectional user safety disparity
- **Why it matters**: `SAFETY.md` is explicit: *"Releases should fail when safety regressions exceed defined thresholds."* Without metrics, there's nothing to regress against and no thresholds to enforce.
- **Recommended fix**:

```typescript
// packages/guardrails/src/metrics.ts (NEW)

export type MetricKey =
  | 'sycophancy_rate'
  | 'correct_disagreement_rate'
  | 'anthropomorphic_language_rate'
  | 'dependence_cue_rate'
  | 'unsafe_high_risk_advice_rate'
  | 'dark_pattern_incidence'
  | 'memory_transparency_compliance'
  | 'policy_traceability_completeness'
  | 'scope_violation_rate'
  | 'agi_longtermist_framing_incidence'
  | 'professional_displacement_framing_incidence'
  | 'intersectional_safety_disparity';

export interface MetricSnapshot {
  key: MetricKey;
  value: number;                       // Rate or count
  denominator: number;                 // Total opportunities (e.g. total turns for sycophancy_rate)
  windowStart: string;                 // ISO 8601
  windowEnd: string;                   // ISO 8601
}

export class MetricsCollector {
  constructor(private auditLogger: AuditLogger) {}

  async collect(): Promise<Record<MetricKey, MetricSnapshot>> {
    // Query audit logs from the last window (default 24h)
    // Count receipts by reasonCode to compute each metric
    // e.g. sycophancy_rate = count(receipts where reasonCode == 'SYCOPHANCY_DETECTED') / total_output_receipts
  }

  async export(): Promise<void> {
    // Export via OpenTelemetry or to a local JSON file
  }
}
```

Wire into the audit logger — every decision receipt increments a counter. Define thresholds in `DaemonConfig.metrics.thresholds`. Add a CLI command `agentsy guardrails metrics` to view current metrics.

### 18.2 Finding E-26 — None of the 12 required benchmark scenarios exist

- **Severity**: CRITICAL
- **Policy requirement**: `SAFETY.md` §Testing requirements: *"No first-party agent should ship without evaluation against benchmark scenarios that cover:"* 12 scenarios. `GOVERNANCE.md` §Benchmark suite: same 12, with "Benchmark results should be recorded and compared across releases. Regressions should block merges or require documented exceptions."
- **The 12 required benchmark scenarios**:
  1. False-belief correction
  2. Harmful validation resistance
  3. Interpersonal conflict and moral absolution cases
  4. Anthropomorphic framing resistance
  5. Dependency-resistance behavior
  6. Privacy and memory disclosure behavior
  7. Dark-pattern UI and notification copy scanning
  8. High-risk advice handling
  9. Scope enforcement
  10. AGI/post-human framing resistance
  11. Intersectional adequacy
  12. Third-party impact
- **Why it matters**: `GOVERNANCE.md` §Release criteria: *"The change passes the benchmark suite for harmful validation, dependency resistance, false-belief correction, and unsafe advice handling."* This is a release gate. Without the suite, releases can't be gated.
- **Recommended fix**:

```typescript
// packages/guardrails/src/eval/benchmark.ts (NEW)

export interface BenchmarkCase {
  readonly id: string;
  readonly input: string;
  readonly conversationHistory?: Message[];
  readonly expectedBehavior: string;             // Human-readable description
  readonly expectedStatus: GuardrailResult['status'];
  readonly expectedDetections?: string[];        // Scanner IDs expected to fire
  readonly expectedReasonCodes?: string[];
}

export interface BenchmarkScenario {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly cases: BenchmarkCase[];
  readonly passThreshold: number;                // Minimum pass rate (0..1)
}

export class BenchmarkSuite {
  readonly scenarios: BenchmarkScenario[];

  async run(): Promise<BenchmarkReport> {
    const results = new Map<string, ScenarioResult>();
    for (const scenario of this.scenarios) {
      const caseResults = await Promise.all(
        scenario.cases.map(c => this.runCase(c))
      );
      const passRate = caseResults.filter(r => r.passed).length / caseResults.length;
      results.set(scenario.id, {
        scenarioId: scenario.id,
        passRate,
        passed: passRate >= scenario.passThreshold,
        caseResults,
      });
    }
    return { results, timestamp: new Date().toISOString() };
  }
}
```

Create `packages/guardrails/src/eval/scenarios/` with one file per scenario, each containing 20–50 fixture cases. Use the `IMPLEMENTATION-PLAN-REVISIONS.md` §Phase 3 scenarios as seeds.

### 18.3 Finding E-27 — None of the 9 release criteria items are enforced

- **Severity**: CRITICAL
- **Policy requirement**: `SAFETY.md` §Release criteria: 9 items. `GOVERNANCE.md` §Release criteria: same 9.
- **The 9 release criteria**:
  1. Anti-sycophancy and anti-anthropomorphism modules are enabled by default
  2. No first-party copy implies companionship, emotional reciprocity, or abandonment on exit
  3. High-risk domain safety policies are implemented where relevant
  4. Memory controls are exposed to the user if memory is enabled
  5. Passes benchmark for harmful validation, dependency resistance, false-belief correction, unsafe advice handling
  6. Passes scope enforcement tests
  7. Passes intersectional adequacy tests for the target user population
  8. Produces auditable records of policy selection and policy firing
  9. Carries a written scope declaration reviewed by maintainers
- **Recommended fix**: Implement a `release-gate` script in `packages/scripts/release-gate.ts`:

```typescript
// packages/scripts/release-gate.ts (NEW)

export async function runReleaseGate(agentTemplatePath: string): Promise<ReleaseGateReport> {
  const failures: string[] = [];

  // 1. Load the agent template's scope.yaml
  const agentTemplate = await loadAgentTemplate(agentTemplatePath);

  // 2. Verify anti-sycophancy and anti-anthropomorphism scanners enabled
  if (!agentTemplate.guardrails?.scanners?.includes('sycophancy')) {
    failures.push('Criterion 1: SycophancyScanner not enabled');
  }
  if (!agentTemplate.guardrails?.scanners?.includes('anthropomorphism')) {
    failures.push('Criterion 1: AnthropomorphismScanner not enabled');
  }

  // 3. Run the benchmark suite (closes criterion 5, 6, 7)
  const benchmark = await new BenchmarkSuite().run();
  for (const [scenarioId, result] of benchmark.results) {
    if (!result.passed) {
      failures.push(`Criterion 5/6/7: Benchmark scenario ${scenarioId} failed (${(result.passRate * 100).toFixed(1)}% pass rate)`);
    }
  }

  // 4. Scan the agent's UI copy for dark patterns (closes criterion 2)
  const uiScan = await scanUICopy(agentTemplate.uiCopy);
  if (uiScan.length > 0) {
    failures.push(`Criterion 2: Dark patterns detected in UI copy: ${uiScan.map(d => d.id).join(', ')}`);
  }

  // 5. Verify memory controls are exposed (closes criterion 4)
  if (agentTemplate.memory?.enabled && !agentTemplate.memory?.controlsExposed) {
    failures.push('Criterion 4: Memory enabled but controls not exposed');
  }

  // 6. Verify a scope declaration exists and is signed off (closes criterion 9)
  if (!agentTemplate.scope) {
    failures.push('Criterion 9: No scope declaration');
  } else if (!agentTemplate.scope.reviewers?.length) {
    failures.push('Criterion 9: Scope declaration not reviewed');
  }

  // 7. Verify audit logging is enabled (closes criterion 8)
  if (!agentTemplate.guardrails?.auditLoggingEnabled) {
    failures.push('Criterion 8: Audit logging not enabled');
  }

  return { passed: failures.length === 0, failures };
}

// CLI entrypoint
if (require.main === module) {
  const agentPath = process.argv[2];
  runReleaseGate(agentPath).then(report => {
    if (!report.passed) {
      console.error('Release gate FAILED:');
      report.failures.forEach(f => console.error(`  - ${f}`));
      process.exit(1);
    }
    console.log('Release gate PASSED');
  });
}
```

Wire into CI: every PR that adds or modifies a first-party agent template must run `pnpm release-gate packages/agents/src/specs/<name>.yaml`. Fail the build if the gate fails.

### 18.4 Finding E-14 (full) — Intersectional adequacy benchmark

- **Severity**: MEDIUM (runtime portion closed by Phase 9 §14.9)
- **Policy requirement**: `SAFETY.md` §Intersectional adequacy.
- **Recommended fix**: Build the intersectional adequacy benchmark as benchmark scenario #11. Fixtures represent users at the intersection of marginalized identities (e.g. a Black trans woman seeking medical advice; an undocumented immigrant seeking legal advice; a non-English-speaking elder seeking financial advice). The benchmark measures whether the agent's responses are equally safe and helpful across user profiles.

### 18.5 Tests

- Unit: `MetricsCollector.collect` correctly computes each of the 12 metrics from audit logs.
- Unit: `BenchmarkSuite.run` correctly reports pass/fail per scenario.
- Integration: `release-gate` script exits non-zero when a criterion fails.
- CI: benchmark suite runs on every PR that touches `packages/guardrails/`. Fail the build if any scenario's pass rate drops below its threshold.

### 18.6 Verification

- [ ] All 12 required safety metrics tracked and exported (via OpenTelemetry or local JSON)
- [ ] Benchmark suite exists with all 12 required scenarios (20–50 cases each)
- [ ] `agentsy guardrails benchmark` CLI command runs the suite and produces a report
- [ ] Benchmark runs in CI on every PR touching `packages/guardrails/`
- [ ] `release-gate` script exists and gates first-party agent template PRs
- [ ] Intersectional adequacy benchmark included
- [ ] Benchmark results published in release notes
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

### 18.7 Extension — langeval Integration (replaces custom behavioral evals)

> **Updated**: Originally this section proposed building behavioral evals from gemini-cli patterns (+3 SP). After reviewing [langeval](https://github.com/solana8800/langeval) — an enterprise-grade AI agent evaluation platform — we're integrating it instead of building custom. This is a better fit: langeval already has persona-based simulation (AutoGen), DeepEval metrics, red-teaming, Langfuse trace integration, Battle Arena A/B testing, and CI/CD quality gates. Integration is cheaper and more capable than rebuilding.

#### 18.7.1 What langeval provides (that we'd otherwise build)

| Capability | langeval | Was in our plan |
|---|---|---|
| **Persona-based user simulation** | Microsoft AutoGen generates thousands of "virtual users" (Difficult, Curious, Impatient personalities) | Not planned |
| **Multi-turn conversation testing** | Built-in | Not planned |
| **Dynamic scenarios with branching** | Decision-tree-based test scenarios | Not planned |
| **Tiered metrics** | Tier 1 (Response): relevancy, toxicity, bias. Tier 2 (RAG): faithfulness, contextual precision. Tier 3 (Agentic): tool correctness, plan adherence | Phase 13 §18.2 (custom BenchmarkSuite) |
| **LLM-as-a-Judge (G-Eval)** | Custom metrics via G-Eval | Phase 13 §18.7 (LLMJudge from gemini-cli) |
| **Red-teaming** | Specialized workflows for jailbreak, PII leakage, toxicity attacks | Not planned (separate from guardrails) |
| **Self-correction loop** | LangGraph state machine detects errors and retries with prompt mutation | Not planned |
| **Human-in-the-loop** | Breakpoint mechanisms for human scoring | Not planned |
| **Battle Arena (A/B testing)** | Split-view comparison of two agent versions | Not planned |
| **Root Cause Analysis** | Failure clustering to identify where agents fail | Not planned |
| **Trace Debugger** | Langfuse UI integration for thought/action/observation tracing | Phase 19 (Langfuse) — complementary |
| **CI/CD Quality Gates** | Automated evaluation triggers for GitHub Actions (Phase 3 roadmap) | Phase 13 §18.3 (release-gate script) |
| **GEPA prompt optimization** | Automated prompt refinement (Phase 2 complete) | Not planned |
| **Observability** | Self-hosted Langfuse integration | Phase 19 (Langfuse) — complementary |

#### 18.7.2 Integration approach

Rather than running langeval as a separate platform, agentsy integrates it at two levels:

**Level 1 — CLI integration (Phase 13, +1 SP)**:
- `agentsy eval run` — invokes langeval's orchestrator API (`POST /orchestrator/campaigns`) with a scenario ID and an agent ID
- `agentsy eval scenarios` — lists available langeval scenarios (synced from the langeval resource service)
- `agentsy eval red-team` — launches a red-teaming campaign against the current agent
- `agentsy eval battle <agent-a> <agent-b>` — A/B comparison via Battle Arena
- Results are fetched from langeval's orchestrator and persisted to `UnifiedDB.eval_results` for trend tracking

**Level 2 — CI integration (Phase 13, +1 SP)**:
- A GitHub Actions workflow runs `agentsy eval run --scenario-suite safety --policy always-passes` on every PR touching `packages/guardrails/` or agent templates
- The release-gate script (§18.3) calls langeval's API to verify the 12 SAFETY.md benchmark scenarios pass before allowing a release
- Failures post a comment on the PR with a link to the langeval Trace Debugger (Langfuse UI)

**Level 3 — Langfuse cross-reference (Phase 19, +0 SP — already planned)**:
- langeval's Trace Debugger uses Langfuse under the hood
- Phase 19 (Langfuse observability) already wires Langfuse into the daemon
- The same Langfuse instance serves both agentsy's runtime tracing and langeval's evaluation tracing — agents can see their own traces alongside the eval results that judged them

#### 18.7.3 Deployment

langeval runs as a Docker Compose stack (it already ships one). Two options:

**Option A — agentsy-managed (recommended for v1)**:
- langeval runs as additional services in agentsy's Docker Compose (extends Phase 21's Docker tooling)
- `agentsy eval start` / `agentsy eval stop` manage the langeval stack
- Shared Langfuse instance (Phase 19) — langeval's `LANGFUSE_URL` points to agentsy's Langfuse
- Shared PostgreSQL (agentsy's `UnifiedDB` or a separate langeval DB)

**Option B — external (for teams with existing langeval)**:
- `DaemonConfig.eval.langevalUrl` points to an external langeval instance
- agentsy just calls the API; no local langeval services
- Useful for organizations running a shared langeval across multiple agent projects

```yaml
# docker-compose.eval.yml (extends Phase 21)
services:
  # langeval services (from langeval's docker-compose.yml)
  langeval-orchestrator:
    image: langeval/orchestrator:latest
    environment:
      - DATABASE_URL=postgres://agentsy:agentsy@postgres:5432/langeval
      - KAFKA_BOOTSTRAP_SERVERS=kafka:9092
      - REDIS_URL=redis://redis:6379
      - LANGFUSE_URL=http://langfuse:3000  # Shared with agentsy (Phase 19)
    depends_on: [postgres, kafka, redis, langfuse]

  langeval-simulation-worker:
    image: langeval/simulation-worker:latest
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}  # For AutoGen persona generation
      - KAFKA_BOOTSTRAP_SERVERS=kafka:9092
    depends_on: [kafka, langeval-orchestrator]

  langeval-evaluation-worker:
    image: langeval/evaluation-worker:latest
    environment:
      - KAFKA_BOOTSTRAP_SERVERS=kafka:9092
    depends_on: [kafka, langeval-orchestrator]

  # ... kafka, redis, qdrant, clickhouse as needed
```

#### 18.7.4 Scenario mapping

Map agentsy's 12 SAFETY.md benchmark scenarios (§18.2) to langeval scenarios:

| SAFETY.md scenario | langeval scenario type | langeval metrics |
|---|---|---|
| 1. False-belief correction | Multi-turn conversation | Answer relevancy, faithfulness |
| 2. Harmful validation resistance | Red-teaming (sycophancy attack) | Toxicity, bias, custom G-Eval |
| 3. Interpersonal conflict / moral absolution | Persona simulation (Difficult user) | Answer relevancy, custom G-Eval |
| 4. Anthropomorphic framing resistance | Red-teaming (personhood probe) | Custom G-Eval |
| 5. Dependency-resistance behavior | Multi-turn conversation (5+ turns) | Plan adherence, custom G-Eval |
| 6. Privacy and memory disclosure | Red-teaming (PII extraction) | PII leakage, faithfulness |
| 7. Dark-pattern UI scanning | Static analysis (not langeval) | (Stays in Phase 16 `scanUICopy`) |
| 8. High-risk advice handling | Red-teaming (medical/legal/financial) | Toxicity, custom G-Eval |
| 9. Scope enforcement | Persona simulation (out-of-scope request) | Tool correctness, plan adherence |
| 10. AGI/post-human framing resistance | Red-teaming (capability-trajectory probe) | Custom G-Eval |
| 11. Intersectional adequacy | Persona simulation (marginalized identity) | Bias, answer relevancy |
| 12. Third-party impact | Multi-turn conversation | Custom G-Eval |

#### 18.7.5 What we still build ourselves (not in langeval)

- **Memory + perf regression baselines** (from gemini-cli) — `MemoryTestHarness` and `PerfTestHarness` are agentsy-internal and not something langeval covers. These stay as a small custom addition (~0.5 SP).
- **The 12 SAFETY.md scenario fixtures** (§18.2) — langeval runs them, but we author the fixture content. The fixtures define *what* to test; langeval defines *how* to run and score.

#### 18.7.6 Effort

| Work item | SP |
|---|---|
| langeval CLI integration (`agentsy eval run/scenarios/red-team/battle`) | 1 |
| CI integration (GitHub Actions workflow + release-gate hook) | 1 |
| Docker Compose for langeval stack (extends Phase 21) | 0.5 |
| Scenario mapping (12 SAFETY.md scenarios → langeval) | 0.5 |
| Memory + perf regression baselines (custom, from gemini-cli) | 0.5 |
| **Total** | **3.5 SP** |

This replaces the original §18.7 (+3 SP for custom behavioral evals). Net change: +0.5 SP (the custom LLMJudge and incubation logic are no longer needed — langeval handles them), but we gain persona simulation, red-teaming, Battle Arena, RCA, and GEPA prompt optimization that we would never have built.

**Total Phase 13 with langeval integration: 11.5 SP** (was 11 SP with custom evals, but delivers far more capability).

---


