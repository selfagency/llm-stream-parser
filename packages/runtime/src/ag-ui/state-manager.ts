/**
 * AG-UI State Management
 *
 * Utilities for creating state snapshots and RFC 6902 JSON patch deltas.
 * Enables STATE_SNAPSHOT and STATE_DELTA events for incremental state updates.
 */

import type { JsonPatchOperation, StateDeltaEvent, StateSnapshotEvent } from '@agentsy/shared';
import { EventType } from '@agentsy/shared';

/**
 * Represents a JSON Patch operation per RFC 6902.
 */
export type JsonPatchOp = JsonPatchOperation;

/**
 * Detects circular references in an object.
 * @internal
 */
function hasCircularReference(obj: unknown, visited = new WeakSet<object>()): boolean {
  if (obj === null || typeof obj !== 'object') {
    return false;
  }

  if (visited.has(obj)) {
    return true; // Circular reference detected
  }

  visited.add(obj);

  for (const value of Object.values(obj)) {
    if (hasCircularReference(value, visited)) {
      return true;
    }
  }

  visited.delete(obj);
  return false;
}

/**
 * Validates path parts to prevent prototype pollution.
 * Rejects dangerous keys like __proto__, constructor, prototype.
 * @internal
 */
function validatePathParts(parts: string[]): void {
  const dangerousKeys = new Set(['__proto__', 'constructor', 'prototype']);
  for (const part of parts) {
    if (dangerousKeys.has(part)) {
      throw new Error(`Invalid path segment: "${part}" is not allowed (prototype pollution protection)`);
    }
  }
}

/**
 * Escapes a path segment for RFC 6901 JSON Pointer encoding.
 * Converts ~ to ~0 and / to ~1.
 * @internal
 */
function escapePathSegment(segment: string): string {
  return segment.replaceAll('~', '~0').replaceAll('/', '~1');
}

/**
 * Unescapes an RFC 6901 JSON Pointer segment.
 * Converts ~1 to / and ~0 to ~.
 * @internal
 */
function unescapePathSegment(segment: string): string {
  return segment.replaceAll('~1', '/').replaceAll('~0', '~');
}

/**
 * Creates a state snapshot event.
 *
 * @param state - Application state object
 * @param runId - Run ID
 * @param threadId - Optional thread ID
 * @returns State snapshot event
 * @throws Error if state contains circular references
 */
export function createStateSnapshotEvent(
  state: Record<string, unknown>,
  runId: string,
  threadId?: string
): StateSnapshotEvent {
  if (hasCircularReference(state)) {
    throw new Error('State object contains circular references and cannot be serialized');
  }

  const event: StateSnapshotEvent = {
    runId,
    state: structuredClone(state),
    timestamp: new Date().toISOString(),
    type: EventType.STATE_SNAPSHOT
  };
  if (threadId !== undefined) {
    event.threadId = threadId;
  }
  return event;
}

/**
 * Computes a JSON Patch (RFC 6902) delta between two states.
 * Returns the minimal set of operations to transform `from` to `to`.
 *
 * @param from - Previous state
 * @param to - New state
 * @param basePathPrefix - Optional path prefix for nested operations
 * @returns Array of JSON Patch operations
 * @throws Error if either state contains circular references
 */
function computeStateDeltaForRemovedAndModified(
  from: Record<string, unknown>,
  to: Record<string, unknown>,
  basePathPrefix: string
): JsonPatchOp[] {
  const patches: JsonPatchOp[] = [];
  const dangerousKeys = new Set(['__proto__', 'constructor', 'prototype']);

  for (const key of Object.keys(from)) {
    // Skip dangerous keys to prevent prototype pollution
    if (dangerousKeys.has(key)) {
      continue;
    }

    const escapedKey = escapePathSegment(key);
    const path = basePathPrefix ? `${basePathPrefix}/${escapedKey}` : `/${escapedKey}`;

    if (!(key in to)) {
      patches.push({ op: 'remove', path });
    } else if (JSON.stringify(from[key]) !== JSON.stringify(to[key])) {
      const fromVal = from[key];
      const toVal = to[key];

      // Recurse for nested objects
      if (isPlainObject(fromVal) && isPlainObject(toVal)) {
        patches.push(...computeStateDelta(fromVal, toVal, path));
      } else {
        patches.push({ op: 'replace', path, value: toVal });
      }
    }
  }

  return patches;
}

/**
 * Check if value is a plain object (not array, not null).
 */
function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

/**
 * Computes a JSON Patch (RFC 6902) delta between two states.
 * Returns the minimal set of operations to transform `from` to `to`.
 *
 * @param from - Previous state
 * @param to - New state
 * @param basePathPrefix - Optional path prefix for nested operations
 * @returns Array of JSON Patch operations
 * @throws Error if either state contains circular references
 */
export function computeStateDelta(
  from: Record<string, unknown>,
  to: Record<string, unknown>,
  basePathPrefix = ''
): JsonPatchOp[] {
  if (hasCircularReference(from)) {
    throw new Error('Previous state contains circular references and cannot be processed');
  }
  if (hasCircularReference(to)) {
    throw new Error('New state contains circular references and cannot be processed');
  }

  const patches: JsonPatchOp[] = [];

  // Handle removed and modified properties
  patches.push(...computeStateDeltaForRemovedAndModified(from, to, basePathPrefix));

  // Handle added properties
  const dangerousKeys = new Set(['__proto__', 'constructor', 'prototype']);
  for (const key of Object.keys(to)) {
    if (!(key in from || dangerousKeys.has(key))) {
      const escapedKey = escapePathSegment(key);
      const path = basePathPrefix ? `${basePathPrefix}/${escapedKey}` : `/${escapedKey}`;
      patches.push({ op: 'add', path, value: to[key] });
    }
  }

  return patches;
}

/**
 * Creates a STATE_DELTA event from computed patches.
 *
 * @param patches - JSON Patch operations
 * @param runId - Run ID
 * @param threadId - Optional thread ID
 * @returns State delta event
 */
export function createStateDeltaEvent(patches: JsonPatchOp[], runId: string, threadId?: string): StateDeltaEvent {
  const deltaEvent: StateDeltaEvent = {
    delta: patches,
    runId,
    timestamp: new Date().toISOString(),
    type: EventType.STATE_DELTA
  };
  if (threadId !== undefined) {
    deltaEvent.threadId = threadId;
  }
  return deltaEvent;
}

function resolvePatchTarget(
  state: Record<string, unknown>,
  parts: string[],
  createMissing: boolean,
  rootErrorMessage = 'Cannot operate on root'
): { target: Record<string, unknown>; key: string } {
  if (parts.length === 0) {
    throw new Error(rootErrorMessage);
  }

  const key = parts.at(-1);
  if (key === undefined) {
    throw new Error('Invalid path');
  }

  let target: Record<string, unknown> = state;
  for (const part of parts.slice(0, -1)) {
    if (createMissing && !(part in target)) {
      target[part] = {};
    }
    target = target[part] as Record<string, unknown>;
  }

  return { key, target };
}

function setPatchValue(
  state: Record<string, unknown>,
  parts: string[],
  patch: JsonPatchOp,
  createMissing: boolean,
  rootErrorMessage: string
): void {
  const { target, key } = resolvePatchTarget(state, parts, createMissing, rootErrorMessage);
  target[key] = patch.value;
}

/**
 * Apply an add operation to a state object.
 */
function applyAddPatch(state: Record<string, unknown>, parts: string[], patch: JsonPatchOp): void {
  setPatchValue(state, parts, patch, true, 'Cannot add to root');
}

/**
 * Apply a remove operation to a state object.
 */
function applyRemovePatch(state: Record<string, unknown>, parts: string[]): void {
  const { target, key } = resolvePatchTarget(state, parts, false, 'Cannot remove root');
  delete target[key];
}

/**
 * Apply a replace operation to a state object.
 */
function applyReplacePatch(state: Record<string, unknown>, parts: string[], patch: JsonPatchOp): void {
  setPatchValue(state, parts, patch, false, 'Cannot replace root');
}

/**
 * Applies JSON Patch operations to a state object.
 * Mutates the state in place.
 *
 * @param state - State object to patch
 * @param patches - JSON Patch operations to apply
 * @throws Error if patch operations are invalid or contain dangerous keys
 */
export function applyJsonPatches(state: Record<string, unknown>, patches: JsonPatchOp[]): void {
  for (const patch of patches) {
    const parts = patch.path.split('/').filter(Boolean).map(unescapePathSegment);

    // Validate path to prevent prototype pollution
    validatePathParts(parts);

    switch (patch.op) {
      case 'add': {
        applyAddPatch(state, parts, patch);
        break;
      }

      case 'remove': {
        applyRemovePatch(state, parts);
        break;
      }

      case 'replace': {
        applyReplacePatch(state, parts, patch);
        break;
      }

      default: {
        throw new Error(`Unsupported patch operation: ${patch.op}`);
      }
    }
  }
}

/**
 * State manager for tracking and emitting state changes as AG-UI events.
 */
export class StateManager {
  private currentState: Record<string, unknown>;

  constructor(initialState: Record<string, unknown> = {}) {
    if (hasCircularReference(initialState)) {
      throw new Error('Initial state contains circular references and cannot be processed');
    }
    this.currentState = initialState ? structuredClone(initialState) : {};
  }

  /**
   * Gets the current state.
   */
  getCurrentState(): Record<string, unknown> {
    return structuredClone(this.currentState);
  }

  /**
   * Creates a snapshot event for current state.
   */
  createSnapshotEvent(runId: string, threadId?: string): StateSnapshotEvent {
    return createStateSnapshotEvent(this.currentState, runId, threadId);
  }

  /**
   * Updates state with a new object and returns a delta event.
   */
  updateState(newState: Record<string, unknown>, runId: string, threadId?: string): StateDeltaEvent | undefined {
    const patches = computeStateDelta(this.currentState, newState);
    this.currentState = structuredClone(newState);

    if (patches.length === 0) {
      return;
    }

    return createStateDeltaEvent(patches, runId, threadId);
  }

  /**
   * Applies JSON patches to current state and returns delta event.
   *
   * @param patches - JSON patch operations
   * @param runId - Run ID
   * @param threadId - Optional thread ID
   * @returns State delta event
   */
  applyPatches(patches: JsonPatchOp[], runId: string, threadId?: string): StateDeltaEvent {
    applyJsonPatches(this.currentState, patches);
    return createStateDeltaEvent(patches, runId, threadId);
  }

  /**
   * Resets to initial state.
   * @throws Error if initial state contains circular references
   */
  reset(initialState: Record<string, unknown> = {}): void {
    if (hasCircularReference(initialState)) {
      throw new Error('Initial state contains circular references and cannot be processed');
    }
    this.currentState = structuredClone(initialState);
  }
}
