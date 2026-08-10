import { describe, expect, it } from 'vitest';
import type { ToolDefinition } from './definitions.js';
import { ToolRegistry } from './registry.js';

function createTestTool(overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    name: 'test_tool',
    description: 'A test tool',
    handler: async () => ({ ok: true, data: null }),
    ...overrides
  };
}

function createEchoTool(value: string): ToolDefinition {
  return {
    name: 'echo',
    description: `Echoes "${value}"`,
    handler: async () => ({ ok: true, data: { echoed: value } })
  };
}

describe('ToolRegistry.replace', () => {
  it('replaces an existing tool and returns the old registration', () => {
    const registry = new ToolRegistry();

    registry.register(createTestTool({ name: 'tool_a' }));

    const replacement = createTestTool({
      name: 'tool_a',
      description: 'Replacement tool',
      handler: async () => ({ ok: true, data: { replaced: true } })
    });

    const previous = registry.replace('tool_a', replacement);

    expect(previous).not.toBeNull();
    expect(previous?.name).toBe('tool_a');
    expect(registry.size).toBe(1);
  });

  it('returns null when replacing a non-existing tool (but registers it)', () => {
    const registry = new ToolRegistry();

    const result = registry.replace('new_tool', createTestTool({ name: 'new_tool' }));

    expect(result).toBeNull();
    expect(registry.get('new_tool')).toBeDefined();
    expect(registry.size).toBe(1);
  });

  it('uses the new definition after replace', async () => {
    const registry = new ToolRegistry();

    registry.register(createEchoTool('original'));
    registry.replace('echo', createEchoTool('replaced'));

    const result = await registry.execute('echo', {});
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ echoed: 'replaced' });
  });

  it('supports hoisting sequence: register → replace → new behavior', async () => {
    const registry = new ToolRegistry();

    // Step 1: Register a baseline tool
    registry.register(
      createTestTool({
        name: 'search',
        description: 'Baseline search',
        handler: async () => ({ ok: true, data: { source: 'baseline' } })
      })
    );

    // Verify baseline execution
    const baselineResult = await registry.execute('search', {});
    expect(baselineResult).toEqual({ ok: true, data: { source: 'baseline' } });

    // Step 2: Replace with an AFT-backed version (hoisting)
    const previous = registry.replace(
      'search',
      createTestTool({
        name: 'search',
        description: 'AFT-backed search',
        handler: async () => ({ ok: true, data: { source: 'aft' } })
      })
    );

    // Step 3: Verify replaced behavior
    const aftResult = await registry.execute('search', {});
    expect(aftResult).toEqual({ ok: true, data: { source: 'aft' } });

    // Step 4: Previous registration has the baseline handler
    expect(previous?.name).toBe('search');
    const prevResult = await previous?.handler({});
    expect(prevResult).toEqual({ ok: true, data: { source: 'baseline' } });
  });

  it('preserves the tool name from the replace argument, not the definition', () => {
    const registry = new ToolRegistry();

    // Register under one name, replace with a definition that has a different name
    registry.register(createTestTool({ name: 'original_name' }));

    const previous = registry.replace('original_name', createTestTool({ name: 'different_name' }));

    expect(previous).not.toBeNull();
    // The tool should still be findable by the name passed to replace
    expect(registry.get('original_name')).toBeDefined();
    expect(registry.size).toBe(1);
  });

  it('preserves annotations from the replacement definition', () => {
    const registry = new ToolRegistry();

    registry.register(createTestTool({ name: 'tool_b' }));

    registry.replace(
      'tool_b',
      createTestTool({
        name: 'tool_b',
        annotations: { readOnlyHint: true, idempotentHint: true }
      })
    );

    const updated = registry.get('tool_b');
    expect(updated?.annotations?.readOnlyHint).toBe(true);
    expect(updated?.annotations?.idempotentHint).toBe(true);
  });

  it('removes annotations when replacement has none', () => {
    const registry = new ToolRegistry();

    registry.register(
      createTestTool({
        name: 'tool_c',
        annotations: { destructiveHint: true }
      })
    );

    registry.replace(
      'tool_c',
      createTestTool({
        name: 'tool_c'
        // No annotations
      })
    );

    const updated = registry.get('tool_c');
    expect(updated?.annotations).toBeUndefined();
  });
});

describe('ToolRegistry backward compatibility after replace', () => {
  it('register still works after replace calls', () => {
    const registry = new ToolRegistry();

    registry.replace('existing', createTestTool({ name: 'existing' }));
    registry.register(createTestTool({ name: 'new_tool_after_replace' }));

    expect(registry.get('existing')).toBeDefined();
    expect(registry.get('new_tool_after_replace')).toBeDefined();
    expect(registry.size).toBe(2);
  });

  it('execute still works after replace calls', async () => {
    const registry = new ToolRegistry();

    registry.replace(
      'existing',
      createTestTool({
        name: 'existing',
        handler: async () => ({ ok: true, data: { from: 'replace' } })
      })
    );

    const result = await registry.execute('existing', {});
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ from: 'replace' });
  });

  it('remove still works after replace calls', () => {
    const registry = new ToolRegistry();

    registry.register(createTestTool({ name: 'tool_x' }));
    registry.replace('tool_x', createTestTool({ name: 'tool_x' }));

    expect(registry.remove('tool_x')).toBe(true);
    expect(registry.get('tool_x')).toBeUndefined();
  });

  it('list still returns all tools after replace calls', () => {
    const registry = new ToolRegistry();

    registry.register(createTestTool({ name: 'tool_1' }));
    registry.register(createTestTool({ name: 'tool_2' }));
    registry.replace('tool_1', createTestTool({ name: 'tool_1' }));

    const tools = registry.list();
    expect(tools).toHaveLength(2);
    const names = tools.map(t => t.name).sort();
    expect(names).toEqual(['tool_1', 'tool_2']);
  });

  it('size is unchanged after replacing an existing tool', () => {
    const registry = new ToolRegistry();

    registry.register(createTestTool({ name: 'unique' }));
    expect(registry.size).toBe(1);

    registry.replace('unique', createTestTool({ name: 'unique' }));
    expect(registry.size).toBe(1);
  });

  it('size increases when replace creates a new tool', () => {
    const registry = new ToolRegistry();

    registry.replace('brand_new', createTestTool({ name: 'brand_new' }));
    expect(registry.size).toBe(1);
  });
});
