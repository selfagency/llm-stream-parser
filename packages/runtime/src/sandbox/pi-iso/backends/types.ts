import type { IsolationBackendKind } from '../trait.js';

export interface IsolationOptions {
  readonly backendPreference?: readonly IsolationBackendKind[];
  readonly sessionId: string;
  readonly sourceDir: string;
  readonly targetDir?: string;
}

export interface IsolationHandle {
  readonly backend: IsolationBackendKind;
  readonly createdAt: number;
  readonly id: string;
  readonly meta?: Readonly<Record<string, unknown>>;
  readonly sourceDir: string;
  readonly targetDir: string;
}

export interface IsolationDiff {
  readonly added: readonly string[];
  readonly deleted: readonly string[];
  readonly modified: readonly string[];
}

export interface BackendStartContext {
  readonly sessionId: string;
  readonly sourceDir: string;
  readonly targetDir: string;
}
