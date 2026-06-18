

## 42. Phase 27 — Self-Improvement & Skill Curation (DEFERRED — Post-v1)

**Priority**: P4 — Deferred. Ships after Phase 15 (Bootstrap — owns skill installation) and Phase 23 (task board — curator uses the task board).
**Story points**: ~12 (preliminary)
**Branch**: `feat/self-improvement` (not yet created)
**Depends on**: Phase 15 (skills system), Phase 23 (task board, forkWithCacheSharing), Phase 8 (learning loop — curator extends the background job infrastructure)
**Unblocks**: self-curating skill library, post-turn self-review, automated skill quality maintenance
**Status**: DEFERRED — design complete, implementation not started
**Source**: hermes-agent (§A.14) — background skill curator, post-turn background review, skill AST audit

### 42.1 Goal

Implement three self-improvement mechanisms from hermes-agent:

1. **Background skill curator** — when the daemon is idle (>2h) and the curator hasn't run in >7d, fork an agent to review installed skills. Auto-transition skill lifecycle: `stale_after_days=30` → mark stale, `archive_after_days=90` → archive. Never auto-delete (only archive).
2. **Post-turn background review** — after every agent turn, fork a background agent (with inherited prefix cache) to review the turn. The reviewer has a tool whitelist (memory + skill management only) and a "do NOT capture" list that prevents hardening transient errors into persistent skills.
3. **Skill AST audit** — replace regex-only skill validation with AST-based auditing that parses skill scripts to detect malicious patterns (file system access, network calls, eval/exec, etc.).

### 42.2 Design

#### 42.2.1 Background skill curator

```typescript
// packages/daemon/src/services/skill-curator.ts (NEW)

export class SkillCurator implements Service {
  readonly name = 'skill-curator';
  private idleThresholdMs = 2 * 60 * 60 * 1000;  // 2 hours
  private minIntervalMs = 7 * 24 * 60 * 60 * 1000;  // 7 days
  private staleAfterDays = 30;
  private archiveAfterDays = 90;

  async start(): Promise<void> {
    // Schedule via Bree (Phase 8's job scheduler)
    this.scheduler.schedule('skill-curator', {
      cron: '0 */4 * * *',  // Check every 4 hours
      handler: () => this.maybeRunCurator(),
    });
  }

  private async maybeRunCurator(): Promise<void> {
    // Only run if daemon has been idle and curator hasn't run recently
    const lastActivity = this.serviceHost.lastActivityTime();
    const lastRun = await this.db.querySingle('SELECT MAX(run_at) FROM curator_runs');

    if (Date.now() - lastActivity < this.idleThresholdMs) return;  // Not idle enough
    if (lastRun && Date.now() - lastRun.getTime() < this.minIntervalMs) return;  // Too soon

    // Fork an agent to review skills (uses forkWithCacheSharing from Phase 23)
    const reviewerAgent = await this.agentHost.forkWithCacheSharing('curator-parent');
    await reviewerAgent.execute(CURATOR_PROMPT, {
      tools: ['skill_list', 'skill_archive', 'skill_mark_stale', 'memory_read'],
      doNotCapturePatterns: [
        'rate_limit', 'timeout', 'network_error', 'transient',
      ],
    });

    await this.db.execute('INSERT INTO curator_runs (run_at) VALUES (?)', [new Date().toISOString()]);
  }
}
```

#### 42.2.2 Post-turn background review

```typescript
// packages/daemon/src/services/post-turn-review.ts (NEW)

export class PostTurnReviewService implements Service {
  readonly name = 'post-turn-review';

  // Hooks into the runtime's PostResponse event (Phase 3 hook system)
  async onTurnComplete(agentId: string, turnResult: TurnResult): Promise<void> {
    // Fork a background agent with inherited prefix cache (Phase 23)
    const reviewer = await this.agentHost.forkWithCacheSharing(agentId);

    // Tool whitelist — only memory + skill management
    await reviewer.execute(POST_TURN_REVIEW_PROMPT, {
      tools: ['memory_append', 'memory_search', 'skill_update', 'skill_create'],
      doNotCaptureList: [
        // Prevent hardening transient errors into persistent skills
        'rate_limit', 'timeout', 'network_error', 'temporary', 'transient',
        'flaky', 'intermittent', 'one-off',
      ],
      input: {
        turnSummary: turnResult.summary,
        toolsUsed: turnResult.toolCalls.map(tc => tc.name),
        outcome: turnResult.outcome,
      },
    });

    // The reviewer runs in the background; its output is logged but not
    // surfaced to the user unless it creates/updates a skill or memory.
  }
}
```

#### 42.2.3 Skill AST audit

```typescript
// packages/guardrails/src/scanners/skill-ast-audit.ts (NEW)

export class SkillASTAuditScanner implements GuardrailScanner {
  readonly id = 'skill-ast-audit';
  readonly phase: GuardrailPhase = 'memory';  // Runs on skill install (memory surface)

  evaluate(skillContent: string, context: GuardrailContext): GuardrailResult {
    // Parse the skill script as an AST (language-dependent)
    // For TypeScript/JavaScript skills: use @babel/parser or acorn
    // For Python skills: use @pyodide or a Python subprocess
    const ast = this.parse(skillContent);

    const findings: Finding[] = [];

    // Detect: file system access outside sandbox
    this.detectFilesystemAccess(ast, findings);
    // Detect: network calls (fetch, http, https, net)
    this.detectNetworkAccess(ast, findings);
    // Detect: eval / exec / Function constructor
    this.detectDynamicExecution(ast, findings);
    // Detect: process.env access (secret leakage)
    this.detectEnvAccess(ast, findings);
    // Detect: child_process spawn
    this.detectSubprocessSpawn(ast, findings);

    if (findings.some(f => f.severity === 'critical')) {
      return { status: 'block', phase: 'memory', reason: 'Skill AST audit failed: critical findings', detections: findings };
    }
    if (findings.length > 0) {
      return { status: 'escalate', phase: 'memory', reason: `Skill AST audit: ${findings.length} findings require review`, riskScore: 0.6, detections: findings };
    }
    return { status: 'pass', phase: 'memory' };
  }
}
```

### 42.3 Verification (when activated)

- [ ] Skill curator runs when daemon idle >2h and last run >7d
- [ ] Curator marks skills stale after 30 days, archives after 90 days, never deletes
- [ ] Post-turn review fires after every turn with inherited prefix cache
- [ ] Post-turn review respects tool whitelist (memory + skill management only)
- [ ] "Do NOT capture" list prevents transient errors from becoming persistent skills
- [ ] Skill AST audit blocks skills with critical findings (filesystem, network, eval, env, subprocess)
- [ ] Skill AST audit escalates skills with non-critical findings for review
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

---

