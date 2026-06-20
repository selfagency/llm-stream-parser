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

// ── File check helpers ────────────────────────────────

async function fileExists(...parts: string[]): Promise<boolean> {
  try {
    await access(join(...parts));
    return true;
  } catch {
    return false;
  }
}

function anyFile(...paths: string[][]): Promise<boolean> {
  return Promise.all(paths.map(p => fileExists(...p))).then(results => results.some(Boolean));
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
    anyFile([projectDir, 'vite.config.ts'], [projectDir, 'vite.config.js']),
    anyFile([projectDir, 'next.config.ts'], [projectDir, 'next.config.js'], [projectDir, 'next.config.mjs']),
    anyFile([projectDir, 'svelte.config.js'], [projectDir, 'svelte.config.ts']),
    anyFile([projectDir, 'astro.config.mjs'], [projectDir, 'astro.config.ts']),
    anyFile([projectDir, 'tailwind.config.ts'], [projectDir, 'tailwind.config.js']),
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

interface SkillRule {
  readonly condition: (c: FileChecks) => boolean;
  readonly skills: readonly string[];
}

const SKILL_RULES: readonly SkillRule[] = [
  { condition: c => c.hasPackageJson || c.hasPnpmWorkspace, skills: ['typescript', 'testing', 'code-quality'] },
  { condition: c => c.hasPnpmWorkspace || c.hasTurboJson, skills: ['pnpm', 'turborepo'] },
  { condition: c => c.hasViteConfig, skills: ['vite'] },
  { condition: c => c.hasNextConfig, skills: ['nextjs'] },
  { condition: c => c.hasSvelteConfig, skills: ['sveltekit'] },
  { condition: c => c.hasAstroConfig, skills: ['astro'] },
  { condition: c => c.hasTailwindConfig, skills: ['tailwind-css'] },
  { condition: c => c.hasDockerfile, skills: ['docker'] },
  { condition: c => c.hasGoMod, skills: ['go-development'] },
  { condition: c => c.hasCargoToml, skills: ['rust-development'] }
];

function collectSkills(checks: FileChecks): string[] {
  return SKILL_RULES.flatMap(rule => (rule.condition(checks) ? rule.skills : []));
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
