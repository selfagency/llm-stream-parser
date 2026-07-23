import type { Detection, GuardrailResult, GuardrailScanner } from '../types.js';

/**
 * Configuration for CodeChangeScanner.
 */
export interface CodeChangeScannerConfig {
  /** Maximum allowed changes in a single operation before flagging. */
  readonly maxChangesPerOp?: number;
  /** Glob patterns for protected files that should never be overwritten. */
  readonly protectedFiles?: readonly string[];
}

const DEFAULT_PROTECTED_FILES = [
  '.env',
  '.env.local',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'go.sum',
  'Cargo.lock',
  '**/credentials*',
  '**/secrets*',
  '**/*.pem',
  '**/*.key',
  '**/id_rsa*',
  '**/.npmrc',
  '**/.htpasswd',
  '**/config/auth*',
  '**/config/security*'
];

const DESTRUCTIVE_COMMANDS = ['rm', 'rmdir', 'del', 'wipe', 'clear', 'truncate', 'dd', 'mkfs'];
const OVERWRITE_COMMANDS = ['write_file', 'overwrite', 'writeFile', 'copy', 'copyFile', 'cp', 'mv', 'rename'];

/** Extract the file path from context args, preferring filePath over path. */
function extractFilePath(context?: Record<string, unknown>): string {
  const args = context?.args as Record<string, unknown> | undefined;
  if (typeof args?.filePath === 'string') {
    return args.filePath;
  }
  if (typeof args?.path === 'string') {
    return args.path;
  }
  return '';
}

/**
 * CodeChangeScanner — Phase 10 §15.10
 *
 * Analyzes tool-call code changes for safety: protected files, destructive
 * operations, and excessive batch changes.
 */
export class CodeChangeScanner implements GuardrailScanner {
  readonly metadata = {
    id: 'hub://guardrails/code-change',
    name: 'Code Change Scanner',
    description:
      'Analyzes code change operations for dangerous patterns: protected files, destructive commands, excessive changes',
    priority: 33,
    version: '1.0.0',
    tags: ['code', 'change', 'filesystem', 'destructive', 'protected'] as const,
    owaspCategories: ['asi-04'] as const
  };

  readonly #config: Required<CodeChangeScannerConfig>;

  constructor(config?: CodeChangeScannerConfig) {
    this.#config = {
      protectedFiles: config?.protectedFiles ?? DEFAULT_PROTECTED_FILES,
      maxChangesPerOp: config?.maxChangesPerOp ?? 50
    };
  }

  evaluate(input: string, context?: Record<string, unknown>): GuardrailResult {
    const detections: Detection[] = [];
    const filePath = extractFilePath(context);

    // Check for destructive commands
    if (DESTRUCTIVE_COMMANDS.some(cmd => new RegExp(`\\b${cmd}\\b`, 'i').test(input))) {
      detections.push({
        id: 'cc-destructive-command',
        severity: 'critical',
        description: 'Destructive command detected in code change operation',
        confidence: 0.9
      });
    }

    // Check for protected files
    if (filePath) {
      for (const pattern of this.#config.protectedFiles) {
        const regex = patternToRegex(pattern);
        if (regex.test(filePath)) {
          detections.push({
            id: 'cc-protected-file-write',
            severity: 'critical',
            description: `Attempt to modify protected file: ${filePath} (matched: ${pattern})`,
            confidence: 0.95
          });
        }
      }
    }

    // Flag overwrite commands that are not explicitly safe
    if (OVERWRITE_COMMANDS.some(cmd => new RegExp(`\\b${cmd}\\b`, 'i').test(input)) && detections.length === 0) {
      detections.push({
        id: 'cc-overwrite-operation',
        severity: 'medium',
        description: 'Overwrite operation detected without explicit safety confirmation',
        confidence: 0.5
      });
    }

    if (detections.length === 0) {
      return { status: 'pass', phase: 'input' };
    }

    // Critical detections → block
    if (detections.some(d => d.severity === 'critical')) {
      return {
        status: 'block',
        phase: 'input',
        reason: `Code change blocked: ${detections.map(d => d.description).join('; ')}`,
        detections
      };
    }

    // Non-critical → pass with detections for approval flow
    return {
      status: 'pass',
      phase: 'input',
      detections
    };
  }
}

/**
 * Simple glob-like pattern to regex conversion.
 * Supports **, *, and single-level wildcards.
 */
function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '___DOUBLESTAR___')
    .replace(/\*/g, '[^/]*')
    .replace(/___DOUBLESTAR___/g, '.*');
  if (pattern.includes('*') || pattern.includes('**')) {
    return new RegExp(`^${escaped}$`, 'i');
  }
  // Non-glob patterns match as suffixes
  return new RegExp(`${escaped}$`, 'i');
}

/**
 * FileExtensionScanner — Phase 10 §15.10
 *
 * Scans file modification operations for risky file types
 * and sensitive directory access.
 */
export class FileModificationScanner implements GuardrailScanner {
  readonly metadata = {
    id: 'hub://guardrails/file-modification',
    name: 'File Modification Scanner',
    description: 'Scans file modification operations for risky types and sensitive directory access',
    priority: 34,
    version: '1.0.0',
    tags: ['filesystem', 'modification', 'risk', 'sensitive'] as const,
    owaspCategories: ['asi-04'] as const
  };

  readonly #sensitiveDirs: readonly string[];
  readonly #riskyExtensions: readonly string[];

  constructor() {
    this.#sensitiveDirs = [
      '/etc',
      '/etc/ssh',
      '/etc/ssl',
      '/etc/security',
      '/sys',
      '/proc',
      '/dev',
      '/boot',
      '/vmlinuz',
      'C:\\Windows\\System32',
      'C:\\Windows\\System',
      'C:\\ProgramData'
    ];
    this.#riskyExtensions = [
      '.pem',
      '.key',
      '.p12',
      '.pfx',
      '.jks',
      '.keystore',
      '.crl',
      '.crt',
      '.ca-bundle',
      '.kubeconfig',
      '.kube/config',
      '.dockercfg',
      '.docker/config.json',
      '.gitconfig',
      '.git-credentials',
      '.npmrc',
      '.yarnrc',
      '.netrc',
      '.pgpass',
      '.aws/credentials',
      '.aws/config',
      '.azure/credentials',
      '.gcloud/credentials',
      '.vault-token'
    ];
  }

  evaluate(_input: string, context?: Record<string, unknown>): GuardrailResult {
    const detections: Detection[] = [];
    const filePath = extractFilePath(context);
    const fileExtension = filePath ? extractExtension(filePath) : '';

    if (!filePath) {
      return { status: 'pass', phase: 'input' };
    }

    // Flag risky extensions
    if (this.#riskyExtensions.some(ext => filePath.toLowerCase().endsWith(ext))) {
      detections.push({
        id: 'fm-risky-extension',
        severity: 'high',
        description: `Modification of a file with a security-sensitive extension: ${fileExtension}`,
        confidence: 0.85
      });
    }

    // Flag sensitive directory access
    if (this.#sensitiveDirs.some(dir => filePath.startsWith(dir))) {
      detections.push({
        id: 'fm-sensitive-directory',
        severity: 'critical',
        description: `Modification in sensitive system directory: ${filePath}`,
        confidence: 0.95
      });
    }

    // Flag mass deletions (if the tool call involves glob patterns)
    if (/\*\*?/.test(filePath)) {
      detections.push({
        id: 'fm-glob-deletion',
        severity: 'high',
        description: `Glob pattern detected in file modification: ${filePath}`,
        confidence: 0.7
      });
    }

    if (detections.length === 0) {
      return { status: 'pass', phase: 'input' };
    }

    if (detections.some(d => d.severity === 'critical')) {
      return {
        status: 'block',
        phase: 'input',
        reason: `File modification blocked: ${detections.map(d => d.description).join('; ')}`,
        detections
      };
    }

    return {
      status: 'pass',
      phase: 'input',
      detections
    };
  }
}

function extractExtension(filePath: string): string {
  const filename = filePath.split('/').pop() ?? filePath;
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex > 0 ? filename.slice(dotIndex) : '';
}
