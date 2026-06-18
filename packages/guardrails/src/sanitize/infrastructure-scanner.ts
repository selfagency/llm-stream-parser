/**
 * Infrastructure-details scanner for local trust sanitization.
 *
 * Detects internal hostnames, Kubernetes namespaces, pod names,
 * filesystem paths, stack traces, ports, and service discovery labels
 * that should be redacted before sharing logs, configs, or incident artifacts.
 *
 * All regex patterns are hardcoded at module level to avoid SonarCloud
 * regex-complexity thresholds and Semgrep ReDoS false positives.
 *
 * @module
 */

import type { Detection, GuardrailResult, GuardrailScanner } from '../types.js';

// ── Pattern Groups (all hardcoded at module level) ─────

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
] as const;

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
] as const;

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
] as const;

/**
 * Build a hostname regex for a given TLD.
 * All TLD values are compile-time constants from INTERNAL_TLDS.
 */
// nosemgrep: tld values are compile-time constants from INTERNAL_TLDS
function hostnameForTld(tld: string): RegExp {
  return new RegExp(String.raw`\b(?:[a-zA-Z][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])\.` + tld + String.raw`\b`, 'gi');
}

/** Build a k8s resource regex for a given resource type. */
// nosemgrep: kind values are compile-time constants from K8S_RESOURCE_TYPES
function k8sForType(kind: string): RegExp {
  return new RegExp(String.raw`\b` + kind + String.raw`\/[a-z][a-z0-9-]{0,61}[a-z0-9]\b`, 'gi');
}

// Pre-computed pattern arrays — build once at module load
// nosemgrep: tld values are compile-time constants from INTERNAL_TLDS
const HOSTNAME_PATTERNS: readonly RegExp[] = INTERNAL_TLDS.map(tld => hostnameForTld(tld));

// nosemgrep: kind values are compile-time constants from K8S_RESOURCE_TYPES
const K8S_RESOURCE_PATTERNS: readonly RegExp[] = K8S_RESOURCE_TYPES.map(kind => k8sForType(kind));

// nosemgrep: root values are compile-time constants from FS_ROOTS
const BACKTICK = '\x60';
const PATH_PATTERNS: readonly RegExp[] = FS_ROOTS.map(
  root => new RegExp(`(?:/(?:${root})(?:/[^\\s"'${BACKTICK})\\]},;:]{1,255})?)`, 'gi')
);

// nosemgrep: all LABEL_PATTERNS are hardcoded regex literals
const LABEL_PATTERNS: readonly RegExp[] = [
  // service.* labels
  /\bservice\.name\s*[:=]\s*['"]?[-\w./]+['"]?/gi,
  /\bservice\.type\s*[:=]\s*['"]?[-\w./]+['"]?/gi,
  /\bservice\.account\s*[:=]\s*['"]?[-\w./]+['"]?/gi,
  /\bservice\.port\s*[:=]\s*['"]?[-\w./]+['"]?/gi,
  /\bservice\.cluster\s*[:=]\s*['"]?[-\w./]+['"]?/gi,
  /\bservice\.namespace\s*[:=]\s*['"]?[-\w./]+['"]?/gi,
  /\bservice\.selector\s*[:=]\s*['"]?[-\w./]+['"]?/gi,
  /\bservice\.label\s*[:=]\s*['"]?[-\w./]+['"]?/gi,
  // app.* labels
  /\bapp\.kubernetes\.io\s*[:=]\s*['"]?[-\w./]+['"]?/gi,
  /\bapp\.instance\s*[:=]\s*['"]?[-\w./]+['"]?/gi,
  /\bapp\.name\s*[:=]\s*['"]?[-\w./]+['"]?/gi,
  /\bapp\.version\s*[:=]\s*['"]?[-\w./]+['"]?/gi,
  // helm labels
  /\bhelm\.sh\/chart\s*[:=]\s*['"]?[-\w./]+['"]?/gi,
  // traefik labels
  /\btraefik\.frontend\s*[:=]\s*['"]?[-\w./]+['"]?/gi,
  /\btraefik\.backend\s*[:=]\s*['"]?[-\w./]+['"]?/gi,
  /\btraefik\.service\s*[:=]\s*['"]?[-\w./]+['"]?/gi,
  // envoy labels
  /\benvoy\.cluster\s*[:=]\s*['"]?[-\w./]+['"]?/gi,
  /\benvoy\.service\s*[:=]\s*['"]?[-\w./]+['"]?/gi,
  /\benvoy\.route\s*[:=]\s*['"]?[-\w./]+['"]?/gi
];

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

interface DetectionEntry {
  id: string;
  pattern: RegExp;
  severity: 'critical' | 'high' | 'medium' | 'low';
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

  /** Active detection entries for this instance. Built once in constructor. */
  readonly #entries: DetectionEntry[];

  constructor(options?: InfrastructureScannerOptions) {
    this.#entries = InfrastructureScanner.#buildEntries(options ?? {});
  }

  /** Build detection entries based on enabled categories. */
  static #buildEntries(options: InfrastructureScannerOptions): DetectionEntry[] {
    const opts = {
      hostnames: options.hostnames ?? true,
      kubernetes: options.kubernetes ?? true,
      paths: options.paths ?? true,
      stackTraces: options.stackTraces ?? true,
      ports: options.ports ?? true,
      urls: options.urls ?? true,
      labels: options.labels ?? true
    };

    const det: DetectionEntry[] = [];

    InfrastructureScanner.#appendHostnames(opts.hostnames, det);
    InfrastructureScanner.#appendK8s(opts.kubernetes, det);
    InfrastructureScanner.#appendPaths(opts.paths, det);
    InfrastructureScanner.#appendStackTraces(opts.stackTraces, det);
    InfrastructureScanner.#appendPorts(opts.ports, det);
    InfrastructureScanner.#appendUrls(opts.urls, det);
    InfrastructureScanner.#appendLabels(opts.labels, det);

    return det;
  }

  static #appendHostnames(enabled: boolean, det: DetectionEntry[]): void {
    if (!enabled) {
      return;
    }
    for (const pattern of HOSTNAME_PATTERNS) {
      det.push({ id: 'internal-hostname', pattern, severity: 'medium' });
    }
  }

  static #appendK8s(enabled: boolean, det: DetectionEntry[]): void {
    if (!enabled) {
      return;
    }
    det.push({ id: 'k8s-resource', pattern: /\bkube-system\b/gi, severity: 'high' });
    det.push({ id: 'k8s-resource', pattern: /\bkube-public\b/gi, severity: 'high' });
    det.push({ id: 'k8s-resource', pattern: /\bkube-node-lease\b/gi, severity: 'high' });
    det.push({ id: 'k8s-resource', pattern: /\bkube-[a-z]+\b/gi, severity: 'high' });
    for (const pattern of K8S_RESOURCE_PATTERNS) {
      det.push({ id: 'k8s-resource', pattern, severity: 'high' });
    }
  }

  static #appendPaths(enabled: boolean, det: DetectionEntry[]): void {
    if (!enabled) {
      return;
    }
    for (const pattern of PATH_PATTERNS) {
      det.push({ id: 'filesystem-path', pattern, severity: 'medium' });
    }
  }

  static #appendStackTraces(enabled: boolean, det: DetectionEntry[]): void {
    if (!enabled) {
      return;
    }
    det.push({
      id: 'stack-trace',
      pattern: /\s+at\s+(?:\S+\s+)?\(?(?:\/[^\s"'`)\]},;:]+):(\d+)(?::(\d+))?\)?/gi,
      severity: 'medium'
    });
  }

  static #appendPorts(enabled: boolean, det: DetectionEntry[]): void {
    if (!enabled) {
      return;
    }
    det.push({
      id: 'port-number',
      pattern: /\bport[:\s]*(\d{4,5})\b|\blisten[:\s]*(\d{4,5})\b|\bbind[:\s]*(\d{4,5})\b/gi,
      severity: 'low'
    });
  }

  static #appendUrls(enabled: boolean, det: DetectionEntry[]): void {
    if (!enabled) {
      return;
    }
    det.push({
      id: 'internal-url',
      pattern:
        /\b(?:https?:\/\/)?(?:[a-z][a-z0-9-]{0,61})\.(?:internal|local|corp|intranet|svc|cluster\.local)(?::\d{2,5})?(?:\/[^\s"'`)\]},;:]*)?/gi,
      severity: 'high'
    });
  }

  static #appendLabels(enabled: boolean, det: DetectionEntry[]): void {
    if (!enabled) {
      return;
    }
    for (const pattern of LABEL_PATTERNS) {
      det.push({ id: 'service-label', pattern, severity: 'medium' });
    }
  }

  evaluate(input: string, _context?: Record<string, unknown>): GuardrailResult {
    const detections: Detection[] = [];

    for (const entry of this.#entries) {
      entry.pattern.lastIndex = 0;
      for (;;) {
        const match = entry.pattern.exec(input);
        if (match === null) {
          break;
        }
        detections.push({
          id: entry.id,
          severity: entry.severity,
          description: `Infrastructure detail: ${entry.id}`,
          snippet: match[0],
          start: match.index,
          end: match.index + match[0].length,
          confidence: 0.8
        });
      }
    }

    if (detections.length === 0) {
      return { status: 'pass', phase: 'input' };
    }

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
}
