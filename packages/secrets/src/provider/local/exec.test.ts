import { describe, expect, it } from 'vitest';
import { cliNotFoundError, isCliInstalled, runCli } from './exec.js';

describe('runCli', () => {
  it('returns stdout for a successful command', () => {
    const result = runCli('echo hello');
    expect(result.stdout).toBe('hello');
    expect(result.stderr).toBe('');
  });

  it('returns stderr for a failing command', () => {
    const result = runCli('echo error >&2 && exit 1');
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('error');
  });

  it('accepts custom timeout', () => {
    const result = runCli('echo ok', { timeout: 5000 });
    expect(result.stdout).toBe('ok');
  });

  it('accepts custom env', () => {
    const result = runCli('echo "$MY_VAR"', { env: { MY_VAR: 'custom' } });
    expect(result.stdout).toBe('custom');
  });

  it('returns empty result for unknown command', () => {
    const result = runCli('nonexistent_command_xyz_123');
    expect(result.stdout).toBe('');
  });
});

describe('cliNotFoundError', () => {
  it('returns error with known CLI hint', () => {
    const err = cliNotFoundError('op');
    expect(err.message).toContain('1password.com');
  });

  it('returns error with generic hint for unknown CLI', () => {
    const err = cliNotFoundError('custom-cli');
    expect(err.message).toContain('custom-cli');
    expect(err.message).toContain('PATH');
  });
});

describe('isCliInstalled', () => {
  it('returns true for a known binary', () => {
    expect(isCliInstalled('echo')).toBe(true);
  });

  it('returns false for a missing binary', () => {
    expect(isCliInstalled('nonexistent_binary_xyz_123')).toBe(false);
  });
});
