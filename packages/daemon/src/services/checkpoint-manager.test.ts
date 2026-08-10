import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnifiedDB } from '../db/unified-db.js';
import { createMockLogger } from '../test-utils.js';
import {
  type AgentCheckpoint,
  type CheckpointDB,
  type CheckpointMessage,
  type CheckpointMetadata,
  type CheckpointTokenBudget,
  createCheckpointManager
} from './checkpoint-manager.js';

function createTestDB(): UnifiedDB {
  return new UnifiedDB({ path: ':memory:', logger: createMockLogger() });
}

function adaptDB(db: UnifiedDB): CheckpointDB {
  return {
    execute: (sql: string, params?: unknown[]) => db.execute(sql, params ?? []),
    query: (sql: string, params?: unknown[]) => db.query(sql, params ?? []),
    querySingle: <T>(sql: string, params?: unknown[]) => db.querySingle<T>(sql, params ?? [])
  };
}

const sampleMessages: CheckpointMessage[] = [
  { role: 'user', content: 'Hello', timestamp: 1 },
  { role: 'assistant', content: 'Hi there', timestamp: 2 }
];

const sampleBudget: CheckpointTokenBudget = {
  max_tokens_per_session: 10_000,
  max_tokens_per_turn: 1000
};

const sampleMetadata: CheckpointMetadata = {
  turnsCompleted: 3,
  tokensUsed: 450
};

const sampleMemorySnapshot = {
  budget: { utilization: 0.45 },
  tiers: { working_memory: { items: 5 } }
};

describe('CheckpointManager', () => {
  let db: UnifiedDB;
  let checkpointDB: CheckpointDB;

  beforeEach(async () => {
    db = createTestDB();
    await db.open();
    await db.migrate();
    checkpointDB = adaptDB(db);
  });

  it('creates checkpoint with required fields', async () => {
    const manager = createCheckpointManager({ db: checkpointDB });

    await manager.start();

    const checkpoint = await manager.createCheckpoint({
      agentId: 'agent_123',
      name: 'test-checkpoint',
      messageHistory: sampleMessages,
      memorySnapshot: sampleMemorySnapshot,
      tokenBudget: sampleBudget,
      metadata: sampleMetadata
    });

    expect(checkpoint.id).toBeDefined();
    expect(checkpoint.agentId).toBe('agent_123');
    expect(checkpoint.name).toBe('test-checkpoint');
    expect(checkpoint.timestamp).toBeDefined();
    expect(checkpoint.messageHistory).toEqual(sampleMessages);
    expect(checkpoint.memorySnapshot).toEqual(sampleMemorySnapshot);
    expect(checkpoint.tokenBudget).toEqual(sampleBudget);
    expect(checkpoint.metadata.turnsCompleted).toBe(3);
    expect(checkpoint.metadata.tokensUsed).toBe(450);

    await manager.stop();
    await db.close();
  });

  it('persists to UnifiedDB agent_checkpoints table', async () => {
    const manager = createCheckpointManager({ db: checkpointDB });
    await manager.start();

    const created = await manager.createCheckpoint({
      agentId: 'agent_persist',
      name: 'persist-test',
      messageHistory: sampleMessages,
      memorySnapshot: sampleMemorySnapshot,
      tokenBudget: sampleBudget,
      metadata: sampleMetadata
    });

    const row = await db.querySingle<{ data: string; agent_id: string; name: string }>(
      'SELECT data, agent_id, name FROM agent_checkpoints WHERE id = ?',
      [created.id]
    );

    expect(row).not.toBeNull();
    if (!row) {
      throw new Error('Row not found after checkpoint create');
    }
    expect(row.agent_id).toBe('agent_persist');
    expect(row.name).toBe('persist-test');

    const parsed = JSON.parse(row.data) as AgentCheckpoint;
    expect(parsed.id).toBe(created.id);
    expect(parsed.messageHistory).toEqual(sampleMessages);

    await manager.stop();
    await db.close();
  });

  it('restores checkpoint creating new agentId with checkpoint data', async () => {
    let spawnedSpec: Record<string, unknown> | null = null;
    let restoredSnapshot: unknown = null;

    const mockMemory = {
      snapshot: vi.fn().mockReturnValue(sampleMemorySnapshot),
      restoreSnapshot: vi.fn().mockImplementation((snap: unknown) => {
        restoredSnapshot = snap;
      })
    };

    const mockAgentHost = {
      spawn: vi.fn().mockImplementation((spec: Record<string, unknown>) => {
        spawnedSpec = spec;
        const id = (spec as { id: string }).id;
        return Promise.resolve({ spec: { id } });
      })
    };

    const manager = createCheckpointManager({
      db: checkpointDB,
      memory: mockMemory,
      agentHost: mockAgentHost
    });

    await manager.start();

    const original = await manager.createCheckpoint({
      agentId: 'agent_restore',
      name: 'restore-point',
      messageHistory: sampleMessages,
      memorySnapshot: sampleMemorySnapshot,
      tokenBudget: sampleBudget,
      metadata: sampleMetadata
    });

    const result = await manager.restoreCheckpoint(original.id);

    expect(result.newAgentId).toContain('agent_restore_restored_');
    expect(result.checkpoint.id).toBe(original.id);
    expect(result.checkpoint.agentId).toBe('agent_restore');
    expect(result.checkpoint.messageHistory).toEqual(sampleMessages);

    expect(mockMemory.restoreSnapshot).toHaveBeenCalledWith(sampleMemorySnapshot);
    expect(restoredSnapshot).toEqual(sampleMemorySnapshot);

    expect(mockAgentHost.spawn).toHaveBeenCalled();
    expect(spawnedSpec).not.toBeNull();
    if (!spawnedSpec) {
      throw new Error('spawnedSpec should be set after restore');
    }
    const specId = (spawnedSpec as { id: unknown }).id;
    const specCheckpointId = (spawnedSpec as { checkpointId: unknown }).checkpointId;
    expect(specId).toBe(result.newAgentId);
    expect(specCheckpointId).toBe(original.id);

    await manager.stop();
    await db.close();
  });

  it('throws descriptive error when checkpoint not found', async () => {
    const manager = createCheckpointManager({ db: checkpointDB });
    await manager.start();

    await expect(manager.restoreCheckpoint('nonexistent-id')).rejects.toThrow('Checkpoint "nonexistent-id" not found');

    const fetched = await manager.getCheckpoint('nonexistent-id');
    expect(fetched).toBeNull();

    await manager.stop();
    await db.close();
  });

  it('handles memory snapshot integration via dependency injection', async () => {
    const mockMemory = {
      snapshot: vi.fn().mockReturnValue({ custom: 'snap' }),
      restoreSnapshot: vi.fn()
    };

    const manager = createCheckpointManager({
      db: checkpointDB,
      memory: mockMemory,
      idGenerator: () => 'fixed-id-123',
      timestampGenerator: () => '2026-07-29T10:00:00.000Z'
    });

    await manager.start();

    const checkpoint = await manager.createCheckpoint({
      agentId: 'agent_memory_test',
      name: 'memory-snapshot-test',
      messageHistory: sampleMessages
    });

    expect(mockMemory.snapshot).toHaveBeenCalled();
    expect(checkpoint.memorySnapshot).toEqual({ custom: 'snap' });
    expect(checkpoint.id).toBe('fixed-id-123');
    expect(checkpoint.timestamp).toBe('2026-07-29T10:00:00.000Z');

    await manager.restoreCheckpoint('fixed-id-123');
    expect(mockMemory.restoreSnapshot).toHaveBeenCalledWith({ custom: 'snap' });

    await manager.stop();
    await db.close();
  });

  it('validates required fields', async () => {
    const manager = createCheckpointManager({ db: checkpointDB });
    await manager.start();

    await expect(
      manager.createCheckpoint({
        agentId: '',
        name: 'test'
      })
    ).rejects.toThrow('Invalid agentId');

    await expect(
      manager.createCheckpoint({
        agentId: 'agent_1',
        name: ''
      })
    ).rejects.toThrow('Invalid checkpoint name');

    await manager.stop();
    await db.close();
  });

  it('listCheckpoints filters by agentId', async () => {
    const manager = createCheckpointManager({ db: checkpointDB });
    await manager.start();

    await manager.createCheckpoint({
      agentId: 'agent_a',
      name: 'cp1',
      messageHistory: []
    });
    await manager.createCheckpoint({
      agentId: 'agent_a',
      name: 'cp2',
      messageHistory: []
    });
    await manager.createCheckpoint({
      agentId: 'agent_b',
      name: 'cp3',
      messageHistory: []
    });

    const agentACheckpoints = await manager.listCheckpoints('agent_a');
    expect(agentACheckpoints).toHaveLength(2);
    expect(agentACheckpoints.every(c => c.agentId === 'agent_a')).toBe(true);

    const all = await manager.listCheckpoints();
    expect(all).toHaveLength(3);

    await manager.stop();
    await db.close();
  });

  it('deleteCheckpoint removes persisted row', async () => {
    const manager = createCheckpointManager({ db: checkpointDB });
    await manager.start();

    const cp = await manager.createCheckpoint({
      agentId: 'agent_del',
      name: 'to-delete',
      messageHistory: []
    });

    let fetched = await manager.getCheckpoint(cp.id);
    expect(fetched).not.toBeNull();

    await manager.deleteCheckpoint(cp.id);

    fetched = await manager.getCheckpoint(cp.id);
    expect(fetched).toBeNull();

    await manager.stop();
    await db.close();
  });

  it('integration: checkpoint create -> restore -> agent resumes with same history', async () => {
    const db2 = createTestDB();
    await db2.open();
    await db2.migrate();
    const cdb2 = adaptDB(db2);

    const memoryState = {
      budget: { utilization: 0.2 },
      schedulerRunning: false,
      tiers: {
        long_term_memory: { items: 10, usedTokens: 500, maxTokens: 5000 },
        working_memory: { items: 2, usedTokens: 100, maxTokens: 1000 }
      }
    };

    const mockMemory = {
      snapshot: vi.fn().mockReturnValue(memoryState),
      restoreSnapshot: vi.fn()
    };

    const spawnedAgents: Record<string, unknown>[] = [];
    const mockAgentHost = {
      getAgent: (agentId: string) => {
        if (agentId === 'agent_integ') {
          return {
            messages: sampleMessages,
            budget: sampleBudget,
            turnsCompleted: 5,
            tokensUsed: 1200
          };
        }
        return null;
      },
      spawn: vi.fn().mockImplementation((spec: Record<string, unknown>) => {
        spawnedAgents.push(spec);
        const sid = (spec as { id: string }).id;
        return Promise.resolve({ spec: { id: sid } });
      })
    };

    const manager = createCheckpointManager({
      db: cdb2,
      memory: mockMemory,
      agentHost: mockAgentHost
    });

    await manager.start();

    const checkpoint = await manager.createCheckpoint({
      agentId: 'agent_integ',
      name: 'integration-checkpoint'
    });

    expect(checkpoint.messageHistory).toEqual(sampleMessages);
    expect(checkpoint.tokenBudget).toEqual(sampleBudget);
    expect(checkpoint.metadata.turnsCompleted).toBe(5);
    expect(checkpoint.metadata.tokensUsed).toBe(1200);
    expect(checkpoint.memorySnapshot).toEqual(memoryState);

    const { newAgentId, checkpoint: restoredCheckpoint } = await manager.restoreCheckpoint(checkpoint.id);

    expect(restoredCheckpoint.messageHistory).toEqual(checkpoint.messageHistory);
    expect(restoredCheckpoint.memorySnapshot).toEqual(checkpoint.memorySnapshot);
    expect(restoredCheckpoint.tokenBudget).toEqual(checkpoint.tokenBudget);
    expect(restoredCheckpoint.metadata).toEqual(checkpoint.metadata);

    expect(newAgentId).not.toBe('agent_integ');
    expect(spawnedAgents).toHaveLength(1);
    const spawned = spawnedAgents[0];
    if (!spawned) {
      throw new Error('No spawned agent found');
    }
    const spawnedMessages = (spawned as { messages: unknown }).messages;
    const spawnedBudget = (spawned as { tokenBudget: unknown }).tokenBudget;
    expect(spawnedMessages).toEqual(sampleMessages);
    expect(spawnedBudget).toEqual(sampleBudget);

    expect(mockMemory.restoreSnapshot).toHaveBeenCalledWith(memoryState);

    const manager2 = createCheckpointManager({
      db: cdb2,
      memory: mockMemory,
      agentHost: mockAgentHost
    });
    await manager2.start();
    const persisted = await manager2.getCheckpoint(checkpoint.id);
    expect(persisted).not.toBeNull();
    if (!persisted) {
      throw new Error('Persisted checkpoint not found');
    }
    expect(persisted.id).toBe(checkpoint.id);
    expect(persisted.messageHistory).toEqual(sampleMessages);

    await manager.stop();
    await manager2.stop();
    await db2.close();
  });
});
