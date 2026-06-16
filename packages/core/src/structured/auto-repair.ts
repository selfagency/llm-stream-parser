import type { JsonObject } from '@agentsy/shared';

import { buildRepairPrompt } from './build-repair-prompt.js';
import type { ValidateJsonSchemaOptions } from './validate-json-schema.js';
import { validateJsonSchema } from './validate-json-schema.js';

export interface AutoRepairOptions extends ValidateJsonSchemaOptions {
  /** Maximum number of repair attempts. Defaults to 3. */
  maxAttempts?: number;
  /** The original prompt that produced the output (included in repair prompts). */
  originalPrompt?: string;
}

export interface AutoRepairResult<T = unknown> {
  /** Total number of attempts (including the initial parse). */
  attempts: number;
  /** The parsed data if successful, otherwise undefined. */
  data?: T;
  /** Validation errors from the last attempt if unsuccessful. */
  errors?: string[];
  /** Whether the final output is valid. */
  success: boolean;
}

/**
 * Attempts to parse and validate JSON output against a schema, automatically
 * generating repair prompts and retrying via the provided `callLLM` callback.
 *
 * Follows the LangChain `OutputFixingParser` / `RetryParser` pattern:
 * 1. Parse the initial output and validate against the schema.
 * 2. On failure, build a repair prompt with the error and failed output.
 * 3. Call `callLLM` with the repair prompt to get a corrected output.
 * 4. Repeat until valid or `maxAttempts` is reached.
 *
 * @param initialOutput  The raw LLM output text to parse.
 * @param schema         JSON Schema the output must conform to.
 * @param callLLM        Async callback that sends a repair prompt to the LLM and returns text.
 * @param options        Repair and validation options.
 */
export async function repairWithLLM<T = unknown>(
  initialOutput: string,
  schema: JsonObject,
  callLLM: (repairPrompt: string) => Promise<string>,
  options: AutoRepairOptions = {}
): Promise<AutoRepairResult<T>> {
  const maxAttempts = options.maxAttempts ?? 3;
  let currentOutput = initialOutput;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = validateJsonSchema<T>(currentOutput, schema, options);

    if (result.success) {
      return { attempts: attempt, data: result.data, success: true };
    }

    // Last attempt — don't retry
    if (attempt === maxAttempts) {
      return { attempts: attempt, errors: result.errors, success: false };
    }

    const repairPrompt = buildRepairPrompt({
      error: result.errors.join('\n'),
      failedOutput: currentOutput,
      schema,
      ...(options.originalPrompt === undefined ? {} : { originalPrompt: options.originalPrompt })
    });

    currentOutput = await callLLM(repairPrompt);
  }

  // Unreachable, but TypeScript needs it
  return {
    attempts: maxAttempts,
    errors: ['$: max attempts reached'],
    success: false
  };
}
