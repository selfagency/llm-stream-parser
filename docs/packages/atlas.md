# @agentsy/atlas

AI Interaction Atlas integration — typed taxonomy, manifest validation, and drift detection.

## Overview

Build-time-only integration with [`@quietloudlab/ai-interaction-atlas`](https://github.com/quietloudlab/ai-interaction-atlas) (Apache 2.0). The Atlas is a taxonomy of **193 AI interaction patterns** across 6 dimensions and 4 layers.

**The Atlas is the vocabulary. `GuardrailsConfig` is the enforcement. `EthicsRegistry` is the provenance. Three layers, one source of truth.**

## Six dimensions

| Dimension | Count | Description |
|---|---|---|
| AI Tasks | 25 | What capabilities AI provides (detect, extract, generate, verify) |
| Human Tasks | 24 | What people do in the loop (review, approve, edit, compare) |
| System Tasks | 22 | What infrastructure handles (routing, logging, state management) |
| Data Artifacts | 47 | What information flows between tasks |
| Constraints | 37 | What boundaries shape the design (privacy, latency, accuracy) |
| Touchpoints | 38 | Where interactions happen (UI, API, notifications) |

## Four layers

| Layer | ID | Role |
|---|---|---|
| Inbound | `layer_inbound` | Sensing & structuring inputs |
| Internal | `layer_internal` | Reasoning & decision-making |
| Outbound | `layer_outbound` | Output generation |
| Interactive | `layer_interactive` | Behavior & learning over time |

## Adding Atlas to an agent

```yaml
name: "coder"
role: "code generation and refactoring"
description: "Multi-role agent"
atlas:
  aiTasks: [task_generate, task_verify]
  humanTasks: [human_review]
  systemTasks: [system_log_event]
  constraints: [const_privacy, const_human_loop]
  touchpoints: [tp_cli]
  layer: layer_internal
constraints:  # free-text retained for project-specific clauses
  - "Always write tests before implementation"
```

The `atlas:` block is optional. Existing agents without it continue to work.

## Constraint → GuardrailsConfig mapping

Every Atlas constraint maps to a `GuardrailsConfig` field or `null` (known gap). See `packages/guardrails/src/atlas-mapping.ts` — the single file to edit when adding mappings.

| Atlas Constraint | GuardrailsConfig Field |
|---|---|
| `const_privacy` | `piiRedaction` |
| `const_human_loop` | `approvalRequiredFor` |
| `const_data_residency` | `localOnly` |
| `const_data_retention` | `memoryPolicy` |
| `const_content_safety` | `blockedTopics` |
| `const_rate_limit` | `tokenQuota` |
| `const_cost_budget` | `tokenQuota` |
| ... | `null` (gap to close) |

## Drift policy

CI runs `pnpm --filter @agentsy/atlas drift` which compares the snapshot's npm version to the latest published version. On mismatch, CI fails. No silent upgrades — humans review every upstream pattern change.

## Build

```bash
pnpm --filter @agentsy/atlas build    # codegen + tsup
pnpm --filter @agentsy/atlas drift    # CI drift check
pnpm --filter @agentsy/atlas test     # vitest
```
