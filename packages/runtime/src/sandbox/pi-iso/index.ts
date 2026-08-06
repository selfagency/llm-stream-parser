import { createApfsClonefileBackend } from './backends/apfs-clonefile.js';
import { createBtrfsBackend } from './backends/btrfs.js';
import { createOverlayFsBackend } from './backends/overlayfs.js';
import { createProjFsBackend } from './backends/projfs.js';
import { createRcopyBackend } from './backends/rcopy.js';
import { createReflinkBackend } from './backends/reflink.js';
import type { IsolationDiff, IsolationHandle, IsolationOptions } from './backends/types.js';
import { createWinCloneBackend } from './backends/win-clone.js';
import { createZfsBackend } from './backends/zfs.js';
import type { IsolationBackend, IsolationBackendKind, IsolationProbeResult, PiIsoTrait } from './trait.js';

// ─── Re-exports ─────────────────────────────────────────────────────────

export { createApfsClonefileBackend } from './backends/apfs-clonefile.js';
export { createBtrfsBackend } from './backends/btrfs.js';
export { createOverlayFsBackend } from './backends/overlayfs.js';
export { createProjFsBackend } from './backends/projfs.js';
export { createRcopyBackend } from './backends/rcopy.js';
export { createReflinkBackend } from './backends/reflink.js';
export type { IsolationDiff, IsolationHandle, IsolationOptions } from './backends/types.js';
export { createWinCloneBackend } from './backends/win-clone.js';
export { createZfsBackend } from './backends/zfs.js';
export type {
  IsolationBackend,
  IsolationBackendKind,
  IsolationCapability,
  IsolationProbeResult,
  PiIsoTrait
} from './trait.js';

// ─── Backend Registry ───────────────────────────────────────────────────

function createAllBackends(): IsolationBackend[] {
  const backends: IsolationBackend[] = [
    createApfsClonefileBackend(),
    createBtrfsBackend(),
    createZfsBackend(),
    createOverlayFsBackend(),
    createWinCloneBackend(),
    createProjFsBackend(),
    createReflinkBackend(),
    createRcopyBackend()
  ];
  return backends.sort((a, b) => b.priority - a.priority);
}

// ─── PiIso Implementation ───────────────────────────────────────────────

class PiIsoImpl implements PiIsoTrait {
  readonly backends: readonly IsolationBackend[];
  private readonly backendMap: Map<IsolationBackendKind, IsolationBackend>;

  constructor(backends?: IsolationBackend[]) {
    const resolved = backends ?? createAllBackends();
    this.backends = resolved;
    this.backendMap = new Map(resolved.map(b => [b.kind, b]));
  }

  getBackend(kind: IsolationBackendKind): IsolationBackend | undefined {
    return this.backendMap.get(kind);
  }

  async probe(): Promise<readonly IsolationProbeResult[]> {
    const results: IsolationProbeResult[] = [];
    for (const backend of this.backends) {
      try {
        const res = await backend.probe();
        results.push(res);
      } catch (error) {
        results.push({
          available: false,
          backend: backend.kind,
          reason: error instanceof Error ? error.message : 'Probe failed',
          score: 0
        });
      }
    }
    return results.sort((a, b) => {
      if (a.available !== b.available) {
        return a.available ? -1 : 1;
      }
      return b.score - a.score;
    });
  }

  async probeBest(): Promise<IsolationProbeResult | null> {
    const results = await this.probe();
    const available = results.filter(r => r.available);
    if (available.length === 0) {
      return null;
    }
    return available[0] ?? null;
  }

  async start(options: IsolationOptions): Promise<IsolationHandle> {
    if (!options.sourceDir) {
      throw new Error('PiIso.start: sourceDir is required');
    }
    if (!options.sessionId) {
      throw new Error('PiIso.start: sessionId is required');
    }

    const candidates = this.buildCandidateChain(options.backendPreference);

    let lastError: Error | null = null;

    for (const backend of candidates) {
      try {
        const probeResult = await backend.probe();
        if (!probeResult.available && backend.kind !== 'rcopy') {
          lastError = new Error(`${backend.kind} not available: ${probeResult.reason}`);
          continue;
        }
        const handle = await backend.start(options);
        return handle;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw new Error(`PiIso.start: all backends failed. Last error: ${lastError?.message ?? 'unknown'}`);
  }

  async stop(handle: IsolationHandle): Promise<void> {
    const backend = this.backendMap.get(handle.backend);
    if (!backend) {
      const { cleanupDir } = await import('./backends/shared.js');
      cleanupDir(handle.targetDir);
      return;
    }
    await backend.stop(handle);
  }

  async diff(handle: IsolationHandle): Promise<IsolationDiff> {
    const backend = this.backendMap.get(handle.backend);
    if (!backend) {
      const { computeDiff } = await import('./backends/shared.js');
      return computeDiff(handle.sourceDir, handle.targetDir);
    }
    return backend.diff(handle);
  }

  private buildCandidateChain(preference?: readonly IsolationBackendKind[]): IsolationBackend[] {
    if (preference && preference.length > 0) {
      const ordered: IsolationBackend[] = [];
      for (const kind of preference) {
        const b = this.backendMap.get(kind);
        if (b) {
          ordered.push(b);
        }
      }
      for (const b of this.backends) {
        if (!preference.includes(b.kind)) {
          ordered.push(b);
        }
      }
      const rcopy = this.backendMap.get('rcopy');
      if (rcopy && !preference?.includes('rcopy') && ordered.at(-1)?.kind !== 'rcopy') {
        const withoutRcopy = ordered.filter(b => b.kind !== 'rcopy');
        withoutRcopy.push(rcopy);
        return withoutRcopy;
      }
      return ordered;
    }
    return [...this.backends];
  }
}

// ─── Factories ──────────────────────────────────────────────────────────

export function createPiIso(backends?: IsolationBackend[]): PiIsoTrait {
  return new PiIsoImpl(backends);
}

export function createPiIsoWithBackends(kinds: readonly IsolationBackendKind[]): PiIsoTrait {
  const all = createAllBackends();
  const map = new Map(all.map(b => [b.kind, b]));
  const selected: IsolationBackend[] = [];
  for (const k of kinds) {
    const b = map.get(k);
    if (b) {
      selected.push(b);
    }
  }
  if (!kinds.includes('rcopy')) {
    const rcopy = map.get('rcopy');
    if (rcopy) {
      selected.push(rcopy);
    }
  }
  return new PiIsoImpl(selected);
}
