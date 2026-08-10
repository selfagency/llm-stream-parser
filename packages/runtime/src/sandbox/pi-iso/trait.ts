import type { IsolationDiff, IsolationHandle, IsolationOptions } from './backends/types.js';

// ─── Backend Kinds ──────────────────────────────────────────────────────

export type IsolationBackendKind =
  | 'apfs-clonefile'
  | 'btrfs'
  | 'overlayfs'
  | 'projfs'
  | 'rcopy'
  | 'reflink'
  | 'win-clone'
  | 'zfs';

// ─── Probe Result ───────────────────────────────────────────────────────

export interface IsolationProbeResult {
  readonly available: boolean;
  readonly backend: IsolationBackendKind;
  readonly reason?: string;
  readonly score: number;
}

// ─── Backend Capability ─────────────────────────────────────────────────

export interface IsolationCapability {
  readonly cow: boolean;
  readonly crossPlatform: boolean;
  readonly diff: boolean;
  readonly snapshot: boolean;
}

// ─── PAL Trait Interface ────────────────────────────────────────────────

export interface IsolationBackend {
  readonly capability: IsolationCapability;
  diff(handle: IsolationHandle): Promise<IsolationDiff>;
  readonly displayName: string;
  readonly kind: IsolationBackendKind;
  readonly priority: number;
  probe(): Promise<IsolationProbeResult>;
  start(options: IsolationOptions): Promise<IsolationHandle>;
  stop(handle: IsolationHandle): Promise<void>;
}

// ─── PAL Trait ──────────────────────────────────────────────────────────

/**
 * Pi-ISO isolation PAL trait — Platform Abstraction Layer for cross-platform
 * Copy-On-Write isolation.
 *
 * Provides probe/start/stop/diff lifecycle with automatic fallback chain
 * across 8 backends ordered by efficiency.
 */
export interface PiIsoTrait {
  readonly backends: readonly IsolationBackend[];
  diff(handle: IsolationHandle): Promise<IsolationDiff>;
  getBackend(kind: IsolationBackendKind): IsolationBackend | undefined;
  probe(): Promise<readonly IsolationProbeResult[]>;
  probeBest(): Promise<IsolationProbeResult | null>;
  start(options: IsolationOptions): Promise<IsolationHandle>;
  stop(handle: IsolationHandle): Promise<void>;
}
