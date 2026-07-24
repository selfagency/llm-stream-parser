import { describe, expect, it } from 'vitest';

import { ReflectionLoop } from './reflection.js';

describe('ReflectionLoop', () => {
  describe('shouldReflect', () => {
    it('returns true for failed run_command tool', () => {
      const loop = new ReflectionLoop();
      const result = shouldReflect(loop, 'run_command', {
        exitCode: 1,
        stdout: 'Error: something broke'
      });
      expect(result).toBe(true);
    });

    it('returns true for failed lint tool', () => {
      const loop = new ReflectionLoop();
      const result = shouldReflect(loop, 'lint', {
        exitCode: 2,
        stderr: 'Linting failed'
      });
      expect(result).toBe(true);
    });

    it('returns true for failed test tool', () => {
      const loop = new ReflectionLoop();
      const result = shouldReflect(loop, 'test', {
        exitCode: 1,
        stdout: '1 test failed'
      });
      expect(result).toBe(true);
    });

    it('returns false when max reflections reached', () => {
      const loop = new ReflectionLoop(1);
      // Build a reflection message consumes the budget
      loop.buildReflectionMessage({ exitCode: 1 });
      // Now shouldReflect should return false
      const result = shouldReflect(loop, 'run_command', { exitCode: 1 });
      expect(result).toBe(false);
    });

    it('returns false for successful command (exitCode 0)', () => {
      const loop = new ReflectionLoop();
      const result = shouldReflect(loop, 'run_command', {
        exitCode: 0,
        stdout: 'All good'
      });
      expect(result).toBe(false);
    });

    it('returns false for undefined exit code', () => {
      const loop = new ReflectionLoop();
      const result = shouldReflect(loop, 'run_command', {
        stdout: 'no exit code'
      });
      expect(result).toBe(false);
    });

    it('returns false for non-matching tool names', () => {
      const loop = new ReflectionLoop();
      const result = shouldReflect(loop, 'read_file', {
        exitCode: 1
      });
      expect(result).toBe(false);
    });
  });

  describe('buildReflectionMessage', () => {
    it('increments reflection count and formats message correctly', () => {
      const loop = new ReflectionLoop();
      expect(loop.reflectionCount).toBe(0);

      const msg = loop.buildReflectionMessage({
        exitCode: 1,
        stdout: 'Command failed: something went wrong'
      });

      expect(loop.reflectionCount).toBe(1);
      expect(msg.role).toBe('user');
      expect(msg.content).toContain('exit code 1');
      expect(msg.content).toContain('something went wrong');
    });

    it('handles missing stdout gracefully', () => {
      const loop = new ReflectionLoop();
      const msg = loop.buildReflectionMessage({
        exitCode: 2,
        stderr: 'error output'
      });

      expect(msg.content).toContain('exit code 2');
      expect(msg.content).toContain('');
    });
  });

  describe('constructor', () => {
    it('defaults maxReflections to 3', () => {
      const loop = new ReflectionLoop();
      // Build reflection messages to consume the budget
      loop.buildReflectionMessage({ exitCode: 1 });
      loop.buildReflectionMessage({ exitCode: 1 });
      loop.buildReflectionMessage({ exitCode: 1 });
      // 4th shouldReflect should be suppressed
      expect(shouldReflect(loop, 'run_command', { exitCode: 1 })).toBe(false);
    });

    it('accepts custom maxReflections', () => {
      const loop = new ReflectionLoop(5);
      for (let i = 0; i < 5; i++) {
        loop.buildReflectionMessage({ exitCode: 1 });
      }
      expect(shouldReflect(loop, 'run_command', { exitCode: 1 })).toBe(false);
    });
  });
});

/**
 * Helper to call shouldReflect — wraps the method call to avoid
 * any `this`-binding issues with the extracted method reference.
 */
function shouldReflect(
  loop: ReflectionLoop,
  toolName: string,
  result: { exitCode?: number; stdout?: string; stderr?: string }
): boolean {
  return loop.shouldReflect(toolName, result);
}
