
## 34. Appendix C — Package Consolidation Map (Before/After)

### Before (27 packages — pre-Phase 2)

```text
agents/          (39)   ← Keep
cli/             (71)   ← Keep (becomes thin daemon client)
connectors/      (13)   ← Merge into daemon
core/            (95)   ← Keep
ecc-integration  (0)    ← Doesn't exist
gateway/         (68)   ← Keep (becomes thin daemon client)
guardrails/      (49)   ← Keep
mcp/             (11)   ← Merge into daemon
memory/          (260)  ← Keep
models/          (25)   ← Keep
observability/   (29)   ← Keep
plugins/         (43)   ← Keep
prompts/         (16)   ← Keep (small but distinct concern)
providers/       (68)   ← Keep
ui/              (15)   ← Keep (absorbs renderers)
retrieval/       (25)   ← Keep (Phase 7 moves logic into daemon, types stay)
runtime/         (89)   ← Keep
scripts/         (20)   ← Move to root tooling
secrets/         (58)   ← Keep
session/         (34)   ← Keep
types/           (27)   ← Merge into shared
testing/         (36)   ← Keep
tokenomics/      (84)   ← Keep
tools/           (22)   ← Keep
shared/          (10)   ← Keep (absorbs types)
renderers/       (120)  ← Merge into ui (renamed in codebase)
vscode/          (75)   ← Keep (published Copilot Chat integration library)
workflows/       (1)    ← Merge into orchestrator
```

### After (25 packages + root scripts — post-Phase 2)

```text
agents/          ← Keep
cli/             ← Keep (thin daemon client)
core/            ← Keep
daemon/          ← NEW (Phase 1, absorbs mcp, connectors, acp, processes)
gateway/         ← Keep (thin daemon client — Phase 5)
guardrails/      ← Keep (expanded in Phases 4, 9, 10, 11, 12, 13, 16)
memory/          ← Keep
models/          ← Keep
observability/   ← Keep
plugins/         ← Keep
prompts/         ← Keep
providers/       ← Keep
ui/              ← Keep (absorbs renderers)
retrieval/       ← Keep (Phase 7 moves logic into daemon, types stay)
runtime/         ← Keep (Phase 3 redesigns hooks)
secrets/         ← Keep
session/         ← Keep
testing/         ← Keep
tokenomics/      ← Keep
tools/           ← Keep (Phase 14 enriches tool type)
shared/          ← Keep (absorbs types)
orchestrator/    ← Keep (absorbs workflows)
vscode/          ← Keep (published Copilot Chat integration library)
scripts/         ← Root-level tooling (not a package)
```

### Future (Phase 15 adds bootstrap)

```text
bootstrap/       ← NEW (Phase 15) — project scanner, registry adapters, install flow, AGENTS.md / AFT generators
```

**Final package count after Phase 15**: 26 packages + root scripts.

**Note on `@agentsy/vscode` preservation**: The `@agentsy/vscode` package is preserved throughout. It is a published npm library (`@agentsy/vscode` on npm) consumed by third-party VS Code extensions that integrate language model providers with GitHub Copilot Chat. ACP (agent–editor communication) and `@agentsy/vscode` (provider↔Copilot Chat integration) are complementary, not overlapping.

---
