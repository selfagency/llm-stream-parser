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
// Patterns are split into arrays of simple single-alternation regexes
// to avoid SonarCloud regex-complexity thresholds.

/** Internal hostname TLD suffixes. */
const INTERNAL_TLDS = [
  'internal',
  'local',
  'localhost',
  'corp',
  'intranet',
  'lan',
  'private',
  'dev',
  'staging',
  'test',
  'docker',
  'consul',
  'service',
  'svc',
  'kube',
  'cluster',
  'pod',
  'node'
];

/** Kubernetes resource name prefixes. */
const K8S_NAMESPACES = ['kube-system', 'kube-public', 'kube-node-lease'];

/** Kubernetes resource types. */
const K8S_RESOURCE_TYPES = [
  'namespace',
  'pod',
  'deployment',
  'service',
  'statefulset',
  'daemonset',
  'configmap',
  'secret',
  'ingress',
  'cronjob',
  'job'
];

/** Filesystem root directories. */
const FS_ROOTS = [
  'home',
  'Users',
  'root',
  'tmp',
  'var',
  'opt',
  'etc',
  'usr',
  'mnt',
  'data',
  'app',
  'srv',
  'backup',
  'export',
  'nfs',
  'run',
  'dev',
  'proc',
  'sys'
];

/** Service label prefixes. */
const SERVICE_LABEL_PREFIXES = [
  { prefix: 'service\\.', fields: ['name', 'type', 'account', 'port', 'cluster', 'namespace', 'selector', 'label'] },
  { prefix: 'app\\.', fields: ['kubernetes\\.io', 'instance', 'name', 'version'] },
  { prefix: 'helm\\.sh/', fields: ['chart'] }
];

const TRAEFIK_LABELS = ['traefik\\.frontend', 'traefik\\.backend', 'traefik\\.service'];
const ENVOY_LABELS = ['envoy\\.cluster', 'envoy\\.service', 'envoy\\.route'];

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
      this.#matchAll(input, this.#hostnamePatterns(), 'internal-hostname', 'medium', detections);
    }

    if (this.#options.kubernetes) {
      this.#matchAll(input, this.#k8sPatterns(), 'k8s-resource', 'high', detections);
    }

    if (this.#options.paths) {
      this.#matchAll(input, this.#pathPatterns(), 'filesystem-path', 'medium', detections);
    }

    if (this.#options.stackTraces) {
      const stackPattern = /\s+at\s+(?:\S+\s+)?\(?(?:\/[^\s"'`)\]},;:]+):(\d+)(?::(\d+))?\)?/gi;
      this.#matchAll(input, [stackPattern], 'stack-trace', 'medium', detections);
    }

    if (this.#options.ports) {
      const portPattern = /\bport[:\s]*(\d{4,5})\b|\blisten[:\s]*(\d{4,5})\b|\bbind[:\s]*(\d{4,5})\b/gi;
      this.#matchAll(input, [portPattern], 'port-number', 'low', detections);
    }

    if (this.#options.urls) {
      const urlPattern =
        /\b(?:https?:\/\/)?(?:[a-z][a-z0-9-]{0,61})\.(?:internal|local|corp|intranet|svc|cluster\.local)(?::\d{2,5})?(?:\/[^\s"'`)\]},;:]*)?/gi;
      this.#matchAll(input, [urlPattern], 'internal-url', 'high', detections);
    }

    if (this.#options.labels) {
      this.#matchAll(input, this.#labelPatterns(), 'service-label', 'medium', detections);
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

  /** Build an array of simple hostname-matching regexes, one per TLD. */
  #hostnamePatterns(): RegExp[] {
    return INTERNAL_TLDS.map(tld => new RegExp(`\\b(?:[a-zA-Z][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])\\.${tld}\\b`, 'gi'));
  }

  /** Build an array of simple k8s-resource-matching regexes. */
  #k8sPatterns(): RegExp[] {
    const patterns: RegExp[] = [];
    for (const ns of K8S_NAMESPACES) {
      patterns.push(new RegExp(`\\b${ns}\\b`, 'gi'));
    }
    for (const kind of K8S_RESOURCE_TYPES) {
      patterns.push(new RegExp(`\\b${kind}\\/[a-z][a-z0-9-]{0,61}[a-z0-9]\\b`, 'gi'));
    }
    patterns.push(/\bkube-[a-z]+\b/gi);
    return patterns;
  }

  /** Build an array of filesystem-path-matching regexes. */
  #pathPatterns(): RegExp[] {
    const BACKTICK = '\x60';
    return FS_ROOTS.map(root => new RegExp(`(?:/(?:${root})(?:/[^\\s"'${BACKTICK})\\]},;:]{1,255})?)`, 'gi'));
  }

  /** Build an array of service-label-matching regexes. */
  #labelPatterns(): RegExp[] {
    const patterns: RegExp[] = [];
    for (const { prefix, fields } of SERVICE_LABEL_PREFIXES) {
      for (const field of fields) {
        patterns.push(new RegExp(`\\b${prefix}${field}\\s*[:=]\\s*['"]?[a-zA-Z0-9_.\\-/]+['"]?`, 'gi'));
      }
    }
    for (const label of TRAEFIK_LABELS) {
      patterns.push(new RegExp(`\\b${label}\\s*[:=]\\s*['"]?[a-zA-Z0-9_.\\-/]+['"]?`, 'gi'));
    }
    for (const label of ENVOY_LABELS) {
      patterns.push(new RegExp(`\\b${label}\\s*[:=]\\s*['"]?[a-zA-Z0-9_.\\-/]+['"]?`, 'gi'));
    }
    return patterns;
  }

  #matchAll(
    input: string,
    patterns: RegExp[],
    id: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    detections: Detection[]
  ): void {
    for (const pattern of patterns) {
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
}
