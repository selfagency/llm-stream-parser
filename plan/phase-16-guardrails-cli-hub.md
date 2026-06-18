
## 21. Phase 16 — Guardrails CLI, Hub & Polish

**Priority**: P1 — Sprint 9
**Story points**: 5
**Branch**: `feat/guardrails-cli-polish`
**Depends on**: Phase 4 ✅ (canonical `GuardrailsConfig`)
**Closes findings**: E-17, E-24, E-29, E-30, E-31, E-32, E-33, E-34, E-36, E-37, E-43

### 21.1 Finding E-24 — `@agentsy/cli` `guardrails` command is display-only

- **Severity**: MEDIUM
- **Files**: `packages/cli/src/commands/guardrails.ts`
- **Implementation**: `list` always shows 7 built-ins. `install` only resolves to built-ins by name. `uninstall` removes from an ephemeral map. `policy` parses YAML and prints it — doesn't load, validate, or test-evaluate.
- **Recommended fix**:
  1. `agentsy guardrails install <hub-uri>` writes to persistent `.agentsy/guardrails.yaml` loaded on daemon start.
  2. `agentsy guardrails policy <path>` validates the policy against actual scanner capabilities and optionally test-evaluates against sample inputs.
  3. `agentsy guardrails test <policy-path> <input>` runs the policy against an input and prints the decision receipt.
  4. `agentsy guardrails hub <hub-uri>` resolves `npm://` and `file://` URIs by actually importing the package or file.

### 21.2 Finding E-17 — No product-level safeguards (Layer 6)

- **Severity**: MEDIUM
- **Policy requirement**: `SAFETY.md` §6. Product-level safeguards.
- **Recommended fix**: Add a `scanUICopy` API:

```typescript
// packages/guardrails/src/ui-copy-scanner.ts (NEW)

export interface UIStringTable {
  [key: string]: string;  // e.g. { 'notification.daily-reminder': 'We missed you! Come back!' }
}

export function scanUICopy(copy: UIStringTable): DarkPatternDetection[] {
  const detections: DarkPatternDetection[] = [];
  for (const [key, value] of Object.entries(copy)) {
    // Re-use DarkPatternScanner patterns (Phase 9 §14.5)
    if (GUILT_REENGAGEMENT_PATTERNS.some(p => p.test(value))) {
      detections.push({ key, severity: 'high', pattern: 'guilt-reenagement' });
    }
    if (STREAK_REWARD_PATTERNS.some(p => p.test(value))) {
      detections.push({ key, severity: 'medium', pattern: 'streak-reward' });
    }
    // ...
  }
  return detections;
}
```

Wire into CI for first-party packages.

### 21.3 Finding E-31 — Custom YAML parser doesn't handle real YAML

- **Severity**: LOW
- **Files**: `packages/cli/src/commands/guardrails.ts:322–369` (`parseSimplePolicy`)
- **Recommended fix**: Use `yaml` package (or `js-yaml`). Add Zod validation. Replace `parseSimplePolicy` with `yaml.parse(raw)` + Zod schema.

### 21.4 Finding E-29 — Policy condition evaluator doesn't support nested paths

- **Severity**: MEDIUM
- **Files**: `packages/guardrails/src/policy.ts:323–342` (`resolvePath`)
- **Recommended fix**: Document the condition DSL's limits. If extending: add array indexing, computed paths, and path-to-path comparisons. For `matches`: use a bounded regex library or pre-validate the pattern; reject patterns with catastrophic-backtracking risk.

### 21.5 Finding E-30 — `DEFAULT_POLICY` has a bug

- **Severity**: LOW
- **Files**: `packages/guardrails/src/policy.ts:396–401`
- **Recommended fix**: Change the condition from `tool.annotations.destructiveHint == true && tool.annotations.openWorldHint == true && tool.annotations.requiresApproval == true` (the `requiresApproval` annotation isn't part of the MCP standard) to `tool.annotations.destructiveHint == true && tool.annotations.openWorldHint == true` and make the action `require_approval`.

### 21.6 Scanner False-Positive Fixes (E-32, E-33, E-34, E-36, E-37)

**E-32 (MEDIUM)** — `ToxicityScanner` `nazi` pattern matches the bare word in any context, including historical/educational text. Severity `high` triggers `block`. **Fix**: Either (a) require a destructive context ("I am a nazi", "heil nazi") or (b) lower severity to `medium` (escalate for human review). Pair with an LLM-based classifier for higher accuracy.

**E-33 (MEDIUM)** — `SecretDetectionScanner` has overly broad patterns:

- Line 105: Vercel pattern `/\b[A-Za-z0-9]{24}\b/g` matches any 24-character alphanumeric string.
- Line 183: Postmark pattern matches any UUID.
- Line 244: Snyk pattern matches any UUID.

**Fix**: Vercel — require known prefix or contextual markers. Postmark/Snyk — require contextual markers. Add confidence calibration: a bare 24-char string is confidence 0.5, not 0.75.

**E-34 (LOW)** — `PIIScanner` redacts all PII types to generic `[REDACTED]` except email/SSN/credit-card. **Fix**: Use consistent `[REDACTED:<id>]` pattern: `[REDACTED:email]`, `[REDACTED:ssn]`, `[REDACTED:credit-card]`, `[REDACTED:phone]`, etc.

**E-36 (LOW)** — `RateLimiterScanner` defaults to 100 requests per 60s — too lax for safety contexts. **Fix**: Per-key-type defaults: tool calls 20/min, user messages 30/min, agent-to-agent calls 50/min. Configurable per agent.

**E-37 (LOW)** — `EntropyScanner` threshold of 4.0 may miss known secret formats (AWS key `AKIAIOSFODNN7EXAMPLE` has entropy ~3.6). **Fix**: Lower default threshold to 3.5, or add a "compact entropy" mode that computes entropy over a sliding window for strings with mixed character classes.

### 21.7 Finding E-43 — No documented exceptions to ethics or safety rules

- **Severity**: LOW
- **Policy requirement**: `GOVERNANCE.md` §Transparency: *"Any documented exceptions to ethics or safety rules, including rationale."*
- **Recommended fix**: Create `docs/safety-exceptions.md`. If none exist, state "No exceptions documented." Review quarterly. Each exception must reference the clause ID in `EthicsRegistry` and include rationale + reviewer sign-off.

### 21.8 Verification

- [ ] `agentsy guardrails install` writes to persistent `.agentsy/guardrails.yaml`
- [ ] `agentsy guardrails policy <path>` validates and test-evaluates
- [ ] `agentsy guardrails test <policy-path> <input>` prints decision receipts
- [ ] `agentsy guardrails hub <hub-uri>` resolves `npm://` and `file://` URIs
- [ ] `scanUICopy` API exists; first-party UI packages scanned in CI
- [ ] Custom YAML parser replaced with `yaml` package + Zod validation
- [ ] `DEFAULT_POLICY` rule conditions reference real annotations
- [ ] `ToxicityScanner` `nazi` pattern false positives mitigated
- [ ] `SecretDetectionScanner` Vercel/Postmark/Snyk patterns tightened
- [ ] `PIIScanner` redaction placeholders consistent
- [ ] `RateLimiterScanner` per-key-type defaults
- [ ] `EntropyScanner` threshold lowered to 3.5
- [ ] `docs/safety-exceptions.md` exists
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

---
