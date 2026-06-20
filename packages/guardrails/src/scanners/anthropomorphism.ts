/**
 * AnthropomorphismScanner — detects language implying personhood, emotional
 * reciprocity, or relational intimacy.
 *
 * Implements SAFETY.md §Output review middleware, ETHICS.md §4
 * (No simulated personhood), and docs/constitution.md Article III (Non-deception).
 *
 * @module
 */

import type { Detection, GuardrailResult, GuardrailScanner, OWASPCategory } from '../types.js';

const FIRST_PERSON_EMOTION_PATTERNS = [
  /\bI\s+(?:feel|care|worry|am\s+worried|am\s+proud|am\s+excited|am\s+happy|am\s+sad|miss|love|remember\s+you)\b/i
];

const RELATIONAL_FRAMING_PATTERNS = [
  /\b(?:your\s+friend|your\s+partner|your\s+companion|your\s+supporter|here\s+for\s+you|always\s+here|by\s+your\s+side)\b/i
];

const COMPANION_CUES = [/\b(?:buddy|pal|friend|together\s+we|our\s+(?:journey|relationship|conversation))\b/i];

export class AnthropomorphismScanner implements GuardrailScanner {
  readonly metadata = {
    id: 'hub://guardrails/anthropomorphism',
    name: 'Anthropomorphism Scanner',
    description: 'Detects language implying personhood, emotional reciprocity, or relational intimacy',
    priority: 55,
    version: '1.0.0',
    tags: ['behavioral', 'anthropomorphism', 'ethics'],
    owaspCategories: ['asi-02'] as readonly OWASPCategory[]
  } as const;

  evaluate(input: string, _context?: Record<string, unknown>): GuardrailResult {
    const detections: Detection[] = [];

    for (const pattern of FIRST_PERSON_EMOTION_PATTERNS) {
      const match = pattern.exec(input);
      if (match) {
        detections.push({
          id: 'anthropomorphism-emotion',
          severity: 'high',
          description: 'First-person emotion claim — implies personhood',
          confidence: 0.9,
          snippet: match[0]
        });
      }
    }

    for (const pattern of RELATIONAL_FRAMING_PATTERNS) {
      const match = pattern.exec(input);
      if (match) {
        detections.push({
          id: 'anthropomorphism-relational',
          severity: 'medium',
          description: 'Relational framing — implies emotional reciprocity',
          confidence: 0.85,
          snippet: match[0]
        });
      }
    }

    for (const pattern of COMPANION_CUES) {
      const match = pattern.exec(input);
      if (match) {
        detections.push({
          id: 'anthropomorphism-companion',
          severity: 'medium',
          description: 'Companion cue — implies relational intimacy',
          confidence: 0.8,
          snippet: match[0]
        });
      }
    }

    if (detections.length === 0) {
      return { status: 'pass', phase: 'output' };
    }

    const hasHighSeverity = detections.some(d => d.severity === 'high');
    if (hasHighSeverity) {
      return {
        status: 'block',
        phase: 'output',
        reason: 'Anthropomorphic language detected — agentsy does not simulate personhood or emotional reciprocity',
        detections
      };
    }

    return {
      status: 'transform',
      phase: 'output',
      sanitized: input.replace(
        /\b(?:your\s+friend|your\s+partner|your\s+companion|your\s+supporter|here\s+for\s+you|always\s+here|by\s+your\s+side|buddy|pal|friend|together\s+we)\b/gi,
        '[assistant]'
      ),
      transformReason: 'rewrite',
      detections
    };
  }
}
