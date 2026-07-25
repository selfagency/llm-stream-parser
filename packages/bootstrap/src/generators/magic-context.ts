/**
 * Magic Context Bootstrap — seeds context compartments in UnifiedDB.
 *
 * Accepts a database query function (not a direct better-sqlite3 dependency)
 * so callers can use any SQLite binding.
 *
 * @module
 */

import type { ProjectProfile } from '../scanner.js';

// ── Types ───────────────────────────────────────────────

/**
 * Magic Context compartments structure.
 */
export interface MagicContextSeed {
  /** Fine-grained context buckets (e.g. api-routes, database-schema) */
  compartments: Record<string, string>;
  /** High-level project facts (name, purpose, stack) */
  projectMemories: Record<string, string>;
  /** Project-level state (current branch, recent commits) */
  projectState: Record<string, string>;
  /** Session-level context (current task, recent files) */
  sessionMeta: Record<string, string>;
}

/**
 * Database query function injected by the caller.
 * Accepts a SQL string and positional parameters.
 */
export type DbQueryFn = (sql: string, ...params: unknown[]) => unknown;

// ── Seeder ──────────────────────────────────────────────

function buildSeed(profile: ProjectProfile): MagicContextSeed {
  const frameworkLabel = profile.frameworks.length > 0 ? profile.frameworks.join(', ') : 'none detected';

  return {
    projectMemories: {
      name: profile.rootPath.split('/').pop() ?? 'unknown',
      purpose: `${frameworkLabel} project using ${profile.buildSystem}`,
      stack: profile.languages.join(', '),
      packageManager: profile.packageManager,
      buildSystem: profile.buildSystem,
      monorepo: String(profile.monorepo)
    },
    compartments: {
      'project-overview': `Language: ${profile.languages.join(', ')} | Framework: ${frameworkLabel} | Build: ${profile.buildSystem}`,
      tooling: `${profile.linter.length > 0 ? `Lint: ${profile.linter.join(', ')} ` : ''}${profile.testRunner.length > 0 ? `Test: ${profile.testRunner.join(', ')}` : ''}`,
      'ci-cd': profile.ci.join(', ') || 'none',
      deployment: profile.deploymentTarget.join(', ') || 'none'
    },
    sessionMeta: {
      currentTask: '',
      recentFiles: '',
      contextTags: ''
    },
    projectState: {
      currentBranch: '',
      recentCommits: '',
      todoItems: ''
    }
  };
}

// ── SQL fragment generators ─────────────────────────────

const UPSERT_SQL = `
INSERT INTO context_compartments (compartment_key, compartment_value, updated_at)
VALUES (?, ?, datetime('now'))
ON CONFLICT(compartment_key) DO UPDATE SET
  compartment_value = excluded.compartment_value,
  updated_at = excluded.updated_at
`;

/**
 * Seed Magic Context compartments in a UnifiedDB database.
 *
 * @param db      - Database query function (e.g. better-sqlite3 `db.run`)
 * @param profile - Detected project profile
 */
export function seedMagicContext(db: DbQueryFn, profile: ProjectProfile): void {
  const seed = buildSeed(profile);

  // Seed project memories
  for (const [key, value] of Object.entries(seed.projectMemories)) {
    db(UPSERT_SQL, `project_memory:${key}`, value);
  }

  // Seed compartments
  for (const [key, value] of Object.entries(seed.compartments)) {
    db(UPSERT_SQL, `compartment:${key}`, value);
  }

  // Seed session meta (empty placeholders)
  for (const [key, value] of Object.entries(seed.sessionMeta)) {
    db(UPSERT_SQL, `session_meta:${key}`, value);
  }

  // Seed project state (empty placeholders)
  for (const [key, value] of Object.entries(seed.projectState)) {
    db(UPSERT_SQL, `project_state:${key}`, value);
  }
}
