import { exec as execCb } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';
import { promisify } from 'node:util';

const execAsync = promisify(execCb);

// ─── Types ──────────────────────────────────────────────────────────────

export interface PersistentShellOptions {
  readonly id?: string;
  readonly inheritEnv?: boolean;
  readonly initialCwd?: string;
  readonly initialEnv?: Readonly<Record<string, string>>;
}

export interface ShellExecOptions {
  readonly timeout?: number;
  readonly workdir?: string;
}

export interface ShellExecResult {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

export interface PersistentShell {
  readonly cwd: string;
  dispose(): void;
  readonly env: Readonly<Record<string, string>>;
  exec(command: string, options?: ShellExecOptions): Promise<ShellExecResult>;
  getCwd(): string;
  getEnv(): Record<string, string>;
  readonly id: string;
  isDisposed(): boolean;
  reset(): void;
  setEnv(key: string, value: string): void;
  unsetEnv(key: string): void;
}

export interface PersistentShellManager {
  destroy(agentId: string): void;
  destroyAll(): void;
  get(agentId: string): PersistentShell | undefined;
  getOrCreate(agentId: string, options?: PersistentShellOptions): PersistentShell;
  has(agentId: string): boolean;
  size(): number;
}

// ─── Helpers ────────────────────────────────────────────────────────────

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function resolveTargetPath(target: string, currentCwd: string): string | null {
  const stripped = stripQuotes(target.trim());
  if (!stripped || stripped === '-') {
    return null;
  }
  let expanded = stripped;
  if (expanded.startsWith('~')) {
    expanded = expanded.replace(/^~(?=\/|$)/, homedir());
  }
  if (isAbsolute(expanded)) {
    return resolve(expanded);
  }
  return resolve(currentCwd, expanded);
}

/**
 * Parse cd commands from a shell string.
 * Returns the final resolved cwd after applying all cd commands in order,
 * or null if no cd found.
 */
function parseCdTargets(command: string, currentCwd: string): string | null {
  const cdRegex = /(?:^|[;\n&|]\s*|\s*&&\s*|\s*\|\|\s*)cd(?:\s+([^\s;|& \n]+))?/g;
  let lastCwd: string | null = null;
  let workingCwd = currentCwd;

  for (const match of command.matchAll(cdRegex)) {
    const rawTarget = match[1];
    if (rawTarget === undefined) {
      const home = homedir();
      if (home) {
        workingCwd = resolve(home);
        lastCwd = workingCwd;
      }
      continue;
    }
    const resolved = resolveTargetPath(rawTarget, workingCwd);
    if (resolved) {
      workingCwd = resolved;
      lastCwd = resolved;
    }
  }

  return lastCwd;
}

function parseExportAssignments(command: string): Array<{ key: string; value: string }> {
  const assignments: Array<{ key: string; value: string }> = [];
  const exportRegex = /export\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*("[^"]*"|'[^']*'|[^\s;|&\n]+)/g;

  for (const match of command.matchAll(exportRegex)) {
    const key = match[1];
    const rawVal = match[2];
    if (!key || rawVal === undefined) {
      continue;
    }
    const rawValue = stripQuotes(rawVal);
    assignments.push({ key, value: rawValue });
  }

  const trimmed = command.trim();
  const standaloneRegex = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*("[^"]*"|'[^']*'|[^\s;|&\n]+)\s*$/;
  const single = standaloneRegex.exec(trimmed);
  if (single) {
    const key = single[1];
    const rawVal = single[2];
    if (key && rawVal !== undefined) {
      assignments.push({
        key,
        value: stripQuotes(rawVal)
      });
    }
  }

  return assignments;
}

function parseUnsetVars(command: string): string[] {
  const vars: string[] = [];
  const unsetRegex = /unset\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  for (const match of command.matchAll(unsetRegex)) {
    const name = match[1];
    if (name) {
      vars.push(name);
    }
  }
  return vars;
}

function buildEnvRecord(inheritEnv: boolean, initialEnv?: Readonly<Record<string, string>>): Record<string, string> {
  // Null-prototype object prevents prototype pollution via __proto__/constructor/prototype keys
  const base: Record<string, string> = Object.create(null) as Record<string, string>;
  if (inheritEnv) {
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined) {
        base[k] = v;
      }
    }
  }
  if (initialEnv) {
    for (const [k, v] of Object.entries(initialEnv)) {
      base[k] = v;
    }
  }
  return base;
}

function safeIsDirectory(p: string): boolean {
  try {
    if (!existsSync(p)) {
      return false;
    }
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Normalize a child_process exec error into stdout/stderr/exitCode. */
function normalizeExecError(error: unknown): { exitCode: number; stderr: string; stdout: string } {
  const execError = error as unknown as {
    stdout?: string | Buffer;
    stderr?: string | Buffer;
    code?: number;
    status?: number;
  };
  const stdout =
    typeof execError.stdout === 'string' ? execError.stdout : ((execError.stdout as Buffer)?.toString?.('utf-8') ?? '');
  const stderr =
    typeof execError.stderr === 'string' ? execError.stderr : ((execError.stderr as Buffer)?.toString?.('utf-8') ?? '');
  const exitCode = execError.code ?? execError.status ?? 1;
  return { exitCode, stderr, stdout };
}

// ─── Implementation ─────────────────────────────────────────────────────

class PersistentShellImpl implements PersistentShell {
  readonly id: string;
  #cwd: string;
  #disposed = false;
  #env: Record<string, string>;
  readonly #initialCwd: string;
  readonly #initialEnv: Record<string, string>;
  readonly #inheritEnv: boolean;

  constructor(options: PersistentShellOptions = {}) {
    this.id = options.id ?? `shell_${Date.now()}_${randomUUID().slice(0, 6)}`;
    const initialCwd = options.initialCwd ?? process.cwd();
    this.#initialCwd = initialCwd;
    this.#cwd = initialCwd;
    this.#inheritEnv = options.inheritEnv !== false;
    this.#initialEnv = options.initialEnv ? { ...options.initialEnv } : (Object.create(null) as Record<string, string>);
    this.#env = buildEnvRecord(this.#inheritEnv, options.initialEnv);
  }

  get cwd(): string {
    return this.#cwd;
  }

  get env(): Readonly<Record<string, string>> {
    return { ...this.#env };
  }

  getCwd(): string {
    return this.#cwd;
  }

  getEnv(): Record<string, string> {
    return { ...this.#env };
  }

  setEnv(key: string, value: string): void {
    this.#assertNotDisposed();
    if (!key) {
      throw new Error('setEnv: key must be non-empty');
    }
    // Guard against prototype-pollution keys parsed from command strings
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return;
    }
    this.#env[key] = value;
  }

  unsetEnv(key: string): void {
    this.#assertNotDisposed();
    if (!key) {
      return;
    }
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return;
    }
    delete this.#env[key];
  }

  reset(): void {
    this.#assertNotDisposed();
    this.#cwd = this.#initialCwd;
    this.#env = buildEnvRecord(this.#inheritEnv, this.#initialEnv);
  }

  #assertNotDisposed(): void {
    if (this.#disposed) {
      throw new Error(`PersistentShell ${this.id} is disposed`);
    }
  }

  async exec(command: string, options: ShellExecOptions = {}): Promise<ShellExecResult> {
    this.#assertNotDisposed();

    if (!command || typeof command !== 'string' || !command.trim()) {
      throw new Error('exec: command must be a non-empty string');
    }

    const timeout = options.timeout ?? 30_000;
    const explicitWorkdir = options.workdir ? (resolveTargetPath(options.workdir, this.#cwd) ?? this.#cwd) : null;

    const effectiveCwd = explicitWorkdir ?? this.#cwd;

    if (explicitWorkdir && safeIsDirectory(explicitWorkdir)) {
      this.#cwd = explicitWorkdir;
    }

    const execEnv = { ...this.#env };

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: effectiveCwd,
        env: execEnv,
        timeout,
        maxBuffer: 10 * 1024 * 1024,
        encoding: 'utf-8'
      });

      this.#applyStateTracking(command, effectiveCwd, true);

      return {
        cwd: this.#cwd,
        env: { ...this.#env },
        exitCode: 0,
        stderr: stderr ?? '',
        stdout: stdout ?? ''
      };
    } catch (error) {
      const { exitCode, stderr, stdout } = normalizeExecError(error);

      this.#applyEnvTracking(command);

      return {
        cwd: this.#cwd,
        env: { ...this.#env },
        exitCode,
        stderr,
        stdout
      };
    }
  }

  #applyStateTracking(command: string, execCwd: string, success: boolean): void {
    if (success) {
      const newCwd = parseCdTargets(command, execCwd);
      if (newCwd) {
        this.#cwd = newCwd;
      }
    }
    this.#applyEnvTracking(command);
  }

  #applyEnvTracking(command: string): void {
    for (const { key, value } of parseExportAssignments(command)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue;
      }
      this.#env[key] = value;
    }
    for (const varName of parseUnsetVars(command)) {
      if (varName === '__proto__' || varName === 'constructor' || varName === 'prototype') {
        continue;
      }
      delete this.#env[varName];
    }
  }

  dispose(): void {
    this.#disposed = true;
  }

  isDisposed(): boolean {
    return this.#disposed;
  }
}

class PersistentShellManagerImpl implements PersistentShellManager {
  readonly #shells = new Map<string, PersistentShellImpl>();

  getOrCreate(agentId: string, options?: PersistentShellOptions): PersistentShell {
    if (!agentId) {
      throw new Error('getOrCreate: agentId must be non-empty');
    }
    const existing = this.#shells.get(agentId);
    if (existing && !existing.isDisposed()) {
      return existing;
    }
    const shell = new PersistentShellImpl({
      ...options,
      id: options?.id ?? agentId
    });
    this.#shells.set(agentId, shell);
    return shell;
  }

  get(agentId: string): PersistentShell | undefined {
    const shell = this.#shells.get(agentId);
    if (!shell || shell.isDisposed()) {
      // biome-ignore lint/complexity/noUselessUndefined: explicit undefined required for union return
      return undefined;
    }
    return shell;
  }

  has(agentId: string): boolean {
    const shell = this.#shells.get(agentId);
    return !!shell && !shell.isDisposed();
  }

  destroy(agentId: string): void {
    const shell = this.#shells.get(agentId);
    if (shell) {
      try {
        shell.dispose();
      } catch {
        // ignore
      }
      this.#shells.delete(agentId);
    }
  }

  destroyAll(): void {
    for (const [agentId] of this.#shells) {
      this.destroy(agentId);
    }
  }

  size(): number {
    let count = 0;
    for (const shell of this.#shells.values()) {
      if (!shell.isDisposed()) {
        count++;
      }
    }
    return count;
  }
}

// ─── Factories ──────────────────────────────────────────────────────────

export function createPersistentShell(options: PersistentShellOptions = {}): PersistentShell {
  return new PersistentShellImpl(options);
}

export function createPersistentShellManager(): PersistentShellManager {
  return new PersistentShellManagerImpl();
}

let defaultManager: PersistentShellManager | null = null;

export function getDefaultShellManager(): PersistentShellManager {
  if (!defaultManager) {
    defaultManager = createPersistentShellManager();
  }
  return defaultManager;
}

export function resetDefaultShellManager(): void {
  if (defaultManager) {
    defaultManager.destroyAll();
    defaultManager = null;
  }
}
