import { describe, expect, it, vi } from 'vitest';
import {
  assertNonEmptyTools,
  createToolFilter,
  EmptyToolListError,
  filterToolNames,
  filterTools,
  matchesPattern,
  patternToRegExp
} from './tool-filter.js';

const makeTools = (names: string[]) => names.map(name => ({ name, description: `tool ${name}` }));

describe('pattern matching', () => {
  it('exact match', () => {
    expect(matchesPattern('read_file', 'read_file')).toBe(true);
    expect(matchesPattern('read_file', 'write_file')).toBe(false);
  });

  it('wildcard * matches all', () => {
    expect(matchesPattern('anything', '*')).toBe(true);
    expect(matchesPattern('', '*')).toBe(true);
  });

  it('prefix wildcard read_*', () => {
    expect(matchesPattern('read_file', 'read_*')).toBe(true);
    expect(matchesPattern('read_buffer', 'read_*')).toBe(true);
    expect(matchesPattern('write_file', 'read_*')).toBe(false);
  });

  it('suffix wildcard *_file', () => {
    expect(matchesPattern('read_file', '*_file')).toBe(true);
    expect(matchesPattern('delete_file', '*_file')).toBe(true);
    expect(matchesPattern('file_read', '*_file')).toBe(false);
  });

  it('infix wildcard *file*', () => {
    expect(matchesPattern('read_file', '*file*')).toBe(true);
    expect(matchesPattern('my_file_handler', '*file*')).toBe(true);
  });

  it('patternToRegExp escapes regex meta', () => {
    const re = patternToRegExp('read.file');
    expect(re.test('read.file')).toBe(true);
    expect(re.test('readXfile')).toBe(false);
  });

  it('throws on empty pattern', () => {
    expect(() => patternToRegExp('')).toThrow();
  });
});

describe('deny filtering', () => {
  it('strips denied tools from list before model sees them', () => {
    const tools = makeTools(['read_file', 'write_file', 'delete_file', 'format_disk']);
    const result = filterTools(tools, { deny: ['delete_file', 'format_disk'] });
    expect(result.allowed.map(t => t.name)).toEqual(['read_file', 'write_file']);
    expect(result.denied.map(t => t.name)).toEqual(['delete_file', 'format_disk']);
    expect(result.strippedNames).toContain('delete_file');
    expect(result.strippedNames).toContain('format_disk');
  });

  it('deny with empty handling returns all', () => {
    const tools = makeTools(['read_file', 'write_file']);
    const result = filterTools(tools, {});
    expect(result.allowed).toHaveLength(2);
    expect(result.denied).toHaveLength(0);
  });

  it('deny filtering logged at debug level', () => {
    const debug = vi.fn();
    const tools = makeTools(['read_file', 'delete_file']);
    filterTools(tools, { deny: ['delete_file'] }, { debug });
    expect(debug).toHaveBeenCalledOnce();
    const [msg, meta] = debug.mock.calls[0] as [string, Record<string, unknown>];
    expect(msg).toMatch(/stripped/);
    expect(meta).toHaveProperty('stripped');
    expect(meta.stripped as string[]).toContain('delete_file');
  });
});

describe('allow list', () => {
  it('allow list filters to only allowed tools', () => {
    const tools = makeTools(['read_file', 'write_file', 'delete_file', 'run_command']);
    const result = filterTools(tools, { allow: ['read_file', 'write_file'] });
    expect(result.allowed.map(t => t.name)).toEqual(['read_file', 'write_file']);
    expect(result.strippedNames).toContain('delete_file');
    expect(result.strippedNames).toContain('run_command');
  });

  it('allow list with wildcard', () => {
    const tools = makeTools(['fs_read', 'fs_write', 'fs_patch', 'shell_exec']);
    const result = filterTools(tools, { allow: ['fs_*'] });
    expect(result.allowed.map(t => t.name)).toEqual(['fs_read', 'fs_write', 'fs_patch']);
    expect(result.strippedNames).toContain('shell_exec');
  });

  it('empty allow list means allow all (before deny)', () => {
    const names = ['a', 'b', 'c'];
    const { allowed } = filterToolNames(names, { allow: [] });
    expect(allowed).toEqual(names);
  });
});

describe('combined allow+deny', () => {
  it('deny takes precedence over allow', () => {
    const tools = makeTools(['read_file', 'write_file', 'delete_file']);
    // allow includes delete_file but deny should remove it
    const result = filterTools(tools, {
      allow: ['read_file', 'write_file', 'delete_file'],
      deny: ['delete_file']
    });
    expect(result.allowed.map(t => t.name)).toEqual(['read_file', 'write_file']);
    expect(result.denied.map(t => t.name)).toEqual(['delete_file']);
  });

  it('overlapping allow/deny with wildcards', () => {
    const tools = makeTools(['read_file', 'write_file', 'read_secret', 'write_secret']);
    const result = filterTools(tools, {
      allow: ['*'],
      deny: ['*_secret', 'delete_*']
    });
    expect(result.allowed.map(t => t.name)).toEqual(['read_file', 'write_file']);
    expect(result.strippedNames).toContain('read_secret');
    expect(result.strippedNames).toContain('write_secret');
  });

  it('combined allow+deny: allow restricts first, then deny', () => {
    const names = ['read_file', 'write_file', 'delete_file', 'format_disk'];
    const { allowed, denied } = filterToolNames(names, {
      allow: ['read_file', 'write_file', 'delete_file'],
      deny: ['delete_file', 'format_disk']
    });
    // format_disk not in allow, so not even considered for deny, but should be in stripped via allow exclusion
    expect(allowed).toEqual(['read_file', 'write_file']);
    expect(denied).toEqual(['delete_file']);
  });
});

describe('empty handling', () => {
  it('empty result when all denied', () => {
    const tools = makeTools(['delete_file']);
    const result = filterTools(tools, { deny: ['delete_file'] });
    expect(result.allowed).toHaveLength(0);
    expect(result.denied).toHaveLength(1);
  });

  it('assertNonEmptyTools throws EmptyToolListError', () => {
    const tools = makeTools(['delete_file']);
    const result = filterTools(tools, { deny: ['*'] });
    expect(() => assertNonEmptyTools(result, 'coder')).toThrow(EmptyToolListError);
    expect(() => assertNonEmptyTools(result, 'coder')).toThrow(/coder/);
  });

  it('assertNonEmptyTools passes when non-empty', () => {
    const tools = makeTools(['read_file']);
    const result = filterTools(tools, { deny: ['delete_file'] });
    expect(() => assertNonEmptyTools(result)).not.toThrow();
  });

  it('empty input list stays empty', () => {
    const result = filterTools([], { deny: ['*'] });
    expect(result.allowed).toHaveLength(0);
    expect(result.denied).toHaveLength(0);
  });

  it('allow list that matches nothing yields empty', () => {
    const tools = makeTools(['read_file']);
    const result = filterTools(tools, { allow: ['nonexistent'] });
    expect(result.allowed).toHaveLength(0);
  });
});

describe('wildcard coverage', () => {
  it('wildcard * deny removes all', () => {
    const tools = makeTools(['a', 'b', 'c']);
    const result = filterTools(tools, { deny: ['*'] });
    expect(result.allowed).toHaveLength(0);
    expect(result.denied).toHaveLength(3);
  });

  it('multiple wildcards in allow', () => {
    const tools = makeTools(['read_file', 'write_file', 'fs_read', 'fs_write', 'shell_exec']);
    const result = filterTools(tools, { allow: ['read_*', 'fs_*'] });
    expect(result.allowed.map(t => t.name).sort()).toEqual(['read_file', 'fs_read', 'fs_write'].sort());
  });
});

describe('createToolFilter factory', () => {
  it('factory creates reusable filter', () => {
    const filter = createToolFilter({ allow: ['read_*'], deny: ['*_secret'] });
    const tools = makeTools(['read_file', 'read_secret', 'write_file']);
    const result = filter.filter(tools);
    expect(result.allowed.map(t => t.name)).toEqual(['read_file']);
  });

  it('filterNames works', () => {
    const filter = createToolFilter({ deny: ['delete_file'] });
    const { allowed } = filter.filterNames(['read_file', 'delete_file']);
    expect(allowed).toEqual(['read_file']);
  });

  it('assertNonEmpty via factory', () => {
    const filter = createToolFilter({ deny: ['*'] });
    const result = filter.filter(makeTools(['a']));
    expect(() => filter.assertNonEmpty(result, 'test')).toThrow(EmptyToolListError);
  });

  it('trims and ignores empty strings in config', () => {
    const filter = createToolFilter({ allow: ['  read_file  ', '', ' '], deny: ['  '] });
    const result = filter.filter(makeTools(['read_file', 'write_file']));
    expect(result.allowed.map(t => t.name)).toEqual(['read_file']);
  });
});

describe('integration: coder agent spec with deny delete_file', () => {
  it('coder agent with deny rules never exposes denied tools to model', () => {
    // Simulate loading coder.yaml with tools.deny
    const allTools = makeTools([
      'read_file',
      'write_file',
      'edit_file',
      'run_command',
      'delete_file',
      'format_disk',
      'fs_read',
      'fs_write',
      'fs_patch',
      'shell_exec'
    ]);

    const coderConfig = {
      allow: ['read_file', 'write_file', 'edit_file', 'run_command', 'fs_read', 'fs_write', 'fs_patch', 'shell_exec'],
      deny: ['delete_file', 'format_disk']
    };

    const result = filterTools(allTools, coderConfig);

    // Model should never see delete_file or format_disk
    const visibleToModel = result.allowed.map(t => t.name);
    expect(visibleToModel).not.toContain('delete_file');
    expect(visibleToModel).not.toContain('format_disk');
    expect(visibleToModel).toContain('read_file');
    expect(visibleToModel).toContain('write_file');
  });

  it('agent with deny overlapping allow ensures deny wins', () => {
    const tools = makeTools(['read_file', 'delete_file']);
    const spec = {
      tools: {
        allow: ['read_file', 'delete_file'],
        deny: ['delete_file']
      }
    };
    const result = filterTools(tools, spec.tools);
    expect(result.allowed.map(t => t.name)).toEqual(['read_file']);
  });
});
