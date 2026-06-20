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

interface FileChecks {
  hasAstroConfig: boolean;
  hasCargoToml: boolean;
  hasDockerfile: boolean;
  hasGoMod: boolean;
  hasNextConfig: boolean;
  hasPackageJson: boolean;
  hasPnpmWorkspace: boolean;
  hasSvelteConfig: boolean;
  hasTailwindConfig: boolean;
  hasTurboJson: boolean;
  hasViteConfig: boolean;
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

// ── File checks ─────────────────────────────────────────

async function checkFiles(projectDir: string): Promise<FileChecks> {
  const [
    hasPnpmWorkspace,
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

  return {
    hasPnpmWorkspace,
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
  };
}

// ── Framework detection ─────────────────────────────────

function detectFramework(checks: FileChecks): string {
  if (checks.hasNextConfig) {
    return 'nextjs';
  }
  if (checks.hasSvelteConfig) {
    return 'sveltekit';
  }
  if (checks.hasAstroConfig) {
    return 'astro';
  }
  if (checks.hasViteConfig) {
    return 'vite';
  }
  if (checks.hasPackageJson) {
    return 'node';
  }
  if (checks.hasGoMod) {
    return 'go';
  }
  if (checks.hasCargoToml) {
    return 'rust';
  }
  return 'unknown';
}

function detectPackageManager(checks: FileChecks): string | undefined {
  if (checks.hasPnpmWorkspace) {
    return 'pnpm';
  }
  if (checks.hasPackageJson) {
    return 'npm';
  }
}

// ── Skill recommendations ──────────────────────────────

function collectLanguages(checks: FileChecks): string[] {
  const languages: string[] = [];
  if (checks.hasPackageJson || checks.hasPnpmWorkspace) {
    languages.push('typescript', 'javascript');
  }
  if (checks.hasGoMod) {
    languages.push('go');
  }
  if (checks.hasCargoToml) {
    languages.push('rust');
  }
  return languages;
}

function collectSkills(checks: FileChecks): string[] {
  const skills: string[] = [];

  if (checks.hasPackageJson || checks.hasPnpmWorkspace) {
    skills.push('typescript', 'testing', 'code-quality');
  }
  if (checks.hasPnpmWorkspace || checks.hasTurboJson) {
    skills.push('pnpm', 'turborepo');
  }
  if (checks.hasViteConfig) {
    skills.push('vite');
  }
  if (checks.hasNextConfig) {
    skills.push('nextjs');
  }
  if (checks.hasSvelteConfig) {
    skills.push('sveltekit');
  }
  if (checks.hasAstroConfig) {
    skills.push('astro');
  }
  if (checks.hasTailwindConfig) {
    skills.push('tailwind-css');
  }
  if (checks.hasDockerfile) {
    skills.push('docker');
  }
  if (checks.hasGoMod) {
    skills.push('go-development');
  }
  if (checks.hasCargoToml) {
    skills.push('rust-development');
  }

  return skills;
}

// ── Detector ────────────────────────────────────────────

/**
 * Detect project stack and return recommended skill IDs.
 */
export async function detectStack(projectDir: string): Promise<StackProfile> {
  const checks = await checkFiles(projectDir);
  const pm = detectPackageManager(checks);

  return {
    framework: detectFramework(checks),
    languages: collectLanguages(checks),
    ...(pm ? { packageManager: pm } : {}),
    recommendedSkills: collectSkills(checks)
  };
}
