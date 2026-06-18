## Phase 34 — Local Trust Sanitization Workflow (ZipTyPrompt Parity)

**Priority**: P1 — Sprint 3 (parallel with Phase 31/33)
**Story points**: 4
**Branch**: `feat/local-trust-sanitization`
**Depends on**: Phase 4 ✅ (guardrails redaction primitives), Phase 16 (Guardrails CLI polish)
**Unblocks**: safer prompt/log/config sharing workflow for support, DevOps, and incident response; reduces accidental secret/PII leakage before LLM submission

> **Source inspiration**: ZipTyPrompt's trust model: browser-local sanitization, no server upload, PII/infrastructure/secrets filters, custom regex rules, and a clear sanitize-first workflow.

---

### 34.1 Goal

Add a first-class, local-only sanitization workflow for logs, configs, env files, and incident artifacts so users can
safely prepare context before sending it to any LLM or agent. The workflow must be explicit, auditable, and
non-destructive.

### 34.2 What already exists

Agentsy already has most of the underlying primitives:

* `@agentsy/guardrails` PII and secret scanners
* `scrubPiiDeep()` for nested objects
* `scrubMessagesForModel()` for user-message redaction
* `BaselineManager` for suppressing known findings
* `agentsy: guardrails-ignore` inline directives
* `GuardrailsConfig` fields for `localOnly`, `piiRedaction`, `secretRedaction`, `toolAllowList`, and `egressAllowList`

The gap is the **productized workflow** and **custom-rule UX** that ZipTyPrompt exposes.

---

### 34.3 Gaps to close

#### 34.3.1 Dedicated sanitize-first command

Add a dedicated CLI surface that clearly separates "sanitize data" from "ask the model":

```bash
agentsy sanitize --input log.txt --output safe.log --mode logs
agentsy sanitize --input config.yaml --mode config --emit json
agentsy sanitize --stdin --mode logs
```

Modes:

* `logs` — PII + secrets + infrastructure details + path leakage
* `config` — secrets + connection strings + hostnames + URLs + env references
* `prompt` — current LLM prompt scrubber
* `incident` — aggressive preset for copied stack traces and error dumps

This should be a **local transform** only. No raw input leaves the device. No telemetry, no remote
upload, no server-side redaction.

#### 34.3.2 Custom regex rules

ZipTyPrompt allows org-specific masking rules. Agentsy currently lacks a user-facing rule set for
this. Add local JSON rule storage with import/export:

```json
{
  "version": 1,
  "rules": [
    {
      "id": "corp-customer-id",
      "name": "Customer ID",
      "pattern": "\bCUST-[0-9]{8}\b",
      "replacement": "[CUSTOMER_ID]",
      "enabled": true,
      "scope": ["logs", "config", "prompt"]
    }
  ]
}
```

Storage target:

* CLI/TUI: `~/.agentsy/redaction-rules.json`
* Workspace override: `.agentsy/redaction-rules.json`

Import/export commands:

```bash
agentsy sanitize rules list
agentsy sanitize rules add --pattern '...' --replacement '[REDACTED]'
agentsy sanitize rules import ./rules.json
agentsy sanitize rules export ./rules.json
```

#### 34.3.3 Infrastructure-details scanner

ZipTyPrompt calls out infrastructure details as a distinct category. Agentsy has IPs and URLs in PII,
but not a dedicated infra-focused mode. Add patterns for:

* internal hostnames and service names
* Kubernetes namespaces, pod names, cluster identifiers
* internal URLs and vanity domains
* filesystem paths and repo-local absolute paths
* stack traces with line numbers (for redaction mode, not model-debug mode)
* ports, ingress hostnames, and service discovery labels

The goal is not to over-redact the world; it is to support a **configurable infra preset** that can be
made stricter for incident response and looser for general debugging.

#### 34.3.4 Browser-local parity via local-first storage

ZipTyPrompt stores sessions and rules in browser localStorage. Agentsy should mirror the **local-only**
trust boundary in its own environment:

* all rule files local by default
* no cloud sync
* no server persistence unless explicitly opt-in
* never send raw input to any remote service for redaction

#### 34.3.5 Safety preview and diff

Before output is copied or written, show a redaction summary:

* count of detected secrets / PII / infra tokens
* list of rule IDs that fired
* optional side-by-side diff (raw vs sanitized)
* warning if content still contains unredacted URLs, bearer tokens, or connection strings

---

### 34.4 Reuse existing code instead of duplicating it

Implementation should build on the current primitives:

* `deep-scrub.ts` for recursive object sanitization
* `message-scrubbing.ts` for prompt/message flows
* `pii.ts` and `secret-detection.ts` for regex-driven redaction
* `baseline.ts` for suppressing known safe findings
* `inline-ignore.ts` for explicit per-line suppression

Do **not** fork a second redaction engine.

---

### 34.5 Tests

* Sanitizing a raw system log removes secrets, emails, URLs, and internal hostnames
* Custom regex rule masks org-specific IDs
* Workspace rule file overrides global rule file
* `incident` mode redacts stack traces and file paths more aggressively than `logs` mode
* Sanitization does not mutate input values
* No raw text is sent to remote services during sanitize command execution

---

### 34.6 Verification

* [x] `agentsy sanitize` works on stdin, files, and piped logs
* [x] `rules import/export` round-trips JSON without loss
* [x] Local-only mode is default
* [x] Infra preset demonstrably redacts hostnames, k8s names, and paths
* Preview shows counts + rule hits before output is copied
