import { type ChildProcess, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
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
    const id = spec.id ?? `proc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
    const child = spawn(spec.command, spec.args ?? [], {
      cwd: spec.cwd,
      env: { ...process.env, ...spec.env },
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
        }
      },
      Math.min(stallTimeout, 10_000)
    ).unref();

    child.stdout?.on('data', (data: Buffer) => {
      lastActivity = Date.now();
      state.stdout.push(data.toString());
    });

    child.stderr?.on('data', (data: Buffer) => {
      lastActivity = Date.now();
      state.stderr.push(data.toString());
    });

    child.on('exit', code => {
      clearInterval(stallInterval);
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
          setTimeout(() => this.spawnChild(id, spec, state), delay).unref();
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
        const rss = process.memoryUsage().rss;
        const limitBytes = (state.spec.memoryLimitMb ?? this.deps.defaultMemoryLimitMb) * 1024 * 1024;
        if (rss > limitBytes) {
          this.deps.logger.warn(`Subprocess ${id} exceeded memory limit`, { rss, limit: limitBytes });
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
    for (const [id, child] of this.childProcesses) {
      child.kill('SIGTERM');
      const state = this.processes.get(id);
      if (state) {
        state.status = 'killed';
        state.stoppedAt = Date.now();
      }
    }
    this.childProcesses.clear();
    return Promise.resolve();
  }

  stop(): Promise<void> {
    if (this.memoryCheckTimer) {
      clearInterval(this.memoryCheckTimer);
      this.memoryCheckTimer = null;
    }
    return this.killAll();
  }
}
