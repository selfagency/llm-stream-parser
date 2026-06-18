#!/usr/bin/env zx

process.env.HUSKY = '0';

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { $, argv, cd } from 'zx';

import { getPackageReleaseState, readReleaseState, writeReleaseState } from './release-state.js';
import { parseVersionArg, ROOT, safeRead, safeWrite } from './release-utils.js';

$.verbose = false;

cd(ROOT);

const RELEASE_STATE_PATH = resolve(ROOT, 'config', 'release-state.json');

const packageArg = argv._[0];
const version = parseVersionArg(typeof argv._[1] === 'string' ? argv._[1] : undefined);
const isDryRun = Boolean(argv['dry-run'] ?? argv.dryRun);
const confirm = Boolean(argv['yes-i-know-this-is-first-publish']);
const force = Boolean(argv.force);
const explicitTag = typeof argv.tag === 'string' ? argv.tag : undefined;
const otp = typeof argv.otp === 'string' || typeof argv.otp === 'number' ? String(argv.otp) : undefined;

if (!(packageArg && version)) {
  console.error(
    'Usage: pnpm bootstrap-release <package-name> <version> [--tag latest|prerelease] [--otp=<code>] [--dry-run] --yes-i-know-this-is-first-publish'
  );
  process.exit(1);
}

if (!confirm) {
  console.error(
    '❌ Refusing to bootstrap publish without explicit confirmation flag: --yes-i-know-this-is-first-publish'
  );
  process.exit(1);
}

const normalizedPackageName = packageArg.includes('/') ? packageArg : `@agentsy/${packageArg}`;
const pkgShortName = normalizedPackageName.replace(/^@[^/]+\//, '');
const pkgDir = resolve(ROOT, 'packages', pkgShortName);
const pkgJsonPath = resolve(pkgDir, 'package.json');

if (!(existsSync(pkgDir) && existsSync(pkgJsonPath))) {
  console.error(`❌ Package not found at packages/${pkgShortName}`);
  process.exit(1);
}

const pkgJson = JSON.parse(safeRead(pkgJsonPath, 'utf-8')) as { name: string; version: string };
const fullPackageName = pkgJson.name;

if (typeof fullPackageName !== 'string' || fullPackageName.length === 0) {
  console.error('❌ package.json is missing a valid name field');
  process.exit(1);
}

const releaseState = readReleaseState(RELEASE_STATE_PATH);
const currentState = getPackageReleaseState(releaseState, fullPackageName);

if (currentState === 'oidc-ready' && !force) {
  console.error(`❌ ${fullPackageName} is already marked oidc-ready.`);
  console.error('   Use --force only if you intentionally need another local bootstrap publish.');
  process.exit(1);
}

const distTag = explicitTag ?? (version.includes('-') ? 'prerelease' : 'latest');

async function checkNpmCredentials() {
  const npmToken = process.env.NPM_TOKEN ?? process.env.NODE_AUTH_TOKEN;
  if (npmToken) {
    await $`npm config set //registry.npmjs.org/:_authToken ${npmToken}`;
  }
  try {
    await $`npm whoami --registry=https://registry.npmjs.org/`;
  } catch {
    console.error('❌ npm authentication required. Run npm login first.');
    process.exit(1);
  }
}

async function main() {
  await checkNpmCredentials();

  // Require clean working tree and main branch to avoid shipping dirty or branch content.
  const dirty = (await $`git status --porcelain`).stdout.trim();
  if (dirty) {
    console.error('❌ Working tree is not clean. Commit or stash changes first.');
    process.exit(1);
  }

  const branch = (await $`git rev-parse --abbrev-ref HEAD`).stdout.trim();
  if (branch !== 'main') {
    console.error(`❌ Must run from 'main'. Current branch: ${branch}`);
    process.exit(1);
  }

  console.log('🔄 Fetching latest refs...');
  await $`git fetch origin main`;
  await $`git pull --ff-only origin main`;

  console.log(`📦 Bootstrap publishing ${fullPackageName}@${version} (state: ${currentState})`);

  if (isDryRun) {
    console.log(
      '[dry-run] Would run package build, write dist package.json, publish once locally, and mark oidc-ready.'
    );
    return;
  }

  // Keep version in package metadata aligned for first publish.
  pkgJson.version = version;
  safeWrite(pkgJsonPath, `${JSON.stringify(pkgJson, null, 2)}\n`);

  // Keep workspace lockfile in sync with package version metadata so CI
  // frozen-lockfile installs remain consistent after bootstrap updates.
  await $`pnpm install --lockfile-only`;

  await $`pnpm --filter ${fullPackageName} build`;
  const packagePath = `packages/${pkgShortName}`;
  const distPath = `${packagePath}/dist`;
  await $`pnpm dlx tsx packages/scripts/src/write-dist-package.ts ${packagePath}`;
  const publishArgs = ['publish', distPath, '--access', 'public', `--tag=${distTag}`];
  if (otp) {
    publishArgs.push(`--otp=${otp}`);
  }
  await $({ stdio: 'inherit' })`npm ${publishArgs}`;

  releaseState.packages[fullPackageName] = 'oidc-ready';
  writeReleaseState(RELEASE_STATE_PATH, releaseState);

  console.log('✅ Bootstrap publish complete.');
  console.log('Next steps:');
  console.log(`  1) On npmjs.com, open package settings for ${fullPackageName}.`);
  console.log('  2) Configure Trusted Publisher: GitHub Actions.');
  console.log('  3) Ensure workflow filename is exactly: release.yml');
  console.log('  4) Confirm repo and org/user fields match exactly (case-sensitive).');
  console.log('  5) Commit updated package.json + pnpm-lock.yaml + config/release-state.json, then push to main.');
  console.log('  6) (Recommended) set Publishing access to disallow tokens after verification.');
  console.log('  7) Once trusted publisher is configured, update config/release-state.json:');
  console.log(`     Set "${fullPackageName}": "oidc-ready"`);
  console.log('     Then commit and push the change to main.');
}

await main();
