import { describe, expect, it } from 'vitest';
import type { AtlasConstraintId } from '../src/generated/ids.js';
import { type AtlasManifest, AtlasManifestSchema, validateAgentManifest } from '../src/index.js';

describe('AtlasManifestSchema', () => {
  it('parses a valid manifest', () => {
    const input = {
      aiTasks: ['task_detect', 'task_extract'],
      humanTasks: [],
      systemTasks: [],
      dataArtifacts: [],
      constraints: ['const_privacy'],
      touchpoints: []
    };
    const result = AtlasManifestSchema.parse(input);
    expect(result.aiTasks).toEqual(['task_detect', 'task_extract']);
    expect(result.constraints).toEqual(['const_privacy']);
  });

  it('defaults empty arrays', () => {
    const result = AtlasManifestSchema.parse({});
    expect(result.aiTasks).toEqual([]);
    expect(result.humanTasks).toEqual([]);
    expect(result.systemTasks).toEqual([]);
    expect(result.dataArtifacts).toEqual([]);
    expect(result.constraints).toEqual([]);
    expect(result.touchpoints).toEqual([]);
  });

  it('rejects unknown AI task ID', () => {
    const result = AtlasManifestSchema.safeParse({ aiTasks: ['task_typo'] });
    expect(result.success).toBe(false);
  });

  it('rejects human task in aiTasks array', () => {
    // This is the whole point of the three-split ID unions
    const result = AtlasManifestSchema.safeParse({ aiTasks: ['human_review'] });
    expect(result.success).toBe(false);
  });

  it('accepts layer', () => {
    const result = AtlasManifestSchema.safeParse({ layer: 'layer_inbound' });
    expect(result.success).toBe(true);
  });

  it('rejects unknown layer', () => {
    const result = AtlasManifestSchema.safeParse({ layer: 'layer_typo' });
    expect(result.success).toBe(false);
  });
});

describe('validateAgentManifest', () => {
  it('returns valid=true for a correct manifest', () => {
    const manifest: AtlasManifest = AtlasManifestSchema.parse({
      aiTasks: ['task_detect'],
      constraints: ['const_privacy']
    });
    const result = validateAgentManifest(manifest);
    expect(result.valid).toBe(true);
    expect(result.invalidIds).toEqual([]);
  });

  it('returns invalidIds for unknown IDs', () => {
    // Bypass schema to test the validator directly
    const manifest = {
      aiTasks: ['task_typo'],
      humanTasks: [],
      systemTasks: [],
      dataArtifacts: [],
      constraints: ['const_typo'],
      touchpoints: []
    } as unknown as AtlasManifest;
    const result = validateAgentManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.invalidIds).toContain('task_typo');
    expect(result.invalidIds).toContain('const_typo');
  });

  it('detects config gaps when constraintToConfig provided', () => {
    const manifest = AtlasManifestSchema.parse({
      constraints: ['const_privacy', 'const_quality_threshold']
    });
    const constraintToConfig = new Map<AtlasConstraintId, string | null>([
      ['const_privacy', 'piiRedaction'],
      ['const_quality_threshold', null] // gap
    ]);
    const result = validateAgentManifest(manifest, constraintToConfig);
    expect(result.valid).toBe(true);
    expect(result.configGaps).toContain('const_quality_threshold');
    expect(result.configGaps).not.toContain('const_privacy');
  });

  it('returns empty configGaps when constraintToConfig not provided', () => {
    const manifest = AtlasManifestSchema.parse({
      constraints: ['const_privacy']
    });
    const result = validateAgentManifest(manifest);
    expect(result.configGaps).toEqual([]);
  });
});
