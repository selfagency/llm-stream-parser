/**
 * Zod schema for `.agentsy/secrets.yaml` configuration.
 *
 * Validates provider definitions, resource type mappings, and TTL overrides.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Provider-level schema
// ---------------------------------------------------------------------------

const providerConfigSchema = z
  .object({
    /** Human-readable label (optional, defaults to provider id). */
    name: z.string().optional(),
    /** Which resource types this provider handles. */
    resourceTypes: z.array(z.string()).default([]),
    /** Provider-specific options (unvalidated — each KeyringProvider validates its own). */
    options: z.record(z.unknown()).optional()
  })
  .passthrough();

// ---------------------------------------------------------------------------
// Top-level schema
// ---------------------------------------------------------------------------

export const secretsConfigSchema = z.object({
  /** Schema version (currently 1). */
  version: z.literal(1).default(1),

  /** Provider definitions keyed by provider id. */
  providers: z.record(providerConfigSchema).default({}),

  /** Fallback provider when no resource type matches. */
  defaultProvider: z.string().optional(),

  /** Per-resource-type TTL overrides in seconds. */
  ttl: z.record(z.number().positive()).optional()
});

// ---------------------------------------------------------------------------
// Inferred type
// ---------------------------------------------------------------------------

/** Validated secrets configuration. */
export type SecretsConfig = z.infer<typeof secretsConfigSchema>;
