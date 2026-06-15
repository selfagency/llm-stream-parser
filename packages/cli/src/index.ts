import { readFile } from 'node:fs/promises';
import { compressMemoryFile } from '@agentsy/core/context';
import type { OutputCompressionLevel } from '@agentsy/tokenomics';
import { compressOutput } from '@agentsy/tokenomics';

export const name = 'cli';

export interface CliIO {
  stderr?: (message: string) => void;
  stdout?: (message: string) => void;
}

const DEFAULT_IO: Required<CliIO> = {
  stderr: message => {
    console.error(message);
  },
  stdout: message => {
    console.log(message);
  }
};

import { getFlagValue, hasFlag } from './cli-args.js';

interface MemorySyncDevExample {
  bindAddress: string;
  env: {
    TURSO_DATABASE_URL: string;
    TURSO_AUTH_TOKEN: string;
    AGENTSY_MEMORY_SYNC_INTERVAL_MS: string;
  };
  managerExample: string;
  replicaDbPath: string;
  serverDbPath: string;
  serverUrl: string;
  startCommand: string;
  syncIntervalMs: number;
}

const DEFAULT_MEMORY_SYNC_SERVER_DB = './.agentsy/local-sync-server.db';
const DEFAULT_MEMORY_SYNC_REPLICA_DB = './.agentsy/local-replica.db';
const DEFAULT_MEMORY_SYNC_BIND = '0.0.0.0:8080';
const DEFAULT_MEMORY_SYNC_URL = 'http://localhost:8080';
const DEFAULT_MEMORY_SYNC_INTERVAL_MS = 5000;

function getNumberFlagValue(args: readonly string[], flag: string, fallback: number): number | null {
  const raw = getFlagValue(args, flag);
  if (raw === null) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function createMemorySyncDevExample(args: readonly string[]): MemorySyncDevExample | null {
  const syncIntervalMs = getNumberFlagValue(args, '--sync-interval-ms', DEFAULT_MEMORY_SYNC_INTERVAL_MS);
  if (syncIntervalMs === null) {
    return null;
  }

  const serverDbPath = getFlagValue(args, '--server-db') ?? DEFAULT_MEMORY_SYNC_SERVER_DB;
  const replicaDbPath = getFlagValue(args, '--replica-db') ?? DEFAULT_MEMORY_SYNC_REPLICA_DB;
  const bindAddress = getFlagValue(args, '--bind') ?? DEFAULT_MEMORY_SYNC_BIND;
  const serverUrl = getFlagValue(args, '--server-url') ?? DEFAULT_MEMORY_SYNC_URL;
  const startCommand = `tursodb ${serverDbPath} --sync-server ${bindAddress}`;

  return {
    bindAddress,
    env: {
      AGENTSY_MEMORY_SYNC_INTERVAL_MS: String(syncIntervalMs),
      TURSO_AUTH_TOKEN: '',
      TURSO_DATABASE_URL: serverUrl
    },
    managerExample: [
      "import { createTursoManager } from '@agentsy/memory';",
      '',
      'const manager = createTursoManager({',
      `  path: '${replicaDbPath}',`,
      `  databaseUrl: '${serverUrl}',`,
      "  authToken: '',",
      `  syncIntervalMs: ${syncIntervalMs},`,
      '  maxRetries: 3,',
      "  mode: 'remote-shadow'",
      '});'
    ].join('\n'),
    replicaDbPath,
    serverDbPath,
    serverUrl,
    startCommand,
    syncIntervalMs
  };
}

function formatMemorySyncDevExample(example: MemorySyncDevExample): string[] {
  return [
    'Local Turso sync server development wiring',
    '',
    'Start the local sync server:',
    example.startCommand,
    '',
    'Environment:',
    `TURSO_DATABASE_URL=${example.env.TURSO_DATABASE_URL}`,
    'TURSO_AUTH_TOKEN=',
    `AGENTSY_MEMORY_SYNC_INTERVAL_MS=${example.env.AGENTSY_MEMORY_SYNC_INTERVAL_MS}`,
    '',
    'No auth token is needed for the local sync server.',
    '',
    'Example @agentsy/memory setup:',
    example.managerExample
  ];
}

function toCompressionLevel(value: string | null): OutputCompressionLevel | null {
  if (value === 'lite' || value === 'full' || value === 'ultra') {
    return value;
  }

  if (value === null) {
    return 'full';
  }

  return null;
}

function validateCompressFlags(
  filePath: string | null,
  text: string | null,
  level: OutputCompressionLevel | null,
  io: CliIO
): level is OutputCompressionLevel {
  if (level === null) {
    (io.stderr ?? DEFAULT_IO.stderr)('Invalid --level value. Use one of: lite, full, ultra.');
    return false;
  }

  if (filePath === null && text === null) {
    (io.stderr ?? DEFAULT_IO.stderr)('Missing input. Provide --text or --file.');
    return false;
  }

  return true;
}

async function handleCompressCommand(rest: readonly string[], io: CliIO): Promise<number> {
  const filePath = getFlagValue(rest, '--file');
  const text = getFlagValue(rest, '--text');
  const level = toCompressionLevel(getFlagValue(rest, '--level'));

  if (!validateCompressFlags(filePath, text, level, io)) {
    return 1;
  }

  const source = text ?? (filePath === null ? '' : await readFile(filePath, 'utf-8'));
  const result = compressOutput(source, { level });
  (io.stdout ?? DEFAULT_IO.stdout)(`Savings: ${(result.savingsRatio * 100).toFixed(2)}%`);
  (io.stdout ?? DEFAULT_IO.stdout)(result.compressed);
  return 0;
}

async function handleCompressMemoryCommand(rest: readonly string[], io: CliIO): Promise<number> {
  const filePath = getFlagValue(rest, '--file');
  if (filePath === null) {
    (io.stderr ?? DEFAULT_IO.stderr)('Missing --file for compress-memory command.');
    return 1;
  }

  const backup = !hasFlag(rest, '--no-backup');
  const result = await compressMemoryFile(filePath, { backup });
  (io.stdout ?? DEFAULT_IO.stdout)(`Compressed ${filePath}`);
  (io.stdout ?? DEFAULT_IO.stdout)(`Savings: ${(result.savingsRatio * 100).toFixed(2)}%`);
  return 0;
}

function _handleMemorySyncDevCommand(rest: readonly string[], io: CliIO): number {
  const example = createMemorySyncDevExample(rest);
  if (example === null) {
    (io.stderr ?? DEFAULT_IO.stderr)('Invalid --sync-interval-ms value. Use a positive number.');
    return 1;
  }

  const stdout = io.stdout ?? DEFAULT_IO.stdout;
  if (hasFlag(rest, '--json')) {
    stdout(JSON.stringify(example, null, 2));
    return 0;
  }

  for (const line of formatMemorySyncDevExample(example)) {
    stdout(line);
  }

  return 0;
}

function handleMemorySyncDevCommand(rest: readonly string[], io: CliIO): number {
  return _handleMemorySyncDevCommand(rest, io);
}

async function handleSandboxDiagnosticsCommand(rest: readonly string[], io: CliIO): Promise<number> {
  const { runSandboxDiagnosticsCommand } = await import('./commands/sandbox-diagnostics.js');
  return runSandboxDiagnosticsCommand(rest, io);
}

async function handleChatCommand(rest: readonly string[], io: CliIO): Promise<number> {
  const { runChatCommand } = await import('./commands/chat.js');
  return runChatCommand(rest, io);
}

async function handleSetupCommand(rest: readonly string[], io: CliIO): Promise<number> {
  const { runSetupCommand } = await import('./commands/setup.js');
  return runSetupCommand(rest, io);
}

async function handleDoctorCommand(rest: readonly string[], io: CliIO): Promise<number> {
  const { runDoctorCommand } = await import('./commands/doctor.js');
  return runDoctorCommand(rest, io);
}

async function handleTuiCommand(argv: readonly string[], io: CliIO): Promise<number> {
  const { runTuiCommand } = await import('./commands/tui.js');
  return runTuiCommand(argv, io);
}

async function handleContentAddressStatsCommand(rest: readonly string[], io: CliIO): Promise<number> {
  const { runContentAddressStatsCommand } = await import('./commands/content-address-stats.js');
  return runContentAddressStatsCommand(rest, io);
}

async function handleLbStatusCommand(rest: readonly string[], io: CliIO): Promise<number> {
  const { runLbStatusCommand } = await import('./commands/lb-status.js');
  return runLbStatusCommand(rest, io);
}

async function handleSessionsCommand(rest: readonly string[], io: CliIO): Promise<number> {
  const { runSessionsCommand } = await import('./commands/session.js');
  return runSessionsCommand(rest, io);
}

async function handleSessionCommand(rest: readonly string[], io: CliIO): Promise<number> {
  const { runSessionCommand } = await import('./commands/session.js');
  return runSessionCommand(rest, io);
}

async function handleResumeCommand(rest: readonly string[], io: CliIO): Promise<number> {
  const { runResumeCommand } = await import('./commands/session.js');
  return runResumeCommand(rest, io);
}

async function handleGuardrailsCommand(rest: readonly string[], io: CliIO): Promise<number> {
  const { runGuardrailsCommand } = await import('./commands/guardrails.js');
  return runGuardrailsCommand(rest, io);
}

async function handleSecretsCommand(rest: readonly string[], io: CliIO): Promise<number> {
  const { runSecretsCommand } = await import('./commands/secrets.js');
  return runSecretsCommand(rest, io);
}

async function handleConfigCommand(rest: readonly string[], io: CliIO): Promise<number> {
  const { handleConfigCommand: cmd } = await import('./commands/config.js');
  return cmd(rest, io);
}

async function handleSettingsCommand(rest: readonly string[], io: CliIO): Promise<number> {
  const { handleSettingsCommand: cmd } = await import('./commands/config.js');
  return cmd(rest, io);
}

async function handleMcpCommand(rest: readonly string[], io: CliIO): Promise<number> {
  const { runMcpCommand } = await import('./commands/mcp.js');
  return runMcpCommand(rest, io);
}

async function handleCmuxCommand(rest: readonly string[], io: CliIO): Promise<number> {
  const { runCmuxCommand } = await import('./commands/cmux.js');
  return runCmuxCommand(rest, io);
}

async function handleConnectorsCommand(rest: readonly string[], io: CliIO): Promise<number> {
  const { runConnectorsCommand } = await import('./commands/connectors.js');
  return runConnectorsCommand(rest, io);
}

async function handleMemoryCommand(rest: readonly string[], io: CliIO): Promise<number> {
  const { runMemoryCommand } = await import('./commands/memory.js');
  return runMemoryCommand(rest, io);
}

async function handleIndexCommand(rest: readonly string[], io: CliIO): Promise<number> {
  const { runIndexCommand } = await import('./commands/retrieval.js');
  return runIndexCommand(rest, io);
}

async function handleSearchCommand(rest: readonly string[], io: CliIO): Promise<number> {
  const { runSearchCommand } = await import('./commands/retrieval.js');
  return runSearchCommand(rest, io);
}

async function handleSourcesCommand(rest: readonly string[], io: CliIO): Promise<number> {
  const { runSourcesCommand } = await import('./commands/retrieval.js');
  return runSourcesCommand(rest, io);
}

function handleUnknownCommand(command: string | undefined, io: CliIO): number {
  (io.stderr ?? DEFAULT_IO.stderr)(`Unknown command: ${command ?? '(none)'}`);
  (io.stderr ?? DEFAULT_IO.stderr)(
    'Supported commands: tui (default), chat, compress, compress-memory, memory-sync-dev, setup, doctor, sandbox-diagnostics, content-address-stats, lb, guardrails, config, settings, mcp, connectors, index, search, sources, secrets'
  );
  (io.stderr ?? DEFAULT_IO.stderr)('Chat flags: --agent <name> --plan --mock --model <id> --provider <id>');
  return 1;
}

type CommandHandler = (rest: readonly string[], io: CliIO) => number | Promise<number>;

interface CommandEntry {
  handler: CommandHandler;
  subcommands?: Record<string, CommandHandler>;
}

const COMMANDS: Record<string, CommandEntry> = {
  tui: { handler: handleTuiCommand },
  compress: { handler: handleCompressCommand },
  'compress-memory': { handler: handleCompressMemoryCommand },
  'memory-sync-dev': { handler: handleMemorySyncDevCommand },
  setup: { handler: handleSetupCommand },
  doctor: { handler: handleDoctorCommand },
  'sandbox-diagnostics': { handler: handleSandboxDiagnosticsCommand },
  chat: { handler: handleChatCommand },
  'content-address-stats': { handler: handleContentAddressStatsCommand },
  lb: { handler: handleLbStatusCommand, subcommands: { status: handleLbStatusCommand } },
  sessions: { handler: handleSessionsCommand },
  session: { handler: handleSessionCommand },
  resume: { handler: handleResumeCommand },
  guardrails: {
    handler: handleGuardrailsCommand,
    subcommands: {
      list: handleGuardrailsCommand,
      install: handleGuardrailsCommand,
      uninstall: handleGuardrailsCommand,
      policy: handleGuardrailsCommand
    }
  },
  config: { handler: handleConfigCommand },
  settings: { handler: handleSettingsCommand },
  mcp: {
    handler: handleMcpCommand,
    subcommands: {
      list: handleMcpCommand,
      add: handleMcpCommand,
      remove: handleMcpCommand,
      check: handleMcpCommand
    }
  },
  connectors: {
    handler: handleConnectorsCommand,
    subcommands: {
      list: handleConnectorsCommand,
      check: handleConnectorsCommand
    }
  },
  cmux: {
    handler: handleCmuxCommand,
    subcommands: {
      status: handleCmuxCommand,
      workspace: handleCmuxCommand,
      surface: handleCmuxCommand,
      notify: handleCmuxCommand
    }
  },
  memory: {
    handler: handleMemoryCommand,
    subcommands: { search: handleMemoryCommand, stats: handleMemoryCommand, lint: handleMemoryCommand }
  },
  secrets: {
    handler: handleSecretsCommand,
    subcommands: {
      init: handleSecretsCommand,
      list: handleSecretsCommand,
      lookup: handleSecretsCommand,
      sync: handleSecretsCommand
    }
  },
  index: { handler: handleIndexCommand },
  search: { handler: handleSearchCommand },
  sources: { handler: handleSourcesCommand }
};

export async function runCli(argv: readonly string[], io: CliIO = DEFAULT_IO): Promise<number> {
  const [command, ...rest] = argv;

  if (command === undefined) {
    return handleTuiCommand(argv, io);
  }

  const entry = COMMANDS[command];
  if (!entry) {
    return handleUnknownCommand(command, io);
  }

  if (entry.subcommands) {
    const sub = rest[0];
    const subHandler = sub ? entry.subcommands[sub] : undefined;
    if (subHandler) {
      return await subHandler(rest, io);
    }
    (io.stderr ?? DEFAULT_IO.stderr)(`Unknown ${command} subcommand: ${sub ?? '(none)'}`);
    (io.stderr ?? DEFAULT_IO.stderr)(`Supported: ${command} ${Object.keys(entry.subcommands).join('|')}`);
    return 1;
  }

  return await entry.handler(rest, io);
}
