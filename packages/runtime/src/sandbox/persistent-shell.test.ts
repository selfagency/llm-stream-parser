import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createPersistentShell,
  createPersistentShellManager,
  getDefaultShellManager,
  resetDefaultShellManager
} from './persistent-shell.js';

describe('PersistentShell', () => {
  let tempDir: string;
  let subDir: string;

  beforeEach(() => {
    const raw = mkdtempSync(join(tmpdir(), 'agentsy-shell-test-'));
    tempDir = realpathSync(raw);
    subDir = join(tempDir, 'subdir');
    mkdirSync(subDir);
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    resetDefaultShellManager();
  });

  describe('cwd tracking', () => {
    it('should track initial cwd', () => {
      const shell = createPersistentShell({ initialCwd: tempDir });
      expect(shell.getCwd()).toBe(tempDir);
    });

    it('should update cwd after cd command', async () => {
      const shell = createPersistentShell({ initialCwd: tempDir });
      const result = await shell.exec(`cd ${subDir}`);
      expect(result.exitCode).toBe(0);
      expect(shell.getCwd()).toBe(subDir);
    });

    it('should handle cd with && chain', async () => {
      const shell = createPersistentShell({ initialCwd: tempDir });
      await shell.exec(`cd ${subDir} && echo hi`);
      expect(shell.getCwd()).toBe(subDir);
    });

    it('should persist cwd across multiple calls', async () => {
      const shell = createPersistentShell({ initialCwd: tempDir });
      await shell.exec(`cd ${subDir}`);
      const result = await shell.exec('pwd');
      // On macOS /var is symlink to /private/var, so pwd may return realpath
      const pwdPath = result.stdout.trim();
      expect(pwdPath === subDir || pwdPath === realpathSync(subDir)).toBe(true);
      expect(shell.getCwd()).toBe(subDir);
    });

    it('should not update cwd on failed cd', async () => {
      const shell = createPersistentShell({ initialCwd: tempDir });
      const result = await shell.exec('cd /nonexistent_dir_xyz');
      expect(result.exitCode).not.toBe(0);
      expect(shell.getCwd()).toBe(tempDir);
    });

    it('should handle cd ..', async () => {
      const shell = createPersistentShell({ initialCwd: subDir });
      await shell.exec('cd ..');
      expect(shell.getCwd()).toBe(tempDir);
    });
  });

  describe('env accumulation', () => {
    it('should accumulate exported env vars', async () => {
      const shell = createPersistentShell({ initialCwd: tempDir });
      await shell.exec('export TEST_VAR=hello_world');
      expect(shell.getEnv().TEST_VAR).toBe('hello_world');
    });

    it('should persist env across calls', async () => {
      const shell = createPersistentShell({ initialCwd: tempDir });
      await shell.exec('export FOO=bar');
      const result = await shell.exec('echo $FOO');
      expect(result.stdout.trim()).toBe('bar');
    });

    it('should accumulate multiple env vars', async () => {
      const shell = createPersistentShell({ initialCwd: tempDir });
      await shell.exec('export A=1');
      await shell.exec('export B=2');
      const env = shell.getEnv();
      expect(env.A).toBe('1');
      expect(env.B).toBe('2');
    });

    it('should handle quoted env values', async () => {
      const shell = createPersistentShell({ initialCwd: tempDir });
      await shell.exec('export QUOTED="hello world"');
      expect(shell.getEnv().QUOTED).toBe('hello world');
    });

    it('should unset env vars', async () => {
      const shell = createPersistentShell({ initialCwd: tempDir });
      await shell.exec('export TO_REMOVE=value');
      expect(shell.getEnv().TO_REMOVE).toBe('value');
      await shell.exec('unset TO_REMOVE');
      expect(shell.getEnv().TO_REMOVE).toBeUndefined();
    });

    it('should support setEnv and unsetEnv methods', () => {
      const shell = createPersistentShell({ initialCwd: tempDir });
      shell.setEnv('MANUAL', 'test');
      expect(shell.getEnv().MANUAL).toBe('test');
      shell.unsetEnv('MANUAL');
      expect(shell.getEnv().MANUAL).toBeUndefined();
    });
  });

  describe('persistence across calls', () => {
    it('should maintain state across sequential execs', async () => {
      const shell = createPersistentShell({ initialCwd: tempDir });
      await shell.exec('export PERSIST=123');
      await shell.exec(`cd ${subDir}`);
      const result = await shell.exec('echo $PERSIST && pwd');
      expect(result.stdout).toContain('123');
      expect(result.stdout).toContain(subDir);
      expect(shell.getCwd()).toBe(subDir);
      expect(shell.getEnv().PERSIST).toBe('123');
    });

    it('should return cwd and env in exec result', async () => {
      const shell = createPersistentShell({ initialCwd: tempDir });
      await shell.exec('export RESULT_TEST=yes');
      const result = await shell.exec('echo hi');
      expect(result.cwd).toBe(tempDir);
      expect(result.env.RESULT_TEST).toBe('yes');
    });
  });

  describe('reset', () => {
    it('should reset cwd and env to initial state', async () => {
      const shell = createPersistentShell({
        initialCwd: tempDir,
        initialEnv: { INIT: 'value' }
      });
      await shell.exec(`cd ${subDir}`);
      await shell.exec('export EXTRA=added');
      expect(shell.getCwd()).toBe(subDir);
      expect(shell.getEnv().EXTRA).toBe('added');

      shell.reset();
      expect(shell.getCwd()).toBe(tempDir);
      expect(shell.getEnv().EXTRA).toBeUndefined();
      expect(shell.getEnv().INIT).toBe('value');
    });
  });

  describe('isolation', () => {
    it('should isolate shells by agentId via manager', async () => {
      const manager = createPersistentShellManager();
      const shellA = manager.getOrCreate('agent-a', { initialCwd: tempDir });
      const shellB = manager.getOrCreate('agent-b', { initialCwd: tempDir });

      await shellA.exec('export AGENT=aaa');
      await shellB.exec('export AGENT=bbb');

      expect(shellA.getEnv().AGENT).toBe('aaa');
      expect(shellB.getEnv().AGENT).toBe('bbb');
    });

    it('should return same shell for same agentId', () => {
      const manager = createPersistentShellManager();
      const shell1 = manager.getOrCreate('agent-1');
      const shell2 = manager.getOrCreate('agent-1');
      expect(shell1).toBe(shell2);
    });

    it('should cleanup on destroy', () => {
      const manager = createPersistentShellManager();
      manager.getOrCreate('agent-cleanup');
      expect(manager.has('agent-cleanup')).toBe(true);
      manager.destroy('agent-cleanup');
      expect(manager.has('agent-cleanup')).toBe(false);
    });

    it('should cleanup all on destroyAll', () => {
      const manager = createPersistentShellManager();
      manager.getOrCreate('a1');
      manager.getOrCreate('a2');
      expect(manager.size()).toBe(2);
      manager.destroyAll();
      expect(manager.size()).toBe(0);
    });

    it('should handle dispose preventing further exec', async () => {
      const shell = createPersistentShell({ initialCwd: tempDir });
      shell.dispose();
      await expect(shell.exec('echo hi')).rejects.toThrow(/disposed/);
    });
  });

  describe('integration: sequential cd && env export visible in next command', () => {
    it('should demonstrate integration scenario from acceptance criteria', async () => {
      const shell = createPersistentShell({ initialCwd: tempDir });

      let result = await shell.exec(`cd ${subDir}`);
      expect(result.exitCode).toBe(0);
      expect(shell.getCwd()).toBe(subDir);

      result = await shell.exec('export INTEGRATION_TEST=success');
      expect(result.exitCode).toBe(0);

      result = await shell.exec('echo $INTEGRATION_TEST');
      expect(result.stdout.trim()).toBe('success');
      expect(shell.getCwd()).toBe(subDir);
      expect(shell.getEnv().INTEGRATION_TEST).toBe('success');

      result = await shell.exec('pwd && echo $INTEGRATION_TEST');
      const firstLine = result.stdout.trim().split('\n')[0]?.trim() ?? '';
      const isExpectedPath = firstLine === subDir || firstLine === realpathSync(subDir);
      expect(isExpectedPath).toBe(true);
      expect(result.stdout).toContain('success');
    });
  });

  describe('default manager singleton', () => {
    it('should provide singleton manager', () => {
      const m1 = getDefaultShellManager();
      const m2 = getDefaultShellManager();
      expect(m1).toBe(m2);
      resetDefaultShellManager();
      const m3 = getDefaultShellManager();
      expect(m3).not.toBe(m1);
    });
  });

  describe('command isolation', () => {
    it('should isolate command failures without corrupting shell state', async () => {
      const shell = createPersistentShell({ initialCwd: tempDir });
      await shell.exec('export SAFE=keep');
      const failResult = await shell.exec('false');
      expect(failResult.exitCode).not.toBe(0);
      expect(shell.getEnv().SAFE).toBe('keep');
      const okResult = await shell.exec('echo $SAFE');
      expect(okResult.stdout.trim()).toBe('keep');
    });

    it('should handle timeout option', async () => {
      const shell = createPersistentShell({ initialCwd: tempDir });
      const result = await shell.exec('echo quick', { timeout: 5000 });
      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe('quick');
    });
  });
});
