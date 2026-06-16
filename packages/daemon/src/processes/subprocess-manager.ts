import { type ChildProcess, spawn } from 'node:child_process';
import type { Logger } from '../types.js';

export interface SubprocessSpec {
  args?: string[];
  autoRestart?: boolean;
  command: string;
  cwd?: string;
  env?: Record<string, string>;
  maxRestarts?: number;
  memoryLimitBytes?: number;
  stallTimeoutMs?: number;
}

export interface SubprocessState {
  exitCode: number | null;
  id: string;
  pid: number | null;
  restartCount: number;
  spec: SubprocessSpec;
  startedAt: number | null;
  status: 'running' | 'stopped' | 'crashed' | 'stalled' | 'killed';
  stderr: string[];
  stdout: string[];
  stoppedAt: number | null;
}

export interface SubprocessManagerDeps {
  defaultMemoryLimitBytes: number;
  defaultStallTimeoutMs: number;
  logger: Logger;
  memoryCheckIntervalMs: number;
}

export class SubprocessManager {
  private readonly processes = new Map<string, SubprocessState>();
  private readonly childProcesses = new Map<string, ChildProcess>();
  private memoryCheckTimer: ReturnType<typeof setInterval> | null = null;
  private readonly deps: SubprocessManagerDeps;

  constructor(deps: SubprocessManagerDeps) {
    this.deps = deps;
  }

  async start(): Promise<void> {
    if (this.deps.memoryCheckIntervalMs > 0) {
      this.memoryCheckTimer = setInterval(() => {
        this.checkMemoryUsage();
      }, this.deps.memoryCheckIntervalMs);
      this.memoryCheckTimer.unref();
    }
    this.deps.logger.info('SubprocessManager started');
  }

  async spawnProcess(spec: SubprocessSpec): Promise<string> {
    const id = `proc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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
      stderr: []
    };

    this.processes.set(id, state);
    this.spawnChild(id, spec, state);

    return id;
  }

  private spawnChild(id: string, spec: SubprocessSpec, state: SubprocessState): void {
    const child = spawn(spec.command, spec.args ?? [], {
      cwd: spec.cwd,
      env: { ...process.env, ...spec.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    state.pid = child.pid ?? null;
    this.childProcesses.set(id, child);

    child.stdout?.on('data', (data: Buffer) => {
      state.stdout.push(data.toString());
    });

    child.stderr?.on('data', (data: Buffer) => {
      state.stderr.push(data.toString());
    });

    child.on('exit', code => {
      state.exitCode = code;
      state.status = code === 0 ? 'stopped' : 'crashed';
      state.stoppedAt = Date.now();
      this.childProcesses.delete(id);

      if (spec.autoRestart && state.restartCount < (spec.maxRestarts ?? 3)) {
        state.restartCount++;
        state.status = 'running';
        this.spawnChild(id, spec, state);
      }
    });

    child.on('error', err => {
      this.deps.logger.error(`Subprocess ${id} error:`, err);
    });
  }

  private checkMemoryUsage(): void {
    for (const [id, child] of this.childProcesses) {
      const state = this.processes.get(id);
      if (!state?.spec.memoryLimitBytes) {
        continue;
      }

      // Simple RSS check via pidusage equivalent
      try {
        const rss = process.memoryUsage().rss; // Placeholder — real impl would use pidusage
        if (rss > state.spec.memoryLimitBytes) {
          this.deps.logger.warn(`Subprocess ${id} exceeded memory limit`, { rss, limit: state.spec.memoryLimitBytes });
          child.kill('SIGKILL');
          state.status = 'killed';
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

  async killAll(): Promise<void> {
    for (const [id, child] of this.childProcesses) {
      child.kill('SIGTERM');
      const state = this.processes.get(id);
      if (state) {
        state.status = 'killed';
        state.stoppedAt = Date.now();
      }
    }
    this.childProcesses.clear();
  }

  async stop(): Promise<void> {
    if (this.memoryCheckTimer) {
      clearInterval(this.memoryCheckTimer);
      this.memoryCheckTimer = null;
    }
    await this.killAll();
    this.deps.logger.info('SubprocessManager stopped');
  }
}
