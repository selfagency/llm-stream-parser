

## 20. Phase 15 — Project Auto-Detection & Bootstrap

**Priority**: P2 — Sprints 8–9
**Story points**: 7
**Branch**: `feat/project-bootstrap`
**Depends on**: Phase 1 ✅ (daemon, `UnifiedDB`), Phase 8 ✅ (event bus for file-watcher)
**Unblocks**: Better default agent behavior, AGENTS.md generation, MCP/skills/guardrails recommendation

### 20.0 Overview

When an agent session opens onto a working directory, Agentsy should answer four questions **without prompting the user**:

1. **What is this project?** — language(s), framework(s), package manager, build system, linter, test runner, monorepo layout, CI, deployment target.
2. **What Agentsy components are already installed here?** — connectors, MCP servers, skills, guardrails, hooks.
3. **What is relevant to install here but missing?** — given the detected profile, which connectors / MCP servers / skills / guardrails from the four supported registries would meaningfully improve agent effectiveness?
4. **What context artifacts does this project expose to agents?** — `AGENTS.md`, `.agentsy/aft.*`, Magic Context compartments.

This phase builds the subsystem that answers all four, persists the answers in `.agentsy/config.yml` and in `UnifiedDB`, exposes them as an internal tool callable by agents, and offers the user a one-shot install flow for missing components.

### 20.1 Project Scanner & Detector

Pure, side-effect-free function that walks a project root and emits a `ProjectProfile`.

```typescript
// packages/bootstrap/src/scanner.ts (NEW)

export interface ProjectProfile {
  readonly rootPath: string;
  readonly languages: Language[];
  readonly frameworks: Framework[];
  readonly packageManager: 'npm' | 'pnpm' | 'yarn' | 'pip' | 'poetry' | 'cargo' | 'go' | 'mix' | 'other';
  readonly buildSystem: string;
  readonly linter: string[];
  readonly testRunner: string[];
  readonly monorepo: boolean;
  readonly monorepoTool?: 'pnpm' | 'nx' | 'turbo' | 'lerna' | 'bazel';
  readonly ci: CI[];
  readonly deploymentTarget: string[];
  readonly detectedAt: string;
}

export async function scanProject(rootPath: string): Promise<ProjectProfile> {
  // Walk the directory, check sentinel files:
  //   package.json → Node.js (npm/pnpm/yarn based on lockfile)
  //   pyproject.toml / requirements.txt → Python (poetry/pip)
  //   Cargo.toml → Rust (cargo)
  //   go.mod → Go
  //   mix.exs → Elixir
  //   .github/workflows/ → GitHub Actions
  //   .gitlab-ci.yml → GitLab CI
  //   pnpm-workspace.yaml → pnpm monorepo
  //   nx.json → Nx monorepo
  //   turbo.json → Turbo monorepo
  // ...
}
```

### 20.2 `.agentsy/config.yml` — Per-Project Configuration Schema

```yaml
# .agentsy/config.yml
schemaVersion: 1  # Long-term schema — no v2 planned (see §10.17.5 of v2.3)

project:
  rootPath: /home/user/projects/my-app
  profile:                          # From Phase 15.1 scanner
    languages: [typescript, javascript]
    frameworks: [next.js, react]
    packageManager: pnpm
    buildSystem: next
    linter: [biome, eslint]
    testRunner: [vitest, playwright]
    monorepo: false
    ci: [github-actions]
    deploymentTarget: [vercel]
  detectedAt: 2026-06-17T10:30:00Z

installed:
  connectors: []                    # Phase 15.4 adapter-discovered
  mcpServers: []                    # Phase 15.4 adapter-discovered
  skills: []                        # Phase 15.4 adapter-discovered
  guardrails:                       # From @agentsy/guardrails install
    - id: builtin:pii
      version: 1.0.0
      source: builtin
  hooks: []                         # From .agentsy/hooks/

recommendations:                   # From Phase 15.5 recommendation engine
  - componentType: mcp-server
    componentId: io.github.example.postgres-mcp
    reason: "Detected PostgreSQL usage in prisma/schema.prisma"
    confidence: 0.9
    installCommand: "agentsy install mcp io.github.example.postgres-mcp"

artifacts:
  agentsMd: true                    # AGENTS.md generated (Phase 15.7)
  aft: true                         # .agentsy/aft.{md,json} generated (Phase 15.8)
  magicContext: true                # Magic Context compartments seeded (Phase 15.9)

reviewers: []                       # Maintainer sign-offs
```

### 20.3 Internal Project Config Tool (Agent-Callable)

Three `agentsy.project.*` tools:

- `agentsy.project.scan` — re-runs the scanner and updates `.agentsy/config.yml`.
- `agentsy.project.profile` — returns the current `ProjectProfile`.
- `agentsy.project.recommend` — returns the current recommendation list.

### 20.4 Registry Adapters

Four adapters, each fetching from its authoritative source:

**20.4.1 ECC Tools adapter** — git-clone `https://github.com/affaan-m/ECC` and read 3 manifest JSON files (`install-components.json`, `install-modules.json`, `install-profiles.json`). Components/modules/profiles hierarchy. Install flow: `npx ecc-install --target agentsy --with <component>`.

**20.4.2 Skills.sh adapter** — Vercel OIDC-authenticated REST API at `https://www.skills.sh/api/v1/*`. 6 endpoints: list, search, curated, detail, audit. SHA-256 content hash as version fingerprint (no semver). Security audit endpoint for install gating.

**20.4.3 MCP Registry adapter** — frozen `https://registry.modelcontextprotocol.io/v0.1/` REST API with cursor pagination. `server.json` manifest with reverse-DNS `name` (`io.modelcontextprotocol.*` official, `io.github.*` GitHub-verified, `me.{domain}.*` DNS-verified). `packages[]` array with `registryType` dispatch (npm/pypi/nuget/cargo/oci/mcpb). `environmentVariables[]` for required config.

**20.4.4 Guardrails Hub adapter** — curated mirror catalog (no JSON API exists). Mirror the Guardrails AI GitHub organization's `@register_validator` decorators. Port validators to native TypeScript in `@agentsy/guardrails` (no Python subprocess). 3-tier strategy: Rule → direct port; LLM → native LLM call; ML → JS-equivalent or deferred.

### 20.5 Skills Spec Compliance

All installed skills (regardless of source) normalize to the AgentSkills spec at https://agentskills.io/specification. Canonical `SKILL.md` format with YAML frontmatter (`name`, `description` required; `license`, `compatibility`, `metadata`, `allowed-tools` optional) + Markdown body + optional `scripts/`, `references/`, `assets/` subdirectories. Three-tier progressive disclosure (~100 / <5000 / on-demand tokens).

### 20.6 Recommendation Engine

```typescript
// packages/bootstrap/src/recommend.ts (NEW)

export interface Recommendation {
  componentType: 'connector' | 'mcp-server' | 'skill' | 'guardrail';
  componentId: string;
  reason: string;
  confidence: number;                  // 0..1
  installCommand: string;
}

export function recommend(profile: ProjectProfile, installed: InstalledComponents): Recommendation[] {
  const recs: Recommendation[] = [];

  // If PostgreSQL detected, recommend postgres MCP server
  if (profile.frameworks.includes('prisma') || profile.frameworks.includes('drizzle')) {
    if (!installed.mcpServers.some(s => s.id.includes('postgres'))) {
      recs.push({
        componentType: 'mcp-server',
        componentId: 'io.modelcontextprotocol.postgres',
        reason: 'Detected PostgreSQL ORM (prisma/drizle) in project',
        confidence: 0.9,
        installCommand: 'agentsy install mcp io.modelcontextprotocol.postgres',
      });
    }
  }

  // If Next.js detected, recommend nextjs skill
  if (profile.frameworks.includes('next.js')) {
    if (!installed.skills.some(s => s.name === 'nextjs-app-router')) {
      recs.push({
        componentType: 'skill',
        componentId: 'nextjs-app-router',
        reason: 'Detected Next.js — App Router skill helps with route handlers, server components, etc.',
        confidence: 0.8,
        installCommand: 'agentsy install skill nextjs-app-router',
      });
    }
  }

  // ... more rules
  return recs;
}
```

### 20.7 Install / Offer Flow

```typescript
// packages/bootstrap/src/install.ts (NEW)

export async function installComponent(rec: Recommendation): Promise<void> {
  switch (rec.componentType) {
    case 'mcp-server':
      // Use MCP Registry adapter to fetch manifest
      // Use SubprocessManager to start the MCP server
      // Persist to .agentsy/config.yml
      break;
    case 'skill':
      // Use Skills.sh adapter to download
      // Normalize to AgentSkills spec
      // Persist to .agentsy/skills/<name>/
      break;
    case 'guardrail':
      // Use Guardrails Hub adapter
      // Port to TypeScript if needed
      // Register with GuardrailPipeline
      break;
    case 'connector':
      // Use ECC Tools adapter
      break;
  }
}
```

CLI: `agentsy install <type> <id>` and `agentsy install --recommended` (installs all recommendations with confidence ≥ 0.8).

### 20.8 AGENTS.md Generator

Generate `AGENTS.md` at project root with: project overview, commands (build/test/lint), layout, conventions, gotchas, agentsy components, do/don't. Seeded from `ProjectProfile` and editable by the user.

### 20.9 AFT — Agent File Tree

Generate `.agentsy/aft.{md,json}` — a structured file-tree map. Markdown for human reading; JSON for agent consumption. Top-level layout, entry points, config files, stats (LOC, file count by language), ignored paths.

### 20.10 Magic Context Bootstrap

Seed Magic Context compartments in `UnifiedDB.context_*`:
- `project_memories` — high-level project facts (name, purpose, stack).
- `compartments` — fine-grained context buckets (e.g. "api-routes", "database-schema", "ui-components").
- `session_meta` — session-level context (current task, recent files).
- `project_state` — project-level state (current branch, recent commits, TODO items).

Loaded into every session scoped to this project.

### 20.11 Bootstrap Daemon Service

`BootstrapService` runs as a `Service` in the daemon. On session open (ACP `session/new` or CLI invocation), it:
1. Checks if `.agentsy/config.yml` exists. If not, runs `scanProject` and writes it.
2. Loads the `ProjectProfile` and Magic Context compartments into the session.
3. Returns the profile + recommendations to the agent.

### 20.12 Hook Integration

Add a `SessionStart` hook (Phase 3 hook schema) that triggers `BootstrapService.bootstrap(cwd)`.

### 20.13 CLI Integration

- `agentsy project scan` — re-run the scanner.
- `agentsy project init` — generate `.agentsy/config.yml`, `AGENTS.md`, `.agentsy/aft.{md,json}`.
- `agentsy project update` — re-scan and update existing artifacts.
- `agentsy install <type> <id>` — install a component.
- `agentsy install --recommended` — install all high-confidence recommendations.

### 20.14 Package Layout

New `@agentsy/bootstrap` package (26th package):

```
packages/bootstrap/
├── src/
│   ├── scanner.ts              # ProjectProfile detection
│   ├── config.ts               # .agentsy/config.yml schema + I/O
│   ├── recommend.ts            # Recommendation engine
│   ├── install.ts              # Install flow
│   ├── adapters/
│   │   ├── ecc-tools.ts        # ECC Tools adapter
│   │   ├── skills-sh.ts        # Skills.sh adapter
│   │   ├── mcp-registry.ts     # MCP Registry adapter
│   │   └── guardrails-hub.ts   # Guardrails Hub adapter
│   ├── generators/
│   │   ├── agents-md.ts        # AGENTS.md generator
│   │   ├── aft.ts              # AFT generator
│   │   └── magic-context.ts    # Magic Context bootstrap
│   ├── tools.ts                # agentsy.project.* tool definitions
│   └── index.ts
├── package.json
└── tsconfig.json
```

### 20.15 Multi-Root Workspaces

Support multi-root workspaces via the `/add-project-folder` slash command. Each root is scanned independently and merged into a single project profile. ACP `additionalDirectories` maps to this.

### 20.16 Tests

- Scanner fixtures: detect Next.js, React, Vue, Django, FastAPI, Rails, Express, etc.
- Adapter tests: each adapter fetches from its source and parses correctly.
- Recommendation tests: given a profile, the right recommendations are produced.
- Install tests: each component type installs and persists correctly.
- AGENTS.md / AFT / Magic Context generation tests.
- Multi-root workspace test: two roots merge into one profile.

### 20.17 Verification

- [ ] `@agentsy/bootstrap` package exists
- [ ] Scanner detects languages, frameworks, package managers, build systems, linters, test runners
- [ ] `.agentsy/config.yml` schema is stable (`schemaVersion: 1`)
- [ ] All 4 registry adapters fetch from their authoritative sources
- [ ] Recommendation engine produces relevant recommendations
- [ ] `agentsy install <type> <id>` and `agentsy install --recommended` work
- [ ] `AGENTS.md`, `.agentsy/aft.{md,json}`, Magic Context compartments generated
- [ ] `BootstrapService` runs in the daemon
- [ ] Multi-root workspaces supported
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

---

