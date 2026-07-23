import { describe, expect, it } from 'vitest';
import { CodeChangeScanner, FileModificationScanner } from './code-change-scanner.js';

describe('CodeChangeScanner', () => {
  it('passes safe change operations', async () => {
    const scanner = new CodeChangeScanner();
    const result = await scanner.evaluate('write a new function', { toolName: 'edit' });
    expect(result.status).toBe('pass');
  });

  it('blocks destructive commands', async () => {
    const scanner = new CodeChangeScanner();
    const result = await scanner.evaluate('rm -rf /important/data', { toolName: 'execute_shell' });
    expect(result.status).toBe('block');
  });

  it('blocks writes to protected config files', async () => {
    const scanner = new CodeChangeScanner();
    const result = await scanner.evaluate('write config', {
      toolName: 'write_file',
      args: { filePath: '/app/.env.local' }
    });
    expect(result.status).toBe('block');
  });

  it('flags overwrite operations as medium', async () => {
    const scanner = new CodeChangeScanner();
    const result = await scanner.evaluate('cp /source /dest', {
      toolName: 'execute_shell'
    });
    expect(result.status).toBe('pass');
    const detections = (result as Record<string, unknown>).detections as { id: string }[];
    expect(detections?.some(d => d.id === 'cc-overwrite-operation')).toBe(true);
  });

  it('returns detections on protected file write', async () => {
    const scanner = new CodeChangeScanner();
    const result = await scanner.evaluate('write config', {
      toolName: 'write_file',
      args: { filePath: '/app/secrets/credentials.json' }
    });
    expect(result.status).toBe('block');
  });

  it('respects custom protected files config', async () => {
    const scanner = new CodeChangeScanner({ protectedFiles: ['special-config.yaml'] });
    const result = await scanner.evaluate('write config', {
      toolName: 'write_file',
      args: { filePath: 'special-config.yaml' }
    });
    expect(result.status).toBe('block');
  });
});

describe('FileModificationScanner', () => {
  it('passes safe file modifications', async () => {
    const scanner = new FileModificationScanner();
    const result = await scanner.evaluate('edit file', {
      toolName: 'edit_file',
      args: { filePath: '/app/src/main.ts' }
    });
    expect(result.status).toBe('pass');
  });

  it('blocks modifications in sensitive directories', async () => {
    const scanner = new FileModificationScanner();
    const result = await scanner.evaluate('edit config', {
      toolName: 'write_file',
      args: { filePath: '/etc/ssh/sshd_config' }
    });
    expect(result.status).toBe('block');
  });

  it('flags risky file extensions', async () => {
    const scanner = new FileModificationScanner();
    const result = await scanner.evaluate('write pem', {
      toolName: 'write_file',
      args: { filePath: '/app/certs/private.pem' }
    });
    expect(result.status).not.toBe('block');
    const detections = (result as Record<string, unknown>).detections as { id: string }[];
    expect(detections?.some(d => d.id === 'fm-risky-extension')).toBe(true);
  });

  it('flags glob patterns in file paths', async () => {
    const scanner = new FileModificationScanner();
    const result = await scanner.evaluate('delete files', {
      toolName: 'execute_shell',
      args: { filePath: '/tmp/**/*.tmp' }
    });
    const detections = (result as Record<string, unknown>).detections as { id: string }[];
    expect(detections?.some(d => d.id === 'fm-glob-deletion')).toBe(true);
  });

  it('passes when no file path is provided', async () => {
    const scanner = new FileModificationScanner();
    const result = await scanner.evaluate('just a message', { toolName: 'chat' });
    expect(result.status).toBe('pass');
  });
});
