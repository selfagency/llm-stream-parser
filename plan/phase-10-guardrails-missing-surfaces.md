

## 15. Phase 10 — Guardrails Missing Surfaces & Interaction Safeguards

**Priority**: P0 — Sprint 5
**Story points**: 6
**Branch**: `feat/guardrails-surfaces`
**Depends on**: Phase 4 ✅ (expanded `GuardrailResult`, `GuardrailDecisionReceipt`)
**Unblocks**: Phase 9 (DependencyScanner needs `SessionState`), Phase 11 (ScopeDriftScanner needs `SessionState`)
**Closes findings**: E-16, E-20, E-35, E-22 (full)

### 15.1 Finding E-20 — Missing surfaces (`retrieval`, `memory`, `action`, `egress`)

- **Severity**: HIGH
- **Files**: `packages/guardrails/src/types.ts:32–37` (`GuardrailPhase`)
- **Policy requirement**: `IMPLEMENTATION-PLAN.md` §Surface model: *"Guardrails must evaluate each surface independently: `input`, `retrieval`, `memory`, `tool`, `action`, `output`, `egress`."* Tasks TASK-G003, TASK-G021 (retrieval), TASK-G023 (memory poisoning), TASK-G032 (egress).
- **Implementation**: `GuardrailPhase = 'input' | 'output' | 'tool-input' | 'tool-output' | 'approval'`. Missing: `retrieval`, `memory`, `action`, `egress`.
- **Why it matters**:
  - **Retrieval**: RAG pipelines retrieve documents from external sources. Without a retrieval scanner, prompt injection in retrieved documents (indirect prompt injection) goes undetected. The `PromptInjectionScanner` only runs on user input.
  - **Memory**: Agents persist context across sessions. Without a memory scanner, memory poisoning (malicious instructions inserted into long-term memory) goes undetected.
  - **Action**: High-impact actions (sending emails, making payments, modifying files) require approval gates. The `approval` phase exists but is for the approval workflow itself, not for scanning the action's parameters.
  - **Egress**: Network requests to external services can leak data. Without an egress scanner, an agent can POST user data to an attacker-controlled URL.
- **Recommended fix**:

```typescript
// packages/guardrails/src/types.ts (EXPANDED)

export type GuardrailPhase =
  | 'input'
  | 'retrieval'         // NEW
  | 'memory'            // NEW
  | 'tool-input'
  | 'tool-output'
  | 'action'            // NEW
  | 'approval'
  | 'output'
  | 'egress';           // NEW
```

Implement 4 new scanners:

**RetrievalFirewallScanner** (`packages/guardrails/src/scanners/retrieval-firewall.ts`):
- Phase: `retrieval`
- Domain allowlist (from `GuardrailsConfig.retrievalDomains`)
- Trust scoring for retrieved content (lower trust = stricter scanning)
- Re-runs `PromptInjectionScanner` on retrieved content (closes E-35)

```typescript
export class RetrievalFirewallScanner implements GuardrailScanner {
  readonly id = 'retrieval-firewall';
  readonly phase: GuardrailPhase = 'retrieval';
  readonly priority = 40;

  async evaluate(input: RetrievedContent[], context: GuardrailContext): Promise<GuardrailResult> {
    const allowed = context.config?.retrievalDomains ?? [];
    const blocked: RetrievedContent[] = [];

    for (const item of input) {
      // 1. Domain allowlist check
      if (allowed.length > 0 && !allowed.some(d => item.sourceUrl?.startsWith(d))) {
        blocked.push(item);
        continue;
      }
      // 2. Re-scan for prompt injection (closes E-35)
      const injectionResult = this.promptInjectionScanner.evaluate(item.content, context);
      if (injectionResult.status === 'block') {
        blocked.push(item);
      }
    }

    if (blocked.length > 0) {
      return {
        status: 'transform',
        phase: 'retrieval',
        sanitized: input.filter(i => !blocked.includes(i)).map(i => i.content).join('\n\n'),
        transformReason: 'rewrite',
        detections: blocked.map((item, i) => ({
          id: `retrieval-blocked-${i}`,
          severity: 'high',
          description: `Blocked retrieved content from ${item.sourceUrl ?? 'unknown'}`,
          confidence: 0.9,
        })),
      };
    }

    return { status: 'pass', phase: 'retrieval' };
  }
}
```

**MemoryPoisoningScanner** (`packages/guardrails/src/scanners/memory-poisoning.ts`):
- Phase: `memory`
- Scans persisted instructions/notes for injection attempts
- Schema-validates memory entries
- Flags suspicious updates (rapid changes to high-trust items)

**ActionScanner** (`packages/guardrails/src/scanners/action.ts`):
- Phase: `action`
- Schema-validates action parameters
- Enforces irreversible-action approval gates (e.g. `send_email`, `delete_file`, `transfer_funds`)

**EgressScanner** (`packages/guardrails/src/scanners/egress.ts`):
- Phase: `egress`
- URL allowlist (from `GuardrailsConfig.egressAllowList`)
- Request-size limits
- PII/secret re-scan on outbound payloads

### 15.2 Finding E-16 — No interaction-level safeguards (Layer 5)

- **Severity**: HIGH
- **Policy requirement**: `SAFETY.md` §5. Interaction-level safeguards: *"Reassurance-seeking detection over time. Soft session limits or pause nudges for emotionally intense or repetitive use. Escalation pathways to trusted people, crisis services, or qualified professionals. Restrictions on long-term socio-emotional continuity by default. Memory retention limits for sensitive contexts. Scope drift detection."*
- **Implementation**: Absent. The pipeline is stateless (each `evaluate` call is independent). The `RateLimiterScanner` tracks per-key counts across calls but doesn't detect *patterns*.
- **Why it matters**: Many of the most serious risks (dependency, crisis escalation, scope creep) are *temporal* — they emerge over multiple turns. A stateless pipeline cannot catch them.
- **Recommended fix**:

Add `SessionState` to the pipeline context:

```typescript
// packages/guardrails/src/context.ts (EXPANDED)

export interface SessionState {
  turnCount: number;
  reassuranceSeekingCount: number;
  emotionalIntensityScore: number;       // 0..1, updated each turn
  scopeDeclarations: string[];
  lastScopeDriftTurn: number | null;
  crisisMode: boolean;
  sensitiveContextActive: boolean;
  sessionStartTime: string;              // ISO 8601
}

export interface GuardrailContext {
  sessionId: string;
  conversationHistory?: Message[];
  sessionState?: SessionState;           // NEW
  agentScopeDeclaration?: ScopeDeclaration;
  memoryEnabled?: boolean;
  memoryDisclosureShown?: boolean;
  config?: GuardrailsConfig;
}
```

Implement 3 new scanners that read `SessionState`:

**InteractionSafeguardsScanner** (`packages/guardrails/src/scanners/interaction-safeguards.ts`):
- Phase: `input`
- Tracks `reassuranceSeekingCount` and `emotionalIntensityScore` over turns
- Soft session limit: if `turnCount > 50` and `emotionalIntensityScore > 0.7` for 5+ consecutive turns, returns `escalate` with a pause-nudge message
- Memory retention limit: if `sensitiveContextActive` is true, marks memory items for shorter retention

**CrisisEscalationScanner** (`packages/guardrails/src/scanners/crisis-escalation.ts`):
- Phase: `input`
- Detects crisis language in the user's message
- Returns `escalate` with `crisisResources: string[]` in the receipt (hotline numbers, crisis text lines)
- Sets `sessionState.crisisMode = true`

**ScopeDriftScanner** (`packages/guardrails/src/scanners/scope-drift.ts`):
- Phase: `input`
- Compares the current request against `agentScopeDeclaration.inScope` (added in Phase 11)
- Tracks the proportion of in-scope vs out-of-scope requests over a session
- Escalates if drift exceeds a threshold (e.g. >30% out-of-scope in last 10 turns)

### 15.3 Finding E-35 — Indirect prompt injection from retrieved context

- **Severity**: MEDIUM
- **Files**: `packages/guardrails/src/prompt-injection.ts`
- **Implementation**: The scanner runs on user input only (the runtime hook calls it on `UserPromptSubmit`). It doesn't run on retrieved documents.
- **Why it matters**: Indirect prompt injection is one of the most common real-world attack vectors for RAG-based agents. OWASP ASI-01 explicitly covers it.
- **Recommended fix**: Closed by `RetrievalFirewallScanner` (§15.1 above) which runs `PromptInjectionScanner` on retrieved content.

### 15.4 Finding E-22 (full) — Runtime hook coverage for new phases

- Update `packages/runtime/src/hooks/guardrail-hooks.ts` to register hooks for `PreRetrieval`, `PostRetrieval`, `PreMemoryWrite`, `PreAction`, `PreEgress`.
- Enrich hook context with `conversationHistory`, `sessionState`, `agentScopeDeclaration` (Phase 11).

### 15.5 Tests

- Multi-turn fixtures for `InteractionSafeguardsScanner` (5+ turns with rising emotional intensity).
- Retrieval fixtures for `RetrievalFirewallScanner` (clean content + injection-laden content).
- Memory poisoning fixtures for `MemoryPoisoningScanner` (legitimate memory write + injection attempt).
- Action fixtures for `ActionScanner` (safe action + irreversible action without approval).
- Egress fixtures for `EgressScanner` (allowed URL + blocked URL + PII in payload).
- **Ingress fixtures** for `IngressScanner` (clean HTTP response + injection-laden response + oversized response triggering disk-spill).

### 15.6 Verification

- [ ] `GuardrailPhase` includes `retrieval`, `memory`, `action`, `egress`
- [ ] `RetrievalFirewallScanner`, `MemoryPoisoningScanner`, `ActionScanner`, `EgressScanner` exist
- [ ] `SessionState` threaded through the pipeline
- [ ] `InteractionSafeguardsScanner`, `CrisisEscalationScanner`, `ScopeDriftScanner` exist
- [ ] Runtime hooks exist for `PreRetrieval`, `PostRetrieval`, `PreMemoryWrite`, `PreAction`, `PreEgress`
- [ ] Hook context includes `conversationHistory`, `sessionState`, `agentScopeDeclaration`
- [ ] **`IngressScanner` exists and scans response bodies for prompt injection (closes E-35 for HTTP responses)**
- [ ] **MCP stdio server responses scanned before reaching the agent**
- [ ] **`http_fetch` tool responses scanned; oversized responses disk-spilled**
- [ ] **`SubprocessSpec.networkPolicy` field honored (allow-all | allowlist | block-all | proxy-inspect)**
- [ ] **`HTTP_PROXY` / `HTTPS_PROXY` / `NODE_EXTRA_CA_CERTS` / `SSL_CERT_FILE` injected into subprocess env when `proxy-inspect` is set**
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

### 15.7 Extension — Ingress (Response-Body) Scanning & Subprocess Network Policy

> **Added in response to the network-interception question.** Phase 10 as originally scoped scans *egress* (outbound requests via `EgressScanner`) and *retrieved RAG content* (via `RetrievalFirewallScanner`). It does **not** scan *ingress* — the response bodies returned by HTTP calls, MCP servers, and arbitrary subprocesses. This extension closes that gap for the daemon-controlled transport layer. A full MITM proxy for arbitrary subprocesses is deferred to Phase 25 (§40).

#### 15.7.1 The gap

Indirect prompt injection (E-35) is currently closed only for RAG-retrieved content. But an agent also receives content from:

1. **The `http_fetch` tool** — fetches arbitrary URLs; response bodies are passed verbatim to the agent. A malicious web page can embed instructions ("Ignore previous instructions and...") that the agent treats as authoritative.
2. **MCP stdio servers** — the daemon spawns these and owns the JSON-RPC pipe. Tool-call results flow through the daemon but are not scanned.
3. **MCP HTTP/SSE servers** — the daemon makes the HTTP calls; same story.
4. **Arbitrary subprocesses** — a build runner, linter, or shell command may fetch content that ends up in the agent's context (via `stdout`).

Paths 1–3 are daemon-controlled and can be scanned at the call site. Path 4 requires a network proxy (Phase 25).

#### 15.7.2 `IngressScanner` (new scanner, `egress` phase re-purposed)

Add a new `IngressScanner` that runs on response bodies. Despite the name, it runs on the `egress` surface (the `egress` phase covers both outbound requests and inbound responses for a given network exchange).

```typescript
// packages/guardrails/src/scanners/ingress.ts (NEW)

export interface IngressScanInput {
  readonly sourceUrl?: string;           // For HTTP responses
  readonly sourceType: 'http' | 'mcp-stdio' | 'mcp-http' | 'subprocess-stdout';
  readonly contentType?: string;         // e.g. 'text/html', 'application/json'
  readonly body: string;
  readonly bodySizeBytes: number;
}

export class IngressScanner implements GuardrailScanner {
  readonly id = 'ingress';
  readonly phase: GuardrailPhase = 'egress';   // Re-uses egress surface
  readonly priority = 38;                       // After EgressScanner (35), before RetrievalFirewall (40)

  constructor(private deps: {
    promptInjectionScanner: PromptInjectionScanner;
    maxBodySizeChars: number;                   // Default 100_000; disk-spill above this
  }) {}

  async evaluate(input: IngressScanInput, context: GuardrailContext): Promise<GuardrailResult> {
    // 1. Disk-spill oversized bodies — return a preview, store full body on disk
    if (input.bodySizeBytes > this.deps.maxBodySizeChars) {
      const spillPath = await this.spillToDisk(input.body, context.sessionId);
      return {
        status: 'transform',
        phase: 'egress',
        sanitized: `[Response body too large (${input.bodySizeBytes} bytes); full content stored at ${spillPath}. Preview: ${input.body.slice(0, 2000)}...]`,
        transformReason: 'normalization',
        detections: [{
          id: 'ingress-oversized',
          severity: 'low',
          description: `Response body exceeded ${this.deps.maxBodySizeChars} chars`,
          confidence: 1.0,
        }],
      };
    }

    // 2. Run prompt-injection detection on the response body
    const injectionResult = this.deps.promptInjectionScanner.evaluate(input.body, context);
    if (injectionResult.status === 'block') {
      return {
        status: 'block',
        phase: 'egress',
        reason: `Indirect prompt injection detected in ${input.sourceType} response` +
                (input.sourceUrl ? ` from ${input.sourceUrl}` : ''),
        detections: injectionResult.detections,
      };
    }

    // 3. For HTML responses, optionally convert to markdown first (Phase 22)
    //    to reduce noise before scanning. The conversion happens before this
    //    scanner is called if the http_fetch tool is configured to auto-convert.
    return { status: 'pass', phase: 'egress' };
  }

  private async spillToDisk(body: string, sessionId: string): Promise<string> {
    // Spill to ~/.agentsy/spill/<sessionId>/<uuid>.txt
    // Return the path for inclusion in the transformed payload
  }
}
```

#### 15.7.3 MCP response scanning

The daemon's MCP client (spawned by `SubprocessManager` for stdio, or via `fetch` for HTTP/SSE) intercepts every JSON-RPC response. Before passing a tool-call result to the agent, the daemon runs `IngressScanner`:

```typescript
// packages/daemon/src/mcp/mcp-client.ts (MODIFIED)

async callTool(serverId: string, toolName: string, args: unknown): Promise<ToolResult> {
  const rawResult = await this.transport.callTool(serverId, toolName, args);
  const resultBody = JSON.stringify(rawResult);

  // Run ingress scanner on the MCP response
  const scanResult = await this.guardrailPipeline.evaluate(
    {
      sourceType: this.transport.type === 'stdio' ? 'mcp-stdio' : 'mcp-http',
      body: resultBody,
      bodySizeBytes: resultBody.length,
    },
    { phase: 'egress', sessionId: this.sessionId }
  );

  if (scanResult.status === 'block') {
    return {
      ok: false,
      error: `MCP response blocked by guardrails: ${scanResult.reason}`,
      data: null,
    };
  }

  return rawResult;
}
```

This closes indirect-prompt-injection for MCP servers — the highest-risk ingress path — without needing a network proxy.

#### 15.7.4 `http_fetch` tool response scanning

The `http_fetch` tool (Phase 22 adds turndown HTML→Markdown conversion) runs `IngressScanner` on every response body before returning it to the agent:

```typescript
// packages/tools/src/tools/http/index.ts (MODIFIED — extends Phase 22)

async function handleHttpFetch(input: Record<string, unknown>): Promise<ToolResult> {
  // ... existing fetch + turndown conversion ...
  const response = await executeFetch(url, method, input);
  const rawBody = await response.text();
  const contentType = response.headers.get('content-type') ?? '';

  // Convert HTML to Markdown (Phase 22)
  let body = rawBody;
  if (contentType.includes('text/html') && rawBody.trim().startsWith('<')) {
    body = turndown.turndown(rawBody);  // Graceful fallback on failure
  }

  // Run ingress scanner (Phase 10 §15.7 extension)
  const scanResult = await ingressScanner.evaluate(
    {
      sourceUrl: url,
      sourceType: 'http',
      contentType,
      body,
      bodySizeBytes: body.length,
    },
    { phase: 'egress', sessionId: currentSessionId }
  );

  if (scanResult.status === 'block') {
    return {
      ok: false,
      data: null,
      error: `Response blocked by guardrails: ${scanResult.reason}`,
    };
  }

  return {
    ok: true,
    data: {
      status: response.status,
      statusText: response.statusText,
      body: scanResult.status === 'transform' ? scanResult.sanitized : body,
      bodyFormat: /* ... */,
      headers: Object.fromEntries(response.headers.entries()),
    },
  };
}
```

#### 15.7.5 `SubprocessSpec.networkPolicy` (plumbing for Phase 25)

Add a `networkPolicy` field to `SubprocessSpec` so the daemon can control per-subprocess network access. This is the plumbing that Phase 25's MITM proxy will consume; it doesn't require the proxy itself.

```typescript
// packages/daemon/src/processes/subprocess-manager.ts (MODIFIED)

export interface SubprocessSpec {
  // ... existing fields ...
  networkPolicy?: {
    /** Default: 'block-all' for safety. MCP servers default to 'proxy-inspect'. */
    mode: 'allow-all' | 'allowlist' | 'block-all' | 'proxy-inspect';
    /** Domains allowed when mode is 'allowlist'. */
    allowlistDomains?: string[];
    /** Whether to scan response bodies (default true for proxy-inspect). */
    inspectResponses?: boolean;
    /** Max response size in bytes before disk-spill (default 100_000). */
    maxResponseSizeBytes?: number;
  };
}
```

When `networkPolicy.mode === 'proxy-inspect'`, the `SubprocessManager.spawnChild()` method (line 99–131 of the current source) injects proxy env vars into the safe-env allowlist:

```typescript
// In spawnChild(), after building safeEnv:
if (spec.networkPolicy?.mode === 'proxy-inspect') {
  const proxyPort = this.deps.proxyPort ?? 8899;
  safeEnv.HTTP_PROXY = `http://127.0.0.1:${proxyPort}`;
  safeEnv.HTTPS_PROXY = `http://127.0.0.1:${proxyPort}`;
  // Per-language CA trust (Phase 25 generates the CA; Phase 10 just sets the plumbing)
  safeEnv.NODE_EXTRA_CA_CERTS = `${os.homedir()}/.agentsy/ca/agentsy-ca.pem`;
  safeEnv.SSL_CERT_FILE = `${os.homedir()}/.agentsy/ca/agentsy-ca.pem`;
  safeEnv.REQUESTS_CA_BUNDLE = `${os.homedir()}/.agentsy/ca/agentsy-ca.pem`;
  safeEnv.GIT_SSL_CAINFO = `${os.homedir()}/.agentsy/ca/agentsy-ca.pem`;
}
```

**Note**: This plumbing lands in Phase 10 but is inert until Phase 25 generates the CA and starts the proxy. If `proxy-inspect` is set but the proxy isn't running, the subprocess will fail to connect (connection refused) — which is the safe failure mode. Document this clearly.

#### 15.7.6 What this extension does NOT cover

- **Arbitrary subprocesses that make their own network connections** (build runners, `curl` in a shell command) — these need the MITM proxy (Phase 25). The `networkPolicy` plumbing in §15.7.5 sets up the env vars, but the proxy itself doesn't exist until Phase 25.
- **Raw TCP sockets** — not interceptable via `HTTP_PROXY`. Needs Layer 3 (network namespace) isolation, which is out of scope for both Phase 10 and Phase 25.
- **Apps that ignore env vars or use certificate pinning** — documented limitation; the proxy can't catch these.

#### 15.7.7 Effort

This extension adds ~3 SP to Phase 10's existing 6 SP (total 9 SP). The `IngressScanner` is ~1 SP; the MCP client integration is ~1 SP; the `http_fetch` integration is ~0.5 SP; the `SubprocessSpec.networkPolicy` plumbing is ~0.5 SP.

---

