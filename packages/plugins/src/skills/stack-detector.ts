/**
 * StackDetector — detects project stack from local files and recommends skills.
 *
 * Scans project root for config files to determine the tech stack,
 * then returns recommended skill IDs.
 *
 * @module @agentsy/plugins/skills
 */

import { access } from 'node:fs/promises';
import { join } from 'node:path';

// ── Types ───────────────────────────────────────────────

export interface StackProfile {
  readonly framework: string;
  readonly languages: readonly string[];
  readonly packageManager?: string;
  readonly recommendedSkills: readonly string[];
}

// ── File check helper ──────────────────────────────────

async function fileExists(...parts: string[]): Promise<boolean> {
  try {
    await access(join(...parts));
    return true;
  } catch {
    return false;
  }
}

// ── Detector ────────────────────────────────────────────

/**
 * Detect project stack and return recommended skill IDs.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: 9 framework detections in one function — splitting would duplicate file-check logic
export async function detectStack(projectDir: string): Promise<StackProfile> {
  const [
    hasPnpmWorkspace,
    _hasTsconfig,
    hasViteConfig,
    hasNextConfig,
    hasSvelteConfig,
    hasAstroConfig,
    hasTailwindConfig,
    hasTurboJson,
    hasDockerfile,
    hasGoMod,
    hasCargoToml,
    hasPackageJson
  ] = await Promise.all([
    fileExists(projectDir, 'pnpm-workspace.yaml'),
    fileExists(projectDir, 'tsconfig.json'),
    fileExists(projectDir, 'vite.config.ts') || fileExists(projectDir, 'vite.config.js'),
    fileExists(projectDir, 'next.config.ts') ||
      fileExists(projectDir, 'next.config.js') ||
      fileExists(projectDir, 'next.config.mjs'),
    fileExists(projectDir, 'svelte.config.js') || fileExists(projectDir, 'svelte.config.ts'),
    fileExists(projectDir, 'astro.config.mjs') || fileExists(projectDir, 'astro.config.ts'),
    fileExists(projectDir, 'tailwind.config.ts') || fileExists(projectDir, 'tailwind.config.js'),
    fileExists(projectDir, 'turbo.json'),
    fileExists(projectDir, 'Dockerfile'),
    fileExists(projectDir, 'go.mod'),
    fileExists(projectDir, 'Cargo.toml'),
    fileExists(projectDir, 'package.json')
  ]);

  const languages: string[] = [];
  const recommendedSkills: string[] = [];

  if (hasPackageJson || hasPnpmWorkspace) {
    languages.push('typescript', 'javascript');
    recommendedSkills.push('typescript', 'testing', 'code-quality');
  }

  if (hasPnpmWorkspace || hasTurboJson) {
    recommendedSkills.push('pnpm', 'turborepo');
  }

  if (hasViteConfig) {
    recommendedSkills.push('vite');
  }

  if (hasNextConfig) {
    recommendedSkills.push('nextjs');
  }

  if (hasSvelteConfig) {
    recommendedSkills.push('sveltekit');
  }

  if (hasAstroConfig) {
    recommendedSkills.push('astro');
  }

  if (hasTailwindConfig) {
    recommendedSkills.push('tailwind-css');
  }

  if (hasDockerfile) {
    recommendedSkills.push('docker');
  }

  if (hasGoMod) {
    languages.push('go');
    recommendedSkills.push('go-development');
  }

  if (hasCargoToml) {
    languages.push('rust');
    recommendedSkills.push('rust-development');
  }

  let framework = 'unknown';
  if (hasNextConfig) {
    framework = 'nextjs';
  } else if (hasSvelteConfig) {
    framework = 'sveltekit';
  } else if (hasAstroConfig) {
    framework = 'astro';
  } else if (hasViteConfig) {
    framework = 'vite';
  } else if (hasPackageJson) {
    framework = 'node';
  } else if (hasGoMod) {
    framework = 'go';
  } else if (hasCargoToml) {
    framework = 'rust';
  }

  let packageManager: string | undefined;
  if (hasPnpmWorkspace) {
    packageManager = 'pnpm';
  } else if (hasPackageJson) {
    packageManager = 'npm';
  }

  return {
    framework,
    languages,
    ...(packageManager ? { packageManager } : {}),
    recommendedSkills
  };
}
