/**
 * Config model, Zod schema, and layered loading for Agentsy CLI.
 *
 * ## Precedence (highest → lowest)
 * 1. Environment variables (AGENTSY_*)
 * 2. Project config (.agentsy/config.json)
 * 3. User config (~/.config/agentsy/config.json)
 * 4. Built-in defaults
 *
 * ## Security
 * Config files NEVER store plaintext secrets. Provider credentials are
 * referenced via `secretRef` (e.g. `op://vault/item/field`) or `secretId`
 * (credential broker ID) and resolved at runtime through @agentsy/secrets.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

import { projectConfigPath, userConfigPath } from './paths.js';

// =============================================================================
// Zod schemas
// =============================================================================

const ProviderConfigSchema = z.object({
  /** Unique provider instance identifier. */
  id: z.string().min(1),
  /** Provider type. */
  type: z.enum(['openai', 'anthropic', 'ollama', 'openai-compatible']),
  /** Reference to a credential in the secrets broker (never a plaintext key). */
  secretRef: z.string().optional(),
  /** Credential broker ID for programmatic resolution. */
  secretId: z.string().optional(),
  /** Base URL override (for self-hosted / compatible providers). */
  baseUrl: z.string().url().optional(),
  /** Model override for this provider instance. */
  model: z.string().optional()
});

const BudgetConfigSchema = z.object({
  /** Maximum input tokens per turn. */
  inputCap: z.number().int().positive(),
  /** Maximum output tokens per turn. */
  outputCap: z.number().int().positive()
});

const UiConfigSchema = z
  .object({
    /** Reduce motion in terminal UI. */
    reduceMotion: z.boolean().optional(),
    /** Color scheme preference. */
    colorScheme: z.enum(['auto', 'light', 'dark']).optional()
  })
  .optional();

const ApprovalPolicySchema = z.enum(['deny-all', 'deny-destructive', 'deny-none']);

export const ConfigSchema = z.object({
  /** Schema version for migration support. */
  version: z.literal(1).default(1),
  /** Configured provider instances. */
  providers: z.array(ProviderConfigSchema).default([]),
  /** Default model selection (overridable per-provider). */
  model: z.string().optional(),
  /** Token budget limits. */
  budget: BudgetConfigSchema.default({ inputCap: 128_000, outputCap: 16_384 }),
  /** Approval policy for tool execution. */
  approvalPolicy: ApprovalPolicySchema.default('deny-destructive'),
  /** UI preferences. */
  ui: UiConfigSchema,
  /** Default agent mode ID. */
  defaultAgent: z.string().optional()
});

// =============================================================================
// Types
// =============================================================================

export type Config = z.infer<typeof ConfigSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type BudgetConfig = z.infer<typeof BudgetConfigSchema>;
// Published for external consumers of the CLI config package
// fallow-ignore-next-line unused-type
export type ApprovalPolicy = z.infer<typeof ApprovalPolicySchema>;

// =============================================================================
// Defaults
// =============================================================================

export const DEFAULT_CONFIG: Config = {
  version: 1,
  providers: [],
  budget: { inputCap: 128_000, outputCap: 16_384 },
  approvalPolicy: 'deny-destructive'
};

// =============================================================================
// Environment variable loading
// =============================================================================

/**
 * Load config overrides from AGENTSY_* environment variables.
 *
 * Supported variables:
 * - AGENTSY_MODEL          → model
 * - AGENTSY_APPROVAL       → approvalPolicy
 * - AGENTSY_BUDGET_INPUT   → budget.inputCap
 * - AGENTSY_BUDGET_OUTPUT  → budget.outputCap
 * - AGENTSY_DEFAULT_AGENT  → defaultAgent
 * - AGENTSY_UI_COLOR       → ui.colorScheme
 * - AGENTSY_UI_REDUCE_MOTION → ui.reduceMotion
 */
export function loadFromEnv(): Record<string, unknown> {
  const partial: Record<string, unknown> = {};

  const model = process.env.AGENTSY_MODEL;
  if (model) {
    partial.model = model;
  }

  const approval = process.env.AGENTSY_APPROVAL;
  if (approval === 'deny-all' || approval === 'deny-destructive' || approval === 'deny-none') {
    partial.approvalPolicy = approval;
  }

  const budgetInput = process.env.AGENTSY_BUDGET_INPUT;
  const budgetOutput = process.env.AGENTSY_BUDGET_OUTPUT;
  if (budgetInput || budgetOutput) {
    partial.budget = {
      inputCap: budgetInput ? Number(budgetInput) : DEFAULT_CONFIG.budget.inputCap,
      outputCap: budgetOutput ? Number(budgetOutput) : DEFAULT_CONFIG.budget.outputCap
    };
  }

  const defaultAgent = process.env.AGENTSY_DEFAULT_AGENT;
  if (defaultAgent) {
    partial.defaultAgent = defaultAgent;
  }

  const uiFromEnv = loadUiFromEnv();
  if (uiFromEnv) {
    partial.ui = uiFromEnv;
  }

  return partial;
}

function loadUiFromEnv(): Record<string, unknown> | undefined {
  const uiColor = process.env.AGENTSY_UI_COLOR;
  const uiReduce = process.env.AGENTSY_UI_REDUCE_MOTION;
  if (!(uiColor || uiReduce)) {
    return;
  }

  const ui: Record<string, unknown> = {};
  if (uiColor === 'auto' || uiColor === 'light' || uiColor === 'dark') {
    ui.colorScheme = uiColor;
  }
  if (uiReduce === 'true') {
    ui.reduceMotion = true;
  } else if (uiReduce === 'false') {
    ui.reduceMotion = false;
  }

  return ui;
}

// =============================================================================
// File loading
// =============================================================================

/**
 * Load and parse a config JSON file. Returns an empty object if the file
 * does not exist or cannot be parsed.
 */
export async function loadFromFile(filePath: string): Promise<Record<string, unknown>> {
  if (!existsSync(filePath)) {
    return {};
  }

  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    const result = ConfigSchema.partial().safeParse(parsed);
    if (!result.success) {
      console.warn(`[config] Warning: Invalid config in ${filePath}:`, result.error.issues);
      return {};
    }
    return result.data as Record<string, unknown>;
  } catch {
    return {};
  }
}

// =============================================================================
// Deep merge
// =============================================================================

/**
 * Deep-merge multiple config objects. Later sources override earlier ones.
 * Arrays are replaced, not merged (provider lists should be fully specified
 * at each layer).
 */
export function deepMerge(...sources: Record<string, unknown>[]): Config {
  const result: Record<string, unknown> = {};

  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      if (value === undefined) {
        continue;
      }

      const existing = result[key];
      if (isPlainObject(value) && isPlainObject(existing)) {
        result[key] = { ...existing, ...value };
      } else {
        result[key] = value;
      }
    }
  }

  return ConfigSchema.parse(result);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// =============================================================================
// Layered load
// =============================================================================

/**
 * Load the full config with layered precedence:
 * 1. Built-in defaults (lowest)
 * 2. User config (~/.config/agentsy/config.json)
 * 3. Project config (.agentsy/config.json in projectDir)
 * 4. Environment variables (AGENTSY_*) (highest)
 *
 * @param projectDir - Project root directory for project-level config discovery.
 *                     Defaults to process.cwd().
 */
export async function loadConfig(projectDir?: string): Promise<Config> {
  const projectRoot = projectDir ?? process.cwd();

  const [userFile, projectFile] = await Promise.all([
    loadFromFile(userConfigPath()),
    loadFromFile(projectConfigPath(projectRoot))
  ]);

  const env = loadFromEnv();

  return deepMerge(DEFAULT_CONFIG as Record<string, unknown>, userFile, projectFile, env);
}
