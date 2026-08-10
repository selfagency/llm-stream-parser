# ECC Integration Plan

**Phase:** 14 — ECC Patterns Adoption  
**Authority:** `plan/17-GOVERNANCE-QUALITY-GATES.md`  
**Created:** 2026-05-28  
**Status:** Planned

---

## Goal

Adopt proven patterns from [ECC](https://github.com/affaan-m/ECC) (197k stars) as an **optional** integration layer. ECC provides agent definitions, skills, hooks, rules, and cross-harness configs — all of which complement our runtime but should never be required.

**Key principle:** ECC integration is opt-in. The core system works without it.

---

## What ECC Provides

| Component | Count | Our Package | Integration Type |
|-----------|-------|-------------|-----------------|
| Agent definitions | 63 | `@agentsy/plugins` | Optional catalog |
| Skills | 249 | `@agentsy/prompts` | Optional library |
| Commands | 79 | `@agentsy/cli` | Optional shims |
| Hooks | 20+ event types | `@agentsy/runtime` | Optional profiles |
| Rules | 12 languages | `@agentsy/prompts` | Optional packs |
| MCP configs | Multi-harness | `@agentsy/mcp` | Optional configs |

---

## Implementation Tasks

### TASK-ECC-001: Optional ECC package

**Effort:** 2h  
**Location:** `packages/ecc-integration/`

Create an optional integration package that:

- Exports ECC agent definitions as `AgentDefinition[]`
- Exports ECC skills as `SkillDefinition[]`
- Exports ECC rules as `RulePack[]`
- Exports ECC hooks as `HookDefinition[]`

```typescript
// packages/ecc-integration/src/index.ts
export { agents } from './agents/index.js';
export { skills } from './skills/index.js';
export { rules } from './rules/index.js';
export { hooks } from './hooks/index.js';
export { commands } from './commands/index.js';
```

**Installation:**

```bash
pnpm add @agentsy/ecc-integration  # Optional
```

### TASK-ECC-002: Agent catalog expansion

**Effort:** 3h  
**Location:** `packages/ecc-integration/src/agents/`

Adopt the best ECC agents into our catalog:

| ECC Agent | Our Equivalent | Priority |
|-----------|---------------|----------|
| `planner.md` | `plan` agent | High |
| `architect.md` | New | High |
| `tdd-guide.md` | `code` agent | Medium |
| `code-reviewer.md` | New | High |
| `security-reviewer.md` | New | High |
| `e2e-runner.md` | New | Medium |
| `refactor-cleaner.md` | New | Medium |
| `doc-updater.md` | New | Low |
| `loop-operator.md` | New | High |
| `harness-optimizer.md` | New | Low |

### TASK-ECC-003: Skills library

**Effort:** 3h  
**Location:** `packages/ecc-integration/src/skills/`

Adopt proven ECC skills:

| Skill Category | Count | Priority |
|---------------|-------|----------|
| Token optimization | 5 | High |
| Memory persistence | 3 | High |
| Continuous learning | 4 | High |
| Verification loops | 3 | Medium |
| Parallelization | 4 | Medium |
| Subagent orchestration | 3 | High |
| Security scanning | 5 | High |
| Language-specific | 12 | Medium |

### TASK-ECC-004: Hook runtime controls

**Effort:** 2h  
**Location:** `packages/runtime/src/hooks/`

Add ECC-style hook profiles:

```typescript
export type HookProfile = 'minimal' | 'standard' | 'strict';

export interface HookRuntimeConfig {
  profile: HookProfile;
  disabledHooks: string[];  // e.g., ['pre:bash:tmux-reminder', 'post:edit:typecheck']
  sessionStartMaxChars: number;  // default: 8000
  sessionStartContext: 'on' | 'off';
  contextMonitorCostWarnings: boolean;
}

// Environment variables
// ECC_HOOK_PROFILE=minimal|standard|strict
// ECC_DISABLED_HOOKS=pre:bash:tmux-reminder,post:edit:typecheck
// ECC_SESSION_START_MAX_CHARS=4000
// ECC_SESSION_START_CONTEXT=off
// ECC_CONTEXT_MONITOR_COST_WARNINGS=off
```

### TASK-ECC-005: Multi-language rules

**Effort:** 2h  
**Location:** `packages/ecc-integration/src/rules/`

Adopt ECC's language-specific rule structure:

```text
rules/
├── common/          # Universal rules
├── typescript/      # TS/JS rules
├── python/          # Python rules
├── golang/          # Go rules
├── java/            # Java rules
├── rust/            # Rust rules
├── cpp/             # C++ rules
├── kotlin/          # Kotlin rules
├── php/             # PHP rules
└── perl/            # Perl rules
```

### TASK-ECC-006: Selective install advisor

**Effort:** 2h  
**Location:** `packages/cli/src/commands/ecc-consult.ts`

Implement ECC's advisor pattern:

```bash
agentsy ecc consult "security reviews" --target claude
# Returns: matching components, related profiles, preview/install commands

agentsy ecc install --profile minimal --target claude --with capability:security
# Installs only security-related components
```

### TASK-ECC-007: Continuous learning

**Effort:** 3h  
**Location:** `packages/memory/src/learning/`

Implement auto-extract patterns from sessions:

```typescript
export interface LearningConfig {
  enabled: boolean;
  extractInterval: number;  // Extract patterns every N sessions
  confidenceThreshold: number;  // Minimum confidence to create skill
  maxSkillsPerSession: number;  // Cap on new skills per session
}

export class ContinuousLearner {
  async extractPatterns(session: Session): Promise<Pattern[]>;
  async createSkill(pattern: Pattern): Promise<SkillDefinition>;
  async evolveSkill(skill: SkillDefinition, feedback: Feedback): Promise<SkillDefinition>;
}
```

### TASK-ECC-008: Observer loop prevention

**Effort:** 1.5h  
**Location:** `packages/orchestrator/src/scheduler.ts`

Implement 5-layer guard against infinite agent loops:

```typescript
export class LoopGuard {
  private maxDepth: number;
  private maxIterations: number;
  private seenStates: Set<string>;

  check(state: AgentState): LoopGuardResult {
    // Layer 1: Depth limit
    // Layer 2: Iteration limit
    // Layer 3: State deduplication
    // Layer 4: Token budget check
    // Layer 5: Time limit
  }
}
```

### TASK-ECC-009: Quality gate command

**Effort:** 1h  
**Location:** `packages/cli/src/commands/quality-gate.ts`

Implement `/quality-gate` slash command:

```bash
/quality-gate                    # Run all quality checks
/quality-gate --category security  # Run security checks only
/quality-gate --format json        # Output as JSON
```

### TASK-ECC-010: Operator status snapshots

**Effort:** 1.5h  
**Location:** `packages/cli/src/commands/status.ts`

Implement `agentsy status` command:

```bash
agentsy status --markdown --write status.md
# Outputs: readiness, active sessions, skill-run health, install health,
# pending governance events, linked work items

agentsy status --exit-code
# Returns non-zero if readiness needs attention
```

### TASK-ECC-011: Cost audit skill

**Effort:** 1h  
**Location:** `packages/ecc-integration/src/skills/cost-audit.ts`

Implement ECC's cost audit skill:

```typescript
export interface CostAuditReport {
  totalCost: number;
  byProvider: Record<string, number>;
  byModel: Record<string, number>;
  bySession: Record<string, number>;
  recommendations: CostOptimization[];
}
```

### TASK-ECC-012: Installation wizard

**Effort:** 2h  
**Location:** `packages/cli/src/commands/ecc-install.ts`

Implement guided setup with merge/overwrite detection:

```bash
agentsy ecc install --profile minimal    # Minimal install
agentsy ecc install --profile core       # Core install
agentsy ecc install --profile full       # Full install (not recommended)
agentsy ecc install --profile custom --with security,typescript  # Custom install
```

### TASK-ECC-013: Documentation

**Effort:** 1h  
**Location:** `packages/ecc-integration/README.md`

Document:

- What ECC integration provides
- How to install (optional)
- How to configure
- How to uninstall
- Migration guide from standalone ECC

---

## Configuration Schema

```typescript
export interface EccIntegrationConfig {
  enabled: boolean;  // Default: false (opt-in)

  agents: {
    catalog: string[];  // Which agents to load
    defaults: string[];  // Default agents for delegation
  };

  skills: {
    library: string[];  // Which skills to load
    hotLoad: boolean;  // Enable skill hot-loading
  };

  hooks: {
    profile: 'minimal' | 'standard' | 'strict';
    disabled: string[];
    sessionStartMaxChars: number;
    sessionStartContext: 'on' | 'off';
    contextMonitorCostWarnings: boolean;
  };

  rules: {
    languages: string[];  // Which language rules to load
    common: boolean;  // Load common rules
  };

  learning: {
    enabled: boolean;
    extractInterval: number;
    confidenceThreshold: number;
    maxSkillsPerSession: number;
  };

  loopGuard: {
    maxDepth: number;
    maxIterations: number;
    stateDeduplication: boolean;
    tokenBudgetCheck: boolean;
    timeLimit: number;
  };
}
```

---

## Integration Points

| Component | Integration | Required |
|-----------|-------------|----------|
| `@agentsy/plugins` | Agent catalog expansion | No |
| `@agentsy/prompts` | Skills library + rules | No |
| `@agentsy/runtime` | Hook profiles + loop guard | No |
| `@agentsy/cli` | Install advisor + status command | No |
| `@agentsy/memory` | Continuous learning | No |
| `@agentsy/context` | Cost audit skill | No |
| `@agentsy/orchestrator` | Loop prevention | No |

---

## Timeline

| Task | Effort | Dependencies |
|------|--------|-------------|
| ECC-001: Optional ECC package | 2h | None |
| ECC-002: Agent catalog | 3h | ECC-001 |
| ECC-003: Skills library | 3h | ECC-001 |
| ECC-004: Hook controls | 2h | None |
| ECC-005: Multi-language rules | 2h | ECC-001 |
| ECC-006: Install advisor | 2h | None |
| ECC-007: Continuous learning | 3h | None |
| ECC-008: Loop prevention | 1.5h | None |
| ECC-009: Quality gate | 1h | None |
| ECC-010: Status snapshots | 1.5h | None |
| ECC-011: Cost audit | 1h | None |
| ECC-012: Install wizard | 2h | None |
| ECC-013: Documentation | 1h | All |
| **Total** | **~25 hours** | |

---

## Success Criteria

- [ ] `@agentsy/ecc-integration` package installable as optional dependency
- [ ] Core system works without ECC integration
- [ ] Agent catalog expands with ECC definitions when installed
- [ ] Skills library available when installed
- [ ] Hook profiles configurable via environment variables
- [ ] Multi-language rules loadable per-language
- [ ] Install advisor guides component selection
- [ ] Continuous learning extracts patterns from sessions
- [ ] Loop guard prevents infinite agent loops
- [ ] Quality gate command runs checks
- [ ] Status snapshots show system health
- [ ] Cost audit skill tracks spending
- [ ] Installation wizard guides setup
- [ ] Documentation complete

---

**Next:** Begin TASK-ECC-001 (optional ECC package).
