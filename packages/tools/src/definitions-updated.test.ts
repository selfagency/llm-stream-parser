import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import type { ToolAnnotations, ToolDefinition } from './definitions.js';
import { spillToDisk } from './disk-spill.js';

// ── ToolDefinition expansion tests ──────────────────────────────────────────

describe('ToolDefinition — all fields', () => {
  it('accepts a definition with every new rich field', () => {
    const tool: ToolDefinition = {
      name: 'full_tool',
      description: 'A tool with every field populated',
      handler: async () => ({ ok: true, data: null }),
      annotations: {
        destructiveHint: true,
        readOnlyHint: false,
        idempotentHint: true,
        openWorldHint: false,
        requiresApproval: true,
        isReadOnly: false,
        isConcurrencySafe: true
      },
      parameters: [{ name: 'input', type: 'string', required: true }],
      schema: { type: 'object' },
      isReadOnly: false,
      isConcurrencySafe: true,
      isDestructive: true,
      interruptBehavior: 'cancel',
      maxResultSizeChars: 5000,
      shouldDefer: false,
      alwaysLoad: true,
      searchHint: 'utility',
      backfillObservableInput: (args: unknown) => JSON.stringify(args)
    };

    // Compile-time check: all fields accessible
    expect(tool.name).toBe('full_tool');
    expect(tool.isReadOnly).toBe(false);
    expect(tool.isConcurrencySafe).toBe(true);
    expect(tool.isDestructive).toBe(true);
    expect(tool.interruptBehavior).toBe('cancel');
    expect(tool.maxResultSizeChars).toBe(5000);
    expect(tool.shouldDefer).toBe(false);
    expect(tool.alwaysLoad).toBe(true);
    expect(tool.searchHint).toBe('utility');
    expect(tool.backfillObservableInput?.({ key: 'val' })).toBe('{"key":"val"}');
  });

  it('allows variant interruptBehavior values', () => {
    const deferTool: ToolDefinition = {
      name: 'd',
      description: 'd',
      handler: async () => ({ ok: true, data: null }),
      interruptBehavior: 'defer'
    };
    const blockTool: ToolDefinition = {
      name: 'b',
      description: 'b',
      handler: async () => ({ ok: true, data: null }),
      interruptBehavior: 'block'
    };
    expect(deferTool.interruptBehavior).toBe('defer');
    expect(blockTool.interruptBehavior).toBe('block');
  });
});

describe('ToolDefinition — minimal fields (backward compatible)', () => {
  it('works with only required fields (no new fields)', () => {
    const tool: ToolDefinition = {
      name: 'minimal',
      description: 'Backward-compatible minimal tool',
      handler: async () => ({ ok: true, data: 'works' })
    };

    // All new fields are undefined
    expect(tool.isReadOnly).toBeUndefined();
    expect(tool.isConcurrencySafe).toBeUndefined();
    expect(tool.isDestructive).toBeUndefined();
    expect(tool.interruptBehavior).toBeUndefined();
    expect(tool.maxResultSizeChars).toBeUndefined();
    expect(tool.shouldDefer).toBeUndefined();
    expect(tool.alwaysLoad).toBeUndefined();
    expect(tool.searchHint).toBeUndefined();
    expect(tool.backfillObservableInput).toBeUndefined();
    expect(tool.annotations).toBeUndefined();
    expect(tool.parameters).toBeUndefined();
  });

  it('executes a minimal tool without error', async () => {
    const tool: ToolDefinition = {
      name: 'ping',
      description: 'Returns pong',
      handler: async () => ({ ok: true, data: 'pong' })
    };
    const result = await tool.handler({});
    expect(result).toEqual({ ok: true, data: 'pong' });
  });
});

// ── ToolAnnotations extension tests ──────────────────────────────────────────

describe('ToolAnnotations — isReadOnly and isConcurrencySafe', () => {
  it('accepts isReadOnly and isConcurrencySafe hints', () => {
    const annotations: ToolAnnotations = {
      destructiveHint: false,
      readOnlyHint: true,
      idempotentHint: false,
      openWorldHint: false,
      requiresApproval: false,
      isReadOnly: true,
      isConcurrencySafe: false
    };

    expect(annotations.isReadOnly).toBe(true);
    expect(annotations.isConcurrencySafe).toBe(false);
  });

  it('omits the new annotation fields when not provided (backward compat)', () => {
    const annotations: ToolAnnotations = {
      destructiveHint: true
    };
    expect(annotations.isReadOnly).toBeUndefined();
    expect(annotations.isConcurrencySafe).toBeUndefined();
  });
});

// ── Disk-spill tests ─────────────────────────────────────────────────────────

describe('disk-spill — below threshold', () => {
  it('returns full result when content is within maxChars', () => {
    const result = spillToDisk('short', 100);
    expect(result).toEqual({ preview: 'short', path: null });
  });

  it('returns full result when content equals maxChars exactly', () => {
    const content = 'a'.repeat(100);
    const result = spillToDisk(content, 100);
    expect(result.preview).toBe(content);
    expect(result.path).toBeNull();
  });
});

describe('disk-spill — triggered (exceeds threshold)', () => {
  const spilledFiles: string[] = [];

  afterAll(() => {
    // Cleanup is best-effort; we verify existence in the test below
  });

  it('returns preview with truncation message when content exceeds maxChars', () => {
    const content = 'a'.repeat(200);
    const result = spillToDisk(content, 100);

    expect(result.preview).toContain('... (truncated, full result at');
    // Preview starts with the first 100 chars of content
    expect(result.preview.startsWith('a'.repeat(100))).toBe(true);
    expect(result.path).not.toBeNull();
    if (result.path) {
      spilledFiles.push(result.path);
    }
  });

  it('uses default maxChars when none provided', () => {
    const content = 'b'.repeat(15_000);
    const result = spillToDisk(content);

    expect(result.preview).toContain('... (truncated, full result at');
    expect(result.path).not.toBeNull();
    if (result.path) {
      spilledFiles.push(result.path);
    }
  });

  it('actually writes the file to disk', () => {
    const content = 'hello_disk'.repeat(500);
    const result = spillToDisk(content, 100);

    expect(result.path).not.toBeNull();
    if (result.path) {
      const onDisk = readFileSync(result.path, 'utf-8');
      expect(onDisk).toBe(content);
    }
  });

  it('generates unique paths per call', () => {
    const r1 = spillToDisk('x'.repeat(200), 10);
    const r2 = spillToDisk('y'.repeat(200), 10);
    expect(r1.path).not.toBe(r2.path);
  });
});

describe('disk-spill — empty and edge inputs', () => {
  it('handles empty string (within threshold)', () => {
    const result = spillToDisk('', 100);
    expect(result).toEqual({ preview: '', path: null });
  });

  it('handles single char (within threshold)', () => {
    const result = spillToDisk('x', 1);
    expect(result).toEqual({ preview: 'x', path: null });
  });
});
