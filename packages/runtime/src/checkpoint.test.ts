import type { SessionStore } from '@agentsy/shared';
import { describe, expect, it, vi } from 'vitest';
import type { RoutingState } from './checkpoint.js';
import {
  checkpoint,
  clearCheckpoint,
  clearRoutingState,
  loadCheckpoint,
  loadRoutingState,
  saveRoutingState
} from './checkpoint.js';

describe('checkpoint', () => {
  it('saves a checkpoint to the store', () => {
    const store: Pick<SessionStore, 'setValue'> = { setValue: vi.fn() };

    const cp = checkpoint(
      {
        pendingToolCalls: [{ id: 'call_1', name: 'search', args: ['hello'] }],
        messageQueue: [{ role: 'user', content: 'hello' }],
        subagentStates: []
      },
      store
    );

    expect(cp.id).toBeDefined();
    expect(cp.timestamp).toBeGreaterThan(0);
    expect(cp.pendingToolCalls).toHaveLength(1);
    expect(cp.messageQueue).toHaveLength(1);
    expect(store.setValue).toHaveBeenCalledWith('runtime_checkpoint', cp);
  });
});

describe('loadCheckpoint', () => {
  it('returns null when no checkpoint exists', () => {
    const store: Pick<SessionStore, 'getValue'> = { getValue: vi.fn().mockReturnValue(null) };
    expect(loadCheckpoint(store)).toBeNull();
  });

  it('returns the checkpoint when found', () => {
    const cp = {
      id: 'rtchk_1',
      timestamp: Date.now(),
      pendingToolCalls: [],
      messageQueue: [],
      subagentStates: []
    };
    const store: Pick<SessionStore, 'getValue'> = { getValue: vi.fn().mockReturnValue(cp) };

    const result = loadCheckpoint(store);
    expect(result).toEqual(cp);
  });

  it('returns null for invalid structure', () => {
    const store: Pick<SessionStore, 'getValue'> = {
      getValue: vi.fn().mockReturnValue({ id: 123 })
    };
    expect(loadCheckpoint(store)).toBeNull();
  });
});

describe('clearCheckpoint', () => {
  it('deletes the checkpoint key', () => {
    const store: Pick<SessionStore, 'removeValue'> = { removeValue: vi.fn() };
    clearCheckpoint(store);
    expect(store.removeValue).toHaveBeenCalledWith('runtime_checkpoint');
  });
});

describe('saveRoutingState', () => {
  it('saves routing state to the store', () => {
    const store: Pick<SessionStore, 'setValue'> = { setValue: vi.fn() };
    const state: RoutingState = {
      attemptedReplicas: ['rep-a', 'rep-b'],
      currentReplicaId: 'rep-b',
      escalationLevel: 1,
      failoverChain: ['rep-a', 'rep-b']
    };

    saveRoutingState(state, store);

    expect(store.setValue).toHaveBeenCalledWith('routing_state', state);
  });
});

describe('loadRoutingState', () => {
  it('returns null when no routing state exists', () => {
    const store: Pick<SessionStore, 'getValue'> = { getValue: vi.fn().mockReturnValue(null) };
    expect(loadRoutingState(store)).toBeNull();
  });

  it('returns the routing state when found', () => {
    const state: RoutingState = {
      attemptedReplicas: ['rep-a', 'rep-b'],
      currentReplicaId: 'rep-b',
      escalationLevel: 1,
      failoverChain: ['rep-a', 'rep-b']
    };
    const store: Pick<SessionStore, 'getValue'> = { getValue: vi.fn().mockReturnValue(state) };

    const result = loadRoutingState(store);
    expect(result).toEqual(state);
  });

  it('returns null for invalid structure', () => {
    const store: Pick<SessionStore, 'getValue'> = {
      getValue: vi.fn().mockReturnValue({ currentReplicaId: 123 })
    };
    expect(loadRoutingState(store)).toBeNull();
  });

  it('returns null when attemptedReplicas is not an array', () => {
    const store: Pick<SessionStore, 'getValue'> = {
      getValue: vi.fn().mockReturnValue({
        attemptedReplicas: 'not-an-array',
        currentReplicaId: 'rep-a',
        escalationLevel: 0,
        failoverChain: []
      })
    };
    expect(loadRoutingState(store)).toBeNull();
  });

  it('returns null when failoverChain is not an array', () => {
    const store: Pick<SessionStore, 'getValue'> = {
      getValue: vi.fn().mockReturnValue({
        attemptedReplicas: [],
        currentReplicaId: 'rep-a',
        escalationLevel: 0,
        failoverChain: null
      })
    };
    expect(loadRoutingState(store)).toBeNull();
  });
});

describe('clearRoutingState', () => {
  it('deletes the routing state key', () => {
    const store: Pick<SessionStore, 'removeValue'> = { removeValue: vi.fn() };
    clearRoutingState(store);
    expect(store.removeValue).toHaveBeenCalledWith('routing_state');
  });
});
