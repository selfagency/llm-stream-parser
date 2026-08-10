/**
 * Drift detector — compares the installed @quietloudlab/ai-interaction-atlas
 * version to the latest published version on npm.
 *
 * Run: pnpm --filter @agentsy/atlas drift
 * CI: fails on version mismatch so humans review every upstream change.
 *
 * Note: the snapshot's meta.version is the Atlas data schema version (e.g. "1.0"),
 * not the npm package version (e.g. "1.0.14"). We compare npm package versions.
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SNAPSHOT_VERSION_PATH = resolve(__dirname, 'snapshot/ATLAS_NPM_VERSION');
const FALLBACK_VERSION = '1.0.14';

function getSnapshotNpmVersion(): string {
  try {
    return readFileSync(SNAPSHOT_VERSION_PATH, 'utf-8').trim();
  } catch {
    return FALLBACK_VERSION;
  }
}

function getLatestNpmVersion(): string {
  try {
    const output = execSync('npm view @quietloudlab/ai-interaction-atlas version 2>/dev/null', {
      // NOSONAR:typescript:S4036
      encoding: 'utf-8'
    }).trim();
    return output;
  } catch {
    console.error('drift: could not reach npm registry, skipping');
    process.exit(0);
  }
}

function getInstalledNpmVersion(): string | null {
  try {
    const pkgPath = resolve(__dirname, '../../node_modules/@quietloudlab/ai-interaction-atlas/package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return pkg.version ?? null;
  } catch {
    return null;
  }
}

function main(): void {
  const snapshotVersion = getSnapshotNpmVersion();
  const installedVersion = getInstalledNpmVersion();
  const latestVersion = getLatestNpmVersion();

  console.log(`drift: snapshot=${snapshotVersion}`);
  console.log(`drift: installed=${installedVersion ?? 'not installed'}`);
  console.log(`drift: latest=${latestVersion}`);

  if (snapshotVersion === latestVersion) {
    console.log('drift: OK — snapshot matches latest npm');
    process.exit(0);
  }

  console.error(`drift: MISMATCH — snapshot ${snapshotVersion} != latest ${latestVersion}`);
  console.error('drift: regenerate with: pnpm --filter @agentsy/atlas build');
  console.error('drift: review the diff in packages/atlas/src/snapshot/ and packages/atlas/src/generated/');
  process.exit(1);
}

main();
