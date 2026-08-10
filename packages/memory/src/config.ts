// Configuration loader for @agentsy/memory standalone mode
// Loads from (in priority order):
// 1. Constructor options (programmatic)
// 2. Environment variables (AGENTSY_MEMORY_*)
// 3. .agentsy/memory.env (project-level)
// 4. Built-in defaults

import type { DecayConfig } from './cognitive/decay.js';
import { DEFAULT_DECAY_CONFIG } from './cognitive/decay.js';
import type { TierConfig, TierName } from './cognitive/tier-types.js';
import type { TokenBudgetOptions } from './cognitive/token-budget.js';
import type { MemoryMCPServerOptions } from './mcp/server.js';

export interface MemoryConfig {
  budget: TokenBudgetOptions;
  db: {
    path: string;
    syncUrl?: string;
    syncAuthToken?: string;
    syncIntervalMs?: number;
  };
  decay: DecayConfig;
  hooks: {
    onSessionStart: boolean;
    onSessionEnd: boolean;
    onToolCall: boolean;
    onResponse: boolean;
  };
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  mcp: MemoryMCPServerOptions;
  tiers: Record<TierName, TierConfig>;
}

const DEFAULT_TIER_CONFIGS: Record<TierName, TierConfig> = {
  sensory_buffer: {
    level: 1,
    name: 'sensory_buffer',
    maxTokens: 200,
    maxItems: 50,
    ttlMs: 5000,
    consolidationThreshold: 0.6,
    compressionTarget: 0.5
  },
  sensory_register: {
    level: 2,
    name: 'sensory_register',
    maxTokens: 400,
    maxItems: 4,
    ttlMs: 2000,
    consolidationThreshold: 0.5,
    compressionTarget: 0.4
  },
  working_memory: {
    level: 3,
    name: 'working_memory',
    maxTokens: 1000,
    maxItems: 7,
    ttlMs: 30_000,
    consolidationThreshold: 0.4,
    compressionTarget: 0.3
  },
  short_term_memory: {
    level: 4,
    name: 'short_term_memory',
    maxTokens: 2000,
    maxItems: 12,
    ttlMs: 3_600_000,
    consolidationThreshold: 0.3,
    compressionTarget: 0.2
  },
  long_term_memory: {
    level: 5,
    name: 'long_term_memory',
    maxTokens: Number.POSITIVE_INFINITY,
    maxItems: Number.POSITIVE_INFINITY,
    ttlMs: Number.POSITIVE_INFINITY,
    consolidationThreshold: 0,
    compressionTarget: 0
  }
};

function envString(key: string, fallback: string): string {
  const val = process.env[key];
  if (typeof val === 'string' && val.length > 0) {
    return val;
  }
  return fallback;
}

function envNumber(key: string, fallback: number): number {
  const val = process.env[key];
  if (typeof val === 'string' && val.length > 0) {
    const parsed = Number(val);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function envBool(key: string, fallback: boolean): boolean {
  const val = process.env[key];
  if (typeof val === 'string' && val.length > 0) {
    return val === '1' || val === 'true' || val === 'yes';
  }
  return fallback;
}

/** Resolve log level, clamping to valid set. */
function resolveLogLevel(overrides?: Partial<MemoryConfig>, envVar?: string): MemoryConfig['logLevel'] {
  const raw = overrides?.logLevel ?? envString(envVar ?? 'AGENTY_MEMORY_LOG_LEVEL', 'info');
  return raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error' ? raw : 'info';
}

/** Build the db config section from overrides and env vars. */
function loadDbConfig(overrides?: Partial<MemoryConfig>): MemoryConfig['db'] {
  const path = overrides?.db?.path ?? envString('AGENTSY_MEMORY_DB', '.agentsy/memory.db');
  const syncUrl = overrides?.db?.syncUrl ?? (process.env.AGENTSY_MEMORY_SYNC_URL || undefined);
  const syncAuthToken = overrides?.db?.syncAuthToken ?? (process.env.AGENTSY_MEMORY_SYNC_AUTH_TOKEN || undefined);
  const syncIntervalMs = overrides?.db?.syncIntervalMs ?? envNumber('AGENTSY_MEMORY_SYNC_INTERVAL_MS', 60_000);
  return {
    path,
    syncIntervalMs,
    ...(syncUrl === undefined ? {} : { syncUrl }),
    ...(syncAuthToken === undefined ? {} : { syncAuthToken })
  };
}

/** Build the MCP server config section from overrides and env vars. */
function loadMcpConfig(overrides?: Partial<MemoryConfig>, dbPath?: string): MemoryConfig['mcp'] {
  const transport = overrides?.mcp?.transport ?? (envString('AGENTSY_MEMORY_TRANSPORT', 'stdio') as 'stdio' | 'http');
  const port = overrides?.mcp?.port ?? envNumber('AGENTSY_MEMORY_PORT', 4231);
  return {
    transport,
    port,
    ...(dbPath ? { dbPath } : {}),
    logLevel: resolveLogLevel(overrides)
  };
}

/** Build the hooks config section from overrides and env vars. */
function loadHooksConfig(overrides?: Partial<MemoryConfig>): MemoryConfig['hooks'] {
  return (
    overrides?.hooks ?? {
      onSessionStart: envBool('AGENTSY_MEMORY_HOOK_SESSION_START', true),
      onSessionEnd: envBool('AGENTSY_MEMORY_HOOK_SESSION_END', true),
      onToolCall: envBool('AGENTSY_MEMORY_HOOK_TOOL_CALL', true),
      onResponse: envBool('AGENTSY_MEMORY_HOOK_RESPONSE', true)
    }
  );
}

/**
 * Load memory configuration with optional overrides.
 * Priority: overrides > env vars > defaults
 */
export function loadConfig(overrides?: Partial<MemoryConfig>): MemoryConfig {
  const db = loadDbConfig(overrides);

  return {
    db,
    tiers: overrides?.tiers ?? DEFAULT_TIER_CONFIGS,
    budget: overrides?.budget ?? { budgets: {} },
    decay: overrides?.decay ?? DEFAULT_DECAY_CONFIG,
    mcp: loadMcpConfig(overrides, db.path),
    hooks: loadHooksConfig(overrides),
    logLevel: resolveLogLevel(overrides)
  };
}

export { DEFAULT_TIER_CONFIGS };

export function validateMemoryConfig(config: MemoryConfig): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.db.path || config.db.path.trim().length === 0) {
    errors.push('Database path must be configured.');
  }

  if (config.mcp.transport === 'http' && (!config.mcp.port || config.mcp.port <= 0)) {
    errors.push('HTTP MCP transport requires a positive port.');
  }

  if (config.db.syncUrl && !config.db.syncAuthToken) {
    warnings.push('Remote sync URL is configured without an auth token.');
  }

  return { errors, warnings };
}
