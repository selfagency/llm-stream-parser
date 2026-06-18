/**
 * Local trust sanitization workflow.
 *
 * Combines existing guardrails scanners (PII, secrets) with the
 * infrastructure scanner and custom redaction rules to produce
 * sanitized output for safe sharing of logs, configs, prompts,
 * and incident artifacts.
 *
 * @module
 */

import { PIIScanner } from '../pii.js';
import { SecretDetectionScanner } from '../secret-detection.js';
import type { GuardrailScanner } from '../types.js';
import { InfrastructureScanner, type InfrastructureScannerOptions } from './infrastructure-scanner.js';
import type { RedactionRulesEngine, RedactionScope } from './redaction-rules.js';

// ── Types ───────────────────────────────────────────────

export type SanitizeMode = 'logs' | 'config' | 'prompt' | 'incident';

export interface SanitizeOptions {
  /** Custom redaction rules engine (loaded from files). */
  customRules?: RedactionRulesEngine;
  /** Infrastructure scanner options. */
  infrastructure?: InfrastructureScannerOptions;
  /** Whether to enable PII redaction (default: true). */
  piiRedaction?: boolean;
  /** Whether to enable secret redaction (default: true). */
  secretRedaction?: boolean;
}

export interface SanitizeResult {
  /** The sanitized output. */
  readonly sanitized: string;
  /** Summary of what was detected and redacted. */
  readonly summary: SanitizeSummary;
}

export interface SanitizeSummary {
  /** Detections grouped by scanner ID. */
  readonly byScanner: Record<string, number>;
  /** Whether the output still contains potential unredacted content. */
  readonly hasUnredactedWarnings: boolean;
  /** Rule IDs that fired (from custom rules). */
  readonly ruleIds: string[];
  /** Total number of detections across all scanners. */
  readonly totalDetections: number;
}

// ── Mode presets ────────────────────────────────────────

interface ModeConfig {
  infrastructure: InfrastructureScannerOptions;
  piiRedaction: boolean;
  secretRedaction: boolean;
}

const MODE_CONFIGS: Record<SanitizeMode, ModeConfig> = {
  logs: {
    infrastructure: {
      hostnames: true,
      kubernetes: true,
      paths: true,
      stackTraces: true,
      ports: true,
      urls: true,
      labels: true
    },
    piiRedaction: true,
    secretRedaction: true
  },
  config: {
    infrastructure: {
      hostnames: true,
      kubernetes: false,
      paths: false,
      stackTraces: false,
      ports: true,
      urls: true,
      labels: true
    },
    piiRedaction: false,
    secretRedaction: true
  },
  prompt: {
    infrastructure: {
      hostnames: false,
      kubernetes: false,
      paths: false,
      stackTraces: false,
      ports: false,
      urls: false,
      labels: false
    },
    piiRedaction: true,
    secretRedaction: true
  },
  incident: {
    infrastructure: {
      hostnames: true,
      kubernetes: true,
      paths: true,
      stackTraces: true,
      ports: true,
      urls: true,
      labels: true
    },
    piiRedaction: true,
    secretRedaction: true
  }
};

// ── Sanitize Engine ─────────────────────────────────────

/**
 * Sanitize input text according to the specified mode and options.
 *
 * @param input — Raw text to sanitize.
 * @param mode — Sanitization mode (logs, config, prompt, incident).
 * @param options — Optional overrides.
 * @returns Sanitized text with summary.
 */
export async function sanitize(
  input: string,
  mode: SanitizeMode = 'logs',
  options?: SanitizeOptions
): Promise<SanitizeResult> {
  const modeConfig = MODE_CONFIGS[mode];
  const scanners: GuardrailScanner[] = [];
  const byScanner: Record<string, number> = {};
  const ruleIds: string[] = [];
  let totalDetections = 0;

  // Build scanner pipeline
  if (options?.piiRedaction ?? modeConfig.piiRedaction) {
    scanners.push(new PIIScanner());
  }

  if (options?.secretRedaction ?? modeConfig.secretRedaction) {
    scanners.push(new SecretDetectionScanner());
  }

  scanners.push(new InfrastructureScanner(options?.infrastructure ?? modeConfig.infrastructure));

  // Apply guardrail scanners
  let result = input;
  for (const scanner of scanners) {
    try {
      const scanResult = await scanner.evaluate(result);
      if (scanResult.status === 'transform' && scanResult.sanitized) {
        result = scanResult.sanitized;
      }
      if (scanResult.detections) {
        for (const detection of scanResult.detections) {
          totalDetections++;
          const id = detection.id;
          byScanner[id] = (byScanner[id] ?? 0) + 1;
        }
      }
    } catch {
      // Scanner error — continue with current result
    }
  }

  // Apply custom redaction rules
  if (options?.customRules) {
    const { matches, sanitized } = options.customRules.apply(result, mode as RedactionScope);
    for (const match of matches) {
      ruleIds.push(match.id);
      totalDetections++;
    }
    result = sanitized;
  }

  // Check for unredacted warnings
  const hasUnredactedWarnings = checkUnredactedWarnings(result);

  const summary: SanitizeSummary = {
    totalDetections,
    byScanner,
    ruleIds,
    hasUnredactedWarnings
  };

  return { sanitized: result, summary };
}

/**
 * Check if the sanitized output still contains potential unredacted content.
 */
function checkUnredactedWarnings(text: string): boolean {
  const warningPatterns = [
    /\b(?:https?:\/\/|http:\/\/)\S+/gi, // URLs
    /\b(?:bearer|Bearer)\s+[A-Za-z0-9._-]{10,}/g, // Bearer tokens
    /\b(?:eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/g, // JWT tokens
    /\b(?:-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----)/g, // Private keys
    /\b(?:ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9_]{36,}/g, // GitHub tokens
    /\b(?:xox[abprs]-[A-Za-z0-9-]{10,})/g // Slack tokens
  ];

  for (const pattern of warningPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      return true;
    }
  }

  return false;
}
