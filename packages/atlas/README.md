# @agentsy/atlas

AI Interaction Atlas integration for Agentsy — typed taxonomy, manifest validation, and drift detection.

## What this is

Build-time-only integration with [`@quietloudlab/ai-interaction-atlas`](https://github.com/quietloudlab/ai-interaction-atlas) (Apache 2.0). The Atlas is a taxonomy of 193 AI interaction patterns across 6 dimensions (AI Tasks, Human Tasks, System Tasks, Data Artifacts, Constraints, Touchpoints) and 4 layers (Inbound, Internal, Outbound, Interactive).

The Atlas is the vocabulary. `GuardrailsConfig` is the enforcement. `EthicsRegistry` is the provenance. Three layers, one source of truth.

## Architecture

- `src/snapshot/atlas-1.0.json` — frozen Atlas data, committed, reproducible
- `src/snapshot/ATLAS_NPM_VERSION` — the npm package version the snapshot was generated from
- `src/codegen.ts` — reads the snapshot, emits `src/generated/*.ts` (types, IDs, categories, patterns)
- `src/generated/` — produced by codegen, committed, zero runtime deps
- `src/bridge.ts` — Agentsy-facing API, re-implemented helpers, no Atlas runtime dep
- `src/manifest.ts` — `AtlasManifestSchema` (Zod) for the `atlas:` block in agent YAML
- `src/validate.ts` — `validateAgentManifest()` fail-fast validation
- `src/drift.ts` — CI drift detector, fails on upstream version change

## Usage

### Add Atlas to an agent YAML

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

### Validate a manifest

```ts
import { AtlasManifestSchema, validateAgentManifest } from '@agentsy/atlas';

const manifest = AtlasManifestSchema.parse({
  aiTasks: ['task_generate'],
  constraints: ['const_privacy']
});

const result = validateAgentManifest(manifest);
if (!result.valid) {
  throw new Error(`Invalid Atlas IDs: ${result.invalidIds.join(', ')}`);
}
```

### Query Atlas patterns

```ts
import { getPattern, filterConstraintsByCategory, getAtlasStats } from '@agentsy/atlas';

const privacy = getPattern('const_privacy');
const qualitySafety = filterConstraintsByCategory('quality_safety');
const stats = getAtlasStats(); // { ai: 25, human: 24, system: 22, ... }
```

### Guardrails mapping

See `packages/guardrails/src/atlas-mapping.ts` — the single file mapping Atlas constraints to `GuardrailsConfig` fields. `null` means known enforcement gap.

## Build

```bash
pnpm --filter @agentsy/atlas build    # codegen + tsup
pnpm --filter @agentsy/atlas drift    # CI drift check
pnpm --filter @agentsy/atlas test     # vitest
```

## License

GPL-3.0-or-later
