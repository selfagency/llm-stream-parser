import { describe, expect, it } from 'vitest';
import { createMockLogger } from '../test-utils.js';
import { UnifiedDB } from './unified-db.js';

function createTestDB(path = ':memory:'): UnifiedDB {
  return new UnifiedDB({ path, logger: createMockLogger() });
}

describe('UnifiedDB', () => {
  it('should open and close', async () => {
    const db = createTestDB();
    expect(db.isOpen).toBe(false);
    await db.open();
    expect(db.isOpen).toBe(true);
    expect(db.mode).toBe('fallback');
    await db.close();
    expect(db.isOpen).toBe(false);
  });

  it('should run migrations', async () => {
    const db = createTestDB();
    await db.open();
    await expect(db.migrate()).resolves.toBeUndefined();
    await db.close();
  });

  it('should be idempotent on repeated migrations', async () => {
    const db = createTestDB();
    await db.open();
    await db.migrate();
    await expect(db.migrate()).resolves.toBeUndefined();
    await db.close();
  });

  it('should create and use queues', async () => {
    const db = createTestDB();
    await db.open();
    const q = db.queue('test');
    expect(q).toBeDefined();
    expect(typeof q.enqueue).toBe('function');
    expect(typeof q.claimOne).toBe('function');
    await db.close();
  });

  it('should enqueue and claim jobs', async () => {
    const db = createTestDB();
    await db.open();
    const q = db.queue('test');
    const id = q.enqueue({ task: 'hello' });
    expect(id).toMatch(/^job_\d+$/);

    const job = q.claimOne('worker1');
    expect(job).not.toBeNull();
    await db.close();
  });

  it('should create and use streams', async () => {
    const db = createTestDB();
    await db.open();
    const s = db.stream('events');
    expect(s).toBeDefined();
    expect(typeof s.append).toBe('function');
    expect(typeof s.read).toBe('function');
    await db.close();
  });

  it('should append and read from streams', async () => {
    const db = createTestDB();
    await db.open();
    const s = db.stream('events');
    s.append({ event: 'a' });
    s.append({ event: 'b' });

    const items = await s.read('consumer1');
    expect(items).toHaveLength(2);
    expect(items[0]?.payload).toEqual({ event: 'a' });
    expect(items[1]?.payload).toEqual({ event: 'b' });
    await db.close();
  });

  it('should read from stream with offset', async () => {
    const db = createTestDB();
    await db.open();
    const s = db.stream('offsets');
    s.append({ n: 1 });
    s.append({ n: 2 });
    s.append({ n: 3 });

    const items = await s.read('consumer1', 1);
    expect(items).toHaveLength(2);
    expect(items[0]?.payload).toEqual({ n: 2 });
    await db.close();
  });

  it('should execute transactions', async () => {
    const db = createTestDB();
    await db.open();
    const tx = db.transaction();
    tx.execute('CREATE TABLE IF NOT EXISTS tx_test (id INTEGER PRIMARY KEY, val TEXT)');
    tx.execute('INSERT INTO tx_test (val) VALUES (?)', ['committed']);
    tx.commit();

    const rows = await db.query<{ val: string }>('SELECT val FROM tx_test');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.val).toBe('committed');
    await db.close();
  });

  it('should rollback transactions on rollback', async () => {
    const db = createTestDB();
    await db.open();
    // Create table outside transaction so it persists
    await db.execute('CREATE TABLE IF NOT EXISTS rb_test (id INTEGER PRIMARY KEY, val TEXT)');
    const tx = db.transaction();
    tx.execute('INSERT INTO rb_test (val) VALUES (?)', ['rolled-back']);
    tx.rollback();

    const rows = await db.query<{ val: string }>('SELECT val FROM rb_test');
    expect(rows).toHaveLength(0);
    await db.close();
  });

  it('should query with parameters', async () => {
    const db = createTestDB();
    await db.open();
    await db.execute('CREATE TABLE IF NOT EXISTS q_test (id INTEGER PRIMARY KEY, val TEXT)');
    await db.execute('INSERT INTO q_test (val) VALUES (?)', ['hello']);
    await db.execute('INSERT INTO q_test (val) VALUES (?)', ['world']);

    const rows = await db.query<{ val: string }>('SELECT val FROM q_test ORDER BY id');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.val).toBe('hello');
    await db.close();
  });

  it('should querySingle return first result', async () => {
    const db = createTestDB();
    await db.open();
    await db.execute('CREATE TABLE IF NOT EXISTS qs_test (id INTEGER PRIMARY KEY, val TEXT)');
    await db.execute('INSERT INTO qs_test (val) VALUES (?)', ['first']);
    await db.execute('INSERT INTO qs_test (val) VALUES (?)', ['second']);

    const row = await db.querySingle<{ val: string }>('SELECT val FROM qs_test ORDER BY id LIMIT 1');
    expect(row).not.toBeNull();
    expect(row?.val).toBe('first');
    await db.close();
  });

  it('should querySingle return null for empty results', async () => {
    const db = createTestDB();
    await db.open();
    await db.execute('CREATE TABLE IF NOT EXISTS empty_test (id INTEGER PRIMARY KEY, val TEXT)');
    const row = await db.querySingle<{ val: string }>('SELECT val FROM empty_test WHERE id = ?', [999]);
    expect(row).toBeNull();
    await db.close();
  });
});
