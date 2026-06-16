import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  checkTrustedPublishReadiness,
  getRepositoryField,
  normalizeRepositoryValue,
  validateRepositoryMatch
} from './trusted-publish-readiness.ts';

function setupBase() {
  const base = mkdtempSync(join(tmpdir(), 'agentsy-trusted-publish-'));
  const pkgDir = join(base, 'packages', 'testpkg');
  const workflowsDir = join(base, '.github', 'workflows');
  const releaseStatePath = join(base, 'config', 'release-state.json');

  mkdirSync(pkgDir, { recursive: true });
  mkdirSync(workflowsDir, { recursive: true });
  mkdirSync(join(base, 'config'), { recursive: true });

  writeFileSync(join(workflowsDir, 'release.yml'), 'name: release\n');

  return { base, pkgDir, releaseStatePath };
}

function setupOidcReadyPackage() {
  const { base, pkgDir, releaseStatePath } = setupBase();

  writeFileSync(
    join(pkgDir, 'package.json'),
    JSON.stringify({
      name: '@agentsy/testpkg',
      repository: { url: 'https://github.com/selfagency/agentsy.git' }
    })
  );

  writeFileSync(
    releaseStatePath,
    JSON.stringify({
      defaultState: 'bootstrap-required',
      packages: { '@agentsy/testpkg': 'oidc-ready' }
    })
  );

  return { base, pkgDir, releaseStatePath };
}

describe('trusted-publish-readiness', () => {
  it('normalizeRepositoryValue handles common git URL forms', () => {
    expect(normalizeRepositoryValue('https://github.com/selfagency/agentsy.git')).toBe('selfagency/agentsy');
    expect(normalizeRepositoryValue('git+https://github.com/selfagency/agentsy.git')).toBe('selfagency/agentsy');
    expect(normalizeRepositoryValue('git@github.com:selfagency/agentsy.git')).toBe('selfagency/agentsy');
  });

  it('getRepositoryField supports string and object forms', () => {
    expect(getRepositoryField('https://github.com/selfagency/agentsy.git')).toBe(
      'https://github.com/selfagency/agentsy.git'
    );
    expect(getRepositoryField({ url: 'git@github.com:selfagency/agentsy.git' })).toBe(
      'git@github.com:selfagency/agentsy.git'
    );
    expect(getRepositoryField({})).toBe('');
  });

  it('validateRepositoryMatch returns failure for mismatch', () => {
    const result = validateRepositoryMatch('https://github.com/selfagency/wrong.git', 'selfagency/agentsy');
    expect(result.ok).toBeFalsy();
  });

  it('checkTrustedPublishReadiness passes for oidc-ready package with matching repo', () => {
    const { base, pkgDir, releaseStatePath } = setupOidcReadyPackage();

    const result = checkTrustedPublishReadiness({
      expectedRepo: 'selfagency/agentsy',
      packageDir: pkgDir,
      packageName: '@agentsy/testpkg',
      releaseStatePath,
      rootDir: base,
      workflowFilename: 'release.yml'
    });

    expect(result).toStrictEqual({ ok: true });
  });

  it('checkTrustedPublishReadiness fails for bootstrap-required package', () => {
    const { base, pkgDir, releaseStatePath } = setupBase();

    writeFileSync(
      join(pkgDir, 'package.json'),
      JSON.stringify({
        name: '@agentsy/testpkg',
        repository: { url: 'https://github.com/selfagency/agentsy.git' }
      })
    );

    writeFileSync(releaseStatePath, JSON.stringify({ defaultState: 'bootstrap-required', packages: {} }));

    const result = checkTrustedPublishReadiness({
      expectedRepo: 'selfagency/agentsy',
      packageDir: pkgDir,
      packageName: '@agentsy/testpkg',
      releaseStatePath,
      rootDir: base,
      workflowFilename: 'release.yml'
    });

    expect(result.ok).toBeFalsy();
  });

  it('checkTrustedPublishReadiness fails when workflow file is missing under provided rootDir', () => {
    const { base, pkgDir, releaseStatePath } = setupOidcReadyPackage();

    const result = checkTrustedPublishReadiness({
      expectedRepo: 'selfagency/agentsy',
      packageDir: pkgDir,
      packageName: '@agentsy/testpkg',
      releaseStatePath,
      rootDir: base,
      workflowFilename: 'missing.yml'
    });

    expect(result.ok).toBeFalsy();
  });
});
