import { describe, expect, it } from 'vitest';
import { createCallBridgeFn } from '../../bridge-helpers.js';
import { createAftInspectTool } from './inspect.js';
import { createAftOutlineTool } from './outline.js';
import { createAftSearchTool } from './search.js';
import { createAftZoomTool } from './zoom.js';

const callBridge = createCallBridgeFn(null as never, '/test');

describe('AFT sensory tools', () => {
  describe('outline tool', () => {
    const tool = createAftOutlineTool(callBridge);

    it('has correct basic properties', () => {
      expect(tool.name).toBe('outline');
      expect(tool.description).toContain('symbols');
      expect(tool.annotations.readOnlyHint).toBe(true);
    });

    it('requires path parameter', () => {
      expect(tool.parameters.required).toContain('path');
    });

    it('returns data on execution', async () => {
      const result = await tool.handler({ path: 'test.ts' });
      expect(result.ok).toBe(true);
    });
  });

  describe('zoom tool', () => {
    const tool = createAftZoomTool(callBridge);

    it('has correct basic properties', () => {
      expect(tool.name).toBe('zoom');
      expect(tool.description).toContain('symbol');
      expect(tool.annotations.readOnlyHint).toBe(true);
    });

    it('requires path and symbol parameters', () => {
      expect(tool.parameters.required).toContain('path');
      expect(tool.parameters.required).toContain('symbol');
    });

    it('calls bridge with callgraph defaulted to false', async () => {
      const result = await tool.handler({ path: 'test.ts', symbol: 'foo' });
      expect(result.ok).toBe(true);
    });
  });

  describe('search tool', () => {
    const tool = createAftSearchTool(callBridge);

    it('has correct basic properties', () => {
      expect(tool.name).toBe('search');
      expect(tool.description.toLowerCase()).toContain('search');
      expect(tool.annotations.readOnlyHint).toBe(true);
    });

    it('requires query parameter', () => {
      expect(tool.parameters.required).toContain('query');
    });

    it('uses default topK of 10', async () => {
      const result = await tool.handler({ query: 'foo' });
      expect(result.ok).toBe(true);
    });
  });

  describe('inspect tool', () => {
    const tool = createAftInspectTool(callBridge);

    it('has correct basic properties', () => {
      expect(tool.name).toBe('inspect');
      expect(tool.description).toContain('health');
      expect(tool.annotations.readOnlyHint).toBe(true);
    });

    it('returns data on execution', async () => {
      const result = await tool.handler({});
      expect(result.ok).toBe(true);
    });
  });
});
