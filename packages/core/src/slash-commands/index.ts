import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  expandSlashCommandPrompt as expandPromptInternal,
  parseSlashInvocation as parseInvocationInternal,
  substituteArguments as substituteArgsInternal
} from './argument-substitution.js';

export interface SlashCommandDefinition {
  readonly description: string;
  readonly hooks: readonly string[];
  readonly instructions?: string;
  readonly name: string;
  readonly packageName: string;
  readonly prompt?: string;
  readonly triggers: readonly string[];
}

interface SlashCommandDraft {
  description?: string;
  hooks: string[];
  instructions?: string;
  name?: string;
  prompt?: string;
  triggers: string[];
}

export type { SlashInvocation, SubstitutionResult } from './argument-substitution.js';
export {
  createArgumentSubstitutor,
  expandSlashCommandPrompt,
  parseArgumentString,
  parseSlashInvocation,
  substituteArguments
} from './argument-substitution.js';

const WORKSPACE_MANIFESTS = [
  'packages/cli/slash-commands.yaml',
  'packages/models/slash-commands.yaml',
  'packages/providers/slash-commands.yaml',
  'packages/plugins/slash-commands.yaml'
] as const;

function findWorkspaceRoot(startDir: string): string {
  let current = startDir;
  while (true) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return startDir;
    }
    current = parent;
  }
}

function parseScalar(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function createDraft(): SlashCommandDraft {
  return { hooks: [], triggers: [] };
}

function pushCommand(commands: SlashCommandDefinition[], current: SlashCommandDraft | null, packageName: string): void {
  if (current?.name && current.description) {
    let command: SlashCommandDefinition = {
      description: current.description,
      hooks: current.hooks,
      name: current.name,
      packageName,
      triggers: current.triggers
    };

    if (current.instructions !== undefined) {
      command = {
        ...command,
        instructions: current.instructions
      };
    }

    if (current.prompt !== undefined) {
      command = {
        ...command,
        prompt: current.prompt
      };
    }

    commands.push(command);
  }
}

function isBlankOrComment(trimmed: string): boolean {
  return trimmed === '' || trimmed.startsWith('#');
}

function isCommandsHeader(trimmed: string): boolean {
  return trimmed === 'commands:';
}

function isCommandStart(indent: number, trimmed: string): boolean {
  return indent === 2 && trimmed.startsWith('- ');
}

function isListHeader(indent: number, trimmed: string): trimmed is 'hooks:' | 'triggers:' {
  return indent === 4 && (trimmed === 'hooks:' || trimmed === 'triggers:');
}

function isListItem(indent: number, trimmed: string, currentListKey: 'hooks' | 'triggers' | null): boolean {
  return indent === 6 && trimmed.startsWith('- ') && currentListKey !== null;
}

function applyCommandField(current: SlashCommandDraft, trimmed: string): boolean {
  const nameMatch = /^name:\s*(.+)$/u.exec(trimmed);
  if (nameMatch !== null) {
    current.name = parseScalar(nameMatch[1] ?? '');
    return true;
  }

  const descriptionMatch = /^description:\s*(.+)$/u.exec(trimmed);
  if (descriptionMatch !== null) {
    current.description = parseScalar(descriptionMatch[1] ?? '');
    return true;
  }

  const instructionsMatch = /^instructions:\s*(.+)$/u.exec(trimmed);
  if (instructionsMatch !== null) {
    current.instructions = parseScalar(instructionsMatch[1] ?? '');
    return true;
  }

  const promptMatch = /^prompt:\s*(.+)$/u.exec(trimmed);
  if (promptMatch !== null) {
    current.prompt = parseScalar(promptMatch[1] ?? '');
    return true;
  }

  return false;
}

function appendListItem(current: SlashCommandDraft, currentListKey: 'hooks' | 'triggers', trimmed: string): void {
  const item = parseScalar(trimmed.slice(2));
  if (currentListKey === 'hooks') {
    current.hooks = [...current.hooks, item];
    return;
  }

  current.triggers = [...current.triggers, item];
}

interface ManifestParseState {
  current: SlashCommandDraft | null;
  currentListKey: 'hooks' | 'triggers' | null;
  inCommands: boolean;
}

function processManifestLine(
  state: ManifestParseState,
  rawLine: string,
  commands: SlashCommandDefinition[],
  packageName: string
): void {
  const indent = rawLine.length - rawLine.trimStart().length;
  const trimmed = rawLine.trim();

  if (isBlankOrComment(trimmed)) {
    return;
  }

  if (isCommandsHeader(trimmed)) {
    state.inCommands = true;
    return;
  }

  if (!state.inCommands) {
    return;
  }

  if (isCommandStart(indent, trimmed)) {
    pushCommand(commands, state.current, packageName);
    state.current = createDraft();
    state.currentListKey = null;

    const remainder = trimmed.slice(2).trim();
    if (remainder.startsWith('name:')) {
      state.current.name = parseScalar(remainder.slice('name:'.length));
    }

    return;
  }

  if (state.current === null) {
    return;
  }

  if (isListHeader(indent, trimmed)) {
    state.currentListKey = trimmed === 'hooks:' ? 'hooks' : 'triggers';
    return;
  }

  if (state.currentListKey !== null && isListItem(indent, trimmed, state.currentListKey)) {
    appendListItem(state.current, state.currentListKey, trimmed);
    return;
  }

  state.currentListKey = null;
  applyCommandField(state.current, trimmed);
}

function parseManifest(contents: string, packageName: string): SlashCommandDefinition[] {
  const commands: SlashCommandDefinition[] = [];
  const lines = contents.split(/\r?\n/u);
  const state: ManifestParseState = {
    current: null,
    currentListKey: null,
    inCommands: false
  };

  for (const rawLine of lines) {
    processManifestLine(state, rawLine, commands, packageName);
  }

  pushCommand(commands, state.current, packageName);
  return commands;
}

export function loadSlashCommands(workspaceRoot = findWorkspaceRoot(process.cwd())): readonly SlashCommandDefinition[] {
  const loaded = WORKSPACE_MANIFESTS.flatMap(manifestPath => {
    const fullPath = join(workspaceRoot, manifestPath);
    const packageName = manifestPath.split('/').at(1) ?? 'unknown';
    const contents = readFileSync(fullPath, 'utf8');
    return parseManifest(contents, packageName);
  });

  const deduped = new Map<string, SlashCommandDefinition>();
  for (const command of loaded) {
    deduped.set(command.name, command);
  }

  return [...deduped.values()];
}

// ── Integration: invocation expansion ───────────────────────────────────────

export interface ExpandedSlashCommand {
  readonly args: readonly string[];
  readonly argsString: string;
  readonly commandName: string;
  readonly definition: SlashCommandDefinition;
  /** Expanded prompt/template (if definition has prompt/instructions with placeholders). */
  readonly expandedPrompt: string;
  readonly warnings: readonly string[];
}

/**
 * Expand a raw slash invocation line (e.g. "/refactor src/utils/parser.ts")
 * against a definition's prompt template. If definition has no prompt but has
 * instructions, instructions is used as fallback template. Otherwise the raw
 * argsString is returned.
 */
export function expandSlashCommand(definition: SlashCommandDefinition, invocationLine: string): ExpandedSlashCommand {
  const invocation = parseInvocationInternal(invocationLine);
  const template = definition.prompt ?? definition.instructions ?? '$ARGUMENTS';
  const result = substituteArgsInternal(template, invocation.argsString);

  return {
    definition,
    commandName: invocation.commandName || definition.name,
    argsString: invocation.argsString,
    args: invocation.args,
    expandedPrompt: result.substituted,
    warnings: result.warnings
  };
}

/**
 * Resolve a raw input line against a list of slash command definitions
 * and return the expanded command if matched. Returns null if no definition matches.
 * Match is by definition.name (e.g. "/refactor").
 */
export function resolveSlashCommand(
  inputLine: string,
  definitions: readonly SlashCommandDefinition[]
): ExpandedSlashCommand | null {
  const invocation = parseInvocationInternal(inputLine);
  const def = definitions.find(d => d.name === invocation.commandName);
  if (def === undefined) {
    return null;
  }
  return expandSlashCommand(def, inputLine);
}

/**
 * Factory for slash-command registry + expansion (ESM-first public API).
 */
export function createSlashCommandRegistry(workspaceRoot = findWorkspaceRoot(process.cwd())): {
  load: () => readonly SlashCommandDefinition[];
  expand: (definition: SlashCommandDefinition, invocationLine: string) => ExpandedSlashCommand;
  resolve: (inputLine: string, defs?: readonly SlashCommandDefinition[]) => ExpandedSlashCommand | null;
  expandPrompt: (template: string, invocationLine: string) => ReturnType<typeof expandPromptInternal>;
} {
  const load = () => loadSlashCommands(workspaceRoot);
  return {
    load,
    expand: expandSlashCommand,
    resolve: (inputLine, defs) => resolveSlashCommand(inputLine, defs ?? load()),
    expandPrompt: (template, invocationLine) => expandPromptInternal(template, invocationLine)
  };
}
