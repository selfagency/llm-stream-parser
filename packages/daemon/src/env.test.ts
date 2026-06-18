import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadDotenv } from './env.js';

describe('loadDotenv', () => {
  let tmpDir: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'env-test-'));
  });

  afterEach(() => {
    // Restore original env
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        // nosemgrep: detect-object-injection — key is from Object.keys, not user input
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      // nosemgrep: detect-object-injection — key is from Object.entries, not user input
      process.env[key] = value;
    }
  });

  it('loads a .env file', () => {
    writeFileSync(join(tmpDir, '.env'), 'TEST_KEY=hello\nTEST_NUM=42\n');
    loadDotenv([join(tmpDir, '.env')]);
    expect(process.env.TEST_KEY).toBe('hello');
    expect(process.env.TEST_NUM).toBe('42');
  });

  it('prioritizes .env.local over .env', () => {
    writeFileSync(join(tmpDir, '.env'), 'TEST_KEY=from-env\n');
    writeFileSync(join(tmpDir, '.env.local'), 'TEST_KEY=from-local\n');
    loadDotenv([join(tmpDir, '.env.local'), join(tmpDir, '.env')]);
    expect(process.env.TEST_KEY).toBe('from-local');
  });

  it('does not override existing process.env values', () => {
    process.env.TEST_EXISTING = 'original';
    writeFileSync(join(tmpDir, '.env'), 'TEST_EXISTING=from-file\n');
    loadDotenv([join(tmpDir, '.env')]);
    expect(process.env.TEST_EXISTING).toBe('original');
  });

  it('is silent when file is missing', () => {
    expect(() => loadDotenv([join(tmpDir, 'nonexistent.env')])).not.toThrow();
  });

  it('silently skips malformed lines (Node 22 behavior)', () => {
    writeFileSync(join(tmpDir, '.env'), 'NOT_A_VALID_LINE!!!\nTEST_KEY=value\n');
    expect(() => loadDotenv([join(tmpDir, '.env')])).not.toThrow();
    expect(process.env.TEST_KEY).toBe('value');
  });

  it('loads multiple files in order', () => {
    writeFileSync(join(tmpDir, '.env'), 'A=1\nB=2\n');
    writeFileSync(join(tmpDir, '.env.local'), 'B=override\nC=3\n');
    loadDotenv([join(tmpDir, '.env.local'), join(tmpDir, '.env')]);
    expect(process.env.A).toBe('1');
    expect(process.env.B).toBe('override');
    expect(process.env.C).toBe('3');
  });

  it('handles quoted values', () => {
    writeFileSync(join(tmpDir, '.env'), 'TEST_QUOTED="hello world"\n');
    loadDotenv([join(tmpDir, '.env')]);
    expect(process.env.TEST_QUOTED).toBe('hello world');
  });

  it('handles comments in .env', () => {
    writeFileSync(join(tmpDir, '.env'), '# this is a comment\nTEST_KEY=value\n');
    loadDotenv([join(tmpDir, '.env')]);
    expect(process.env.TEST_KEY).toBe('value');
  });

  it('handles empty .env file', () => {
    writeFileSync(join(tmpDir, '.env'), '');
    expect(() => loadDotenv([join(tmpDir, '.env')])).not.toThrow();
  });

  it('uses default file list when no files provided', () => {
    // Should not throw even if .env.local and .env don't exist
    expect(() => loadDotenv()).not.toThrow();
  });
});
