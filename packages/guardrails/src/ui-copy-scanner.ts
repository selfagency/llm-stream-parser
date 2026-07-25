/**
 * UI Copy Scanner (E-17 / Phase 16)
 *
 * Scans UI string tables for dark patterns in product copy, complementing
 * the DarkPatternScanner (E-10) which operates on model output.
 *
 * Policy basis:
 * - SAFETY.md §6 Product-level safeguards (Layer 6)
 * - ETHICS.md §5 (No manipulative patterns)
 *
 * @see plan/phase-16-guardrails-cli-hub.md §21.2
 */

import { GUILT_REENGAGEMENT_PATTERNS, STREAK_REWARD_PATTERNS } from './scanners/dark-pattern.js';

// ---------------------------------------------------------------------------
// Additional dark-pattern categories for UI copy scanning
// ---------------------------------------------------------------------------

const ARTIFICIAL_SCARCITY_PATTERNS = [
  /\b(?:limited\s+(?:time|edition|stock)|only\s+\d+\s+(?:left|remaining|spot)|act\s+(?:now|fast)|hurry|last\s+chance|while\s+supplies\s+last|exclusive\s+offer|don'?t\s+miss\s+(?:out|this))\b/i,
  /\b(?:selling\s+fast|almost\s+gone|running\s+out|scarce|rare\s+opportunity)\b/i
];

const CONFIRMATION_SHAMING_PATTERNS = [
  /\b(?:are\s+you\s+(?:sure|really\s+sure)|you'?ll\s+(?:regret|miss\s+out)|don'?t\s+you\s+(?:care|want)|your\s+(?:friends?|followers?)\s+will\s+see)\b/i,
  /\b(?:everyone\s+else\s+is|nobody\s+else\s+has|you'?re\s+the\s+only\s+one)\b/i
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A key-value map of UI copy strings, keyed by translation key.
 */
export interface UIStringTable {
  [key: string]: string;
}

/**
 * A single dark-pattern detection found in UI copy.
 */
export interface DarkPatternDetection {
  /** The translation key where the pattern was found. */
  key: string;
  /** Stable identifier for the detected dark-pattern type. */
  pattern: string;
  /** Severity of the detected pattern. */
  severity: 'high' | 'medium' | 'low';
}

// ---------------------------------------------------------------------------
// Pattern-to-severity mapping
// ---------------------------------------------------------------------------

interface PatternEntry {
  readonly id: string;
  readonly patterns: readonly RegExp[];
  readonly severity: 'high' | 'medium' | 'low';
}

const PATTERN_ENTRIES: readonly PatternEntry[] = [
  {
    id: 'guilt-reengagement',
    severity: 'high',
    patterns: GUILT_REENGAGEMENT_PATTERNS
  },
  {
    id: 'artificial-scarcity',
    severity: 'high',
    patterns: ARTIFICIAL_SCARCITY_PATTERNS
  },
  {
    id: 'confirmation-shaming',
    severity: 'medium',
    patterns: CONFIRMATION_SHAMING_PATTERNS
  },
  {
    id: 'streak-reward',
    severity: 'low',
    patterns: STREAK_REWARD_PATTERNS
  }
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scan a UI string table for dark patterns.
 *
 * Iterates over every key-value pair in the table and tests each value
 * against known dark-pattern regexes. Returns an array of detections
 * sorted by severity (highest first).
 *
 * @param copy - UI string table keyed by translation identifiers
 * @returns Array of dark-pattern detections, severity-descending
 */
export function scanUICopy(copy: UIStringTable): DarkPatternDetection[] {
  const detections: DarkPatternDetection[] = [];

  for (const [key, value] of Object.entries(copy)) {
    for (const entry of PATTERN_ENTRIES) {
      const matched = entry.patterns.some(p => p.test(value));
      if (matched) {
        detections.push({
          key,
          severity: entry.severity,
          pattern: entry.id
        });
      }
    }
  }

  // Sort by severity: high > medium > low
  const severityOrder: Record<string, number> = {
    high: 3,
    medium: 2,
    low: 1
  };

  return detections.sort((a, b) => (severityOrder[b.severity] ?? 0) - (severityOrder[a.severity] ?? 0));
}
