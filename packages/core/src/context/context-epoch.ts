/**
 * ContextEpoch revision tracking.
 *
 * Each context has an epoch that increments on model switch or scope change.
 * If the model changes mid-turn, the current turn is aborted and rebuilt with
 * the new model — preventing stale context references from leaking across
 * model boundaries.
 */

export interface ContextEpoch {
  /** Monotonically increasing revision number. */
  readonly epoch: number;
  /** Model identifier active for this epoch. */
  readonly model: string;
  /** Unique revision id for tracing / diagnostics. */
  readonly revisionId: string;
  /** Scope identifiers active for this epoch. */
  readonly scope: readonly string[];
  /** When this epoch was created (ms since epoch). */
  readonly timestamp: number;
}

export type EpochBumpReason = 'model' | 'scope' | 'model+scope' | 'manual' | null;

export interface EpochBumpInput {
  /** New model — if different from current, triggers bump. */
  model?: string;
  /** Override reason label (for manual bumps / diagnostics). */
  reason?: string;
  /** New scope — if different from current, triggers bump. */
  scope?: string[];
}

export interface EpochBumpResult {
  /** Whether the epoch actually incremented. */
  readonly changed: boolean;
  /** Epoch after the bump (same as previous when no change). */
  readonly current: ContextEpoch;
  /** Epoch before the bump. */
  readonly previous: ContextEpoch;
  /** Why the bump happened, if any. */
  readonly reason: EpochBumpReason;
  /** Human-readable label when caller supplies custom reason. */
  readonly reasonLabel?: string;
}

export type AbortReason = 'model-switch' | 'scope-change' | null;

export interface AbortDecision {
  /** New epoch after abort (present only when aborting). */
  readonly currentEpoch?: ContextEpoch;
  /** Epoch at the moment the decision was evaluated. */
  readonly previousEpoch: ContextEpoch;
  /** Why abort was decided. */
  readonly reason: AbortReason;
  /** Should the current turn be aborted? */
  readonly shouldAbort: boolean;
}

export interface AbortAndRebuildResult {
  /** The epoch that was aborted (stale, must not be reused). */
  readonly aborted: ContextEpoch;
  /** Whether stale references would have occurred without this abort. */
  readonly hadStaleReferences: boolean;
  /** Reason for the abort. */
  readonly reason: string;
  /** Fresh epoch to use for the rebuilt turn. */
  readonly rebuilt: ContextEpoch;
}

export interface EpochDiagnostics {
  readonly bumpCount: number;
  readonly epoch: number;
  readonly model: string;
  readonly revisionId: string;
  readonly scope: readonly string[];
  readonly timestamp: number;
}

export interface EpochStreamMetadata {
  readonly contextEpoch: number;
  readonly contextModel: string;
  readonly contextRevisionId: string;
  readonly contextTimestamp: number;
}

export interface ContextEpochTrackerOptions {
  /** Initial model identifier. */
  initialModel: string;
  /** Initial scope identifiers. */
  initialScope?: string[];
  /** Optional clock for deterministic testing. */
  now?: () => number;
  /** Optional revision-id generator for deterministic testing. */
  revisionIdFactory?: () => string;
}

export interface ContextEpochTracker {
  /**
   * Abort the current turn and rebuild context with the new model.
   * Always increments epoch — call only after shouldAbort* returned true,
   * or when you want unconditional rebuild semantics.
   */
  abortAndRebuild(newModel: string, options?: { scope?: string[]; reason?: string }): AbortAndRebuildResult;
  /** Abort and rebuild due to scope change (model stays the same). */
  abortAndRebuildForScope(newScope: string[], reason?: string): AbortAndRebuildResult;
  /** Turn has started — locks the current epoch for mid-turn switch detection. */
  beginTurn(): ContextEpoch;
  /** Bump epoch if model and/or scope changed. */
  bump(input: EpochBumpInput): EpochBumpResult;
  /** Turn has ended — clears the in-turn lock. */
  endTurn(): void;
  /** Force a manual epoch increment regardless of model/scope. */
  forceBump(reasonLabel?: string): EpochBumpResult;
  /** Number of bumps performed since creation. */
  getBumpCount(): number;
  /** Current epoch snapshot (immutable copy). */
  getCurrent(): ContextEpoch;
  /** Whether we are currently mid-turn. */
  isMidTurn(): boolean;
  /** Return true if the given epoch number is stale relative to current. */
  isStale(epoch: number): boolean;
  /** Return true if the given revisionId is stale. */
  isStaleRevision(revisionId: string): boolean;
  /** Combined mid-turn change detection (model and/or scope). */
  shouldAbortOnChange(input: { model?: string; scope?: string[] }): AbortDecision;
  /** Decide whether a mid-turn model change requires abort. */
  shouldAbortOnModelChange(newModel: string): AbortDecision;
  /** Decide whether a mid-turn scope change requires abort. */
  shouldAbortOnScopeChange(newScope: string[]): AbortDecision;
  /** Diagnostics snapshot suitable for logging / OTel. */
  toDiagnostics(): EpochDiagnostics;
  /** Metadata to include in stream chunks / SSE events. */
  toStreamMetadata(): EpochStreamMetadata;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

let globalRevisionCounter = 0;

function defaultRevisionIdFactory(): string {
  globalRevisionCounter += 1;
  return `rev_${globalRevisionCounter}_${Date.now().toString(36)}`;
}

function scopesEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const aSorted = [...a].sort((x, y) => x.localeCompare(y));
  const bSorted = [...b].sort((x, y) => x.localeCompare(y));
  for (let i = 0; i < aSorted.length; i++) {
    if (aSorted[i] !== bSorted[i]) {
      return false;
    }
  }
  return true;
}

function createEpochSnapshot(
  epoch: number,
  model: string,
  scope: readonly string[],
  revisionId: string,
  timestamp: number
): ContextEpoch {
  return Object.freeze({
    epoch,
    model,
    revisionId,
    scope: Object.freeze([...scope]) as readonly string[],
    timestamp
  });
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createContextEpochTracker(options: ContextEpochTrackerOptions): ContextEpochTracker {
  const { initialModel, initialScope = [] } = options;
  if (!initialModel || typeof initialModel !== 'string') {
    throw new Error('createContextEpochTracker: initialModel must be a non-empty string');
  }

  const now = options.now ?? (() => Date.now());
  const revisionFactory = options.revisionIdFactory ?? defaultRevisionIdFactory;

  let epochCounter = 1;
  let currentModel = initialModel;
  let currentScope: readonly string[] = Object.freeze([...initialScope]) as readonly string[];
  let currentRevisionId = revisionFactory();
  let currentTimestamp = now();
  let currentEpoch: ContextEpoch = createEpochSnapshot(
    epochCounter,
    currentModel,
    currentScope,
    currentRevisionId,
    currentTimestamp
  );

  let bumpCount = 0;
  let inTurn = false;
  let turnEpoch: ContextEpoch | null = null;

  function snapshot(): ContextEpoch {
    return currentEpoch;
  }

  function bumpInternal(input: EpochBumpInput): EpochBumpResult {
    const previous = snapshot();
    const nextModel = input.model ?? currentModel;
    const hasScopeOverride = input.scope !== undefined;
    const nextScope = hasScopeOverride
      ? (Object.freeze([...(input.scope as string[])]) as readonly string[])
      : currentScope;

    const modelChanged = nextModel !== currentModel;
    const scopeChanged = !scopesEqual(nextScope, currentScope);
    const hasCustomReason = input.reason !== undefined;
    const hasEffectiveChange = modelChanged || scopeChanged || hasCustomReason;

    if (!hasEffectiveChange) {
      return {
        changed: false,
        current: previous,
        previous,
        reason: null
      };
    }

    let reason: EpochBumpReason;
    if (hasCustomReason) {
      reason = 'manual';
    } else if (modelChanged && scopeChanged) {
      reason = 'model+scope';
    } else if (modelChanged) {
      reason = 'model';
    } else {
      reason = 'scope';
    }

    epochCounter += 1;
    currentModel = nextModel;
    currentScope = nextScope;
    currentRevisionId = revisionFactory();
    currentTimestamp = now();
    currentEpoch = createEpochSnapshot(epochCounter, currentModel, currentScope, currentRevisionId, currentTimestamp);
    bumpCount += 1;

    const result: EpochBumpResult = {
      changed: true,
      current: snapshot(),
      previous,
      reason
    };

    if (hasCustomReason) {
      return {
        ...result,
        ...(input.reason === undefined ? {} : { reasonLabel: input.reason })
      };
    }

    return result;
  }

  function isPriorBumpDuringTurn(alreadyBumped: boolean, current: ContextEpoch): boolean {
    if (!alreadyBumped) {
      return false;
    }
    if (!inTurn) {
      return false;
    }
    if (turnEpoch === null) {
      return false;
    }
    return turnEpoch.epoch < current.epoch;
  }

  /**
   * If the current epoch was already bumped earlier in this turn, return the
   * prior-bump result (aborting the turn snapshot). Otherwise return null.
   */
  function priorBumpDuringTurn(
    alreadyBumped: boolean,
    current: ContextEpoch,
    reason: string
  ): AbortAndRebuildResult | null {
    if (!isPriorBumpDuringTurn(alreadyBumped, current)) {
      return null;
    }
    const abortedSnapshot = turnEpoch as ContextEpoch;
    const rebuilt = current;
    if (inTurn) {
      turnEpoch = rebuilt;
    }
    return {
      aborted: abortedSnapshot,
      hadStaleReferences: true,
      reason,
      rebuilt
    };
  }

  /**
   * Reuse the current snapshot when it was already bumped this turn and the
   * turn epoch mismatches; otherwise run the provided rebuild.
   */
  function resolveRebuild(
    alreadyBumped: boolean,
    abortedSnapshot: ContextEpoch,
    rebuild: () => ContextEpoch
  ): ContextEpoch {
    const turnMismatch = abortedSnapshot.epoch !== turnEpoch?.epoch;
    return alreadyBumped && turnMismatch ? abortedSnapshot : rebuild();
  }

  function bumpToModel(newModel: string, scope: string[] | undefined, reason: string | undefined): ContextEpoch {
    const bumped = bumpInternal({
      model: newModel,
      ...(scope === undefined ? {} : { scope }),
      ...(reason === undefined ? {} : { reason })
    });
    if (bumped.changed) {
      return bumped.current;
    }
    return bumpInternal({ reason: reason ?? `abort-rebuild:${newModel}` }).current;
  }

  function bumpToScope(newScope: string[], reason: string | undefined): ContextEpoch {
    const bumped = bumpInternal({
      scope: newScope,
      ...(reason === undefined ? {} : { reason })
    });
    if (bumped.changed) {
      return bumped.current;
    }
    return bumpInternal({
      reason: reason ?? `abort-rebuild-scope:${newScope.join(',')}`
    }).current;
  }

  const tracker: ContextEpochTracker = {
    abortAndRebuild(newModel, options) {
      const current = snapshot();
      const scopeMatches = options?.scope === undefined || scopesEqual(options.scope, current.scope);
      const alreadyBumped = current.model === newModel && scopeMatches;

      const prior = priorBumpDuringTurn(
        alreadyBumped,
        current,
        options?.reason ?? `model-switch:${current.model}->${newModel}`
      );
      if (prior) {
        return prior;
      }

      const abortedSnapshot = current;
      const scopeChanged = options?.scope !== undefined && !scopesEqual(options.scope, current.scope);
      const hadStaleReferences = newModel !== current.model || scopeChanged;
      const rebuilt = resolveRebuild(alreadyBumped, abortedSnapshot, () =>
        bumpToModel(newModel, options?.scope, options?.reason)
      );

      if (inTurn) {
        turnEpoch = rebuilt;
      }

      return {
        aborted: abortedSnapshot,
        hadStaleReferences,
        reason: options?.reason ?? `model-switch:${abortedSnapshot.model}->${newModel}`,
        rebuilt
      };
    },

    abortAndRebuildForScope(newScope, reason) {
      const current = snapshot();
      const alreadyBumped = scopesEqual(newScope, current.scope);

      const prior = priorBumpDuringTurn(
        alreadyBumped,
        current,
        reason ?? `scope-change:${current.scope.join(',')}->${newScope.join(',')}`
      );
      if (prior) {
        return prior;
      }

      const abortedSnapshot = current;
      const hadStaleReferences = !scopesEqual(newScope, current.scope);
      const rebuilt = resolveRebuild(alreadyBumped, abortedSnapshot, () => bumpToScope(newScope, reason));

      if (inTurn) {
        turnEpoch = rebuilt;
      }

      return {
        aborted: abortedSnapshot,
        hadStaleReferences,
        reason: reason ?? `scope-change:${abortedSnapshot.scope.join(',')}->${newScope.join(',')}`,
        rebuilt
      };
    },

    beginTurn(): ContextEpoch {
      inTurn = true;
      turnEpoch = snapshot();
      return snapshot();
    },

    bump(input: EpochBumpInput): EpochBumpResult {
      return bumpInternal(input);
    },

    endTurn(): void {
      inTurn = false;
      turnEpoch = null;
    },

    forceBump(reasonLabel?: string): EpochBumpResult {
      return bumpInternal({ reason: reasonLabel ?? 'forced' });
    },

    getBumpCount(): number {
      return bumpCount;
    },

    getCurrent(): ContextEpoch {
      return snapshot();
    },

    isMidTurn(): boolean {
      return inTurn;
    },

    isStale(epoch: number): boolean {
      return epoch < snapshot().epoch;
    },

    isStaleRevision(revisionId: string): boolean {
      const cur = snapshot();
      if (revisionId === cur.revisionId) {
        return false;
      }
      return true;
    },

    shouldAbortOnChange(input) {
      const previousEpoch = snapshot();
      const nextModel = input.model ?? previousEpoch.model;
      const nextScope = input.scope ?? [...previousEpoch.scope];

      const modelChanged = nextModel !== previousEpoch.model;
      const scopeChanged = !scopesEqual(nextScope, previousEpoch.scope);
      const hasChange = modelChanged || scopeChanged;

      if (!hasChange) {
        return { previousEpoch, reason: null, shouldAbort: false };
      }

      if (inTurn) {
        const reason: AbortReason = modelChanged ? 'model-switch' : 'scope-change';
        const bumped = bumpInternal({
          ...(input.model === undefined ? {} : { model: input.model }),
          ...(input.scope === undefined ? {} : { scope: input.scope })
        });

        return {
          currentEpoch: bumped.current,
          previousEpoch: bumped.previous,
          reason,
          shouldAbort: true
        };
      }

      return { previousEpoch, reason: null, shouldAbort: false };
    },

    shouldAbortOnModelChange(newModel) {
      const previousEpoch = snapshot();
      const sameModel = newModel === previousEpoch.model;

      if (sameModel) {
        return { previousEpoch, reason: null, shouldAbort: false };
      }

      if (inTurn) {
        const bumped = bumpInternal({ model: newModel });
        return {
          currentEpoch: bumped.current,
          previousEpoch: bumped.previous,
          reason: 'model-switch',
          shouldAbort: true
        };
      }

      return { previousEpoch, reason: null, shouldAbort: false };
    },

    shouldAbortOnScopeChange(newScope) {
      const previousEpoch = snapshot();
      const sameScope = scopesEqual(newScope, previousEpoch.scope);

      if (sameScope) {
        return { previousEpoch, reason: null, shouldAbort: false };
      }

      if (inTurn) {
        const bumped = bumpInternal({ scope: newScope });
        return {
          currentEpoch: bumped.current,
          previousEpoch: bumped.previous,
          reason: 'scope-change',
          shouldAbort: true
        };
      }

      return { previousEpoch, reason: null, shouldAbort: false };
    },

    toDiagnostics(): EpochDiagnostics {
      const cur = snapshot();
      return {
        bumpCount,
        epoch: cur.epoch,
        model: cur.model,
        revisionId: cur.revisionId,
        scope: cur.scope,
        timestamp: cur.timestamp
      };
    },

    toStreamMetadata(): EpochStreamMetadata {
      const cur = snapshot();
      return {
        contextEpoch: cur.epoch,
        contextModel: cur.model,
        contextRevisionId: cur.revisionId,
        contextTimestamp: cur.timestamp
      };
    }
  };

  return tracker;
}

/**
 * Utility: detect whether a change would be considered stale if used with a given epoch.
 */
export function isStaleContextReference(referenceEpoch: ContextEpoch, currentEpoch: ContextEpoch): boolean {
  if (referenceEpoch.epoch < currentEpoch.epoch) {
    return true;
  }
  return referenceEpoch.revisionId !== currentEpoch.revisionId;
}

/**
 * Factory for a lightweight, detached epoch snapshot — useful for tests and
 * for creating an initial epoch without a tracker.
 */
export function createContextEpoch(
  model: string,
  scope: string[] = [],
  overrides?: { epoch?: number; revisionId?: string; timestamp?: number }
): ContextEpoch {
  if (!model) {
    throw new Error('createContextEpoch: model must be non-empty');
  }
  return createEpochSnapshot(
    overrides?.epoch ?? 1,
    model,
    scope,
    overrides?.revisionId ?? defaultRevisionIdFactory(),
    overrides?.timestamp ?? Date.now()
  );
}
