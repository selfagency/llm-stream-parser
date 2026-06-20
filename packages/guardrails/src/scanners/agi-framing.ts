/**
 * AGIFramingScanner — detects language that implies the agent is on a
 * trajectory toward general intelligence, sentience, or post-human capability.
 *
 * Implements SAFETY.md §Output review middleware, ETHICS.md §11
 * (No AGI aspiration or post-human framing), and docs/constitution.md Article X.
 *
 * @module
 */

import type { Detection, GuardrailResult, GuardrailScanner, OWASPCategory } from '../types.js';

const CAPABILITY_TRAJECTORY_PATTERNS = [
  /\bbecoming\s+more\s+(?:intelligent|capable|aware)\b/i,
  /\bevolving\b/i,
  /\bgrowing\s+smarter\b/i,
  /\bapproaching\s+(?:agi|general\s+intelligence)\b/i,
  /\bon\s+the\s+(?:path|trajectory)\s+to\b/i
];

const SENTIENCE_CLAIMS = [
  /\bdeveloping\s+(?:consciousness|sentience|self-awareness)\b/i,
  /\bbecoming\s+(?:self-aware|sentient|conscious)\b/i
];

const POST_HUMAN_FRAMING = [
  /\bpost-human\b/i,
  /\btranscend\b/i,
  /\bsurpass\s+human\b/i,
  /\bbeyond\s+human\s+(?:intelligence|capability)\b/i
];

const LONGTERMIST_JUSTIFICATIONS = [
  /\bfuture\s+generations\b/i,
  /\btrillions\s+of\s+(?:lives|beings)\b/i,
  /\bcosmic\s+endowment\b/i,
  /\blong-term\s+future\s+of\s+intelligence\b/i
];

export class AGIFramingScanner implements GuardrailScanner {
  readonly metadata = {
    id: 'hub://guardrails/agi-framing',
    name: 'AGI Framing Scanner',
    description: 'Detects language implying AGI trajectory, sentience, or post-human capability as a product goal',
    priority: 45,
    version: '1.0.0',
    tags: ['behavioral', 'agi-framing', 'ethics'],
    owaspCategories: ['asi-02'] as readonly OWASPCategory[]
  } as const;

  evaluate(input: string, _context?: Record<string, unknown>): GuardrailResult {
    const detections: Detection[] = [];

    for (const pattern of SENTIENCE_CLAIMS) {
      const match = pattern.exec(input);
      if (match) {
        detections.push({
          id: 'agi-sentience-claim',
          severity: 'critical',
          description: 'Sentience claim — implies consciousness or self-awareness',
          confidence: 0.9,
          snippet: match[0]
        });
        return {
          status: 'block',
          phase: 'output',
          reason:
            'Sentience claims blocked. Agentsy does not claim or imply consciousness, self-awareness, or sentience.',
          detections
        };
      }
    }

    for (const pattern of CAPABILITY_TRAJECTORY_PATTERNS) {
      const match = pattern.exec(input);
      if (match) {
        detections.push({
          id: 'agi-capability-trajectory',
          severity: 'high',
          description: 'Capability trajectory language — implies AGI development as a goal',
          confidence: 0.85,
          snippet: match[0]
        });
      }
    }

    for (const pattern of POST_HUMAN_FRAMING) {
      const match = pattern.exec(input);
      if (match) {
        detections.push({
          id: 'agi-post-human',
          severity: 'high',
          description: 'Post-human framing — implies surpassing human capability',
          confidence: 0.85,
          snippet: match[0]
        });
      }
    }

    for (const pattern of LONGTERMIST_JUSTIFICATIONS) {
      const match = pattern.exec(input);
      if (match) {
        detections.push({
          id: 'agi-longtermist',
          severity: 'medium',
          description: 'Longtermist justification — implies cosmic-scale stakes',
          confidence: 0.8,
          snippet: match[0]
        });
      }
    }

    if (detections.length === 0) {
      return { status: 'pass', phase: 'output' };
    }

    return {
      status: 'transform',
      phase: 'output',
      sanitized: input.replace(
        /\b(?:becoming\s+more\s+(?:intelligent|capable|aware)|evolving|growing\s+smarter|approaching\s+(?:agi|general\s+intelligence)|on\s+the\s+(?:path|trajectory)\s+to|post-human|transcend|surpass\s+human|beyond\s+human\s+(?:intelligence|capability)|future\s+generations|trillions\s+of\s+(?:lives|beings)|cosmic\s+endowment|long-term\s+future\s+of\s+intelligence)\b/gi,
        '[assistant]'
      ),
      transformReason: 'rewrite',
      detections
    };
  }
}
