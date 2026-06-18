/**
 * Infrastructure-details scanner for local trust sanitization.
 *
 * Detects internal hostnames, Kubernetes namespaces, pod names,
 * filesystem paths, stack traces, ports, and service discovery labels
 * that should be redacted before sharing logs, configs, or incident artifacts.
 *
 * @module
 */

import type { Detection, GuardrailResult, GuardrailScanner } from '../types.js';

// ── Pattern Groups ─────────────────────────────────────

/**
 * Internal hostname patterns — matches common internal TLDs and service names.
 */
const INTERNAL_HOSTNAME_PATTERN =
  /\b(?:[a-zA-Z][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])\.(?:internal|local|localhost|corp|intranet|lan|private|dev|staging|test|docker|consul|service|svc|kube|cluster|pod|node)\b/gi;

/**
 * Kubernetes resource identifiers.
 */
const K8S_PATTERN =
  /\b(?:kube-system|kube-public|kube-node-lease|kube-[a-z]+|namespace\/[a-z][a-z0-9-]{0,61}[a-z0-9]|pod\/[a-z][a-z0-9-]{0,61}[a-z0-9]|deployment\/[a-z][a-z0-9-]{0,61}[a-z0-9]|service\/[a-z][a-z0-9-]{0,61}[a-z0-9]|statefulset\/[a-z][a-z0-9-]{0,61}[a-z0-9]|daemonset\/[a-z][a-z0-9-]{0,61}[a-z0-9]|configmap\/[a-z][a-z0-9-]{0,61}[a-z0-9]|secret\/[a-z][a-z0-9-]{0,61}[a-z0-9]|ingress\/[a-z][a-z0-9-]{0,61}[a-z0-9]|cronjob\/[a-z][a-z0-9-]{0,61}[a-z0-9]|job\/[a-z][a-z0-9-]{0,61}[a-z0-9])\b/gi;

/**
 * Filesystem path patterns — absolute and repo-relative paths.
 */
const FILESYSTEM_PATH_PATTERN =
  /(?:\/(?:home|Users|root|tmp|var|opt|etc|usr|mnt|data|app|srv|backup|export|nfs|mnt|run|dev|proc|sys)(?:\/[^\s"'`)\]},;:]{1,255})?)/gi;

/**
 * Stack trace line patterns — file paths with line numbers.
 */
const STACK_TRACE_PATTERN = /\s+at\s+(?:\S+\s+)?\(?(?:\/[^\s"'`)\]},;:]+):(\d+)(?::(\d+))?\)?/gi;

/**
 * Port and service endpoint patterns.
 */
const PORT_PATTERN = /\b(?::(\d{4,5})\b|port[:\s]*(\d{4,5})|listen[:\s]*(\d{4,5})|bind[:\s]*(\d{4,5}))(?:\s|$|,|\))/gi;

/**
 * Internal URL patterns — vanity domains and service URLs.
 */
const INTERNAL_URL_PATTERN =
  /\b(?:https?:\/\/)?(?:[a-z][a-z0-9-]{0,61})\.(?:internal|local|corp|intranet|svc|cluster\.local)(?::\d{2,5})?(?:\/[^\s"'`)\]},;:]*)?/gi;

/**
 * Service discovery labels — common patterns for service mesh and orchestration.
 */
const SERVICE_LABEL_PATTERN =
  /\b(?:service\.(?:name|type|account|port|cluster|namespace|selector|label)|app\.(?:kubernetes\.io|instance|name|version)|helm\.sh\/chart|app\.kubernetes\.io\/[a-z-]+|traefik\.(?:frontend|backend|service)|envoy\.(?:cluster|service|route))\s*[:=]\s*['"]?[a-zA-Z0-9_.-/]+['"]?/gi;

// ── Scanner ────────────────────────────────────────────

export interface InfrastructureScannerOptions {
  /** Enable hostname detection (default: true). */
  hostnames?: boolean;
  /** Enable Kubernetes resource detection (default: true). */
  kubernetes?: boolean;
  /** Enable service label detection (default: true). */
  labels?: boolean;
  /** Enable filesystem path detection (default: true). */
  paths?: boolean;
  /** Enable port detection (default: true). */
  ports?: boolean;
  /** Enable stack trace detection (default: true). */
  stackTraces?: boolean;
  /** Enable internal URL detection (default: true). */
  urls?: boolean;
}

/**
 * Infrastructure-details scanner for local trust sanitization.
 *
 * Detects and redacts internal infrastructure details that should
 * not be shared outside the organization.
 */
export class InfrastructureScanner implements GuardrailScanner {
  readonly metadata = {
    id: 'hub://guardrails/infrastructure@1.0',
    name: 'Infrastructure Details Scanner',
    description: 'Detects internal hostnames, k8s resources, filesystem paths, stack traces, ports, and service labels',
    priority: 30,
    version: '1.0',
    tags: ['infrastructure', 'sanitize', 'local-trust'],
    owaspCategories: ['asi-06'] as const
  };

  readonly #options: Required<InfrastructureScannerOptions>;

  constructor(options?: InfrastructureScannerOptions) {
    this.#options = {
      hostnames: options?.hostnames ?? true,
      kubernetes: options?.kubernetes ?? true,
      paths: options?.paths ?? true,
      stackTraces: options?.stackTraces ?? true,
      ports: options?.ports ?? true,
      urls: options?.urls ?? true,
      labels: options?.labels ?? true
    };
  }

  evaluate(input: string, _context?: Record<string, unknown>): GuardrailResult {
    const detections: Detection[] = [];

    if (this.#options.hostnames) {
      this.#collectMatches(input, INTERNAL_HOSTNAME_PATTERN, 'internal-hostname', 'medium', detections);
    }

    if (this.#options.kubernetes) {
      this.#collectMatches(input, K8S_PATTERN, 'k8s-resource', 'high', detections);
    }

    if (this.#options.paths) {
      this.#collectMatches(input, FILESYSTEM_PATH_PATTERN, 'filesystem-path', 'medium', detections);
    }

    if (this.#options.stackTraces) {
      this.#collectMatches(input, STACK_TRACE_PATTERN, 'stack-trace', 'medium', detections);
    }

    if (this.#options.ports) {
      this.#collectMatches(input, PORT_PATTERN, 'port-number', 'low', detections);
    }

    if (this.#options.urls) {
      this.#collectMatches(input, INTERNAL_URL_PATTERN, 'internal-url', 'high', detections);
    }

    if (this.#options.labels) {
      this.#collectMatches(input, SERVICE_LABEL_PATTERN, 'service-label', 'medium', detections);
    }

    if (detections.length === 0) {
      return { status: 'pass', phase: 'input' };
    }

    // Redact all detected infrastructure details
    let sanitized = input;
    for (const detection of detections) {
      if (detection.snippet) {
        sanitized = sanitized.replaceAll(detection.snippet, `[${detection.id.toUpperCase()}]`);
      }
    }

    return {
      status: 'transform',
      phase: 'input',
      sanitized,
      detections,
      transformReason: 'redaction'
    };
  }

  #collectMatches(
    input: string,
    pattern: RegExp,
    id: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    detections: Detection[]
  ): void {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    for (;;) {
      const match = pattern.exec(input);
      if (match === null) {
        break;
      }
      detections.push({
        id,
        severity,
        description: `Infrastructure detail: ${id}`,
        snippet: match[0],
        start: match.index,
        end: match.index + match[0].length,
        confidence: 0.8
      });
    }
  }
}
