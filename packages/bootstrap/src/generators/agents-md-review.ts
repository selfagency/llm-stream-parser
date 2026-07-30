/**
 * AGENTS.md reviewer — audits a generated AGENTS.md for staleness and bloat.
 *
 * Inspired by Claude Code Tip 28 ("keep CLAUDE.md simple and review it
 * periodically"). Compares the current AGENTS.md against the project profile
 * to detect drift, and flags sections that are too long or outdated.
 *
 * This is a primitive agents can call to self-audit the project guidance file
 * before using it, or that CI can run to flag stale guidance.
 */

import type { ProjectProfile } from '../scanner.js';

// ── Types ────────────────────────────────────────────────────────────────

export type ReviewSeverity = 'info' | 'warning' | 'error';

export interface ReviewFinding {
  message: string;
  section: string;
  severity: ReviewSeverity;
  /** Suggested fix */
  suggestion?: string;
}

export interface ReviewResult {
  /** Estimated token count (rough: 1 line ≈ 15 tokens) */
  estimatedTokens: number;
  findings: ReviewFinding[];
  /** Total line count */
  lineCount: number;
  /** Whether regeneration is recommended */
  shouldRegenerate: boolean;
  /** Whether the AGENTS.md is usable as-is */
  usable: boolean;
}

// ── Reviewer ─────────────────────────────────────────────────────────────

const MAX_LINES = 200;
const MAX_TOKENS = 3000; // ~200 lines × 15 tokens

/**
 * Review an AGENTS.md file against the current project profile.
 *
 * Detects:
 * - Missing sections (stale generation)
 * - Profile drift (detected frameworks not mentioned)
 * - Bloat (too many lines or tokens)
 * - Outdated timestamp
 * - Missing Atlas manifest (if agent has one)
 */
export function reviewAgentsMd(
  content: string,
  profile: ProjectProfile,
  options?: { hasAtlasManifest?: boolean }
): ReviewResult {
  const findings: ReviewFinding[] = [];
  const lines = content.split('\n');
  const lineCount = lines.length;
  const estimatedTokens = lineCount * 15;

  // ── Check for bloat ──────────────────────────────────────────────────
  if (lineCount > MAX_LINES) {
    findings.push({
      severity: 'warning',
      section: '*overall*',
      message: `AGENTS.md is ${lineCount} lines (recommended max: ${MAX_LINES}).`,
      suggestion: 'Remove outdated sections or regenerate with a leaner profile.'
    });
  }

  if (estimatedTokens > MAX_TOKENS) {
    findings.push({
      severity: 'info',
      section: '*overall*',
      message: `Estimated ${estimatedTokens} tokens. Every conversation pays this cost.`,
      suggestion: 'Keep AGENTS.md concise — only include what the agent needs to know.'
    });
  }

  // ── Check for required sections ──────────────────────────────────────
  const requiredSections = ['## Project', '## Commands', '## Conventions'];
  for (const section of requiredSections) {
    if (!content.includes(section)) {
      findings.push({
        severity: 'error',
        section,
        message: `Missing required section: ${section}`,
        suggestion: 'Regenerate AGENTS.md with `agentsy project init`.'
      });
    }
  }

  // ── Check for profile drift ──────────────────────────────────────────
  for (const framework of profile.frameworks) {
    if (!content.includes(framework)) {
      findings.push({
        severity: 'warning',
        section: '## Project',
        message: `Detected framework "${framework}" not mentioned in AGENTS.md.`,
        suggestion: 'Regenerate to include the current project profile.'
      });
    }
  }

  for (const lang of profile.languages) {
    if (!content.includes(lang)) {
      findings.push({
        severity: 'warning',
        section: '## Project',
        message: `Detected language "${lang}" not mentioned in AGENTS.md.`,
        suggestion: 'Regenerate to include the current project profile.'
      });
    }
  }

  if (!content.includes(profile.packageManager)) {
    findings.push({
      severity: 'warning',
      section: '## Commands',
      message: `Detected package manager "${profile.packageManager}" not mentioned in AGENTS.md.`,
      suggestion: 'Regenerate to include the current project profile.'
    });
  }

  // ── Check for stale timestamp ───────────────────────────────────────
  const timestampMatch = content.match(/Auto-generated at ([\d-]+)/);
  if (timestampMatch) {
    const generated = new Date(timestampMatch[1] as string);
    const ageDays = (Date.now() - generated.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays > 30) {
      findings.push({
        severity: 'info',
        section: '*header*',
        message: `AGENTS.md was generated ${Math.round(ageDays)} days ago.`,
        suggestion: 'Regenerate if the project structure has changed.'
      });
    }
  } else {
    findings.push({
      severity: 'info',
      section: '*header*',
      message: 'No generation timestamp found — file may be hand-edited.',
      suggestion: 'Regenerate to ensure consistency with the project profile.'
    });
  }

  // ── Check for Atlas manifest ─────────────────────────────────────────
  if (options?.hasAtlasManifest && !content.includes('## Agent Atlas Manifest')) {
    findings.push({
      severity: 'info',
      section: '## Agent Atlas Manifest',
      message: 'Agent has an Atlas manifest but AGENTS.md does not include it.',
      suggestion: "Regenerate with the agent's Atlas manifest data."
    });
  }

  // ── Determine overall status ────────────────────────────────────────
  const errors = findings.filter(f => f.severity === 'error');
  const warnings = findings.filter(f => f.severity === 'warning');

  return {
    findings,
    usable: errors.length === 0,
    shouldRegenerate: errors.length > 0 || warnings.length > 2,
    lineCount,
    estimatedTokens
  };
}
