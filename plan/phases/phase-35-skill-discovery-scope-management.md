## Phase 35 — Skill Discovery, Registry Install & Scope Management (autoskills + skillsor parity)

**Priority**: P1 — Sprint 4 (parallel with Phase 34)
**Story points**: 5
**Branch**: `feat/skill-discovery-scope-management`
**Depends on**: `@agentsy/plugins` skill discovery/activator primitives, Phase 18 (Council CLI surface)
**Unblocks**: reproducible project skill bootstrap, curated global skill installation, shadowed project overrides

> **Adopted patterns**:
> * `autoskills` → stack-aware detection, curated registry install, verification, lockfile
> * `skillsor` / Vercel skills → global vs project scope, shadowing, catalog layouts, user-visible scope switching

---

### 35.1 Current state

Agentsy already has the core runtime pieces in `@agentsy/plugins`:

* `SkillDiscoverer` — scans project/global/bundled roots
* `SkillActivator` — scores skill relevance against user text
* `SkillManifest` / `SkillMetadata` — skill metadata model
* `/skills list` and `/skills show` slash commands

But these are **read-time only**. There is no first-class install/scope manager.

### 35.2 Gap

What is missing relative to `autoskills` + `skillsor`:

1. **Skill registry install** — fetch curated skills from a signed registry, verify files, write locally
2. **Project vs global scope** — explicit scope ownership and resolution rules
3. **Shadowing** — project skill overrides global skill with same name
4. **Lockfile / manifest** — reproducible installs and content hashes
5. **Auto-detection** — map project stack → recommended skills
6. **Command surface** — `skills install`, `skills scope`, `skills sync`, `skills doctor`

---

### 35.3 Proposed design

#### 35.3.1 Scope model

Use two primary scopes:

* **Project**: committed in repo, default path `.agents/skills/`
* **Global**: user-wide, default path `~/.agents/skills/`

Resolution order:

1. Project skill
2. Global skill
3. XDG config/data roots
4. Bundled built-ins

A project-local skill with the same `name` must shadow a global skill.

#### 35.3.2 Curated registry

Add a registry-backed skill catalog:

* signed manifest index
* per-skill bundle hash
* file integrity verification before write
* only selected skills downloaded

Lockfile:

```json
{
  "version": 1,
  "installedAt": "2026-06-17T12:00:00Z",
  "skills": [
    {
      "name": "typescript-expert",
      "scope": "global",
      "source": "registry",
      "bundleHash": "sha256:...",
      "files": ["SKILL.md", "references/*.md"]
    }
  ]
}
```

#### 35.3.3 Stack detector

Detect project stack from local files and choose recommended skills:

* `package.json` / `pnpm-workspace.yaml`
* `tsconfig.json`
* `vite.config.*`
* `next.config.*`
* `svelte.config.*`
* `astro.config.*`
* `tailwind.config.*`
* `turbo.json`
* `Dockerfile`
* `go.mod`
* `Cargo.toml`

Examples:

* Node/TypeScript repo → `typescript`, `pnpm`, `turborepo`, `vitest`
* SvelteKit repo → `sveltekit-*` skills
* Docs repo → `docs-writer`, `technical-writer`, `mermaid`
* Security-heavy repo → `security-audit`, `security-review`, `gdpr-compliant`

#### 35.3.4 CLI surface

Add commands:

```bash
agentsy skills discover
agentsy skills install
agentsy skills list --scope project|global|all
agentsy skills show <name>
agentsy skills scope set <name> project|global
agentsy skills sync
agentsy skills doctor
```

#### 35.3.5 Install semantics

* `install` writes into project or global directory
* install is verified against registry hash before write
* project install can optionally be committed to repo
* `sync` reconciles installed skills with the lockfile
* `doctor` checks for drift, missing files, shadowed duplicates, and broken manifests

---

### 35.4 Reuse existing code

Build on:

* `packages/plugins/src/skills/discoverer.ts`
* `packages/plugins/src/skills/activator.ts`
* `packages/plugins/src/skills/manifest.ts`
* existing `/skills list` and `/skills show`

Do **not** create a second discovery engine.

---

### 35.5 Tests

* project skill shadows global skill with same name
* install writes verified bundle and lockfile
* stack detector recommends the correct default set
* doctor flags missing or tampered skill files
* scope switching updates resolution order
* discoverer returns project skills before global skills

---

### 35.6 Verification

* `agentsy skills discover` lists project + global skills in priority order
* `agentsy skills install` installs only curated skills from registry
* `agentsy skills scope set foo project` moves foo to project scope
* `agentsy skills doctor` reports drift and shadowing clearly
