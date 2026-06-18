import { createLoadBalancedClient, type LoadBalancedClient, type StrategyName } from '@agentsy/gateway';

import type { CliIO } from '../index.js';

const defaultIo = {
  stderr: (msg: string): void => {
    console.error(msg);
  },
  stdout: (msg: string): void => {
    console.log(msg);
  }
};

interface LbStatusOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  provider?: string;
  strategy?: StrategyName;
}

const KNOWN_STRATEGIES: readonly StrategyName[] = [
  'adaptive',
  'cost-based',
  'latency',
  'least-connections',
  'priority-fallback',
  'round-robin',
  'weighted'
];

function isStrategyName(value: string): value is StrategyName {
  return (KNOWN_STRATEGIES as readonly string[]).includes(value);
}

function getFlagValue(argv: readonly string[], flag: string): string | undefined {
  const prefix = `${flag}=`;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) {
      continue;
    }
    if (arg === flag) {
      return argv[i + 1] ?? '';
    }
    if (arg.startsWith(prefix)) {
      return arg.slice(prefix.length);
    }
  }
}

function readOptions(argv: readonly string[]): LbStatusOptions {
  const options: LbStatusOptions = {};
  const provider = getFlagValue(argv, '--provider');
  if (provider !== undefined && provider.length > 0) {
    options.provider = provider;
  }
  const model = getFlagValue(argv, '--model');
  if (model !== undefined && model.length > 0) {
    options.model = model;
  }
  const apiKey = getFlagValue(argv, '--api-key');
  if (apiKey !== undefined && apiKey.length > 0) {
    options.apiKey = apiKey;
  }
  const baseUrl = getFlagValue(argv, '--base-url');
  if (baseUrl !== undefined && baseUrl.length > 0) {
    options.baseUrl = baseUrl;
  }
  const strategy = getFlagValue(argv, '--strategy');
  if (strategy !== undefined && strategy.length > 0 && isStrategyName(strategy)) {
    options.strategy = strategy;
  }
  return options;
}

function buildClient(options: LbStatusOptions): LoadBalancedClient {
  const providerId = options.provider ?? 'default';
  // The CLI accepts arbitrary provider ids; the gateway's ProviderEntrySchema
  // validates via z.custom<NormalizerProvider>(), so we cast here. The CLI
  // does not enforce a closed set — a mistyped provider id surfaces as a
  // runtime failure from the upstream provider, not a CLI startup error.
  return createLoadBalancedClient({
    ...(options.model === undefined ? {} : { model: options.model }),
    providers: [
      {
        ...(options.apiKey === undefined ? {} : { apiKey: options.apiKey }),
        ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
        id: providerId,
        name: `${providerId} (single-provider config)`,
        provider: providerId as Parameters<typeof createLoadBalancedClient>[0]['providers'][number]['provider']
      }
    ],
    ...(options.strategy === undefined ? {} : { strategy: options.strategy })
  });
}

const STATUS_COLORS = {
  degraded: '\u001B[33m',
  healthy: '\u001B[32m',
  reset: '\u001B[0m',
  unhealthy: '\u001B[31m',
  unknown: '\u001B[90m'
} as const;

function colorize(status: string, text: string, useColor: boolean): string {
  if (!useColor) {
    return text;
  }
  const color = STATUS_COLORS[status as keyof typeof STATUS_COLORS] ?? STATUS_COLORS.unknown;
  return `${color}${text}${STATUS_COLORS.reset}`;
}

function formatUsage(usage: {
  averageLatencyMs?: number;
  errorRate?: number;
  rpmRemaining?: number;
  tpmRemaining?: number;
}): string {
  const parts: string[] = [];
  if (usage.errorRate !== undefined) {
    const errPct = (usage.errorRate * 100).toFixed(1);
    parts.push(`errors=${errPct}%`);
  }
  if (usage.averageLatencyMs !== undefined) {
    parts.push(`latency=${Math.round(usage.averageLatencyMs)}ms`);
  }
  if (usage.rpmRemaining !== undefined) {
    parts.push(`rpm=${usage.rpmRemaining}`);
  }
  if (usage.tpmRemaining !== undefined) {
    parts.push(`tpm=${usage.tpmRemaining}`);
  }
  return parts.length === 0 ? '(no telemetry)' : parts.join(' ');
}

export function runLbStatusCommand(argv: readonly string[], io: CliIO = defaultIo): number {
  const options = readOptions(argv);
  const asJson = argv.includes('--json');
  const noColor = argv.includes('--no-color');
  const stdout = io.stdout ?? defaultIo.stdout;
  const stderr = io.stderr ?? defaultIo.stderr;

  const client = buildClient(options);
  const state = client.getRoutingState();
  const usage = client.getUsageSnapshot();

  if (asJson) {
    stdout(
      JSON.stringify(
        {
          routing: state,
          usage,
          strategy: state.strategy
        },
        null,
        2
      )
    );
    return 0;
  }

  if (state.providerCount === 0) {
    stderr('No providers configured. Pass --provider openai (or similar).');
    return 1;
  }

  stdout('Gateway Load-Balancer Status');
  stdout('-----------------------------');
  stdout(`Strategy:           ${state.strategy}`);
  stdout(`Provider count:     ${state.providerCount}`);
  stdout(`Active provider:    ${state.providerId}`);
  stdout(`Active provider status: ${colorize(state.providerStatus, state.providerStatus, !noColor)}`);
  stdout('');
  stdout('Per-provider usage:');
  for (const entry of usage) {
    const marker = colorize('unknown', '·', !noColor);
    stdout(`  ${marker} ${entry.providerId.padEnd(28)} ${formatUsage(entry)}`);
  }
  return 0;
}
