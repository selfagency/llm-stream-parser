/**
 * @agentsy/session — Session persistence, serialization, and branching
 *
 * ## Packages
 *
 * - {@link ./state/index.ts | state } — Zod-validated typed state schema + immutable reducers
 * - {@link ./store.ts | store }     — Key-value session store backed by in-memory maps
 *
 * @module
 */

// Context fingerprint for cache reuse
export {
  type ComputeFingerprintOptions,
  type ContextFingerprint,
  computeContextFingerprint,
  isCacheValid
} from './context-fingerprint.js';
// File-backed session store
export { createFileStore, getDefaultSessionFilePath } from './file-store.js';
// Session lifecycle management (Phase 6)
export {
  type CheckpointInfo,
  createSessionManager,
  type SessionManager,
  type SessionManagerOptions
} from './manager.js';
// Pause/resume for approval gates and interruptions
export { createPauseManager, type PauseEntry, type PauseManager } from './pause.js';
// Crash recovery
export {
  detectStaleSessions,
  type IntegrityResult,
  type RestoreOptions,
  type RestoreResult,
  restoreSession,
  type StaleEntry,
  validateIntegrity
} from './recovery/index.js';
// Typed state layer (Phase 6)
export * from './state/index.js';
export {
  type CreateSessionSnapshotInput,
  createSessionSnapshot,
  createSessionStore,
  type LegacySessionState,
  type ReusableSessionSegment,
  type SessionSnapshot,
  type SessionStore
} from './store.js';
// Session tree for fork/clone/summarize (Phase 17)
export { type SessionEntry, SessionTree, type SessionTreeNode } from './tree.js';
