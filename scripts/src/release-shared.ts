// fallow-ignore-file unused-file
import type { Octokit as OctokitType } from '@octokit/rest';
import type ora from 'ora';
import { $ } from 'zx';

import { createGitHelpers } from './release-git.js';
import { ROOT, safeRead, safeWrite } from './release-utils.js';

const gitHelpers = createGitHelpers(ROOT);
const { runGit } = gitHelpers;

export type { Octokit as OctokitType };

export function createReleaseShared(octokitConstructor: typeof OctokitType): typeof OctokitType {
  return octokitConstructor;
}

// ---------------------------------------------------------------------------
// Rollback manager — shared across release scripts
// ---------------------------------------------------------------------------

export interface RollbackState {
  commitLocal: boolean;
  commitPushed: boolean;
  releaseDone: boolean;
  tagPushed: boolean;
}

export interface RollbackManager {
  rollback(): void;
  setupSignalHandlers(): void;
  state: RollbackState;
}

export function createRollbackManager(tag: string): RollbackManager {
  const state: RollbackState = {
    commitLocal: false,
    commitPushed: false,
    tagPushed: false,
    releaseDone: false
  };

  function rollback(): void {
    if (state.releaseDone) {
      return;
    }

    $.verbose = false;
    try {
      if (state.tagPushed) {
        console.log(`\n⚠️  Release interrupted. Deleting remote tag ${tag}...`);
        try {
          runGit(['push', 'origin', '--delete', tag]);
          runGit(['tag', '-d', tag]);
          console.log(`↩️  Tag ${tag} deleted.`);
        } catch {
          console.error(`⚠️  Could not delete tag ${tag}. Manually run:`);
          console.error(`   git push origin --delete '${tag}' && git tag -d '${tag}'`);
        }
      }

      if (state.commitPushed) {
        console.log('\n⚠️  Reverting release commit on origin/main...');
        try {
          runGit(['revert', '--no-edit', 'HEAD']);
          runGit(['push', 'origin', 'main']);
          console.log('↩️  Commit reverted and pushed.');
        } catch {
          console.error('❌ Auto-revert failed. Manually run:');
          console.error('   git revert HEAD && git push origin main');
        }
      } else if (state.commitLocal) {
        console.log('\n⚠️  Resetting local release commit...');
        try {
          runGit(['reset', '--hard', 'HEAD~1']);
          console.log('↩️  Commit removed.');
        } catch {
          console.error('❌ Reset failed. Manually run: git reset --hard HEAD~1');
        }
      }
    } catch {
      /* best effort */
    }
  }

  function setupSignalHandlers(): void {
    process.on('SIGINT', () => {
      rollback();
      process.exit(130);
    });
    process.on('SIGTERM', () => {
      rollback();
      process.exit(143);
    });
  }

  return { state, rollback, setupSignalHandlers };
}

export type Octokit = InstanceType<ReturnType<typeof createReleaseShared>>;

export type ReleaseNotesOptions = Parameters<Octokit['repos']['generateReleaseNotes']>[0] & {
  previous_tag_name?: string;
};

export type GitHubWorkflow = Awaited<ReturnType<Octokit['actions']['listRepoWorkflows']>>['data']['workflows'][number];
export type GitHubWorkflowRun = Awaited<
  ReturnType<Octokit['actions']['listWorkflowRuns']>
>['data']['workflow_runs'][number];
export type WorkflowSpinner = ReturnType<typeof ora>;

export interface WaitForWorkflowOptions {
  autoDispatch?: boolean;
  branch?: string | undefined;
  inputs?: Record<string, string>;
  pollMs?: number;
  timeoutMs?: number;
}

export interface WaitForLatestWorkflowOptions {
  branch?: string;
  pollMs?: number;
  timeoutMs?: number;
}

export async function checkNpmCredentials(npmRegistry: string): Promise<void> {
  const { $ } = await import('zx');
  try {
    await $`npm whoami --registry=${npmRegistry}`;
  } catch {
    console.error(`❌ Not logged in to npm (registry: ${npmRegistry}).`);
    console.error('   Tips:');
    console.error(`   - Ensure your token is in ${process.env.NPM_CONFIG_USERCONFIG}`);
    console.error('   - File should contain a line like: //registry.npmjs.org/:_authToken=<YOUR_TOKEN>');
    console.error('   - Or export NPM_TOKEN in your environment before running the release script');
    console.error('   - To log in interactively: npm login --registry=https://registry.npmjs.org/');
    process.exit(1);
  }
}

export async function resolveGithubToken() {
  const { $ } = await import('zx');
  let token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? '';
  if (!token) {
    try {
      token = (await $`gh auth token`).stdout.trim();
    } catch {
      console.error('❌ No GitHub token found. Set GH_TOKEN/gitHUB_TOKEN or run: gh auth login');
      process.exit(1);
    }
  }
  return token;
}

export function wrapBareUrls(text: string): string {
  return text.replaceAll(/(https?:\/\/[^\s<>)\],.!?:;]+)/gu, '<$1>');
}

export function updateChangelogFile(
  changelogPath: string,
  heading: string,
  releaseNotes: string,
  previousTag: string,
  tag: string
): void {
  let original: string;
  try {
    original = safeRead(changelogPath, 'utf-8');
  } catch {
    original = '# Change Log\n\n## [Unreleased]\n';
  }

  if (original.includes(heading)) {
    console.log('ℹ️  CHANGELOG already contains this release heading; skipping.');
    return;
  }

  const sourceLine = previousTag ? `\n\n_Source: changes from ${previousTag} to ${tag}._` : '';
  const wrappedReleaseNotes = wrapBareUrls(releaseNotes);
  const section = `\n${heading}\n\n${wrappedReleaseNotes}${sourceLine}\n`;
  const marker = '## [Unreleased]';
  const idx = original.indexOf(marker);
  const updated =
    idx === -1
      ? `${original}\n${section}`
      : `${original.slice(0, idx + marker.length)}\n${section}${original.slice(idx + marker.length)}`;
  safeWrite(changelogPath, updated);
}

export function ensureCleanMainBranch(): void {
  const dirty = runGit(['status', '--porcelain']).stdout.trim();
  if (dirty) {
    console.error('❌ Working tree is not clean. Commit or stash changes first.');
    process.exit(1);
  }

  const branch = runGit(['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
  if (branch === 'main') {
    return;
  }
  console.error(`❌ Must run from 'main'. Current branch: ${branch}`);
  process.exit(1);
}

export function syncMainBranch(): void {
  console.log('🔄 Fetching latest refs...');
  runGit(['fetch', 'origin', 'main']);
  runGit(['pull', '--ff-only', 'origin', 'main']);
}

export function parseOwnerRepoFromRemoteUrl(remoteUrl: string): {
  owner: string;
  repo: string;
} {
  const normalized = remoteUrl.trim().replace(/\.git$/, '');

  if (normalized.startsWith('git@')) {
    const colonIndex = normalized.indexOf(':');
    if (colonIndex === -1) {
      return { owner: '', repo: '' };
    }

    const path = normalized.slice(colonIndex + 1);
    const slashIndex = path.indexOf('/');
    if (slashIndex === -1) {
      return { owner: '', repo: '' };
    }

    return {
      owner: path.slice(0, slashIndex),
      repo: path.slice(slashIndex + 1)
    };
  }

  try {
    const parsed = new URL(normalized);
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length < 2) {
      return { owner: '', repo: '' };
    }

    return {
      owner: parts[0] ?? '',
      repo: parts[1] ?? ''
    };
  } catch {
    return { owner: '', repo: '' };
  }
}

export function resolveOwnerRepoFromOrigin(): { owner: string; repo: string } {
  const remoteUrl = runGit(['remote', 'get-url', 'origin']).stdout.trim();
  const { owner, repo } = parseOwnerRepoFromRemoteUrl(remoteUrl);
  if (!(owner && repo)) {
    console.error(`❌ Cannot parse owner/repo from remote URL: ${remoteUrl}`);
    process.exit(1);
  }

  return { owner, repo };
}

export function ensureLocalTagDoesNotExist(tag: string) {
  const localTag = runGit(['tag', '-l', tag]).stdout.trim();
  if (localTag) {
    console.error(`❌ Local tag ${tag} already exists.`);
    process.exit(1);
  }
}

export async function ensureRemoteTagDoesNotExist(
  octokit: Octokit,
  owner: string,
  repo: string,
  tag: string
): Promise<void> {
  try {
    await octokit.git.getRef({ owner, ref: `tags/${tag}`, repo });
    console.error(`❌ Remote tag ${tag} already exists.`);
    process.exit(1);
  } catch (error: unknown) {
    if (
      typeof error !== 'object' ||
      error === null ||
      !('status' in error) ||
      ('status' in error &&
        typeof (error as Record<string, unknown>).status === 'number' &&
        (error as Record<string, unknown>).status !== 404)
    ) {
      throw error;
    }
  }
}

export async function ensureRemoteTagAvailability(
  octokit: Octokit,
  owner: string,
  repo: string,
  tag: string,
  isRetag?: boolean
): Promise<void> {
  try {
    await octokit.git.getRef({ owner, ref: `tags/${tag}`, repo });
    if (!isRetag) {
      console.error(`❌ Remote tag '${tag}' already exists.`);
      console.error('   If the previous CI run failed and you want to retag, rerun with --retag.');
      process.exit(1);
    }

    console.log(`⚠️  Remote tag '${tag}' exists — deleting for retag...`);
    await octokit.git.deleteRef({ owner, ref: `tags/${tag}`, repo });
    console.log('↩️  Remote tag deleted.');
    const localTagExists = runGit(['tag', '-l', tag]).stdout.trim();
    if (localTagExists) {
      runGit(['tag', '-d', tag]);
    }
  } catch (error: unknown) {
    if (
      typeof error !== 'object' ||
      error === null ||
      !('status' in error) ||
      ('status' in error &&
        typeof (error as Record<string, unknown>).status === 'number' &&
        (error as Record<string, unknown>).status !== 404)
    ) {
      throw error;
    }
  }
}

export function ensureLocalTagAvailability(tag: string, isRetag?: boolean): void {
  const localTag = runGit(['tag', '-l', tag]).stdout.trim();
  if (!localTag) {
    return;
  }

  if (isRetag) {
    console.log(`⚠️  Local tag '${tag}' exists — deleting for retag...`);
    runGit(['tag', '-d', tag]);
    return;
  }

  console.error(`❌ Local tag '${tag}' already exists. Run: git tag -d '${tag}'`);
  process.exit(1);
}

export async function waitForWorkflow(
  octokit: Octokit,
  name: string,
  owner: string,
  repo: string,
  headSha: string,
  spinner: WorkflowSpinner,
  options: WaitForWorkflowOptions = {}
) {
  const { sleep } = await import('zx');
  const { timeoutMs = 3_600_000, pollMs = 15_000, autoDispatch = true, branch = 'main' } = options;

  const workflowsResp = await octokit.actions.listRepoWorkflows({
    owner,
    per_page: 100,
    repo
  });
  const workflow = workflowsResp.data.workflows.find((w: GitHubWorkflow) => w.name === name);
  if (!workflow) {
    spinner.fail(`${name}: workflow not found in ${owner}/${repo}`);
    throw new Error(`[${name}] workflow not found in ${owner}/${repo}`);
  }

  const deadline = Date.now() + timeoutMs;
  let triggered = false;
  // Track cancelled run IDs so we skip them on subsequent polls and don't
  // mistake them for the new run that was re-dispatched.
  const cancelledRunIds = new Set<number>();

  while (Date.now() < deadline) {
    const runsResp = await octokit.actions.listWorkflowRuns({
      owner,
      repo,
      workflow_id: workflow.id,
      ...(branch ? { branch } : {}),
      head_sha: headSha,
      per_page: 10
    });

    // Find the latest run that isn't one we already marked as cancelled.
    const run = runsResp.data.workflow_runs.find((r: GitHubWorkflowRun) => !cancelledRunIds.has(r.id));

    if (!run) {
      if (autoDispatch && !triggered) {
        spinner.text = `${name}: no run found — triggering workflow_dispatch...`;
        await octokit.actions.createWorkflowDispatch({
          owner,
          ref: 'main',
          repo,
          workflow_id: workflow.id,
          ...(options.inputs ? { inputs: options.inputs } : {})
        });
        triggered = true;
        spinner.text = `${name}: waiting for run to appear...`;
      } else {
        spinner.text = `${name}: waiting for run to appear...`;
      }
    } else if (run.status !== 'completed') {
      const elapsed = Math.round((Date.now() - new Date(run.created_at).getTime()) / 1000);
      spinner.text = `${name}: ${run.status} (${elapsed}s elapsed)`;
    } else if (run.conclusion === 'success') {
      spinner.succeed(`${name}: passed`);
      return;
    } else if (run.conclusion === 'cancelled') {
      // Cancelled runs are often caused by a concurrent push racing with CI startup.
      // Record this run so we skip it on future polls, then re-dispatch.
      cancelledRunIds.add(run.id);
      spinner.text = `${name}: run was cancelled — re-dispatching...`;
      triggered = false;
    } else {
      spinner.fail(`${name}: ${run.conclusion}`);
      throw new Error(`[${name}] conclusion=${run.conclusion}\n   Run: ${run.html_url}`);
    }

    await sleep(pollMs);
  }

  spinner.fail(`${name}: timed out`);
  throw new Error(`[${name}] timed out after ${timeoutMs / 1000}s`);
}

export async function waitForLatestSuccessfulWorkflow(
  octokit: Octokit,
  name: string,
  owner: string,
  repo: string,
  spinner: WorkflowSpinner,
  { timeoutMs = 600_000, pollMs = 10_000, branch = 'main' }: WaitForLatestWorkflowOptions = {}
) {
  const { sleep } = await import('zx');

  const workflowsResp = await octokit.actions.listRepoWorkflows({
    owner,
    per_page: 100,
    repo
  });
  const workflow = workflowsResp.data.workflows.find((w: GitHubWorkflow) => w.name === name);
  if (!workflow) {
    spinner.fail(`${name}: workflow not found`);
    throw new Error(`[${name}] workflow not found in ${owner}/${repo}`);
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const runsResp = await octokit.actions.listWorkflowRuns({
      branch,
      owner,
      per_page: 20,
      repo,
      status: 'completed',
      workflow_id: workflow.id
    });

    const successRun = runsResp.data.workflow_runs.find((r: GitHubWorkflowRun) => r.conclusion === 'success');
    if (successRun) {
      spinner.text = `${name}: latest success on ${successRun.head_sha.slice(0, 7)}`;
      return;
    }

    spinner.text = `${name}: waiting for a successful completed run on ${branch}...`;
    await sleep(pollMs);
  }

  spinner.fail(`${name}: no successful completed run found`);
  throw new Error(`Timed out waiting for a successful '${name}' workflow run on ${branch}.`);
}
