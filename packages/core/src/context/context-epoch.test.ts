import type { CompletionMessage } from '@agentsy/shared';
import { describe, expect, it } from 'vitest';
import { createContextEpoch, createContextEpochTracker, isStaleContextReference } from './context-epoch.js';
import {
  assertNotStaleEpoch,
  handleMidTurnModelSwitch,
  transformContext,
  transformContextWithEpoch
} from './transform-context.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deterministicFactory() {
  let counter = 0;
  const nowValues = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10_000];
  let nowIdx = 0;
  return {
    revisionId: () => {
      counter += 1;
      return `rev-${counter}`;
    },
    now: () => {
      const val = nowValues[nowIdx] ?? 10_000 + nowIdx * 1000;
      nowIdx += 1;
      return val;
    }
  };
}

function mkMsg(role: CompletionMessage['role'], content: string): CompletionMessage {
  return { role, content } as CompletionMessage;
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe('ContextEpoch', () => {
  describe('createContextEpoch', () => {
    it('creates epoch with expected shape', () => {
      const epoch = createContextEpoch('model-a', ['user', 'system'], {
        epoch: 1,
        revisionId: 'rev-1',
        timestamp: 1234
      });

      expect(epoch.epoch).toBe(1);
      expect(epoch.model).toBe('model-a');
      expect(epoch.scope).toEqual(['user', 'system']);
      expect(epoch.revisionId).toBe('rev-1');
      expect(epoch.timestamp).toBe(1234);
    });

    it('throws on empty model', () => {
      expect(() => createContextEpoch('')).toThrow();
    });
  });

  describe('createContextEpochTracker - bump logic', () => {
    it('starts at epoch 1', () => {
      const f = deterministicFactory();
      const tracker = createContextEpochTracker({
        initialModel: 'gpt-4',
        initialScope: ['user'],
        now: f.now,
        revisionIdFactory: f.revisionId
      });

      const cur = tracker.getCurrent();
      expect(cur.epoch).toBe(1);
      expect(cur.model).toBe('gpt-4');
      expect(cur.scope).toEqual(['user']);
      expect(cur.revisionId).toBe('rev-1');
    });

    it('increments epoch on model switch', () => {
      const f = deterministicFactory();
      const tracker = createContextEpochTracker({
        initialModel: 'model-a',
        now: f.now,
        revisionIdFactory: f.revisionId
      });

      const result = tracker.bump({ model: 'model-b' });
      expect(result.changed).toBe(true);
      expect(result.reason).toBe('model');
      expect(result.previous.epoch).toBe(1);
      expect(result.current.epoch).toBe(2);
      expect(result.current.model).toBe('model-b');
      expect(tracker.getCurrent().epoch).toBe(2);
      expect(tracker.getBumpCount()).toBe(1);
    });

    it('increments epoch on scope change', () => {
      const f = deterministicFactory();
      const tracker = createContextEpochTracker({
        initialModel: 'model-a',
        initialScope: ['user'],
        now: f.now,
        revisionIdFactory: f.revisionId
      });

      const result = tracker.bump({ scope: ['user', 'system'] });
      expect(result.changed).toBe(true);
      expect(result.reason).toBe('scope');
      expect(result.current.epoch).toBe(2);
      expect(result.current.scope).toEqual(['user', 'system']);
    });

    it('increments epoch on model+scope change', () => {
      const f = deterministicFactory();
      const tracker = createContextEpochTracker({
        initialModel: 'model-a',
        initialScope: ['user'],
        now: f.now,
        revisionIdFactory: f.revisionId
      });

      const result = tracker.bump({ model: 'model-b', scope: ['assistant'] });
      expect(result.changed).toBe(true);
      expect(result.reason).toBe('model+scope');
      expect(result.current.epoch).toBe(2);
      expect(result.current.model).toBe('model-b');
      expect(result.current.scope).toEqual(['assistant']);
    });

    it('does not bump when nothing changes', () => {
      const f = deterministicFactory();
      const tracker = createContextEpochTracker({
        initialModel: 'model-a',
        initialScope: ['user'],
        now: f.now,
        revisionIdFactory: f.revisionId
      });

      const result = tracker.bump({ model: 'model-a', scope: ['user'] });
      expect(result.changed).toBe(false);
      expect(result.current.epoch).toBe(1);
      expect(tracker.getBumpCount()).toBe(0);
    });

    it('forceBump always increments', () => {
      const f = deterministicFactory();
      const tracker = createContextEpochTracker({
        initialModel: 'model-a',
        now: f.now,
        revisionIdFactory: f.revisionId
      });

      const result = tracker.forceBump('manual-trigger');
      expect(result.changed).toBe(true);
      expect(result.reason).toBe('manual');
      expect(result.reasonLabel).toBe('manual-trigger');
      expect(result.current.epoch).toBe(2);
    });

    it('scope equality is order independent', () => {
      const f = deterministicFactory();
      const tracker = createContextEpochTracker({
        initialModel: 'm',
        initialScope: ['a', 'b'],
        now: f.now,
        revisionIdFactory: f.revisionId
      });

      const result = tracker.bump({ scope: ['b', 'a'] });
      expect(result.changed).toBe(false);
    });
  });

  describe('stale detection', () => {
    it('detects stale epoch by number', () => {
      const f = deterministicFactory();
      const tracker = createContextEpochTracker({
        initialModel: 'a',
        now: f.now,
        revisionIdFactory: f.revisionId
      });

      tracker.bump({ model: 'b' });
      expect(tracker.isStale(1)).toBe(true);
      expect(tracker.isStale(2)).toBe(false);
      expect(tracker.isStale(3)).toBe(false);
    });

    it('isStaleContextReference detects stale by epoch and revision', () => {
      const e1 = createContextEpoch('model-a', [], { epoch: 1, revisionId: 'r1', timestamp: 1000 });
      const e2 = createContextEpoch('model-b', [], { epoch: 2, revisionId: 'r2', timestamp: 2000 });

      expect(isStaleContextReference(e1, e2)).toBe(true);
      expect(isStaleContextReference(e2, e2)).toBe(false);
    });

    it('transformContext throws on stale epoch when tracker present', () => {
      const f = deterministicFactory();
      const tracker = createContextEpochTracker({
        initialModel: 'model-a',
        now: f.now,
        revisionIdFactory: f.revisionId
      });

      const oldEpoch = tracker.getCurrent();
      tracker.bump({ model: 'model-b' });

      expect(() =>
        transformContext({
          messages: [mkMsg('user', 'hi')],
          scope: [],
          maxTokens: 1000,
          epoch: oldEpoch,
          epochTracker: tracker
        })
      ).toThrow(/stale context epoch/);
    });
  });

  describe('abort detection', () => {
    it('does not abort when not mid-turn', () => {
      const f = deterministicFactory();
      const tracker = createContextEpochTracker({
        initialModel: 'model-a',
        now: f.now,
        revisionIdFactory: f.revisionId
      });

      const decision = tracker.shouldAbortOnModelChange('model-b');
      expect(decision.shouldAbort).toBe(false);
      expect(tracker.getCurrent().epoch).toBe(1);
    });

    it('aborts on mid-turn model switch', () => {
      const f = deterministicFactory();
      const tracker = createContextEpochTracker({
        initialModel: 'model-a',
        now: f.now,
        revisionIdFactory: f.revisionId
      });

      tracker.beginTurn();
      expect(tracker.isMidTurn()).toBe(true);

      const decision = tracker.shouldAbortOnModelChange('model-b');
      expect(decision.shouldAbort).toBe(true);
      expect(decision.reason).toBe('model-switch');
      expect(decision.previousEpoch.epoch).toBe(1);
      expect(decision.currentEpoch?.epoch).toBe(2);
      expect(decision.currentEpoch?.model).toBe('model-b');
      expect(tracker.getCurrent().epoch).toBe(2);
    });

    it('does not abort when model unchanged mid-turn', () => {
      const f = deterministicFactory();
      const tracker = createContextEpochTracker({
        initialModel: 'model-a',
        now: f.now,
        revisionIdFactory: f.revisionId
      });

      tracker.beginTurn();
      const decision = tracker.shouldAbortOnModelChange('model-a');
      expect(decision.shouldAbort).toBe(false);
      expect(tracker.getCurrent().epoch).toBe(1);
    });

    it('aborts on mid-turn scope change', () => {
      const f = deterministicFactory();
      const tracker = createContextEpochTracker({
        initialModel: 'model-a',
        initialScope: ['user'],
        now: f.now,
        revisionIdFactory: f.revisionId
      });

      tracker.beginTurn();
      const decision = tracker.shouldAbortOnScopeChange(['user', 'system']);
      expect(decision.shouldAbort).toBe(true);
      expect(decision.reason).toBe('scope-change');
      expect(decision.currentEpoch?.epoch).toBe(2);
    });

    it('shouldAbortOnChange combines model and scope', () => {
      const f = deterministicFactory();
      const tracker = createContextEpochTracker({
        initialModel: 'a',
        initialScope: ['user'],
        now: f.now,
        revisionIdFactory: f.revisionId
      });

      tracker.beginTurn();
      const decision = tracker.shouldAbortOnChange({ model: 'b', scope: ['user', 'system'] });
      expect(decision.shouldAbort).toBe(true);
      expect(decision.currentEpoch?.model).toBe('b');
      expect(decision.currentEpoch?.scope).toEqual(['user', 'system']);
    });
  });

  describe('abort and rebuild', () => {
    it('abortAndRebuild creates new epoch with new model', () => {
      const f = deterministicFactory();
      const tracker = createContextEpochTracker({
        initialModel: 'model-a',
        initialScope: ['user'],
        now: f.now,
        revisionIdFactory: f.revisionId
      });

      const oldEpoch = tracker.getCurrent();
      const result = tracker.abortAndRebuild('model-b', { scope: ['user', 'system'] });

      expect(result.aborted.epoch).toBe(oldEpoch.epoch);
      expect(result.rebuilt.epoch).toBe(2);
      expect(result.rebuilt.model).toBe('model-b');
      expect(result.rebuilt.scope).toEqual(['user', 'system']);
      expect(result.hadStaleReferences).toBe(true);
      expect(result.reason).toContain('model-b');
    });

    it('abortAndRebuildForScope rebuilds on scope change', () => {
      const f = deterministicFactory();
      const tracker = createContextEpochTracker({
        initialModel: 'model-a',
        initialScope: ['user'],
        now: f.now,
        revisionIdFactory: f.revisionId
      });

      const result = tracker.abortAndRebuildForScope(['user', 'assistant']);
      expect(result.rebuilt.epoch).toBe(2);
      expect(result.rebuilt.scope).toEqual(['user', 'assistant']);
      expect(result.hadStaleReferences).toBe(true);
    });

    it('no stale references after epoch bump', () => {
      const f = deterministicFactory();
      const tracker = createContextEpochTracker({
        initialModel: 'a',
        now: f.now,
        revisionIdFactory: f.revisionId
      });

      const epoch1 = tracker.getCurrent();
      tracker.bump({ model: 'b' });
      const epoch2 = tracker.getCurrent();

      expect(isStaleContextReference(epoch1, epoch2)).toBe(true);
      expect(isStaleContextReference(epoch2, epoch2)).toBe(false);
      expect(tracker.isStale(epoch1.epoch)).toBe(true);
      expect(tracker.isStale(epoch2.epoch)).toBe(false);
    });

    it('toDiagnostics and toStreamMetadata expose epoch visibly', () => {
      const f = deterministicFactory();
      const tracker = createContextEpochTracker({
        initialModel: 'model-a',
        initialScope: ['user', 'system'],
        now: f.now,
        revisionIdFactory: f.revisionId
      });

      const diagnostics = tracker.toDiagnostics();
      expect(diagnostics.epoch).toBe(1);
      expect(diagnostics.model).toBe('model-a');
      expect(diagnostics.scope).toEqual(['user', 'system']);
      expect(diagnostics.revisionId).toBe('rev-1');
      expect(typeof diagnostics.bumpCount).toBe('number');

      const meta = tracker.toStreamMetadata();
      expect(meta.contextEpoch).toBe(1);
      expect(meta.contextModel).toBe('model-a');
      expect(meta.contextRevisionId).toBe('rev-1');
      expect(typeof meta.contextTimestamp).toBe('number');

      tracker.bump({ model: 'model-b' });
      const diagnostics2 = tracker.toDiagnostics();
      expect(diagnostics2.epoch).toBe(2);
      expect(diagnostics2.model).toBe('model-b');
      expect(diagnostics2.bumpCount).toBe(1);

      const meta2 = tracker.toStreamMetadata();
      expect(meta2.contextEpoch).toBe(2);
      expect(meta2.contextModel).toBe('model-b');
    });
  });

  describe('turn lifecycle', () => {
    it('beginTurn and endTurn manage mid-turn state', () => {
      const f = deterministicFactory();
      const tracker = createContextEpochTracker({
        initialModel: 'a',
        now: f.now,
        revisionIdFactory: f.revisionId
      });

      expect(tracker.isMidTurn()).toBe(false);
      const turnEpoch = tracker.beginTurn();
      expect(tracker.isMidTurn()).toBe(true);
      expect(turnEpoch.epoch).toBe(1);

      tracker.endTurn();
      expect(tracker.isMidTurn()).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Integration / transform-context integration tests
// ---------------------------------------------------------------------------

describe('transform-context with ContextEpoch', () => {
  it('transformContextWithEpoch returns diagnostics and stream metadata', () => {
    const f = deterministicFactory();
    const tracker = createContextEpochTracker({
      initialModel: 'model-a',
      initialScope: ['user'],
      now: f.now,
      revisionIdFactory: f.revisionId
    });

    const messages: CompletionMessage[] = [
      mkMsg('system', 'system prompt'),
      mkMsg('user', 'hello'),
      mkMsg('assistant', 'hi')
    ];

    const result = transformContextWithEpoch({
      messages,
      scope: ['user'],
      maxTokens: 10_000,
      epoch: tracker.getCurrent(),
      epochTracker: tracker
    });

    // Scope ['user'] keeps system + user (assistant filtered by scope)
    expect(result.messages).toHaveLength(2);
    expect(result.epoch?.epoch).toBe(1);
    expect(result.diagnostics?.epoch).toBe(1);
    expect(result.streamMetadata?.contextEpoch).toBe(1);
    expect(result.hadStaleReference).toBe(false);
  });

  it('transformContextWithEpoch detects stale reference without throwing', () => {
    const f = deterministicFactory();
    const tracker = createContextEpochTracker({
      initialModel: 'model-a',
      now: f.now,
      revisionIdFactory: f.revisionId
    });

    const oldEpoch = tracker.getCurrent();
    tracker.bump({ model: 'model-b' });

    const result = transformContextWithEpoch({
      messages: [mkMsg('user', 'hi')],
      scope: [],
      maxTokens: 1000,
      epoch: oldEpoch,
      epochTracker: tracker
    });

    expect(result.hadStaleReference).toBe(true);
    expect(result.epoch?.epoch).toBe(2);
    expect(result.epoch?.model).toBe('model-b');
  });

  it('assertNotStaleEpoch throws on stale', () => {
    const f = deterministicFactory();
    const tracker = createContextEpochTracker({
      initialModel: 'a',
      now: f.now,
      revisionIdFactory: f.revisionId
    });

    const oldEpoch = tracker.getCurrent();
    tracker.bump({ model: 'b' });

    expect(() => assertNotStaleEpoch(oldEpoch, tracker)).toThrow(/Stale context epoch/);
    expect(() => assertNotStaleEpoch(tracker.getCurrent(), tracker)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Integration test: mid-turn model switch triggers epoch bump and rebuild
// ---------------------------------------------------------------------------

describe('Integration: mid-turn model switch triggers epoch bump and rebuild', () => {
  it('full lifecycle: beginTurn -> model switch -> abort -> rebuild -> fresh context', () => {
    const f = deterministicFactory();
    const tracker = createContextEpochTracker({
      initialModel: 'claude-3-haiku',
      initialScope: ['user', 'system'],
      now: f.now,
      revisionIdFactory: f.revisionId
    });

    const initialMessages: CompletionMessage[] = [
      mkMsg('system', 'You are helpful'),
      mkMsg('user', 'Hello'),
      mkMsg('assistant', 'Hi there'),
      mkMsg('user', 'How are you?')
    ];

    // Start turn with epoch 1
    const turnStartEpoch = tracker.beginTurn();
    expect(turnStartEpoch.epoch).toBe(1);
    expect(turnStartEpoch.model).toBe('claude-3-haiku');

    const firstTransform = transformContextWithEpoch({
      messages: initialMessages,
      scope: ['user', 'system'],
      maxTokens: 10_000,
      epoch: turnStartEpoch,
      epochTracker: tracker
    });

    expect(firstTransform.epoch?.epoch).toBe(1);
    expect(firstTransform.hadStaleReference).toBe(false);
    expect(firstTransform.diagnostics?.model).toBe('claude-3-haiku');
    expect(firstTransform.streamMetadata?.contextModel).toBe('claude-3-haiku');

    // Mid-turn model switch occurs (e.g. router decides to use stronger model)
    const newModel = 'claude-3-opus';

    // Integration via helper: detects abort and rebuilds
    const switchResult = handleMidTurnModelSwitch({
      tracker,
      newModel,
      messages: initialMessages,
      maxTokens: 10_000
    });

    expect(switchResult.aborted).toBe(true);
    expect(switchResult.previousEpoch?.epoch).toBe(1);
    expect(switchResult.previousEpoch?.model).toBe('claude-3-haiku');

    // After rebuild, epoch bumped and model switched
    expect(tracker.getCurrent().epoch).toBe(2);
    expect(tracker.getCurrent().model).toBe(newModel);

    // Rebuilt context uses fresh epoch
    expect(switchResult.result.epoch?.epoch).toBe(2);
    expect(switchResult.result.epoch?.model).toBe(newModel);
    expect(switchResult.result.diagnostics?.epoch).toBe(2);
    expect(switchResult.result.streamMetadata?.contextEpoch).toBe(2);
    expect(switchResult.result.streamMetadata?.contextModel).toBe(newModel);

    // No stale references after rebuild — transform with new epoch succeeds
    expect(() => {
      const currentEpoch = switchResult.result.epoch;
      expect(currentEpoch).toBeDefined();
      transformContext({
        messages: initialMessages,
        scope: [],
        maxTokens: 10_000,
        epoch: currentEpoch,
        epochTracker: tracker
      });
    }).not.toThrow();

    // Old epoch is now stale
    expect(tracker.isStale(1)).toBe(true);
    expect(isStaleContextReference(turnStartEpoch, tracker.getCurrent())).toBe(true);

    tracker.endTurn();
    expect(tracker.isMidTurn()).toBe(false);
  });

  it('no false abort when model unchanged mid-turn', () => {
    const f = deterministicFactory();
    const tracker = createContextEpochTracker({
      initialModel: 'model-a',
      now: f.now,
      revisionIdFactory: f.revisionId
    });

    tracker.beginTurn();

    const result = handleMidTurnModelSwitch({
      tracker,
      newModel: 'model-a', // same model
      messages: [mkMsg('user', 'hi')],
      maxTokens: 1000
    });

    expect(result.aborted).toBe(false);
    expect(tracker.getCurrent().epoch).toBe(1);
    tracker.endTurn();
  });

  it('model swap mid-turn yields fresh context with no stale refs', () => {
    const f = deterministicFactory();
    const tracker = createContextEpochTracker({
      initialModel: 'gpt-3.5-turbo',
      initialScope: ['user'],
      now: f.now,
      revisionIdFactory: f.revisionId
    });

    // Simulate legacy call that captured epoch 1
    const legacyEpoch = tracker.getCurrent();

    // Begin turn — later we switch model
    tracker.beginTurn();

    // Abort path
    const abortResult = tracker.abortAndRebuild('gpt-4', {
      scope: ['user', 'system'],
      reason: 'upgrade-mid-turn'
    });

    expect(abortResult.aborted.epoch).toBe(1);
    expect(abortResult.rebuilt.epoch).toBe(2);
    expect(abortResult.rebuilt.model).toBe('gpt-4');

    // Any attempt to use legacy epoch should be detected as stale
    expect(isStaleContextReference(legacyEpoch, abortResult.rebuilt)).toBe(true);
    expect(() => assertNotStaleEpoch(legacyEpoch, tracker)).toThrow();

    // Fresh context with new epoch works
    const fresh = transformContextWithEpoch({
      messages: [mkMsg('user', 'fresh hello')],
      scope: ['user', 'system'],
      maxTokens: 1000,
      epoch: abortResult.rebuilt,
      epochTracker: tracker
    });

    expect(fresh.hadStaleReference).toBe(false);
    expect(fresh.epoch?.model).toBe('gpt-4');
    expect(fresh.diagnostics?.epoch).toBe(2);
    expect(fresh.streamMetadata?.contextEpoch).toBe(2);

    tracker.endTurn();
  });
});
