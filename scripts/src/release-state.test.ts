import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DEFAULT_RELEASE_STATE, getPackageReleaseState, readReleaseState, writeReleaseState } from './release-state.ts';

describe('release-state', () => {
  it('readReleaseState returns defaults when file is missing', () => {
    const base = mkdtempSync(join(tmpdir(), 'agentsy-release-state-'));
    const p = join(base, 'release-state.json');

    const state = readReleaseState(p);
    expect(state.defaultState).toStrictEqual(DEFAULT_RELEASE_STATE);
    expect(state.packages).toStrictEqual({});
  });

  it('getPackageReleaseState falls back to default', () => {
    const state = {
      defaultState: 'bootstrap-required',
      packages: {
        '@agentsy/vscode': 'oidc-ready'
      }
    };

    expect(getPackageReleaseState(state, '@agentsy/vscode')).toBe('oidc-ready');
    expect(getPackageReleaseState(state, '@agentsy/processor')).toBe('bootstrap-required');
  });

  it('writeReleaseState writes sorted package keys', () => {
    const base = mkdtempSync(join(tmpdir(), 'agentsy-release-state-'));
    const p = join(base, 'release-state.json');

    writeReleaseState(p, {
      defaultState: 'bootstrap-required',
      packages: {
        '@agentsy/a': 'bootstrap-required',
        '@agentsy/z': 'oidc-ready'
      }
    });

    const written = JSON.parse(readFileSync(p, 'utf-8')) as {
      defaultState: unknown;
      packages: Record<string, unknown>;
    };
    expect(written.packages).toBeDefined();
    expect(Object.keys(written.packages)).toStrictEqual(['@agentsy/a', '@agentsy/z']);
  });

  it('readReleaseState tolerates invalid structure', () => {
    const base = mkdtempSync(join(tmpdir(), 'agentsy-release-state-'));
    const p = join(base, 'release-state.json');
    writeFileSync(p, JSON.stringify({ defaultState: 12, packages: [] }));

    const state = readReleaseState(p);
    expect(state.defaultState).toStrictEqual(DEFAULT_RELEASE_STATE);
    expect(state.packages).toStrictEqual({});
  });

  it('readReleaseState tolerates malformed JSON by returning defaults', () => {
    const base = mkdtempSync(join(tmpdir(), 'agentsy-release-state-'));
    const p = join(base, 'release-state.json');
    writeFileSync(p, '{"defaultState":');

    const state = readReleaseState(p);
    expect(state.defaultState).toStrictEqual(DEFAULT_RELEASE_STATE);
    expect(state.packages).toStrictEqual({});
  });
});
