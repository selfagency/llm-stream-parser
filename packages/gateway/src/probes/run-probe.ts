import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import type { ParsedUsage, UsageProbe } from '@agentsy/providers/profiles';

export interface ProbeContext {
  /** API key for the provider. Optional — some probes are unauthenticated. */
  apiKey?: string;
  /** Provider base URL. Required for `kind: 'api'` probes. */
  baseUrl?: string;
  /** Optional fetch implementation override (for tests + non-undici runtimes). */
  fetch?: typeof globalThis.fetch;
  /** Custom path for `kind: 'local'` probes (e.g. socket path or file path). */
  localPath?: string;
  /** Probe timeout in milliseconds. Default 5000. */
  timeoutMs?: number;
}

/**
 * Execute a usage probe. Returns a normalized `ParsedUsage` snapshot, or
 * `null` if the probe could not be resolved (network failure, missing
 * context, parse error).
 *
 * - `kind: 'api'` — HTTP fetch to `ctx.baseUrl + probe.path` with the
 *   probe's declared auth header (or `Authorization: Bearer <apiKey>`
 *   when `authPrefix` is `'Bearer'`). Response is parsed by the
 *   probe's `parse` callback when present, otherwise by `defaultApiParse`.
 * - `kind: 'local'` — read the file at `ctx.localPath` (or `probe.path`
 *   when `localPath` is omitted). Useful for Ollama's `/api/tags`
 *   output, CodexBar's local cache file, etc.
 * - `kind: 'cli'` — spawn `probe.command` and read stdout. Parsed by
 *   the same `parse` callback.
 */
export function runProbe(probe: UsageProbe, ctx: ProbeContext): Promise<ParsedUsage | null> {
  switch (probe.kind) {
    case 'api':
      return runApiProbe(probe, ctx);
    case 'local':
      return runLocalProbe(probe, ctx);
    case 'cli':
      return runCliProbe(probe, ctx);
    default:
      return assertNever(probe.kind);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unknown probe kind: ${String(value)}`);
}

function buildHeaders(probe: UsageProbe, ctx: ProbeContext): Record<string, string> {
  const headers = { ...probe.headers };
  if (ctx.apiKey !== undefined && ctx.apiKey.length > 0) {
    if (probe.authPrefix !== undefined && probe.authPrefix.length > 0) {
      headers[probe.authPrefix] = ctx.apiKey;
    } else {
      headers.Authorization = `Bearer ${ctx.apiKey}`;
    }
  }
  return headers;
}

async function runApiProbe(probe: UsageProbe, ctx: ProbeContext): Promise<ParsedUsage | null> {
  if (ctx.baseUrl === undefined) {
    return null;
  }
  const url = absoluteOrRelative(probe.path, ctx.baseUrl);
  const fetchImpl = ctx.fetch ?? globalThis.fetch;
  if (fetchImpl === undefined) {
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ctx.timeoutMs ?? 5000);
  try {
    const response = await fetchImpl(url, {
      headers: buildHeaders(probe, ctx),
      signal: controller.signal
    });
    if (!response.ok) {
      return null;
    }
    const body = await response.text();
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return parseResponse(probe, { body, headers });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function runLocalProbe(probe: UsageProbe, ctx: ProbeContext): Promise<ParsedUsage | null> {
  const path = ctx.localPath ?? probe.path;
  try {
    const body = await readFile(path, 'utf8');
    return parseResponse(probe, { body, headers: {} });
  } catch {
    return null;
  }
}

function runCliProbe(probe: UsageProbe, ctx: ProbeContext): Promise<ParsedUsage | null> {
  if (probe.command === undefined) {
    return Promise.resolve(null);
  }
  const args = tokenize(probe.command);
  if (args.length === 0) {
    return Promise.resolve(null);
  }
  const [command, ...rest] = args;
  if (command === undefined) {
    return Promise.resolve(null);
  }
  return new Promise(resolve => {
    const child = spawn(command, rest, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', chunk => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', () => {
      // stderr is captured but ignored — CLI probe output is stdout.
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), ctx.timeoutMs ?? 5000);
    child.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve(null);
        return;
      }
      resolve(parseResponse(probe, { body: stdout, headers: {} }));
    });
  });
}

function parseResponse(
  probe: UsageProbe,
  response: { body: string; headers: Record<string, string> }
): ParsedUsage | null {
  if (probe.parse !== undefined) {
    try {
      return probe.parse(response);
    } catch {
      return null;
    }
  }
  return defaultApiParse(response);
}

/**
 * Best-effort parser for unknown probe responses. Recognises the
 * common OpenAI/Anthropic header shapes and falls back to JSON
 * `usage` / `rate_limit` fields.
 */
export function defaultApiParse(response: { body: string; headers: Record<string, string> }): ParsedUsage | null {
  const fromHeaders = parseRateLimitHeadersToUsage(response.headers);
  if (fromHeaders !== null) {
    return fromHeaders;
  }
  return parseJsonBody(response.body);
}

function parseJsonBody(body: string): ParsedUsage | null {
  try {
    const json = JSON.parse(body) as unknown;
    if (typeof json !== 'object' || json === null) {
      return null;
    }
    const obj = json as Record<string, unknown>;

    const usage = obj.usage;
    if (typeof usage === 'object' && usage !== null) {
      return parseUsageObject(usage as Record<string, unknown>);
    }

    const rateLimit = obj.rate_limit;
    if (typeof rateLimit === 'object' && rateLimit !== null) {
      return parseRateLimitObject(rateLimit as Record<string, unknown>);
    }

    return parseTopLevelFields(obj);
  } catch {
    return null;
  }
}

function parseUsageObject(u: Record<string, unknown>): ParsedUsage | null {
  return snapshotFromPairs([
    ['creditsRemaining', numberOrUndefined(u.credits_remaining ?? u.creditsRemaining)],
    ['rpmLimit', numberOrUndefined(u.rpm_limit ?? u.rpmLimit)],
    ['rpmRemaining', numberOrUndefined(u.rpm_remaining ?? u.rpmRemaining)],
    ['tpmLimit', numberOrUndefined(u.tpm_limit ?? u.tpmLimit)],
    ['tpmRemaining', numberOrUndefined(u.tpm_remaining ?? u.tpmRemaining)]
  ]);
}

function parseRateLimitObject(r: Record<string, unknown>): ParsedUsage | null {
  return snapshotFromPairs([
    ['rpmLimit', numberOrUndefined(r.rpm_limit)],
    ['rpmRemaining', numberOrUndefined(r.rpm_remaining)],
    ['tpmLimit', numberOrUndefined(r.tpm_limit)],
    ['tpmRemaining', numberOrUndefined(r.tpm_remaining)]
  ]);
}

function parseTopLevelFields(obj: Record<string, unknown>): ParsedUsage | null {
  return snapshotFromPairs([
    ['creditsRemaining', numberOrUndefined(obj.credits_remaining ?? obj.creditsRemaining)],
    ['rpmLimit', numberOrUndefined(obj.rpm_limit ?? obj.rpmLimit)],
    ['rpmRemaining', numberOrUndefined(obj.rpm_remaining ?? obj.rpmRemaining)],
    ['tpmLimit', numberOrUndefined(obj.tpm_limit ?? obj.tpmLimit)],
    ['tpmRemaining', numberOrUndefined(obj.tpm_remaining ?? obj.tpmRemaining)]
  ]);
}

function snapshotFromPairs(entries: [keyof ParsedUsage, number | undefined][]): ParsedUsage | null {
  const snapshot: ParsedUsage = {};
  let hasValue = false;
  for (const [key, value] of entries) {
    if (value !== undefined) {
      snapshot[key] = value;
      hasValue = true;
    }
  }
  return hasValue ? snapshot : null;
}

function parseRateLimitHeadersToUsage(headers: Record<string, string>): ParsedUsage | null {
  const lookup = (suffix: 'requests' | 'tokens'): { limit: number; remaining: number } | undefined => {
    const limitHeader =
      headers[`x-ratelimit-limit-${suffix}`] ?? headers[`x-ratelimit-limit-${suffix === 'requests' ? 'rpm' : 'tpm'}`];
    const remainingHeader =
      headers[`x-ratelimit-remaining-${suffix}`] ??
      headers[`x-ratelimit-remaining-${suffix === 'requests' ? 'rpm' : 'tpm'}`];
    if (limitHeader === undefined && remainingHeader === undefined) {
      return;
    }
    return {
      limit: numberOrUndefined(limitHeader) ?? 0,
      remaining: numberOrUndefined(remainingHeader) ?? 0
    };
  };
  const requests = lookup('requests');
  const tokens = lookup('tokens');
  if (requests === undefined && tokens === undefined) {
    return null;
  }
  const usage: ParsedUsage = {};
  if (requests !== undefined) {
    usage.rpmLimit = requests.limit;
    usage.rpmRemaining = requests.remaining;
  }
  if (tokens !== undefined) {
    usage.tpmLimit = tokens.limit;
    usage.tpmRemaining = tokens.remaining;
  }
  return usage;
}

function numberOrUndefined(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
}

function absoluteOrRelative(path: string, baseUrl: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  const trimmed = baseUrl.replace(/\/$/, '');
  if (path.startsWith('/')) {
    return `${trimmed}${path}`;
  }
  return `${trimmed}/${path}`;
}

function tokenize(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | undefined;
  for (const ch of command) {
    if (quote !== undefined) {
      if (ch === quote) {
        quote = undefined;
        continue;
      }
      current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (current.length > 0) {
    tokens.push(current);
  }
  return tokens;
}
