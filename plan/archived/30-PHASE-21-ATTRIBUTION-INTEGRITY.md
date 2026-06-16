---
goal: "@agentsy attribution, session integrity, and ethical transparency"
version: 1.0
date_created: 2026-06-12
last_updated: 2026-06-12
owner: tokenomics-maintainers + session-maintainers
status: Planned
tags: [feature, architecture, attribution, integrity, transparency, git-ai, entireio, sessions]
---

# Phase 21 — Attribution, Session Integrity & Ethical Transparency

**Effort:** ~24h total (5 implementation sub-phases)  
**Milestone:** Every AI commit is attributable to its session, model, cost, quality, and frustration. Session transcripts are searchable, restorable, and redacted. Ethical transparency dashboard surfaces AI-code ratio, spend efficiency, frustration waste, and survival rate.  
**Packages:** `@agentsy/tokenomics`, `@agentsy/session`, `@agentsy/secrets`, `@agentsy/memory`, `@agentsy/plugins`, `@agentsy/cli`  
**Gate:** `git ai blame`-compatible stats emitted; session ↔ commit linking operational; transcript search works; redaction applied to session persistence; transparency dashboard renders  
**Depends on:** Phase 20 tokenomics (ledger, tokenizer), `@agentsy/session` (checkpoint, pause), `@agentsy/secrets` (detection), `@agentsy/memory` (event log)  
**Next:** Phase 22 (post-GA iteration)

---

## Overview

git-ai and entireio have established the open-standard patterns for AI attribution in git. This phase integrates agentsy into that ecosystem — **not by reimplementing** what they already do, but by:

1. **Consuming** git-ai's open standard (git notes for line-level attribution stats) in our ROI calculator
2. **Extending** `@agentsy/session` checkpoints with git commit SHAs and file snapshots
3. **Wiring** `@agentsy/secrets` redaction into session persistence
4. **Indexing** session transcripts for search via `@agentsy/memory`
5. **Exposing** all of the above in a unified **ethical transparency dashboard**

### Architecture Philosophy

```text
git-ai / entireio (external)        agentsy (internal)
┌──────────────────────┐           ┌─────────────────────────┐
│ Line-level blame     │           │ Cost+quality attribution│
│ % AI stats           │◄────read──┤ Frustration score       │
│ Git notes format      │           │ Survival rate           │
│                      │           │ Token+cache efficiency   │
└──────────────────────┘           └──────────┬──────────────┘
                                              │
                     ┌────────────────────────┼────────────────────┐
                     │                        │                    │
                     ▼                        ▼                    ▼
              ┌──────────────┐       ┌──────────────┐    ┌──────────────┐
              │ @session     │       │ @secrets     │    │ @memory      │
              │ commit SHAs  │       │ redaction on │    │ transcript   │
              │ file restore │       │ persist()    │    │ search index │
              └──────────────┘       └──────────────┘    └──────────────┘
```

### What We Do Not Build

- **Line-level attribution daemon** — git-ai owns this (4,400 commits, Rust, handles rebase/merge/cherry-pick). We read their git notes instead.
- **Full session checkpoint/rewind across git operations** — entireio owns this (Go, 5,122 commits). We extend our existing `@agentsy/session` checkpoints to work locally.
- **Checkpoint push/fetch across remotes** — entireio owns this with `entire/checkpoints/v1` branch.

---

## 1. Requirements & Constraints

### Functional Requirements

- **REQ-ATT-001**: Every `SessionLedgerEntry` references commit SHAs produced during the session, via the session's own checkpoint list.
- **REQ-ATT-002**: ROI calculator reads git-ai git notes (if present) to break down `% AI` vs `% human` lines per session.
- **REQ-ATT-003**: Session transcripts are stored with auto-redaction via `@agentsy/secrets` redactSecrets().
- **REQ-ATT-004**: Session transcripts are indexed in `@agentsy/memory` event log for search.
- **REQ-ATT-005**: CLI command `agentsy session show <id>` renders session summary with cost, frustration, secrets redacted, and linked commits.
- **REQ-ATT-006**: CLI command `agentsy session search <query>` searches indexed transcripts.
- **REQ-ATT-007**: CLI command `agentsy session restore <id>` restores file state at checkpoint.
- **REQ-ATT-008**: `agentsy tokenomics report --ethical` renders a transparency dashboard.
- **REQ-ATT-009**: `agentsy tokenomics report --attribution` renders % AI vs human breakdown per period (reads git-ai notes).
- **REQ-ATT-010**: Session persistence hook at `SessionManager.persist()` redacts secrets before writing.
- **REQ-ATT-011**: Plugin system emits standard agent lifecycle hooks (session-begin, session-end, checkpoint, tool-call) consumable by entireio and agentsy itself.
- **REQ-ATT-012**: Checkpoint schema includes optional commit SHA and linked commit array.

### Security & Privacy

- **SEC-ATT-001**: All transcript persistence runs through `redactSecrets()` before storage. No unredacted API keys, tokens, or credentials in any durable store.
- **SEC-ATT-002**: Redaction is applied at write time, not query time. Stored transcripts are always safe to push.
- **SEC-ATT-003**: `git blame` data consumption is opt-in via `agentsy.git.readGitAiNotes = true` config.
- **SEC-ATT-004**: Session transcripts are never included in git commits themselves — stored in SQLite ledger or `@agentsy/memory` event log, never in `.git/`.

### Constraints

- **CON-ATT-001**: `@agentsy/session` Checkpoint schema must remain backward-compatible (additive fields only).
- **CON-ATT-002**: git-ai git notes are read-only — we never write them. Attribution writes use our own git trailers (TASK-TKNM-011).
- **CON-ATT-003**: File-level checkpoint restore works only for the working tree — it does not create commits. Users commit to persist the restored state.
- **CON-ATT-004**: All new CLI commands are under existing command trees (`agentsy session`, `agentsy tokenomics report`).

---

## 2. Implementation Sub-Phases

| Sub-phase | Module | Packages Touched | Effort | Unblocks |
|---|---|---|---|---|
| 21.1 | Session ↔ Commit Linking | `@agentsy/session`, `@agentsy/tokenomics` | 5h | attribution tracking |
| 21.2 | Secret-Redacted Persistence | `@agentsy/secrets`, `@agentsy/session` | 3h | safe transcript storage |
| 21.3 | Transcript Indexing & Search | `@agentsy/memory`, `@agentsy/cli` | 5h | session browser |
| 21.4 | git-ai Attribution Reader | `@agentsy/tokenomics` | 4h | % AI stats |
| 21.5 | Ethical Transparency Dashboard | `@agentsy/tokenomics`, `@agentsy/cli`, `@agentsy/renderers` | 7h | report --ethical |

---

## 3. Detailed Tasks

---

### Sub-phase 21.1 — Session ↔ Commit Linking

**Effort:** 5h  
**Gate:** Session checkpoints carry commit SHAs; `SessionLedgerEntry.commitShas` populated; `agentsy session show` renders linked commits  
**Depends on:** Phase 20 ledger (TASK-TKNM-001..004), existing `@agentsy/session` checkpoints

#### TASK-ATT-001: Extend Checkpoint schema with commit SHA

**Location:** `packages/session/src/state/schema.ts`  
**Effort:** 0.5h

Add optional commit tracking fields to the existing `CheckpointSchema`:

```typescript
// packages/session/src/state/schema.ts — additive-only change
export const CheckpointSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  createdAt: z.number(),
  messageCount: z.number(),
  toolCallCount: z.number(),
  threadId: z.string(),
  // ── NEW fields ──────────────────────────────────────────────
  /** Git commit SHA produced at this checkpoint, if a commit was made. */
  commitSha: z.string().optional(),
  /** All commits produced by this session (populated post-hoc by ledger writer). */
  linkedCommits: z.array(z.string()).optional(),
  /** Working-tree file snapshot key (if file-level restore is supported). */
  fileSnapshotKey: z.string().optional()
});
```

The `commitSha` is set when the session manager receives a post-commit hook. The `linkedCommits` array is populated later by the ledger writer (TASK-TKNM-003).

#### TASK-ATT-002: Wire git commit hook into SessionManager

**Location:** `packages/session/src/manager.ts`  
**Effort:** 1.5h

Add a `linkCommit()` method to the `SessionManager` interface and wire it to a git post-commit hook or CLI command:

```typescript
// packages/session/src/manager.ts — additions to SessionManager interface
export interface SessionManager {
  // ... existing methods ...

  /** Link the most recent git commit SHA to the latest checkpoint. */
  linkCommit(sha: string): void;

  /** Replace the checkpoint having checkpoints[checkpoints.length-1].commitSha with sha */
  // implemented by applying a SetMetaAction that the reducer handles
}

// ── New reducer action ─────────────────────────────────────────
export interface LinkCommitAction {
  sha: string;
  type: 'linkCommit';
}

// ── Reducer handler ────────────────────────────────────────────
function handleLinkCommit(state: SessionState, action: LinkCommitAction): SessionState {
  const cp = [...state.checkpoints];
  const last = cp[cp.length - 1];
  if (last === undefined) return state; // no checkpoint yet
  cp[cp.length - 1] = { ...last, commitSha: action.sha };
  return { ...state, checkpoints: cp, updatedAt: Date.now() };
}
```

**CLI integration** — agent post-commit hook calls session manager:

```typescript
// Example: called by git post-commit hook or by the agent after git commit
import { createSessionManager } from '@agentsy/session';
import { execSync } from 'node:child_process';

async function onCommit(sessionId: string): Promise<void> {
  const sha = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
  const manager = createSessionManager(/* store */, { sessionId });
  manager.linkCommit(sha);
  manager.persist();
}
```

#### TASK-ATT-003: Populate SessionLedgerEntry.commitShas from session checkpoints

**Location:** `packages/tokenomics/src/ledger/writer.ts`  
**Effort:** 1h

When assembling the `SessionLedgerEntry` in the post-session hook, read the session manager's checkpoints for commit SHAs:

```typescript
// packages/tokenomics/src/ledger/writer.ts — extended assembleLedgerEntry
import type { SessionManager } from '@agentsy/session';

function extractCommitShas(manager: SessionManager): string[] {
  return manager
    .getCheckpoints()
    .filter((cp): cp is CheckpointInfo & { commitSha: string } => 'commitSha' in cp)
    .map(cp => cp.commitSha);
}

export function createLedgerWriterHook(
  store: LedgerStore,
  diffStats: DiffStatsReader,
  sessionManager: SessionManager,
): HookDefinition<'post-session'> {
  return {
    name: 'tokenomics:ledger-writer',
    event: 'post-session',
    priority: 10,
    handler: async (ctx) => {
      const entry = assembleLedgerEntry(ctx, diffStats);
      // Link commits from session checkpoints
      const commitShas = extractCommitShas(sessionManager);
      entry.artifacts.commits = [
        ...entry.artifacts.commits,
        ...commitShas.map(sha => ({ sha, message: '', timestamp: new Date() }))
      ];
      await store.insert(entry);
      return ctx;
    },
  };
}
```

#### TASK-ATT-004: File-level checkpoint snapshot/restore

**Location:** `packages/session/src/recovery/file-snapshot.ts` (NEW)  
**Effort:** 2h

Add file-level working-tree snapshot support to session recovery. Uses `git stash`-style diff storage:

```typescript
// packages/session/src/recovery/file-snapshot.ts — NEW
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface FileSnapshot {
  id: string;
  sessionId: string;
  repoRoot: string;
  files: Array<{ path: string; content: string }>;
  createdAt: number;
}

const SNAPSHOT_DIR = '.agentsy/snapshots';

/**
 * Capture the current working-tree state for tracked files.
 * Only captures files that are modified (unstaged or staged).
 */
export function captureFileSnapshot(
  sessionId: string,
  repoRoot: string,
): FileSnapshot {
  // Get list of modified files using git diff
  const diffOutput = execSync(
    'git diff --name-only && git diff --cached --name-only',
    { cwd: repoRoot, encoding: 'utf-8' }
  );
  const files = [...new Set(
    diffOutput.trim().split('\n').filter(Boolean)
  )];

  const snapshot: FileSnapshot = {
    id: `fs_${Date.now()}`,
    sessionId,
    repoRoot,
    files: files.map(path => ({
      path,
      content: readFileSync(join(repoRoot, path), 'utf-8')
    })),
    createdAt: Date.now(),
  };

  // Persist to .agentsy/snapshots/
  const snapDir = join(repoRoot, SNAPSHOT_DIR);
  if (!existsSync(snapDir)) {
    mkdirSync(snapDir, { recursive: true });
  }
  writeFileSync(
    join(snapDir, `${snapshot.id}.json`),
    JSON.stringify(snapshot, null, 2),
    'utf-8',
  );

  return snapshot;
}

/**
 * Restore files from a file snapshot.
 */
export function restoreFileSnapshot(snapshot: FileSnapshot): void {
  for (const file of snapshot.files) {
    const fullPath = resolve(snapshot.repoRoot, file.path);
    // Ensure parent directory exists
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, file.content, 'utf-8');
  }
}

/**
 * Load a file snapshot from disk.
 */
export function loadFileSnapshot(
  sessionId: string,
  snapshotKey: string,
  repoRoot: string,
): FileSnapshot | null {
  try {
    const raw = readFileSync(
      join(repoRoot, SNAPSHOT_DIR, `${snapshotKey}.json`),
      'utf-8',
    );
    return JSON.parse(raw) as FileSnapshot;
  } catch {
    return null;
  }
}
```

**Integration with SessionManager** — capture snapshot at `saveCheckpoint()`:

```typescript
// packages/session/src/manager.ts — integration
import { captureFileSnapshot, restoreFileSnapshot, loadFileSnapshot } from './recovery/file-snapshot.js';

function enhanceSaveCheckpoint(original: (label?: string) => string, repoRoot?: string): (label?: string) => string {
  return (label?: string) => {
    const cpId = original(label);
    if (repoRoot !== undefined) {
      const fs = captureFileSnapshot(this.sessionId, repoRoot);
      // Link snapshot key to the checkpoint via SetMeta
      this.apply({
        type: 'setMeta',
        key: `checkpoint:${cpId}:fileSnapshot`,
        value: fs.id,
      });
    }
    return cpId;
  };
}
```

---

### Sub-phase 21.2 — Secret-Redacted Session Persistence

**Effort:** 3h  
**Gate:** All session persistence runs through `redactSecrets()`; stored transcripts never contain raw secrets  
**Depends on:** Existing `@agentsy/secrets` detection, `@agentsy/session` SessionManager

#### TASK-ATT-005: Redaction middleware for SessionManager.persist()

**Location:** `packages/session/src/redaction-middleware.ts` (NEW: package @agentsy/session)  
**Effort:** 1.5h

Wrap `SessionManager.persist()` so all message content is redacted before writing:

```typescript
// packages/session/src/redaction-middleware.ts — NEW
import type { SessionManager, SessionStore } from './manager.js';
import { redactSecrets } from '@agentsy/secrets/detection';

export interface RedactionOptions {
  /** Enable redaction. Default: true. */
  enabled?: boolean;
  /** Log redaction events. Default: false. */
  logRedactions?: boolean;
}

/**
 * Wraps a SessionManager so that all message content is redacted
 * before being persisted to the store.
 *
 * Returns an enhanced SessionManager with automatic redaction.
 */
export function withRedaction(
  manager: SessionManager,
  options?: RedactionOptions,
): SessionManager {
  const enabled = options?.enabled ?? true;
  const logRedactions = options?.logRedactions ?? false;

  const originalPersist = manager.persist.bind(manager);

  const enhancedPersist = (): void => {
    if (!enabled) {
      originalPersist();
      return;
    }

    const state = manager.getState();
    let totalRedactions = 0;

    // Redact each message's content
    for (const msg of state.messages) {
      if (typeof msg.content === 'string') {
        const { redacted, matches } = redactSecrets(msg.content);
        if (matches.length > 0) {
          totalRedactions += matches.length;
          // Replace the message content in-place via apply
          manager.apply({
            type: 'updateMessage',
            index: state.messages.indexOf(msg),
            message: { content: redacted },
          });
        }
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === 'text') {
            const { redacted, matches } = redactSecrets(part.text);
            if (matches.length > 0) {
              totalRedactions += matches.length;
              (part as { text: string }).text = redacted;
            }
          }
        }
      }
    }

    if (totalRedactions > 0 && logRedactions) {
      console.warn(`[redaction] Redacted ${totalRedactions} secret(s) in session ${state.sessionId}`);
    }

    originalPersist();
  };

  // Return proxy with overridden persist
  return new Proxy(manager, {
    get(target, prop, receiver) {
      if (prop === 'persist') return enhancedPersist;
      return Reflect.get(target, prop, receiver);
    },
  });
}
```

#### TASK-ATT-006: Redaction hook for runtime

**Location:** `packages/runtime/src/hooks/secret-redaction.ts` (NEW)  
**Effort:** 1.5h

Leverage the existing `createSecretDetectionHook()` from `@agentsy/secrets` (already implemented at `packages/secrets/src/detection/index.ts`) and wire it into the runtime's post-tool-call hook chain:

```typescript
// packages/runtime/src/hooks/secret-redaction.ts — NEW
import { createSecretDetectionHook } from '@agentsy/secrets/detection';
import type { HookRegistry } from '../hook-registry.js';

/**
 * Register the secret detection hook in the runtime's hook chain.
 *
 * The existing `createSecretDetectionHook()` from @agentsy/secrets already
 * handles detection + redaction for tool-call results. This just wires it
 * into the runtime lifecycle.
 */
export function registerSecretRedaction(registry: HookRegistry): void {
  registry.register({
    id: 'security:secret-detection',
    event: 'post-tool-call',
    priority: 100, // runs early in the chain
    handler: createSecretDetectionHook().handler,
  });
}
```

---

### Sub-phase 21.3 — Transcript Indexing & Search

**Effort:** 5h  
**Gate:** `agentsy session show <id>` renders full session; `agentsy session search <query>` returns results  
**Depends on:** @agentsy/memory event log, @agentsy/cli command structure

#### TASK-ATT-007: Index session transcript in @agentsy/memory event log

**Location:** `packages/session/src/transcript-indexer.ts` (NEW)  
**Effort:** 2h

When a session ends, index the full redacted transcript into the memory event log for search:

```typescript
// packages/session/src/transcript-indexer.ts — NEW
import type { SessionState } from './state/schema.js';
import type { EventLog } from '@agentsy/memory';

export interface TranscriptIndexEntry {
  sessionId: string;
  threadId: string;
  messageCount: number;
  modelId?: string;
  truncatedTranscript: string; // concatenated messages, redacted
  intentSummary?: string;
  turnCount: number;
  toolCallCount: number;
  filesTouched: string[];
  startedAt: number;
  endedAt: number;
  linkedCommits: string[];
}

/**
 * Build a searchable transcript entry from session state.
 */
export function buildTranscriptIndexEntry(
  state: SessionState,
  options?: { intentSummary?: string; filesTouched?: string[] },
): TranscriptIndexEntry {
  // Build truncated transcript for search — last 20 messages maximum
  const recentMessages = state.messages.slice(-20);
  const truncatedTranscript = recentMessages
    .map(m => {
      const role = m.role.toUpperCase();
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      return `[${role}] ${content.slice(0, 500)}`;
    })
    .join('\n\n');

  const toolCallCount = state.toolCallQueue.length;

  return {
    sessionId: state.sessionId,
    threadId: state.threadId,
    messageCount: state.messages.length,
    truncatedTranscript,
    turnCount: state.messages.filter(m => m.role === 'assistant').length,
    toolCallCount,
    filesTouched: options?.filesTouched ?? [],
    startedAt: state.createdAt,
    endedAt: state.updatedAt,
    linkedCommits: [],
    intentSummary: options?.intentSummary,
  };
}

/**
 * Write transcript to @agentsy/memory event log.
 */
export async function indexTranscript(
  eventLog: EventLog,
  entry: TranscriptIndexEntry,
): Promise<void> {
  await eventLog.append({
    type: 'session:transcript',
    sessionId: entry.sessionId,
    threadId: entry.threadId,
    timestamp: Date.now(),
    payload: entry,
  });
}
```

**Integration** — called by post-session hook alongside ledger writer:

```typescript
// In the post-session hook chain (Phase 20 TASK-TKNM-003 extended):
import { buildTranscriptIndexEntry, indexTranscript } from '@agentsy/session/transcript-indexer';
import type { EventLog } from '@agentsy/memory';

async function onSessionEnd(
  state: SessionState,
  eventLog: EventLog,
): Promise<void> {
  const entry = buildTranscriptIndexEntry(state);
  await indexTranscript(eventLog, entry);
}
```

#### TASK-ATT-008: CLI — `agentsy session show <id>`

**Location:** `packages/cli/src/commands/session/show.ts` (NEW)  
**Effort:** 1.5h

Renders a full session summary:

```typescript
// packages/cli/src/commands/session/show.ts — NEW
import { createSessionManager } from '@agentsy/session';
import { type SessionStore } from '@agentsy/session';

interface ShowOptions {
  id: string;
  store: SessionStore;
}

export async function showSession(options: ShowOptions): Promise<void> {
  const manager = createSessionManager(options.store, {
    sessionId: options.id,
  });
  const state = manager.getState();

  console.log(formatSession(state));
}

function formatSession(state: SessionState): string {
  const lines: string[] = [
    `Session:     ${state.sessionId}`,
    `Thread:      ${state.threadId}`,
    `Duration:    ${formatDuration(state.createdAt, state.updatedAt)}`,
    `Messages:    ${state.messages.length}`,
    `Tool calls:  ${state.toolCallQueue.length}`,
    `Checkpoints: ${state.checkpoints.length}`,
    '',
    '── Checkpoints ──',
    ...state.checkpoints.map(cp =>
      `  ${cp.id}${cp.label ? ` (${cp.label})` : ''}${cp.commitSha ? ` → ${cp.commitSha.slice(0, 12)}` : ''}`
    ),
    '',
    '── Linked Commits ──',
    ...state.meta.commitShas
      ? (state.meta.commitShas as string[]).map(sha => `  ${sha.slice(0, 12)}`)
      : ['  (none)'],
    '',
    '── Recent Transcript (last 5 messages) ──',
    ...state.messages.slice(-5).map(m => {
      const role = m.role === 'user' ? 'You' : m.role === 'assistant' ? 'AI' : m.role;
      const preview = typeof m.content === 'string'
        ? m.content.slice(0, 200)
        : `${m.content.length} content parts`;
      return `  [${role}] ${preview}`;
    }),
  ];

  return lines.join('\n');
}
```

#### TASK-ATT-009: CLI — `agentsy session search <query>`

**Location:** `packages/cli/src/commands/session/search.ts` (NEW)  
**Effort:** 1.5h

Searches indexed transcripts:

```typescript
// packages/cli/src/commands/session/search.ts — NEW
import { EventLog } from '@agentsy/memory';
import type { TranscriptIndexEntry } from '@agentsy/session/transcript-indexer';

interface SearchOptions {
  query: string;
  eventLog: EventLog;
  limit?: number;
}

export async function searchSessions(options: SearchOptions): Promise<void> {
  const results = await options.eventLog.search({
    type: 'session:transcript',
    query: options.query,
    limit: options.limit ?? 10,
  });

  console.log(formatSearchResults(results as unknown as TranscriptIndexEntry[]));
}

function formatSearchResults(results: TranscriptIndexEntry[]): string {
  if (results.length === 0) return 'No matching sessions found.';

  const lines: string[] = [`Found ${results.length} sessions:\n`];

  for (const entry of results) {
    lines.push(
      `  ${entry.sessionId.slice(0, 18)}...`,
      `  Thread:  ${entry.threadId.slice(0, 12)}...`,
      `  Turns:   ${entry.turnCount}`,
      `  Files:   ${entry.filesTouched.length > 0 ? entry.filesTouched.join(', ') : '(none)'}`,
      `  Commits: ${entry.linkedCommits.length}`,
      '',
    );
  }

  return lines.join('\n');
}
```

#### TASK-ATT-010: CLI — `agentsy session restore <id>`

**Location:** `packages/cli/src/commands/session/restore.ts` (NEW)  
**Effort:** 1h

Restores file state from a session checkpoint:

```typescript
// packages/cli/src/commands/session/restore.ts — NEW
import { loadFileSnapshot, restoreFileSnapshot } from '@agentsy/session/recovery/file-snapshot';
import { createSessionManager } from '@agentsy/session';

interface RestoreOptions {
  sessionId: string;
  repoRoot: string;
  store: SessionStore;
}

export async function restoreSession(options: RestoreOptions): Promise<void> {
  const manager = createSessionManager(options.store, {
    sessionId: options.sessionId,
  });
  const state = manager.getState();

  // Find the latest checkpoint with a file snapshot
  const checkpoints = state.checkpoints
    .filter(cp => cp.fileSnapshotKey)
    .sort((a, b) => b.createdAt - a.createdAt);

  if (checkpoints.length === 0) {
    console.log('No file snapshots available for this session.');
    return;
  }

  const latest = checkpoints[0];
  if (latest === undefined) return;

  const snapshot = loadFileSnapshot(
    options.sessionId,
    latest.fileSnapshotKey!,
    options.repoRoot,
  );

  if (snapshot === null) {
    console.log(`File snapshot ${latest.fileSnapshotKey} not found on disk.`);
    return;
  }

  restoreFileSnapshot(snapshot);
  console.log(`Restored ${snapshot.files.length} files from checkpoint ${latest.id}.`);
  for (const file of snapshot.files) {
    console.log(`  ${file.path}`);
  }
}
```

---

### Sub-phase 21.4 — git-ai Attribution Reader

**Effort:** 4h  
**Gate:** `agentsy tokenomics report --attribution` shows % AI vs human breakdown per period  
**Depends on:** Phase 20 tokenomics (ledger, ROI calculator), git-ai installed externally (optional)

#### TASK-ATT-011: git-ai git notes reader

**Location:** `packages/tokenomics/src/attribution/git-ai-notes.ts` (NEW)  
**Effort:** 2h

Reads git-ai's attribution git notes to extract % AI stats per commit:

```typescript
// packages/tokenomics/src/attribution/git-ai-notes.ts — NEW
import { execSync } from 'node:child_process';

export interface GitAiCommitStats {
  sha: string;
  humanAdditions: number;
  aiAdditions: number;
  aiAccepted: number;
  totalAdded: number;
  aiPercentage: number; // 0–100
  toolModelBreakdown: Record<string, { aiAdditions: number; aiAccepted: number }>;
}

export interface GitAiPeriodStats {
  periodStart: Date;
  periodEnd: Date;
  commitCount: number;
  totalHumanAdditions: number;
  totalAiAdditions: number;
  totalAiAccepted: number;
  overallAiPercentage: number;
  byTool: Record<string, { aiAdditions: number; aiPercentage: number }>;
}

/**
 * Read git-ai stats for a single commit.
 * Returns null if git-ai is not installed or the commit has no notes.
 */
export function readGitAiCommitStats(repoRoot: string, sha: string): GitAiCommitStats | null {
  try {
    // git-ai stores stats as git notes under the `ai` ref
    const raw = execSync(
      `git notes --ref=ai show ${sha} 2>/dev/null || true`,
      { cwd: repoRoot, encoding: 'utf-8' },
    ).trim();

    if (raw.length === 0) return null;

    const parsed = JSON.parse(raw) as {
      additions: { human: number; ai: number };
      accepted?: { ai: number };
      breakdown?: Record<string, { additions: number; accepted: number }>;
    };

    const humanAdditions = parsed.additions.human;
    const aiAdditions = parsed.additions.ai;
    const aiAccepted = parsed.accepted?.ai ?? aiAdditions;
    const totalAdded = humanAdditions + aiAdditions;

    return {
      sha,
      humanAdditions,
      aiAdditions,
      aiAccepted,
      totalAdded,
      aiPercentage: totalAdded > 0 ? (aiAdditions / totalAdded) * 100 : 0,
      toolModelBreakdown: Object.fromEntries(
        Object.entries(parsed.breakdown ?? {}).map(([key, val]) => [
          key,
          { aiAdditions: val.additions, aiAccepted: val.accepted },
        ])
      ),
    };
  } catch {
    return null; // git-ai not installed or no notes
  }
}

/**
 * Aggregate git-ai stats across multiple commits in a time range.
 */
export function aggregateGitAiStats(
  repoRoot: string,
  commits: string[],
): GitAiPeriodStats {
  const stats: GitAiCommitStats[] = [];

  for (const sha of commits) {
    const s = readGitAiCommitStats(repoRoot, sha);
    if (s !== null) stats.push(s);
  }

  const totalHuman = stats.reduce((sum, s) => sum + s.humanAdditions, 0);
  const totalAi = stats.reduce((sum, s) => sum + s.aiAdditions, 0);
  const totalAccepted = stats.reduce((sum, s) => sum + s.aiAccepted, 0);
  const totalAdded = totalHuman + totalAi;

  // Aggregate by tool/model
  const byTool: Record<string, { aiAdditions: number; aiPercentage: number }> = {};
  for (const s of stats) {
    for (const [tool, data] of Object.entries(s.toolModelBreakdown)) {
      const existing = byTool[tool] ?? { aiAdditions: 0, aiPercentage: 0 };
      existing.aiAdditions += data.aiAdditions;
      byTool[tool] = existing;
    }
  }
  for (const [tool, data] of Object.entries(byTool)) {
    data.aiPercentage = totalAdded > 0 ? (data.aiAdditions / totalAdded) * 100 : 0;
  }

  return {
    periodStart: new Date(),
    periodEnd: new Date(),
    commitCount: stats.length,
    totalHumanAdditions: totalHuman,
    totalAiAdditions: totalAi,
    totalAiAccepted: totalAccepted,
    overallAiPercentage: totalAdded > 0 ? (totalAi / totalAdded) * 100 : 0,
    byTool,
  };
}
```

#### TASK-ATT-012: Integrate git-ai stats into ROI calculator

**Location:** `packages/tokenomics/src/roi/calculator.ts`  
**Effort:** 1h

Extend `RoiSnapshot` with AI breakdown:

```typescript
// packages/tokenomics/src/roi/calculator.ts — extensions

export interface AiAttributionBreakdown {
  /** % AI lines across all commits in period (from git-ai notes) */
  overallAiPercentage: number;
  /** Total human-written lines */
  humanLines: number;
  /** Total AI-generated lines */
  aiLines: number;
  /** AI lines that survived through code review (accepted) */
  aiAcceptedLines: number;
  /** Breakdown by tool/model */
  byTool: Record<string, { aiLines: number; aiPercentage: number }>;
  /** Whether git-ai was available for this calculation */
  source: 'git-ai' | 'estimated' | 'unavailable';
}

// Add to RoiSnapshot:
export interface RoiSnapshot {
  // ... existing fields ...

  /** AI attribution breakdown (from git-ai notes, or null if unavailable) */
  aiAttribution?: AiAttributionBreakdown;
}
```

**Integration in computeRoiSnapshot:**

```typescript
// Inside computeRoiSnapshot():
import { aggregateGitAiStats } from '../attribution/git-ai-notes.js';

async function tryReadAiAttribution(
  commits: { sha: string }[],
  repoRoot: string,
): Promise<AiAttributionBreakdown | undefined> {
  const shas = commits.map(c => c.sha);
  const stats = aggregateGitAiStats(repoRoot, shas);

  if (stats.commitCount === 0) {
    return {
      overallAiPercentage: 0,
      humanLines: 0,
      aiLines: 0,
      aiAcceptedLines: 0,
      byTool: {},
      source: 'unavailable',
    };
  }

  return {
    overallAiPercentage: stats.overallAiPercentage,
    humanLines: stats.totalHumanAdditions,
    aiLines: stats.totalAiAdditions,
    aiAcceptedLines: stats.totalAiAccepted,
    byTool: stats.byTool,
    source: 'git-ai',
  };
}
```

#### TASK-ATT-013: Compatibility adapter for git-ai standard

**Location:** `packages/tokenomics/src/attribution/git-ai-adapter.ts` (NEW)  
**Effort:** 1h

Emit agentsy metadata in git-ai compatible format so users with git-ai installed see richer stats:

```typescript
// packages/tokenomics/src/attribution/git-ai-adapter.ts — NEW

/**
 * git-ai Agent Attribution Standard-compatible metadata.
 *
 * git-ai reads agent hooks that emit attribution data at points during
 * a session. This adapter emits agentsy-compatible metadata that git-ai
 * can consume, so users get cost + frustration + survival stats in their
 * `git ai stats` output alongside line-level attribution.
 *
 * Format spec: https://github.com/git-ai-project/git-ai/blob/main/specs/git_ai_standard_v3.0.0.md
 */

export interface GitAiAgentMetadata {
  agent: string;
  model: string;
  provider: string;
  sessionId: string;
  costUsd: number;
  cacheEfficiency: number;
  frustrationScore: number;
  durationMs: number;
  tokensUsed: {
    input: number;
    output: number;
    cacheHit: number;
  };
}

/**
 * Emit a git-ai-compatible checkpoint call.
 * git-ai's `git ai blame` reads these per-line attributions.
 */
export function emitGitAiCheckpoint(
  repoRoot: string,
  filePaths: string[],
  metadata: GitAiAgentMetadata,
): void {
  // Write attribution metadata to .git-ai format location
  const payload = JSON.stringify({
    version: 3,
    agent: metadata.agent,
    model: metadata.model,
    provider: metadata.provider,
    session: metadata.sessionId,
    cost: metadata.costUsd,
    frustration: metadata.frustrationScore,
    cacheEfficiency: metadata.cacheEfficiency,
    tokens: metadata.tokensUsed,
    duration: metadata.durationMs,
  });
  // Write to the git-ai checkpoint file that their daemon watches
  // (In practice, this hooks into the same post-tool-call lifecycle)
  console.log(`[agentsy:git-ai] ${payload}`);
}
```

---

### Sub-phase 21.5 — Ethical Transparency Dashboard

**Effort:** 7h  
**Gate:** `agentsy tokenomics report --ethical` renders full transparency dashboard with all 6 metrics  
**Depends on:** 21.1 (commit SHAs), 21.4 (git-ai stats), Phase 20 (ledger, ROI)

#### TASK-ATT-014: Unified transparency report builder

**Location:** `packages/tokenomics/src/roi/transparency-report.ts` (NEW)  
**Effort:** 3h

Combines ledger data + git-ai stats + frustration signals into a single ethical transparency report:

```typescript
// packages/tokenomics/src/roi/transparency-report.ts — NEW
import type { LedgerStore, LedgerAggregate } from '../ledger/store.js';
import type { RoiSnapshot } from './calculator.js';
import type { GitAiPeriodStats } from '../attribution/git-ai-notes.js';

export interface TransparencyReport {
  period: { from: Date; to: Date };

  /** Section 1: Spend efficiency */
  spend: {
    totalUsd: number;
    effectiveUsd: number;
    cacheSavingsUsd: number;
    cacheSavingsPercent: number;
    frustrationWastedUsd: number;
    frustrationWastePercent: number;
    costPerCommit: number;
    costPerLine: number;
  };

  /** Section 2: Code attribution */
  attribution: {
    aiLines: number;
    humanLines: number;
    aiPercentage: number;
    aiAcceptedLines: number;
    linesAdded: number;
    linesDeleted: number;
    commits: number;
    aiLinesPerTool: Record<string, number>;
  };

  /** Section 3: Code quality & durability */
  quality: {
    avgFrustrationScore: number;
    redSessionCount: number;
    yellowSessionCount: number;
    greenSessionCount: number;
    survivalRate30d: number | null;
    testPassRate: number | null;
    lintPassRate: number | null;
  };

  /** Section 4: Session activity */
  activity: {
    sessionCount: number;
    totalDurationHours: number;
    avgTokensPerSession: number;
    avgCacheEfficiency: number;
  };

  /** Section 5: Learning & improvement */
  learning: {
    activeFailureModes: number;
    pendingPatches: number;
    appliedPatches: number;
    reinforcedPatterns: number;
  };

  /** Section 6: AI tool comparison (when git-ai data available) */
  tools: {
    bestToolBySurvival: string;
    bestToolByCostEfficiency: string;
    worstToolByFrustration: string;
  };
}

/**
 * Build a transparency report from the ledger + optional git-ai data.
 */
export async function buildTransparencyReport(
  ledger: LedgerStore,
  roi: RoiSnapshot,
  gitAiStats?: GitAiPeriodStats,
): Promise<TransparencyReport> {
  return {
    period: roi.period,
    spend: {
      totalUsd: roi.spend.totalUsd,
      effectiveUsd: roi.spend.effectiveUsd,
      cacheSavingsUsd: roi.spend.cacheSavingsUsd,
      cacheSavingsPercent: roi.derived.cacheSavingsPercent,
      frustrationWastedUsd: roi.spend.frustrationWastedUsd,
      frustrationWastePercent: roi.derived.frustrationWastePercent,
      costPerCommit: roi.derived.costPerCommit,
      costPerLine: roi.derived.costPerLineAdded,
    },
    attribution: {
      aiLines: gitAiStats?.totalAiAdditions ?? 0,
      humanLines: gitAiStats?.totalHumanAdditions ?? 0,
      aiPercentage: gitAiStats?.overallAiPercentage ?? 0,
      aiAcceptedLines: gitAiStats?.totalAiAccepted ?? 0,
      linesAdded: roi.output.linesAdded,
      linesDeleted: 0,
      commits: roi.output.commits,
      aiLinesPerTool: Object.fromEntries(
        Object.entries(gitAiStats?.byTool ?? {}).map(([t, s]) => [t, s.aiAdditions])
      ),
    },
    quality: {
      avgFrustrationScore: roi.quality.avgFrustrationScore,
      redSessionCount: roi.quality.redSessions,
      yellowSessionCount: roi.quality.yellowSessions,
      greenSessionCount: roi.quality.greenSessions,
      survivalRate30d: null, // populated lazily
      testPassRate: null,
      lintPassRate: null,
    },
    activity: {
      sessionCount: roi.quality.sessionCount,
      totalDurationHours: 0,
      avgTokensPerSession: 0,
      avgCacheEfficiency: 0,
    },
    learning: {
      activeFailureModes: 0,
      pendingPatches: 0,
      appliedPatches: 0,
      reinforcedPatterns: 0,
    },
    tools: {
      bestToolBySurvival: 'N/A',
      bestToolByCostEfficiency: 'N/A',
      worstToolByFrustration: 'N/A',
    },
  };
}
```

#### TASK-ATT-015: CLI — `agentsy tokenomics report --ethical`

**Location:** `packages/cli/src/commands/tokenomics/ethical-report.ts` (NEW)  
**Effort:** 2h

Formats transparency report as a terminal UI section:

```typescript
// packages/cli/src/commands/tokenomics/ethical-report.ts — NEW
import type { TransparencyReport } from '@agentsy/tokenomics/roi/transparency-report';

export function formatEthicalReport(report: TransparencyReport): string {
  const lines: string[] = [
    '═══════════════════════════════════════════════════════════',
    '  Ethical Transparency Report — @agentsy',
    `  ${new Date().toISOString().slice(0, 10)}`,
    '═══════════════════════════════════════════════════════════',
    '',
    '  📊 CODE ATTRIBUTION',
    `     AI-generated:    ${report.attribution.aiLines} lines (${report.attribution.aiPercentage.toFixed(1)}%)`,
    `     Human-written:   ${report.attribution.humanLines} lines`,
    `     AI accepted:     ${report.attribution.aiAcceptedLines} lines`,
    `     Commits:         ${report.attribution.commits}`,
    '',
    '  💰 SPEND EFFICIENCY',
    `     Gross spend:     $${report.spend.totalUsd.toFixed(2)}`,
    `     Effective spend: $${report.spend.effectiveUsd.toFixed(2)}`,
    `     Cache savings:   $${report.spend.cacheSavingsUsd.toFixed(2)} (${report.spend.cacheSavingsPercent.toFixed(1)}%)`,
    `     Waste (frust.):  $${report.spend.frustrationWastedUsd.toFixed(2)} (${report.spend.frustrationWastePercent.toFixed(1)}%)`,
    `     Cost/commit:     $${report.spend.costPerCommit.toFixed(2)}`,
    '',
    '  🧠 QUALITY',
    `     Avg frustration: ${(report.quality.avgFrustrationScore * 100).toFixed(0)}%`,
    `     Green sessions:  ${report.quality.greenSessionCount} ✅`,
    `     Yellow sessions: ${report.quality.yellowSessionCount} ⚠️`,
    `     Red sessions:    ${report.quality.redSessionCount} 🔥`,
    `     30d survival:    ${report.quality.survivalRate30d !== null ? `${(report.quality.survivalRate30d * 100).toFixed(0)}%` : 'N/A'}`,
    '',
    '  🔬 AI TOOL EFFECTIVENESS',
    `     Best survival:    ${report.tools.bestToolBySurvival}`,
    `     Best cost eff.:   ${report.tools.bestToolByCostEfficiency}`,
    `     Most friction:    ${report.tools.worstToolByFrustration}`,
    '',
    '  📈 ACTIVITY',
    `     Sessions:        ${report.activity.sessionCount}`,
    `     Active FMs:      ${report.learning.activeFailureModes}`,
    `     Patches pending: ${report.learning.pendingPatches}`,
    `     Patches applied: ${report.learning.appliedPatches}`,
    '',
    '═══════════════════════════════════════════════════════════',
  ];

  return lines.join('\n');
}
```

#### TASK-ATT-016: CLI — `agentsy tokenomics report --attribution`

**Location:** `packages/cli/src/commands/tokenomics/attribution-report.ts` (NEW)  
**Effort:** 1h

Renders the git-ai attribution breakdown:

```typescript
// packages/cli/src/commands/tokenomics/attribution-report.ts — NEW
import type { GitAiPeriodStats } from '@agentsy/tokenomics/attribution/git-ai-notes';

export function formatAttributionReport(stats: GitAiPeriodStats): string {
  const lines: string[] = [
    '═════════════════════════════════════════════════',
    '  AI Attribution Report (from git-ai notes)',
    '═════════════════════════════════════════════════',
    '',
    `  AI code:        ${stats.overallAiPercentage.toFixed(1)}%`,
    `  Human code:     ${(100 - stats.overallAiPercentage).toFixed(1)}%`,
    `  Commits:        ${stats.commitCount}`,
    `  AI lines added: ${stats.totalAiAdditions}`,
    `  AI lines acc.:  ${stats.totalAiAccepted}`,
    `  Human lines:    ${stats.totalHumanAdditions}`,
    '',
    '  By Tool/Model:',
    ...Object.entries(stats.byTool).map(([tool, data]) =>
      `    ${tool}: ${data.aiAdditions} lines (${data.aiPercentage.toFixed(1)}%)`
    ),
    '',
    '═════════════════════════════════════════════════',
  ];

  return lines.join('\n');
}
```

---

## 4. Agent Hooks Standard & Plugin Integration

### TASK-ATT-017: Standard agent lifecycle hooks

**Location:** `packages/plugins/src/hooks/agent-lifecycle.ts` (NEW)  
**Effort:** 2h

Define a standard set of lifecycle hook events that agents emit. This makes agentsy compatible with entireio's hook system and git-ai's checkpoint standard:

```typescript
// packages/plugins/src/hooks/agent-lifecycle.ts — NEW

/**
 * Standard agent lifecycle events.
 *
 * Emitted by the runtime during agent execution. External tools like
 * git-ai and entireio consume these events to track attribution and
 * create checkpoints.
 */

export interface AgentLifecycleEvents {
  /** Agent session has started. */
  'agent:session-begin': {
    sessionId: string;
    agentId: string;
    modelId: string;
    providerId: string;
    repoRoot: string;
    timestamp: number;
  };

  /** Agent session has ended. */
  'agent:session-end': {
    sessionId: string;
    durationMs: number;
    commitShas: string[];
    filesTouched: string[];
    costUsd: number;
    timestamp: number;
  };

  /** Agent tool call completed. */
  'agent:tool-call': {
    sessionId: string;
    toolName: string;
    input: Record<string, unknown>;
    output: unknown;
    durationMs: number;
    timestamp: number;
  };

  /** Agent wrote or edited files. */
  'agent:file-write': {
    sessionId: string;
    filePaths: string[];
    linesAdded: number;
    linesDeleted: number;
    intent: string;
    timestamp: number;
  };

  /** Checkpoint created (user or agent committed / saved state). */
  'agent:checkpoint': {
    sessionId: string;
    checkpointId: string;
    commitSha?: string;
    filePaths: string[];
    timestamp: number;
  };
}

/**
 * Lifecycle emitter interface.
 * Agentsy runtime implements this so plugins can subscribe.
 */
export interface AgentLifecycleEmitter {
  emit<E extends keyof AgentLifecycleEvents>(
    event: E,
    payload: AgentLifecycleEvents[E],
  ): void;

  on<E extends keyof AgentLifecycleEvents>(
    event: E,
    handler: (payload: AgentLifecycleEvents[E]) => void,
  ): void;
}
```

**entireio compatibility mapping:**

| agentsy event | entireio equivalent | git-ai equivalent |
|---|---|---|
| `agent:session-begin` | `session start` | Agent session metadata |
| `agent:session-end` | `session end` | - |
| `agent:tool-call` | Tool call capture | - |
| `agent:file-write` | File write attribution | `git-ai checkpoint` |
| `agent:checkpoint` | Checkpoint creation | `git-ai checkpoint` |

---

## 5. Package Boundary Summary

| New/Modified Artifact | Package | Type |
|---|---|---|
| `CheckpointSchema.commitSha` field | `@agentsy/session` | Additive field change |
| `SessionManager.linkCommit()` | `@agentsy/session` | New method |
| `LinkCommitAction` reducer | `@agentsy/session` | New reducer |
| `recovery/file-snapshot.ts` | `@agentsy/session` | New module |
| `redaction-middleware.ts` | `@agentsy/session` | New module |
| `transcript-indexer.ts` | `@agentsy/session` | New module |
| `hooks/secret-redaction.ts` | `@agentsy/runtime` | New module |
| `hooks/agent-lifecycle.ts` | `@agentsy/plugins` | New module |
| `attribution/git-ai-notes.ts` | `@agentsy/tokenomics` | New module |
| `attribution/git-ai-adapter.ts` | `@agentsy/tokenomics` | New module |
| `roi/transparency-report.ts` | `@agentsy/tokenomics` | New module |
| `commands/session/show.ts` | `@agentsy/cli` | New command |
| `commands/session/search.ts` | `@agentsy/cli` | New command |
| `commands/session/restore.ts` | `@agentsy/cli` | New command |
| `commands/tokenomics/ethical-report.ts` | `@agentsy/cli` | New command |
| `commands/tokenomics/attribution-report.ts` | `@agentsy/cli` | New command |
| `LedgerStore` — commit SHA queries | `@agentsy/tokenomics` | New query method |
| `RoiSnapshot.aiAttribution` | `@agentsy/tokenomics` | New field |

---

## 6. Task Summary

| Task | Module | Effort | Phase | Depends On |
|---|---|---|---|---|
| ATT-001 | Checkpoint commit SHA | 0.5h | 21.1 | session state |
| ATT-002 | linkCommit() + reducer | 1.5h | 21.1 | ATT-001 |
| ATT-003 | Ledger commit SHAs | 1h | 21.1 | ATT-002, TKNM-003 |
| ATT-004 | File snapshot/restore | 2h | 21.1 | session state |
| ATT-005 | Redaction middleware | 1.5h | 21.2 | @agentsy/secrets |
| ATT-006 | Redaction hook | 1.5h | 21.2 | ATT-005 |
| ATT-007 | Transcript indexer | 2h | 21.3 | @agentsy/memory |
| ATT-008 | session show CLI | 1.5h | 21.3 | ATT-007 |
| ATT-009 | session search CLI | 1.5h | 21.3 | ATT-007 |
| ATT-010 | session restore CLI | 1h | 21.3 | ATT-004 |
| ATT-011 | git-ai notes reader | 2h | 21.4 | Phase 20 ROI |
| ATT-012 | ROI integration | 1h | 21.4 | ATT-011 |
| ATT-013 | git-ai adapter | 1h | 21.4 | — |
| ATT-014 | Transparency report builder | 3h | 21.5 | ATT-011, TKNM-018 |
| ATT-015 | report --ethical CLI | 2h | 21.5 | ATT-014 |
| ATT-016 | report --attribution CLI | 1h | 21.5 | ATT-011 |
| ATT-017 | Agent lifecycle hooks | 2h | cross | @agentsy/plugins |
| **Total** | | **~24h** | | |

---

## 7. Quality Gates

- ✅ `pnpm check-types` clean (zero `any`)
- ✅ `pnpm test` — all modules have unit tests with fixtures
- ✅ No unredacted secrets in any persisted session data
- ✅ Checkpoint schema backward-compatible (additive changes only)
- ✅ git-ai notes reading is opt-in via config
- ✅ File-level restore does not create git commits (user commits to persist)
- ✅ Session transcripts never stored in `.git/`
- ✅ All CLI commands under existing command trees
- ✅ `IMPLEMENTATION-PLAN.md` updated as tasks complete

---

## 8. Success Criteria

- [ ] Every `SessionLedgerEntry` references commit SHAs from session checkpoints
- [ ] `agentsy session show <id>` renders full transcript with cost and frustration
- [ ] `agentsy session search <query>` returns results from indexed transcripts
- [ ] `agentsy session restore <id>` restores working-tree files from checkpoint
- [ ] `agentsy tokenomics report --ethical` renders 6-section transparency dashboard
- [ ] `agentsy tokenomics report --attribution` shows % AI breakdown (when git-ai installed)
- [ ] All session persistence auto-redacts secrets via `@agentsy/secrets`
- [ ] git-ai notes data successfully consumed in ROI calculator when available
- [ ] Agent lifecycle hooks emit properly and are consumable by entireio/git-ai

---

**Previous:** `29-PHASE-20-TOKENOMICS.md`  
**Next:** Phase 22 (post-GA iteration)
