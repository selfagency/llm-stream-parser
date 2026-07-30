import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ContextMonitor } from './monitor.js';

describe('ContextMonitor', () => {
  let monitor: ContextMonitor;
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'agentsy-test-'));
    monitor = new ContextMonitor({
      maxContextTokens: 1000,
      warningThreshold: 70,
      handoffThreshold: 85,
      handoffDir: dir
    });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns continue when context is fresh', () => {
    const action = monitor.check('agent-1', 100, 0);
    expect(action.type).toBe('continue');
  });

  it('returns warn when context crosses warning threshold', () => {
    const action = monitor.check('agent-1', 750, 1);
    expect(action.type).toBe('warn');
    if (action.type === 'warn') {
      expect(action.snapshot.status).toBe('stale');
      expect(action.snapshot.percent).toBe(75);
    }
  });

  it('does not warn twice', () => {
    monitor.check('agent-1', 750, 1);
    const action = monitor.check('agent-1', 10, 2);
    expect(action.type).toBe('continue');
  });

  it('returns handoff when context crosses handoff threshold', () => {
    const handoffBuilder = () => ({
      goal: 'Build the feature',
      currentProgress: ['Created types', 'Wrote tests'],
      whatWorked: ['TDD approach'],
      whatDidNotWork: ['Direct mutation'],
      nextSteps: ['Run integration tests']
    });
    const action = monitor.check('agent-1', 900, 3, handoffBuilder);
    expect(action.type).toBe('handoff');
    if (action.type === 'handoff') {
      expect(action.snapshot.status).toBe('critical');
      expect(action.document.goal).toBe('Build the feature');
      expect(action.document.currentProgress).toContain('Created types');
      expect(action.document.agentId).toBe('agent-1');
      expect(action.document.checkpointId).toMatch(/^handoff_\d+$/);
    }
  });

  it('writes handoff file to disk', () => {
    const handoffBuilder = () => ({
      goal: 'Test goal',
      currentProgress: ['step 1'],
      whatWorked: [],
      whatDidNotWork: [],
      nextSteps: ['next']
    });
    const action = monitor.check('agent-1', 900, 3, handoffBuilder);
    if (action.type === 'handoff') {
      const filePath = join(dir, '.agentsy', 'handoffs', 'HANDOFF_agent-1.md');
      expect(existsSync(filePath)).toBe(true);
      const content = readFileSync(filePath, 'utf-8');
      expect(content).toContain('# Handoff — Agent agent-1');
      expect(content).toContain('## Goal\n\nTest goal');
      expect(content).toContain('## Next Steps\n\n- next');
    }
  });

  it('reset clears cumulative tokens', () => {
    monitor.check('agent-1', 500, 0);
    monitor.reset();
    const snap = monitor.snapshot('agent-1', 0);
    expect(snap.percent).toBe(0);
  });

  it('snapshot returns current state without side effects', () => {
    monitor.check('agent-1', 300, 0);
    const snap = monitor.snapshot('agent-1', 5);
    expect(snap.percent).toBe(30);
    expect(snap.status).toBe('fresh');
    expect(snap.stepIndex).toBe(5);
  });
});
