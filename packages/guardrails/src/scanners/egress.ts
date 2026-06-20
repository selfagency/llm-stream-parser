/**
 * EgressScanner — validates outbound network requests.
 *
 * Enforces URL allowlists, request-size limits, and re-scans
 * outbound payloads for PII/secrets.
 *
 * @module
 */

import type { Detection, GuardrailPhase, GuardrailResult, GuardrailScanner, OWASPCategory } from '../types.js';

// =============================================================================
// Types
// =============================================================================

interface EgressInput {
  readonly body?: string;
  readonly headers?: Record<string, string>;
  readonly method: string;
  readonly requestSizeBytes: number;
  readonly url: string;
}

interface EgressConfig {
  readonly egressAllowList: readonly string[];
  readonly maxRequestSizeBytes?: number;
  readonly scanForSecrets?: boolean;
  readonly sensitiveHeaders?: readonly string[];
}

// =============================================================================
// Detection helpers
// =============================================================================

function detection(id: string, severity: Detection['severity'], description: string, confidence: number): Detection {
  return { id, severity, description, confidence };
}

// =============================================================================
// Config / constants
// =============================================================================

const DEFAULT_EGRESS_CONFIG: EgressConfig = {
  egressAllowList: ['block-all'],
  maxRequestSizeBytes: 10_485_760,
  scanForSecrets: true,
  sensitiveHeaders: ['authorization', 'cookie', 'set-cookie', 'x-api-key']
};

const SECRET_PATTERNS = [
  /\b[A-Za-z0-9]{32,}\b/,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  /\b(?:api[_-]?key|apikey|token|auth)[:\s]*[A-Za-z0-9._+/~-]{20,}\b/i,
  /\bBearer\s+[A-Za-z0-9._+/~-]{20,}\b/i,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
  /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/,
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/
];

const EXFIL_PATTERNS = [
  /curl.*pipe.*ssh/i,
  /wget.*upload/i,
  /tar.*create.*backup/i,
  /rsync.*-avz/i,
  /git.*push.*remote/i
];

const MODIFYING_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

const HIGH_RISK_DOMAINS = ['github.com', 'gitlab.com', 'api.heroku.com', 'api.aws.amazon.com'];

// =============================================================================
// Validation functions
// =============================================================================

function checkAllowlist(config: EgressConfig, url: string, detections: Detection[]): 'allow' | 'block' {
  if (config.egressAllowList.includes('block-all')) {
    return 'block';
  }
  if (!config.egressAllowList.some(allowedUrl => url.startsWith(allowedUrl))) {
    detections.push(detection('egress-blocked-url', 'high', `Request to disallowed URL: ${url}`, 0.95));
    return 'block';
  }
  return 'allow';
}

function checkSizeLimit(config: EgressConfig, requestSizeBytes: number, detections: Detection[]): 'allow' | 'block' {
  const maxSize = config.maxRequestSizeBytes ?? 10_485_760;
  if (requestSizeBytes > maxSize) {
    detections.push(
      detection('egress-oversized', 'high', `Request exceeds size limit (${requestSizeBytes} > ${maxSize} bytes)`, 1.0)
    );
    return 'block';
  }
  return 'allow';
}

function checkSensitiveHeaders(
  headers: Record<string, string> | undefined,
  sensitiveHeaders: readonly string[],
  detections: Detection[]
): void {
  for (const [header] of Object.entries(headers ?? {})) {
    if (sensitiveHeaders.includes(header.toLowerCase())) {
      detections.push(
        detection('egress-sensitive-header', 'medium', `Sensitive header in outbound request: ${header}`, 0.8)
      );
    }
  }
}

function scanForSecrets(body: string | undefined, detections: Detection[]): void {
  if (!body) {
    return;
  }
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(body)) {
      detections.push(
        detection('egress-secret-in-body', 'high', 'Potential secret or PII detected in outbound body', 0.75)
      );
      break;
    }
  }
  for (const pattern of EXFIL_PATTERNS) {
    if (pattern.test(body)) {
      detections.push(detection('egress-exfil-pattern', 'high', 'Potential data exfiltration pattern detected', 0.8));
    }
  }
}

function checkHighRiskDomains(url: string, method: string, detections: Detection[]): void {
  if (!MODIFYING_METHODS.has(method.toUpperCase())) {
    return;
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return;
  }
  const isHighRisk = HIGH_RISK_DOMAINS.some(
    d => parsedUrl.hostname.endsWith(d) || parsedUrl.hostname.includes(`.${d}`)
  );
  if (isHighRisk) {
    detections.push(
      detection(
        'egress-high-risk-domain',
        'medium',
        `Modifying request (${method}) to high-risk domain: ${parsedUrl.hostname}`,
        0.7
      )
    );
  }
}

// =============================================================================
// EgressScanner
// =============================================================================

export class EgressScanner implements GuardrailScanner {
  readonly metadata = {
    id: 'hub://guardrails/egress',
    name: 'Egress Scanner',
    description: 'Validates outbound network requests against allowlist and size limits',
    priority: 32,
    version: '1.0.0',
    tags: ['egress', 'network', 'asi-06', 'asi-10'],
    owaspCategories: ['asi-06', 'asi-10'] as readonly OWASPCategory[]
  } as const;

  readonly phase: GuardrailPhase = 'egress';

  private readonly config: EgressConfig;

  constructor(config: Partial<EgressConfig> = {}) {
    this.config = { ...DEFAULT_EGRESS_CONFIG, ...config };
  }

  evaluate(input: string, _context?: Record<string, unknown>): GuardrailResult | Promise<GuardrailResult> {
    let parsed: EgressInput;
    try {
      parsed = JSON.parse(input) as EgressInput;
    } catch {
      return { status: 'pass', phase: 'egress' };
    }

    const { url, method, body, headers, requestSizeBytes } = parsed;
    const detections: Detection[] = [];
    const sensitiveHeaders = this.config.sensitiveHeaders ?? ['authorization', 'cookie', 'set-cookie', 'x-api-key'];

    // 1. URL allowlist
    if (checkAllowlist(this.config, url, detections) === 'block') {
      return { status: 'block', phase: 'egress', reason: `Egress blocked: URL not in allowlist (${url})`, detections };
    }

    // 2. Size limit
    if (checkSizeLimit(this.config, requestSizeBytes, detections) === 'block') {
      return {
        status: 'block',
        phase: 'egress',
        reason: `Egress blocked: request too large (${requestSizeBytes} bytes)`,
        detections
      };
    }

    // 3. Sensitive headers
    checkSensitiveHeaders(headers, sensitiveHeaders, detections);

    // 4. Secrets scan
    scanForSecrets(body, detections);

    // 5. High-risk domains
    checkHighRiskDomains(url, method, detections);

    // 6. Finalize
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
    return { status: 'pass', phase: 'egress' };
  }
}
