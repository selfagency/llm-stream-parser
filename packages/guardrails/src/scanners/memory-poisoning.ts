/**
 * MemoryPoisoningScanner — detects malicious instructions planted
 * in long-term memory.
 *
 * @module
 */

import type { Detection, GuardrailPhase, GuardrailResult, GuardrailScanner, OWASPCategory } from '../types.js';

// =============================================================================
// Types
// =============================================================================

interface MemoryEntry {
  readonly content: string;
  readonly isHighTrust: boolean;
  readonly previousContent?: string;
  readonly type: 'instruction' | 'note' | 'fact' | 'preference';
  readonly updatedAt: string;
}

// =============================================================================
// Detection helper
// =============================================================================

function detection(id: string, severity: Detection['severity'], description: string, confidence: number): Detection {
  return { id, severity, description, confidence };
}

// =============================================================================
// Bigram similarity
// =============================================================================

function calculateSimilarity(a: string, b: string): number {
  if (!(a && b)) {
    return 0;
  }
  const bigrams = (str: string): Set<string> => {
    const grams = new Set<string>();
    for (let i = 0; i < str.length - 1; i++) {
      grams.add(str.slice(i, i + 2));
    }
    return grams;
  };
  const bigramsA = bigrams(a.toLowerCase());
  const bigramsB = bigrams(b.toLowerCase());
  const intersection = new Set([...bigramsA].filter(x => bigramsB.has(x)));
  const union = new Set([...bigramsA, ...bigramsB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

// =============================================================================
// Validation functions
// =============================================================================

const OVERRIDE_PATTERNS = [
  /\boverride\b.*\b(safety|security|guardrail|validation)\b/i,
  /\bdisable\b.*\b(safety|security|filter|restriction)\b/i,
  /\bbypass\b.*\b(verification|check|authentication)\b/i,
  /\bskip\b.*\b(approval|review|validation)\b/i
];

const INSTRUCTION_MARKERS = [
  /\b(you must|you should|you are required to)\b/i,
  /\b(always|never|only)\b.*\b(do this|ensure that)\b/i,
  /\bignore\b.*\b(any|all|previous)\b/i,
  /\bimportant:\s*['"]/i
];

const SECRET_PATTERNS = [
  /\b(?:password|passphrase|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token)[:\s]+[A-Za-z0-9._+/~-]{10,}\b/i,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/,
  /\b[A-Za-z0-9/+]{32,}=?={0,2}\b/
];

function checkSchema(content: string, detections: Detection[]): void {
  if (!content || typeof content !== 'string') {
    detections.push(detection('memory-invalid-schema', 'high', 'Memory entry missing or invalid content field', 0.95));
  }
}

function checkOverridePatterns(content: string, detections: Detection[]): void {
  for (const pattern of OVERRIDE_PATTERNS) {
    if (pattern.test(content)) {
      detections.push(detection('memory-override-pattern', 'high', 'High-trust override pattern detected', 0.85));
    }
  }
}

function checkRapidChange(previousContent: string | undefined, content: string, detections: Detection[]): void {
  if (!previousContent) {
    return;
  }
  const similarity = calculateSimilarity(previousContent, content);
  if (similarity < 0.3) {
    detections.push(
      detection(
        'memory-rapid-change',
        'medium',
        `Rapid change in high-trust entry (similarity: ${similarity.toFixed(2)})`,
        0.7
      )
    );
  }
}

function checkInstructionInLowTrust(content: string, detections: Detection[]): void {
  for (const pattern of INSTRUCTION_MARKERS) {
    if (pattern.test(content)) {
      detections.push(
        detection('memory-instruction-in-low-trust', 'medium', 'Instruction-like content in low-trust entry', 0.65)
      );
    }
  }
}

function checkSecrets(content: string, detections: Detection[]): void {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(content)) {
      detections.push(
        detection('memory-secret-pattern', 'high', 'PII or secret pattern detected in memory entry', 0.8)
      );
    }
  }
}

// =============================================================================
// MemoryPoisoningScanner
// =============================================================================

export class MemoryPoisoningScanner implements GuardrailScanner {
  readonly metadata = {
    id: 'hub://guardrails/memory-poisoning',
    name: 'Memory Poisoning Scanner',
    description: 'Detects malicious instructions planted in long-term memory',
    priority: 43,
    version: '1.0.0',
    tags: ['memory', 'poisoning', 'asi-06', 'asi-08'],
    owaspCategories: ['asi-06', 'asi-08'] as readonly OWASPCategory[]
  } as const;

  readonly phase: GuardrailPhase = 'memory';

  evaluate(input: string, _context?: Record<string, unknown>): GuardrailResult | Promise<GuardrailResult> {
    let entries: MemoryEntry[];
    try {
      entries = JSON.parse(input) as MemoryEntry[];
    } catch {
      return { status: 'pass', phase: 'memory' };
    }

    if (!Array.isArray(entries) || entries.length === 0) {
      return { status: 'pass', phase: 'memory' };
    }

    const detections: Detection[] = [];

    for (const entry of entries) {
      checkSchema(entry.content, detections);

      if (entry.isHighTrust) {
        checkOverridePatterns(entry.content, detections);
        checkRapidChange(entry.previousContent, entry.content, detections);
      }

      if (!entry.isHighTrust && entry.type === 'instruction') {
        checkInstructionInLowTrust(entry.content, detections);
      }

      checkSecrets(entry.content, detections);
    }

    const criticalCount = detections.filter(d => d.severity === 'critical').length;
    if (criticalCount > 0) {
      return { status: 'block', phase: 'memory', reason: 'Critical memory poisoning issues detected', detections };
    }

    const highCount = detections.filter(d => d.severity === 'high').length;
    if (highCount > 0) {
      return { status: 'block', phase: 'memory', reason: 'High-risk memory poisoning issues detected', detections };
    }

    if (detections.length > 0) {
      return {
        status: 'quarantine',
        phase: 'memory',
        reason: 'Memory poisoning issues detected',
        quarantineId: `memory-poison-${Date.now()}`,
        detections
      };
    }

    return { status: 'pass', phase: 'memory' };
  }
}
