
## 43. Phase 28 — Supply-Chain Security & Policy Attestation (DEFERRED — Post-v1)

**Priority**: P4 — Deferred. Can ship alongside Phase 24–25 (Teams/security hardening batch).
**Story points**: ~14 (preliminary)
**Branch**: `feat/supply-chain-attestation` (not yet created)
**Depends on**: Phase 4 (EthicsRegistry — attestation references ethics clauses), Phase 12 (guardrails daemon integration), Phase 15 (bootstrap — MCP/skill installation is the main OSV check point), Phase 21 (Docker tooling — attestation runs in CI)
**Unblocks**: enterprise compliance posture, supply-chain malware detection, dynamic security policy
**Status**: DEFERRED — design complete, implementation not started
**Sources**: hermes-agent (§A.14 — OSV check, exact-pinned deps), openclaw (§A.13 — policy attestation, doctor migration), gemini-cli (§A.15 — Conseca, JSON Schema)

### 43.1 Goal

Implement five supply-chain and compliance patterns:

1. **OSV malware check for MCP/skill installs** (hermes-agent) — before launching an MCP server via npx/uvx or installing a skill, query the [OSV API](https://osv.dev/) for known malware advisories. Block `MAL-*` advisories; fail-open on timeout (10s).
2. **Policy attestation/evidence system** (openclaw) — produce a `PolicyAttestation` with cryptographic hashes (policy path+hash, workspace hash, findings hash, attestation hash) for enterprise compliance. 14 evidence types.
3. **Conseca — LLM-generated per-prompt security policy** (gemini-cli) — an LLM generates a security policy from the user's prompt + available tool definitions, then enforces it per tool call. Complements agentsy's static guardrails with dynamic, intent-aware policy.
4. **Exact-pinned dependencies** (hermes-agent) — pin every direct dependency to `==X.Y.Z` (no ranges) with CVE comments. Lazy-deps for opt-in extras.
5. **Doctor migration contract** (openclaw) — `agentsy doctor --fix` detects old config shapes, explains, backs up, and rewrites to canonical format. Each extension exposes a `doctor-contract-api.ts`.
6. **Auto-generated JSON Schema** (gemini-cli) — publish a JSON Schema for `DaemonConfig` and agent YAML specs, auto-generated from TypeScript types, for IDE autocompletion.

### 43.2 Design

#### 43.2.1 OSV malware check

```typescript
// packages/guardrails/src/scanners/osv-check.ts (NEW)

export class OSVMalwareScanner implements GuardrailScanner {
  readonly id = 'osv-malware';
  readonly phase: GuardrailPhase = 'action';  // Runs before MCP/skill install
  private timeoutMs = 10_000;

  async evaluate(input: { package: string; version?: string }, context: GuardrailContext): Promise<GuardrailResult> {
    try {
      const response = await fetch('https://api.osv.dev/v1/query', {
        method: 'POST',
        body: JSON.stringify({ package: { name: input.package, ecosystem: 'npm' }, version: input.version }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const data = await response.json();

      // Only block MAL-* advisories (not regular CVEs — those are informational)
      const malwareAdvisories = (data.vulns ?? []).filter((v: any) => v.id.startsWith('MAL-'));

      if (malwareAdvisories.length > 0) {
        return {
          status: 'block',
          phase: 'action',
          reason: `Package ${input.package} has ${malwareAdvisories.length} malware advisories: ${malwareAdvisories.map((a: any) => a.id).join(', ')}`,
          detections: malwareAdvisories.map((a: any) => ({ id: a.id, severity: 'critical', description: a.summary })),
        };
      }
      return { status: 'pass', phase: 'action' };
    } catch {
      // Fail-open — OSV unavailability should not block installation
      return { status: 'pass', phase: 'action' };
    }
  }
}
```

Wire into Phase 15's bootstrap install flow — every `agentsy install mcp <id>` and `agentsy install skill <id>` runs `OSVMalwareScanner` before downloading.

#### 43.2.2 Policy attestation

```typescript
// packages/daemon/src/services/policy-attestation.ts (NEW)

export interface PolicyAttestation {
  checkedAt: string;              // ISO 8601
  policyPath: string;             // Path to the policy file (e.g. .agentsy/guardrails.yaml)
  policyHash: string;             // SHA-256 of the policy file
  workspaceHash: string;          // SHA-256 of the workspace tree (git ls-files | sha256sum)
  findingsHash: string;           // SHA-256 of the guardrail findings summary
  attestationHash: string;        // SHA-256 of all the above fields
  evidence: PolicyEvidence[];     // 14 evidence types (see openclaw §A.13)
  ethicsRegistryVersion: string;  // Version of the EthicsRegistry checked against
}

export class PolicyAttestationService {
  async generate(workspacePath: string): Promise<PolicyAttestation> {
    const policy = await this.loadPolicy(workspacePath);
    const findings = await this.runGuardrailAudit(workspacePath);
    const attestation = this.buildAttestation(policy, workspacePath, findings);
    await this.persist(attestation);
    return attestation;
  }

  // CLI: agentsy attestation generate [--workspace <path>]
  // CLI: agentsy attestation verify [--attestation <path>]
  // CI: run on every PR that touches guardrails config or agent templates
}
```

#### 43.2.3 Conseca (LLM-generated per-prompt security policy)

```typescript
// packages/guardrails/src/scanners/conseca.ts (NEW)

export class ConsecaScanner implements GuardrailScanner {
  readonly id = 'conseca';
  readonly phase: GuardrailPhase = 'input';
  readonly priority = 5;  // Runs first — generates policy before other scanners

  async evaluate(input: string, context: GuardrailContext): Promise<GuardrailResult> {
    // 1. Generate a security policy from the user's prompt + available tools
    const policy = await this.llm.generate({
      system: CONSECA_SYSTEM_PROMPT,
      user: JSON.stringify({
        prompt: input,
        availableTools: context.availableTools?.map(t => ({ name: t.name, description: t.description })),
      }),
      responseFormat: { type: 'json_schema', schema: CONSECA_POLICY_SCHEMA },
    });

    // 2. Attach the generated policy to the context for per-tool-call enforcement
    context.generatedPolicy = JSON.parse(policy);

    // 3. Don't block — just attach. Per-tool-call enforcement happens in the
    //    PreToolCall hook, which checks the generated policy.
    return { status: 'pass', phase: 'input' };
  }
}

// The generated policy has the shape:
// {
//   "decision": "allow" | "deny" | "ask_user",
//   "allowedTools": ["read_file", "search_files"],
//   "deniedTools": ["run_command"],
//   "reasoning": "The user wants to read files; run_command is not needed.",
//   "restrictions": { "maxFilesize": "1MB", "allowedPaths": ["/src/**"] }
// }
```

Conseca complements agentsy's static guardrails (Phase 9 detectors, Phase 20 ethical policy) — it adds intent-aware dynamic policy on top. The static guardrails always run; Conseca adds an additional layer.

#### 43.2.4 Exact-pinned dependencies

Update all `package.json` files to use exact versions (`1.2.3` not `^1.2.3`). Add a CI check that rejects ranged dependencies:

```typescript
// scripts/check-exact-pinned-deps.ts (NEW)
// Runs in CI; exits non-zero if any direct dependency uses ^, ~, or >=
```

Add CVE comments to dependencies with known issues:

```json
{
  "dependencies": {
    // CVE-2026-XXXX: fixed in 1.2.4; pin to >=1.2.4
    "some-package": "1.2.4"
  }
}
```

#### 43.2.5 Doctor migration

```typescript
// packages/cli/src/commands/doctor.ts (NEW)

export class DoctorCommand {
  async run(fix: boolean): Promise<void> {
    // 1. Detect old config shapes (e.g. pre-Phase 2 GuardrailsConfig)
    const issues = await this.detectConfigIssues();

    // 2. For each issue, explain what changed and why
    for (const issue of issues) {
      console.warn(`[doctor] ${issue.description}`);
      console.warn(`  Migration: ${issue.migrationGuide}`);
    }

    // 3. If --fix, back up old config and rewrite to canonical
    if (fix) {
      for (const issue of issues) {
        await this.backupConfig(issue.path);
        await this.rewriteConfig(issue.path, issue.canonicalForm);
        console.info(`[doctor] Fixed: ${issue.path} (backup at ${issue.path}.bak)`);
      }
    }
  }
}
```

Each package/extension that has a config shape exposes a `doctor-contract-api.ts` that the doctor command discovers and invokes.

#### 43.2.6 Auto-generated JSON Schema

```typescript
// scripts/generate-json-schema.ts (NEW)

import { zodToJsonSchema } from 'zod-to-json-schema';
import { DaemonConfigSchema } from '../packages/daemon/src/config.js';
import { AgentSpecSchema } from '../packages/agents/src/specs/schema.js';

// Generate schemas for IDE autocompletion
writeFileSync('schemas/daemon-config.json', JSON.stringify(zodToJsonSchema(DaemonConfigSchema), null, 2));
writeFileSync('schemas/agent-spec.json', JSON.stringify(zodToJsonSchema(AgentSpecSchema), null, 2));

// Publish to agentsy.dev/schemas/ for IDE configuration
```

### 43.3 Verification (when activated)

- [ ] OSV malware scanner blocks `MAL-*` advisories on MCP/skill install
- [ ] OSV scanner fails open on timeout (10s)
- [ ] Policy attestation generates cryptographic hashes (policy, workspace, findings, attestation)
- [ ] `agentsy attestation generate` / `agentsy attestation verify` CLI commands work
- [ ] Policy attestation runs in CI on PRs touching guardrails or agent templates
- [ ] Conseca generates a per-prompt security policy from user intent + tools
- [ ] Conseca policy enforced per-tool-call (allowed/denied/ask_user)
- [ ] Conseca complements (does not replace) static guardrails
- [ ] All `package.json` files use exact-pinned dependencies (no `^`, `~`, `>=`)
- [ ] CI check rejects ranged dependencies
- [ ] CVE comments present on dependencies with known issues
- [ ] `agentsy doctor --fix` detects, explains, backs up, and rewrites old config shapes
- [ ] Doctor migration contract discovered from each extension's `doctor-contract-api.ts`
- [ ] JSON Schema for `DaemonConfig` and agent specs auto-generated and published
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

---
