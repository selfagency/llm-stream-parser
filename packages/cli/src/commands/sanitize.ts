/**
 * Sanitize CLI — local trust sanitization for logs, configs, prompts, and incidents.
 *
 * ## Usage
 *
 * ```bash
 * agentsy sanitize --input log.txt --output safe.log --mode logs
 * agentsy sanitize --input config.yaml --mode config --emit json
 * agentsy sanitize --stdin --mode logs
 * agentsy sanitize rules list
 * agentsy sanitize rules add --pattern '...' --replacement '[REDACTED]'
 * agentsy sanitize rules import ./rules.json
 * agentsy sanitize rules export ./rules.json
 * ```
 *
 * @module
 */

import { readFile, writeFile } from 'node:fs/promises';
import {
  exportRedactionRules,
  getGlobalRulesPath,
  getWorkspaceRulesPath,
  importRedactionRules,
  loadRedactionRules,
  type RedactionRule,
  type RedactionRulesDocument,
  type SanitizeMode,
  type SanitizeResult,
  sanitize
} from '@agentsy/guardrails/sanitize';
import type { CliIO } from '../index.js';

// ── Helpers ─────────────────────────────────────────────

function getFlagValue(args: readonly string[], flag: string): string | null {
  const index = args.indexOf(flag);
  if (index >= 0 && index + 1 < args.length) {
    return args[index + 1] ?? null;
  }
  return null;
}

function hasFlag(args: readonly string[], flag: string): boolean {
  return args.includes(flag);
}

function getMode(raw: string | null): SanitizeMode {
  if (raw === 'logs' || raw === 'config' || raw === 'prompt' || raw === 'incident') {
    return raw;
  }
  return 'logs';
}

// ── Input Reader ───────────────────────────────────────

async function readInput(
  stdin: boolean,
  inputPath: string | null,
  stderr: (msg: string) => void
): Promise<string | null> {
  if (stdin) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf-8');
  }

  if (inputPath) {
    try {
      return await readFile(inputPath, 'utf-8');
    } catch (error) {
      stderr(`Error reading input file: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  return null;
}

// ── Output Writer ──────────────────────────────────────

async function writeOutput(
  result: SanitizeResult,
  outputPath: string | null,
  emitJson: boolean,
  stdout: (msg: string) => void,
  stderr: (msg: string) => void,
  mode: string
): Promise<number> {
  if (emitJson) {
    stdout(JSON.stringify(result, null, 2));
    return 0;
  }

  stdout(`Sanitization complete (mode: ${mode})`);
  stdout(`  Detections: ${result.summary.totalDetections}`);
  if (result.summary.hasUnredactedWarnings) {
    stdout('  ⚠ Warning: Output may still contain unredacted URLs, tokens, or secrets.');
  }
  stdout('');

  if (outputPath) {
    try {
      await writeFile(outputPath, result.sanitized, 'utf-8');
      stdout(`Output written to: ${outputPath}`);
    } catch (error) {
      stderr(`Error writing output file: ${error instanceof Error ? error.message : String(error)}`);
      return 1;
    }
  } else {
    stdout('--- Sanitized Output ---');
    stdout(result.sanitized);
    stdout('--- End ---');
  }

  return 0;
}

// ── Subcommand Handlers ────────────────────────────────

async function handleSanitizeCommand(rest: readonly string[], io: CliIO): Promise<number> {
  const stdin = hasFlag(rest, '--stdin');
  const inputPath = getFlagValue(rest, '--input');
  const outputPath = getFlagValue(rest, '--output');
  const mode = getMode(getFlagValue(rest, '--mode'));
  const emitJson = hasFlag(rest, '--emit') && getFlagValue(rest, '--emit') === 'json';
  const stdout = io.stdout ?? console.log;
  const stderr = io.stderr ?? console.error;

  const input = await readInput(stdin, inputPath, stderr);
  if (input === null) {
    if (!(stdin || inputPath)) {
      stderr('Missing input. Provide --input <file> or --stdin.');
      stderr('');
      stderr('Usage: agentsy sanitize --input <file> [--output <file>] [--mode logs|config|prompt|incident]');
      stderr('       agentsy sanitize --stdin --mode logs');
    }
    return 1;
  }

  const customRules = await loadRedactionRules();

  let result: SanitizeResult;
  try {
    result = await sanitize(input, mode, { customRules });
  } catch (error) {
    stderr(`Sanitization error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  return writeOutput(result, outputPath, emitJson, stdout, stderr, mode);
}

async function handleRulesList(rest: readonly string[], io: CliIO): Promise<number> {
  const stdout = io.stdout ?? console.log;
  const stderr = io.stderr ?? console.error;
  const emitJson = hasFlag(rest, '--json');

  try {
    const engine = await loadRedactionRules();
    const rules = engine.rules;

    if (emitJson) {
      stdout(JSON.stringify(rules, null, 2));
      return 0;
    }

    if (rules.length === 0) {
      stdout('No redaction rules configured.');
      stdout('');
      stdout(`Global rules file: ${getGlobalRulesPath()}`);
      stdout(`Workspace rules file: ${getWorkspaceRulesPath()}`);
      stdout('');
      stdout('Add a rule: agentsy sanitize rules add --pattern <regex> --replacement <text>');
      return 0;
    }

    stdout(`Redaction rules (${rules.length}):`);
    stdout('');
    for (const rule of rules) {
      const status = rule.enabled ? '✓' : '✗';
      stdout(`  ${status} ${rule.id}: ${rule.name}`);
      stdout(`      Pattern:     ${rule.pattern}`);
      stdout(`      Replacement: ${rule.replacement}`);
      stdout(`      Scope:       ${rule.scope.join(', ')}`);
      stdout('');
    }
  } catch (error) {
    stderr(`Error loading rules: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  return 0;
}

async function handleRulesAdd(rest: readonly string[], io: CliIO): Promise<number> {
  const stdout = io.stdout ?? console.log;
  const stderr = io.stderr ?? console.error;
  const pattern = getFlagValue(rest, '--pattern');
  const replacement = getFlagValue(rest, '--replacement');
  const name = getFlagValue(rest, '--name') ?? 'Custom Rule';
  const id = getFlagValue(rest, '--id') ?? `custom-${Date.now()}`;
  const scopeRaw = getFlagValue(rest, '--scope') ?? 'logs,config,prompt,incident';
  const scope = scopeRaw
    .split(',')
    .filter(s => s === 'logs' || s === 'config' || s === 'prompt' || s === 'incident') as Array<
    'logs' | 'config' | 'prompt' | 'incident'
  >;

  if (!pattern) {
    stderr('Missing --pattern. Usage: agentsy sanitize rules add --pattern <regex> --replacement <text>');
    return 1;
  }

  const newRule: RedactionRule = {
    id,
    name,
    pattern,
    replacement: replacement ?? '[REDACTED]',
    enabled: true,
    scope
  };

  // Load existing rules, append, write to workspace
  const targetPath = getWorkspaceRulesPath();
  let existing: RedactionRule[] = [];
  try {
    const engine = await loadRedactionRules();
    existing = [...engine.rules];
  } catch {
    // No existing rules
  }

  existing.push(newRule);
  const doc: RedactionRulesDocument = { version: 1, rules: existing };
  await writeFile(targetPath, JSON.stringify(doc, null, 2), 'utf-8');

  stdout(`Rule added: ${newRule.id} (${newRule.name})`);
  stdout(`Written to: ${targetPath}`);
  return 0;
}

async function handleRulesImport(rest: readonly string[], io: CliIO): Promise<number> {
  const stdout = io.stdout ?? console.log;
  const stderr = io.stderr ?? console.error;
  const filePath = rest[0];

  if (!filePath) {
    stderr('Usage: agentsy sanitize rules import <file.json>');
    return 1;
  }

  try {
    const imported = await importRedactionRules(filePath);
    const targetPath = getWorkspaceRulesPath();
    const doc: RedactionRulesDocument = { version: 1, rules: imported };
    await writeFile(targetPath, JSON.stringify(doc, null, 2), 'utf-8');
    stdout(`Imported ${imported.length} rules from ${filePath}`);
    stdout(`Written to: ${targetPath}`);
  } catch (error) {
    stderr(`Import error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  return 0;
}

async function handleRulesExport(rest: readonly string[], io: CliIO): Promise<number> {
  const stdout = io.stdout ?? console.log;
  const stderr = io.stderr ?? console.error;
  const filePath = rest[0];

  if (!filePath) {
    stderr('Usage: agentsy sanitize rules export <file.json>');
    return 1;
  }

  try {
    const engine = await loadRedactionRules();
    await exportRedactionRules([...engine.rules], filePath);
    stdout(`Exported ${engine.rules.length} rules to ${filePath}`);
  } catch (error) {
    stderr(`Export error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  return 0;
}

// ── Entry Point ─────────────────────────────────────────

export async function runSanitizeCommand(argv: readonly string[], io: CliIO = {}): Promise<number> {
  const subcommand = argv[0];
  const rest = argv.slice(1);

  if (subcommand === 'rules') {
    const rulesSub = rest[0];
    const rulesRest = rest.slice(1);

    if (rulesSub === 'list') {
      return await handleRulesList(rulesRest, io);
    }
    if (rulesSub === 'add') {
      return await handleRulesAdd(rulesRest, io);
    }
    if (rulesSub === 'import') {
      return await handleRulesImport(rulesRest, io);
    }
    if (rulesSub === 'export') {
      return await handleRulesExport(rulesRest, io);
    }

    (io.stderr ?? console.error)(`Unknown rules subcommand: ${rulesSub ?? '(none)'}`);
    (io.stderr ?? console.error)('Supported: list, add, import, export');
    return 1;
  }

  // Default: sanitize
  return await handleSanitizeCommand(argv, io);
}
