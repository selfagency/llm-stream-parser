/**
 * AFT — Agent File Tree generator.
 *
 * Produces `.agentsy/aft.md` (human-readable tree) and
 * `.agentsy/aft.json` (agent-consumable structured data).
 *
 * @module
 */

import type { ProjectProfile } from '../scanner.js';

// ── Helpers ─────────────────────────────────────────────

function resolveLanguage(filePath: string, profile: ProjectProfile): string {
  if (filePath.includes('.ts')) {
    return 'typescript';
  }
  if (filePath.includes('.py')) {
    return 'python';
  }
  if (filePath.includes('.json')) {
    return 'json';
  }
  if (filePath.includes('.yaml') || filePath.includes('.yml')) {
    return 'yaml';
  }
  return languageLabel(profile).toLowerCase();
}

// ── Types ───────────────────────────────────────────────

interface AftFileEntry {
  /** Short description */
  description: string;
  /** Language label */
  language: string;
  /** Estimated LOC (0 for directories) */
  loc: number;
  /** Relative path from project root */
  path: string;
  /** File type (file/directory) */
  type: 'file' | 'dir';
}

interface AftStats {
  /** File count grouped by language */
  byLanguage: Record<string, { files: number; loc: number }>;
  /** Total file count */
  totalFiles: number;
  /** Total estimated lines of code */
  totalLoc: number;
}

interface AftJson {
  /** Detected configuration files */
  configFiles: string[];
  /** Detected entry point files */
  entryPoints: string[];
  /** Generation timestamp */
  generatedAt: string;
  /** Glob patterns to ignore */
  ignoredPaths: string[];
  /** Top-level file tree */
  layout: AftFileEntry[];
  /** Project root path */
  rootPath: string;
  /** Schema version for forward compatibility */
  schemaVersion: number;
  /** Aggregate statistics */
  stats: AftStats;
}

// ── Known file patterns ─────────────────────────────────

interface FileTemplate {
  description: string;
  isConfig: boolean;
  isEntry: boolean;
  path: string;
}

const NODE_ENTRIES: FileTemplate[] = [
  { path: 'src/', description: 'Source code', isEntry: false, isConfig: false },
  { path: 'public/', description: 'Static assets (Next.js)', isEntry: false, isConfig: false },
  { path: 'package.json', description: 'Package manifest', isEntry: false, isConfig: true },
  { path: 'tsconfig.json', description: 'TypeScript configuration', isEntry: false, isConfig: true },
  { path: 'vitest.config.ts', description: 'Vitest configuration', isEntry: false, isConfig: true },
  { path: 'tsup.config.ts', description: 'Build configuration', isEntry: false, isConfig: true }
];

const PYTHON_ENTRIES: FileTemplate[] = [
  { path: 'src/', description: 'Source code', isEntry: false, isConfig: false },
  { path: 'pyproject.toml', description: 'Python project metadata', isEntry: false, isConfig: true },
  { path: 'requirements.txt', description: 'Python dependencies', isEntry: false, isConfig: true }
];

const RUST_ENTRIES: FileTemplate[] = [
  { path: 'src/', description: 'Source code', isEntry: false, isConfig: false },
  { path: 'Cargo.toml', description: 'Rust manifest', isEntry: false, isConfig: true },
  { path: 'Cargo.lock', description: 'Rust lockfile', isEntry: false, isConfig: true }
];

// ── Profile-based layout selection ──────────────────────

function getTemplates(profile: ProjectProfile): FileTemplate[] {
  if (profile.languages.includes('rust')) {
    return RUST_ENTRIES;
  }
  if (profile.languages.includes('python')) {
    return PYTHON_ENTRIES;
  }
  // Default: Node.js / TypeScript
  const templates = [...NODE_ENTRIES];

  if (profile.monorepo) {
    templates.push({ path: 'packages/', description: 'Workspace packages', isEntry: false, isConfig: false });
    templates.push({
      path: 'pnpm-workspace.yaml',
      description: 'pnpm workspace definition',
      isEntry: false,
      isConfig: true
    });
  }

  if (profile.frameworks.includes('next.js')) {
    templates.push({ path: 'src/app/', description: 'App Router pages & layouts', isEntry: true, isConfig: false });
    templates.push({ path: 'next.config.ts', description: 'Next.js configuration', isEntry: false, isConfig: true });
    templates.push({ path: 'next-env.d.ts', description: 'Next.js type declarations', isEntry: false, isConfig: true });
  }

  if (profile.linter.includes('biome')) {
    templates.push({ path: 'biome.json', description: 'Biome configuration', isEntry: false, isConfig: true });
  } else if (profile.linter.includes('eslint')) {
    templates.push({
      path: '.eslintrc.* / eslint.config.*',
      description: 'ESLint configuration',
      isEntry: false,
      isConfig: true
    });
  }

  if (profile.ci.includes('github-actions')) {
    templates.push({
      path: '.github/workflows/',
      description: 'CI workflow definitions',
      isEntry: false,
      isConfig: false
    });
  }

  return templates;
}

function languageLabel(profile: ProjectProfile): string {
  if (profile.languages.includes('typescript')) {
    return 'TypeScript';
  }
  if (profile.languages.includes('javascript')) {
    return 'JavaScript';
  }
  if (profile.languages.includes('python')) {
    return 'Python';
  }
  if (profile.languages.includes('rust')) {
    return 'Rust';
  }
  if (profile.languages.includes('go')) {
    return 'Go';
  }
  if (profile.languages.includes('elixir')) {
    return 'Elixir';
  }
  return 'Unknown';
}

// ── Stats estimation ────────────────────────────────────

function estimateStats(profile: ProjectProfile): AftStats {
  // Conservative estimates — real tool uses actual file crawl
  const baseFiles = profile.monorepo ? 250 : 80;
  const monoLoc = 15e3;
  const singleLoc = 5e3;
  const baseLoc = profile.monorepo ? monoLoc : singleLoc;

  const byLanguage: Record<string, { files: number; loc: number }> = Object.create(null) as Record<
    string,
    { files: number; loc: number }
  >;
  for (const l of profile.languages) {
    const share = 1 / profile.languages.length;
    byLanguage[l] = {
      files: Math.round(baseFiles * share),
      loc: Math.round(baseLoc * share)
    };
  }

  return {
    totalLoc: baseLoc,
    totalFiles: baseFiles,
    byLanguage
  };
}

// ── Default ignored paths ───────────────────────────────

function defaultIgnoredPaths(profile: ProjectProfile): string[] {
  const ignored: string[] = ['node_modules/', 'dist/', '.next/', '.git/', 'coverage/', '*.log', '.env', '.env.local'];
  if (profile.languages.includes('python')) {
    ignored.push('__pycache__/', '*.pyc', '.venv/');
  }
  if (profile.languages.includes('rust')) {
    ignored.push('target/');
  }
  if (profile.languages.includes('go')) {
    ignored.push('vendor/');
  }
  return ignored;
}

// ── Public API ──────────────────────────────────────────

/**
 * Generate a human-readable Markdown file tree.
 *
 * @param profile - Detected project profile
 * @returns       - Markdown content for `.agentsy/aft.md`
 */
export function generateAftMd(profile: ProjectProfile): string {
  const templates = getTemplates(profile);
  const stats = estimateStats(profile);
  const lang = languageLabel(profile);
  const ignored = defaultIgnoredPaths(profile);

  const lines: string[] = [
    '# Agent File Tree (AFT)',
    '',
    `*Auto-generated for ${profile.rootPath}*`,
    `*Generated at: ${new Date().toISOString()}*`,
    '',
    '## Top-Level Layout',
    '',
    '```',
    ...templates.map(t => t.path),
    '```',
    '',
    '## Entry Points',
    '',
    ...templates.filter(t => t.isEntry).map(t => `- \`${t.path}\` — ${t.description}`),
    '',
    '## Config Files',
    '',
    ...templates.filter(t => t.isConfig).map(t => `- \`${t.path}\` — ${t.description}`),
    '',
    '## Stats',
    '',
    `- **Total files**: ${stats.totalFiles}`,
    `- **Total LOC**: ${stats.totalLoc.toLocaleString()}`,
    `- **Primary language**: ${lang}`,
    '',
    ...Object.entries(stats.byLanguage).map(
      ([langName, langStats]) => `  - **${langName}**: ${langStats.files} files, ${langStats.loc.toLocaleString()} LOC`
    ),
    '',
    '## Ignored Paths',
    '',
    ...ignored.map(p => `- \`${p}\``),
    ''
  ];

  return lines.join('\n');
}

/**
 * Generate a JSON file tree for agent consumption.
 *
 * @param profile - Detected project profile
 * @returns       - JSON string for `.agentsy/aft.json`
 */
export function generateAftJson(profile: ProjectProfile): string {
  const templates = getTemplates(profile);
  const stats = estimateStats(profile);
  const ignored = defaultIgnoredPaths(profile);

  const layout: AftFileEntry[] = templates.map(t => {
    const language = resolveLanguage(t.path, profile);
    return {
      path: t.path,
      type: t.path.endsWith('/') ? 'dir' : 'file',
      loc: t.path.endsWith('/') ? 0 : 100,
      language,
      description: t.description
    };
  });

  const entryPoints = templates.filter(t => t.isEntry).map(t => t.path);

  const configFiles = templates.filter(t => t.isConfig).map(t => t.path);

  const json: AftJson = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    rootPath: profile.rootPath,
    layout,
    entryPoints,
    configFiles,
    stats,
    ignoredPaths: ignored
  };

  return `${JSON.stringify(json, null, 2)}\n`;
}
