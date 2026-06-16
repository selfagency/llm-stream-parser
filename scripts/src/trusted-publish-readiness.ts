import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs as parseNodeArgs } from 'node:util';

import { getPackageReleaseState, readReleaseState } from './release-state.js';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');

/** @param {unknown} repository */
export function getRepositoryField(repository: unknown): string {
  if (typeof repository === 'string') {
    return repository;
  }

  if (repository && typeof repository === 'object' && 'url' in repository && typeof repository.url === 'string') {
    return repository.url;
  }

  return '';
}

/** @param {string} value */
export function normalizeRepositoryValue(value: string): string {
  return String(value)
    .replace(/^git\+/, '')
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/^git@github\.com:/i, '')
    .replace(/\.git$/i, '')
    .trim();
}

/**
 * @param {string} pkgRepoValue
 * @param {string} expectedRepo
 * @returns {{ok: true} | {ok: false, error: string}}
 */
export function validateRepositoryMatch(
  pkgRepoValue: string,
  expectedRepo: string
): { ok: true } | { ok: false; error: string } {
  const normalizedPkgRepo = normalizeRepositoryValue(pkgRepoValue);
  const normalizedExpectedRepo = normalizeRepositoryValue(expectedRepo);

  if (normalizedPkgRepo !== normalizedExpectedRepo) {
    return {
      error:
        `Release blocked: package repository.url must match '${normalizedExpectedRepo}' for npm trusted publishing. ` +
        `Current value resolves to '${normalizedPkgRepo || '(empty)'}'.`,
      ok: false
    };
  }

  return { ok: true };
}

/**
 * @param {{
 *   packageName: string,
 *   packageDir: string,
 *   expectedRepo: string,
 *   releaseStatePath: string,
 *   expectedState?: string,
 *   workflowFilename?: string,
 *   rootDir?: string,
 * }} input
 * @returns {{ok: true} | {ok: false, error: string}}
 */
export function checkTrustedPublishReadiness(input: {
  packageName: string;
  packageDir: string;
  expectedRepo: string;
  releaseStatePath: string;
  expectedState?: string;
  workflowFilename?: string;
  rootDir?: string;
}): { ok: true } | { ok: false; error: string } {
  const expectedState = input.expectedState ?? 'oidc-ready';
  const workflowFilename = input.workflowFilename ?? 'release.yml';

  const state = readReleaseState(input.releaseStatePath);
  const packageState = getPackageReleaseState(state, input.packageName);
  if (packageState !== expectedState) {
    return {
      error:
        `Release blocked: ${input.packageName} is '${packageState}', not '${expectedState}'. ` +
        'Bootstrap publish once locally, configure npm trusted publisher, then update config/release-state.json.',
      ok: false
    };
  }

  const pkgJsonPath = resolve(input.packageDir, 'package.json');
  if (!existsSync(pkgJsonPath)) {
    return {
      error: `Release blocked: package.json not found at ${pkgJsonPath}`,
      ok: false
    };
  }

  const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as {
    repository?: unknown;
  };
  const repoCheck = validateRepositoryMatch(getRepositoryField(pkg.repository), input.expectedRepo);
  if (!repoCheck.ok) {
    return repoCheck;
  }

  const workflowPath = resolve(input.rootDir ?? ROOT, '.github', 'workflows', workflowFilename);
  if (!existsSync(workflowPath)) {
    return {
      error: `Release blocked: workflow file '.github/workflows/${workflowFilename}' does not exist.`,
      ok: false
    };
  }

  return { ok: true };
}

if (typeof process.argv[1] === 'string' && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const { values: args } = parseNodeArgs({
    allowPositionals: false,
    options: {
      'expected-repo': { type: 'string' },
      'expected-state': { type: 'string' },
      'package-dir': { type: 'string' },
      'package-name': { type: 'string' },
      'release-state-path': { type: 'string' },
      'root-dir': { type: 'string' },
      'workflow-filename': { type: 'string' }
    }
  });

  const packageName = args['package-name'];
  const packageDir = args['package-dir'];
  const expectedRepo = args['expected-repo'];
  const releaseStatePath = args['release-state-path'] ?? resolve(ROOT, 'config', 'release-state.json');
  const workflowFilename = args['workflow-filename'] ?? 'release.yml';
  const expectedState = args['expected-state'] ?? 'oidc-ready';

  if (!(packageName && packageDir && expectedRepo)) {
    console.error(
      'Usage: node scripts/trusted-publish-readiness.js --package-name <name> --package-dir <dir> --expected-repo <owner/repo> [--release-state-path <path>] [--workflow-filename release.yml] [--expected-state oidc-ready]'
    );
    process.exit(1);
  }

  const result = checkTrustedPublishReadiness({
    expectedRepo,
    expectedState,
    packageDir: resolve(packageDir),
    packageName,
    releaseStatePath: resolve(releaseStatePath),
    workflowFilename,
    ...(args['root-dir'] === undefined ? {} : { rootDir: resolve(args['root-dir']) })
  });

  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }

  console.log(`✅ Trusted publishing readiness checks passed for ${packageName}.`);
}
