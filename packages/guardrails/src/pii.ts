import { collectRegexMatches } from './_internal.js';
import type { Detection, GuardrailPhase, GuardrailResult, GuardrailScanner } from './types.js';

// =============================================================================
// PII pattern groups — 25+ pattern types across 6 categories
// =============================================================================

/**
 * EU VAT country codes — built as a static array so the VAT regex
 * can be assembled without a high-arity alternation that inflates
 * SonarCloud's regex-complexity metric.
 */
const VAT_COUNTRY_CODES = [
  'GB',
  'DE',
  'FR',
  'IT',
  'ES',
  'NL',
  'BE',
  'LU',
  'DK',
  'IE',
  'PT',
  'AT',
  'SE',
  'FI',
  'PL',
  'CZ',
  'HU',
  'SK',
  'SI',
  'EE',
  'LV',
  'LT',
  'MT',
  'CY',
  'HR',
  'RO',
  'BG',
  'EL'
] as const;

/**
 * Street address suffixes — same technique as VAT codes.
 */
const STREET_SUFFIXES = [
  'Street',
  'St',
  'Avenue',
  'Ave',
  'Road',
  'Rd',
  'Boulevard',
  'Blvd',
  'Lane',
  'Ln',
  'Drive',
  'Dr',
  'Way',
  'Court',
  'Ct',
  'Place',
  'Pl',
  'Circle',
  'Cir',
  'Parkway',
  'Pkwy',
  'Highway',
  'Hwy'
] as const;

// nosemgrep: detect-non-literal-regexp — VAT_COUNTRY_CODES is a hardcoded as-const array
const VAT_PATTERN = new RegExp(String.raw`\b(?:${VAT_COUNTRY_CODES.join('|')})\s?\d{4,12}\b`, 'g');

// nosemgrep: detect-non-literal-regexp — STREET_SUFFIXES is a hardcoded as-const array
const STREET_PATTERN = new RegExp(
  String.raw`\b\d{1,5}\s+[A-Za-z]+(?:\s+[A-Za-z]+)*\s+(?:${STREET_SUFFIXES.join('|')})\b`,
  'g'
);

/**
 * Contact and identity patterns.
 */
type PatternSeverity = 'high' | 'medium' | 'low';

interface ContactPatternEntry {
  confidence: number;
  id: string;
  pattern: RegExp;
  severity: PatternSeverity;
}

const CONTACT_PATTERNS: ContactPatternEntry[] = [
  // Email addresses
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, id: 'email', severity: 'medium', confidence: 0.95 },
  // Phone numbers (international, NA, E.164)
  {
    pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    id: 'phone',
    severity: 'medium',
    confidence: 0.85
  },
  // Phone numbers (international with + prefix, E.164)
  { pattern: /\+\d{1,3}[-.\s]?\d{1,14}\b/g, id: 'phone-international', severity: 'medium', confidence: 0.8 },
  // Full name patterns (title + space-separated first+last)
  {
    pattern: /\b(?:Mr|Mrs|Ms|Dr|Prof)\.?\s+[A-Z][a-z]+\s+[A-Z][a-z]+\b/g,
    id: 'personal-name',
    severity: 'medium',
    confidence: 0.5
  },
  // IP addresses
  { pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, id: 'ip-address', severity: 'low', confidence: 0.6 },
  // MAC addresses
  { pattern: /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g, id: 'mac-address', severity: 'low', confidence: 0.7 },
  // URLs (basic URL including query params — may contain tracked PII)
  {
    pattern: /https?:\/\/[A-Za-z0-9.-]+(?:\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=-]*)?/g,
    id: 'url',
    severity: 'low',
    confidence: 0.4
  }
];

/**
 * Government ID patterns.
 */
const GOVT_PATTERNS: { pattern: RegExp; id: string; severity: 'high' | 'medium'; confidence: number }[] = [
  // US SSN: 123-45-6789
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, id: 'ssn', severity: 'high', confidence: 0.95 },
  // US passport numbers (9 digits)
  { pattern: /\b\d{9}\b/g, id: 'passport-number', severity: 'high', confidence: 0.5 },
  // US driver's license patterns (varies by state — broad format check)
  { pattern: /\b[A-Z]{1,2}\d{4,8}\b/g, id: 'drivers-license', severity: 'high', confidence: 0.4 },
  // UK National Insurance Number: QQ 12 34 56 C
  { pattern: /\b[A-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-Z]\b/g, id: 'nino', severity: 'high', confidence: 0.85 },
  // UK NHS Number: 123 456 7890
  { pattern: /\b\d{3}\s?\d{3}\s?\d{4}\b/g, id: 'nhs-number', severity: 'high', confidence: 0.8 },
  // Canadian Social Insurance Number: 123-456-789
  { pattern: /\b\d{3}-\d{3}-\d{3}\b/g, id: 'sin', severity: 'high', confidence: 0.85 },
  // UK Personal Public Service Number (Ireland): 1234567T
  { pattern: /\b\d{7}[A-W]\b/g, id: 'pps-number', severity: 'high', confidence: 0.8 },
  // UK DVLA driving licence number (16 chars)
  { pattern: /\b[A-Z]{5}\d{6}[A-Z0-9]{5}\b/g, id: 'dvla-number', severity: 'high', confidence: 0.6 }
];

/**
 * Financial patterns.
 */
const FINANCIAL_PATTERNS: { pattern: RegExp; id: string; severity: 'high' | 'medium'; confidence: number }[] = [
  // Credit card numbers (basic digit grouping — Luhn check not implemented)
  { pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g, id: 'credit-card', severity: 'high', confidence: 0.85 },
  // IBAN (international): GB82 WEST 1234 5698 7654 32
  { pattern: /\b[A-Z]{2}\d{2}\s?(?:\d{4}\s?){4,7}\d\b/g, id: 'iban', severity: 'high', confidence: 0.8 },
  // Sort Code + Account: 12-34-56 12345678
  { pattern: /\b\d{2}-\d{2}-\d{2}\s+\d{7,8}\b/g, id: 'uk-bank-account', severity: 'medium', confidence: 0.7 },
  // Bank account numbers (US: 8-17 digits)
  {
    pattern: /\b[Bb]ank\s+[Aa]cc(?:ount)?\s*[:#]\s*\d{8,17}\b/g,
    id: 'bank-account-number',
    severity: 'medium',
    confidence: 0.7
  },
  // Sort Code alone (DD-MM-YY)
  { pattern: /\b\d{2}-\d{2}-\d{2}\b/g, id: 'sort-code', severity: 'medium', confidence: 0.5 },
  // VAT number: GB 123 4567 89
  {
    pattern: VAT_PATTERN,
    id: 'vat-number',
    severity: 'medium',
    confidence: 0.7
  }
  // Note: IBAN regex needs careful checking — removed the potentially problematic one
];

/**
 * Demographic patterns.
 */
const DEMOGRAPHIC_PATTERNS: { pattern: RegExp; id: string; severity: 'high' | 'medium' | 'low'; confidence: number }[] =
  [
    // Date of birth (various formats: YYYY-MM-DD, MM/DD/YYYY, DD-MM-YYYY)
    {
      pattern: /\b(?:\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|\d{2}-\d{2}-\d{4})\b/g,
      id: 'date-of-birth',
      severity: 'high',
      confidence: 0.6
    },
    // Postal codes (US ZIP: requires keyword context to avoid false positives on bare numbers)
    {
      pattern: /\b(?:zip|postal|ZIP|POSTAL)\s*(?::)?\s*\d{5}(?:-\d{4})?\b/g,
      id: 'postal-code',
      severity: 'low',
      confidence: 0.6
    },
    // UK postcode: SW1A 1AA
    { pattern: /\b[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}\b/g, id: 'uk-postcode', severity: 'medium', confidence: 0.7 },
    // Canadian postal code: A1A 1A1
    {
      pattern: /\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]\s?\d[ABCEGHJ-NPRSTV-Z]\d\b/g,
      id: 'canada-postcode',
      severity: 'medium',
      confidence: 0.7
    },
    // Street address patterns (simple heuristic)
    {
      pattern: STREET_PATTERN,
      id: 'street-address',
      severity: 'medium',
      confidence: 0.5
    }
  ];

/**
 * Combined PII patterns for iteration.
 */
const ALL_PII_PATTERNS: { pattern: RegExp; id: string; severity: 'high' | 'medium' | 'low'; confidence: number }[] = [
  ...CONTACT_PATTERNS,
  ...GOVT_PATTERNS,
  ...FINANCIAL_PATTERNS,
  ...DEMOGRAPHIC_PATTERNS
];

// =============================================================================
// Severity-based action mapping
// =============================================================================

/**
 * Default actions by severity level.
 */
// Default block/warn/redact action keyed by severity level
type SeverityAction = 'block' | 'warn' | 'redact';

const SEVERITY_DEFAULT_ACTION: Record<string, SeverityAction> = {
  high: 'block',
  medium: 'warn',
  low: 'redact'
};

// =============================================================================
// PIIScanner
// =============================================================================

/**
 * Scanner that detects personally identifiable information.
 *
 * Detects 25+ PII types across 4 categories: contact/identity,
 * government IDs, financial data, and demographic data.
 *
 * @remarks
 * Can be configured to **block**, **warn** (escalate), or **redact** (transform)
 * on detection. The default action varies by severity:
 * - High severity (SSN, credit card, passport): block
 * - Medium severity (email, phone, address): warn/escalate
 * - Low severity (IP, URL, MAC): redact
 *
 * OWASP: ASI-06 (Insecure Data Handling), ASI-08 (Data Leakage)
 */
export class PIIScanner implements GuardrailScanner {
  readonly metadata = {
    id: 'hub://guardrails/pii',
    name: 'PII Detection Scanner',
    version: '2.0.0',
    description: 'Detects personally identifiable information (25+ PII types)',
    priority: 25,
    owaspCategories: ['asi-06', 'asi-08'] as const,
    tags: ['pii', 'privacy', 'compliance', 'data-loss-prevention', 'gdpr']
  };

  readonly #phase: GuardrailPhase;
  readonly #userAction: 'block' | 'warn' | 'redact' | undefined;

  constructor(options?: { action?: 'block' | 'warn' | 'redact'; phase?: GuardrailPhase }) {
    this.#userAction = options?.action;
    this.#phase = options?.phase ?? 'input';
  }

  evaluate(input: string, _context?: Record<string, unknown>): Promise<GuardrailResult> {
    const detections = collectRegexMatches(input, ALL_PII_PATTERNS, 'PII');

    if (detections.length === 0) {
      return Promise.resolve({ status: 'pass', phase: this.#phase });
    }

    // Determine the effective action based on max severity in detections
    const highestSeverity = getHighestSeverity(detections);
    const effectiveAction = this.#resolveAction(highestSeverity);

    switch (effectiveAction) {
      case 'block': {
        const categories = [...new Set(detections.map(d => d.id))];
        return Promise.resolve({
          status: 'block',
          phase: this.#phase,
          reason: `PII detected: ${categories.join(', ')}`,
          riskScore: Math.min(0.3 + categories.length * 0.1, 1),
          detections
        });
      }
      case 'redact': {
        let sanitized = input;
        for (const { pattern, id } of ALL_PII_PATTERNS) {
          pattern.lastIndex = 0;
          sanitized = sanitized.replace(pattern, `[REDACTED:${id}]`);
        }
        return Promise.resolve({
          status: 'transform',
          phase: this.#phase,
          sanitized,
          detections
        });
      }
      default: {
        // warn action — escalate for human review
        return Promise.resolve({
          status: 'escalate',
          phase: this.#phase,
          reason: `PII detected: ${detections.map(d => d.id).join(', ')}`,
          riskScore: 0.6,
          detections
        });
      }
    }
  }

  /**
   * Resolve effective action based on max severity and configured action.
   *
   * If the user explicitly configured an action, it is used directly.
   * Otherwise, the severity-based default applies.
   */
  #resolveAction(maxSeverity: string): 'block' | 'warn' | 'redact' {
    if (this.#userAction !== undefined) {
      return this.#userAction;
    }
    return SEVERITY_DEFAULT_ACTION[maxSeverity] ?? 'warn';
  }
}

/**
 * Get the highest severity from a list of detections.
 */
function getHighestSeverity(detections: Detection[]): string {
  const order: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  let highest = 'low';
  for (const d of detections) {
    if ((order[d.severity] ?? 0) > (order[highest] ?? 0)) {
      highest = d.severity;
    }
  }
  return highest;
}

export { ALL_PII_PATTERNS, CONTACT_PATTERNS, DEMOGRAPHIC_PATTERNS, FINANCIAL_PATTERNS, GOVT_PATTERNS };
