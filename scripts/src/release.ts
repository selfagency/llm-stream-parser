#!/usr/bin/env zx
import { homedir } from 'node:os';
import { resolve } from 'node:path';

// fallow-ignore-file unused-file
import { Octokit } from '@octokit/rest';
import ora from 'ora';
import { $, argv, cd, ProcessOutput, sleep } from 'zx';

import { createGitHelpers } from './release-git.js';
import type { ReleaseNotesOptions } from './release-shared.js';
import {
  checkNpmCredentials,
  createRollbackManager,
  ensureCleanMainBranch,
  ensureLocalTagDoesNotExist,
  ensureRemoteTagDoesNotExist,
  resolveGithubToken,
  resolveOwnerRepoFromOrigin,
  syncMainBranch,
  updateChangelogFile,
  waitForWorkflow
} from './release-shared.js';
import { parseVersionArg, ROOT, safeRead, safeWrite } from './release-utils.js';

$.verbose = false;

cd(ROOT);

const version = parseVersionArg(typeof argv._[0] === 'string' ? argv._[0] : undefined);

const tag = `v${version}`;

const { resolveGitExecutable, runGit, setGitCommand } = createGitHelpers(ROOT);
const { state: rollbackState, rollback, setupSignalHandlers } = createRollbackManager(tag);
setupSignalHandlers();

// ---------------------------------------------------------------------------
// Main — wrapped so any unhandled error triggers rollback
// ---------------------------------------------------------------------------

async function main() {
  // --- Prerequisites -------------------------------------------------------

  const resolvedGit = resolveGitExecutable();
  if (!resolvedGit) {
    console.error("❌ 'git' is required but not found in PATH.");
    process.exit(1);
  }
  setGitCommand(resolvedGit);

  // Ensure npm uses the user's ~/.npmrc (tokens) and the public npm registry.
  process.env.NPM_CONFIG_USERCONFIG ??= resolve(homedir(), '.npmrc');
  const NPM_REGISTRY = process.env.NPM_CONFIG_REGISTRY ?? 'https://registry.npmjs.org/';

  // If NPM_TOKEN is provided in the environment, set the npm auth config.
  if (process.env.NPM_TOKEN) {
    const registryUrl = new URL(NPM_REGISTRY);
    const registryHost = registryUrl.hostname;
    process.env[`npm_config__${registryHost}_:_authToken`] = process.env.NPM_TOKEN;
  }

  await checkNpmCredentials(NPM_REGISTRY);

  const githubToken = await resolveGithubToken();
  const octokit = new Octokit({ auth: githubToken });

  // --- Precondition checks --------------------------------------------------
  ensureCleanMainBranch();
  syncMainBranch();

  // Derive owner/repo from the git remote URL.
  const { owner, repo } = resolveOwnerRepoFromOrigin();

  // Check for existing local tag.
  ensureLocalTagDoesNotExist(tag);

  // Check for existing remote tag via the API.
  await ensureRemoteTagDoesNotExist(octokit, owner, repo, tag);

  // --- Previous tag (for release notes diff) --------------------------------

  const tagsResp = await octokit.paginate(octokit.git.listMatchingRefs, {
    owner,
    per_page: 100,
    ref: 'tags/v',
    repo
  });

  const previousTag =
    tagsResp
      .map(r => r.ref.replace('refs/tags/', ''))
      .filter(t => t !== tag)
      .toSorted((a, b) => {
        const parse = (v: string): [number, number, number] => {
          const parts = v.replace(/^v/, '').split('.').map(Number);
          return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
        };
        const [aMaj, aMin, aPatch] = parse(a);
        const [bMaj, bMin, bPatch] = parse(b);
        return aMaj - bMaj || aMin - bMin || aPatch - bPatch;
      })
      .at(-1) ?? '';

  // --- Release notes --------------------------------------------------------

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

  // --- Update package.json --------------------------------------------------
  console.log(`🧩 Updating package.json to ${version}...`);
  const pkgPath = resolve(ROOT, 'package.json');
  const pkg = JSON.parse(safeRead(pkgPath, 'utf-8')) as {
    version: string;
  };
  pkg.version = version;
  safeWrite(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  // --- Update CHANGELOG.md --------------------------------------------------

  console.log('🧩 Updating CHANGELOG.md...');
  const changelogPath = resolve(ROOT, 'CHANGELOG.md');
  const date = new Date().toISOString().slice(0, 10);
  const heading = `## [${version}] - ${date}`;
  updateChangelogFile(changelogPath, heading, releaseNotes, previousTag, tag);

  // --- Commit + push --------------------------------------------------------

  const hasChanges = runGit(['diff', '--name-only', '--', 'package.json', 'CHANGELOG.md']).stdout.trim();
  if (hasChanges) {
    console.log('📦 Committing release metadata changes...');
    runGit(['add', 'package.json', 'CHANGELOG.md']);
    runGit(['commit', '-m', `chore(release): update version and changelog for ${tag}`]);
    rollbackState.commitLocal = true;
  } else {
    console.log('ℹ️  No version/changelog changes detected; nothing to commit.');
  }

  console.log('🚀 Pushing main...');
  runGit(['push', 'origin', 'main']);
  rollbackState.commitPushed = true;
  rollbackState.commitLocal = false;

  const headSha = runGit(['rev-parse', 'HEAD']).stdout.trim();

  // --- Wait for required workflows (sequential to avoid concurrent-spinner visual corruption) ------

  const shortSha = headSha.slice(0, 7);
  console.log(`🔎 Waiting for required workflows on ${shortSha}...`);
  // Give GitHub a moment to register the push before we start polling.
  await sleep(10_000);

  const spinner = ora({ text: 'Tests: queued' }).start();
  for (const name of ['Test & Build']) {
    spinner.text = `${name}: queued`;
    spinner.start();
    await waitForWorkflow(octokit, name, owner, repo, headSha, spinner);
  }

  // --- Tag + publish --------------------------------------------------------

  console.log(`🏷️  Creating annotated tag ${tag} at ${headSha}...`);

  const tagMessage = [
    `Release ${tag}`,
    releaseNotes,
    previousTag ? `Source: changes from ${previousTag} to ${tag}.` : '',
    `Target commit: ${headSha}`
  ]
    .filter(Boolean)
    .join('\n\n');

  runGit(['tag', '-a', tag, headSha, '-m', tagMessage]);

  console.log(`🚀 Pushing tag ${tag}...`);
  runGit(['push', 'origin', tag]);
  rollbackState.tagPushed = true;

  // --- Watch the release workflow ------------------------------------------

  spinner.text = 'Release: waiting for workflow to trigger...';
  spinner.start();
  await waitForWorkflow(octokit, 'Release', owner, repo, headSha, spinner, {
    autoDispatch: false
  });

  console.log(`✅ GitHub release complete: ${tag} → ${headSha}`);

  // --- npm publish ----------------------------------------------------------

  console.log('📦 Building package...');
  $.verbose = true;
  await $`pnpm build`;
  await $`node scripts/write-dist-package.js`;
  $.verbose = false;

  const distTag = version.includes('-') ? 'next' : 'latest';
  console.log(`🚀 Publishing ${tag} to npm (dist-tag: ${distTag})...`);
  try {
    // For scoped public packages, --access public is required on first publish; harmless on subsequent publishes.
    const accessFlag = (
      JSON.parse(safeRead(resolve(ROOT, 'package.json'), 'utf-8')) as { name: string }
    ).name?.startsWith('@')
      ? ['--access', 'public']
      : [];
    // Use spawn for interactive npm publish (required for 2FA/OTP prompts)
    const { spawnSync } = await import('node:child_process');
    const result = spawnSync(
      'npm',
      ['publish', './dist', '--tag', distTag, `--registry=${NPM_REGISTRY}`, ...accessFlag],
      {
        cwd: process.cwd(),
        stdio: 'inherit'
      }
    );
    if (result.status !== 0) {
      throw new Error(`npm publish exited with code ${result.status}`);
    }
  } catch (error) {
    console.error('❌ npm publish failed.');
    // Ensure rollback is not marked as done so that tag/commit cleanup happens.
    rollbackState.releaseDone = false;
    throw error;
  }
  console.log(`✅ Published ${tag} to npm.`);
  rollbackState.releaseDone = true;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

try {
  await main();
} catch (error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  // ProcessOutput errors from zx already printed the command output; only
  // print extra context for our own thrown errors.
  if (!(error instanceof ProcessOutput)) {
    console.error(`❌ ${msg}`);
  }
  rollback();
  if (typeof error === 'object' && error !== null && 'exitCode' in error) {
    const exitCode = (error as Record<string, unknown>).exitCode;
    process.exit(typeof exitCode === 'number' || typeof exitCode === 'string' ? exitCode : 1);
  } else {
    process.exit(1);
  }
}
