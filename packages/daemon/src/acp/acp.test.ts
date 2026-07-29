/**
 * ACP Phase 18 capabilities tests
 * @module
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACPEventLedger } from '../services/acp-event-ledger.js';
import { createMockLogger } from '../test-utils.js';
import { AGENT_CAPABILITIES } from './acp-capabilities.js';
import {
  createASRPipelineStub,
  forwardImagesToVisionModel,
  isAudioBlock,
  isImageBlock,
  parsePromptContent,
  validateAudioBlock,
  validateCapabilitiesAdvertisement,
  validateImageBlock
} from './capabilities.js';
import { ACPMCPManager } from './mcp-manager.js';
import { ACPSessionPersistence } from './session-persistence.js';

// ── Helpers ──────────────────────────────────────────────

function createMockSubprocessManager() {
  const spawned: Array<{ id: string; args?: string[]; command: string }> = [];
  return {
    spawned,
    spawnProcess: vi.fn(async (spec: { id: string; args?: string[]; command: string }) => {
      await Promise.resolve();
      const entry: { id: string; args?: string[]; command: string } = {
        id: spec.id,
        command: spec.command
      };
      if (spec.args) {
        entry.args = spec.args;
      }
      spawned.push(entry);
      return spec.id;
    }),
    listProcesses: vi.fn(() => spawned.map(s => ({ id: s.id, status: 'running' as const, exitCode: null }))),
    killProcess: vi.fn(() => true),
    getOutput: vi.fn(() => ({ stdout: [], stderr: [] }))
  };
}

function base64Png(): string {
  return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
}

function base64Wav(): string {
  return Buffer.from('RIFF****WAVE').toString('base64');
}

// ── Capability advertisement ────────────────────────────

describe('AGENT_CAPABILITIES Phase 18', () => {
  it('advertises image:true and audio:true', () => {
    expect(AGENT_CAPABILITIES.promptCapabilities.image).toBe(true);
    expect(AGENT_CAPABILITIES.promptCapabilities.audio).toBe(true);
  });

  it('advertises mcpCapabilities http:true sse:true', () => {
    expect(AGENT_CAPABILITIES.mcpCapabilities.http).toBe(true);
    expect(AGENT_CAPABILITIES.mcpCapabilities.sse).toBe(true);
  });

  it('validateCapabilitiesAdvertisement returns valid', () => {
    const result = validateCapabilitiesAdvertisement();
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });
});

// ── Image capability ───────────────────────────────────

describe('Image capability', () => {
  it('isImageBlock type guard', () => {
    expect(isImageBlock({ type: 'image', data: 'abc', mimeType: 'image/png' })).toBe(true);
    expect(isImageBlock({ type: 'text', text: 'hi' })).toBe(false);
  });

  it('validateImageBlock rejects unsupported mime', () => {
    const block = { type: 'image' as const, data: base64Png(), mimeType: 'image/xyz' };
    const res = validateImageBlock(block);
    expect(res.valid).toBe(false);
  });

  it('validateImageBlock accepts valid png', () => {
    const block = { type: 'image' as const, data: base64Png(), mimeType: 'image/png' };
    const res = validateImageBlock(block);
    expect(res.valid).toBe(true);
  });

  it('parsePromptContent extracts base64 images from array', () => {
    const parsed = parsePromptContent([
      { type: 'text', text: 'look at this' },
      { type: 'image', data: base64Png(), mimeType: 'image/png' }
    ]);
    expect(parsed.text).toContain('look at this');
    expect(parsed.images).toHaveLength(1);
    expect(parsed.images[0]?.mimeType).toBe('image/png');
  });

  it('forwardImagesToVisionModel creates image_url content', () => {
    const parsed = parsePromptContent([
      { type: 'text', text: 'describe image' },
      { type: 'image', data: base64Png(), mimeType: 'image/png' }
    ]);
    const forwarded = forwardImagesToVisionModel(parsed);
    expect(forwarded.hasImages).toBe(true);
    expect(forwarded.content.some(c => c.type === 'image_url')).toBe(true);
    const imgContent = forwarded.content.find(c => c.type === 'image_url');
    expect(imgContent?.image_url?.url).toContain('data:image/png;base64,');
  });

  it('parsePromptContent handles data URL prefix stripping', () => {
    const dataUrl = `data:image/png;base64,${base64Png()}`;
    const parsed = parsePromptContent([{ type: 'image', data: dataUrl, mimeType: 'image/png' }]);
    expect(parsed.images).toHaveLength(1);
  });
});

// ── Audio capability ───────────────────────────────────

describe('Audio capability', () => {
  it('isAudioBlock type guard', () => {
    expect(isAudioBlock({ type: 'audio', data: 'abc', mimeType: 'audio/wav' })).toBe(true);
    expect(isAudioBlock({ type: 'image', data: 'abc', mimeType: 'image/png' })).toBe(false);
  });

  it('validateAudioBlock accepts wav', () => {
    const block = { type: 'audio' as const, data: base64Wav(), mimeType: 'audio/wav' };
    expect(validateAudioBlock(block).valid).toBe(true);
  });

  it('validateAudioBlock rejects unsupported mime', () => {
    const block = { type: 'audio' as const, data: base64Wav(), mimeType: 'audio/xyz' };
    expect(validateAudioBlock(block).valid).toBe(false);
  });

  it('ASR pipeline stub returns transcript if provided', async () => {
    const stub = createASRPipelineStub();
    const block = {
      type: 'audio' as const,
      data: base64Wav(),
      mimeType: 'audio/wav',
      transcript: 'hello world'
    };
    const res = await stub.transcribe(block);
    expect(res.text).toBe('hello world');
    expect(res.confidence).toBe(1);
  });

  it('ASR pipeline stub returns pending marker if no transcript', async () => {
    const stub = createASRPipelineStub();
    const block = { type: 'audio' as const, data: base64Wav(), mimeType: 'audio/wav' };
    const res = await stub.transcribe(block);
    expect(res.text).toContain('transcription pending');
  });

  it('parsePromptContent extracts audio and includes in parsed', () => {
    const parsed = parsePromptContent([
      { type: 'text', text: 'transcribe this' },
      { type: 'audio', data: base64Wav(), mimeType: 'audio/wav', transcript: 'test' }
    ]);
    expect(parsed.audios).toHaveLength(1);
    expect(parsed.text).toContain('transcribe this');
  });
});

// ── MCP manager ────────────────────────────────────────

describe('ACPMCPManager', () => {
  it('spawns stdio MCP servers via SubprocessManager', async () => {
    const mockSM = createMockSubprocessManager();
    const logger = createMockLogger();
    const manager = new ACPMCPManager({ logger, subprocessManager: mockSM as never });

    const result = await manager.startServers('sess-1', {
      filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'] },
      brave: { command: 'node', args: ['brave.js'], env: { API_KEY: 'test' } }
    });

    expect(result.started).toHaveLength(2);
    expect(result.failed).toHaveLength(0);
    expect(mockSM.spawnProcess).toHaveBeenCalledTimes(2);
    expect(mockSM.spawned[0]?.id).toBe('acp-mcp-sess-1-filesystem');
    expect(mockSM.spawned[1]?.id).toBe('acp-mcp-sess-1-brave');
  });

  it('registers http/sse servers without spawning when url only', async () => {
    const mockSM = createMockSubprocessManager();
    const logger = createMockLogger();
    const manager = new ACPMCPManager({ logger, subprocessManager: mockSM as never });

    const result = await manager.startServers('sess-2', {
      remote: { type: 'http', url: 'https://example.com/mcp' } as never,
      sseRemote: { type: 'sse', url: 'https://example.com/sse' } as never
    });

    expect(result.started).toHaveLength(2);
    expect(mockSM.spawnProcess).not.toHaveBeenCalled();
    expect(result.started[0]?.processId.startsWith('config-')).toBe(true);
  });

  it('reports failed validation for invalid definitions', async () => {
    const mockSM = createMockSubprocessManager();
    const logger = createMockLogger({ warn: vi.fn() });
    const manager = new ACPMCPManager({ logger, subprocessManager: mockSM as never });

    const result = await manager.startServers('sess-3', {
      bad: { type: 'stdio' } as never,
      alsoBad: { type: 'http', url: 'not-a-url' } as never
    });

    expect(result.started).toHaveLength(0);
    expect(result.failed).toHaveLength(2);
  });

  it('stopServers kills tracked processes', async () => {
    const mockSM = createMockSubprocessManager();
    const logger = createMockLogger();
    const manager = new ACPMCPManager({ logger, subprocessManager: mockSM as never });

    await manager.startServers('sess-4', {
      test: { command: 'echo', args: ['hi'] }
    });
    expect(manager.count()).toBe(1);

    const stopped = manager.stopServers('sess-4');
    expect(stopped).toBe(1);
    expect(manager.count()).toBe(0);
    expect(mockSM.killProcess).toHaveBeenCalledWith('acp-mcp-sess-4-test');
  });

  it('listServers returns per-session and all', async () => {
    const mockSM = createMockSubprocessManager();
    const logger = createMockLogger();
    const manager = new ACPMCPManager({ logger, subprocessManager: mockSM as never });

    await manager.startServers('s1', { a: { command: 'echo' } });
    await manager.startServers('s2', { b: { command: 'echo' } });

    expect(manager.listServers('s1')).toHaveLength(1);
    expect(manager.listServers()).toHaveLength(2);
  });
});

// ── Session persistence ─────────────────────────────────

describe('ACPSessionPersistence', () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'acp-test-'));
    dbPath = join(dir, 'acp.db');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('saves and loads session', () => {
    const logger = createMockLogger();
    const persistence = new ACPSessionPersistence(dbPath, logger);

    const rec = persistence.saveSession({
      sessionId: 'sess-persist-1',
      cwd: '/tmp/project',
      additionalDirectories: ['/tmp/shared'],
      mode: 'code',
      mcpServers: { fs: { command: 'npx' } as never }
    });

    expect(rec.sessionId).toBe('sess-persist-1');

    const loaded = persistence.loadSession('sess-persist-1');
    expect(loaded).not.toBeNull();
    expect(loaded?.cwd).toBe('/tmp/project');
    expect(loaded?.additionalDirectories).toEqual(['/tmp/shared']);

    persistence.close();
  });

  it('lists sessions ordered by last_active', () => {
    const logger = createMockLogger();
    const persistence = new ACPSessionPersistence(dbPath, logger);

    persistence.saveSession({ sessionId: 's1', cwd: '/tmp/a' });
    persistence.saveSession({ sessionId: 's2', cwd: '/tmp/b' });

    const list = persistence.listSessions();
    expect(list).toHaveLength(2);

    persistence.close();
  });

  it('survives daemon restart via SQLite replay (same file)', () => {
    const logger = createMockLogger();
    const p1 = new ACPSessionPersistence(dbPath, logger);
    p1.saveSession({ sessionId: 'restart-sess', cwd: '/project', mode: 'code' });
    p1.saveSession({ sessionId: 'restart-sess-2', cwd: '/project2' });
    p1.close();

    const p2 = new ACPSessionPersistence(dbPath, logger);
    const restored = p2.restoreOnStartup();
    expect(restored.length).toBe(2);
    expect(restored.map(r => r.sessionId)).toContain('restart-sess');

    const loaded = p2.loadSession('restart-sess');
    expect(loaded?.cwd).toBe('/project');

    const state = p2.loadPersistedState('restart-sess');
    expect(state).not.toBeNull();
    expect(state?.record.sessionId).toBe('restart-sess');

    const resumed = p2.resumeSession('restart-sess');
    expect(resumed).not.toBeNull();
    expect(resumed?.record.sessionId).toBe('restart-sess');

    p2.close();
  });

  it('deletes sessions', () => {
    const logger = createMockLogger();
    const p = new ACPSessionPersistence(dbPath, logger);
    p.saveSession({ sessionId: 'del-1', cwd: '/tmp' });
    expect(p.listSessions()).toHaveLength(1);
    const deleted = p.deleteSession('del-1');
    expect(deleted).toBe(true);
    expect(p.listSessions()).toHaveLength(0);
    p.close();
  });

  it(' integrates with ledger to provide materialized views', () => {
    const logger = createMockLogger();
    const ledgerDbPath = join(dir, 'ledger.db');
    const ledger = new ACPEventLedger(ledgerDbPath, logger);
    const persistence = new ACPSessionPersistence(dbPath, logger, ledger);

    persistence.saveSession({ sessionId: 'with-ledger', cwd: '/tmp' });
    ledger.record('with-ledger', 'session.prompt', { prompt: 'hello' });
    ledger.record('with-ledger', 'stream.end', { content: 'world' });

    const state = persistence.loadPersistedState('with-ledger');
    expect(state).not.toBeNull();
    expect(state?.events.length).toBeGreaterThanOrEqual(2);
    expect(state?.materializedViews.conversation.length).toBeGreaterThanOrEqual(1);

    persistence.close();
    ledger.close();
  });
});

// ── Integration ────────────────────────────────────────

describe('Integration: session/new with image + mcpServers', () => {
  let dir: string;
  let dbPath: string;
  let ledgerPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'acp-int-'));
    dbPath = join(dir, 'acp.db');
    ledgerPath = join(dir, 'ledger.db');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('full flow: new + image prompt + mcpServers + restart + load', async () => {
    const logger = createMockLogger();
    const ledger = new ACPEventLedger(ledgerPath, logger);
    const persistence = new ACPSessionPersistence(dbPath, logger, ledger);
    const mockSM = createMockSubprocessManager();
    const mcpManager = new ACPMCPManager({ logger, subprocessManager: mockSM as never });

    const sessionId = 'int-sess-1';
    const mcpServers = {
      fs: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'] }
    };

    const mcpResult = await mcpManager.startServers(sessionId, mcpServers as never);
    expect(mcpResult.started).toHaveLength(1);

    persistence.saveSession({
      sessionId,
      cwd: '/project',
      additionalDirectories: [],
      mcpServers: mcpServers as never,
      mode: 'code'
    });

    const imageBlock = { type: 'image' as const, data: base64Png(), mimeType: 'image/png' };
    const parsed2 = parsePromptContent([{ type: 'text', text: 'what is in this image?' }, imageBlock]);
    expect(parsed2.images).toHaveLength(1);

    ledger.record(sessionId, 'session.prompt', { prompt: 'what is in this image?', hasImage: true });
    ledger.record(sessionId, 'stream.end', { content: 'It is a 1x1 pixel' });

    persistence.close();
    ledger.close();

    const ledger2 = new ACPEventLedger(ledgerPath, logger);
    const persistence2 = new ACPSessionPersistence(dbPath, logger, ledger2);

    const restored = persistence2.restoreOnStartup();
    expect(restored.some(r => r.sessionId === sessionId)).toBe(true);

    const loadedState = persistence2.loadPersistedState(sessionId);
    expect(loadedState).not.toBeNull();
    expect(loadedState?.record.mcpServers).toBeDefined();
    expect(loadedState?.events.length).toBeGreaterThan(0);
    expect(loadedState?.materializedViews.conversation.length).toBeGreaterThan(0);

    const resumed = persistence2.resumeSession(sessionId);
    expect(resumed).not.toBeNull();
    expect(resumed?.record.sessionId).toBe(sessionId);

    persistence2.close();
    ledger2.close();
  });
});
