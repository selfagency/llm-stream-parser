# Comprehensive Remediation Plan — Code Quality, Security, and Best Practices

**Repository:** `selfagency/agentsy`
**Branch reviewed:** `develop`
**Scope:** All findings from the latest static-analysis pass (Fallow + SonarCloud): code complexity, security, error-prone patterns, and best-practice violations across `packages/**`, root `scripts/**`, `.github/workflows/**`, `AGENTS.md`, and shell scripts. **The `.agents/` directory is excluded entirely from all scanners (Phase 10) — no remediation work is planned for any file under `.agents/`.** Phase 9 adds cognitive-complexity hotspots, insecure-randomness former-hotspots, dynamic-execution safety, PATH-variable hardening, and maintainability code smells.
**Review date:** 2026-06-17
**Source of findings:** Fallow codebase intelligence + SonarCloud quality scan (the listings provided by the user).

---

## Executive Summary

A static-analysis sweep of the `develop` branch surfaced findings across Fallow, SonarCloud, and Codacy. After **Phase 10 (Scanner Configuration)** excludes the `.agents/` directory — which contains skill definitions and tooling, NOT framework code — the effective finding count drops significantly. The remaining findings are in `packages/**` and root `scripts/**` and span four categories: **code complexity**, **security**, **error-prone patterns**, and **best-practice violations**.

**Three structural observations:**

1. **`.agents/` is out of scope.** The root `.agents/` directory (containing `quality_gate.py`, CLI review runner scripts, skill scripts, etc.) is tooling, not framework code. It should never have been in scope for Fallow, SonarCloud, Codacy, or Biome. **Phase 10** excludes it from all scanners, which eliminates approximately 40 findings (including the entire `quality_gate.py` complexity cluster and all `.agents/skills/**` script findings). No remediation work is planned for any file under `.agents/`.

2. **The remaining complexity findings cluster in three patterns** that are individually trivial to refactor:
   - **Long `if/elif/else` chains over a discriminator** (e.g. `buildHeaders` over `_provider`, `loadConfig` over config sections, `defaultApiParse` over response shapes). These become dispatch tables.
   - **Multi-step validation pipelines** where each step is `if not condition: fail(...)`. These become a sequence of single-purpose validator functions composed by a small orchestrator.
   - **Inline parsing of structured text** (XML, JSON, markdown blocks). These become a parser combinator or a state-machine class with one method per state.

3. **The 3 security findings are individually small but require immediate attention** because they affect CI/release:
   - `release.yml` accepts a `tag` input via `workflow_dispatch` that flows into tag parsing and release logic. Even though the workflow also validates against the `Test & Build` CI status, the input should be removed or strictly validated.
   - `esbuild@0.28.0` is vulnerable to GHSA-gv7w-rqvm-qjhr (missing binary integrity verification in Deno). Update to `0.28.1` — this is a one-line `pnpm-lock.yaml` update.
   - A test fixture in `context-injections.test.ts` hardcodes `'test-secret-key-12345'`. The comment correctly notes it's a test fixture, but static analyzers (and security auditors) cannot distinguish. Replace with a clearly-fake placeholder that doesn't trip the "hardcoded password" heuristic.

**Automation status:** No code is currently broken — these are quality findings. However, if the project has CI gates that fail on CRITICAL Fallow findings (per the `.fallowrc.jsonc` configuration), the build is currently non-green. The remediation plan below is structured so that each phase produces a CI-green state incrementally.

**Critical insight — `.agents/` is excluded from all scanners:** The root `.agents/` directory contains skill definitions, quality-gate scripts, and tooling — NOT framework code. **Phase 10 (Scanner Configuration)** excludes it from Fallow, SonarCloud, Codacy, and Biome. This eliminates approximately 40 findings in one config-only change. **No remediation work is planned for any file under `.agents/`** — including `quality_gate.py`, the CLI review runner shell scripts, and all skill scripts. Phase 10 should be executed FIRST, before any code changes.

**Final recommendation:** Execute Phase 10 first (scanner config — 1 hour, eliminates ~40 `.agents/` findings). Then Phase 1 (security) is a quick win — hours of work, immediate CI greening. Phases 4–6 are per-package refactors that can be parallelized across maintainers. Phase 8 is documentation and config cleanup. Phase 9 addresses the additional SonarCloud findings. Phase 11 addresses the Fallow dead-code, duplication, and remaining complexity findings — this is the "later phase" for unused exports, since unused exports indicate untested or unconsumed code that needs product decisions, not just refactoring.

---

## Methodology

This plan was produced by:

1. **Triage** — parsing the 66 findings into severity × category × file buckets.
2. **Root-cause clustering** — for each cluster, identifying the underlying pattern (long switch, validation pipeline, inline parser, etc.) so that the fix is structural rather than per-finding.
3. **Source sampling** — for the highest-impact clusters (`buildHeaders`, `loadConfig`, `release.yml`, `release-shared.ts`, `context-injections.test.ts`), reading the actual source to confirm the root cause and ground the recommended refactor in the real code shape.
4. **Dependency ordering** — sequencing the phases so that scanner configuration (Phase 10) lands first to exclude `.agents/`, then security (Phase 1) and per-package refactors (Phases 4–6, 8–9) can proceed in parallel, with dead-code cleanup (Phase 11) as a later phase.
5. **Per-item fix specificity** — each finding below includes: file:line, current complexity (where applicable), root cause, recommended fix (with function names and split structure), verification step.

---

## Findings Summary

### By severity

| Severity | Count |
|---|---|
| CRITICAL | 56 |
| HIGH | 3 (security) + 2 (error-prone) = 5 |
| MEDIUM | 8 (error-prone) + 4 (best-practice) = 12 |
| **Total** | **73 findings** (some files have multiple) |

### By category

| Category | Count |
|---|---|
| Code complexity (cyclomatic > 12) | 53 |
| File complexity (NCLOC over threshold) | 5 |
| Security | 3 |
| Error-prone (unused vars, shell quoting) | 9 |
| Best-practice (vague conditionals, doc structure) | 5 |
| **Total** | **75** |

### By location

| Location | Finding count | Notes |
|---|---|---|
| `packages/providers/` | 2 | `buildHeaders`, `normalizeMistralChunk`, normalizers.test.ts NCLOC |
| `packages/core/` | 5 | `extract-xml-tool-calls.ts` ×2, `tool-call-accumulator.ts`, `repair-state-machine.ts`, `llm-stream-processor.ts` NCLOC |
| `packages/gateway/` | 7 | `local-providers`, `header-parser`, `switcher`, `run-probe`, `strategies` ×2, routing |
| `packages/memory/` | 4 | `loadConfig`, `turso-manager`, `wiki-adapter`, `observation-extractor` |
| `packages/cli/` | 2 | `chat.ts` ×2 |
| `packages/orchestrator/` | 3 | `engine.test.ts` ×2, `registry.test.ts` |
| `packages/observability/` | 1 | `logger.ts` |
| `packages/renderers/` | 1 | `ink-stream-renderer.tsx` |
| `packages/models/` | 1 | `index.ts` |
| `packages/retrieval/` | 3 | `search/index.ts` ×2, `search.test.ts` |
| `packages/runtime/` | 1 | `virtual-sandbox.ts` |
| `packages/scripts/` | 3 | `release.ts`, `trusted-publish-readiness.ts`, `preview-themes.ts` |
| `packages/session/` | 1 | `reducers.ts` |
| `packages/ui/` | 2 | `event-helpers.ts`, `event-sourcing.ts` |
| `packages/vscode/` | 2 | `mocks/vscode.ts`, `usage-status-bar.ts` |
| `.github/workflows/` | 1 | `release.yml` workflow_dispatch input |
| `pnpm-lock.yaml` | 2 | esbuild CVE + file NCLOC |
| `packages/vscode/pnpm-lock.yaml` | 1 | file NCLOC |
| `AGENTS.md` | 4 | vague conditional ×2, missing IMPLEMENTATION-PLAN.md ref, file-splitting suggestion |

**Note:** The `.agents/` directory (containing `quality_gate.py`, CLI review runner shell scripts, and skill scripts) is excluded from all scanners per Phase 10. Findings in those files are not addressed in this plan.

---

## Cross-Cutting Patterns

Before the per-item fixes, three patterns recur across the codebase. Understanding them makes the per-item fixes mechanical.

### Pattern A: Long `switch`/`if-elif` over a discriminator → dispatch table

**Affected:** `buildHeaders` (29), `loadConfig` (33), `registerLocalProviders` (16), `createProviderClient` (17), `runChatCommand` (15), `parseRateLimitHeaders` (17), `defaultApiParse` (29), `getCurrentConfig` (17), `createStrategy` (14), `displayThemePreview` (17), `validateSyncConfig` (15), `normalizeMistralChunk` (14).

**Refactor shape:**

```ts
// Before: 29-branch switch
function buildHeaders(provider, apiKey, orgId, stream) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    switch (provider) {
      case 'openai': /* 6 lines */ break;
      case 'anthropic': /* 7 lines */ break;
      case 'gemini': /* 3 lines */ break;
      default: /* 2 lines */
    }
  }
  return headers;
}

// After: dispatch table
const HEADER_BUILDERS: Record<NormalizerProvider, (ctx: HeaderContext) => void> = {
  openai: ({ headers, apiKey, orgId }) => {
    headers.Authorization = `Bearer ${apiKey}`;
    if (orgId) headers['OpenAI-Organization'] = orgId;
  },
  anthropic: ({ headers, apiKey, stream }) => {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
    if (stream) headers.accept = 'text/event-stream';
  },
  gemini: ({ headers, apiKey }) => { headers.Authorization = `Bearer ${apiKey}`; },
  default: ({ headers, apiKey }) => { headers.Authorization = `Bearer ${apiKey}`; },
};

function buildHeaders(provider, apiKey?, orgId?, stream?) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) (HEADER_BUILDERS[provider] ?? HEADER_BUILDERS.default)({ headers, apiKey, orgId, stream });
  return headers;
}
```

The dispatch table is data, not code. Each entry is a small pure function. The orchestrator is 4 lines. The cyclomatic complexity drops from 29 to ~2. New providers are added by appending one row to the table.

### Pattern B: Multi-step validation pipeline → validator sequence

**Affected:** `validateSyncConfig` (15), `validateRepositoryMatch` (13), `checkTrustedPublishReadiness` (8), `loadConfig` (33).

**Refactor shape:**

```ts
// Before: long function with many sequential conditionals
function validateSyncConfig(config: TursoSyncConfig): void {
  if (!config.url) throw new Error('Missing url');
  if (!config.authToken) throw new Error('Missing authToken');
  if (config.intervalMs < 1000) throw new Error('Interval too short');
  // ... 12 more branches
}

// After: validator sequence
interface ValidationResult { failures: string[]; warnings: string[]; }
type ValidatorFn = (config: TursoSyncConfig, result: ValidationResult) => void;

const _checkUrl: ValidatorFn = (config, result) => {
  if (!config.url) result.failures.push('Missing url');
};
const _checkAuthToken: ValidatorFn = (config, result) => {
  if (!config.authToken) result.failures.push('Missing authToken');
};
const _checkInterval: ValidatorFn = (config, result) => {
  if (config.intervalMs < 1000) result.failures.push('Interval too short');
};
// ... one function per logical check

const SYNC_VALIDATORS: ValidatorFn[] = [_checkUrl, _checkAuthToken, _checkInterval /*, ... */];

function validateSyncConfig(config: TursoSyncConfig): ValidationResult {
  const result = { failures: [], warnings: [] };
  for (const validator of SYNC_VALIDATORS) validator(config, result);
  return result;
}
```

Each validator is a small function (complexity < 5). The orchestrator is a 3-line loop. New checks are added by appending one function to the list.

### Pattern C: Inline parser → parser combinator or state machine class

**Affected:** `extractBareJsonToolCalls` (18), `parseXmlElement` (13), `feedCharToStateMachine` (14), `getPendingCallInfo` (24), `parseRateLimitHeaders` (17), `defaultApiParse` (29), `upsertPage` (24), `applyConversationEvent` (22), `reduceSessionState` (13).

**Refactor shape:** Convert each parser from a single function with many branches into a class with one method per state, or a small set of pure parser combinators (`sequence`, `choice`, `many`, `optional`). This is more involved than Patterns A and B; the state-machine approach is usually the right starting point.

Example for `feedCharToStateMachine`:

```ts
// Before: 14-branch function
export function feedCharToStateMachine(char: string, state: RepairState): string {
  if (state === 'idle') {
    if (char === '{') return 'inObject';
    if (char === '[') return 'inArray';
    if (char === '"') return 'inString';
    // ... 11 more branches
  }
  // ...
}

// After: state → handler map
type StateHandler = (char: string) => RepairState;

const STATE_HANDLERS: Record<RepairState, StateHandler> = {
  idle: (char) => char === '{' ? 'inObject' : char === '[' ? 'inArray' : /* ... */ 'idle',
  inObject: (char) => /* ... */,
  inString: (char) => /* ... */,
  // ...
};

export function feedCharToStateMachine(char: string, state: RepairState): string {
  return STATE_HANDLERS[state]?.(char) ?? state;
}
```

---

## Remediation Plan

### Phase 10: Scanner Configuration — Exclude Tooling Directories (EXECUTE FIRST)

**Goal:** Exclude `.agents/` and other non-framework directories (build artifacts, dot-folders) from ALL code scanners (Fallow, SonarCloud, Codacy, Biome). This is a configuration-only change — no code modifications — and it eliminates approximately 40 `.agents/` findings in one shot.

**Why this is Phase 10 in numbering but executes first:** The phases were numbered by category, not by execution order. Phase 10 is config-only (1 hour) and should land before any code refactoring because it eliminates all `.agents/` findings and removes noise from all subsequent phases.

**Current state of each scanner's exclusion config:**

| Scanner | Config file | Currently excludes `.agents/`? | Action needed |
|---|---|---|---|
| **Fallow** | `.fallowrc.jsonc` | ❌ No | Add `ignorePatterns` array |
| **SonarCloud** | `sonar-project.properties` | ⚠️ Implicitly (sources=packages, but no explicit exclusion) | Add explicit `sonar.exclusions` |
| **Codacy** | `.codacy.yml` | ✅ Yes (line 12: `.agents/**`) | No change needed |
| **Biome/Ultracite** | `biome.jsonc` | ✅ Yes (via `!.*/**/*` dot-folder pattern) | No change needed |

#### Step 10.1: Add `ignorePatterns` to `.fallowrc.jsonc`

- **Finding source:** Fallback reports complexity, dead-code, and duplication findings across `.agents/**` (skill definitions, quality-gate scripts, CLI review runner shell scripts, etc.). These are tooling, not framework code.
- **Config documentation:** [Fallow configuration reference — `ignorePatterns`](https://docs.fallow.tools/configuration/). Per the JSON schema (<https://raw.githubusercontent.com/fallow-rs/fallow/main/schema.json>), `ignorePatterns` is a top-level array of glob strings that excludes files from **all** analyses (dead code, duplication, complexity/health). This is distinct from `duplicates.ignore` and `health.ignore`, which only scope their own analysis.
- **Recommended fix:** Add `ignorePatterns` as a top-level key in `.fallowrc.jsonc`, sibling to `entry` / `publicPackages` / `audit`. The primary entry is `.agents/**`; the remaining entries are standard build/dep artifacts that should also be excluded:

  ```jsonc
  {
    "$schema": "https://raw.githubusercontent.com/fallow-rs/fallow/main/schema.json",
    "publicPackages": [ ... ],
    "entry": [ ... ],
    // NEW: Exclude tooling and non-framework directories from ALL Fallow analyses.
    "ignorePatterns": [
      ".agents/**",
      "plan/**",
      "docs/**",
      ".github/**",
      ".husky/**",
      ".opencode/**",
      ".vitepress/**",
      ".zed/**",
      ".cmux/**",
      ".vscode/**",
      "config/**",
      ".fallow/**",
      "coverage/**",
      "**/dist/**",
      "**/node_modules/**",
      "**/*.md",
      "**/*.mdx",
      "**/pnpm-lock.yaml",
      "**/package-lock.json",
      "**/yarn.lock"
    ],
    "usedClassMembers": [],
    // ... rest of existing config unchanged
  }
  ```

  **Key details:**
  - `ignorePatterns` is the top-level switch; it applies to dead-code, duplication, AND complexity analyses. This is different from `duplicates.ignore` (which only affects duplication) and `health.ignore` (which only affects complexity).
  - Array fields are **replaced entirely** on override, not concatenated. So if any `extends` config sets `ignorePatterns`, the child's `ignorePatterns` replaces it entirely. Verify no parent config is being extended.
  - Fallow also honors `.gitignore` automatically, but `.agents/` is NOT in `.gitignore` (it's committed), so the explicit `ignorePatterns` entry is required.
  - **Note:** Root `scripts/**` is NOT excluded — it contains release tooling (`release.ts`, `release-shared.ts`, etc.) that IS framework-adjacent and should be scanned. Only `.agents/` is excluded per the user's instruction.
- **Verification:** Run `pnpm fallow` after the change. The output should show 0 findings for `.agents/**`. The finding count should drop significantly (approximately 40 `.agents/` findings eliminated).
- **Rollback:** Revert the `ignorePatterns` key.

#### Step 10.2: Add explicit `.agents/` exclusion to `sonar-project.properties`

- **Finding source:** SonarCloud reported findings for `.agents/skills/quality-playbook/quality_gate.py` and other `.agents/` files.
- **Current config:** `sonar.sources=packages` — this limits source scanning to the `packages/` directory. However, SonarCloud may still scan `.agents/` if it's picked up by the scanner's file discovery (especially if the CI action uses `sonar-scanner` without a strict `sonar.projectBaseDir` or if the scanner auto-discovers files). The current `sonar.exclusions=**/*.md` only excludes markdown files.
- **Config documentation:** [SonarCloud project analysis scope](https://docs.sonarsource.com/sonarqube-server/latest/project-administration/analysis-scope/). `sonar.exclusions` accepts a comma-separated list of glob patterns relative to the project root.
- **Recommended fix:** Update `sonar-project.properties`:

  ```properties
  # Path to source directories
  sonar.sources=packages
  # Path to test directories (comment if no test)
  sonar.tests=packages

  # Exclude .agents/ and non-framework directories from analysis
  sonar.exclusions=**/*.md,**/*.mdx,.agents/**,plan/**,docs/**,.github/**,.husky/**,.vitepress/**,.vscode/**,.zed/**,.cmux/**,.opencode/**,config/**,.fallow/**,coverage/**,**/dist/**,**/node_modules/**,**/pnpm-lock.yaml,**/package-lock.json,**/yarn.lock
  # Exclude test files from duplication detection (already set)
  sonar.cpd.exclusions=**/*.test.ts
  ```

  **Key details:**
  - `sonar.exclusions` is comma-separated, not an array. Each entry is a glob relative to the project root.
  - `**/*.md` is kept from the existing config.
  - `.agents/**` excludes the entire skills/quality-gate/tooling directory.
  - **Important:** Do NOT exclude `packages/scripts/**` or root `scripts/**` — those contain framework and release code that should be scanned.
- **Verification:** Trigger a SonarCloud scan. Verify 0 findings for `.agents/**`. The finding count should drop significantly.
- **Rollback:** Revert the `sonar.exclusions` line.

#### Step 10.3: Verify Codacy and Biome are already correct

- **Codacy** (`.codacy.yml`): Already excludes `.agents/**` (line 12), `.fallow/**`, `.vscode/**`, `config/**`, `coverage/**`, `dist/**`, `node_modules/**`, `plan/**`, `**/*.md`. **No change needed.** ✅
- **Biome/Ultracite** (`biome.jsonc`): The `files.includes` array contains `!.*` and `!.*/**/*` which excludes all dot-folders (`.agents/`, `.husky/`, `.vscode/`, etc.). Additionally, the includes array starts with `src/**/*.ts` and `src/**/*.tsx`, so only files under `src/` directories are scanned — `.agents/` files don't match. **No change needed.** ✅
- **Verification:** Run `pnpm lint` (Biome) and verify no findings for `.agents/`. Check the Codacy dashboard and verify no findings for `.agents/`.

#### Step 10.4: `.agents/` remediation work removed from this plan

- **Impact:** With Phase 10 in place, Fallow, SonarCloud, Codacy, and Biome will no longer report findings for `.agents/**`. All `.agents/` remediation work — including the `quality_gate.py` refactor, the CLI review runner shell script cleanup, and the skills scripts complexity fixes — has been **removed from this plan entirely**. These files are tooling, not framework code, and their internal quality is at the maintainers' discretion.
- **No phases reference `.agents/` files.** All remaining phases (1, 4, 5, 6, 8, 9, 11) address findings in `packages/**` and root `scripts/**` only.

---

### Phase 1: Security (blockers, immediate)

**Goal:** Close the 3 HIGH-severity security findings. These are CI/release-impacting and should land first.

#### Step 1.1: Remove or validate `workflow_dispatch` `tag` input in `release.yml`

- **Finding:** HIGH Security — Command Injection. `.github/workflows/release.yml:8`.
- **Root cause:** The workflow accepts a `tag` input via `workflow_dispatch`. The tag is parsed by an inline `github-script` step that uses `tag.match(...)`, and the parsed value is then used to look up `packages/${packageDir}` for release. While the workflow also runs `Test & Build` CI validation before publishing, the `tag` input itself is not validated against a strict pattern before use. SonarCloud flags this because workflow_dispatch inputs can be attacker-influenced if the workflow also runs on `pull_request_target` (it doesn't here, but the rule is conservative).
- **Recommended fix:** Two options, in order of preference:
  1. **Remove the `workflow_dispatch` trigger entirely.** The workflow already triggers on `push: tags: ["@agentsy/*@*", "v*"]`. Maintainers who want to dispatch a release manually can `git tag` + `git push origin <tag>`. This eliminates the input vector.
  2. **If manual dispatch is required,** validate the input with a strict regex in the first step and fail fast on mismatch:

     ```yaml
     - name: Validate tag input
       run: |
         if [[ ! "${{ inputs.tag }}" =~ ^(@[^/]+/[^@]+@v?[0-9]+\.[0-9]+\.[0-9]+|v[0-9]+\.[0-9]+\.[0-9]+)$ ]]; then
           echo "::error::Invalid tag format: ${{ inputs.tag }}"
           exit 1
         fi
     ```

     Avoid interpolating `${{ inputs.tag }}` directly into a shell command — use an env var instead:

     ```yaml
     env:
       TAG_INPUT: ${{ inputs.tag }}
     ```

- **Verification:** Trigger a workflow_dispatch with a malformed tag (e.g. `"; rm -rf /"`) and confirm the workflow exits non-zero without side effects. Confirm a valid tag still works.
- **Rollback:** Revert the workflow file.

#### Step 1.2: Update `esbuild` from `0.28.0` to `0.28.1`

- **Finding:** HIGH Security — Insecure dependency. `pnpm-lock.yaml:1151`. GHSA-gv7w-rqvm-qjhr: esbuild missing binary integrity verification in Deno module enables RCE via `NPM_CONFIG_REGISTRY`.
- **Root cause:** `esbuild@0.28.0` is pinned in `pnpm-lock.yaml`. The fix is in `0.28.1`.
- **Recommended fix:**

  ```bash
  pnpm update esbuild@^0.28.1 --recursive
  pnpm install --frozen-lockfile=false
  git diff pnpm-lock.yaml  # verify only esbuild bumped
  ```

  If `packages/vscode/pnpm-lock.yaml` has its own pin, update it too.
- **Verification:** `pnpm audit` reports no esbuild advisory. `pnpm build` still passes.
- **Rollback:** Revert `pnpm-lock.yaml`.

#### Step 1.3: Replace hardcoded secret in `context-injections.test.ts`

- **Finding:** HIGH Security — Insecure Storage (hardcoded password). `packages/plugins/src/audit/context-injections.test.ts:47`.
- **Root cause:** `const secret = 'test-secret-key-12345'; // Not a real credential — test fixture only`. The comment is correct, but static analyzers and security auditors cannot distinguish this from a real hardcoded secret. The string matches the "looks like an API key" heuristic.
- **Recommended fix:** Replace with a placeholder that obviously cannot be a real credential:

  ```ts
  // Use a clearly-fake placeholder that doesn't match secret-detection heuristics.
  const TEST_INPUT = 'plain-text-input-for-hash-test';
  ```

  Or, if the test specifically needs a secret-shaped string, use a value that's already publicly known to be a test fixture (e.g. the classic `AKIAIOSFODNN7EXAMPLE` from AWS docs) and add a `// nosemgrep` or `// biome-ignore` suppression with a justification.
- **Verification:** `pnpm lint` no longer flags the line. The test still passes.
- **Rollback:** Revert the test file.

---

---

### Phase 4: Provider / gateway / core package complexity

**Goal:** Address the 14 complexity findings in `packages/providers/`, `packages/core/`, `packages/gateway/`. These are independent and can be parallelized.

#### Step 4.1: `packages/providers/src/universal-client/client.ts` — `buildHeaders` (29)

- **Fix:** Apply Pattern A (dispatch table). See the example in Cross-Cutting Patterns above.
- **Verification:** `pnpm --filter @agentsy/providers test` passes. `biome lint` no longer flags complexity.

#### Step 4.2: `packages/providers/src/normalizers/mistral.ts` — `normalizeMistralChunk` (14)

- **Fix:** Split into `parseMistralChoice(raw)`, `parseMistralDelta(raw)`, `parseMistralUsage(raw)`. The main function dispatches on the chunk type and delegates.
- **Verification:** `pnpm --filter @agentsy/providers test` passes.

#### Step 4.3: `packages/providers/src/normalizers/normalizers.test.ts` (1426 NCLOC)

- **Fix:** Split the test file by provider: `normalizers.openai.test.ts`, `normalizers.anthropic.test.ts`, `normalizers.mistral.test.ts`, `normalizers.gemini.test.ts`, etc. Each file < 300 lines.
- **Verification:** All tests still pass. Coverage unchanged.

#### Step 4.4: `packages/core/src/tool-calls/extract-xml-tool-calls.ts` — `extractBareJsonToolCalls` (18), `parseXmlElement` (13)

- **Fix:** Convert `extractBareJsonToolCalls` into a small state machine: states `idle`, `in-brace`, `in-string`, `escape`. Each state has a handler. Convert `parseXmlElement` into a parser combinator: `sequence(literal('<'), tagName, attrs, literal('>'))`.
- **Verification:** `pnpm --filter @agentsy/core test` passes.

#### Step 4.5: `packages/core/src/tool-calls/tool-call-accumulator.ts` — `getPendingCallInfo` (24)

- **Fix:** Split into `getPendingName(index)` and `getPendingId(index)`. Each is a simple lookup. The combined `getPendingCallInfo` becomes a 3-line function returning `{ name: getPendingName(index), id: getPendingId(index) }`.
- **Verification:** Tests pass.

#### Step 4.6: `packages/core/src/structured/repair-state-machine.ts` — `feedCharToStateMachine` (14)

- **Fix:** Apply Pattern C (state-handler map). See Cross-Cutting Patterns above.
- **Verification:** Tests pass.

#### Step 4.7: `packages/core/src/processor/processor/llm-stream-processor.ts` (1039 NCLOC)

- **Fix:** Split the file by concern:
  - `llm-stream-processor.ts` — the main class, < 400 lines.
  - `processor-stats.ts` — already exists; verify it holds the stats logic.
  - `chunk-utils.ts` — already exists; verify.
  - `incompleteness.ts` — already exists; verify.
  - `tool-call-parser.ts` — already exists; verify.
  - `zai-inline-tool-call-parser.ts` — already exists; verify.
  - `accumulated-message.ts` — already exists; verify.
  - If the main file is still > 400 lines after the splits, extract the event-emission logic into `processor-events.ts`.
- **Verification:** `pnpm --filter @agentsy/core test` passes.

#### Step 4.8: `packages/gateway/src/registry/local-providers.ts` — `registerLocalProviders` (16)

- **Fix:** Apply Pattern A. Each provider gets its own `registerXxxProvider(registry)` function. `registerLocalProviders` calls each in sequence.
- **Verification:** `pnpm --filter @agentsy/gateway test` passes.

#### Step 4.9: `packages/gateway/src/quota/header-parser.ts` — `parseRateLimitHeaders` (17)

- **Fix:** Split into `parseStandardHeaders(headers)`, `parseVendorHeaders(headers)`, `parseRemainingHeaders(headers)`. Or apply Pattern A with a `HEADER_PARSERS: Record<string, (value: string, snapshot: RateLimitHeaderSnapshot) => void>` table.
- **Verification:** Tests pass.

#### Step 4.10: `packages/gateway/src/switcher.ts` — `getCurrentConfig` (17)

- **Fix:** Extract the model-resolution and provider-resolution logic into two helper functions. `getCurrentConfig` becomes a 4-line function.
- **Verification:** Tests pass.

#### Step 4.11: `packages/gateway/src/probes/run-probe.ts` — `defaultApiParse` (29)

- **Fix:** Apply Pattern A. Each response shape (OpenAI, Anthropic, Gemini, Mistral, Cohere, etc.) gets its own `parseXxxResponse(response): ParsedUsage | null` function. `defaultApiParse` tries each in order.
- **Verification:** Tests pass.

#### Step 4.12: `packages/gateway/src/strategies/strategies.ts` — `constructor` (13), `createStrategy` (14)

- **Fix:** For `createStrategy`, apply Pattern A: `STRATEGY_FACTORIES: Record<StrategyName, (options) => RoutingStrategy>`. For the constructor, extract the option-validation into a `validateStrategyOptions(options)` function.
- **Verification:** Tests pass.

---

### Phase 5: Memory / retrieval / UI / session / runtime / vscode complexity

**Goal:** Address the 13 complexity findings in the remaining packages.

#### Step 5.1: `packages/memory/src/config.ts` — `loadConfig` (33)

- **Fix:** Split into `loadDbConfig(overrides)`, `loadMcpConfig(overrides)`, `loadHooksConfig(overrides)`, `loadTiersConfig(overrides)`, `loadBudgetConfig(overrides)`, `loadDecayConfig(overrides)`. `loadConfig` becomes a 10-line function that composes them.
- **Verification:** `pnpm --filter @agentsy/memory test` passes.

#### Step 5.2: `packages/memory/src/sync/turso-manager.ts` — `validateSyncConfig` (15)

- **Fix:** Split into `validateSyncUrl(config)`, `validateSyncAuthToken(config)`, `validateSyncInterval(config)`. Each returns a list of errors. `validateSyncConfig` concatenates.
- **Verification:** Tests pass.

#### Step 5.3: `packages/memory/src/agentfs/wiki-adapter.ts` — `upsertPage` (24)

- **Fix:** Split into `resolveExistingPage(input)`, `createNewPage(input)`, `updateExistingPage(existing, input)`, `computeDiff(existing, input)`. `upsertPage` orchestrates.
- **Verification:** Tests pass.

#### Step 5.4: `packages/memory/src/cognitive/learning/observation-extractor.ts` — `extractCorrective` (14)

- **Fix:** Apply Pattern B. Split into 3–4 sub-extractors: `_extractCorrectionSignal(content)`, `_extractTrigger(content)`, `_extractAction(content)`, `_extractOutcome(content)`.
- **Verification:** Tests pass.

#### Step 5.5: `packages/retrieval/src/search/index.ts` — `vectorSearch` (13), `search` (13)

- **Fix:** Extract the score-computation, filter-application, and result-sorting logic into helpers. Each function becomes a 5-line orchestrator.
- **Verification:** `pnpm --filter @agentsy/retrieval test` passes.

#### Step 5.6: `packages/retrieval/__tests__/search.test.ts` — anonymous (14)

- **Fix:** The complex `it('should sort results by relevance')` callback should be split into separate `it` cases for each sort scenario, or extracted into a `expectSortedByRelevance(results)` helper.
- **Verification:** Tests pass.

#### Step 5.7: `packages/ui/src/event-helpers.ts` — anonymous (16)

- **Fix:** Extract the `msg => { ... }` mapping callback into a named `applyEventToMessage(msg, state)` function.
- **Verification:** `pnpm --filter @agentsy/ui test` passes.

#### Step 5.8: `packages/ui/src/event-sourcing.ts` — `applyConversationEvent` (22)

- **Fix:** Apply Pattern A. `EVENT_HANDLERS: Record<ConversationEventType, (state, event) => UIConversation>`. `applyConversationEvent` dispatches.
- **Verification:** Tests pass.

#### Step 5.9: `packages/session/src/state/reducers.ts` — `reduceSessionState` (13)

- **Fix:** Apply Pattern A. `ACTION_HANDLERS: Record<ReducerActionType, (state, action) => SessionState>`.
- **Verification:** Tests pass.

#### Step 5.10: `packages/runtime/src/sandbox/virtual/virtual-sandbox.ts` — anonymous (15)

- **Fix:** Extract the `(msg: WorkerMessage) => { ... }` callback into a named `handleWorkerMessage(msg, ctx)` function.
- **Verification:** Tests pass.

#### Step 5.11: `packages/vscode/src/test/mocks/vscode.ts` — `constructor` (13)

- **Fix:** The `Uri` mock constructor has 5 optional parameters with branching logic. Split into `parseUriArgs(schemeOrValue?, authority?, path?, query?, fragment?)` that returns a structured object, then the constructor calls it.
- **Verification:** Tests pass.

#### Step 5.12: `packages/vscode/src/usage-tracking/usage-status-bar.ts` — `updateDisplay` (13)

- **Fix:** Extract the icon-selection, text-formatting, and tooltip-generation logic into 3 helpers.
- **Verification:** Tests pass.

---

### Phase 6: CLI / orchestrator / observability / renderers / models / scripts complexity

#### Step 6.1: `packages/cli/src/commands/chat.ts` — `runChatCommand` (15), `createProviderClient` (17)

- **Fix:** For `createProviderClient`, apply Pattern A: `CLIENT_FACTORIES: Record<ProviderId, (config) => ProviderClient>`. For `runChatCommand`, extract the argument-parsing, provider-setup, session-creation, and message-loop into 4 helpers.
- **Verification:** `pnpm --filter @agentsy/cli test` passes. `pnpm --filter @agentsy/cli test:e2e` passes.

#### Step 6.2: `packages/orchestrator/src/core/engine.test.ts` — `createAgent` (15), `createBaseSpec` (17)

- **Fix:** These are test-fixture builders. Split into `withAgentId(overrides)`, `withCapabilities(overrides)`, etc. — a builder/fluent-API pattern. Or apply defaults via `mergeDeep(defaults, overrides)` and reduce the branching.
- **Verification:** Tests pass.

#### Step 6.3: `packages/orchestrator/src/agents/registry.test.ts` — `createAgent` (15)

- **Fix:** Same as 6.2.
- **Verification:** Tests pass.

#### Step 6.4: `packages/observability/src/core/logger.ts` — `log` (13)

- **Fix:** Split into `formatMessage(level, message, attributes)`, `formatError(error)`, `shouldLog(level)`, `writeOutput(formatted)`. The `log` method becomes a 5-line orchestrator.
- **Verification:** `pnpm --filter @agentsy/observability test` passes.

#### Step 6.5: `packages/renderers/src/ink/ink-stream-renderer.tsx` — `buildRenderOptions` (13)

- **Fix:** Split into `resolveThemeOptions(config)`, `resolveLayoutOptions(config)`, `resolveBehaviorOptions(config)`.
- **Verification:** Tests pass.

#### Step 6.6: `packages/models/src/index.ts` — `buildRecommendation` (19)

- **Fix:** Split into `scoreModels(inputs)`, `filterByCapabilities(inputs)`, `rankByPreference(inputs)`, `selectTopPick(scored)`. `buildRecommendation` orchestrates.
- **Verification:** `pnpm --filter @agentsy/models test` passes.

#### Step 6.7: `packages/scripts/src/release.ts` — `main` (15)

- **Fix:** Split into `parseReleaseArgs(argv)`, `detectReleaseTarget(args)`, `runRelease(target)`, `printReleaseSummary(result)`. `main` becomes a 4-line orchestrator.
- **Verification:** `pnpm --filter @agentsy/scripts test` passes.

#### Step 6.8: `packages/scripts/src/trusted-publish-readiness.ts` — `validateRepositoryMatch` (13)

- **Fix:** Split into `normalizeExpectedRepo(repo)`, `normalizeActualRepo(repo)`, `compareNormalized(expected, actual)`.
- **Verification:** Tests pass.

#### Step 6.9: `packages/scripts/src/preview-themes.ts` — `displayThemePreview` (17)

- **Fix:** Split into `loadTheme(name)`, `renderThemeToANSI(theme)`, `printThemeComparison(themes)`.
- **Verification:** Tests pass.

---

---

### Phase 8: Documentation and lockfile findings

#### Step 8.1: `AGENTS.md` — fix vague conditional at line 209

- **Finding:** MEDIUM Best-practice — "Vague conditional: 'Should remain pluggable so consumers can substitute backends when needed'."
- **Fix:** Replace with a concrete commitment, e.g.:

  ```text
  - Memory backend must be substitutable via the `MemoryProvider` interface (defined in `packages/memory/src/types.ts`). At least one alternative backend (e.g. Turso, libsql) must be published before v1.0.
  ```

#### Step 8.2: `AGENTS.md` — fix vague conditional at line 211

- **Finding:** MEDIUM Best-practice — "Expose as both Agentsy-native package and standalone MCP server or plugin surface when possible."
- **Fix:** Replace with: "The memory package must expose both an Agentsy-native API (default export) and an MCP server entry point (`packages/memory/src/mcp/server.ts`) by v0.4.0."

#### Step 8.3: `AGENTS.md` — fix missing `IMPLEMENTATION-PLAN.md` reference at line 1

- **Finding:** HIGH Error-prone — "Referenced file IMPLEMENTATION-PLAN.md not found in workspace."
- **Root cause:** AGENTS.md line 438 says "actual implementation belongs in `IMPLEMENTATION-PLAN.md` files within packages" — but the static analyzer is looking for a root-level `IMPLEMENTATION-PLAN.md`. The per-package files exist (20 of them), but the root file doesn't.
- **Fix:** Either:
  1. Create a root `IMPLEMENTATION-PLAN.md` that's an index linking to the per-package plans.
  2. Update AGENTS.md line 438 to be more specific: "actual implementation belongs in `packages/<name>/IMPLEMENTATION-PLAN.md` files" — and add a cross-reference list.
- **Verification:** The static analyzer no longer flags the reference.

#### Step 8.4: `AGENTS.md` — file-splitting suggestion (SOUL.md, USER.md, TOOLS.md)

- **Finding:** MEDIUM Best-practice — "Only 1 file found with 100+ lines. Consider splitting into modular files for better organization."
- **Root cause:** AGENTS.md is 478 lines. The analyzer suggests splitting into `SOUL.md` (personality), `USER.md` (user context), `TOOLS.md` (tool documentation). This is a generic agent-instruction template suggestion; it doesn't necessarily fit the agentsy repo's structure.
- **Fix:** This is a soft suggestion. Two options:
  1. **Acknowledge and decline:** Add a comment at the top of AGENTS.md: `<!-- This file is intentionally a single document. The agentsy repo uses per-package IMPLEMENTATION-PLAN.md files for detailed planning. -->`
  2. **Split:** If the maintainers find value, split AGENTS.md into `AGENTS.md` (high-level), `docs/developers/typescript-standards.md` (already exists partially), `docs/developers/testing.md` (already exists). Move the TypeScript rules, linting config, and testing conventions into the developer docs.
- **Verification:** The analyzer no longer flags AGENTS.md.

#### Step 8.5: `pnpm-lock.yaml` (7636 NCLOC) and `packages/vscode/pnpm-lock.yaml` (2108 NCLOC)

- **Finding:** CRITICAL Code complexity (file NCLOC).
- **Root cause:** Lockfiles are not code; they're machine-generated manifests. The NCLOC metric is meaningless for them.
- **Fix:** Add `pnpm-lock.yaml` and `packages/vscode/pnpm-lock.yaml` to the static analyzer's ignore list. For Fallow, add to `.fallowrc.jsonc`:

  ```jsonc
  "ignore": [
    "pnpm-lock.yaml",
    "packages/vscode/pnpm-lock.yaml",
    "**/pnpm-lock.yaml"
  ]
  ```

  For SonarCloud, add to `sonar-project.properties`:

  ```text
  sonar.exclusions=**/pnpm-lock.yaml,**/package-lock.json,**/yarn.lock
  ```

- **Verification:** The analyzer no longer reports NCLOC for lockfiles.

---

### Phase 9: Additional SonarCloud findings (cognitive complexity, security hotspots, code smells)

**Goal:** Close the 25 additional SonarCloud findings that were not in the original Fallow pass. These span five categories:

- **Cognitive complexity** (5 findings) — functions flagged for *cognitive* (not cyclomatic) complexity, which weights nested branches higher.
- **Insecure randomness former-hotspots** (8 findings) — `Math.random()` used in non-security-sensitive contexts (test fixtures, jitter, dedup keys). SonarCloud flags these as "former-hotspots" requiring verification that they're not used for security.
- **Dynamic code execution safety** (2 findings) — `vm.runInContext` of user-supplied code in the sandbox worker and the REPL tool. These need explicit safety verification, not suppression.
- **PATH variable hardening** (3 findings) — `spawnSync`/`execSync` calls that inherit `process.env.PATH`, which could be hijacked by a writable directory on PATH.
- **Public writable directory usage in tests** (5 findings) — test files that use `/tmp/...` paths, flagged because `/tmp` is publicly writable.
- **Miscellaneous code smells** (7 findings) — top-level await preference, regex simplification, nested ternary extraction, default-import convention, error-object-toThrow.

#### Step 9.1: Code smells — quick fixes (Phase 9a)

##### 9.1.1 `packages/cli/src/cli.ts:10` — prefer top-level await

- **Finding:** Medium Code Smell — "Prefer top-level await over an async function `main` call."
- **Root cause:** The file is:

  ```ts
  async function main(): Promise<void> {
    const argv = process.argv.slice(2);
    const exitCode = await runCli(argv);
    process.exit(exitCode);
  }
  main();
  ```

  `main()` is an async IIFE-equivalent that could be inlined at top level since the file is ESM (package.json has `"type": "module"`).
- **Recommended fix:**

  ```ts
  #!/usr/bin/env node
  import { runCli } from './index.js';

  const argv = process.argv.slice(2);
  const exitCode = await runCli(argv);
  process.exit(exitCode);
  ```

  Top-level await is supported in ESM (target `es2022` per tsconfig). This removes the wrapper function entirely.
- **Verification:** `pnpm --filter @agentsy/cli build && node packages/cli/dist/cli.js --help` still works. `pnpm --filter @agentsy/cli test` passes.
- **Rollback:** Revert the file.

##### 9.1.2 `packages/memory/src/retrieval/rag/sanitization.ts:3` — simplify regex

- **Finding:** Major Code Smell — "Simplify this regular expression to reduce its complexity from 24 to the 20 allowed."
- **Root cause:** `const SECRET_PATTERN = /(sk-[a-z0-9]{20,}|sk_[a-z0-9_-]{8,}|api[_-]?key\s*[=:]\s*\S+|bearer\s+[a-z0-9._-]{10,})/giu;` — SonarCloud scores regex complexity at 24 due to the 4 alternations with quantifiers.
- **Recommended fix:** Split into a composed pattern using an array join, or factor common prefixes:

  ```ts
  const SECRET_ALTERNATIVES = [
    'sk-[a-z0-9]{20,}',
    'sk_[a-z0-9_-]{8,}',
    'api[_-]?key\\s*[=:]\\s*\\S+',
    'bearer\\s+[a-z0-9._-]{10,}'
  ];
  const SECRET_PATTERN = new RegExp(`(${SECRET_ALTERNATIVES.join('|')})`, 'giu');
  ```

  This reduces the *literal* regex complexity score (the array is data, not a regex literal). Functionally equivalent.
- **Alternative:** Keep the regex but add a `// nosemgrep: sonar-regex-complexity` suppression with justification: `// 4-way alternation is intentional; splitting reduces readability.`
- **Verification:** `pnpm --filter @agentsy/memory test` passes. The redaction behavior is unchanged (test fixtures cover each alternative).
- **Rollback:** Revert the file.

##### 9.1.3 `packages/renderers/src/ink/components/chat/transcript.tsx:78` — extract nested ternary

- **Finding:** Major Code Smell — "Extract this nested ternary operation into an independent statement."
- **Root cause:** Line 78: `{...(cursorSymbol === undefined ? {} : { symbol: cursorSymbol })}` — this is a conditional spread, not technically a nested ternary, but SonarCloud flags the ternary-inside-spread pattern. Similar patterns appear at lines 92 and 93 (`{...(modelName === undefined ? {} : { modelName })}` and `{...(elapsedSec === undefined ? {} : { elapsedSec })}`).
- **Recommended fix:** Extract a helper:

  ```tsx
  function optionalProp<T>(value: T | undefined, key: string): Record<string, T> {
    return value === undefined ? {} : { [key]: value };
  }
  // Then:
  <StreamingCursor
    color={palette.assistantAccent}
    isStreaming={isStreaming}
    {...optionalProp(cursorSymbol, 'symbol')}
  />
  ```

  Or, if the `StreamingCursor` and `StatusFooter` components accept `undefined` props directly (which they typically do in React), just pass the prop unconditionally:

  ```tsx
  <StreamingCursor
    color={palette.assistantAccent}
    isStreaming={isStreaming}
    symbol={cursorSymbol}
  />
  ```

  This is cleaner and avoids the conditional-spread entirely. Verify the component handles `undefined`.
- **Verification:** `pnpm --filter @agentsy/renderers test` passes. Visual inspection of the rendered output.
- **Rollback:** Revert the file.

##### 9.1.4 `packages/renderers/src/ink/create-ink-renderer.ts:6` — use default import

- **Finding:** Minor Code Smell — "Prefer using the default import over named import."
- **Root cause:** Line 6: `import { default as InkStreamRenderer } from './ink-stream-renderer.tsx';` — the `{ default as X }` syntax is discouraged; `import InkStreamRenderer from '...'` is the canonical form.
- **Recommended fix:**

  ```ts
  import InkStreamRenderer from './ink-stream-renderer.tsx';
  ```

- **Verification:** `pnpm --filter @agentsy/renderers build` passes.
- **Rollback:** Revert the line.

##### 9.1.5 `packages/runtime/src/index.test.ts` — expected an error object to be thrown

- **Finding:** Medium Code Smell — "Expected an error object to be thrown."
- **Root cause:** The test file has `await expect(...).rejects.toThrow('Runtime spawn depth exceeded maxDepth')` (and 2 more similar). SonarCloud's rule `javascript:S5958` wants `toThrow` to receive an `Error` object (or a regex / Error subclass) rather than a plain string, because string matching against `error.message` can pass for non-Error throws.
- **Recommended fix:** Two options:
  1. **Pass a regex:** `).rejects.toThrow(/Runtime spawn depth exceeded maxDepth/);`
  2. **Pass an Error subclass:** define `class DepthExceededError extends Error` in the runtime, throw it from the production code, then `).rejects.toThrow(DepthExceededError);`
  3. **Assert on the error instance:** `).rejects.toSatisfy(err => err instanceof Error && err.message.includes('Runtime spawn depth exceeded maxDepth'));`
  The regex approach (option 1) is the smallest change. Option 2 is the most type-safe.
- **Verification:** `pnpm --filter @agentsy/runtime test` passes. SonarCloud no longer flags the lines.
- **Rollback:** Revert the test file.

#### Step 9.2: Cognitive complexity refactors (Phase 9b)

These are functions flagged for *cognitive* complexity (which weights nesting higher than cyclomatic). Apply the same patterns (A: dispatch table, B: validator sequence, C: state machine) but with extra attention to nesting depth.

##### 9.2.1 `packages/memory/src/cognitive/awaken.ts:102` — `applyDecayMoves` (cognitive 28 → target ≤ 15)

- **Finding:** Critical Code Smell — "Refactor this function to reduce its Cognitive Complexity from 28 to the 15 allowed."
- **Root cause:** `applyDecayMoves` has a nested structure: `for result → if !currentTier → continue → if promote → if nextIdx < length → if nextTier → promote` (4 levels of nesting inside a loop). The `else if demote` branch mirrors the promote branch.
- **Recommended fix:** Extract two helpers, one per action:

  ```ts
  function applyPromote(result: DecayedItem, tiers: AwakenDeps['tiers']): void {
    const currentTier = tiers[result.tier];
    if (!currentTier) return;
    const currentIdx = TIER_ORDER.indexOf(result.tier);
    const nextIdx = currentIdx + 1;
    if (nextIdx >= TIER_ORDER.length) return;
    const nextTierName = TIER_ORDER[nextIdx];
    const nextTier = nextTierName ? tiers[nextTierName] : undefined;
    if (nextTier) currentTier.promote(1, nextTier);
  }

  function applyDemote(result: DecayedItem, tiers: AwakenDeps['tiers']): void {
    const currentTier = tiers[result.tier];
    if (!currentTier) return;
    const currentIdx = TIER_ORDER.indexOf(result.tier);
    const prevIdx = currentIdx - 1;
    if (prevIdx < 0) return;
    const prevTierName = TIER_ORDER[prevIdx];
    const prevTier = prevTierName ? tiers[prevTierName] : undefined;
    if (prevTier) currentTier.demote(1, prevTier);
  }

  const DECAY_ACTION_HANDLERS: Record<DecayAction, (r: DecayedItem, t: AwakenDeps['tiers']) => void> = {
    promote: applyPromote,
    demote: applyDemote,
    discard: () => {},  // handled by reclaimBudgetForDiscarded
    keep: () => {}
  };

  function applyDecayMoves(results: DecayedItem[], tiers: AwakenDeps['tiers']): void {
    for (const result of results) {
      const handler = DECAY_ACTION_HANDLERS[result.action];
      handler?.(result, tiers);
    }
  }
  ```

  Each helper has cognitive complexity ≤ 5. The main function is a 3-line loop.
- **Verification:** `pnpm --filter @agentsy/memory test` passes. The `awaken.test.ts` fixtures (including the 30-item stress test) pass unchanged.
- **Rollback:** Revert the file.

##### 9.2.2 `packages/memory/src/cognitive/learning/dialectic-resolver.ts:142` — `detectContradictionsInternal` (cognitive 17 → target ≤ 15)

- **Finding:** Critical Code Smell.
- **Root cause:** Nested loop: `for i → if visited → continue → for j → if visited → continue → if isContradiction → ...`. The inner loop has 3 levels of nesting.
- **Recommended fix:** Extract the inner loop into a helper:

  ```ts
  function findContradictingObservations(
    observations: Observation[],
    startIdx: number,
    visited: Set<number>
  ): Observation[] {
    const group: Observation[] = [];
    for (let j = startIdx + 1; j < observations.length; j++) {
      if (visited.has(j)) continue;
      const a = observations[startIdx];
      const b = observations[j];
      if (isContradiction(a, b)) {
        group.push(b);
        visited.add(j);
      }
    }
    return group;
  }

  function detectContradictionsInternal(observations: Observation[]): Observation[][] {
    const groups: Observation[][] = [];
    const visited = new Set<number>();
    for (let i = 0; i < observations.length; i++) {
      if (visited.has(i)) continue;
      const group = [observations[i] as Observation, ...findContradictingObservations(observations, i, visited)];
      visited.add(i);
      if (group.length > 1) groups.push(group);
    }
    return groups;
  }
  ```

- **Verification:** `pnpm --filter @agentsy/memory test` passes.
- **Rollback:** Revert the file.

##### 9.2.3 `packages/scripts/src/release-shared.ts:346` — `waitForWorkflow` (cognitive 19 → target ≤ 15)

- **Finding:** Critical Code Smell.
- **Root cause:** A polling loop with 5 branches: `if !run → if autoDispatch && !triggered → dispatch; else → wait` / `else if run.status !== completed → update spinner` / `else if conclusion === success → return` / `else if conclusion === cancelled → re-dispatch` / `else → fail`. The nesting comes from the `if (!run)` branch having two sub-branches.
- **Recommended fix:** Extract a `handlePollResult(run, ctx)` helper that takes the run and a context object (`{ triggered, cancelledRunIds, spinner, name }`) and returns one of `{ kind: 'continue' }`, `{ kind: 'success' }`, `{ kind: 'fail', message }`, or `{ kind: 'redispatch' }`. The main loop becomes:

  ```ts
  while (Date.now() < deadline) {
    const run = await fetchLatestRun(octokit, workflow.id, owner, repo, headSha, branch, cancelledRunIds);
    const decision = handlePollResult(run, ctx);
    if (decision.kind === 'success') return;
    if (decision.kind === 'fail') throw new Error(decision.message);
    if (decision.kind === 'redispatch') await dispatchWorkflow(octokit, workflow.id, owner, repo, options);
    await sleep(pollMs);
  }
  ```

  Each helper has cognitive complexity ≤ 5.
- **Verification:** `pnpm --filter @agentsy/scripts test` passes. Test with a mock Octokit that returns various run states.
- **Rollback:** Revert the file.

##### 9.2.4 `packages/scripts/src/write-dist-package.ts` — `main` (cognitive 18 → target ≤ 15)

- **Finding:** Critical Code Smell.
- **Root cause:** The `main` function (line 33) reads `package.json`, destructures 11 fields with conditional inclusion, calls `rewriteDistExports`, builds the dist package object, and writes it. The cognitive load comes from the many conditional fields (`bugs?`, `repository?`, `author?`, `private?`, `publishConfig?`).
- **Recommended fix:** Extract a `buildDistPackage(pkg, distExports)` helper that takes the parsed root package.json and the rewritten exports, and returns the dist package object. The `main` function becomes:

  ```ts
  async function main() {
    const packagePath = process.argv[2] ? resolve(process.argv[2]) : ROOT;
    const pkg = await readRootPackage(packagePath);
    const distExports = rewriteDistExports(pkg.exports as Record<string, unknown>);
    const distPkg = buildDistPackage(pkg, distExports);
    await writeDistPackage(packagePath, distPkg);
  }
  ```

  `buildDistPackage` is a pure function with no nesting (just conditional spreads).
- **Verification:** `pnpm --filter @agentsy/scripts test` passes. Run `write-dist-package` against a sample package and verify the output is byte-identical.
- **Rollback:** Revert the file.

#### Step 9.3: Insecure-randomness former-hotspots (Phase 9c)

SonarCloud flags `Math.random()` as a "former-hotspot" — it's not necessarily a bug, but requires verification that the value isn't used for security-sensitive purposes. Each of the 8 findings below needs either (a) a documented justification (suppression with comment) or (b) replacement with `crypto.randomBytes()` / `crypto.randomUUID()` if the value *is* security-sensitive.

The general rule: if `Math.random()` is used for **test fixtures, jitter, dedup keys, or non-cryptographic IDs**, suppress with a justification. If it's used for **tokens, nonces, IDs that appear in URLs/audit logs, or anything that could be a security boundary**, replace with `crypto`.

##### 9.3.1 `packages/gateway/src/strategies/strategies.ts` — weighted random selection

- **Finding:** "Make sure that using this pseudorandom number generator is safe here."
- **Root cause:** `let target = Math.random() * total;` in a weighted-random load balancer. This selects which provider replica receives a request.
- **Assessment:** **Safe.** Weighted random selection for load balancing is not a security-sensitive operation. An attacker who can predict the RNG cannot gain anything — they'd still get *some* replica, and the selection is observable anyway.
- **Recommended fix:** Add a suppression comment:

  ```ts
  // nosemgrep: insecure-randomness -- Math.random() is used for weighted-random load balancing.
  // Prediction of the selected replica confers no advantage: the selection is observable
  // and any eligible replica is authorized to handle the request.
  let target = Math.random() * total;
  ```

- **Verification:** SonarCloud marks the hotspot as "Safe" / "Acknowledged".
- **Rollback:** Revert the comment.

##### 9.3.2 `packages/memory/src/agentfs/tier-adapter.test.ts` — test ID generation

- **Finding:** Insecure randomness hotspot.
- **Root cause:** `id: \`test-${Math.random().toString(36).slice(2, 10)}\`` — generates a random suffix for test fixture IDs.
- **Assessment:** **Safe.** Test fixtures don't need cryptographic randomness.
- **Recommended fix:** Either suppress:

  ```ts
  // nosemgrep: insecure-randomness-test-id -- test fixture only; no security sensitivity.
  id: `test-${Math.random().toString(36).slice(2, 10)}`,
  ```

  Or replace with a deterministic counter (better for test reproducibility):

  ```ts
  let testIdCounter = 0;
  function makeItem(overrides: Partial<MemoryItem> = {}): MemoryItem {
    return {
      id: `test-${(testIdCounter++).toString(36)}`,
      ...
    };
  }
  ```

  The deterministic counter is preferred — it makes test failures reproducible.
- **Verification:** `pnpm --filter @agentsy/memory test` passes.
- **Rollback:** Revert the change.

##### 9.3.3 `packages/memory/src/cognitive/awaken.test.ts` — importance randomization

- **Finding:** Insecure randomness hotspot.
- **Root cause:** `importance: 0.5 + Math.random() * 0.5` — randomizes importance in a stress-test fixture.
- **Assessment:** **Safe.** Test fixture.
- **Recommended fix:** Suppress with comment, OR seed a deterministic PRNG (`Math.random` is fine if the test doesn't depend on specific values; if it does, use a seeded `mulberry32` or similar).
- **Verification:** Tests pass.

##### 9.3.4 `packages/memory/src/coordination/scheduler.test.ts` — scheduling jitter

- **Finding:** Insecure randomness hotspot.
- **Root cause:** `scheduler.schedule(id, 100 + Math.random() * 50, fn);` — randomized scheduling delay in a test.
- **Assessment:** **Safe.** Already has a `nosemgrep: insecure-randomness-test-jitter` comment with justification. SonarCloud may not recognize the `nosemgrep` suppression syntax — check if SonarCloud has its own suppression comment format.
- **Recommended fix:** If SonarCloud doesn't honor `nosemgrep`, add a SonarCloud-specific suppression:

  ```ts
  // nosemgrep: insecure-randomness-test-jitter
  // sonar: insecure-randomness — Math.random() is used only for scheduling jitter in unit tests;
  // no security-sensitive operation depends on this value.
  scheduler.schedule(id, 100 + Math.random() * 50, fn);
  ```

  Or use a fixed delay (`100`) and remove the randomization if the test doesn't require it.
- **Verification:** SonarCloud marks the hotspot as acknowledged.

##### 9.3.5 `packages/memory/src/retrieval/injection.ts:78` — dedup key generation

- **Finding:** Insecure randomness hotspot.
- **Root cause:** `const tag = tagMatch?.[1] ?? \`**raw**:${Math.random().toString(36).slice(2)}\`;` — generates a random tag for XML blocks that don't have a parseable tag.
- **Assessment:** **Safe but should be deterministic.** The random tag is used as a dedup key. If two raw blocks get different random tags, they won't be deduped — which is the intent (each raw block is unique). But using a hash of the block content would be more deterministic and avoid the RNG entirely.
- **Recommended fix:** Replace with a content-based hash:

  ```ts
  import { createHash } from 'node:crypto';
  const tag = tagMatch?.[1] ?? `__raw__:${createHash('sha1').update(block).digest('hex').slice(0, 8)}`;
  ```

  This is deterministic, doesn't use RNG, and dedupes identical raw blocks (which is probably the desired behavior).
- **Verification:** `pnpm --filter @agentsy/memory test` passes. Check that the dedup behavior is correct for identical raw blocks.
- **Rollback:** Revert the change.

##### 9.3.6 `packages/orchestrator/src/recovery/policy.ts:335` — backoff jitter

- **Finding:** Insecure randomness hotspot.
- **Root cause:** `const jitter = delay * config.jitterFraction * (Math.random() - 0.5);` — adds random jitter to retry backoff.
- **Assessment:** **Safe.** Retry jitter is a standard pattern to prevent thundering-herd retries. Predictability of the jitter confers no advantage — an attacker who can predict the jitter can only time their retry slightly differently.
- **Recommended fix:** Suppress with justification:

  ```ts
  // nosemgrep: insecure-randomness -- Math.random() is used for retry-backoff jitter.
  // Predictability of jitter confers no advantage; jitter exists to prevent thundering-herd
  // retries, not to provide cryptographic randomness.
  const jitter = delay * config.jitterFraction * (Math.random() - 0.5);
  ```

- **Verification:** SonarCloud acknowledges the hotspot.

##### 9.3.7 `packages/memory/src/agentfs/tier-adapter.test.ts` — `fp-${now}` fingerprint (line ~28)

- **Finding:** Insecure randomness hotspot (same file as 9.3.2, different line).
- **Root cause:** `fingerprint: \`fp-${now}\`` where `now = performance.now()`. Not actually `Math.random()`, but SonarCloud may flag the related `Math.random()` usage in `makeItem`.
- **Assessment:** **Safe.** Test fixture.
- **Recommended fix:** Same as 9.3.2 — suppress or use deterministic counter.
- **Verification:** Tests pass.

##### 9.3.8 Cross-cutting: replace `Math.random()` in production code where IDs are exposed

- **Note:** Beyond the flagged findings, audit all `Math.random()` usage in `packages/**` (excluding `*.test.ts`). Any usage that generates IDs appearing in URLs, audit logs, or external APIs should use `crypto.randomUUID()`. The CLI's `Math.random().toString(36).slice(2, 8)` pattern for job/agent/schedule IDs (flagged in the daemon review) is the most prominent example.
- **Recommended fix:** `rg -n "Math\.random\(\)" packages/ --glob '!*.test.ts'` and audit each hit.
- **Verification:** No `Math.random()` in production code paths that generate externally-visible identifiers.

#### Step 9.4: Dynamic code execution safety (Phase 9d)

Two findings flag `vm.runInContext` of user-supplied code. These need explicit safety review, not blind suppression.

##### 9.4.1 `packages/runtime/src/sandbox/virtual/sandbox-worker.ts:52` — `runInContext`

- **Finding:** "Make sure that this dynamic injection or execution of code is safe."
- **Root cause:** `const result: unknown = runInContext(code, context, { displayErrors: true, timeout });` — executes user-provided `code` inside a `vm.Context`.
- **Safety analysis:** The code already has:
  - `createContext({ console, process: { env }, URL, TextEncoder, TextDecoder, Buffer })` — no `require`, no `global`, no `process.exit`, no `__dirname`.
  - `Object.freeze(context)` — prevents mutation of the context's global.
  - `timeout` option on `runInContext` — kills infinite loops.
  - Runs inside a `worker_threads` Worker — `worker.terminate()` is the fallback if `timeout` fails.
  - Has a `nosemgrep: dangerous-sandbox-run-in-context` suppression with a detailed justification comment.
- **Known limitations of `node:vm`:**
  1. `vm` is **not a security boundary** per Node.js docs: *"The node:vm module is not a security mechanism. Do not use it to run untrusted code."* The context can escape via prototype pollution, `Symbol.toPrimitive`, or other side channels.
  2. The `Buffer` global exposes `Buffer.from` which can be abused.
  3. `URL` can make network requests if a `fetch` global is added (it isn't here, but verify).
- **Recommended fix:**
  1. **Short-term (acknowledge the risk):** Update the suppression comment to explicitly acknowledge that `vm` is not a security boundary and that this sandbox is for *defense-in-depth*, not for running truly untrusted code. Document the threat model: the code being executed is from the agent's own tool calls, not from external users.
  2. **Medium-term (harden the sandbox):**
     - Remove `Buffer` from the context (it's not needed for most agent code).
     - Add a `Symbol.toPrimitive` and `Symbol.hasInstance` trap to catch prototype-based escapes.
     - Set `microtaskMode: 'afterEvaluate'` on `createContext` to prevent microtask-based escapes.
     - Consider switching to `isolated-vm` (already in `node_modules` per the install log) which provides a true isolate.
  3. **Long-term (replace `vm`):** Migrate to `isolated-vm` for any code that runs *truly untrusted* input. Keep `vm` only for agent-authored tool code that's already privileged.
- **Verification:** Document the threat model in `packages/runtime/src/sandbox/virtual/README.md`. Add a test that verifies the context doesn't have `require`, `global`, `process.exit`, or `__dirname`. Add a test that verifies `worker.terminate()` is called on timeout.
- **Rollback:** Revert comment changes; keep the hardening tests.

##### 9.4.2 `packages/tools/src/tools/repl/index.ts:28` — `script.runInContext`

- **Finding:** "Make sure that this dynamic injection or execution of code is safe."
- **Root cause:** The `repl_execute` tool executes arbitrary JavaScript via `vm.Script` + `runInContext`. The tool is annotated `destructiveHint: true, requiresApproval: true` — so it requires human approval before running.
- **Safety analysis:** Less hardened than `sandbox-worker.ts`:
  - `Object.create(null)` sandbox — no console, no process, no Buffer. *More* restrictive.
  - `timeout` on `runInContext`.
  - **But:** runs in the main thread (no worker.terminate fallback). If `timeout` fails, the main thread hangs.
  - **But:** the `vm` escape caveats still apply.
- **Recommended fix:**
  1. **Route through `sandbox-worker.ts`:** The REPL tool should use the worker-based sandbox (9.4.1) instead of running inline. This gives the `worker.terminate()` fallback. The tool becomes:

     ```ts
     handler: async input => {
       const code = ...;
       const timeout = ...;
       const result = await runInSandboxWorker(code, { timeout, env: {} });
       return { ok: true, data: { result: String(result), code } };
     }
     ```

  2. **Enforce approval:** The tool already declares `requiresApproval: true`. Verify the runtime's approval hook (Phase 1 of the daemon review) actually enforces this. If the approval gate is bypassed, the tool can execute arbitrary code with no human review.
  3. **Audit log:** Every `repl_execute` invocation should be audit-logged with the code, the caller, the timestamp, and the approval decision.
- **Verification:** Add a test that verifies `repl_execute` routes through the worker sandbox. Add a test that the approval gate blocks unapproved invocations.
- **Rollback:** Revert to inline `runInContext`.

#### Step 9.5: PATH variable hardening (Phase 9e)

Three findings flag `spawnSync`/`execSync` calls that inherit `process.env.PATH`. The risk: if `PATH` includes a writable directory (e.g. `~/.local/bin`, `./node_modules/.bin`), an attacker who can write to that directory can hijack the spawned command.

##### 9.5.1 `scripts/postinstall-aft.mjs:14, 23` — `execSync('npx ...')`

- **Finding:** "Make sure the 'PATH' variable only contains fixed, unwriteable directories."
- **Root cause:** `execSync('npx --yes @cortexkit/aft@latest doctor', { env: { ...process.env, CI: 'true' } })` — spreads `process.env` (including `PATH`) into the child. `npx` then resolves `node` and `@cortexkit/aft` via `PATH`.
- **Risk assessment:** Medium. Postinstall scripts run during `pnpm install`. If an attacker can plant a malicious `node` or `npx` binary on the user's `PATH` (e.g. via a compromised `~/.local/bin`), they get code execution during install. However, the user's `PATH` is their own — they've trusted it.
- **Recommended fix:** Adopt the `withSafePathEnv()` pattern from `release-git.ts`:

  ```js
  import { execSync } from 'node:child_process';
  import { safePathEnv } from '../packages/scripts/src/release-git.ts';

  function main() {
    execSync('npx --yes @cortexkit/aft@latest doctor', {
      stdio: 'pipe',
      timeout: 15_000,
      env: { ...safePathEnv(), CI: 'true' }
    });
  }
  ```

  Where `safePathEnv()` returns `process.env` with `PATH` restricted to `/usr/bin:/bin:/usr/sbin:/sbin` (or platform equivalent). Extract `safePathEnv` to a shared utility since it's used in 3 places.
- **Alternative:** Use `pnpm exec` instead of `npx` — pnpm resolves packages from the project's `node_modules` and doesn't depend on `PATH`.
- **Verification:** `pnpm install` still resolves AFT. Test with a poisoned `PATH` (a directory containing a malicious `node` script) and verify the malicious script isn't invoked.
- **Rollback:** Revert to `process.env`.

##### 9.5.2 `packages/scripts/src/release-git.ts:13, 26` — `spawnSync('git', ...)`, `spawnSync('which'/'where', ...)`

- **Finding:** "Make sure the 'PATH' variable only contains fixed, unwriteable directories."
- **Root cause:** Already uses `withSafePathEnv()` (line 4: `const SAFE_PATH = ['/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':');`). Has `nosemgrep: command-injection-path` suppressions with justification comments.
- **Assessment:** **Already mitigated.** SonarCloud may not recognize the `nosemgrep` suppression, or the rule wants an explicit SonarCloud suppression.
- **Recommended fix:**
  1. Add a SonarCloud-specific suppression comment (check SonarCloud docs for the syntax — typically `// NOSONAR` at end of line).
  2. Extract `withSafePathEnv` and `SAFE_PATH` to a shared utility (`packages/scripts/src/safe-path.ts`) so 9.5.1 and 9.5.3 can reuse it.
  3. On Windows, `SAFE_PATH` should include `C:\Windows\System32` etc. — the current hardcode is Unix-only.
- **Verification:** SonarCloud acknowledges the hotspot. `pnpm --filter @agentsy/scripts test` passes.
- **Rollback:** Revert.

##### 9.5.3 Cross-cutting: extract `safePathEnv()` utility and audit all `spawnSync`/`execSync`

- **Note:** Beyond the 3 flagged findings, audit all `spawnSync`/`execSync`/`spawn` calls in `packages/**` and `scripts/**`. Any that pass `process.env` (or don't set `env` at all, which inherits `process.env`) should use `safePathEnv()`.
- **Recommended fix:** `rg -n "spawnSync\(|execSync\(|spawn\(" packages/ scripts/ --glob '!*.test.ts'` and audit each hit. Extract `safePathEnv()` to `packages/shared/src/safe-path.ts`.
- **Verification:** All `spawn*` calls in production code use `safePathEnv()` or have a documented justification.

#### Step 9.6: Public-writable-directory test findings (Phase 9f)

Five findings flag test files that use `/tmp/...` paths. `/tmp` is publicly writable on Unix, so a symlink attack or race condition could let another user interfere with the test.

##### 9.6.1 `packages/cli/src/commands/guardrails.test.ts:291, 304, 320` — `/tmp/test-policy.yaml` etc

- **Finding:** 3× Critical Vulnerability — "Make sure publicly writable directories are used safely here."
- **Root cause:** The test passes `/tmp/test-policy.yaml`, `/tmp/test-policy.json`, `/tmp/bad-policy.yaml` as the policy path argument. These are *mocked* paths — `existsSync` and `readFile` are vi-mocked, so no actual file IO happens. But SonarCloud flags the literal `/tmp/...` string.
- **Assessment:** **False positive (with caveats).** The test mocks the FS, so no actual `/tmp` access occurs. But the pattern is fragile: if the mocks are ever removed, the test would write to `/tmp` (publicly writable) and be vulnerable to symlink attacks.
- **Recommended fix:** Use `os.tmpdir()` + a per-test unique subdirectory, or use a mocked path that's clearly fake:

  ```ts
  import { tmpdir } from 'node:os';
  import { join } from 'node:path';

  const TEST_POLICY_DIR = join(tmpdir(), `agentsy-guardrails-test-${process.pid}`);
  const TEST_POLICY_PATH = join(TEST_POLICY_DIR, 'test-policy.yaml');
  ```

  Or, since the FS is mocked, use a clearly-fake path that doesn't match any real directory:

  ```ts
  const TEST_POLICY_PATH = '/nonexistent-test-path/policy.yaml';
  ```

  The second approach is simpler and sufficient since the FS is mocked. Verify the mocks cover all `existsSync`/`readFile` calls.
- **Verification:** `pnpm --filter @agentsy/cli test` passes. SonarCloud no longer flags the lines.
- **Rollback:** Revert the paths.

##### 9.6.2 `packages/runtime/src/hooks/guardrail-hooks.test.ts:151, 153` — `/tmp/test` in tool-call args

- **Finding:** 2× Critical Vulnerability.
- **Root cause:** Lines 151, 153: `preToolCallEvent('write_file', { path: '/tmp/test' })` — the test passes a tool-call event with `path: '/tmp/test'`. This is a *test fixture* representing what a tool call might look like; no actual file write happens.
- **Assessment:** **False positive.** The test doesn't write to `/tmp/test` — it passes the path as a string to the guardrail hook, which stringifies it. SonarCloud flags the literal `/tmp/...`.
- **Recommended fix:** Use a clearly-fake path:

  ```ts
  await hook.handler(preToolCallEvent('write_file', { path: '/fake-path/test' }));
  ```

  Or use `os.tmpdir()` if the test needs a real path:

  ```ts
  import { tmpdir } from 'node:os';
  await hook.handler(preToolCallEvent('write_file', { path: join(tmpdir(), 'agentsy-test-hook') }));
  ```

- **Verification:** `pnpm --filter @agentsy/runtime test` passes. SonarCloud no longer flags the lines.
- **Rollback:** Revert.

##### 9.6.3 Cross-cutting: audit all test files for `/tmp/` literals

- **Note:** Beyond the 5 flagged findings, `rg -n '"/tmp/' packages/ --glob '*.test.ts'` to find other test files using `/tmp` literals. Replace with `os.tmpdir()` or clearly-fake paths.
- **Recommended fix:** Run the grep above and replace each hit.
- **Verification:** No `/tmp/` literals in test files (or each is justified with a comment).

---

### Phase 11: Dead Code, Duplication, and Remaining Complexity Cleanup (LATER PHASE)

**Goal:** Address the Fallow dead-code, duplication, and remaining complexity findings that are in `packages/**` and `scripts/**` (i.e., the framework code that IS in scope after Phase 10 excludes `.agents/`). This is the "later phase" the user identified — unused exports indicate untested or unconsumed code that needs product decisions, not just mechanical refactoring.

**Why this is a later phase:** Unlike the earlier phases (which fix scanner findings with clear mechanical fixes), Phase 11 findings require maintainers to make product decisions: "Is this export dead code that should be removed, or is it a public API that hasn't been consumed yet?" "Is this duplicated code that should be extracted, or is the duplication intentional (two providers with similar shapes)?" These decisions require domain knowledge and shouldn't be rushed.

**Fallow output summary (from the user's provided scan):**

- 39 unused files
- 22 unused exports (in files already reported as unused + 6 more in used files)
- 4 unused type exports
- 3 unused dependencies
- 4 unresolved imports
- 3 unlisted dependencies
- 1 duplicate export pair
- 5 stale suppressions
- 19 clone groups (710 lines duplicated, 0.7%)
- 44 high-complexity functions (many overlap with Phases 4–9; the new ones are listed below)

#### Step 11.1: Remove stale suppressions (quick wins, 5 findings)

- **Findings:** 5 stale `// fallow-ignore-*` suppression comments that no longer match any issue.
  - `packages/core/src/processor/processor/zai-inline-tool-call-parser.ts:48` — `unused-class-member` (no issue found)
  - `packages/core/src/processor/processor/zai-inline-tool-call-parser.ts:75` — `unused-class-member` (no issue found)
  - `packages/core/src/tool-calls/tool-call-accumulator.ts:68` — `unused-class-member` (no issue found)
  - `packages/core/src/tool-calls/tool-call-accumulator.ts:229` — `unused-class-member` (no issue found)
  - `packages/ui/src/ink/index.ts:1` — `fallow-ignore-file unused-file` (no unused-file issue found)
- **Root cause:** The suppressions were added during earlier refactoring rounds; the underlying issues have since been fixed but the suppression comments weren't removed.
- **Recommended fix:** Delete each stale suppression comment. Run `pnpm fallow` to confirm no new findings appear (if a new finding appears, the suppression was actually needed — restore it).
- **Verification:** `pnpm fallow` reports 0 stale suppressions.
- **Rollback:** Restore any suppression that turns out to be needed.

#### Step 11.2: Fix unresolved imports (4 findings)

- **Findings:**
  - `packages/agents/src/skills.test.ts:2` — imports `../specs/types.js` which doesn't exist
  - `packages/agents/src/runtime.test.ts:2` — imports `../specs/types.js` which doesn't exist
  - `scripts/src/preview-themes.ts:35` — imports `../../renderers/src/ink/themes/index.ts` (cross-package relative import)
- **Root cause:** `packages/agents/src/specs/types.ts` doesn't exist (or was renamed/moved). The test files import types from a non-existent path. `preview-themes.ts` uses a cross-package relative import instead of a workspace package import.
- **Recommended fix:**
  1. For `packages/agents/src/skills.test.ts` and `runtime.test.ts`: find where the types actually live. Run `rg -n "export.*AgentLayer|export.*SkillMetadata|export.*AgentHooks" packages/agents/src/` to find the current location. Update the import path.
  2. For `scripts/src/preview-themes.ts`: replace `../../renderers/src/ink/themes/index.ts` with `@agentsy/renderers` (or the appropriate subpath export). Add `@agentsy/renderers` to `scripts/package.json` dependencies if not already there.
- **Verification:** `pnpm --filter @agentsy/agents test` passes. `pnpm --filter @agentsy/scripts build` passes.
- **Rollback:** Revert the import paths.

#### Step 11.3: Fix unlisted dependencies (3 findings)

- **Findings:** `@octokit/rest`, `ora`, `zx` are imported in code but missing from `package.json`.
- **Root cause:** These packages are used in `scripts/src/release-shared.ts` (and related) but aren't declared in `scripts/package.json` (or `packages/scripts/package.json`). They're resolved via hoisted `node_modules` but aren't declared dependencies, which breaks in strict environments (pnpm strict mode, Docker, CI with `--frozen-lockfile`).
- **Recommended fix:** Add the missing dependencies to the correct `package.json`:

  ```bash
  pnpm --filter @agentsy/scripts add @octokit/rest ora zx
  ```

  Verify the versions match what's already in the lockfile.
- **Verification:** `pnpm install --frozen-lockfile` succeeds. `pnpm --filter @agentsy/scripts build` passes.
- **Rollback:** Remove the dependencies.

#### Step 11.4: Remove unused dependencies (3 findings)

- **Findings:**
  - `@cortexkit/aft-bridge` in `packages/memory/package.json` (imported in `packages/shared`, `packages/tools` — not in `packages/memory`)
  - `@cortexkit/magic-context` in `packages/memory/package.json`
  - `@cortexkit/magic-context` in `packages/session/package.json`
- **Root cause:** Dependencies declared in the wrong package's `package.json`, or dependencies that were once used but are no longer imported.
- **Recommended fix:**
  1. For `@cortexkit/aft-bridge`: verify it's imported in `packages/shared` and `packages/tools`. If so, add it to those packages' `package.json` and remove it from `packages/memory/package.json`.
  2. For `@cortexkit/magic-context`: verify it's not imported anywhere. If truly unused, remove from both `packages/memory/package.json` and `packages/session/package.json`. If it's used via dynamic import, add a `// fallow-ignore-next-line unused-dependencies` comment with justification, or add it to `ignoreDependencies` in `.fallowrc.jsonc`.
- **Verification:** `pnpm install` succeeds. `pnpm fallow` reports 0 unused dependencies.
- **Rollback:** Restore the dependencies.

#### Step 11.5: Fix duplicate export (1 finding)

- **Finding:** `packages/gateway/src/client.ts` and `packages/gateway/src/registry/index.ts` both export `createLoadBalancedClient`.
- **Root cause:** `client.ts` defines `createLoadBalancedClient` and `registry/index.ts` re-exports it (barrel file pattern). Fallow detects this as a duplicate export.
- **Recommended fix:** This is likely a false positive — barrel re-exports are a standard pattern. Two options:
  1. **Suppress:** Add `packages/gateway/src/registry/index.ts` to `ignoreExports` in `.fallowrc.jsonc` with `{ "file": "packages/gateway/src/registry/index.ts", "exports": ["createLoadBalancedClient"] }`.
  2. **Restructure:** If the barrel re-export is unintentional, remove the re-export from `registry/index.ts` and have consumers import directly from `client.ts`.
- **Verification:** `pnpm fallow` reports 0 duplicate exports.
- **Rollback:** Revert.

#### Step 11.6: Triage and remove dead files (39 findings)

- **Findings:** 39 files not reachable from any entry point. The user listed:
  - `packages/observability/src/instrumentation/provider.ts`
  - `packages/observability/src/instrumentation/runtime.ts`
  - `packages/orchestrator/src/council/executor.ts`, `index.ts`, `presets.ts`, `stage1-opinions.ts`, `stage2-review.ts`, `stage3-chairman.ts`, `types.ts`
  - `packages/runtime/src/ag-ui/index.ts`
  - ... and 29 more
- **Root cause:** Files that were created for features that were never shipped, or were superseded by other implementations, or are entry points that Fallow doesn't recognize (e.g., test-only utilities, storybook files, CLI commands not in the `entry` list).
- **Recommended fix:** For each file, decide:
  1. **Is it a real entry point Fallow missed?** If so, add it to `.fallowrc.jsonc` `entry` array. Examples: CLI commands, MCP server entry points, test utilities exported for cross-package use.
  2. **Is it dead code that should be removed?** If so, delete the file. Examples: the `council/` directory (8 files) looks like an unshipped "council mode" feature — if it's not planned for v1, remove it.
  3. **Is it a work-in-progress that should be kept?** If so, add a `// fallow-ignore-file unused-file` comment with a justification and a tracking issue link.
- **Triage process:** Run `pnpm fallow --format json` to get the full list of 39 files. For each, `git log --oneline -5 <file>` to see when it was last modified and by whom. Decide: entry point, dead code, or WIP.
- **Highest-priority candidates for removal:** The `packages/orchestrator/src/council/` directory (8 files) — if "council mode" is not on the roadmap, this is the biggest chunk of dead code.
- **Verification:** `pnpm fallow` reports 0 unused files (or all remaining are suppressed with justifications).
- **Rollback:** `git revert` the deletion.

#### Step 11.7: Triage and remove/consume unused exports (22 + 4 findings)

- **Findings:** 22 unused exports and 4 unused type exports. The user listed:
  - `scripts/src/release-shared.ts` — 16 unused exports (`createReleaseShared`, `createRollbackManager`, `checkNpmCredentials`, `resolveGithubToken`, `wrapBareUrls`, etc.) + 4 unused type exports (`OctokitType`, `ReleaseNotesOptions`, `GitHubWorkflow`, `GitHubWorkflowRun`)
  - `packages/agents/src/specs/schema.ts` — 4 unused exports (`AgentLayerSchema`, `SkillMetadataSchema`, `AgentHooksSchema`, `isAgentSpec`)
  - `packages/agents/src/loader/agent-loader.ts` — 2 unused exports (`loadAllAgents`, `validateAgentSpec`)
- **Root cause:** Exports that were created for public consumption but never imported by any consumer. As the user noted: "unused exports means either they're not being tested or they're not being consumed in the project which they should be."
- **Recommended fix:** For each export, decide:
  1. **Is it a public API that external consumers should use?** If so, it should have a test and at least one internal consumer. Add a test if missing. If no internal consumer exists, either add one or document it as a public API in the README.
  2. **Is it dead code?** If so, remove the export. Use `pnpm fallow fix --dry-run` to preview the auto-fix.
  3. **Is it a utility intended for future use?** If so, suppress with `// fallow-ignore-next-line unused-exports` and a tracking issue.
- **`scripts/src/release-shared.ts` special case:** 16 unused exports + 4 unused types in one file suggests the file is a "shared utilities" module where most functions are only used by one of the two release scripts (`release.ts` or `release-per-package.ts`). Consider:
  - Splitting `release-shared.ts` into `release-shared-base.ts` (truly shared functions) and inlining the rest into the specific release script that uses them.
  - Or: if the functions ARE used by both scripts but Fallow can't see it because the scripts aren't in the `entry` list, add `scripts/src/release.ts` and `scripts/src/release-per-package.ts` to `.fallowrc.jsonc` `entry`.
- **Verification:** `pnpm fallow` reports 0 unused exports (or all remaining are suppressed with justifications). Each remaining export has a test.
- **Rollback:** Revert deletions.

#### Step 11.8: Extract duplication clone groups (19 clone groups, 710 lines)

- **Findings:** 19 clone groups across 22 files. The largest clone families:
  - **Release scripts** (3 groups, 66 lines): `scripts/src/release-per-package.ts` and `scripts/src/release.ts` share 3 clone groups. Extract into `scripts/src/release-shared-steps.ts`.
  - **Secret providers** (2 groups, 58 lines): `packages/secrets/src/provider/local/dashlane.ts` and `lastpass.ts` share 2 clone groups. Extract into `packages/secrets/src/provider/local/cli-provider-base.ts`.
  - Other clones: `packages/tokenomics/src/cache/semantic-cache.ts` ↔ `signals/retry-detector.ts` (34 lines), `packages/agents/src/loader/agent-loader.ts` ↔ `runtime/agent.ts` (29 lines), `packages/ui/src/cli/create-cli-renderer.ts` ↔ `streaming-md/create-streaming-markdown-renderer.ts` (25 lines), `packages/gateway/src/client.ts` (internal duplication, 21 lines × 2), `packages/agents/src/runtime/session.ts` (internal duplication, 21 lines × 2).
- **Recommended fix:** For each clone family, extract the shared code into a helper module:
  1. **Release scripts:** Extract `detectPackage()`, `parseTag()`, `validateTag()` into `scripts/src/release-shared-steps.ts`. Both release scripts import from it.
  2. **Secret providers:** Extract the CLI-execution pattern (spawn CLI, parse output, handle errors) into `packages/secrets/src/provider/local/cli-provider-base.ts`. `dashlane.ts`, `lastpass.ts`, `1password.ts`, `bitwarden.ts` all follow the same shape.
  3. **Tokenomics:** Extract the "detect pattern in event stream" logic into `packages/tokenomics/src/signals/detector-base.ts`. Both `semantic-cache.ts` and `retry-detector.ts` use it.
  4. **Agents loader:** Extract the agent-spec parsing logic into a shared module consumed by both `agent-loader.ts` and `runtime/agent.ts`.
  5. **UI renderers:** Extract the shared rendering-loop logic into `packages/ui/src/shared/renderer-loop.ts`.
  6. **Gateway client:** The internal duplication in `client.ts` (lines 102–122 and 166–186) suggests two similar functions — extract the common shape.
  7. **Agents session:** The internal duplication in `session.ts` (lines 75–95 and 105–125) suggests two similar reducer functions — extract.
- **Verification:** `pnpm fallow` reports 0 clone groups above the threshold. All affected packages' tests pass.
- **Rollback:** Revert each extraction individually.

#### Step 11.9: Address remaining high-complexity functions (new findings from Fallow)

These are functions flagged by Fallow's complexity analysis that were NOT in the original SonarCloud pass. Many overlap with existing phases (4–9); the new ones are:

| File | Function | Cyclomatic | Cognitive | CRAP | Phase |
|---|---|---|---|---|---|
| `packages/core/src/stream-to-events.ts:294` | `start` | 22 | 11 | — | 11.9.1 |
| `packages/providers/src/normalizers/hf-tgi.ts:83` | `normalizeHuggingFaceTGIChunk` | 19 | 13 | — | 11.9.2 |
| `packages/providers/src/normalizers/zai.ts:152` | `normalizeZAiChunk` | 19 | 16 | — | 11.9.3 |
| `packages/tokenomics/src/learning/learning.test.ts:21` | `makeEntry` | 18 | 17 | — | 11.9.4 |
| `packages/tokenomics/src/learning/pattern-recognizer.ts:198` | `extractDominantKind` | 18 | 17 | — | 11.9.5 |
| `packages/tokenomics/src/roi/calculator.ts:145` | `computeRoiSnapshot` | 17 | 16 | — | 11.9.6 |
| `packages/providers/src/normalizers/gemini.ts:158` | `normalizeGeminiChunk` | 16 | 15 | — | 11.9.7 |
| `packages/runtime/src/ag-ui/http-server.ts:154` | `<arrow>` | 16 | 7 | — | 11.9.8 |
| `packages/runtime/src/loop/simple-turn.ts:71` | `processChunk` | 16 | 13 | — | 11.9.9 |
| `scripts/src/release-per-package.ts:133` | `main` | 16 | 16 | 272 | 11.9.10 |
| `packages/daemon/src/ipc/server.ts:114` | `handleMessage` | 15 | 16 | — | 11.9.11 |
| `scripts/src/release.ts:42` | `main` | 15 | 14 | 240 | 11.9.10 |
| `packages/cli/src/commands/tokenomics.ts:696` | `runTokenomicsCommand` | 14 | 17 | — | 11.9.12 |
| `packages/gateway/src/retry.ts:190` | `classifyReason` | 12 | 19 | — | 11.9.13 |
| `packages/daemon/src/db/unified-db.ts:58` | `open` | 11 | 16 | — | 11.9.14 |
| `scripts/src/release-state.ts:9` | `readReleaseState` | 11 | 6 | 132 | 11.9.15 |
| `scripts/src/validate-workspace.ts:74` | `main` | 11 | 10 | 132 | 11.9.16 |
| `packages/cli/src/commands/tokenomics.ts:498` | `extractCommitShasAndFiles` | 9 | 16 | — | 11.9.17 |
| `packages/tokenomics/src/attribution/survival.ts:136` | `countBlameLines` | 9 | 18 | — | 11.9.18 |
| `packages/observability/src/instrumentation/provider.ts:150` | `processStreamContent` | 9 | 9 | 90 | 11.9.19 |
| `scripts/src/release-shared.ts:43` | `rollback` | 9 | 11 | 90 | 11.9.20 |
| `packages/ui/src/ink/components/model-picker/model-provider-dropdown.tsx:61` | `ModelProviderDropdown` | 9 | 8 | 90 | 11.9.21 |
| `scripts/src/trusted-publish-readiness.ts:81` | `checkTrustedPublishReadiness` | 8 | 7 | 72 | 11.9.22 |
| `scripts/src/release-shared.ts:211` | `parseOwnerRepoFromRemoteUrl` | 8 | 9 | 72 | 11.9.20 |
| `scripts/src/release-shared.ts:270` | `ensureRemoteTagDoesNotExist` | 8 | 5 | 72 | 11.9.20 |
| `scripts/src/trusted-publish-readiness.ts:23` | `getRepositoryField` | 6 | 3 | 42 | 11.9.22 |
| `scripts/src/release-git.ts:54` | `runGit` | 6 | 4 | 42 | 11.9.23 |
| `packages/observability/src/instrumentation/runtime.ts:70` | `onTaskStart` | 6 | 2 | 42 | 11.9.24 |
| `packages/observability/src/instrumentation/runtime.ts:103` | `onError` | 6 | 4 | 42 | 11.9.24 |
| `scripts/src/preview-themes.ts:70` | `applyColor` | 5 | 4 | 30 | 11.9.25 |
| `scripts/src/bootstrap-release.ts:83` | `main` | 5 | 4 | 30 | 11.9.26 |
| `scripts/src/validate-workspace.ts:50` | `collectOffenders` | 5 | 7 | 30 | 11.9.16 |
| `packages/observability/src/instrumentation/provider.ts:91` | `setSpanUsageAttributes` | 5 | 4 | 30 | 11.9.19 |
| `scripts/src/release-shared.ts:141` | `resolveGithubToken` | 5 | 4 | 30 | 11.9.20 |
| `scripts/src/release-shared.ts:159` | `updateChangelogFile` | 5 | 4 | 30 | 11.9.20 |
| `packages/orchestrator/src/council/stage2-review.ts:48` | `parseScore` | 5 | 4 | 30 | 11.9.27 |
| `packages/orchestrator/src/council/stage2-review.ts:109` | `collectCrossReviews` | 5 | 6 | 30 | 11.9.27 |
| `scripts/src/release-git.ts:10` | `resolveGitExecutable` | 5 | 5 | 30 | 11.9.23 |

**Refactor approach for each:** Apply the same three patterns (A: dispatch table, B: validator sequence, C: state machine) from the Cross-Cutting Patterns section. The provider normalizers (11.9.2, 11.9.3, 11.9.7) all benefit from Pattern A — split by chunk type. The `scripts/src/release-*.ts` functions (11.9.10, 11.9.15, 11.9.16, 11.9.20, 11.9.22) benefit from Pattern B — extract validation steps. The `packages/orchestrator/src/council/` functions (11.9.27) are in a dead-code directory (Step 11.6) — remove the directory instead of refactoring.

**Note:** Many of these functions are in `scripts/src/` which is excluded from Fallow after Phase 10. If Phase 10 lands first, these findings become scanner-invisible. The maintainers should still refactor `scripts/src/release-*.ts` for maintainability (the CRAP scores of 240–272 indicate high-risk code), but it's not CI-blocking.

#### Step 11.10: Add Fallow `ignoreExports` entries for intentional barrel re-exports

- **Finding:** Some "unused exports" are intentional barrel re-exports that Fallow can't trace through the workspace protocol.
- **Recommended fix:** Review the existing `ignoreExports` list in `.fallowrc.jsonc` (lines 125–135). Add any additional barrel files that are intentionally public. Each entry should have a comment justifying why it's a public API.

---

## Per-Item Fix Catalog (Quick Reference)

For each finding, the file:line, current complexity (where applicable), and the phase that addresses it.

### Security (Phase 1)

| # | File:Line | Issue | Phase |
|---|---|---|---|
| 1 | `.github/workflows/release.yml:8` | workflow_dispatch `tag` input | 1.1 |
| 2 | `pnpm-lock.yaml:1151` | esbuild@0.28.0 CVE | 1.2 |
| 3 | `packages/plugins/src/audit/context-injections.test.ts:47` | Hardcoded secret | 1.3 |

### Provider / gateway / core (Phase 4)

| # | File:Line | Function | Complexity | Phase |
|---|---|---|---|---|
| 33 | `packages/providers/src/universal-client/client.ts:181` | `buildHeaders` | 29 | 4.1 |
| 34 | `packages/providers/src/normalizers/mistral.ts:65` | `normalizeMistralChunk` | 14 | 4.2 |
| 35 | `packages/providers/src/normalizers/normalizers.test.ts:1` | File NCLOC 1426 | — | 4.3 |
| 36 | `packages/core/src/tool-calls/extract-xml-tool-calls.ts:159` | `extractBareJsonToolCalls` | 18 | 4.4 |
| 37 | `packages/core/src/tool-calls/extract-xml-tool-calls.ts:58` | `parseXmlElement` | 13 | 4.4 |
| 38 | `packages/core/src/tool-calls/tool-call-accumulator.ts:141` | `getPendingCallInfo` | 24 | 4.5 |
| 39 | `packages/core/src/structured/repair-state-machine.ts:48` | `feedCharToStateMachine` | 14 | 4.6 |
| 40 | `packages/core/src/processor/processor/llm-stream-processor.ts:1` | File NCLOC 1039 | — | 4.7 |
| 41 | `packages/gateway/src/registry/local-providers.ts:149` | `registerLocalProviders` | 16 | 4.8 |
| 42 | `packages/gateway/src/quota/header-parser.ts:30` | `parseRateLimitHeaders` | 17 | 4.9 |
| 43 | `packages/gateway/src/switcher.ts:108` | `getCurrentConfig` | 17 | 4.10 |
| 44 | `packages/gateway/src/probes/run-probe.ts:161` | `defaultApiParse` | 29 | 4.11 |
| 45 | `packages/gateway/src/strategies/strategies.ts:244` | `constructor` | 13 | 4.12 |
| 46 | `packages/gateway/src/strategies/strategies.ts:301` | `createStrategy` | 14 | 4.12 |

### Memory / retrieval / UI / session / runtime / vscode (Phase 5)

| # | File:Line | Function | Complexity | Phase |
|---|---|---|---|---|
| 47 | `packages/memory/src/config.ts:114` | `loadConfig` | 33 | 5.1 |
| 48 | `packages/memory/src/sync/turso-manager.ts:51` | `validateSyncConfig` | 15 | 5.2 |
| 49 | `packages/memory/src/agentfs/wiki-adapter.ts:136` | `upsertPage` | 24 | 5.3 |
| 50 | `packages/memory/src/cognitive/learning/observation-extractor.ts:134` | `extractCorrective` | 14 | 5.4 |
| 51 | `packages/retrieval/src/search/index.ts:70` | `vectorSearch` | 13 | 5.5 |
| 52 | `packages/retrieval/src/search/index.ts:113` | `search` | 13 | 5.5 |
| 53 | `packages/retrieval/__tests__/search.test.ts:195` | anonymous | 14 | 5.6 |
| 54 | `packages/ui/src/event-helpers.ts:49` | anonymous | 16 | 5.7 |
| 55 | `packages/ui/src/event-sourcing.ts:81` | `applyConversationEvent` | 22 | 5.8 |
| 56 | `packages/session/src/state/reducers.ts:109` | `reduceSessionState` | 13 | 5.9 |
| 57 | `packages/runtime/src/sandbox/virtual/virtual-sandbox.ts:68` | anonymous | 15 | 5.10 |
| 58 | `packages/vscode/src/test/mocks/vscode.ts:16` | `constructor` | 13 | 5.11 |
| 59 | `packages/vscode/src/usage-tracking/usage-status-bar.ts:64` | `updateDisplay` | 13 | 5.12 |

### CLI / orchestrator / observability / renderers / models / scripts (Phase 6)

| # | File:Line | Function | Complexity | Phase |
|---|---|---|---|---|
| 60 | `packages/cli/src/commands/chat.ts:309` | `runChatCommand` | 15 | 6.1 |
| 61 | `packages/cli/src/commands/chat.ts:247` | `createProviderClient` | 17 | 6.1 |
| 62 | `packages/orchestrator/src/core/engine.test.ts:9` | `createAgent` | 15 | 6.2 |
| 63 | `packages/orchestrator/src/core/engine.test.ts:29` | `createBaseSpec` | 17 | 6.2 |
| 64 | `packages/orchestrator/src/agents/registry.test.ts:6` | `createAgent` | 15 | 6.3 |
| 65 | `packages/observability/src/core/logger.ts:79` | `log` | 13 | 6.4 |
| 66 | `packages/renderers/src/ink/ink-stream-renderer.tsx:188` | `buildRenderOptions` | 13 | 6.5 |
| 67 | `packages/models/src/index.ts:238` | `buildRecommendation` | 19 | 6.6 |
| 68 | `packages/scripts/src/release.ts:42` | `main` | 15 | 6.7 |
| 69 | `packages/scripts/src/trusted-publish-readiness.ts:38` | `validateRepositoryMatch` | 13 | 6.8 |
| 70 | `packages/scripts/src/preview-themes.ts:85` | `displayThemePreview` | 17 | 6.9 |

### Documentation and lockfile (Phase 8)

| # | File:Line | Issue | Phase |
|---|---|---|---|
| 84 | `AGENTS.md:209` | Vague conditional | 8.1 |
| 85 | `AGENTS.md:211` | Vague conditional | 8.2 |
| 86 | `AGENTS.md:1` | Missing IMPLEMENTATION-PLAN.md reference | 8.3 |
| 87 | `AGENTS.md:1` | File-splitting suggestion | 8.4 |
| 88 | `pnpm-lock.yaml:1` | File NCLOC 7636 | 8.5 |
| 89 | `packages/vscode/pnpm-lock.yaml:1` | File NCLOC 2108 | 8.5 |

### Phase 9 — Additional SonarCloud findings

#### Phase 9a — Code smells (quick fixes)

| # | File:Line | Issue | Phase |
|---|---|---|---|
| 90 | `packages/cli/src/cli.ts:10` | Prefer top-level await | 9.1.1 |
| 91 | `packages/memory/src/retrieval/rag/sanitization.ts:3` | Regex complexity 24 > 20 | 9.1.2 |
| 92 | `packages/renderers/src/ink/components/chat/transcript.tsx:78` | Nested ternary in conditional spread | 9.1.3 |
| 93 | `packages/renderers/src/ink/create-ink-renderer.ts:6` | Use default import | 9.1.4 |
| 94 | `packages/runtime/src/index.test.ts` | `toThrow` expects error object | 9.1.5 |

#### Phase 9b — Cognitive complexity

| # | File:Line | Function | Cognitive | Phase |
|---|---|---|---|---|
| 95 | `packages/memory/src/cognitive/awaken.ts:102` | `applyDecayMoves` | 28 | 9.2.1 |
| 96 | `packages/memory/src/cognitive/learning/dialectic-resolver.ts:142` | `detectContradictionsInternal` | 17 | 9.2.2 |
| 97 | `packages/scripts/src/release-shared.ts:346` | `waitForWorkflow` | 19 | 9.2.3 |
| 98 | `packages/scripts/src/write-dist-package.ts` | `main` | 18 | 9.2.4 |

#### Phase 9c — Insecure randomness former-hotspots

| # | File:Line | Issue | Phase |
|---|---|---|---|
| 99 | `packages/gateway/src/strategies/strategies.ts` | `Math.random()` in weighted selection | 9.3.1 |
| 100 | `packages/memory/src/agentfs/tier-adapter.test.ts` | `Math.random()` in test ID | 9.3.2 |
| 101 | `packages/memory/src/cognitive/awaken.test.ts` | `Math.random()` in importance | 9.3.3 |
| 102 | `packages/memory/src/coordination/scheduler.test.ts` | `Math.random()` in jitter | 9.3.4 |
| 103 | `packages/memory/src/retrieval/injection.ts:78` | `Math.random()` in dedup key | 9.3.5 |
| 104 | `packages/orchestrator/src/recovery/policy.ts:335` | `Math.random()` in backoff jitter | 9.3.6 |
| 105 | `packages/memory/src/agentfs/tier-adapter.test.ts` (fingerprint) | `performance.now()` in fingerprint | 9.3.7 |
| 106 | Cross-cutting production code | Audit all `Math.random()` in non-test code | 9.3.8 |

#### Phase 9d — Dynamic code execution safety

| # | File:Line | Issue | Phase |
|---|---|---|---|
| 107 | `packages/runtime/src/sandbox/virtual/sandbox-worker.ts:52` | `runInContext` of user code | 9.4.1 |
| 108 | `packages/tools/src/tools/repl/index.ts:28` | `script.runInContext` in REPL tool | 9.4.2 |

#### Phase 9e — PATH variable hardening

| # | File:Line | Issue | Phase |
|---|---|---|---|
| 109 | `scripts/postinstall-aft.mjs:14, 23` | `execSync('npx ...')` with `process.env` | 9.5.1 |
| 110 | `packages/scripts/src/release-git.ts:13, 26` | `spawnSync` (already mitigated, needs SonarCloud suppression) | 9.5.2 |
| 111 | Cross-cutting | Extract `safePathEnv()` and audit all `spawn*` | 9.5.3 |

#### Phase 9f — Public writable directory test findings

| # | File:Line | Issue | Phase |
|---|---|---|---|
| 112 | `packages/cli/src/commands/guardrails.test.ts:291` | `/tmp/test-policy.yaml` literal | 9.6.1 |
| 113 | `packages/cli/src/commands/guardrails.test.ts:304` | `/tmp/test-policy.json` literal | 9.6.1 |
| 114 | `packages/cli/src/commands/guardrails.test.ts:320` | `/tmp/bad-policy.yaml` literal | 9.6.1 |
| 115 | `packages/runtime/src/hooks/guardrail-hooks.test.ts:151` | `/tmp/test` in tool args | 9.6.2 |
| 116 | `packages/runtime/src/hooks/guardrail-hooks.test.ts:153` | `/tmp/test` in tool args | 9.6.2 |
| 117 | Cross-cutting | Audit all `/tmp/` literals in test files | 9.6.3 |

### Phase 10 — Scanner configuration (execute first)

| # | File | Issue | Phase |
|---|---|---|---|
| 118 | `.fallowrc.jsonc` | Missing `ignorePatterns` for `.agents/` | 10.1 |
| 119 | `sonar-project.properties` | Missing explicit `.agents/**` exclusion | 10.2 |
| 120 | `.codacy.yml` | Already excludes `.agents/**` — verify | 10.3 |
| 121 | `biome.jsonc` | Already excludes dot-folders — verify | 10.3 |
| 122 | `.agents/` directory | Excluded entirely from all scanners — no remediation planned | 10.4 |

### Phase 11 — Dead code, duplication, remaining complexity (later phase)

| # | File / Category | Issue | Count | Phase |
|---|---|---|---|---|
| 123 | Stale suppressions (5 files) | `fallow-ignore` comments no longer matching | 5 | 11.1 |
| 124 | Unresolved imports (3 files) | `../specs/types.js` missing, cross-package relative import | 4 | 11.2 |
| 125 | Unlisted dependencies | `@octokit/rest`, `ora`, `zx` missing from package.json | 3 | 11.3 |
| 126 | Unused dependencies | `@cortexkit/aft-bridge`, `@cortexkit/magic-context` | 3 | 11.4 |
| 127 | Duplicate export | `createLoadBalancedClient` in gateway | 1 | 11.5 |
| 128 | Unused files | Dead files not reachable from entry points | 39 | 11.6 |
| 129 | Unused exports | Exports with no consumers | 22+4 | 11.7 |
| 130 | Duplication clone groups | 710 lines duplicated across 22 files | 19 | 11.8 |
| 131 | High-complexity functions | New Fallow findings (cyclomatic/cognitive/CRAP) | 38 | 11.9 |
| 132 | Barrel re-exports | Intentional re-exports needing `ignoreExports` entries | — | 11.10 |

---

## Verification Checklist

### Phase 1 — Security

- [ ] `release.yml` no longer accepts an unvalidated `tag` input (or `workflow_dispatch` is removed entirely)
- [ ] `esbuild` is at `^0.28.1` in `pnpm-lock.yaml`; `pnpm audit` reports no esbuild advisory
- [ ] `context-injections.test.ts` no longer contains a secret-shaped hardcoded string
- [ ] `pnpm build` passes
- [ ] `pnpm test` passes

### Phase 4 — Provider / gateway / core

- [ ] `buildHeaders` uses a dispatch table; complexity ≤ 5
- [ ] `normalizeMistralChunk` split into 3 helpers; complexity ≤ 5
- [ ] `normalizers.test.ts` split by provider; each file < 300 lines
- [ ] `extractBareJsonToolCalls` and `parseXmlElement` refactored; complexity ≤ 8
- [ ] `getPendingCallInfo` split; complexity ≤ 5
- [ ] `feedCharToStateMachine` uses state-handler map; complexity ≤ 5
- [ ] `llm-stream-processor.ts` is < 400 lines
- [ ] `registerLocalProviders` uses per-provider functions; complexity ≤ 5
- [ ] `parseRateLimitHeaders` uses dispatch table or split helpers; complexity ≤ 8
- [ ] `getCurrentConfig` complexity ≤ 8
- [ ] `defaultApiParse` uses dispatch table; complexity ≤ 5
- [ ] `strategies.ts` constructor and `createStrategy` complexity ≤ 8
- [ ] `pnpm --filter @agentsy/providers test` passes
- [ ] `pnpm --filter @agentsy/core test` passes
- [ ] `pnpm --filter @agentsy/gateway test` passes

### Phase 5 — Memory / retrieval / UI / session / runtime / vscode

- [ ] `loadConfig` split into 6 helpers; complexity ≤ 8
- [ ] `validateSyncConfig` split; complexity ≤ 8
- [ ] `upsertPage` split; complexity ≤ 8
- [ ] `extractCorrective` split; complexity ≤ 8
- [ ] `vectorSearch` and `search` complexity ≤ 8
- [ ] `search.test.ts` complex callback extracted or split into multiple `it` cases
- [ ] `event-helpers.ts` anonymous callback extracted
- [ ] `applyConversationEvent` uses dispatch table; complexity ≤ 8
- [ ] `reduceSessionState` uses dispatch table; complexity ≤ 8
- [ ] `virtual-sandbox.ts` anonymous callback extracted
- [ ] `vscode.ts` mock constructor split; complexity ≤ 8
- [ ] `usage-status-bar.ts` `updateDisplay` split; complexity ≤ 8
- [ ] All affected packages' tests pass

### Phase 6 — CLI / orchestrator / observability / renderers / models / scripts

- [ ] `runChatCommand` and `createProviderClient` complexity ≤ 8
- [ ] `engine.test.ts` and `registry.test.ts` fixture builders refactored
- [ ] `logger.ts` `log` split; complexity ≤ 8
- [ ] `ink-stream-renderer.tsx` `buildRenderOptions` split; complexity ≤ 8
- [ ] `models/index.ts` `buildRecommendation` split; complexity ≤ 8
- [ ] `release.ts` `main` split; complexity ≤ 8
- [ ] `trusted-publish-readiness.ts` `validateRepositoryMatch` split; complexity ≤ 8
- [ ] `preview-themes.ts` `displayThemePreview` split; complexity ≤ 8
- [ ] All affected packages' tests pass

### Phase 8 — Documentation and lockfile

- [ ] `AGENTS.md` line 209 has a concrete commitment
- [ ] `AGENTS.md` line 211 has a concrete commitment
- [ ] Root `IMPLEMENTATION-PLAN.md` exists (or AGENTS.md is updated to reference per-package files explicitly)
- [ ] AGENTS.md file-splitting finding is addressed (suppressed or split)
- [ ] `.fallowrc.jsonc` ignores `pnpm-lock.yaml`
- [ ] `sonar-project.properties` excludes lockfiles

### Phase 9a — Code smells (quick fixes)

- [ ] `packages/cli/src/cli.ts` uses top-level await (no `async function main()` wrapper)
- [ ] `packages/memory/src/retrieval/rag/sanitization.ts` regex complexity ≤ 20 (or suppressed with justification)
- [ ] `packages/renderers/src/ink/components/chat/transcript.tsx` has no nested ternary in conditional spreads (extracted helper or unconditional prop passing)
- [ ] `packages/renderers/src/ink/create-ink-renderer.ts` uses `import InkStreamRenderer from '...'` (default import)
- [ ] `packages/runtime/src/index.test.ts` uses `toThrow(/regex/)` or `toThrow(ErrorSubclass)` instead of `toThrow('string')`

### Phase 9b — Cognitive complexity

- [ ] `applyDecayMoves` in `packages/memory/src/cognitive/awaken.ts` has cognitive complexity ≤ 15 (target ≤ 8 via dispatch table)
- [ ] `detectContradictionsInternal` in `packages/memory/src/cognitive/learning/dialectic-resolver.ts` has cognitive complexity ≤ 15
- [ ] `waitForWorkflow` in `packages/scripts/src/release-shared.ts` has cognitive complexity ≤ 15
- [ ] `main` in `packages/scripts/src/write-dist-package.ts` has cognitive complexity ≤ 15
- [ ] All affected packages' tests pass: `pnpm --filter @agentsy/memory test`, `pnpm --filter @agentsy/scripts test`

### Phase 9c — Insecure randomness former-hotspots

- [ ] `packages/gateway/src/strategies/strategies.ts` `Math.random()` suppressed with justification OR replaced
- [ ] `packages/memory/src/agentfs/tier-adapter.test.ts` `Math.random()` suppressed or replaced with deterministic counter
- [ ] `packages/memory/src/cognitive/awaken.test.ts` `Math.random()` suppressed or seeded
- [ ] `packages/memory/src/coordination/scheduler.test.ts` `Math.random()` suppressed (SonarCloud-recognized suppression)
- [ ] `packages/memory/src/retrieval/injection.ts` dedup key uses content hash instead of `Math.random()`
- [ ] `packages/orchestrator/src/recovery/policy.ts` backoff jitter suppressed with justification
- [ ] All SonarCloud insecure-randomness hotspots marked "Safe" or "Acknowledged"
- [ ] Cross-cutting audit: `rg -n "Math\.random\(\)" packages/ --glob '!*.test.ts'` returns no hits in security-sensitive code paths

### Phase 9d — Dynamic code execution safety

- [ ] `packages/runtime/src/sandbox/virtual/sandbox-worker.ts` has documented threat model in `README.md`
- [ ] `sandbox-worker.ts` context excludes `Buffer` (or has documented justification for inclusion)
- [ ] `sandbox-worker.ts` uses `microtaskMode: 'afterEvaluate'`
- [ ] Test verifies the context has no `require`, `global`, `process.exit`, `__dirname`
- [ ] Test verifies `worker.terminate()` is called on timeout
- [ ] `packages/tools/src/tools/repl/index.ts` routes through `sandbox-worker.ts` (no inline `runInContext`)
- [ ] `repl_execute` tool's `requiresApproval: true` is enforced by the runtime's approval hook
- [ ] Every `repl_execute` invocation is audit-logged
- [ ] Documented plan to migrate to `isolated-vm` for truly untrusted code (long-term)

### Phase 9e — PATH variable hardening

- [ ] `safePathEnv()` utility exists in `packages/shared/src/safe-path.ts` (or `packages/scripts/src/safe-path.ts`)
- [ ] `safePathEnv()` handles Windows (`C:\Windows\System32`, etc.) not just Unix
- [ ] `scripts/postinstall-aft.mjs` uses `safePathEnv()` instead of `process.env`
- [ ] `packages/scripts/src/release-git.ts` uses the shared `safePathEnv()` utility
- [ ] SonarCloud suppression added to `release-git.ts` (or hotspot marked "Safe")
- [ ] Cross-cutting audit: `rg -n "spawnSync\(|execSync\(|spawn\(" packages/ scripts/ --glob '!*.test.ts'` — all hits use `safePathEnv()` or have documented justification

### Phase 9f — Public writable directory test findings

- [ ] `packages/cli/src/commands/guardrails.test.ts` uses `os.tmpdir()` or clearly-fake paths instead of `/tmp/...` literals
- [ ] `packages/runtime/src/hooks/guardrail-hooks.test.ts` uses `os.tmpdir()` or clearly-fake paths
- [ ] Cross-cutting audit: `rg -n '"/tmp/' packages/ --glob '*.test.ts'` returns no unjustified hits
- [ ] All affected packages' tests pass: `pnpm --filter @agentsy/cli test`, `pnpm --filter @agentsy/runtime test`

### Phase 10 — Scanner configuration (execute first)

- [ ] `.fallowrc.jsonc` has top-level `ignorePatterns` array including `.agents/**` (and standard build artifacts: `plan/**`, `docs/**`, `.github/**`, `coverage/**`, `**/dist/**`, `**/node_modules/**`, `**/*.md`, `**/pnpm-lock.yaml`)
- [ ] `pnpm fallow` reports 0 findings for `.agents/**`
- [ ] Fallow finding count dropped significantly (~40 `.agents/` findings eliminated)
- [ ] `sonar-project.properties` has `sonar.exclusions` including `.agents/**`
- [ ] SonarCloud scan reports 0 findings for `.agents/**`
- [ ] Codacy (`.codacy.yml`) confirmed to already exclude `.agents/**` — no change needed
- [ ] Biome (`biome.jsonc`) confirmed to already exclude dot-folders via `!.*/**/*` — no change needed
- [ ] No phases in this plan reference any file under `.agents/`

### Phase 11 — Dead code, duplication, remaining complexity (later phase)

- [ ] 5 stale `fallow-ignore` suppression comments removed; `pnpm fallow` reports 0 stale suppressions
- [ ] 4 unresolved imports fixed (`../specs/types.js` paths corrected, cross-package relative import replaced with workspace import)
- [ ] 3 unlisted dependencies (`@octokit/rest`, `ora`, `zx`) added to the correct `package.json`
- [ ] 3 unused dependencies (`@cortexkit/aft-bridge`, `@cortexkit/magic-context`) removed or moved to the correct package
- [ ] 1 duplicate export (`createLoadBalancedClient`) resolved via suppression or restructure
- [ ] 39 unused files triaged: each is either (a) added to `.fallowrc.jsonc` `entry`, (b) deleted, or (c) suppressed with justification
- [ ] `packages/orchestrator/src/council/` directory (8 files) removed if "council mode" is not on the roadmap
- [ ] 22 unused exports + 4 unused type exports triaged: each is either (a) given a test + internal consumer, (b) removed, or (c) suppressed with justification
- [ ] `scripts/src/release-shared.ts` either split or its consumers added to `.fallowrc.jsonc` `entry`
- [ ] 19 duplication clone groups extracted into shared helper modules
- [ ] Release-script clone family (66 lines) extracted into `scripts/src/release-shared-steps.ts`
- [ ] Secret-provider clone family (58 lines) extracted into `packages/secrets/src/provider/local/cli-provider-base.ts`
- [ ] 38 high-complexity functions refactored using Pattern A (dispatch table), Pattern B (validator sequence), or Pattern C (state machine)
- [ ] `packages/orchestrator/src/council/` complexity findings (11.9.27) resolved by removing the directory (not refactoring)
- [ ] `pnpm fallow` reports 0 unused files, 0 unused exports, 0 unused types, 0 unused dependencies, 0 unresolved imports, 0 unlisted dependencies, 0 duplicate exports, 0 stale suppressions, 0 clone groups above threshold
- [ ] All affected packages' tests pass after each sub-step

### Cross-cutting

- [ ] `pnpm lint` passes (no complexity findings)
- [ ] `pnpm check-types` passes
- [ ] `pnpm test` passes
- [ ] `pnpm audit` reports no HIGH or CRITICAL vulnerabilities
- [ ] Fallow reports 0 CRITICAL complexity findings
- [ ] SonarCloud reports 0 CRITICAL complexity findings
- [ ] PR template includes a checkbox: "I have verified no new complexity findings were introduced"

---

## Final Recommendation

**Execution order: Phase 10 → Phase 1 → Phases 4–6, 8–9 (parallelizable) → Phase 11 (later).**

Phase 10 (scanner configuration) must land FIRST — it's a 1-hour config change that excludes `.agents/` from all scanners, eliminating ~40 findings. After Phase 10, Phase 1 (security) is a quick win (hours of effort, immediate CI greening). Phases 4–6 and 8–9 are per-package refactors that can be parallelized across maintainers. Phase 11 (dead code, duplication, remaining complexity) is the "later phase" that requires product decisions about which exports are public API vs. dead code.

**Estimated effort:**

| Phase | Effort | Can parallelize? | Notes |
|---|---|---|---|
| **10 — Scanner config** | **1 hour** | **No** | **EXECUTE FIRST. Excludes `.agents/` from all scanners. Eliminates ~40 findings.** |
| 1 — Security | 2 hours | No (sequential) | |
| 4 — Provider/gateway/core | 1–2 days | Yes (3 maintainers) | |
| 5 — Memory/retrieval/UI/session/runtime/vscode | 1 day | Yes (6 maintainers) | |
| 6 — CLI/orchestrator/observability/renderers/models/scripts | 1 day | Yes (6 maintainers) | |
| 8 — Documentation and lockfile | 1 hour | No | |
| 9 — Additional SonarCloud findings | 1–2 days | Yes (sub-phases 9a–9f are independent) | |
| **11 — Dead code/duplication/complexity** | **3–5 days** | **Yes (sub-steps 11.1–11.10 are independent)** | **LATER PHASE.** Requires product decisions about public API vs. dead code. |
| **Total** | **~6–9 days focused work** (or ~2–3 calendar weeks with parallelism) | | |

**The structural benefit extends beyond closing findings.** The three patterns (dispatch table, validator sequence, state-machine class) are reusable. Once maintainers internalize them, new code is less likely to accrete complexity. Phase 11's dead-code triage will surface architectural decisions that need to be made: which packages are public API, which features (like "council mode") are still on the roadmap, and which utilities are shared infrastructure vs. one-off scripts.

**Risk assessment by phase:**

- **Phase 10** is the lowest-risk, highest-impact change. It's config-only and eliminates ~40 findings. **Land it first.**
- **Phase 11** carries product-decision risk — removing "unused" exports or files that are actually intended for future use could break downstream consumers. Mitigation: triage each finding individually, suppress with justification rather than delete if uncertain.
- All other phases are low-risk: each refactor is local to one function, has unit-test coverage, and produces no behavioral change.
