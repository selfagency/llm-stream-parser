---
goal: @agentsy/scripts production implementation plan
version: 1.0
date_created: 2026-05-15
last_updated: 2026-05-15
owner: scripts-maintainers
status: In progress
tags: [feature, architecture, scripts, automation, release]
---

# Introduction

![Status: In progress](https://img.shields.io/badge/status-In%20progress-yellow)

This plan defines the production implementation order for `@agentsy/scripts` as the automation and release operations package.

## 1. Requirements & Constraints

- **REQ-SCRIPTS-001**: Scripts cover bootstrap, build, test, lint, release, and maintenance workflows.
- **REQ-SCRIPTS-002**: CI-targeted scripts are deterministic and non-interactive.
- **REQ-SCRIPTS-003**: Release automation aligns with versioning/changelog workflows.
- **REQ-SCRIPTS-004**: Script entrypoints and prerequisites are documented.
- **SEC-SCRIPTS-001**: Publish/release scripts validate credentials/targets before mutation.
- **SEC-SCRIPTS-002**: Destructive maintenance actions require explicit confirmation flags.
- **CON-SCRIPTS-001**: Scripts package is dev/CI-only and not imported into runtime paths.
- **CON-SCRIPTS-002**: Avoid duplicating logic already exposed by package APIs.

## 2. Implementation Steps

### Implementation Phase 1

- GOAL-SCRIPTS-001: Contract and command inventory stabilization.

| Task             | Description                                                  | Completed | Date |
| ---------------- | ------------------------------------------------------------ | --------- | ---- |
| TASK-SCRIPTS-001 | Audit script entrypoints and normalize command taxonomy.     |           |      |
| TASK-SCRIPTS-002 | Define non-interactive CI contracts and exit-code semantics. |           |      |
| TASK-SCRIPTS-003 | Document script boundaries and ownership.                    |           |      |

### Implementation Phase 2

- GOAL-SCRIPTS-002: Core automation implementation.

| Task             | Description                                                 | Completed | Date |
| ---------------- | ----------------------------------------------------------- | --------- | ---- |
| TASK-SCRIPTS-004 | Implement/refresh build-test-release script pipelines.      |           |      |
| TASK-SCRIPTS-005 | Add guardrails for destructive and publish operations.      |           |      |
| TASK-SCRIPTS-006 | Add script configuration validation and diagnostics output. |           |      |

### Implementation Phase 3

- GOAL-SCRIPTS-003: CI and monorepo integration.

| Task             | Description                                                          | Completed | Date |
| ---------------- | -------------------------------------------------------------------- | --------- | ---- |
| TASK-SCRIPTS-007 | Integrate script package with CI workflows and release jobs.         |           |      |
| TASK-SCRIPTS-008 | Add integration tests for release dry-run and publish safety checks. |           |      |
| TASK-SCRIPTS-009 | Validate cross-platform script compatibility.                        |           |      |

### Implementation Phase 4

- GOAL-SCRIPTS-004: Hardening and release gates.

| Task             | Description                                                             | Completed | Date |
| ---------------- | ----------------------------------------------------------------------- | --------- | ---- |
| TASK-SCRIPTS-010 | Add regression/perf checks for script reliability and failure handling. |           |      |
| TASK-SCRIPTS-011 | Update docs for contributor and release-operator workflows.             |           |      |
| TASK-SCRIPTS-012 | Pass monorepo release gates with scripts package checks green.          |           |      |

## 3. Acceptance Criteria

- **ACC-SCRIPTS-001**: Script workflows are deterministic and CI-safe.
- **ACC-SCRIPTS-002**: Release automation safety checks are validated.
- **ACC-SCRIPTS-003**: Docs and release gates are complete.

## 4. Sources Synthesized

- `plan/MASTER-IMPLEMENTATION-PLAN.md`
- `plan/IMPLEMENTATION-PRIORITY.md`
- `docs/packages/scripts.md`
- `packages/scripts/README.md`
- `packages/scripts/IMPLEMENTATION-PLAN.md`

## 5. Existing Package Deep-Dive (Preserved)

---

## @agentsy/scripts — Implementation Plan

## Role in Framework Ecosystem

`@agentsy/scripts` is the **maintenance crew** of the monorepo. It provides the automation for building, testing, and releasing all other packages. It ensures that the framework remains stable, versioned correctly, and easy to contribute to.

It is used exclusively during development and by CI/CD pipelines (GitHub Actions). It is never imported by runtime code.

### Ecosystem Sketch

```text
[ GitHub Actions ]
       |
       v
[ @agentsy/scripts ] <--- Monorepo Management
       |
       +-----------------------+-----------------------+
       |                       |                       |
       v                       v                       v
 [ Build Orchestration ] [ Release Automation ] [ Quality Gates ]
 (Turbo / tsup)          (Changesets / gh)      (Lints / Tests)
```

## Fulfillment of Role

The package fulfills its role by providing:

1. **CI/CD Helpers**: Scripts for aggregating test results, managing coverage, and verifying type safety.
2. **Release Automation**: Tooling for version bumping, changelog generation, and npm publishing.
3. **Monorepo Health**: Maintenance scripts for dependency auditing and license header management.

## Detailed Functionality

### 1. Build & Test (`src/ci/`)

- **Responsibility**: Gatekeeping.
- **Functionality**: Wrappers for `turbo` tasks that handle environment-specific configuration and error reporting.

### 2. Versioning & Publishing (`src/release/`)

- **Mechanism**: Integration with `pnpm` workspaces and `gh` CLI.
- **Key Logic**: Coordinated version bumps across the DAG, ensuring that dependent packages are updated when a core dependency changes.

### 3. Repository Maintenance (`src/maintenance/`)

- **Responsibility**: Cleanliness.
- **Functionality**: Scripts to find and fix common issues, like missing test files in new packages or stale `pnpm-lock.yaml` entries.

## Logic & Data Flow

### 1. The Release Flow

1. Developer runs `pnpm run release`.
2. Script triggers `Changesets` to determine version bumps.
3. Script generates a consolidated changelog from conventional commits.
4. Script uses `gh release create` to tag the repository and upload artifacts.
5. Script publishes updated packages to the `@agentsy` npm organization.

## Key Tooling

- **Turborepo**: For high-performance task orchestration.
- **tsup**: For dual ESM/CJS bundling.
- **Vitest**: For fast, concurrent testing.
- **oxlint / oxfmt**: For extremely fast linting and formatting.

## Implementation Details

### Determinism

All scripts must be idempotent and deterministic. Running a maintenance script twice should have no side effects if the repository is already in a healthy state.

### Isolation

Scripts should remain strictly isolated from production runtime paths. They must not include dependencies that could accidentally be pulled into other packages.

---

## Phase C Migration Handoff (migrated from `plan/handoff-phase-c-scripts-migration.md`)

### Completed work snapshot

- Legacy root `scripts/` logic migrated into `packages/scripts/src/`.
- Tests converted from `node:test` to Vitest under `packages/scripts`.
- Added/updated key modules: `validate-workspace.ts`, `release-state.ts`, `trusted-publish-readiness.ts`, `bootstrap-release.ts`.
- Package-local test verification recorded as green in handoff snapshot.

### Operational follow-ups

- Continue repo-wide typecheck cleanup in small batches.
- Keep script-specific typings explicit (avoid implicit `any`).
- Add lightweight ambient declarations only when needed for script-only imports.
- Re-run `packages/scripts` tests and root typecheck after each batch.

### Migration constraints preserved

- Keep changes surgical: avoid broad refactors while stabilizing scripts package.
- Maintain Vitest parity with the rest of monorepo testing strategy.
- Keep script runtime behavior source/dist compatible where both are used.

## Sources Synthesized

`handoff-phase-c-scripts-migration.md`, `implementation-plan.md`, `research/INFRASTRUCTURE-ANALYSIS.md`, `packages/scripts/IMPLEMENTATION-PLAN.md`.
