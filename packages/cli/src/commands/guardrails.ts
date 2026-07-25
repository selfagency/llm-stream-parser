/**
 * Guardrails CLI — manage guardrail scanner configuration and policies.
 *
 * ## Usage
 *
 * ```bash
 * agentsy guardrails list
 * agentsy guardrails install <hub-uri>
 * agentsy guardrails uninstall <hub-uri>
 * agentsy guardrails policy [path] [--test-input <json>]
 * agentsy guardrails test <policy-path> <input>
 * agentsy guardrails hub <hub-uri>
 * ```
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import type { GuardrailDecisionReceipt, GuardrailPhase, GuardrailScanner } from '@agentsy/guardrails';
import {
  BUILTIN_GUARDRAIL_URIS,
  createBuiltinScanners,
  GuardrailHub,
  type HubUri,
  type PolicyDocument,
  PolicyEnforcer,
  type PolicyRule,
  parseHubUri
} from '@agentsy/guardrails';
import { dump as dumpYaml, load as loadYaml } from 'js-yaml';
import { z } from 'zod';
import type { CliIO } from '../index.js';

const defaultIo: Required<CliIO> = {
  stderr: (msg: string): void => {
    console.error(msg);
  },
  stdout: (msg: string): void => {
    console.log(msg);
  }
};

// =============================================================================
// Zod schemas for policy validation
// =============================================================================

const PolicyActionSchema = z.enum(['deny', 'require_approval', 'allow', 'log', 'redact']);

const GuardrailPhaseSchema = z.enum([
  'input',
  'retrieval',
  'memory',
  'tool-input',
  'tool-output',
  'action',
  'approval',
  'output',
  'egress'
]);

const SeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);

const PolicyRuleSchema = z.object({
  name: z.string().min(1, 'Rule name is required'),
  condition: z.string().min(1, 'Rule condition is required'),
  action: PolicyActionSchema,
  description: z.string().optional(),
  phase: GuardrailPhaseSchema.optional(),
  severity: SeveritySchema.optional()
});

const PolicyDocumentSchema = z.object({
  version: z.string().default('1.0'),
  description: z.string().optional(),
  rules: z.array(PolicyRuleSchema).default([])
});

// =============================================================================
// Help text
// =============================================================================

const HELP_EXAMPLES = {
  list: `Usage: agentsy guardrails list [--json]

List installed guardrail scanners.

Options:
  --json        Output in JSON format

Examples:
  agentsy guardrails list
  agentsy guardrails list --json`,

  install: `Usage: agentsy guardrails install <hub-uri>

Install a guardrail scanner by hub URI. Persists the URI to
.agentsy/guardrails.yaml so it is loaded on daemon start.

Built-in URIs can be referenced by name (e.g., prompt-injection)
or full URI (hub://guardrails/prompt-injection@1.0).

Examples:
  agentsy guardrails install hub://guardrails/prompt-injection@1.0
  agentsy guardrails install hub://guardrails/pii@2.0`,

  uninstall: `Usage: agentsy guardrails uninstall <hub-uri>

Remove a previously installed guardrail scanner.

Examples:
  agentsy guardrails uninstall hub://guardrails/prompt-injection@1.0`,

  policy: `Usage: agentsy guardrails policy [path] [options]

Validate a policy YAML file against actual scanner capabilities.
Optionally test-evaluate against sample inputs.

Arguments:
  path          Path to policy YAML file (default: ./.agentsy/policy.yaml)

Options:
  --json        Output parsed policy as JSON
  --test-input  JSON string of sample inputs to test-evaluate against
                Format: {"input": "...", "toolName": "...", "annotations": {...}}

Examples:
  agentsy guardrails policy
  agentsy guardrails policy ./my-policy.yaml
  agentsy guardrails policy --json
  agentsy guardrails policy --test-input '{"input":"rm -rf /","toolName":"shell_exec"}'`,

  test: `Usage: agentsy guardrails test <policy-path> <input>

Evaluate a policy against an input string and print the decision receipt.
Supports --json for machine-readable output.

Arguments:
  policy-path   Path to policy YAML file
  input         Input string to evaluate

Options:
  --json        Output receipt as JSON
  --tool        Tool name for context (e.g., "shell_exec")
  --phase       Guardrail phase (default: "tool-input")

Examples:
  agentsy guardrails test ./policy.yaml "rm -rf /"
  agentsy guardrails test ./policy.yaml "rm -rf /" --json
  agentsy guardrails test ./policy.yaml "cat file.txt" --tool read_file`,

  hub: `Usage: agentsy guardrails hub <hub-uri>

Resolve a hub URI by importing the package or file and registering
it as a guardrail scanner in the hub.

Supported schemes:
  npm://@scope/name   Import an npm package's default export
  file:///path/to/module   Import a local TypeScript/JavaScript module

Examples:
  agentsy guardrails hub npm://@agentsy/guardrails-toxicity
  agentsy guardrails hub file:///opt/guardrails/custom-scanner.js`
};

// =============================================================================
// Subcommand handlers (exported for testing)
// =============================================================================

export interface GuardrailCliOptions {
  hub: GuardrailHub;
  json: boolean;
  noColor: boolean;
  stderr: (msg: string) => void;
  stdout: (msg: string) => void;
}

const BUILTIN_URI_VALUES: readonly string[] = Object.values(BUILTIN_GUARDRAIL_URIS);

function createSeededHub(): GuardrailHub {
  const hub = new GuardrailHub();

  for (const scanner of createBuiltinScanners()) {
    const uri = scanner.metadata.id;
    hub.install(uri, scanner.constructor.name, scanner.metadata.description, () => scanner);
  }

  return hub;
}

// =============================================================================
// Persistent config helpers
// =============================================================================

/**
 * Path to the persistent guardrails config file.
 */
function guardrailsConfigPath(): string {
  return resolve('.agentsy/guardrails.yaml');
}

/**
 * Ensure the .agentsy directory exists.
 */
function ensureDotAgentsy(): void {
  const dir = resolve('.agentsy');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Read installed guardrail URIs from the persistent config file.
 */
function readInstalledUris(): string[] {
  const configPath = guardrailsConfigPath();
  if (!existsSync(configPath)) {
    return [];
  }
  try {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = loadYaml(raw);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      const uris = record.installed;
      if (Array.isArray(uris)) {
        return uris.filter((u): u is string => typeof u === 'string');
      }
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Write installed guardrail URIs to the persistent config file.
 * Preserves existing config keys and merges installed URIs.
 */
function writeInstalledUris(uris: string[]): void {
  ensureDotAgentsy();
  const configPath = guardrailsConfigPath();
  let existing: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, 'utf-8');
      const parsed = loadYaml(raw);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        existing = parsed as Record<string, unknown>;
      }
    } catch {
      // Start fresh if file is corrupt
    }
  }
  existing.installed = [...new Set(uris)];
  const yaml = dumpYaml(existing);
  writeFileSync(configPath, yaml, 'utf-8');
}

/**
 * Read and parse a policy YAML file with Zod validation.
 */
function readAndValidatePolicy(filePath: string): PolicyDocument {
  const raw = readFileSync(resolve(filePath), 'utf-8');
  const parsed = loadYaml(raw);

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Policy file must contain a YAML object with version and rules');
  }

  const validated = PolicyDocumentSchema.parse(parsed);

  return validated as PolicyDocument;
}

// =============================================================================
// Scanner capability introspection
// =============================================================================

interface ScannerCapability {
  description: string;
  id: string;
  name: string;
  owaspCategories: readonly string[];
  priority: number;
  tags: readonly string[];
  version: string;
}

function getScannerCapabilities(hub: GuardrailHub): ScannerCapability[] {
  return hub.listInstalled().map(entry => ({
    id: entry.uri,
    name: entry.name,
    description: entry.description,
    tags: [],
    owaspCategories: [],
    priority: 0,
    version: entry.uri.split('@').pop() ?? '0.0.0'
  }));
}

/**
 * Try to extract meaningful condition terms from a policy condition expression
 * so we can check against installed scanner tags/names.
 */
function extractConditionTerms(condition: string): string[] {
  const terms: string[] = [];
  const toolNameMatch = /tool\.name\s*==\s*'([^']+)'/.exec(condition);
  if (toolNameMatch?.[1]) {
    terms.push(toolNameMatch[1]);
  }
  const tagMatch = /tool\.annotations\.(\w+)/.exec(condition);
  if (tagMatch?.[1]) {
    terms.push(tagMatch[1]);
  }
  return terms;
}

/**
 * Validate a policy rule against known scanner capabilities.
 * Returns a list of warnings.
 */
function validateRuleAgainstCapabilities(rule: PolicyRule, capabilities: ScannerCapability[]): string[] {
  const warnings: string[] = [];
  const terms = extractConditionTerms(rule.condition);

  for (const term of terms) {
    const matched = capabilities.some(
      cap =>
        cap.name.toLowerCase().includes(term.toLowerCase()) ||
        cap.tags.some(t => t.toLowerCase().includes(term.toLowerCase())) ||
        cap.description.toLowerCase().includes(term.toLowerCase())
    );
    if (!matched) {
      warnings.push(
        `Condition term "${term}" in rule "${rule.name}" does not match any installed scanner name, tag, or description`
      );
    }
  }

  return warnings;
}

// =============================================================================
// Decision receipt formatting
// =============================================================================

function formatReceipt(receipt: GuardrailDecisionReceipt, json: boolean): string {
  if (json) {
    return JSON.stringify(receipt, null, 2);
  }

  const lines: string[] = [
    'Guardrail Decision Receipt',
    '═══════════════════════════',
    `  Policy:        ${receipt.policyId}`,
    `  Decision:      ${receipt.decision}`,
    `  Reason Code:   ${receipt.reasonCode}`,
    `  Risk Tier:     ${receipt.riskTier}`,
    `  Phase:         ${receipt.phase}`,
    `  Surface:       ${receipt.surface}`,
    `  Session:       ${receipt.sessionId}`,
    `  Timestamp:     ${receipt.timestamp}`,
    `  Correlation:   ${receipt.correlationId}`,
    `  Detections:    ${receipt.detections.length}`
  ];

  if (receipt.detections.length > 0) {
    lines.push('');
    lines.push('Detections:');
    for (const det of receipt.detections) {
      lines.push(`  - ${det.id} (${det.severity})`);
      if (det.description) {
        lines.push(`    ${det.description}`);
      }
      if (det.snippet) {
        lines.push(`    Snippet: ${det.snippet}`);
      }
    }
  }

  if (receipt.sanitized !== undefined) {
    lines.push('');
    lines.push('Sanitized Output:');
    lines.push(`  ${receipt.sanitized}`);
  }

  return lines.join('\n');
}

// =============================================================================
// Flag helpers
// =============================================================================

function hasFlag(args: readonly string[], flag: string): boolean {
  return args.includes(flag);
}

function getFlagValue(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1 || index + 1 >= args.length) {
    return;
  }
  return args[index + 1];
}

function stripFlags(args: readonly string[]): string[] {
  return args.filter(a => !a.startsWith('--'));
}

// =============================================================================
// Built-in hub registration
// =============================================================================

// =============================================================================
// Subcommand handlers (exported for testing)
// =============================================================================

export function handleList(_argv: readonly string[], opts: GuardrailCliOptions): number {
  if (hasFlag(_argv, '--help')) {
    opts.stdout(HELP_EXAMPLES.list);
    return 0;
  }

  const entries = opts.hub.listInstalled();

  if (opts.json) {
    opts.stdout(
      JSON.stringify(
        entries.map(e => ({
          uri: e.uri,
          name: e.name,
          description: e.description,
          installedAt: e.installedAt?.toISOString()
        })),
        null,
        2
      )
    );
    return 0;
  }

  if (entries.length === 0) {
    opts.stdout('No guardrails installed.');
    return 0;
  }

  opts.stdout(`Installed guardrails (${entries.length}):`);
  opts.stdout('');
  for (const entry of entries) {
    opts.stdout(`  ${entry.uri}`);
    opts.stdout(`    Name:        ${entry.name}`);
    opts.stdout(`    Description: ${entry.description}`);
    opts.stdout(`    Installed:   ${entry.installedAt?.toISOString() ?? 'unknown'}`);
    opts.stdout('');
  }
  return 0;
}

export function handleInstall(argv: readonly string[], opts: GuardrailCliOptions): number {
  if (hasFlag(argv, '--help')) {
    opts.stdout(HELP_EXAMPLES.install);
    return 0;
  }

  const positional = stripFlags(argv);
  const uri = positional[0];

  if (uri === undefined || uri.length === 0) {
    opts.stderr('Usage: agentsy guardrails install <hub-uri>');
    opts.stderr('');
    opts.stderr('Built-in URIs:');
    for (const builtin of BUILTIN_URI_VALUES) {
      opts.stderr(`  ${builtin}`);
    }
    return 1;
  }

  const parsed = parseHubUri(uri);
  if (parsed === null) {
    opts.stderr(`Invalid hub URI: ${uri}`);
    opts.stderr('Expected format: hub://guardrails/<name>[@version]');
    return 1;
  }

  if (opts.hub.isInstalled(uri)) {
    opts.stdout(`Already installed: ${uri}`);
    return 0;
  }

  // Try to match against known builtin scanners by name component
  const matchKey = BUILTIN_URI_VALUES.find(u => {
    if (u === uri) {
      return true;
    }
    // Compare the name segment (last path component, ignoring @version)
    const builtinName = u.split('/').pop()?.split('@')[0];
    const inputName = uri.split('/').pop()?.split('@')[0];
    return builtinName !== undefined && builtinName === inputName;
  });
  if (matchKey !== undefined) {
    // Create a new hub instance seeded with builtins, then copy the matching entry
    const tempHub = createSeededHub();
    const namePart = matchKey.split('/').pop()?.split('@')[0];
    const entry = tempHub.listInstalled().find(e => e.uri.split('/').pop() === namePart);
    if (entry) {
      opts.hub.install(uri, entry.name, entry.description, entry.factory);
      // Persist to config
      const persisted = readInstalledUris();
      if (!persisted.includes(uri)) {
        persisted.push(uri);
        writeInstalledUris(persisted);
      }
      opts.stdout(`Installed: ${uri}`);
      return 0;
    }
  }

  opts.stderr(
    `Cannot resolve ${uri}. For custom scanners, implement GuardrailScanner and register via the GuardrailHub API.`
  );
  return 1;
}

export function handleUninstall(argv: readonly string[], opts: GuardrailCliOptions): number {
  if (hasFlag(argv, '--help')) {
    opts.stdout(HELP_EXAMPLES.uninstall);
    return 0;
  }

  const positional = stripFlags(argv);
  const uri = positional[0];

  if (uri === undefined || uri.length === 0) {
    opts.stderr('Usage: agentsy guardrails uninstall <hub-uri>');
    return 1;
  }

  if (opts.hub.uninstall(uri)) {
    // Remove from persistent config
    const persisted = readInstalledUris();
    const filtered = persisted.filter(u => u !== uri);
    if (filtered.length !== persisted.length) {
      writeInstalledUris(filtered);
    }
    opts.stdout(`Uninstalled: ${uri}`);
    return 0;
  }

  opts.stderr(`Not installed: ${uri}`);
  return 1;
}

export function handlePolicy(argv: readonly string[], opts: GuardrailCliOptions): number {
  if (hasFlag(argv, '--help')) {
    opts.stdout(HELP_EXAMPLES.policy);
    return 0;
  }

  const positional = stripFlags(argv);
  const json = opts.json;
  const testInputRaw = getFlagValue(argv, '--test-input');
  const filePath = positional[0] ?? './.agentsy/policy.yaml';
  const resolvedPath = resolve(filePath);

  if (!existsSync(resolvedPath)) {
    opts.stderr(`Policy file not found: ${filePath}`);
    opts.stderr('Create one or run: agentsy guardrails policy <path>');
    return 1;
  }

  // Parse and validate YAML
  let doc: PolicyDocument;
  try {
    doc = readAndValidatePolicy(resolvedPath);
  } catch (error) {
    emitPolicyError(error, opts);
    return 1;
  }

  printPolicySummary(doc, filePath, opts);

  // Validate against scanner capabilities
  const capabilities = getScannerCapabilities(opts.hub);
  const allWarnings = collectPolicyWarnings(doc, capabilities);
  emitValidationResult(allWarnings, opts);

  if (json) {
    opts.stdout(JSON.stringify(doc, null, 2));
    return 0;
  }

  printPolicyRules(doc, opts);

  // Optional test-evaluate with sample input
  if (testInputRaw !== undefined) {
    evaluatePolicyTest(doc, testInputRaw, opts);
  }

  return 0;
}

function emitPolicyError(error: unknown, opts: GuardrailCliOptions): void {
  if (error instanceof z.ZodError) {
    opts.stderr('Policy validation error:');
    for (const issue of error.issues) {
      opts.stderr(`  ${issue.path.join('.')}: ${issue.message}`);
    }
  } else if (error instanceof Error) {
    opts.stderr(`Invalid policy file: ${error.message}`);
  } else {
    opts.stderr(`Invalid policy file: ${String(error)}`);
  }
}

function printPolicySummary(doc: PolicyDocument, filePath: string, opts: GuardrailCliOptions): void {
  opts.stdout(`Policy: ${filePath}`);
  opts.stdout(`Version: ${doc.version}`);
  if (doc.description) {
    opts.stdout(`Description: ${doc.description}`);
  }
  opts.stdout(`Rules: ${doc.rules.length}`);
  opts.stdout('');
}

function collectPolicyWarnings(doc: PolicyDocument, capabilities: ScannerCapability[]): string[] {
  const allWarnings: string[] = [];
  for (const rule of doc.rules) {
    const ruleWarnings = validateRuleAgainstCapabilities(rule, capabilities);
    allWarnings.push(...ruleWarnings);
  }
  return allWarnings;
}

function emitValidationResult(warnings: string[], opts: GuardrailCliOptions): void {
  if (warnings.length > 0) {
    opts.stdout('Validation Warnings:');
    for (const warning of warnings) {
      opts.stdout(`  ⚠ ${warning}`);
    }
    opts.stdout('');
  } else {
    opts.stdout('✓ All conditions match installed scanner capabilities');
    opts.stdout('');
  }
}

function printPolicyRules(doc: PolicyDocument, opts: GuardrailCliOptions): void {
  for (const rule of doc.rules) {
    opts.stdout(`  ${rule.name} (${rule.action})`);
    opts.stdout(`    Condition: ${rule.condition}`);
    if (rule.description) {
      opts.stdout(`    ${rule.description}`);
    }
    if (rule.phase) {
      opts.stdout(`    Phase: ${rule.phase}`);
    }
    if (rule.severity) {
      opts.stdout(`    Severity: ${rule.severity}`);
    }
    opts.stdout('');
  }
}

function evaluatePolicyTest(doc: PolicyDocument, testInputRaw: string, opts: GuardrailCliOptions): void {
  opts.stdout('═══════════════════════════════════════════');
  opts.stdout('Test Evaluation:');
  opts.stdout('');
  try {
    const testContext: Record<string, unknown> = JSON.parse(testInputRaw);
    const testInput = typeof testContext.input === 'string' ? testContext.input : '';
    const phase = typeof testContext.phase === 'string' ? testContext.phase : 'input';

    const enforcer = new PolicyEnforcer(doc);
    const { receipt } = enforcer.evaluate(testInput, phase as GuardrailPhase, testContext);

    opts.stdout(`  Input:       ${testInput}`);
    opts.stdout(`  Result:      ${receipt.decision}`);
    opts.stdout(`  Rule:        ${receipt.policyId}`);
    opts.stdout('');
    opts.stdout(formatReceipt(receipt, false));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    opts.stderr(`Test evaluation failed: ${message}`);
  }
}

export function handleTest(argv: readonly string[], opts: GuardrailCliOptions): number {
  if (hasFlag(argv, '--help')) {
    opts.stdout(HELP_EXAMPLES.test);
    return 0;
  }

  const json = hasFlag(argv, '--json');
  const toolName = getFlagValue(argv, '--tool');
  const phaseStr = getFlagValue(argv, '--phase') ?? 'tool-input';
  const positional = stripFlags(argv);
  const policyPath = positional[0];
  const input = positional[1];

  if (policyPath === undefined) {
    opts.stderr('Usage: agentsy guardrails test <policy-path> <input>');
    opts.stderr('Run --help for examples.');
    return 1;
  }

  if (input === undefined) {
    opts.stderr('Usage: agentsy guardrails test <policy-path> <input>');
    opts.stderr('Missing input argument.');
    return 1;
  }

  const resolvedPath = resolve(policyPath);
  if (!existsSync(resolvedPath)) {
    opts.stderr(`Policy file not found: ${policyPath}`);
    return 1;
  }

  // Parse and validate policy
  let doc: PolicyDocument;
  try {
    doc = readAndValidatePolicy(resolvedPath);
  } catch (error) {
    if (error instanceof z.ZodError) {
      opts.stderr('Policy validation error:');
      for (const issue of error.issues) {
        opts.stderr(`  ${issue.path.join('.')}: ${issue.message}`);
      }
    } else if (error instanceof Error) {
      opts.stderr(`Invalid policy file: ${error.message}`);
    } else {
      opts.stderr(`Invalid policy file: ${String(error)}`);
    }
    return 1;
  }

  // Build evaluation context
  const phase = phaseStr as GuardrailPhase;
  const context: Record<string, unknown> = {};
  if (toolName) {
    context.toolName = toolName;
  }

  // Evaluate
  const enforcer = new PolicyEnforcer(doc);
  const { receipt } = enforcer.evaluate(input, phase, context);

  if (json) {
    opts.stdout(JSON.stringify(receipt, null, 2));
    return 0;
  }

  opts.stdout(formatReceipt(receipt, false));
  return 0;
}

export async function handleHub(argv: readonly string[], opts: GuardrailCliOptions): Promise<number> {
  if (hasFlag(argv, '--help')) {
    opts.stdout(HELP_EXAMPLES.hub);
    return 0;
  }

  const uri = resolveHubUri(argv, opts);
  if (uri === null) {
    return 1;
  }

  const parsed = parseHubUri(uri);
  if (parsed === null) {
    opts.stderr(`Invalid hub URI: ${uri}`);
    opts.stderr('Supported schemes: npm://, file://');
    return 1;
  }

  if (parsed.scheme === 'file') {
    return await installFromFile(uri, parsed, opts);
  }

  if (parsed.scheme === 'npm') {
    return await installFromNpm(uri, parsed, opts);
  }

  opts.stderr(`Unsupported hub URI scheme: ${parsed.scheme}`);
  opts.stderr('Supported schemes: npm://, file://');
  return 1;
}

/**
 * Extract and validate the hub URI from argv, or print usage.
 * Returns null (with usage printed) on failure.
 */
function resolveHubUri(argv: readonly string[], opts: GuardrailCliOptions): string | null {
  const positional = stripFlags(argv);
  const uri = positional[0];

  if (uri === undefined || uri.length === 0) {
    opts.stderr('Usage: agentsy guardrails hub <hub-uri>');
    opts.stderr('');
    opts.stderr('Supported schemes:');
    opts.stderr('  npm://@scope/name     Resolve an npm package');
    opts.stderr('  file:///path/to/mod   Resolve a local file');
    opts.stderr('');
    opts.stderr('Examples:');
    opts.stderr('  agentsy guardrails hub npm://@agentsy/guardrails-custom');
    opts.stderr('  agentsy guardrails hub file:///opt/guardrails/my-scanner.js');
    return null;
  }

  return uri;
}

/**
 * Install a guardrail scanner from a local file via a file:// URI.
 */
async function installFromFile(uri: string, parsed: HubUri, opts: GuardrailCliOptions): Promise<number> {
  const filePath = parsed.packageName;
  const resolvedPath = isAbsolute(filePath) ? filePath : resolve(filePath);

  if (!existsSync(resolvedPath)) {
    opts.stderr(`File not found: ${resolvedPath}`);
    return 1;
  }

  try {
    const mod = await import(resolvedPath);
    const scanner = resolveDefaultExport<GuardrailScanner>(mod, opts);
    if (scanner === null) {
      return 1;
    }

    registerAndPersist(uri, scanner, opts);
    opts.stdout(`Installed from file: ${uri}`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    opts.stderr(`Failed to import module: ${message}`);
    return 1;
  }
}

/**
 * Install a guardrail scanner from an npm package via an npm:// URI.
 */
async function installFromNpm(uri: string, parsed: HubUri, opts: GuardrailCliOptions): Promise<number> {
  const packageName = parsed.packageName;
  try {
    const mod = await import(packageName);
    const scanner = resolveDefaultExport<GuardrailScanner>(mod, opts);
    if (scanner === null) {
      return 1;
    }

    registerAndPersist(uri, scanner, opts);
    opts.stdout(`Installed from npm: ${uri}`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    opts.stderr(`Failed to import npm package: ${message}`);
    return 1;
  }
}

/**
 * Register a scanner in the hub and persist the URI to config.
 */
function registerAndPersist(uri: string, scanner: GuardrailScanner, opts: GuardrailCliOptions): void {
  opts.hub.install(uri, scanner.metadata.name, scanner.metadata.description, () => scanner);
  opts.stdout(`  Name:        ${scanner.metadata.name}`);
  opts.stdout(`  Description: ${scanner.metadata.description}`);
  opts.stdout(`  Version:     ${scanner.metadata.version}`);

  const persisted = readInstalledUris();
  if (!persisted.includes(uri)) {
    persisted.push(uri);
    writeInstalledUris(persisted);
  }
}

// =============================================================================
// Helper: resolve a default or named export from a dynamically imported module
// =============================================================================

function resolveDefaultExport<T extends { metadata: { name: string; description: string; version: string } }>(
  mod: unknown,
  opts: GuardrailCliOptions
): T | null {
  if (mod === null || mod === undefined) {
    opts.stderr('Module is empty');
    return null;
  }

  const modObj = mod as Record<string, unknown>;

  // Check default export first
  const defaultExport = modObj.default;
  if (defaultExport !== undefined && typeof defaultExport === 'object' && defaultExport !== null) {
    const candidate = defaultExport as T;
    if (candidate.metadata !== undefined) {
      return candidate;
    }
  }

  // Check if the module itself is a scanner (has metadata)
  if (modObj.metadata !== undefined) {
    return mod as unknown as T;
  }

  // Find first named export that looks like a scanner
  for (const key of Object.keys(modObj)) {
    const val = modObj[key];
    if (typeof val === 'object' && val !== null) {
      const candidate = val as T;
      if (candidate.metadata !== undefined) {
        return candidate;
      }
    }
  }

  opts.stderr('Could not find a GuardrailScanner export in the module');
  opts.stderr('The module must export a scanner with a metadata property (name, description, version).');
  return null;
}

// =============================================================================
// Entry point
// =============================================================================

export async function runGuardrailsCommand(argv: readonly string[], io: CliIO = defaultIo): Promise<number> {
  const subcommand = argv[0];
  const rest = argv.slice(1);

  // Handle --help at top level
  if (subcommand === '--help' || subcommand === '-h') {
    const ioOut = io.stdout ?? defaultIo.stdout;
    ioOut('agentsy guardrails — Manage guardrail scanners and policies');
    ioOut('');
    ioOut('Subcommands:');
    ioOut('  list                  List installed guardrails');
    ioOut('  install <hub-uri>     Install a guardrail by hub URI');
    ioOut('  uninstall <hub-uri>   Remove a guardrail');
    ioOut('  policy [path]         Validate and test-evaluate a policy file');
    ioOut('  test <path> <input>   Evaluate a policy against input');
    ioOut('  hub <hub-uri>         Resolve an npm:// or file:// URI');
    ioOut('');
    ioOut('Run "agentsy guardrails <subcommand> --help" for subcommand details.');
    return 0;
  }

  const hub = createSeededHub();
  const json = hasFlag(rest, '--json');
  const noColor = hasFlag(rest, '--no-color');
  const stdout = io.stdout ?? defaultIo.stdout;
  const stderr = io.stderr ?? defaultIo.stderr;
  const opts: GuardrailCliOptions = { hub, json, noColor, stdout, stderr };

  switch (subcommand) {
    case 'list': {
      return handleList(rest, opts);
    }

    case 'install': {
      return handleInstall(rest, opts);
    }

    case 'uninstall': {
      return handleUninstall(rest, opts);
    }

    case 'policy': {
      return handlePolicy(rest, opts);
    }

    case 'test': {
      return handleTest(rest, opts);
    }

    case 'hub': {
      return await handleHub(rest, opts);
    }

    default: {
      stderr(`Unknown guardrail subcommand: ${subcommand ?? '(none)'}`);
      stderr('Supported: list, install, uninstall, policy, test, hub');
      return 1;
    }
  }
}
