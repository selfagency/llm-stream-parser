// fallow-ignore-file unused-file
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');

function rewriteDistExports(
  rootExports: Record<string, unknown>
): Record<string, { types?: string; import?: string; require?: string }> {
  const distExports: Record<string, { types?: string; import?: string; require?: string }> = {};
  for (const [key, value] of Object.entries(rootExports)) {
    if (!key || key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }
    const entry: { types?: string; import?: string; require?: string } = {};
    if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>;
      for (const field of ['types', 'import', 'require'] as const) {
        if (field in obj) {
          const fieldValue = obj[field] as string | undefined;
          if (fieldValue !== undefined) {
            entry[field] = fieldValue.replace('./dist/', './');
          }
        }
      }
    }
    distExports[key] = entry;
  }
  return distExports;
}

async function main() {
  // If a package path is provided as an argument, use it; otherwise use root
  const packagePath = process.argv[2] ? resolve(process.argv[2]) : ROOT;
  const rootPkgPath = resolve(packagePath, 'package.json');
  const outDir = resolve(packagePath, 'dist');
  const raw = await readFile(rootPkgPath, 'utf-8');
  const pkg = JSON.parse(raw) as {
    name: string;
    version: string;
    description: string;
    keywords: string[];
    homepage: string;
    bugs?: {
      url?: string;
    };
    repository?: {
      url?: string;
    };
    license: string;
    author?:
      | string
      | {
          name?: string;
          email?: string;
          url?: string;
        };
    private?: boolean;
    publishConfig?: Record<string, unknown>;
    exports?: Record<string, unknown>;
  };
  const {
    name,
    version,
    description,
    keywords,
    homepage,
    bugs,
    repository,
    license,
    author,
    private: isPrivate,
    publishConfig
  } = pkg;

  const distExports = rewriteDistExports(pkg.exports as Record<string, unknown>);

  const distPkg = {
    author,
    bugs,
    description,
    exports: distExports,
    homepage,
    keywords,
    license,
    main: './index.cjs',
    module: './index.js',
    name,
    private: isPrivate,
    publishConfig,
    repository,
    type: 'module',
    types: './index.d.ts',
    version
  };

  await mkdir(outDir, { recursive: true });
  await writeFile(resolve(outDir, 'package.json'), `${JSON.stringify(distPkg, null, 2)}\n`, 'utf-8');
  console.log('Wrote', resolve(outDir, 'package.json'));

  const pkgReadme = resolve(packagePath, 'README.md');
  const rootReadme = resolve(ROOT, 'README.md');
  const readmeSrc = await access(pkgReadme)
    .then(() => pkgReadme)
    .catch(() => rootReadme);
  const readmeDest = resolve(outDir, 'README.md');
  await copyFile(readmeSrc, readmeDest);
  console.log('Copied', readmeSrc, 'to', readmeDest);
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
