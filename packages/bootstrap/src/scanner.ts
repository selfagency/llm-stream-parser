/**
 * Project Scanner — detects project profile from a working directory.
 *
 * @module
 */

import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

// ── Types ───────────────────────────────────────────────

export type Language = 'typescript' | 'javascript' | 'python' | 'rust' | 'go' | 'elixir' | 'other';

export type Framework =
  | 'next.js'
  | 'react'
  | 'vue'
  | 'svelte'
  | 'astro'
  | 'express'
  | 'fastify'
  | 'hono'
  | 'django'
  | 'flask'
  | 'spring'
  | 'other';

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'pip' | 'poetry' | 'cargo' | 'go' | 'mix' | 'other';

export interface ProjectProfile {
  readonly buildSystem: string;
  readonly ci: string[];
  readonly deploymentTarget: string[];
  readonly detectedAt: string;
  readonly frameworks: Framework[];
  readonly languages: Language[];
  readonly linter: string[];
  readonly monorepo: boolean;
  readonly monorepoTool?: 'pnpm' | 'nx' | 'turbo' | 'lerna' | 'bazel';
  readonly packageManager: PackageManager;
  readonly rootPath: string;
  readonly testRunner: string[];
}

// ── Sentinel file detection ─────────────────────────────

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ── Framework, lint, test, CI detection maps ────────────

const FRAMEWORK_DEPS: [string, Framework][] = [
  ['next', 'next.js'],
  ['react', 'react'],
  ['react-dom', 'react'],
  ['vue', 'vue'],
  ['svelte', 'svelte'],
  ['astro', 'astro'],
  ['@astrojs/check', 'astro'],
  ['express', 'express'],
  ['fastify', 'fastify'],
  ['hono', 'hono']
];

const LINTER_DEPS: Record<string, string> = {
  eslint: 'eslint',
  biome: 'biome',
  '@biomejs/biome': 'biome',
  oxlint: 'oxlint',
  prettier: 'prettier'
};

const TEST_DEPS: [string, string][] = [
  ['vitest', 'vitest'],
  ['jest', 'jest'],
  ['mocha', 'mocha'],
  ['ava', 'ava'],
  ['playwright', 'playwright'],
  ['cypress', 'cypress']
];

const BUILD_FROM_SCRIPTS: [string, string][] = [
  ['next', 'next'],
  ['tsup', 'tsup'],
  ['rollup', 'rollup'],
  ['webpack', 'webpack'],
  ['vite', 'vite'],
  ['esbuild', 'esbuild']
];

function mergeDeps(pkgJson: Record<string, unknown>): Record<string, string> {
  return {
    ...(pkgJson.dependencies as Record<string, string> | undefined),
    ...(pkgJson.devDependencies as Record<string, string> | undefined)
  };
}

function detectFrameworks(deps: Record<string, string>, frameworks: Framework[]): void {
  for (const [key, fw] of FRAMEWORK_DEPS) {
    if (deps[key] && !frameworks.includes(fw)) {
      frameworks.push(fw);
    }
  }
}

function detectLinters(deps: Record<string, string>, linter: string[]): void {
  for (const [key, name] of Object.entries(LINTER_DEPS)) {
    if (deps[key] && !linter.includes(name)) {
      linter.push(name);
    }
  }
}

function detectTestRunners(deps: Record<string, string>, testRunner: string[]): void {
  for (const [key, name] of TEST_DEPS) {
    if (deps[key]) {
      testRunner.push(name);
    }
  }
}

function detectBuildSystem(
  pkgJson: Record<string, unknown>,
  deps: Record<string, string>,
  frameworks: Framework[]
): string {
  const scripts = pkgJson.scripts as Record<string, string> | undefined;
  if (!scripts) {
    return 'node';
  }
  for (const [scriptKey, system] of BUILD_FROM_SCRIPTS) {
    if (scripts[scriptKey] || deps[scriptKey]) {
      if (system === 'next') {
        frameworks.push('next.js');
      }
      return system;
    }
  }
  return 'node';
}

async function detectCI(rootPath: string, ci: string[]): Promise<void> {
  if (await exists(join(rootPath, '.github/workflows'))) {
    ci.push('github-actions');
  }
  if (await exists(join(rootPath, '.gitlab-ci.yml'))) {
    ci.push('gitlab-ci');
  }
  if (await exists(join(rootPath, '.circleci'))) {
    ci.push('circleci');
  }
}

function detectDeploymentTargets(deps: Record<string, string>, targets: string[]): void {
  if (deps.vercel || deps['@vercel/analytics']) {
    targets.push('vercel');
  }
  if (deps['@netlify/functions']) {
    targets.push('netlify');
  }
  if (deps.aws || deps['@aws-sdk/client-lambda']) {
    targets.push('aws');
  }
}

async function detectMonorepo(
  rootPath: string,
  pkgJson: Record<string, unknown>
): Promise<{ enabled: boolean; tool?: ProjectProfile['monorepoTool'] }> {
  if (await exists(join(rootPath, 'pnpm-workspace.yaml'))) {
    return { enabled: true, tool: 'pnpm' };
  }
  if (await exists(join(rootPath, 'nx.json'))) {
    return { enabled: true, tool: 'nx' };
  }
  if (pkgJson.workspaces) {
    return { enabled: true, tool: 'pnpm' };
  }
  return { enabled: false };
}

async function detectPackageManager(rootPath: string): Promise<PackageManager> {
  if (await exists(join(rootPath, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (await exists(join(rootPath, 'yarn.lock'))) {
    return 'yarn';
  }
  if (await exists(join(rootPath, 'package-lock.json'))) {
    return 'npm';
  }
  return 'other';
}

// ── Scanner ─────────────────────────────────────────────

export async function scanProject(rootPath: string): Promise<ProjectProfile> {
  const languages: Language[] = [];
  const frameworks: Framework[] = [];
  const linter: string[] = [];
  const testRunner: string[] = [];
  const ci: string[] = [];
  const deploymentTarget: string[] = [];

  const pkgJson = await readJson(join(rootPath, 'package.json'));
  if (!pkgJson) {
    return {
      rootPath,
      languages,
      frameworks,
      packageManager: 'other',
      buildSystem: 'node',
      linter,
      testRunner,
      monorepo: false,
      ci,
      deploymentTarget,
      detectedAt: new Date().toISOString()
    };
  }

  languages.push('typescript', 'javascript');
  const packageManager = await detectPackageManager(rootPath);
  const { enabled: monorepo, tool: monorepoTool } = await detectMonorepo(rootPath, pkgJson);
  const deps = mergeDeps(pkgJson);

  detectFrameworks(deps, frameworks);
  detectLinters(deps, linter);
  detectTestRunners(deps, testRunner);
  const buildSystem = detectBuildSystem(pkgJson, deps, frameworks);
  await detectCI(rootPath, ci);
  detectDeploymentTargets(deps, deploymentTarget);

  return {
    rootPath,
    languages,
    frameworks,
    packageManager,
    buildSystem,
    linter,
    testRunner,
    monorepo,
    monorepoTool,
    ci,
    deploymentTarget,
    detectedAt: new Date().toISOString()
  };
}
