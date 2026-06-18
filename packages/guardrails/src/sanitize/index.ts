/**
 * Local trust sanitization — safe sharing of logs, configs, prompts, and incidents.
 *
 * ## Exports
 *
 * - `sanitize()` — main sanitization function
 * - `InfrastructureScanner` — detects internal hostnames, k8s, paths, stack traces, ports
 * - `RedactionRulesEngine` — custom regex rule engine
 * - `loadRedactionRules()` — load rules from global + workspace files
 * - `exportRedactionRules()` / `importRedactionRules()` — rule file I/O
 * - `getGlobalRulesPath()` / `getWorkspaceRulesPath()` — default file paths
 *
 * @module
 */

export { InfrastructureScanner, type InfrastructureScannerOptions } from './infrastructure-scanner.js';
export {
  exportRedactionRules,
  getGlobalRulesPath,
  getWorkspaceRulesPath,
  importRedactionRules,
  loadRedactionRules,
  type RedactionRule,
  type RedactionRuleMatch,
  type RedactionRulesDocument,
  type RedactionRulesEngine,
  type RedactionScope
} from './redaction-rules.js';
export {
  type SanitizeMode,
  type SanitizeOptions,
  type SanitizeResult,
  type SanitizeSummary,
  sanitize
} from './sanitize.js';
