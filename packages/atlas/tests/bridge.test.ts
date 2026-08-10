import { describe, expect, it } from 'vitest';
import {
  AI_TASKS,
  CONSTRAINTS,
  DATA_ARTIFACTS,
  filterByLayer,
  filterConstraintsByCategory,
  filterTouchpointsByCategory,
  getAllAiTaskIds,
  getAllArtifactIds,
  getAllConstraintIds,
  getAllHumanTaskIds,
  getAllSystemTaskIds,
  getAllTaskIds,
  getAllTouchpointIds,
  getAtlasStats,
  getCategories,
  getLayer,
  getPattern,
  getPatternsByDimension,
  HUMAN_TASKS,
  isAiTask,
  isHumanTask,
  isSystemTask,
  isValidAiTaskId,
  isValidArtifactId,
  isValidConstraintId,
  isValidHumanTaskId,
  isValidSystemTaskId,
  isValidTaskId,
  isValidTouchpointId,
  LAYERS,
  SYSTEM_TASKS,
  TOUCHPOINTS
} from '../src/index.js';

describe('snapshot integrity', () => {
  it('stats match snapshot', () => {
    const stats = getAtlasStats();
    expect(stats).toEqual({
      ai: 25,
      human: 24,
      system: 22,
      data: 47,
      constraints: 37,
      touchpoints: 38,
      layers: 4,
      total: 193
    });
  });

  it('no duplicate task IDs across all three task arrays', () => {
    const allIds = [...AI_TASKS, ...HUMAN_TASKS, ...SYSTEM_TASKS].map(t => t.id);
    const unique = new Set(allIds);
    expect(unique.size).toBe(allIds.length);
  });

  it('no duplicate artifact IDs', () => {
    const ids = DATA_ARTIFACTS.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('no duplicate constraint IDs', () => {
    const ids = CONSTRAINTS.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('no duplicate touchpoint IDs', () => {
    const ids = TOUCHPOINTS.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every task has a valid layer_id', () => {
    const layerIds = new Set(LAYERS.map(l => l.id));
    for (const task of [...AI_TASKS, ...HUMAN_TASKS, ...SYSTEM_TASKS]) {
      expect(layerIds.has(task.layer_id)).toBe(true);
    }
  });
});

describe('bridge helpers', () => {
  it('getPattern returns task by id', () => {
    const p = getPattern('task_detect');
    expect(p).toBeDefined();
    expect(p?.id).toBe('task_detect');
  });

  it('getPattern returns undefined for unknown id', () => {
    expect(getPattern('task_nonexistent')).toBeUndefined();
  });

  it('getPatternsByDimension returns correct arrays', () => {
    expect(getPatternsByDimension('ai')).toBe(AI_TASKS);
    expect(getPatternsByDimension('human')).toBe(HUMAN_TASKS);
    expect(getPatternsByDimension('system')).toBe(SYSTEM_TASKS);
    expect(getPatternsByDimension('data')).toBe(DATA_ARTIFACTS);
    expect(getPatternsByDimension('constraints')).toBe(CONSTRAINTS);
    expect(getPatternsByDimension('touchpoints')).toBe(TOUCHPOINTS);
  });

  it('filterByLayer returns tasks in that layer', () => {
    const inbound = filterByLayer(AI_TASKS, 'layer_inbound');
    expect(inbound.length).toBeGreaterThan(0);
    for (const t of inbound) {
      expect(t.layer_id).toBe('layer_inbound');
    }
  });

  it('getLayer returns layer by id', () => {
    const layer = getLayer('layer_inbound');
    expect(layer).toBeDefined();
    expect(layer?.name).toBe('Inbound');
  });

  it('filterConstraintsByCategory returns only that category', () => {
    const privacy = filterConstraintsByCategory('quality_safety');
    expect(privacy.length).toBeGreaterThan(0);
    for (const c of privacy) {
      expect(c.category).toBe('quality_safety');
    }
  });

  it('filterTouchpointsByCategory returns only that category', () => {
    const screen = filterTouchpointsByCategory('screen_interface');
    expect(screen.length).toBeGreaterThan(0);
    for (const t of screen) {
      expect(t.category).toBe('screen_interface');
    }
  });

  it('getCategories returns unique categories', () => {
    const cats = getCategories('data');
    expect(cats.length).toBe(new Set(cats).size);
  });
});

describe('type guards', () => {
  it('isAiTask narrows correctly', () => {
    // biome-ignore lint/style/noNonNullAssertion: fixture arrays are populated.
    const aiTask = AI_TASKS[0]!;
    expect(isAiTask(aiTask)).toBe(true);
    expect(isHumanTask(aiTask)).toBe(false);
    expect(isSystemTask(aiTask)).toBe(false);
  });

  it('isHumanTask narrows correctly', () => {
    // biome-ignore lint/style/noNonNullAssertion: fixture arrays are populated.
    const humanTask = HUMAN_TASKS[0]!;
    expect(isHumanTask(humanTask)).toBe(true);
    expect(isAiTask(humanTask)).toBe(false);
  });

  it('isSystemTask narrows correctly', () => {
    // biome-ignore lint/style/noNonNullAssertion: fixture arrays are populated.
    const systemTask = SYSTEM_TASKS[0]!;
    expect(isSystemTask(systemTask)).toBe(true);
    expect(isAiTask(systemTask)).toBe(false);
  });
});

describe('ID validators', () => {
  it('isValidAiTaskId narrows for valid IDs', () => {
    expect(isValidAiTaskId('task_detect')).toBe(true);
    expect(isValidAiTaskId('task_nonexistent')).toBe(false);
  });

  it('isValidHumanTaskId narrows for valid IDs', () => {
    // biome-ignore lint/style/noNonNullAssertion: fixture arrays are populated.
    const firstHuman = HUMAN_TASKS[0]!.id;
    expect(isValidHumanTaskId(firstHuman)).toBe(true);
    expect(isValidHumanTaskId('task_detect')).toBe(false);
  });

  it('isValidSystemTaskId narrows for valid IDs', () => {
    // biome-ignore lint/style/noNonNullAssertion: fixture arrays are populated.
    const firstSystem = SYSTEM_TASKS[0]!.id;
    expect(isValidSystemTaskId(firstSystem)).toBe(true);
    expect(isValidSystemTaskId('task_detect')).toBe(false);
  });

  it('isValidTaskId accepts any task type', () => {
    expect(isValidTaskId('task_detect')).toBe(true);
    // biome-ignore lint/style/noNonNullAssertion: fixture arrays are populated.
    expect(isValidTaskId(HUMAN_TASKS[0]!.id)).toBe(true);
    // biome-ignore lint/style/noNonNullAssertion: fixture arrays are populated.
    expect(isValidTaskId(SYSTEM_TASKS[0]!.id)).toBe(true);
    expect(isValidTaskId('task_nonexistent')).toBe(false);
  });

  it('isValidArtifactId narrows for valid IDs', () => {
    // biome-ignore lint/style/noNonNullAssertion: fixture arrays are populated.
    expect(isValidArtifactId(DATA_ARTIFACTS[0]!.id)).toBe(true);
    expect(isValidArtifactId('data_nonexistent')).toBe(false);
  });

  it('isValidConstraintId narrows for valid IDs', () => {
    expect(isValidConstraintId('const_privacy')).toBe(true);
    expect(isValidConstraintId('const_nonexistent')).toBe(false);
  });

  it('isValidTouchpointId narrows for valid IDs', () => {
    // biome-ignore lint/style/noNonNullAssertion: fixture arrays are populated.
    expect(isValidTouchpointId(TOUCHPOINTS[0]!.id)).toBe(true);
    expect(isValidTouchpointId('tp_nonexistent')).toBe(false);
  });
});

describe('getAll*Ids helpers', () => {
  it('getAllTaskIds returns all 71 task IDs', () => {
    expect(getAllTaskIds().length).toBe(25 + 24 + 22);
  });

  it('getAllAiTaskIds returns 25', () => {
    expect(getAllAiTaskIds().length).toBe(25);
  });

  it('getAllHumanTaskIds returns 24', () => {
    expect(getAllHumanTaskIds().length).toBe(24);
  });

  it('getAllSystemTaskIds returns 22', () => {
    expect(getAllSystemTaskIds().length).toBe(22);
  });

  it('getAllArtifactIds returns 47', () => {
    expect(getAllArtifactIds().length).toBe(47);
  });

  it('getAllConstraintIds returns 37', () => {
    expect(getAllConstraintIds().length).toBe(37);
  });

  it('getAllTouchpointIds returns 38', () => {
    expect(getAllTouchpointIds().length).toBe(38);
  });
});
