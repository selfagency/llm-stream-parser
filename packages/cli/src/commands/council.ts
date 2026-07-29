import {
  COUNCIL_PRESETS,
  type CouncilDefinition,
  type CouncilMember,
  type CouncilResult,
  executeCouncil
} from '@agentsy/orchestrator/council';

import type { CliIO } from '../index.js';

type ExecuteModelFn = (opts: {
  messages: Array<{ content: string; role: string }>;
  model: string;
  provider: string;
}) => Promise<{ text: string; usage: { input: number; output: number } }>;

type ExecuteCouncilFn = (
  council: CouncilDefinition,
  query: string,
  options: { execute: ExecuteModelFn; onEvent?: (event: unknown) => void }
) => Promise<CouncilResult>;

interface ActiveSession {
  id: string;
  members: CouncilMember[];
  preset: string;
  prompt: string;
  startedAt: Date;
}

export interface CouncilDeps {
  executeCouncil?: ExecuteCouncilFn;
  executeModel?: ExecuteModelFn;
  getActiveSessions?: () => ActiveSession[];
  presets?: Record<string, CouncilDefinition>;
}

const DEFAULT_IO: Required<CliIO> = {
  stdout: message => {
    console.log(message);
  },
  stderr: message => {
    console.error(message);
  }
};

function writeOut(io: CliIO, message: string): void {
  const fn = io.stdout ?? DEFAULT_IO.stdout;
  fn(message);
}

function writeErr(io: CliIO, message: string): void {
  const fn = io.stderr ?? DEFAULT_IO.stderr;
  fn(message);
}

function getFlagValue(args: readonly string[], flag: string): string | null {
  const eqPrefix = `${flag}=`;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) {
      continue;
    }
    if (arg === flag) {
      return args[i + 1] ?? null;
    }
    if (arg.startsWith(eqPrefix)) {
      return arg.slice(eqPrefix.length);
    }
  }
  return null;
}

function hasFlag(args: readonly string[], flag: string): boolean {
  return args.includes(flag);
}

function stripFlags(args: readonly string[]): string[] {
  const result: string[] = [];
  let skipNext = false;
  for (const arg of args) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx === -1) {
        const knownValueFlags = ['--chairman', '--members', '--provider', '--timeout', '--timeout-ms'];
        if (knownValueFlags.includes(arg)) {
          skipNext = true;
        }
      }
      continue;
    }
    result.push(arg);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Parsing helpers (exported for testability)
// ---------------------------------------------------------------------------

/**
 * Parse a comma-separated members string into CouncilMember[].
 * Accepts forms like "claude-4,gemini-2.5-pro" or "model:provider,model2"
 * Defaults provider to "auto" when not specified.
 */
export function parseMembers(value: string): CouncilMember[] {
  if (!value || value.trim().length === 0) {
    throw new Error('Members string is empty');
  }
  return value
    .split(',')
    .map(raw => raw.trim())
    .filter(Boolean)
    .map(entry => {
      const colonIdx = entry.lastIndexOf(':');
      const atIdx = entry.lastIndexOf('@');
      let sepIdx = -1;
      if (colonIdx > 0) {
        sepIdx = colonIdx;
      } else if (atIdx > 0) {
        sepIdx = atIdx;
      }

      if (sepIdx > 0) {
        const model = entry.slice(0, sepIdx).trim();
        const provider = entry.slice(sepIdx + 1).trim();
        if (!model) {
          throw new Error(`Invalid member entry: "${entry}"`);
        }
        return { model, provider: provider || 'auto' } as CouncilMember;
      }

      const model = entry.trim();
      if (!model) {
        throw new Error(`Invalid member entry: "${entry}"`);
      }
      return { model, provider: 'auto' } as CouncilMember;
    });
}

/**
 * Parse chairman string into a CouncilMember.
 * Same syntax as members but single entry.
 */
export function parseChairman(value: string): CouncilMember {
  const members = parseMembers(value);
  if (members.length === 0) {
    throw new Error('Chairman value is empty');
  }
  const first = members[0];
  if (!first) {
    throw new Error('Chairman parsing failed');
  }
  return first;
}

export function resolvePreset(
  name: string,
  presets: Record<string, CouncilDefinition> = COUNCIL_PRESETS
): CouncilDefinition | undefined {
  return presets[name];
}

export function buildCustomDefinition(params: {
  chairmanStr: string;
  membersStr: string;
  timeoutMs?: number;
}): CouncilDefinition {
  const members = parseMembers(params.membersStr);
  if (members.length === 0) {
    throw new Error('At least one member required for custom council');
  }
  const chairman = parseChairman(params.chairmanStr);

  const base: CouncilDefinition = {
    chairman,
    description: 'Custom ad-hoc council',
    domain: 'general',
    members,
    name: 'Ad-hoc Council'
  };

  if (params.timeoutMs !== undefined) {
    return { ...base, timeoutMs: params.timeoutMs };
  }
  return base;
}

export function parseTimeout(value: string | null): number | undefined {
  if (value === null) {
    return;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid timeout value: "${value}". Use positive milliseconds.`);
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

function formatPresetRow(name: string, def: CouncilDefinition): string {
  const padded = name.padEnd(16);
  return `  ${padded} ${def.description} (${def.members.length} members)`;
}

function formatCouncilResult(result: CouncilResult, io: CliIO): void {
  writeOut(io, '\n## Chairman Synthesis\n');
  writeOut(io, result.finalAnswer);
  writeOut(io, '');

  if (result.dissentingOpinions.length > 0) {
    writeOut(io, '\n## Dissenting Opinions\n');
    for (const d of result.dissentingOpinions) {
      const label = d.member.role ? `${d.member.role} (${d.member.model})` : d.member.model;
      writeOut(io, `[${label}] ${d.opinion}`);
      writeOut(io, '');
    }
  }

  const total = result.totalTokenUsage;
  const durationSec = (result.totalDurationMs / 1000).toFixed(1);
  writeOut(io, '---');
  writeOut(io, `Tokens: ${total.input} in / ${total.output} out | Duration: ${durationSec}s`);
  if (result.rankings.length > 0) {
    writeOut(io, 'Rankings:');
    for (const [idx, r] of result.rankings.entries()) {
      writeOut(io, `  ${idx + 1}. ${r.member.role ?? r.member.model}: ${r.avgScore.toFixed(1)}/20`);
    }
  }
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

function handleList(io: CliIO, presets: Record<string, CouncilDefinition>): number {
  writeOut(io, 'Available council presets:');
  writeOut(io, '');
  for (const [name, def] of Object.entries(presets)) {
    writeOut(io, formatPresetRow(name, def));
  }
  writeOut(io, '');
  writeOut(io, 'Use: agentsy council run <preset> "<prompt>"');
  writeOut(io, 'Or:  agentsy council run --members "m1,m2" --chairman "m3" "<prompt>"');
  return 0;
}

function handleStatus(io: CliIO, getActiveSessions?: () => ActiveSession[]): number {
  const sessions = getActiveSessions?.() ?? [];

  if (sessions.length === 0) {
    writeOut(io, 'No active council sessions.');
    writeOut(io, 'Run a council with: agentsy council run <preset> "<prompt>"');
    return 0;
  }

  writeOut(io, `Active council sessions: ${sessions.length}`);
  writeOut(io, '');
  for (const s of sessions) {
    const elapsed = Math.round((Date.now() - s.startedAt.getTime()) / 1000);
    writeOut(io, `  ${s.id}`);
    writeOut(io, `    preset: ${s.preset}`);
    writeOut(io, `    members: ${s.members.length}`);
    const suffix = s.prompt.length > 80 ? '...' : '';
    writeOut(io, `    prompt: ${s.prompt.slice(0, 80)}${suffix}`);
    writeOut(io, `    elapsed: ${elapsed}s`);
    writeOut(io, '');
  }
  return 0;
}

function defaultExecuteModel(): ExecuteModelFn {
  return opts => {
    const lastMessage = opts.messages.at(-1)?.content ?? '';
    return Promise.resolve({
      text: `[mock:${opts.model}] Response to: ${lastMessage.slice(0, 200)}`,
      usage: { input: lastMessage.length, output: 50 }
    });
  };
}

interface ParsedRunArgs {
  chairmanStr: string | null;
  json: boolean;
  membersStr: string | null;
  positional: string[];
  timeoutMs: number | undefined;
}

function parseRunArgs(args: readonly string[]): ParsedRunArgs {
  const membersStr = getFlagValue(args, '--members');
  const chairmanStr = getFlagValue(args, '--chairman');
  const timeoutRaw = getFlagValue(args, '--timeout') ?? getFlagValue(args, '--timeout-ms');
  let timeoutMs: number | undefined;
  if (timeoutRaw !== null) {
    timeoutMs = parseTimeout(timeoutRaw);
  }
  const json = hasFlag(args, '--json');
  const positional = stripFlags(args);
  return { chairmanStr, json, membersStr, positional, timeoutMs };
}

function resolvePresetDefinition(
  positional: string[],
  presets: Record<string, CouncilDefinition>,
  timeoutMs: number | undefined,
  io: CliIO
): { definition?: CouncilDefinition; presetName?: string; errorCode?: number } {
  const presetName = positional[0];
  if (!presetName) {
    writeErr(io, 'Error: preset name required\n');
    writeErr(io, 'Usage: agentsy council run <preset> "<prompt>"\n');
    writeErr(io, `Available presets: ${Object.keys(presets).join(', ')}\n`);
    return { errorCode: 1 };
  }
  const preset = resolvePreset(presetName, presets);
  if (!preset) {
    writeErr(io, `Error: unknown preset "${presetName}"\n`);
    writeErr(io, `Available presets: ${Object.keys(presets).join(', ')}\n`);
    return { errorCode: 1 };
  }
  const definition = timeoutMs === undefined ? preset : { ...preset, timeoutMs };
  return { definition, presetName };
}

function resolveAdhocDefinition(
  membersStr: string,
  chairmanStr: string | null,
  timeoutMs: number | undefined,
  io: CliIO
): { definition?: CouncilDefinition; errorCode?: number } {
  if (chairmanStr === null) {
    writeErr(io, 'Error: --chairman is required when using --members for ad-hoc council\n');
    writeErr(io, 'Usage: agentsy council run --members "m1,m2" --chairman "m3" "<prompt>"\n');
    return { errorCode: 1 };
  }
  try {
    const base = {
      chairmanStr,
      membersStr
    };
    const definition = buildCustomDefinition(timeoutMs === undefined ? base : { ...base, timeoutMs });
    return { definition };
  } catch (error) {
    writeErr(io, `Error building custom council: ${(error as Error).message}\n`);
    return { errorCode: 1 };
  }
}

async function handleRun(args: readonly string[], io: CliIO, deps: CouncilDeps): Promise<number> {
  const presets = deps.presets ?? COUNCIL_PRESETS;
  const executeCouncilFn = deps.executeCouncil ?? executeCouncil;
  const executeModel = deps.executeModel ?? defaultExecuteModel();

  const { membersStr, chairmanStr, timeoutMs, positional, json } = parseRunArgs(args);

  let definition: CouncilDefinition | undefined;
  let prompt: string;

  if (membersStr === null) {
    const result = resolvePresetDefinition(positional, presets, timeoutMs, io);
    if (result.errorCode !== undefined) {
      return result.errorCode;
    }
    if (!result.definition) {
      writeErr(io, 'Error: failed to resolve council definition\n');
      return 1;
    }
    definition = result.definition;
    prompt = positional.slice(1).join(' ');
  } else {
    const result = resolveAdhocDefinition(membersStr, chairmanStr, timeoutMs, io);
    if (result.errorCode !== undefined) {
      return result.errorCode;
    }
    definition = result.definition;
    prompt = positional.join(' ');
  }

  if (!definition) {
    writeErr(io, 'Error: failed to resolve council definition\n');
    return 1;
  }

  if (!prompt) {
    writeErr(io, 'Error: prompt is required\n');
    writeErr(io, 'Usage: agentsy council run <preset> "<prompt>"\n');
    return 1;
  }

  writeOut(
    io,
    `Council: ${definition.name} (${definition.members.length} members, chairman: ${definition.chairman.model})`
  );
  writeOut(io, `Prompt: ${prompt}`);
  writeOut(io, '');

  try {
    const executeWithTimeout: ExecuteModelFn =
      timeoutMs === undefined
        ? executeModel
        : async opts => {
            let timer: ReturnType<typeof setTimeout> | undefined;
            const timeoutPromise = new Promise<never>((_, reject) => {
              timer = setTimeout(() => {
                reject(new Error(`Timeout after ${timeoutMs}ms`));
              }, timeoutMs);
            });
            try {
              const result = await Promise.race([executeModel(opts), timeoutPromise]);
              return result;
            } finally {
              if (timer) {
                clearTimeout(timer);
              }
            }
          };

    const result = await executeCouncilFn(definition, prompt, {
      execute: executeWithTimeout,
      onEvent: (event: unknown) => {
        const ev = event as { member?: CouncilMember; type?: string };
        if (ev.type === 'opinion_complete' && ev.member) {
          writeOut(io, `  ✓ opinion from ${ev.member.role ?? ev.member.model}`);
        }
      }
    });

    if (json) {
      writeOut(io, JSON.stringify(result, null, 2));
      return 0;
    }

    formatCouncilResult(result, io);
    return 0;
  } catch (error) {
    writeErr(io, `Council execution failed: ${(error as Error).message}\n`);
    return 1;
  }
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

export async function runCouncilCommand(
  args: readonly string[],
  io: CliIO = DEFAULT_IO,
  deps: CouncilDeps = {}
): Promise<number> {
  const subcommand = args[0] ?? 'help';
  const presets = deps.presets ?? COUNCIL_PRESETS;

  switch (subcommand) {
    case 'list':
    case 'ls': {
      return handleList(io, presets);
    }
    case 'run': {
      return await handleRun(args.slice(1), io, deps);
    }
    case 'status': {
      return handleStatus(io, deps.getActiveSessions);
    }
    case 'help':
    case '--help':
    case '-h': {
      writeOut(io, 'agentsy council — multi-model Council Mode deliberation');
      writeOut(io, '');
      writeOut(io, 'Usage:');
      writeOut(io, '  agentsy council list');
      writeOut(io, '  agentsy council run <preset> "<prompt>"');
      writeOut(io, '  agentsy council run --members "m1,m2" --chairman "m3" "<prompt>"');
      writeOut(io, '  agentsy council status');
      writeOut(io, '');
      writeOut(io, 'Presets: coding, research, review, architecture, general');
      writeOut(io, '');
      writeOut(io, 'Options:');
      writeOut(io, '  --members <list>     Comma-separated model IDs (ad-hoc)');
      writeOut(io, '  --chairman <model>   Chairman model ID (required for ad-hoc)');
      writeOut(io, '  --timeout <ms>       Timeout per member in milliseconds (default 120000)');
      writeOut(io, '  --json               Output raw JSON result');
      return 0;
    }
    default: {
      writeErr(io, `Unknown council subcommand: ${subcommand}\n`);
      writeErr(io, 'Usage: agentsy council <list|run|status>\n');
      writeErr(io, 'Available presets: coding, research, review, architecture, general\n');
      return 1;
    }
  }
}
