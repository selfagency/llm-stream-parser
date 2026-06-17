import { type ChildProcess, execSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { safePathEnv } from '@agentsy/shared/safe-path';
import type { Logger } from '../types.js';

export type RestartPolicy = 'always' | 'on-failure' | 'never';

export interface SubprocessSpec {
  args?: string[];
  backoffBaseMs?: number;
  backoffJitter?: boolean;
  backoffMaxMs?: number;
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  id?: string;
  logging?: {
    stdout?: string;
    stderr?: string;
    maxFileSizeBytes?: number;
    maxFiles?: number;
  };
  maxRestarts?: number;
  memoryLimitMb?: number;
  restartPolicy?: RestartPolicy;
  restartWindowMs?: number;
  stallTimeoutMs?: number;
  timeoutMs?: number;
}

export interface SubprocessState {
  exitCode: number | null;
  id: string;
  pid: number | null;
  restartCount: number;
  restartTimestamps: number[];
  spec: SubprocessSpec;
  startedAt: number | null;
  status: 'running' | 'stopped' | 'crashed' | 'stalled' | 'killed';
  stderr: string[];
  stdout: string[];
  stoppedAt: number | null;
}

export interface SubprocessManagerDeps {
  defaultMemoryLimitMb: number;
  defaultRestartPolicy: RestartPolicy;
  defaultStallTimeoutMs: number;
  logger: Logger;
  memoryCheckIntervalMs: number;
}

export class SubprocessManager extends EventEmitter {
  private readonly processes = new Map<string, SubprocessState>();
  private readonly childProcesses = new Map<string, ChildProcess>();
  private readonly stallIntervals = new Map<string, ReturnType<typeof setInterval>>();
  private readonly restartTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private memoryCheckTimer: ReturnType<typeof setInterval> | null = null;
  private readonly deps: SubprocessManagerDeps;

  constructor(deps: SubprocessManagerDeps) {
    super();
    this.deps = deps;
  }

  start(): Promise<void> {
    if (this.deps.memoryCheckIntervalMs > 0) {
      this.memoryCheckTimer = setInterval(() => {
        this.checkMemoryUsage();
      }, this.deps.memoryCheckIntervalMs);
      this.memoryCheckTimer.unref();
    }
    this.deps.logger.info('SubprocessManager started');
    return Promise.resolve();
  }

  spawnProcess(spec: SubprocessSpec): Promise<string> {
    const id = spec.id ?? `proc_${randomUUID().slice(0, 8)}`;
    const state: SubprocessState = {
      id,
      spec,
      pid: null,
      status: 'running',
      startedAt: Date.now(),
      stoppedAt: null,
      restartCount: 0,
      exitCode: null,
      stdout: [],
      stderr: [],
      restartTimestamps: []
    };

    this.processes.set(id, state);
    this.spawnChild(id, spec, state);
    return Promise.resolve(id);
  }

  private spawnChild(id: string, spec: SubprocessSpec, state: SubprocessState): void {
    // Only inherit safe env vars — don't leak secrets to subprocesses
    const { PATH, LANG, LC_ALL, HOME, TMPDIR, USER, SHELL, TERM } = process.env;
    const safeEnv: Record<string, string> = {};
    if (PATH) {
      safeEnv.PATH = PATH;
    }
    if (LANG) {
      safeEnv.LANG = LANG;
    }
    if (LC_ALL) {
      safeEnv.LC_ALL = LC_ALL;
    }
    if (HOME) {
      safeEnv.HOME = HOME;
    }
    if (TMPDIR) {
      safeEnv.TMPDIR = TMPDIR;
    }
    if (USER) {
      safeEnv.USER = USER;
    }
    if (SHELL) {
      safeEnv.SHELL = SHELL;
    }
    if (TERM) {
      safeEnv.TERM = TERM;
    }
    const child = spawn(spec.command, spec.args ?? [], {
      cwd: spec.cwd,
      env: { ...safeEnv, ...spec.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    state.pid = child.pid ?? null;
    this.childProcesses.set(id, child);

    const stallTimeout = spec.stallTimeoutMs ?? this.deps.defaultStallTimeoutMs;
    let lastActivity = Date.now();
    const stallInterval = setInterval(
      () => {
        if (Date.now() - lastActivity > stallTimeout) {
          state.status = 'stalled';
          this.emit('process:stalled', { id });
          child.kill('SIGTERM');
          clearInterval(stallInterval);
          this.stallIntervals.delete(id);
        }
      },
      Math.min(stallTimeout, 10_000)
    ).unref();
    this.stallIntervals.set(id, stallInterval);

    child.stdout?.on('data', (data: Buffer) => {
      lastActivity = Date.now();
      const line = data.toString();
      state.stdout.push(line);
      // Ring buffer: cap at 1000 lines
      if (state.stdout.length > 1000) {
        state.stdout.splice(0, state.stdout.length - 1000);
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      lastActivity = Date.now();
      const line = data.toString();
      state.stderr.push(line);
      // Ring buffer: cap at 1000 lines
      if (state.stderr.length > 1000) {
        state.stderr.splice(0, state.stderr.length - 1000);
      }
    });

    child.on('exit', code => {
      clearInterval(stallInterval);
      this.stallIntervals.delete(id);
      state.exitCode = code;
      state.status = code === 0 ? 'stopped' : 'crashed';
      state.stoppedAt = Date.now();
      this.childProcesses.delete(id);
      this.emit('process:exited', { id, code });

      if (this.shouldRestart(spec, code)) {
        const delay = this.calculateBackoff(state);
        if (delay >= 0) {
          state.restartCount++;
          state.status = 'running';
          this.emit('process:restarted', { id, attempt: state.restartCount, delay });
          const timer = setTimeout(() => {
            this.restartTimers.delete(id);
            this.spawnChild(id, spec, state);
          }, delay).unref();
          this.restartTimers.set(id, timer);
        }
      }
    });

    child.on('error', err => {
      this.deps.logger.error(`Subprocess ${id} error:`, err);
    });
  }

  private shouldRestart(spec: SubprocessSpec, exitCode: number | null): boolean {
    const policy = spec.restartPolicy ?? this.deps.defaultRestartPolicy;
    if (policy === 'never') {
      return false;
    }
    if (policy === 'always') {
      return true;
    }
    if (policy === 'on-failure') {
      return exitCode !== 0;
    }
    return false;
  }

  private calculateBackoff(state: SubprocessState): number {
    const now = Date.now();
    const windowMs = state.spec.restartWindowMs ?? 60_000;
    const maxRestarts = state.spec.maxRestarts ?? 5;

    // Clean old timestamps
    state.restartTimestamps = state.restartTimestamps.filter(t => t >= now - windowMs);

    if (state.restartTimestamps.length >= maxRestarts) {
      this.deps.logger.warn(`Subprocess ${state.id} exceeded max restarts, giving up`);
      return -1;
    }

    state.restartTimestamps.push(now);
    const attempt = state.restartTimestamps.length;

    const baseMs = state.spec.backoffBaseMs ?? 1000;
    const maxMs = state.spec.backoffMaxMs ?? 30_000;
    let delay = Math.min(baseMs * 2 ** (attempt - 1), maxMs);

    if (state.spec.backoffJitter !== false) {
      // nosemgrep: insecure-randomness -- Math.random() is used for retry-backoff jitter.
      // Predictability of jitter confers no advantage; jitter exists to prevent thundering-herd
      // retries, not to provide cryptographic randomness.
      delay += Math.random() * delay * 0.25;
    }

    return Math.floor(delay);
  }

  private checkMemoryUsage(): void {
    for (const [id, child] of this.childProcesses) {
      const state = this.processes.get(id);
      if (!state?.spec.memoryLimitMb) {
        continue;
      }

      try {
        const childRss = getChildRss(child.pid ?? null);
        if (childRss === null) {
          continue; // Platform not supported or process already gone
        }
        const limitBytes = (state.spec.memoryLimitMb ?? this.deps.defaultMemoryLimitMb) * 1024 * 1024;
        if (childRss > limitBytes) {
          this.deps.logger.warn(`Subprocess ${id} exceeded memory limit`, { rss: childRss, limit: limitBytes });
          child.kill('SIGKILL');
          state.status = 'killed';
          this.emit('process:killed', { id, reason: 'memory' });
        }
      } catch {
        // ignore
      }
    }
  }

  killProcess(id: string): boolean {
    // Clean up timers and intervals
    this.clearProcessTimers(id);

    const child = this.childProcesses.get(id);
    if (!child) {
      return false;
    }
    child.kill('SIGTERM');
    const state = this.processes.get(id);
    if (state) {
      state.status = 'killed';
      state.stoppedAt = Date.now();
    }
    this.emit('process:killed', { id, reason: 'manual' });
    return true;
  }

  private clearProcessTimers(id: string): void {
    const stallInterval = this.stallIntervals.get(id);
    if (stallInterval) {
      clearInterval(stallInterval);
      this.stallIntervals.delete(id);
    }
    const restartTimer = this.restartTimers.get(id);
    if (restartTimer) {
      clearTimeout(restartTimer);
      this.restartTimers.delete(id);
    }
  }

  listProcesses(): SubprocessState[] {
    return Array.from(this.processes.values());
  }

  getOutput(id: string): { stdout: string[]; stderr: string[] } | null {
    const state = this.processes.get(id);
    if (!state) {
      return null;
    }
    return { stdout: state.stdout, stderr: state.stderr };
  }

  count(): number {
    return this.processes.size;
  }

  killAll(): Promise<void> {
    // Clear all timers first
    for (const id of this.stallIntervals.keys()) {
      this.clearProcessTimers(id);
    }
    for (const id of this.restartTimers.keys()) {
      this.clearProcessTimers(id);
    }

    const exits = Array.from(this.childProcesses.entries()).map(
      ([_id, child]) =>
        new Promise<void>(resolve => {
          child.once('exit', () => resolve());
          child.kill('SIGTERM');
          setTimeout(() => {
            child.kill('SIGKILL');
            resolve();
          }, 5000).unref();
        })
    );
    return Promise.all(exits).then(() => {
      this.childProcesses.clear();
    });
  }

  stop(): Promise<void> {
    if (this.memoryCheckTimer) {
      clearInterval(this.memoryCheckTimer);
      this.memoryCheckTimer = null;
    }
    return this.killAll();
  }
}

/**
 * Get the RSS (resident set size) of a child process by PID.
 * Returns null on unsupported platforms or if the process is gone.
 */
const rssReaders: Record<string, (pid: number) => number | null> = {
  linux: pid => {
    const status = execSync(`grep VmRSS /proc/${pid}/status 2>/dev/null || true`, {
      env: safePathEnv(),
      encoding: 'utf-8' as const,
      timeout: 1000
    });
    const match = status.match(/VmRSS:\s+(\d+)\s+kB/);
    return match?.[1] ? Number.parseInt(match[1], 10) * 1024 : null;
  },
  darwin: pid => {
    const output = execSync(`ps -p ${pid} -o rss= 2>/dev/null || true`, {
      env: safePathEnv(),
      encoding: 'utf-8' as const,
      timeout: 1000
    });
    const trimmed = output.trim();
    return trimmed ? Number.parseInt(trimmed, 10) * 1024 : null;
  },
  win32: pid => {
    const output = execSync(`wmic process where processid=${pid} get workingsetsize /format:csv 2>nul || echo ""`, {
      env: safePathEnv(),
      encoding: 'utf-8' as const,
      timeout: 1000
    });
    const match = output.match(/\n(\d+)/);
    return match?.[1] ? Number.parseInt(match[1], 10) : null;
  }
};

function getChildRss(pid: number | null): number | null {
  if (pid === null || pid <= 0) {
    return null;
  }
  const platform = process.platform;
  let reader: ((pid: number) => number | null) | undefined;
  if (platform === 'linux') {
    reader = rssReaders.linux;
  } else if (platform === 'darwin') {
    reader = rssReaders.darwin;
  } else if (platform === 'win32') {
    reader = rssReaders.win32;
  } else {
    return null;
  }
  // biome-ignore lint/style/noNonNullAssertion: reader is assigned in every non-returning branch above
  try {
    return reader!(pid);
  } catch {
    return null;
  }
}
