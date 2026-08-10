/**
 * AGENTS.md generator — produces a project-context file for AI agents.
 *
 * @module
 */

import type { AgentsyConfig } from '../config.js';
import type { ProjectProfile } from '../scanner.js';

// ── Atlas manifest (optional, passed by caller) ────────────────────────

/**
 * Optional Atlas manifest data to include in the generated AGENTS.md.
 * This is a structural subset of @agentsy/atlas's AtlasManifest —
 * passed as plain data so bootstrap doesn't depend on @agentsy/atlas.
 */
export interface AtlasManifestData {
  aiTasks: readonly string[];
  constraints: readonly string[];
  humanTasks: readonly string[];
  layer?: string;
  systemTasks: readonly string[];
  touchpoints: readonly string[];
}

// ── Helpers ─────────────────────────────────────────────

function bulletList(items: readonly string[]): string {
  if (items.length === 0) {
    return '  - *none detected*';
  }
  return items.map(i => `  - ${i}`).join('\n');
}

function commandHint(pm: string, script: string): string {
  let prefix: string;
  if (pm === 'pnpm') {
    prefix = 'pnpm';
  } else if (pm === 'yarn') {
    prefix = 'yarn';
  } else {
    prefix = 'npm run';
  }
  return `${prefix} ${script}`;
}

function formatPm(profile: ProjectProfile): string {
  if (profile.monorepoTool) {
    return `${profile.packageManager} (${profile.monorepoTool} workspace)`;
  }
  return profile.packageManager;
}

// ── Section builders ────────────────────────────────────

function buildOverview(profile: ProjectProfile): string {
  const lines: string[] = [
    '## Project',
    '',
    `- **Languages**: ${profile.languages.join(', ') || '*none detected*'}`,
    `- **Frameworks**: ${profile.frameworks.join(', ') || '*none detected*'}`,
    `- **Package Manager**: ${formatPm(profile)}`,
    `- **Build System**: ${profile.buildSystem}`,
    `- **Monorepo**: ${profile.monorepo ? `Yes (${profile.monorepoTool ?? 'workspace'})` : 'No'}`,
    `- **CI**: ${profile.ci.join(', ') || '*none detected*'}`,
    `- **Deployment**: ${profile.deploymentTarget.join(', ') || '*none detected*'}`
  ];
  return lines.join('\n');
}

function buildCommands(profile: ProjectProfile): string {
  const pm = profile.packageManager;
  const lines: string[] = ['## Commands', ''];

  // Build
  lines.push('### Build');
  lines.push(`- \`${commandHint(pm, 'build')}\` — Build the project`);
  if (profile.monorepo) {
    const buildFilterCmd = commandHint(pm, 'build --filter=<package>');
    lines.push(`- \`${buildFilterCmd}\` — Build a specific package`);
  }
  lines.push('');

  // Test
  if (profile.testRunner.length > 0) {
    lines.push('### Test');
    for (const runner of profile.testRunner) {
      lines.push(`- \`${commandHint(pm, 'test')}\` — Run ${runner} tests`);
    }
    lines.push('');
  }

  // Lint
  if (profile.linter.length > 0) {
    lines.push('### Lint / Format');
    for (const linter of profile.linter) {
      lines.push(`- \`${commandHint(pm, 'lint')}\` — Run ${linter}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function buildLayout(profile: ProjectProfile): string {
  const lines: string[] = ['## Project Layout', '', '```'];

  if (profile.monorepo) {
    lines.push('packages/          — Workspace packages');
    lines.push('  */src/           — Source code per package');
    lines.push('  */test/          — Tests per package');
  } else if (profile.frameworks.includes('next.js')) {
    lines.push('src/               — Application source');
    lines.push('  app/             — Next.js App Router pages & layouts');
    lines.push('  components/      — Shared UI components');
    lines.push('  lib/             — Utilities and business logic');
    lines.push('public/            — Static assets');
  } else if (profile.frameworks.includes('react')) {
    lines.push('src/               — Application source');
    lines.push('  components/      — UI components');
    lines.push('  hooks/           — Custom React hooks');
    lines.push('  lib/             — Utilities');
  } else {
    lines.push('src/               — Source code');
  }

  lines.push('config files        — At project root');
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}

function buildConventions(profile: ProjectProfile): string {
  const lines: string[] = ['## Conventions', ''];

  if (profile.languages.includes('typescript')) {
    lines.push('- **TypeScript** — strict mode enabled');
  }

  if (profile.frameworks.includes('next.js')) {
    lines.push('- **App Router** — file-based routing in `src/app/`');
    lines.push('- **Server Components** by default; use `"use client"` for interactivity');
  }

  if (profile.monorepo) {
    lines.push('- **Package isolation** — each package owns its dependencies');
    lines.push('- **Shared config** — root-level config files extend per-package');
  }

  for (const linter of profile.linter) {
    if (linter === 'biome') {
      lines.push('- **Biome** — formatting & linting via ultracite preset');
    } else {
      lines.push(`- **${linter}** — code quality enforcement`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

function buildGotchas(profile: ProjectProfile): string {
  const lines: string[] = ['## Gotchas', ''];

  if (profile.monorepo) {
    lines.push('- Always pass `--filter` to scope commands to the right package');
    lines.push('- Cross-package imports must use workspace protocol (`workspace:*`)');
    lines.push('- Build order matters — dependents must build after dependencies');
  }

  if (profile.frameworks.includes('next.js')) {
    lines.push('- Server Components cannot use hooks or browser APIs');
    lines.push('- Dynamic routes without `generateStaticParams` are SSR-only');
    lines.push('- Environment variables must be prefixed with `NEXT_PUBLIC_` for client access');
  }

  if (profile.linter.includes('eslint')) {
    lines.push('- ESLint config may be split across `.eslintrc.*` and `eslint.config.*` — check which is active');
  }

  if (profile.linter.includes('biome')) {
    lines.push('- Biome does not support custom plugins — use ESLint alongside if plugin support is needed');
  }

  lines.push('');
  return lines.join('\n');
}

function buildAgentsyComponents(config: AgentsyConfig): string {
  const { installed } = config;
  const lines: string[] = ['## Agentsy Components', ''];

  const sections: ReadonlyArray<{ title: string; items: readonly string[] }> = [
    { title: 'Connectors', items: installed.connectors },
    { title: 'MCP Servers', items: installed.mcpServers },
    { title: 'Skills', items: installed.skills },
    { title: 'Guardrails', items: installed.guardrails },
    { title: 'Hooks', items: installed.hooks }
  ];

  let anyInstalled = false;
  for (const section of sections) {
    if (section.items.length > 0) {
      anyInstalled = true;
      lines.push(`### ${section.title}`);
      lines.push(bulletList(section.items));
      lines.push('');
    }
  }

  if (!anyInstalled) {
    lines.push('*No agentsy components installed yet.*');
    lines.push('');
  }

  return lines.join('\n');
}

function buildDoDont(): string {
  return [
    "## Do ✅ / Don't ❌",
    '',
    '✅ **Do**:',
    '  - Use TypeScript strict mode — no `any` types, prefer `unknown`',
    '  - Follow existing naming conventions observed in the codebase',
    '  - Write tests alongside new features (TDD preferred)',
    '  - Check `pnpm check-types` and `pnpm test` before committing',
    '  - Use the package manager specified below for all operations',
    '',
    "❌ **Don't**:",
    '  - Use `any` — narrow types with `unknown`, unions, or generics',
    '  - Skip linting or type-checking gates',
    '  - Add dependencies without workspace protocol in monorepos',
    '  - Hardcode secrets or API keys',
    '  - Modify `AGENTS.md` manually — re-run the generator instead',
    ''
  ].join('\n');
}

function buildAtlasManifest(manifest: AtlasManifestData): string {
  const lines: string[] = ['## Agent Atlas Manifest', ''];

  if (manifest.layer) {
    lines.push(`- **Layer**: \`${manifest.layer}\``);
  }

  if (manifest.aiTasks.length > 0) {
    lines.push(`- **AI Tasks**: ${manifest.aiTasks.map(t => `\`${t}\``).join(', ')}`);
  }
  if (manifest.humanTasks.length > 0) {
    lines.push(`- **Human Tasks**: ${manifest.humanTasks.map(t => `\`${t}\``).join(', ')}`);
  }
  if (manifest.systemTasks.length > 0) {
    lines.push(`- **System Tasks**: ${manifest.systemTasks.map(t => `\`${t}\``).join(', ')}`);
  }
  if (manifest.constraints.length > 0) {
    lines.push(`- **Constraints**: ${manifest.constraints.map(c => `\`${c}\``).join(', ')}`);
  }
  if (manifest.touchpoints.length > 0) {
    lines.push(`- **Touchpoints**: ${manifest.touchpoints.map(t => `\`${t}\``).join(', ')}`);
  }

  lines.push('');
  lines.push(
    '> These IDs reference the [AI Interaction Atlas](https://github.com/quietloudlab/ai-interaction-atlas) taxonomy.'
  );
  lines.push('> See `@agentsy/atlas` for the full pattern definitions.');
  lines.push('');

  return lines.join('\n');
}

// ── Main generator ──────────────────────────────────────

/**
 * Generate AGENTS.md content from a project profile and agentsy configuration.
 *
 * @param profile - Detected project profile
 * @param config  - Current agentsy configuration
 * @param atlas   - Optional Atlas manifest data to include in the file
 * @returns       - Complete AGENTS.md content
 */
export function generateAgentsMd(profile: ProjectProfile, config: AgentsyConfig, atlas?: AtlasManifestData): string {
  const sections: string[] = [
    '# AGENTS.md — Project Overview for AI Agents',
    '',
    `*Auto-generated at ${new Date().toISOString()} — edit profile in \`.agentsy/config.yml\` and re-run to update.*`,
    '',
    buildOverview(profile),
    '',
    buildCommands(profile),
    buildLayout(profile),
    buildConventions(profile),
    buildGotchas(profile),
    buildAgentsyComponents(config)
  ];

  if (atlas) {
    sections.push(buildAtlasManifest(atlas));
  }

  sections.push(buildDoDont());

  return `${sections.join('\n').trim()}\n`;
}
