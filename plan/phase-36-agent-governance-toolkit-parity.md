## Phase 36 — Agent Governance Toolkit Pattern Adoption (Policy Engine, Trust Mesh, Tamper-Evident Audit)

**Priority**: P1 — Sprint 5 (parallel with Phase 33/35)
**Story points**: 6
**Branch**: `feat/agt-pattern-adoption`
**Depends on**: Phase 4 ✅ (guardrails honest foundation), Phase 12 (daemon integration), Phase 32 (security hardening)
**Unblocks**: stronger cross-agent governance, remote/server-mode readiness, trust-aware delegation, governance CI gates

> **Adopted AGT patterns**:
>
> * deterministic policy engine separate from runtime
> * trust mesh / scope chain for delegation hops
> * tamper-evident audit log
> * kill switch + governance SLO checks
> * plugin / marketplace trust scoring
> * governance docs with mandatory change control

---

### 36.1 What AGT gets right

AGT’s useful shape is not a single feature — it is the separation of concerns:

* **policy engine**: pure decision layer
* **runtime enforcer**: blocks or allows actions
* **audit/compliance**: evidence trail
* **trust mesh**: capability boundaries across hops
* **sandbox/runtime rings**: privilege separation
* **kill switch / SLO**: operational control plane
* **marketplace trust**: provenance and package trust

Agentsy already has pieces of this, but they are not unified into a governance model.

---

### 36.2 Existing Agentsy pieces

Already present:

* `@agentsy/guardrails` policy and scanning layers
* `GuardrailsConfig` with allow/deny lists, local-only mode, trust hierarchy, and redaction config
* `RoutingConstraint` + `ConstraintViolation` for pre-selection enforcement
* `JsonlAuditLogger` and receipt types
* `CredentialReferenceScanner` / credential broker integration pattern
* daemon, ACP, IPC, subprocess manager, approval manager, skill discovery

These are solid primitives, but they do not yet form a complete governance stack.

---

### 36.3 Gaps to close

#### 36.3.1 Governance policy engine boundary

Add an explicit **policy engine** abstraction that evaluates decisions without executing actions.
This keeps policy pure and testable:

* input: request context, trust context, sensitivity, capability request
* output: allow / deny / require approval / quarantine / redact
* no side effects

This should sit above guardrails and below the daemon/CLI surface.

#### 36.3.2 Trust mesh / scope chain

Adopt a capability chain for delegation hops:

* every delegation gets an origin, scope, and trust score
* each hop can only narrow scope, never widen it
* A2A / ACP / MCP / future remote transport should carry the same trust envelope

This maps well to:

* council mode
* subagent delegation
* remote daemon mode
* cross-tool execution

#### 36.3.3 Merkle-chained audit log

Current audit logging is useful, but not tamper-evident.
Add hash-chaining over governance events:

* policy decision
* approval request / response
* tool execution summary
* routing decision
* skill activation / install

This can remain local-first; the key is append-only verifiability.

#### 36.3.4 Governance kill switch and SLO checks

Add a hard kill switch for governance state:

* disable tool execution
* disable external egress
* force local-only routing
* force approval-required mode

Add CI checks for governance enforcement drift:

* policy configured == policy enforced
* no silent bypass paths
* hooks / IPC / daemon paths actually invoke the policy engine

#### 36.3.5 Trust scoring for skills and plugins

Extend the skills registry / plugin registry to carry provenance and trust metadata:

* author / maintainer
* registry source
* verification hash
* install scope
* trust score
* last reviewed time

This should connect directly to Phase 35’s skill registry work.

#### 36.3.6 Governance docs change control

Adopt AGT-style governance discipline for policy docs:

* breaking governance changes require a documented proposal first
* policy/security doc changes need explicit review
* deprecation / breaking changes are tracked
* threat model updates are required when behavior changes

---

### 36.4 Proposed implementation shape

#### 36.4.1 New module: governance engine

Create a pure decision layer in guardrails or a sibling package:

```typescript
interface GovernanceDecisionInput {
  capability: 'tool' | 'model' | 'skill' | 'routing' | 'delegation';
  context: Record<string, unknown>;
  trust: {
    score: number;
    source: string;
    chain: string[];
  };
}

interface GovernanceDecision {
  action: 'allow' | 'deny' | 'require_approval' | 'redact' | 'quarantine';
  reason: string;
  score: number;
}
```

#### 36.4.2 Trust envelope propagation

Attach a trust envelope to:

* IPC requests
* ACP sessions
* tool calls
* skill activations
* routing decisions

The trust envelope is what remote/server mode can later extend without redesign.

#### 36.4.3 Audit hash chaining

For each governance event:

* compute event hash
* link it to the previous event hash
* store in `UnifiedDB` and exported JSONL

This gives tamper-evidence without requiring a blockchain or external infra.

---

### 36.5 Tests

* policy engine returns deterministic decisions for the same input
* trust chain never widens scope across delegation hops
* audit log hashes link correctly across consecutive events
* kill switch blocks tool execution and external egress
* governance policy changes fail CI when enforcement is not wired
* skill installs include provenance / trust metadata

---

### 36.6 Verification

* governance decision paths are pure and testable
* every action path (daemon, IPC, ACP, skills, routing) passes through governance checks
* audit trail is hash-chained
* governance kill switch is operational
* skill/plugin trust metadata is visible in `doctor` / `list` surfaces
