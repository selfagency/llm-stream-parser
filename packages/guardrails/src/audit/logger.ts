/**
 * Audit logger for guardrail decision receipts.
 *
 * Provides persistence, redaction, and export of GuardrailDecisionReceipt
 * records for post-incident review, compliance reporting, and debugging.
 *
 * The default implementation writes to a JSONL file. A SQLite adapter
 * for daemon mode (UnifiedDB.guardrail_decisions) is added in Phase 12.
 */

import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import type { Detection, GuardrailDecisionReceipt, GuardrailPhase, GuardrailResult } from '../types.js';

// =============================================================================
// Types
// =============================================================================

/** Filter for querying receipts. */
export interface ReceiptQuery {
  sessionId?: string;
  correlationId?: string;
  decision?: GuardrailResult['status'];
  phase?: GuardrailPhase;
  since?: string; // ISO 8601
  until?: string; // ISO 8601
  limit?: number;
}

/** Audit logger interface. */
export interface AuditLogger {
  /** Persist a receipt. */
  log(receipt: GuardrailDecisionReceipt): Promise<void>;
  /** Query receipts by filter. */
  query(filter: ReceiptQuery): AsyncIterable<GuardrailDecisionReceipt>;
}

// =============================================================================
// JSONL file logger (default)
// =============================================================================

/**
 * JSONL-based audit logger.
 *
 * Writes one JSON object per line to a file. Suitable for local-first
 * operation without a database dependency.
 */
export class JsonlAuditLogger implements AuditLogger {
  readonly #filePath: string;
  #stream: ReturnType<typeof createWriteStream> | null = null;

  constructor(filePath: string) {
    this.#filePath = resolve(filePath);
    const dir = dirname(this.#filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  async log(receipt: GuardrailDecisionReceipt): Promise<void> {
    if (!this.#stream) {
      this.#stream = createWriteStream(this.#filePath, { flags: 'a' });
    }
    this.#stream.write(`${JSON.stringify(receipt)}\n`);
  }

  async *query(filter: ReceiptQuery): AsyncIterable<GuardrailDecisionReceipt> {
    const content = await readFile(this.#filePath, 'utf-8').catch(() => '');
    const lines = content.trim().split('\n').filter(Boolean);
    let count = 0;
    const limit = filter.limit ?? 100;

    for (const line of lines) {
      if (count >= limit) break;
      const receipt = JSON.parse(line) as GuardrailDecisionReceipt;
      if (this.#matchesFilter(receipt, filter)) {
        yield receipt;
        count++;
      }
    }
  }

  #matchesFilter(receipt: GuardrailDecisionReceipt, filter: ReceiptQuery): boolean {
    if (filter.sessionId && receipt.sessionId !== filter.sessionId) return false;
    if (filter.correlationId && receipt.correlationId !== filter.correlationId) return false;
    if (filter.decision && receipt.decision !== filter.decision) return false;
    if (filter.phase && receipt.phase !== filter.phase) return false;
    if (filter.since && receipt.timestamp < filter.since) return false;
    if (filter.until && receipt.timestamp > filter.until) return false;
    return true;
  }

  /** Close the underlying file stream. */
  close(): void {
    this.#stream?.end();
    this.#stream = null;
  }

  /**
   * Flush pending writes and close. Returns a promise that resolves
   * when the stream has finished writing.
   */
  async flush(): Promise<void> {
    if (this.#stream) {
      return new Promise(resolve => {
        this.#stream!.end(resolve);
        this.#stream = null;
      });
    }
  }
}

// =============================================================================
// Receipt redaction
// =============================================================================

/**
 * Redact sensitive fields from a receipt before persistence.
 *
 * Uses the existing PII and secret scanners to scrub the receipt's
 * detections and any raw content before the receipt is written to disk.
 */
export function redactReceipt(
  receipt: GuardrailDecisionReceipt,
  redactField: (value: string) => string
): GuardrailDecisionReceipt {
  const redactedDetections: Detection[] = receipt.detections.map(d => {
    const mutable: Record<string, unknown> = {
      id: d.id,
      severity: d.severity,
      description: redactField(d.description)
    };
    if (d.snippet) mutable.snippet = redactField(d.snippet);
    if (d.category) mutable.category = d.category;
    if (d.confidence !== undefined) mutable.confidence = d.confidence;
    if (d.end !== undefined) mutable.end = d.end;
    if (d.location) mutable.location = d.location;
    if (d.start !== undefined) mutable.start = d.start;
    return mutable as unknown as Detection;
  });

  const redacted: GuardrailDecisionReceipt = {
    policyId: receipt.policyId,
    decision: receipt.decision,
    reasonCode: receipt.reasonCode,
    riskTier: receipt.riskTier,
    surface: receipt.surface,
    phase: receipt.phase,
    timestamp: receipt.timestamp,
    correlationId: receipt.correlationId,
    sessionId: receipt.sessionId,
    detections: redactedDetections,
    sanitized: receipt.sanitized ? redactField(receipt.sanitized) : undefined
  } as GuardrailDecisionReceipt;
  return redacted;
}

// =============================================================================
// Receipt exporter
// =============================================================================

/**
 * Export machine-readable receipts for compliance and debugging.
 */
export class ReceiptExporter {
  /**
   * Export receipts as a JSON array string.
   */
  static toJson(receipts: GuardrailDecisionReceipt[]): string {
    return JSON.stringify(receipts, null, 2);
  }

  /**
   * Export receipts as CSV string.
   */
  static toCsv(receipts: GuardrailDecisionReceipt[]): string {
    const header = 'timestamp,correlationId,sessionId,decision,reasonCode,riskTier,phase,surface,policyId';
    const rows = receipts.map(r =>
      [
        r.timestamp,
        r.correlationId,
        r.sessionId,
        r.decision,
        r.reasonCode,
        r.riskTier,
        r.phase,
        r.surface,
        r.policyId
      ].join(',')
    );
    return [header, ...rows].join('\n');
  }

  /**
   * Write receipts to a file in the specified format.
   */
  static async toFile(
    receipts: GuardrailDecisionReceipt[],
    filePath: string,
    format: 'json' | 'csv' = 'json'
  ): Promise<void> {
    const content = format === 'json' ? ReceiptExporter.toJson(receipts) : ReceiptExporter.toCsv(receipts);
    await writeFile(resolve(filePath), content, 'utf-8');
  }
}
