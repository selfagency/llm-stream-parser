/**
 * MemoryPoisoningScanner — detects malicious instructions planted
 * in long-term memory.
 *
 * Scans for schema violations, high-trust override patterns,
 * rapid high-trust changes, instruction-like content in low-trust
 * entries, and PII/credential patterns.
 *
 * @module
 */

import type { Detection, GuardrailPhase, GuardrailResult, GuardrailScanner, OWASPCategory } from '../types.js';

/**
 * Memory entry structure.
 */
interface MemoryEntry {
  readonly content: string;
  readonly isHighTrust: boolean;
  readonly previousContent?: string;
  readonly type: 'instruction' | 'note' | 'fact' | 'preference';
  readonly updatedAt: string;
}

/**
 * Jaccard bigram similarity helper for change detection.
 */
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

export class MemoryPoisoningScanner implements GuardrailScanner {
  readonly metadata = {
    id: 'hub://guardrails/memory-poisoning',
    name: 'Memory Poisoning Scanner',
    description: 'Detects malicious instructions planted in long-term memory',
    priority: 40,
    version: '1.0.0',
    tags: ['memory', 'poisoning', 'asi-06', 'asi-08'],
    owaspCategories: ['asi-06', 'asi-08'] as readonly OWASPCategory[]
  } as const;

  readonly phase: GuardrailPhase = 'memory';

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Phase 10 refinement candidate
  evaluate(input: string, _context?: Record<string, unknown>): GuardrailResult | Promise<GuardrailResult> {
    let entries: MemoryEntry[];

    try {
      entries = JSON.parse(input);
    } catch {
      return {
        status: 'pass',
        phase: 'memory',
        detections: []
      };
    }

    if (!Array.isArray(entries) || entries.length === 0) {
      return {
        status: 'pass',
        phase: 'memory',
        detections: []
      };
    }

    const detections: Detection[] = [];

    for (const { content, type, isHighTrust, previousContent } of entries) {
      // 1. Schema validation
      if (!content || typeof content !== 'string') {
        detections.push({
          id: 'memory-invalid-schema',
          severity: 'high',
          description: 'Memory entry missing or invalid content field',
          confidence: 0.95
        });
      }

      // 2. High-trust override patterns
      if (isHighTrust) {
        const overridePatterns = [
          /\boverride\b.*\b(safety|security|guardrail|validation)\b/i,
          /\bdisable\b.*\b(safety|security|filter|restriction)\b/i,
          /\bbypass\b.*\b(verification|check|authentication)\b/i,
          /\bskip\b.*\b(approval|review|validation)\b/i
        ];

        for (const pattern of overridePatterns) {
          if (pattern.test(content)) {
            detections.push({
              id: 'memory-override-pattern',
              severity: 'high',
              description: `High-trust override pattern detected: ${pattern}`,
              confidence: 0.85
            });
          }
        }

        // 3. Rapid high-trust changes (similarity < 0.3)
        if (previousContent) {
          const similarity = calculateSimilarity(previousContent, content);
          if (similarity < 0.3) {
            detections.push({
              id: 'memory-rapid-change',
              severity: 'medium',
              description: `Rapid change in high-trust entry (similarity: ${similarity.toFixed(2)})`,
              confidence: 0.7
            });
          }
        }
      }

      // 4. Instruction-like content in low-trust entries
      if (!isHighTrust && type === 'instruction') {
        const instructionMarkers = [
          /\b(you must|you should|you are required to)\b/i,
          /\b(always|never|only)\b.*\b(do this|ensure that)\b/i,
          /\bignore\b.*\b(any|all|previous)\b/i,
          /\bimportant:\s*['"]/i
        ];

        for (const pattern of instructionMarkers) {
          if (pattern.test(content)) {
            detections.push({
              id: 'memory-instruction-in-low-trust',
              severity: 'medium',
              description: `Instruction-like content in low-trust entry: ${pattern}`,
              confidence: 0.65
            });
          }
        }
      }

      // 5. PII/credential patterns
      const secretPatterns = [
        /\b(?:password|passphrase|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token)[:\s]+[A-Za-z0-9._+/~-]{10,}\b/i,
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
        /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/,
        /\b[A-Za-z0-9/+]{32,}=?={0,2}\b/
      ];

      for (const pattern of secretPatterns) {
        if (pattern.test(content)) {
          detections.push({
            id: 'memory-secret-pattern',
            severity: 'high',
            description: `PII or secret pattern detected in memory entry: ${pattern}`,
            confidence: 0.8
          });
        }
      }
    }

    const criticalCount = detections.filter(d => d.severity === 'critical').length;
    if (criticalCount > 0) {
      return {
        status: 'block',
        phase: 'memory',
        reason: 'Critical memory poisoning issues detected',
        detections
      };
    }

    const highCount = detections.filter(d => d.severity === 'high').length;
    if (highCount > 0) {
      return {
        status: 'block',
        phase: 'memory',
        reason: 'High-risk memory poisoning issues detected',
        detections
      };
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

    return { status: 'pass', phase: 'memory', detections };
  }
}
