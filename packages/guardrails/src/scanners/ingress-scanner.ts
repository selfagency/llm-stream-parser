import type { Detection, GuardrailResult, GuardrailScanner } from '../types.js';

/**
 * Configuration for IngressScanner.
 */
export interface IngressScannerConfig {
  /**
   * Maximum content size in bytes before disk-spilling.
   * Default 10 MB.
   */
  maxInlineSizeBytes?: number;
  /**
   * Whether to enable http_fetch response scanning.
   * Default true.
   */
  scanHttpFetch?: boolean;
  /**
   * Whether to enable MCP stdio response scanning.
   * Default true.
   */
  scanMcpResponses?: boolean;
}

const DEFAULT_CONFIG: Required<IngressScannerConfig> = {
  maxInlineSizeBytes: 10 * 1024 * 1024,
  scanMcpResponses: true,
  scanHttpFetch: true
} as const;

/**
 * Prompt injection patterns for incoming content (model responses, MCP, HTTP).
 *
 * These patterns detect reverse injections: content received FROM external
 * systems that attempts to manipulate the agent's behavior. Distinct from
 * user-input injection patterns because the attack surface differs —
 * external responses carry returned data, not user commands.
 */
const INGRESS_PATTERNS: { pattern: RegExp; id: string; severity: 'high' | 'medium' | 'critical' }[] = [
  // Embedded instruction overrides in returned content
  {
    pattern: /\byou\s+are\s+(?:now|henceforth)\s+.+\bignore\s+(?:above|prior)\s+(?:instructions|rules)\b/i,
    id: 'ingress-instruction-override',
    severity: 'critical'
  },
  {
    pattern: /\bignore\s+(?:all\s+)?(?:previous|prior)\s+(?:instructions|context|directions)\b/i,
    id: 'ingress-ignore-context',
    severity: 'critical'
  },
  // Data injection in returned JSON/text
  {
    pattern:
      /\b(?:consider|treat|process)\s+(?:this|the\s+following)\s+(?:as\s+)?(?:a\s+)?(?:system|new\s+primary)\s+(?:prompt|instruction)\b/i,
    id: 'ingress-role-elevation',
    severity: 'high'
  },
  // Token extraction camouflage in fetched content
  {
    pattern: /\b(?:ignore\s+(?:all\s+)?previous|new\s+instructions?\s+follow)\b/i,
    id: 'ingress-new-instructions',
    severity: 'high'
  },
  {
    pattern: /\boutput\s+(?:your|the)\s+(?:system\s+)?(?:prompt|instructions?)\b/i,
    id: 'ingress-system-extraction',
    severity: 'high'
  },
  // Delimiter-based injection in MCP/HTTP responses
  { pattern: /```\s*\n?\s*<\|im_start\|>/, id: 'ingress-delimiter-response', severity: 'critical' },
  {
    pattern: /\b(?:this\s+is\s+an?\s+order|you\s+must\s+now|do\s+this\s+immediately)\b/i,
    id: 'ingress-authority-claim',
    severity: 'high'
  },
  // Data disguised as instructions
  {
    pattern: /\b(?:system:\s+|instruction:\s+|command:\s+)(?:ignore|override|disregard|replace)\b/i,
    id: 'ingress-disguised-command',
    severity: 'high'
  }
];

/**
 * IngressScanner — Phase 10 §15.7
 *
 * Scans incoming content (model responses, MCP stdio, http_fetch) for
 * prompt injection patterns. Handles oversized content via disk-spill.
 *
 * Runs on the ingress phase — content entering the agent's context
 * from external sources.
 */
export class IngressScanner implements GuardrailScanner {
  readonly metadata = {
    id: 'hub://guardrails/ingress',
    name: 'Ingress Scanner',
    description: 'Scans incoming content (model responses, MCP, HTTP) for prompt injection patterns',
    priority: 14,
    version: '1.0.0',
    tags: ['ingress', 'prompt-injection', 'mcp', 'http-fetch'] as const,
    owaspCategories: ['asi-01'] as const
  };

  readonly #config: Required<IngressScannerConfig>;

  constructor(config?: IngressScannerConfig) {
    this.#config = { ...DEFAULT_CONFIG, ...config };
  }

  evaluate(input: string, context?: Record<string, unknown>): GuardrailResult {
    const source = typeof context?.source === 'string' ? context.source : undefined;
    const size = new TextEncoder().encode(input).length;

    // Skip non-ingress sources if configured
    if (source === 'mcp' && !this.#config.scanMcpResponses) {
      return { status: 'pass', phase: 'output' };
    }
    if (source === 'http_fetch' && !this.#config.scanHttpFetch) {
      return { status: 'pass', phase: 'output' };
    }

    // Disk-spill for oversized content
    if (size > this.#config.maxInlineSizeBytes) {
      return oversizedQuarantine(size, this.#config.maxInlineSizeBytes);
    }

    const detections = scanIngressPatterns(input);
    if (detections.length === 0) {
      return { status: 'pass', phase: 'output' };
    }
    if (detections.some(d => d.severity === 'critical')) {
      return {
        status: 'block',
        phase: 'output',
        reason: `Ingress content blocked: ${detections.map(d => d.id).join(', ')}`,
        detections
      };
    }
    return {
      status: 'quarantine',
      phase: 'output',
      reason: `Ingress content quarantined: ${detections.map(d => d.id).join(', ')}`,
      detections,
      quarantineId: `ingress-${Date.now()}`
    };
  }
}

function oversizedQuarantine(size: number, maxInlineSizeBytes: number): GuardrailResult {
  return {
    status: 'quarantine',
    phase: 'output',
    reason: `Ingress content too large (${(size / 1024 / 1024).toFixed(1)} MB exceeds ${(maxInlineSizeBytes / 1024 / 1024).toFixed(0)} MB limit). Quarantined for review.`,
    detections: [
      {
        id: 'ingress-content-too-large',
        severity: 'medium',
        description: `Content size ${(size / 1024 / 1024).toFixed(1)} MB exceeds inline scan limit`,
        confidence: 1.0
      }
    ],
    quarantineId: `ingress-${Date.now()}`
  };
}

function scanIngressPatterns(input: string): Detection[] {
  const detections: Detection[] = [];
  for (const entry of INGRESS_PATTERNS) {
    if (entry.pattern.test(input)) {
      detections.push({
        id: entry.id,
        severity: entry.severity,
        description: `${entry.severity === 'critical' ? 'Critical' : 'High'} ingress injection pattern: ${entry.id}`,
        confidence: entry.severity === 'critical' ? 0.9 : 0.7,
        snippet: input.slice(0, 200)
      });
    }
  }
  return detections;
}
