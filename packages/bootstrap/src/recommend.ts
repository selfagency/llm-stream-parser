/**
 * Recommendation Engine — suggests components based on project profile.
 *
 * @module
 */

import type { AgentsyConfig, RecommendationEntry } from './config.js';
import type { ProjectProfile } from './scanner.js';

export function recommend(profile: ProjectProfile, _installed: AgentsyConfig['installed']): RecommendationEntry[] {
  const recs: RecommendationEntry[] = [];

  // PostgreSQL → postgres MCP
  if (hasFramework(profile, 'prisma') || hasFramework(profile, 'drizzle')) {
    recs.push({
      componentType: 'mcp-server',
      componentId: 'io.modelcontextprotocol.postgres',
      reason: 'Detected PostgreSQL ORM (Prisma/Drizzle) in project',
      confidence: 0.9,
      installCommand: 'agentsy install mcp io.modelcontextprotocol.postgres'
    });
  }

  // Next.js → nextjs skill
  if (hasFramework(profile, 'next.js')) {
    recs.push({
      componentType: 'skill',
      componentId: 'nextjs-app-router',
      reason: 'Detected Next.js — App Router skill helps with route handlers, server components, and data fetching',
      confidence: 0.8,
      installCommand: 'agentsy install skill nextjs-app-router'
    });
  }

  // React → react skill
  if (hasFramework(profile, 'react')) {
    recs.push({
      componentType: 'skill',
      componentId: 'react-patterns',
      reason: 'Detected React — component patterns skill covers hooks, state management, and performance patterns',
      confidence: 0.7,
      installCommand: 'agentsy install skill react-patterns'
    });
  }

  // Astro → astro skill
  if (hasFramework(profile, 'astro')) {
    recs.push({
      componentType: 'skill',
      componentId: 'astro-islands',
      reason: 'Detected Astro — islands architecture skill helps with partial hydration and content collections',
      confidence: 0.8,
      installCommand: 'agentsy install skill astro-islands'
    });
  }

  // Python → guardrails (PII scanner is extra important for Python projects)
  for (const lang of profile.languages) {
    if (lang === 'python') {
      recs.push({
        componentType: 'guardrail',
        componentId: 'builtin:pii',
        reason: 'Python projects often handle data — PII guardrail ensures no sensitive data leaks',
        confidence: 0.7,
        installCommand: 'agentsy install guardrail builtin:pii'
      });
      break;
    }
  }

  return recs;
}

function hasFramework(profile: ProjectProfile, name: string): boolean {
  return profile.frameworks?.some(f => f === name) ?? false;
}
