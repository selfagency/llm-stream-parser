import { readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
export const PACKAGES_DIR = resolve(ROOT, 'packages');

export function isPathInsideRoot(p: string): boolean {
  try {
    const resolved = resolve(p);
    const rel = relative(ROOT, resolved);
    return rel === '' || !(rel.startsWith('..') || rel.startsWith('../'));
  } catch {
    return false;
  }
}

export function safeRead(p: string, enc: BufferEncoding = 'utf-8'): string {
  if (!isPathInsideRoot(p)) {
    throw new Error(`Refusing to read outside repository root: ${p}`);
  }

  return readFileSync(resolve(p), enc);
}

export function safeWrite(p: string, data: string): void {
  if (!isPathInsideRoot(p)) {
    throw new Error(`Refusing to write outside repository root: ${p}`);
  }

  writeFileSync(resolve(p), data);
}

export function parseVersionArg(versionArg: string | undefined): string {
  if (!(versionArg && /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/.test(versionArg))) {
    console.error(`❌ Invalid version: "${versionArg}". Expected semver (e.g. 1.2.3 or 1.2.3-beta.1)`);
    process.exit(1);
  }

  return versionArg;
}
