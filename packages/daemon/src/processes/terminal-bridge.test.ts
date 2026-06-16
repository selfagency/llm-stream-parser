import { describe, expect, it, vi } from 'vitest';
import { createMockLogger } from '../test-utils.js';
import { TerminalBridge } from './terminal-bridge.js';

describe('TerminalBridge', () => {
  it('should create a terminal via subprocess manager', async () => {
    const mockSpawn = vi.fn().mockResolvedValue('proc_123');
    const bridge = new TerminalBridge({
      subprocessManager: { spawnProcess: mockSpawn } as never,
      logger: createMockLogger()
    });
    const id = await bridge.createTerminal('bash', ['-c', 'echo hi'], '/tmp');
    expect(mockSpawn).toHaveBeenCalledWith({
      command: 'bash',
      args: ['-c', 'echo hi'],
      cwd: '/tmp',
      autoRestart: false
    });
    expect(id).toBe('proc_123');
  });

  it('should create terminal without optional args', async () => {
    const mockSpawn = vi.fn().mockResolvedValue('proc_456');
    const bridge = new TerminalBridge({
      subprocessManager: { spawnProcess: mockSpawn } as never,
      logger: createMockLogger()
    });
    await bridge.createTerminal('echo');
    expect(mockSpawn).toHaveBeenCalledWith({
      command: 'echo',
      autoRestart: false
    });
  });

  it('should log on writeInput', async () => {
    const logger = createMockLogger({ debug: vi.fn() });
    const bridge = new TerminalBridge({
      subprocessManager: {} as never,
      logger
    });
    await bridge.writeInput('proc_1', 'input text');
    expect(logger.debug).toHaveBeenCalledWith('writeInput not yet implemented');
  });

  it('should log on resizeTerminal', async () => {
    const logger = createMockLogger({ debug: vi.fn() });
    const bridge = new TerminalBridge({
      subprocessManager: {} as never,
      logger
    });
    await bridge.resizeTerminal('proc_1', 80, 24);
    expect(logger.debug).toHaveBeenCalledWith('resizeTerminal not yet implemented');
  });
});
