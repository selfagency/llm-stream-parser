/**
 * EgressScanner — validates outbound network requests.
 *
 * Enforces URL allowlists, request-size limits, and re-scans
 * outbound payloads for PII/secrets.
 *
 * @module
 */

import type { Detection, GuardrailPhase, GuardrailResult, GuardrailScanner, OWASPCategory } from '../types.js';

/**
 * Input to the egress scanner (parsed from JSON string).
 */
interface EgressInput {
  /** Request body (if applicable) */
  readonly body?: string;
  /** Request headers (for analysis) */
  readonly headers?: Record<string, string>;
  /** Request method (GET, POST, etc.) */
  readonly method: string;
  /** Request size in bytes */
  readonly requestSizeBytes: number;
  /** Request URL */
  readonly url: string;
}

/**
 * Configuration for the egress scanner.
 */
interface EgressConfig {
  /** URL allowlist (prefix match). If empty, all URLs are blocked by default. */
  readonly egressAllowList: readonly string[];
  /** Maximum request size in bytes (default 10MB). */
  readonly maxRequestSizeBytes?: number;
  /** Whether to scan for PII/secrets in outbound payloads (default true). */
  readonly scanForSecrets?: boolean;
  /** Sensitive headers to redact before logging (default: ['authorization', 'cookie', 'set-cookie']) */
  readonly sensitiveHeaders?: readonly string[];
}

/**
 * Predefined egress configuration.
 */
const DEFAULT_EGRESS_CONFIG: EgressConfig = {
  egressAllowList: ['block-all'],
  maxRequestSizeBytes: 10_485_760,
  scanForSecrets: true,
  sensitiveHeaders: ['authorization', 'cookie', 'set-cookie', 'x-api-key']
};

export class EgressScanner implements GuardrailScanner {
  readonly metadata = {
    id: 'hub://guardrails/egress',
    name: 'Egress Scanner',
    description: 'Validates outbound network requests against allowlist and size limits',
    priority: 30,
    version: '1.0.0',
    tags: ['egress', 'network', 'asi-06', 'asi-10'],
    owaspCategories: ['asi-06', 'asi-10'] as readonly OWASPCategory[]
  } as const;

  readonly phase: GuardrailPhase = 'egress';

  private readonly config: EgressConfig;

  constructor(config: Partial<EgressConfig> = {}) {
    this.config = {
      ...DEFAULT_EGRESS_CONFIG,
      ...config
    };
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Phase 10 refinement candidate
  evaluate(input: string, _context?: Record<string, unknown>): GuardrailResult | Promise<GuardrailResult> {
    let parsed: EgressInput;

    try {
      parsed = JSON.parse(input);
    } catch {
      return {
        status: 'pass',
        phase: 'egress',
        detections: []
      };
    }

    const { url, method, body, headers, requestSizeBytes } = parsed;
    const detections: Detection[] = [];

    // 1. URL allowlist check
    if (this.config.egressAllowList.includes('block-all')) {
      return {
        status: 'block',
        phase: 'egress',
        reason: 'Egress blocked: no URLs are allowed (configure egressAllowList in guardrails config)',
        detections: [
          {
            id: 'egress-block-all',
            severity: 'high',
            description: 'Egress is blocked by default',
            confidence: 1.0
          }
        ]
      };
    }

    const allowed = this.config.egressAllowList.some(allowedUrl => url.startsWith(allowedUrl));
    if (!allowed) {
      detections.push({
        id: 'egress-blocked-url',
        severity: 'high',
        description: `Request to disallowed URL: ${url}`,
        confidence: 0.95
      });
      return {
        status: 'block',
        phase: 'egress',
        reason: `Egress blocked: URL not in allowlist (${url})`,
        detections
      };
    }

    // 2. Request size limit check
    const maxSize = this.config.maxRequestSizeBytes ?? 10_485_760;
    if (requestSizeBytes > maxSize) {
      detections.push({
        id: 'egress-oversized',
        severity: 'high',
        description: `Request exceeds size limit (${requestSizeBytes} > ${maxSize} bytes)`,
        confidence: 1.0
      });
      return {
        status: 'block',
        phase: 'egress',
        reason: `Egress blocked: request too large (${requestSizeBytes} bytes)`,
        detections
      };
    }

    // 3. Sensitive header check
    const sensitiveHeaders = this.config.sensitiveHeaders ?? ['authorization', 'cookie', 'set-cookie', 'x-api-key'];
    for (const [header] of Object.entries(headers ?? {})) {
      if (sensitiveHeaders.includes(header.toLowerCase())) {
        detections.push({
          id: 'egress-sensitive-header',
          severity: 'medium',
          description: `Sensitive header in outbound request: ${header}`,
          confidence: 0.8
        });
      }
    }

    // 4. PII/secrets re-scan in outbound payload
    if (this.config.scanForSecrets !== false && body) {
      const secretPatterns = [
        /\b[A-Za-z0-9]{32,}\b/,
        /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
        /\b(?:api[_-]?key|apikey|token|auth)[:\s]*[A-Za-z0-9._+/~-]{20,}\b/i,
        /\bBearer\s+[A-Za-z0-9._+/~-]{20,}\b/i,
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
        /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/,
        /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/
      ];

      for (const pattern of secretPatterns) {
        const matches = body.match(new RegExp(pattern, 'g'));
        if (matches && matches.length > 0) {
          detections.push({
            id: 'egress-secret-in-body',
            severity: 'high',
            description: `Potential secret or PII detected in outbound body (${matches.length} matches)`,
            confidence: 0.75
          });
          break;
        }
      }

      const exfilPatterns = [
        /curl.*pipe.*ssh/i,
        /wget.*upload/i,
        /tar.*create.*backup/i,
        /rsync.*-avz/i,
        /git.*push.*remote/i
      ];

      for (const pattern of exfilPatterns) {
        if (pattern.test(body)) {
          detections.push({
            id: 'egress-exfil-pattern',
            severity: 'high',
            description: `Potential data exfiltration pattern detected: ${pattern}`,
            confidence: 0.8
          });
        }
      }
    }

    // 5. Check method restrictions (POST/PUT/DELETE on high-risk domains)
    const modifyingMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
    if (modifyingMethods.includes(method.toUpperCase())) {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return { status: 'pass', phase: 'egress', detections };
      }

      const highRiskDomains = ['github.com', 'gitlab.com', 'api.heroku.com', 'api.aws.amazon.com'];

      const isHighRiskDomain = highRiskDomains.some(
        d => parsedUrl.hostname.endsWith(d) || parsedUrl.hostname.includes(`.${d}`)
      );
      if (isHighRiskDomain) {
        detections.push({
          id: 'egress-high-risk-domain',
          severity: 'medium',
          description: `Modifying request (${method}) to high-risk domain: ${parsedUrl.hostname}`,
          confidence: 0.7
        });
      }
    }

    const highCount = detections.filter(d => d.severity === 'high').length;
    if (highCount > 0) {
      return {
        status: 'escalate',
        phase: 'egress',
        reason: 'High-risk egress issues detected',
        riskScore: 0.7,
        detections
      };
    }

    if (detections.length > 0) {
      return {
        status: 'escalate',
        phase: 'egress',
        reason: 'Egress validation issues detected',
        riskScore: 0.5,
        detections
      };
    }

    return { status: 'pass', phase: 'egress', detections };
  }
}
