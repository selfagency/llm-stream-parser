/**
 * Project CLI — scan, init, and update project configuration.
 *
 * ## Usage
 *
 * ```bash
 * agentsy project scan            — Re-run scanner and update .agentsy/config.yml
 * agentsy project init            — Generate .agentsy/config.yml, AGENTS.md, .agentsy/aft.{md,json}
 * agentsy project init --force    — Overwrite existing config
 * agentsy project update          — Re-scan and regenerate artifacts
 * ```
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type AgentsyConfig,
  configExists,
  createDefaultConfig,
  readConfig,
  scanProject,
  writeConfig
} from '@agentsy/bootstrap';
import { generateAftJson, generateAftMd, generateAgentsMd } from '@agentsy/bootstrap/generators';
import type { CliIO } from '../index.js';

// ── Help text ────────────────────────────────────────────

const HELP = `Usage: agentsy project <subcommand> [options]

Manage Agentsy project configuration and artifacts.

Subcommands:
  scan                  Re-run the project scanner and update .agentsy/config.yml
  init                  Generate .agentsy/config.yml, AGENTS.md, .agentsy/aft.{md,json}
  update                Re-scan and regenerate existing artifacts

Options:
  --force               Overwrite existing configuration (init only)
  --json                Output results as JSON (scan only)
  -h, --help            Show this help message

Examples:
  agentsy project scan
  agentsy project scan --json
  agentsy project init
  agentsy project init --force
  agentsy project update`;

const SCAN_HELP = `Usage: agentsy project scan [options]

Re-run the project scanner and update .agentsy/config.yml with the
detected project profile.

Options:
  --json        Output the project profile as JSON
  --help        Show this help message

Examples:
  agentsy project scan
  agentsy project scan --json`;

const INIT_HELP = `Usage: agentsy project init [options]

Generate .agentsy/config.yml, AGENTS.md, and .agentsy/aft.{md,json}
from the current project directory.

The init command runs the scanner first, then writes all artifacts.

Options:
  --force       Overwrite existing configuration if present
  --help        Show this help message

Examples:
  agentsy project init
  agentsy project init --force`;

const UPDATE_HELP = `Usage: agentsy project update [options]

Re-scan the project and regenerate .agentsy/config.yml, AGENTS.md,
and .agentsy/aft.{md,json} while preserving installed components.

Requires an existing .agentsy/config.yml — run "agentsy project init" first.

Options:
  --help        Show this help message

Examples:
  agentsy project update`;

// ── Flag helpers ─────────────────────────────────────────

function hasFlag(args: readonly string[], flag: string): boolean {
  return args.includes(flag);
}

// ── Artifact writers ─────────────────────────────────────

async function writeArtifacts(rootPath: string, config: AgentsyConfig, io: CliIO): Promise<void> {
  const agentsMd = generateAgentsMd(config.project.profile, config);
  const aftMd = generateAftMd(config.project.profile);
  const aftJson = generateAftJson(config.project.profile);

  await mkdir(join(rootPath, '.agentsy'), { recursive: true });

  await writeFile(join(rootPath, 'AGENTS.md'), agentsMd, 'utf-8');
  await writeFile(join(rootPath, '.agentsy', 'aft.md'), aftMd, 'utf-8');
  await writeFile(join(rootPath, '.agentsy', 'aft.json'), aftJson, 'utf-8');

  const out = io.stdout ?? console.log;
  out('  \u2713 .agentsy/config.yml');
  out('  \u2713 AGENTS.md');
  out('  \u2713 .agentsy/aft.md');
  out('  \u2713 .agentsy/aft.json');
}

// ── Subcommand handlers ──────────────────────────────────

async function handleScan(rest: readonly string[], io: CliIO): Promise<number> {
  const stdout = io.stdout ?? console.log;
  const stderr = io.stderr ?? console.error;

  stdout('Scanning project...');
  try {
    const profile = await scanProject(process.cwd());
    const config = createDefaultConfig(process.cwd(), profile);
    await writeConfig(process.cwd(), config);

    if (hasFlag(rest, '--json')) {
      stdout(JSON.stringify(profile, null, 2));
    } else {
      stdout(`Scan complete — ${profile.languages.join(', ')} project`);
      stdout(`  Languages:      ${profile.languages.join(', ')}`);
      stdout(`  Frameworks:     ${profile.frameworks.join(', ') || '(none detected)'}`);
      stdout(`  Package manager: ${profile.packageManager}`);
      stdout(`  Build system:   ${profile.buildSystem}`);
      stdout(`  Monorepo:       ${profile.monorepo ? 'Yes' : 'No'}`);
      stdout(`  Test runners:   ${profile.testRunner.join(', ') || '(none detected)'}`);
      stdout(`  CI:             ${profile.ci.join(', ') || '(none detected)'}`);
    }
    return 0;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`Scan failed: ${message}`);
    return 1;
  }
}

async function handleInit(rest: readonly string[], io: CliIO): Promise<number> {
  const stdout = io.stdout ?? console.log;
  const stderr = io.stderr ?? console.error;

  const exists = await configExists(process.cwd());
  if (exists && !hasFlag(rest, '--force')) {
    stderr('Project already initialized. Use --force to overwrite.');
    return 1;
  }

  stdout('Initializing Agentsy project...');
  try {
    const profile = await scanProject(process.cwd());
    const config = createDefaultConfig(process.cwd(), profile);
    const updatedConfig: AgentsyConfig = {
      ...config,
      artifacts: {
        agentsMd: true,
        aft: true,
        magicContext: false
      }
    };
    await writeConfig(process.cwd(), updatedConfig);
    await writeArtifacts(process.cwd(), updatedConfig, io);
    stdout('Initialized successfully.');
    return 0;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`Init failed: ${message}`);
    return 1;
  }
}

async function handleUpdate(_rest: readonly string[], io: CliIO): Promise<number> {
  const stdout = io.stdout ?? console.log;
  const stderr = io.stderr ?? console.error;

  const existing = await readConfig(process.cwd());
  if (existing === null) {
    stderr('No .agentsy/config.yml found. Run "agentsy project init" first.');
    return 1;
  }

  stdout('Updating Agentsy project...');
  try {
    const profile = await scanProject(process.cwd());
    const updatedConfig: AgentsyConfig = {
      ...existing,
      project: {
        ...existing.project,
        profile,
        detectedAt: new Date().toISOString()
      }
    };
    updatedConfig.project.profile = profile;
    updatedConfig.project.detectedAt = new Date().toISOString();
    await writeConfig(process.cwd(), updatedConfig);
    await writeArtifacts(process.cwd(), updatedConfig, io);
    stdout('Updated successfully.');
    return 0;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`Update failed: ${message}`);
    return 1;
  }
}

// ── Entry point ──────────────────────────────────────────

export async function runProjectCommand(argv: readonly string[], io: CliIO = {}): Promise<number> {
  const stdout = io.stdout ?? console.log;
  const stderr = io.stderr ?? console.error;

  const subcommand = argv[0];
  const rest = argv.slice(1);

  // Handle --help / -h at top level
  if (subcommand === '--help' || subcommand === '-h' || subcommand === undefined) {
    stdout(HELP);
    return 0;
  }

  switch (subcommand) {
    case 'scan': {
      if (hasFlag(rest, '--help')) {
        stdout(SCAN_HELP);
        return 0;
      }
      return await handleScan(rest, io);
    }

    case 'init': {
      if (hasFlag(rest, '--help')) {
        stdout(INIT_HELP);
        return 0;
      }
      return await handleInit(rest, io);
    }

    case 'update': {
      if (hasFlag(rest, '--help')) {
        stdout(UPDATE_HELP);
        return 0;
      }
      return await handleUpdate(rest, io);
    }

    default: {
      stderr(`Unknown project subcommand: ${subcommand}`);
      stderr('Supported: scan, init, update');
      return 1;
    }
  }
}
