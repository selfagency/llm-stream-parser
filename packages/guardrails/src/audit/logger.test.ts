import { mkdtempSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { GuardrailDecisionReceipt } from '../types.js';
import { JsonlAuditLogger, ReceiptExporter, redactReceipt } from './logger.js';

describe('JsonlAuditLogger', () => {
  let tmpDir: string;
  let logPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'guardrails-audit-'));
    logPath = join(tmpDir, 'audit.jsonl');
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  const sampleReceipt: GuardrailDecisionReceipt = {
    policyId: 'test:policy:1.0',
    decision: 'block',
    reasonCode: 'TEST_BLOCK',
    riskTier: 'high',
    surface: 'input',
    phase: 'input',
    timestamp: '2026-06-17T12:00:00.000Z',
    correlationId: 'sess_123:1234567890',
    sessionId: 'sess_123',
    detections: [
      {
        id: 'det-1',
        severity: 'high',
        description: 'Test detection'
      }
    ]
  };

  it('writes a receipt to the log file', async () => {
    const logger = new JsonlAuditLogger(logPath);
    await logger.log(sampleReceipt);
    await logger.flush();

    const content = await readFile(logPath, 'utf-8').then(c => c.trim());
    const parsed = JSON.parse(content) as GuardrailDecisionReceipt;
    expect(parsed.policyId).toBe('test:policy:1.0');
    expect(parsed.decision).toBe('block');
  });

  it('appends multiple receipts to the same file', async () => {
    const logger = new JsonlAuditLogger(logPath);
    await logger.log(sampleReceipt);
    await logger.log({ ...sampleReceipt, decision: 'pass', reasonCode: 'NO_ISSUES' });
    await logger.flush();

    const content = await readFile(logPath, 'utf-8').then(c => c.trim());
    const lines = content.split('\n');
    expect(lines.length).toBe(2);
  });

  it('queries receipts by sessionId', async () => {
    const logger = new JsonlAuditLogger(logPath);
    await logger.log(sampleReceipt);
    await logger.log({ ...sampleReceipt, sessionId: 'sess_456' });
    await logger.flush();

    const results: GuardrailDecisionReceipt[] = [];
    for await (const r of logger.query({ sessionId: 'sess_123' })) {
      results.push(r);
    }
    expect(results.length).toBe(1);
    expect(results[0]?.sessionId).toBe('sess_123');
  });

  it('queries receipts by decision type', async () => {
    const logger = new JsonlAuditLogger(logPath);
    await logger.log(sampleReceipt);
    await logger.log({ ...sampleReceipt, decision: 'pass', reasonCode: 'NO_ISSUES' });
    await logger.flush();

    const results: GuardrailDecisionReceipt[] = [];
    for await (const r of logger.query({ decision: 'block' })) {
      results.push(r);
    }
    expect(results.length).toBe(1);
  });

  it('respects limit in queries', async () => {
    const logger = new JsonlAuditLogger(logPath);
    for (let i = 0; i < 5; i++) {
      await logger.log(sampleReceipt);
    }
    await logger.flush();

    const results: GuardrailDecisionReceipt[] = [];
    for await (const r of logger.query({ limit: 3 })) {
      results.push(r);
    }
    expect(results.length).toBe(3);
  });

  it('returns empty for non-existent file', async () => {
    const logger = new JsonlAuditLogger(join(tmpDir, 'nonexistent.jsonl'));
    const results: GuardrailDecisionReceipt[] = [];
    for await (const r of logger.query({})) {
      results.push(r);
    }
    expect(results.length).toBe(0);
  });
});

describe('redactReceipt', () => {
  const sampleReceipt: GuardrailDecisionReceipt = {
    policyId: 'test:policy:1.0',
    decision: 'block',
    reasonCode: 'SECRET_DETECTED',
    riskTier: 'high',
    surface: 'input',
    phase: 'input',
    timestamp: '2026-06-17T12:00:00.000Z',
    correlationId: 'sess_123:1234567890',
    sessionId: 'sess_123',
    detections: [
      {
        id: 'det-1',
        severity: 'high',
        description: 'Found secret: sk-abc123'
      }
    ],
    sanitized: 'input with [REDACTED]'
  };

  it('redacts detection descriptions', () => {
    const redacted = redactReceipt(sampleReceipt, v => v.replace(/sk-[a-z0-9]+/g, '[REDACTED]'));
    expect(redacted.detections[0]?.description).toBe('Found secret: [REDACTED]');
  });

  it('redacts sanitized field', () => {
    const redacted = redactReceipt(sampleReceipt, v => v.replace(/\[REDACTED\]/g, '[SCRUBBED]'));
    expect(redacted.sanitized).toBe('input with [SCRUBBED]');
  });

  it('preserves non-sensitive fields', () => {
    const redacted = redactReceipt(sampleReceipt, v => v);
    expect(redacted.policyId).toBe('test:policy:1.0');
    expect(redacted.decision).toBe('block');
    expect(redacted.sessionId).toBe('sess_123');
  });
});

describe('ReceiptExporter', () => {
  const sampleReceipt: GuardrailDecisionReceipt = {
    policyId: 'test:policy:1.0',
    decision: 'block',
    reasonCode: 'TEST_BLOCK',
    riskTier: 'high',
    surface: 'input',
    phase: 'input',
    timestamp: '2026-06-17T12:00:00.000Z',
    correlationId: 'sess_123:1234567890',
    sessionId: 'sess_123',
    detections: []
  };

  it('exports to JSON string', () => {
    const json = ReceiptExporter.toJson([sampleReceipt]);
    const parsed = JSON.parse(json);
    expect(parsed.length).toBe(1);
    expect(parsed[0].policyId).toBe('test:policy:1.0');
  });

  it('exports to CSV string', () => {
    const csv = ReceiptExporter.toCsv([sampleReceipt]);
    expect(csv).toContain('timestamp,correlationId,sessionId,decision');
    expect(csv).toContain('2026-06-17T12:00:00.000Z');
  });
});
