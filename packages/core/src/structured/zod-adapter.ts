/**
 * Optional adapter for converting Zod schemas to JSON Schema.
 *
 * Requires `zod` and `zod-to-json-schema` as peer dependencies.
 * These are NOT bundled with @selfagency/llm-stream-parser — install them separately:
 *
 * ```bash
 * pnpm add zod zod-to-json-schema
 * ```
 */

import type { JsonObject } from '@agentsy/shared';
import type { ValidateJsonSchemaOptions } from './validate-json-schema.js';
import { validateJsonSchema } from './validate-json-schema.js';

// Use dynamic imports so consumers without Zod don't pay a load-time penalty.
// The types below cover the minimal surface we use from Zod.

/** Minimal interface representing a Zod schema's `.parse` / `._def` shape. */
export interface ZodLike {
  _def: Record<string, unknown>;
  parse: (data: unknown) => unknown;
}

/**
 * Convert a Zod schema to a JSON Schema object.
 *
 * @throws If `zod-to-json-schema` is not installed.
 */
export async function zodToJsonSchema(zodSchema: ZodLike): Promise<JsonObject> {
  let zodToJsonSchemaFn: (schema: ZodLike) => JsonObject;
  try {
    // Dynamic import — zod-to-json-schema is an optional peer dependency.
    const mod = await import('zod-to-json-schema');
    // nosemgrep: typescript-unnecessary-assertion
    // Dynamic import returns `unknown`; explicit cast is required to assign to typed function variable.
    zodToJsonSchemaFn = (mod.default ?? mod) as unknown as typeof zodToJsonSchemaFn;
  } catch {
    throw new Error('zod-to-json-schema is required for Zod integration. Install it: pnpm add zod-to-json-schema');
  }

  return zodToJsonSchemaFn(zodSchema);
}

/**
 * Validate a JSON string against a Zod schema by converting it to JSON Schema first.
 *
 * @throws If `zod-to-json-schema` is not installed.
 */
export async function validateWithZod<T = unknown>(
  text: string,
  zodSchema: ZodLike,
  options?: ValidateJsonSchemaOptions
): Promise<{ success: true; data: T } | { success: false; errors: string[] }> {
  const jsonSchema = await zodToJsonSchema(zodSchema);
  return validateJsonSchema<T>(text, jsonSchema, options);
}
