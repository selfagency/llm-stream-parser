#!/usr/bin/env zx
/**
 * Per-package release orchestrator for monorepo.
 *
 * Usage: pnpm release <package-name> <version> [--dry-run]
 *        pnpm release --package @agentsy/vscode --version 0.2.0 [--dry-run]
 *
 * Examples:
 *   pnpm release @agentsy/vscode 0.2.0
 *   pnpm release @agentsy/vscode 0.1.5 --dry-run
 *   pnpm release --package @agentsy/vscode --version 0.2.0
 *
 * Flow:
 *   1.  Parse package name and version arguments.
 *   2.  Validate version format and resolve package directory.
 * 3.  Validate prerequisites (git clean, on main, npm auth, GitHub token).
 *   4.  Generate release notes via GitHub API.
 *   5.  Update package.json and CHANGELOG.md for that package.
 *   6.  Commit and push to main.
 *   7.  Wait for "Test & Build" workflow to pass.
 *   8.  Create annotated tag: @scope/package@version
 *   Push tag to origin (triggers Release workflow).
 *   11. Done (npm publish handled by GitHub Actions).
 *
 * Rollback on failure:
 *   - Deletes remote tag if pushed.
 *   - Reverts or resets commits as appropriate.
 */

// Disable husky to avoid pre-push hooks during release.
process.env.HUSKY = '0';

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

import { Octokit } from '@octokit/rest';
import ora from 'ora';
import { $, argv, cd, sleep } from 'zx';

import { createGitHelpers } from './release-git.js';
import type { ReleaseNotesOptions } from './release-shared.js';
import {
  checkNpmCredentials,
  createRollbackManager,
  ensureCleanMainBranch,
  ensureLocalTagAvailability,
  ensureRemoteTagAvailability,
  resolveGithubToken,
  resolveOwnerRepoFromOrigin,
  syncMainBranch,
  updateChangelogFile,
  waitForLatestSuccessfulWorkflow,
  waitForWorkflow
} from './release-shared.js';
import { getPackageReleaseState, readReleaseState } from './release-state.ts';
import { parseVersionArg, ROOT, safeRead, safeWrite } from './release-utils.js';
import { getRepositoryField, validateRepositoryMatch } from './trusted-publish-readiness.js';

$.verbose = false;

const RELEASE_STATE_PATH = resolve(ROOT, 'config', 'release-state.json');
cd(ROOT);

const packageName = resolvePackageName(argv);
const versionArg = typeof argv._[1] === 'string' ? argv._[1] : undefined;
const version = parseVersionArg(versionArg ?? (typeof argv.version === 'string' ? argv.version : undefined));
const isDryRun = Boolean(argv['dry-run'] ?? argv.dryRun);

function resolvePackageName(argv: Record<string, unknown>): string | null {
  const positionalArgs = argv._ as unknown[];
  if (typeof positionalArgs[0] === 'string') {
    return positionalArgs[0];
  }
  return typeof argv.package === 'string' ? argv.package : null;
}

if (!packageName) {
  console.error('Usage: pnpm release <package-name> <version> [--dry-run]');
  console.error('');
  console.error('Examples:');
  console.error('  pnpm release @agentsy/vscode 0.2.0');
  console.error('  pnpm release @agentsy/vscode 0.1.5 --dry-run');
  process.exit(1);
}

// Normalize short names (e.g., "vscode" -> "@agentsy/vscode")
const normalizedPackageName = packageName.includes('/') ? packageName : `@agentsy/${packageName}`;

const pkgShortName = normalizedPackageName.replace(/^@[^/]+\//, '');
const pkgDir = resolve(ROOT, 'packages', pkgShortName);
const pkgJsonPath = resolve(pkgDir, 'package.json');

if (!existsSync(pkgDir)) {
  console.error(`❌ Package directory not found: ${pkgDir}`);
  console.error('   Available packages include: @agentsy/vscode and other @agentsy/* workspace packages');
  process.exit(1);
}

if (!existsSync(pkgJsonPath)) {
  console.error(`❌ package.json not found at: ${pkgJsonPath}`);
  process.exit(1);
}

// Load actual package name from package.json (needed for tag construction below)
const pkgJson = JSON.parse(safeRead(pkgJsonPath, 'utf-8')) as { name: string };
const fullPackageName = pkgJson.name;

const releaseState = readReleaseState(RELEASE_STATE_PATH);
const packageReleaseState = getPackageReleaseState(releaseState, fullPackageName);

if (packageReleaseState !== 'oidc-ready') {
  console.error(`❌ ${fullPackageName} is '${packageReleaseState}', not 'oidc-ready'.`);
  console.error('   This package must be bootstrap-published locally once before CI OIDC publishing is allowed.');
  console.error(`   Run: pnpm bootstrap-release ${fullPackageName} ${version} --yes-i-know-this-is-first-publish`);
  process.exit(1);
}

const tag = `${fullPackageName}@${version}`;

const { resolveGitExecutable, runGit, setGitCommand } = createGitHelpers(ROOT);
const { state: rollbackState, rollback, setupSignalHandlers } = createRollbackManager(tag);
setupSignalHandlers();

// ---------------------------------------------------------------------------
// Main release orchestration
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Main release orchestration
// ---------------------------------------------------------------------------

async function main() {
  // --- Prerequisites -------------------------------------------------------

  const resolvedGit = resolveGitExecutable();
  if (!resolvedGit) {
    console.error("❌ 'git' is required but not found in PATH.");
    process.exit(1);
  }
  setGitCommand(resolvedGit);

  process.env.NPM_CONFIG_USERCONFIG ??= resolve(homedir(), '.npmrc');
  const NPM_REGISTRY = process.env.NPM_CONFIG_REGISTRY ?? 'https://registry.npmjs.org/';

  // npm auth only needed for first-time publish (before OIDC is set up)
  const prereleaseState = readReleaseState(RELEASE_STATE_PATH);
  const prereleasePackageState = getPackageReleaseState(prereleaseState, fullPackageName);
  if (prereleasePackageState !== 'oidc-ready') {
    await checkNpmCredentials(NPM_REGISTRY);
  }

  const githubToken = await resolveGithubToken();
  const octokit = new Octokit({ auth: githubToken });

  // --- Precondition checks -------------------------------------------------
  ensureCleanMainBranch();
  syncMainBranch();

  // Re-read pkgJson and release state now that main is up to date.
  const latestPkgJson = JSON.parse(safeRead(pkgJsonPath, 'utf-8')) as {
    name: string;
    repository: unknown;
  };
  const latestReleaseState = readReleaseState(RELEASE_STATE_PATH);
  const packageReleaseState = getPackageReleaseState(latestReleaseState, fullPackageName);

  if (packageReleaseState !== 'oidc-ready') {
    console.error(`❌ ${fullPackageName} is '${packageReleaseState}', not 'oidc-ready'.`);
    console.error('   This package must be bootstrap-published locally once before CI OIDC publishing is allowed.');
    console.error(`   Run: pnpm bootstrap-release ${fullPackageName} ${version} --yes-i-know-this-is-first-publish`);
    process.exit(1);
  }

  // Derive owner/repo from git remote
  const { owner, repo } = resolveOwnerRepoFromOrigin();

  const expectedRepo = `${owner}/${repo}`;
  const packageRepository = getRepositoryField(latestPkgJson.repository);
  if (!packageRepository) {
    console.error(
      `❌ Package ${latestPkgJson.name} is missing package.json repository metadata. Add repository.url before releasing or marking this package oidc-ready.`
    );
    process.exit(1);
  }

  const repoCheck = validateRepositoryMatch(packageRepository, expectedRepo);
  if (!repoCheck.ok) {
    console.error(`❌ ${repoCheck.error}`);
    process.exit(1);
  }

  ensureLocalTagAvailability(tag);
  await ensureRemoteTagAvailability(octokit, owner, repo, tag);

  // --- Previous tag for release notes diff ---------------------------------

  const tagsResp = await octokit.paginate(octokit.git.listMatchingRefs, {
    owner,
    per_page: 100,
    ref: 'tags/',
    repo
  });

  // Filter tags for this package, sort by semver
  const parseVer = (v: string): number[] => {
    const version = v.slice(v.lastIndexOf('@') + 1);
    return version.split('.').map(Number);
  };

  const previousTag =
    tagsResp
      .map(r => r.ref.replace('refs/tags/', ''))
      .filter(t => t.startsWith(`${fullPackageName}@`) && t !== tag)
      .toSorted((a, b) => {
        const [aMaj = 0, aMin = 0, aPatch = 0] = parseVer(a);
        const [bMaj = 0, bMin = 0, bPatch = 0] = parseVer(b);
        return aMaj - bMaj || aMin - bMin || aPatch - bPatch;
      })
      .at(-1) ?? '';

  // --- Release notes -------------------------------------------------------

  console.log(`📝 Generating release notes for ${tag}...`);

  const releaseNotesOpts: ReleaseNotesOptions = {
    owner,
    repo,
    tag_name: tag,
    target_commitish: 'main'
  };
  if (previousTag) {
    releaseNotesOpts.previous_tag_name = previousTag;
  }

  const notesResp = await octokit.repos.generateReleaseNotes(releaseNotesOpts);
  const releaseNotes = notesResp.data.body?.trim() || '- No notable changes.';

  // --- Update package.json -------------------------------------------------
  console.log(`🧩 Updating ${fullPackageName} to ${version}...`);
  const pkg = JSON.parse(safeRead(pkgJsonPath, 'utf-8')) as { version: string };
  pkg.version = version;
  safeWrite(pkgJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);

  // --- Update CHANGELOG.md -------------------------------------------------

  console.log('🧩 Updating CHANGELOG.md...');
  const changelogPath = resolve(pkgDir, 'CHANGELOG.md');
  const date = new Date().toISOString().slice(0, 10);
  const heading = `## [${version}] - ${date}`;
  updateChangelogFile(changelogPath, heading, releaseNotes, previousTag, tag);

  // --- Commit + push -------------------------------------------------------

  const hasChanges = runGit([
    'diff',
    '--name-only',
    '--',
    resolve(pkgDir, 'package.json'),
    resolve(pkgDir, 'CHANGELOG.md')
  ]).stdout.trim();

  if (hasChanges) {
    console.log('📦 Committing release metadata...');
    runGit(['add', resolve(pkgDir, 'package.json'), resolve(pkgDir, 'CHANGELOG.md')]);
    runGit(['commit', '-m', `chore(release): ${tag}`]);
    rollbackState.commitLocal = true;
  } else {
    console.log('ℹ️  No version/changelog changes; nothing to commit.');
  }

  // --- Dry-run exit (BEFORE pushing) ----------------------------------------

  if (isDryRun) {
    console.log('\n[dry-run] Would perform the following:');
    console.log(`[dry-run]   1. Commit: "chore(release): ${tag}"`);
    console.log('[dry-run]   2. Push to origin/main');
    console.log('[dry-run]   3. Wait for Test & Build workflow to pass');
    console.log(`[dry-run]   4. Create tag: ${tag}`);
    console.log('[dry-run]   5. Trigger GitHub Release workflow');
    console.log('[dry-run]   6. Publish to npm');
    console.log('[dry-run]');
    console.log('[dry-run] Release notes preview:');
    console.log(`[dry-run] ${releaseNotes}`);
    return;
  }

  console.log('🚀 Pushing main...');
  runGit(['push', 'origin', 'main']);
  rollbackState.commitPushed = true;
  rollbackState.commitLocal = false;

  // Capture pushed commit SHA
  const headSha = runGit(['rev-parse', 'HEAD']).stdout.trim();
  const parentSha = runGit(['rev-parse', `${headSha}^`]).stdout.trim();

  const changedFiles = runGit(['show', '--name-only', '--pretty=format:', headSha])
    .stdout.split(/\r?\n/)
    .map((line: string) => line.trim())
    .filter(Boolean);

  const metadataOnlyFiles = new Set([`packages/${pkgShortName}/package.json`, `packages/${pkgShortName}/CHANGELOG.md`]);

  const isMetadataOnlyReleaseCommit =
    changedFiles.length > 0 && changedFiles.every((file: string) => metadataOnlyFiles.has(file));

  // --- Wait for required workflows -----------------------------------------

  if (isMetadataOnlyReleaseCommit) {
    console.log(
      `⚡ Metadata-only release commit detected; validating Test & Build on parent commit ${parentSha.slice(0, 7)} instead of ${headSha.slice(0, 7)}.`
    );
    const spinner = ora('Test & Build: checking latest successful run on main').start();
    await waitForLatestSuccessfulWorkflow(octokit, 'Test & Build', owner, repo, spinner);
    spinner.succeed('Test & Build: latest successful run on main found');
  } else {
    const shaToValidate = headSha;
    console.log(`🔎 Waiting for workflows on ${shaToValidate.slice(0, 7)}...`);
    await sleep(10_000);

    const spinner = ora('Test & Build: queued').start();
    await waitForWorkflow(octokit, 'Test & Build', owner, repo, shaToValidate, spinner);
  }

  // --- Tag + push ----------------------------------------------------------

  console.log(`🏷️  Creating annotated tag '${tag}'...`);
  const tagMessage = [
    `Release ${tag}`,
    releaseNotes,
    previousTag ? `Source: changes from ${previousTag} to ${tag}.` : '',
    `Target commit: ${headSha}`
  ]
    .filter(Boolean)
    .join('\n\n');

  runGit(['tag', '-a', tag, headSha, '-m', tagMessage]);

  console.log(`🚀 Pushing tag '${tag}'...`);
  runGit(['push', 'origin', tag]);
  rollbackState.tagPushed = true;

  // --- Monitor Release workflow --------------------------------------------

  const releaseSpinner = ora('Release: waiting for workflow to trigger...').start();
  await waitForWorkflow(octokit, 'Release', owner, repo, headSha, releaseSpinner, { inputs: { tag } });

  console.log(`✅ Release workflow complete: ${tag}`);
  rollbackState.releaseDone = true;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

try {
  await main();
} catch (error) {
  process.stdout.write('\n');
  console.error(error instanceof Error ? error.message : error);
  rollback();
  process.exit(1);
}
