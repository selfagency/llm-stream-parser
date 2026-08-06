import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createPersistentShell,
  createPersistentShellManager,
  createShellTool,
  getDefaultShellManager,
  resetDefaultShellManager
} from './index.js';

describe('tools/shell persistent shell', () => {
  let tempDir: string;
  let subDir: string;

  beforeEach(() => {
    const raw = mkdtempSync(join(tmpdir(), 'agentsy-tools-shell-test-'));
    tempDir = realpathSync(raw);
    subDir = join(tempDir, 'subdir');
    mkdirSync(subDir);
    resetDefaultShellManager();
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    resetDefaultShellManager();
  });

  describe('createPersistentShell', () => {
    it('tracks cwd', async () => {
      const shell = createPersistentShell({ initialCwd: tempDir });
      await shell.exec(`cd ${subDir}`);
      expect(shell.getCwd()).toBe(subDir);
    });

    it('accumulates env', async () => {
      const shell = createPersistentShell({ initialCwd: tempDir });
      await shell.exec('export TOOL_ENV=test_value');
      expect(shell.getEnv().TOOL_ENV).toBe('test_value');
      const result = await shell.exec('echo $TOOL_ENV');
      expect(result.stdout.trim()).toBe('test_value');
    });

    it('reset clears state', async () => {
      const shell = createPersistentShell({ initialCwd: tempDir });
      await shell.exec(`cd ${subDir}`);
      await shell.exec('export EXTRA=1');
      shell.reset();
      expect(shell.getCwd()).toBe(tempDir);
      expect(shell.getEnv().EXTRA).toBeUndefined();
    });
  });

  describe('manager isolation', () => {
    it('isolates per agentId', async () => {
      const manager = createPersistentShellManager();
      const a = manager.getOrCreate('agent-a', { initialCwd: tempDir });
      const b = manager.getOrCreate('agent-b', { initialCwd: tempDir });
      await a.exec('export X=aaa');
      await b.exec('export X=bbb');
      expect(a.getEnv().X).toBe('aaa');
      expect(b.getEnv().X).toBe('bbb');
    });

    it('destroy cleans up', () => {
      const manager = createPersistentShellManager();
      manager.getOrCreate('to-delete');
      expect(manager.has('to-delete')).toBe(true);
      manager.destroy('to-delete');
      expect(manager.has('to-delete')).toBe(false);
    });
  });

  describe('createShellTool uses persistent shell', () => {
    it('persists cwd across tool calls', async () => {
      const manager = createPersistentShellManager();
      const tool = createShellTool({ agentId: 'test-agent', manager });

      let result = await tool.handler({ command: `cd ${subDir}` });
      expect(result.ok).toBe(true);

      result = await tool.handler({ command: 'pwd' });
      expect(result.ok).toBe(true);
      const data = result.data as { stdout: string; cwd: string };
      const out = data.stdout.trim();
      expect(out === subDir || out === realpathSync(subDir)).toBe(true);
      expect(data.cwd).toBe(subDir);
    });

    it('persists env across tool calls', async () => {
      const manager = createPersistentShellManager();
      const tool = createShellTool({ agentId: 'test-agent', manager });

      let result = await tool.handler({ command: 'export PERSISTED=hello' });
      expect(result.ok).toBe(true);

      result = await tool.handler({ command: 'echo $PERSISTED' });
      expect(result.ok).toBe(true);
      const data = result.data as { stdout: string };
      expect(data.stdout.trim()).toBe('hello');
    });

    it('integration: sequential cd && env export visible in next command', async () => {
      const manager = createPersistentShellManager();
      const tool = createShellTool({
        agentId: 'integration-agent',
        manager,
        initialCwd: tempDir
      });

      await tool.handler({ command: `cd ${subDir}` });
      await tool.handler({ command: 'export INTEGRATION=success' });
      const result = await tool.handler({
        command: 'echo $INTEGRATION && pwd'
      });

      expect(result.ok).toBe(true);
      const data = result.data as {
        stdout: string;
        cwd: string;
        exitCode: number;
      };
      expect(data.exitCode).toBe(0);
      // pwd may return /private/var vs /var on macOS
      const containsSubdir = data.stdout.includes(subDir) || data.stdout.includes(realpathSync(subDir));
      expect(containsSubdir).toBe(true);
      expect(data.stdout).toContain('success');
      expect(data.cwd).toBe(subDir);
    });

    it('isolates tool calls per agentId via input', async () => {
      const manager = createPersistentShellManager();
      const tool = createShellTool({ manager });

      await tool.handler({ command: 'export ISOLATED=agent1', agentId: 'a1' });
      await tool.handler({ command: 'export ISOLATED=agent2', agentId: 'a2' });

      const r1 = await tool.handler({
        command: 'echo $ISOLATED',
        agentId: 'a1'
      });
      const r2 = await tool.handler({
        command: 'echo $ISOLATED',
        agentId: 'a2'
      });

      expect((r1.data as { stdout: string }).stdout.trim()).toBe('agent1');
      expect((r2.data as { stdout: string }).stdout.trim()).toBe('agent2');
    });

    it('handles workdir override and updates tracking', async () => {
      const manager = createPersistentShellManager();
      const tool = createShellTool({
        agentId: 'workdir-agent',
        manager,
        initialCwd: tempDir
      });

      const result = await tool.handler({ command: 'pwd', workdir: subDir });
      expect(result.ok).toBe(true);
      const shell = manager.get('workdir-agent');
      expect(shell?.getCwd()).toBe(subDir);
    });
  });

  describe('default manager', () => {
    it('singleton behavior', () => {
      const m1 = getDefaultShellManager();
      const m2 = getDefaultShellManager();
      expect(m1).toBe(m2);
    });
  });
});
