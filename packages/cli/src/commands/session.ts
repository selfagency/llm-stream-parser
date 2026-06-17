import {
  createFileStore,
  createSessionManager,
  detectStaleSessions,
  restoreSession,
  validateIntegrity
} from '@agentsy/session';
import type { CliIO } from '../index.js';

// ---------------------------------------------------------------------------
// agentsy sessions list
// ---------------------------------------------------------------------------

function handleSessionsList(io: CliIO): number {
  const store = createFileStore();
  const stdout = io.stdout ?? console.log;
  const keys = store.listKeys();
  const entries: string[] = [];

  if (keys.includes('session_state')) {
    const manager = createSessionManager(store);
    const state = manager.getState();
    entries.push(`${state.sessionId} (thread: ${state.threadId}, messages: ${state.messages.length})`);
  }

  if (entries.length === 0) {
    stdout('No sessions found.');
    return 0;
  }
  for (const entry of entries) {
    stdout(`  ${entry}`);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// agentsy session <id> status
// ---------------------------------------------------------------------------

function handleSessionStatus(sessionId: string, io: CliIO): number {
  const store = createFileStore();
  const saved = store.getValue<Record<string, unknown>>(`session:${sessionId}`);
  if (!saved) {
    (io.stderr ?? console.error)(`Session not found: ${sessionId}`);
    return 1;
  }
  const stdout = io.stdout ?? console.log;
  stdout(`Session: ${sessionId}`);
  stdout(`  Thread: ${String(saved.threadId ?? 'main')}`);
  stdout(`  Created: ${new Date(saved.createdAt as number).toISOString()}`);
  stdout(`  Updated: ${new Date(saved.updatedAt as number).toISOString()}`);
  stdout(`  Messages: ${(saved.messages as unknown[]).length}`);
  stdout(`  Tool calls: ${(saved.toolCallQueue as unknown[]).length}`);
  if (saved.parentSessionId) {
    stdout(`  Parent session: ${String(saved.parentSessionId)}`);
  }
  if (saved.parentThreadId) {
    stdout(`  Parent thread: ${String(saved.parentThreadId)}`);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// agentsy session <id> checkpoint
// ---------------------------------------------------------------------------

// fallow-ignore-next-line complexity — CLI subcommand dispatch with list/restore branching
function handleSessionCheckpoint(sessionId: string, args: readonly string[], io: CliIO): number {
  const store = createFileStore();
  const manager = createSessionManager(store, { sessionId });
  const stdout = io.stdout ?? console.log;
  const sub = args[0];
  if (sub === 'list') {
    const checkpoints = manager.getCheckpoints();
    if (checkpoints.length === 0) {
      stdout('No checkpoints for this session.');
    } else {
      for (const cp of checkpoints) {
        const label = cp.label ? ` (${cp.label})` : '';
        stdout(`  ${cp.id}${label} [${new Date(cp.timestamp).toISOString()}]`);
      }
    }
    return 0;
  }
  if (sub === 'restore' && args[1]) {
    try {
      manager.restoreCheckpoint(args[1]);
      stdout(`Restored to checkpoint: ${args[1]}`);
      return 0;
    } catch {
      (io.stderr ?? console.error)(`Checkpoint not found: ${args[1]}`);
      return 1;
    }
  }
  (io.stderr ?? console.error)('Usage: agentsy session <id> checkpoint <list|restore <id>>');
  return 1;
}

// ---------------------------------------------------------------------------
// agentsy session <id>
// ---------------------------------------------------------------------------

function handleSessionById(sessionId: string, rest: readonly string[], io: CliIO): number {
  if (rest[0] === 'status') {
    return handleSessionStatus(sessionId, io);
  }
  if (rest[0] === 'checkpoint') {
    return handleSessionCheckpoint(sessionId, rest.slice(1), io);
  }
  return handleSessionStatus(sessionId, io);
}

// ---------------------------------------------------------------------------
// agentsy resume [sessionId]
// ---------------------------------------------------------------------------

function handleSessionResume(sessionId: string | undefined, io: CliIO): number {
  const store = createFileStore();
  const stdout = io.stdout ?? console.log;

  if (sessionId) {
    return validateAndReportSession(sessionId, store, io);
  }

  const stale = detectStaleSessions(store, 3_600_000);
  if (stale.length === 0) {
    stdout('No stale sessions found. Everything looks healthy.');
    return 0;
  }
  stdout('Stale sessions detected:');
  for (const entry of stale) {
    const ago = Math.round((Date.now() - entry.lastSeenAt) / 1000);
    stdout(`  ${entry.sessionId} — ${entry.reason} (${ago}s ago)`);
    const result = restoreSession(store, entry);
    stdout(`    → ${result.summary}`);
  }
  return 0;
}

function validateAndReportSession(sessionId: string, store: ReturnType<typeof createFileStore>, io: CliIO): number {
  const stdout = io.stdout ?? console.log;
  const saved = store.getValue<Record<string, unknown>>(`session:${sessionId}`);
  if (!saved) {
    (io.stderr ?? console.error)(`Session not found: ${sessionId}`);
    return 1;
  }
  const integrity = validateIntegrity(saved);
  if (!integrity.valid) {
    stdout(`Session ${sessionId} has integrity issues:`);
    for (const err of integrity.errors) {
      stdout(`  [ERROR] ${err}`);
    }
    for (const warn of integrity.warnings) {
      stdout(`  [WARN] ${warn}`);
    }
    stdout('Run "agentsy doctor" to attempt recovery.');
    return 1;
  }
  const warnCount = integrity.warnings.length;
  const status = warnCount > 0 ? `${warnCount} warnings` : 'no warnings';
  stdout(`Session ${sessionId} is valid (${status}).`);
  stdout(`  Messages: ${(saved.messages as unknown[]).length}`);
  stdout(`  Last updated: ${new Date(saved.updatedAt as number).toISOString()}`);
  return 0;
}

// ---------------------------------------------------------------------------
// Top-level dispatch
// ---------------------------------------------------------------------------

export function runSessionsCommand(args: readonly string[], io: CliIO): number {
  const sub = args[0];
  if (sub === 'list') {
    return handleSessionsList(io);
  }
  (io.stderr ?? console.error)('Usage: agentsy sessions list');
  return 1;
}

export function runSessionCommand(args: readonly string[], io: CliIO): number {
  const sessionId = args[0];
  if (!sessionId) {
    (io.stderr ?? console.error)('Usage: agentsy session <id> [status|checkpoint]');
    return 1;
  }
  return handleSessionById(sessionId, args.slice(1), io);
}

export function runResumeCommand(args: readonly string[], io: CliIO): number {
  return handleSessionResume(args[0], io);
}
