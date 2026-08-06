import { describe, expect, it, vi } from 'vitest';
import { ToolRegistry } from './registry.js';

describe('ToolRegistry filtering', () => {
  it('strips denied tools before model sees them', () => {
    const registry = new ToolRegistry();
    registry.register({ name: 'read_file', description: 'r', handler: async () => ({ ok: true, data: null }) });
    registry.register({ name: 'delete_file', description: 'd', handler: async () => ({ ok: true, data: null }) });
    registry.register({ name: 'format_disk', description: 'f', handler: async () => ({ ok: true, data: null }) });

    const result = registry.filter({ deny: ['delete_file', 'format_disk'] });
    expect(result.allowed.map(r => r.name)).toEqual(['read_file']);
    expect(result.denied.map(r => r.name)).toEqual(['delete_file', 'format_disk']);
  });

  it('allow list enforced', () => {
    const registry = new ToolRegistry();
    registry.register({ name: 'read_file', description: '', handler: async () => ({ ok: true, data: null }) });
    registry.register({ name: 'write_file', description: '', handler: async () => ({ ok: true, data: null }) });
    registry.register({ name: 'delete_file', description: '', handler: async () => ({ ok: true, data: null }) });

    const result = registry.filter({ allow: ['read_file', 'write_file'] });
    expect(result.allowed.map(r => r.name)).toEqual(['read_file', 'write_file']);
  });

  it('deny takes precedence over allow', () => {
    const registry = new ToolRegistry();
    registry.register({ name: 'read_file', description: '', handler: async () => ({ ok: true, data: null }) });
    registry.register({ name: 'delete_file', description: '', handler: async () => ({ ok: true, data: null }) });

    const result = registry.filter({ allow: ['read_file', 'delete_file'], deny: ['delete_file'] });
    expect(result.allowed.map(r => r.name)).toEqual(['read_file']);
  });

  it('logs stripped at debug level', () => {
    const registry = new ToolRegistry();
    registry.register({ name: 'delete_file', description: '', handler: async () => ({ ok: true, data: null }) });
    const debug = vi.fn();
    registry.filter({ deny: ['delete_file'] }, debug);
    expect(debug).toHaveBeenCalled();
  });

  it('throws on empty after filtering if asserted', () => {
    const registry = new ToolRegistry();
    registry.register({ name: 'delete_file', description: '', handler: async () => ({ ok: true, data: null }) });
    const result = registry.filter({ deny: ['*'] });
    expect(() => registry.assertNonEmptyFiltered(result, 'coder')).toThrow();
  });

  it('wildcard filtering', () => {
    const registry = new ToolRegistry();
    registry.register({ name: 'fs_read', description: '', handler: async () => ({ ok: true, data: null }) });
    registry.register({ name: 'fs_write', description: '', handler: async () => ({ ok: true, data: null }) });
    registry.register({ name: 'shell_exec', description: '', handler: async () => ({ ok: true, data: null }) });

    const result = registry.filter({ allow: ['fs_*'] });
    expect(result.allowed.map(r => r.name)).toEqual(['fs_read', 'fs_write']);
  });
});
