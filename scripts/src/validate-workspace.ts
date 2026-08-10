#!/usr/bin/env node
import type { Dirent } from 'node:fs';
import { constants as fsConstants } from 'node:fs';
import { access, readdir, stat } from 'node:fs/promises';
import path from 'node:path';

/**
 * Validate that every first-level directory under packages/* is a real package (has package.json).
 * Temporary allowlist: ignore directories we intentionally keep non-packaged for now.
 */
// Compute packages directory inside main so tests can override it.
// Default behavior: packages/ under current working directory.
// Allowlist: tweak as migrations proceed. Keep 'core' as a common non-packaged dir.
const IGNORE_DIRS = new Set(['core']);

async function dirExists(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function hasFile(p: string): Promise<boolean> {
  try {
    await access(p, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function shouldIgnorePackageDir(name: string): boolean {
  return name.startsWith('.') || IGNORE_DIRS.has(name);
}

function formatOffenders(offenders: string[]): void {
  if (offenders.length === 0) {
    console.log('Workspace validation passed: all packages/* are real packages.');
    return;
  }

  console.error('Workspace contains non-packages under packages/*:');
  for (const offender of offenders) {
    console.error(` - ${offender} (missing package.json)`);
  }
}

async function collectOffenders(root: string, packagesDir: string, entries: Dirent[]): Promise<string[]> {
  const offenders: string[] = [];

  for (const ent of entries) {
    if (!ent.isDirectory()) {
      continue;
    }

    const { name } = ent;
    if (shouldIgnorePackageDir(name)) {
      continue;
    }

    const full = path.join(packagesDir, name);
    const pkgJson = path.join(full, 'package.json');

    if (!(await hasFile(pkgJson))) {
      offenders.push(path.relative(root, full));
    }
  }

  return offenders;
}

async function main(packagesDir?: string): Promise<void> {
  const ROOT = process.cwd();
  const PACKAGES_DIR = packagesDir ?? path.join(ROOT, 'packages');

  try {
    const packagesDirExists = await dirExists(PACKAGES_DIR);
    if (!packagesDirExists) {
      try {
        await stat(PACKAGES_DIR);
      } catch (error: unknown) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          typeof error.code === 'string' &&
          error.code === 'ENOENT'
        ) {
          console.log('No packages/ directory found. Skipping workspace validation.');
          process.exitCode = 0;
          return;
        }
      }

      console.error('packages path exists but is not a directory');
      process.exitCode = 1;
      return;
    }

    const entries = await readdir(PACKAGES_DIR, { withFileTypes: true });
    const offenders = await collectOffenders(ROOT, PACKAGES_DIR, entries);
    formatOffenders(offenders);
    process.exitCode = offenders.length > 0 ? 1 : 0;
  } catch (error) {
    console.error('validate-workspace failed:', error);
    process.exitCode = 1;
    return;
  }
}

// Export `main` for tests to import and call directly while preserving CLI behavior.
export { main };

// CLI entrypoint when run directly.
if (process.argv[1]?.endsWith('validate-workspace.js')) {
  try {
    await main();
  } catch (error) {
    console.error('validate-workspace failed:', error);
    process.exitCode = 1;
  }
}
