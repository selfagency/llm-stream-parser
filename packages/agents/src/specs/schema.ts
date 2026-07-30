import { AtlasManifestSchema } from '@agentsy/atlas';
import { z } from 'zod';

/**
 * Zod schema for agent layer definition
 */
export const AgentLayerSchema = z
  .object({
    role: z.string(),
    goal: z.string(),
    tokenBudget: z.number().int().positive(),
    skills: z.array(z.string()),
    model: z.string().optional(),
    dependsOn: z.array(z.string()).optional(),
    execution: z.enum(['sequential', 'parallel']).optional()
  })
  .passthrough();

/**
 * Zod schema for skill metadata
 */
export const SkillMetadataSchema = z
  .object({
    name: z.string(),
    cost: z.string().regex(/^\d+-\d+$/),
    latency: z.string().regex(/^\d+-\d+$/),
    confidence: z.number().min(0).max(1),
    applicableTo: z.array(z.string()),
    model: z.string().optional()
  })
  .passthrough();

/**
 * Zod schema for agent hooks
 */
export const AgentHooksSchema = z
  .object({
    preInit: z.array(z.string()).optional(),
    postInit: z.array(z.string()).optional(),
    preTurn: z.array(z.string()).optional(),
    skillSelection: z.array(z.string()).optional(),
    preSkill: z.array(z.string()).optional(),
    postSkill: z.array(z.string()).optional(),
    postTurn: z.array(z.string()).optional(),
    onError: z.array(z.string()).optional(),
    onRetry: z.array(z.string()).optional(),
    preCleanup: z.array(z.string()).optional(),
    postCleanup: z.array(z.string()).optional(),
    layerTransition: z.array(z.string()).optional(),
    stepExecute: z.array(z.string()).optional(),
    stepTransition: z.array(z.string()).optional()
  })
  .passthrough();

export const ToolFilterSchema = z
  .object({
    allow: z.array(z.string()).optional(),
    deny: z.array(z.string()).optional()
  })
  .passthrough();

/**
 * Zod schema for agent specification
 */
export const AgentSpecSchema = z
  .object({
    name: z.string(),
    role: z.string(),
    description: z.string(),
    atlas: AtlasManifestSchema.optional(),
    layers: z.array(AgentLayerSchema).optional(),
    constraints: z.array(z.string()).optional(),
    hooks: AgentHooksSchema.optional(),
    skillRegistry: z.array(SkillMetadataSchema).optional(),
    orchestrator: z.enum(['sequential', 'parallel', 'sisyphus']).optional(),
    tokenBudget: z.number().int().positive().optional(),
    tools: ToolFilterSchema.optional()
  })
  .passthrough();

/**
 * Type guard to validate if an object is an AgentSpec
 */
export function isAgentSpec(value: unknown): value is import('./types.js').AgentSpec {
  return AgentSpecSchema.safeParse(value).success;
}
