import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const atlasPkgDir = join(__dirname, '..');
const outDir = join(atlasPkgDir, 'src', 'generated');

describe('codegen determinism', () => {
  it('running codegen twice produces identical output', () => {
    // Read current generated output
    const before = readFileSync(join(outDir, 'patterns.ts'), 'utf-8');

    // Run codegen again
    execSync('npx tsx src/codegen.ts', { cwd: atlasPkgDir });

    const after = readFileSync(join(outDir, 'patterns.ts'), 'utf-8');
    expect(after).toBe(before);
  });
});
