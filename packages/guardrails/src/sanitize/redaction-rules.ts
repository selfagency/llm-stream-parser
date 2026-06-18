/**
 * Custom regex redaction rules for local trust sanitization.
 *
 * Supports org-specific masking rules stored as local JSON files.
 * Rules can be scoped to specific modes (logs, config, prompt, incident)
 * and support import/export for sharing across teams.
 *
 * @module
 */

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// ── Types ───────────────────────────────────────────────

export type RedactionScope = 'logs' | 'config' | 'prompt' | 'incident';

export interface RedactionRule {
  /** Whether this rule is active. */
  readonly enabled: boolean;
  /** Stable unique identifier for this rule. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Regex pattern to match (as string — compiled at load time). */
  readonly pattern: string;
  /** Replacement text for matched values. */
  readonly replacement: string;
  /** Which modes this rule applies to. */
  readonly scope: RedactionScope[];
}

export interface RedactionRulesDocument {
  readonly rules: RedactionRule[];
  readonly version: number;
}

export interface RedactionRuleMatch {
  readonly end: number;
  readonly id: string;
  readonly name: string;
  readonly replacement: string;
  readonly snippet: string;
  readonly start: number;
}

// ── Default paths ──────────────────────────────────────

/** Global redaction rules file. */
const GLOBAL_RULES_PATH = path.join(os.homedir(), '.agentsy', 'redaction-rules.json');

/** Workspace-level override. */
const WORKSPACE_RULES_PATH = path.join(process.cwd(), '.agentsy', 'redaction-rules.json');

// ── Redaction Rules Engine ─────────────────────────────

export class RedactionRulesEngine {
  readonly #rules: RedactionRule[];
  readonly #compiled: Map<string, RegExp>;

  constructor(rules?: RedactionRule[]) {
    this.#rules = rules ?? [];
    this.#compiled = new Map();
    for (const rule of this.#rules) {
      if (rule.enabled) {
        try {
          // nosemgrep: user-authored rules are trusted input from the org's own config
          this.#compiled.set(rule.id, new RegExp(rule.pattern, 'g'));
        } catch {
          // Invalid regex — skip this rule
        }
      }
    }
  }

  /**
   * Apply rules matching the given scope to input text.
   * Returns the sanitized text and a list of matches.
   */
  apply(input: string, scope: RedactionScope): { matches: RedactionRuleMatch[]; sanitized: string } {
    const matches: RedactionRuleMatch[] = [];
    let sanitized = input;

    for (const rule of this.#rules) {
      if (!(rule.enabled && rule.scope.includes(scope))) {
        continue;
      }

      const regex = this.#compiled.get(rule.id);
      if (!regex) {
        continue;
      }

      // Reset lastIndex
      regex.lastIndex = 0;
      for (;;) {
        const match = regex.exec(sanitized);
        if (match === null) {
          break;
        }
        matches.push({
          id: rule.id,
          name: rule.name,
          snippet: match[0],
          replacement: rule.replacement,
          start: match.index,
          end: match.index + match[0].length
        });
      }

      // Apply replacement
      regex.lastIndex = 0;
      sanitized = sanitized.replaceAll(regex, rule.replacement);
    }

    return { matches, sanitized };
  }

  /** Number of active (enabled) rules. */
  get activeRuleCount(): number {
    return this.#rules.filter(r => r.enabled).length;
  }

  /** All rules (enabled and disabled). */
  get rules(): readonly RedactionRule[] {
    return this.#rules;
  }
}

// ── File I/O ───────────────────────────────────────────

/**
 * Load redaction rules from the default locations.
 * Workspace rules override global rules.
 */
export async function loadRedactionRules(): Promise<RedactionRulesEngine> {
  const rules: RedactionRule[] = [];

  // Load global rules
  if (existsSync(GLOBAL_RULES_PATH)) {
    const content = await readFile(GLOBAL_RULES_PATH, 'utf-8');
    const doc = JSON.parse(content) as RedactionRulesDocument;
    rules.push(...doc.rules);
  }

  // Load workspace rules (override)
  if (existsSync(WORKSPACE_RULES_PATH)) {
    const content = await readFile(WORKSPACE_RULES_PATH, 'utf-8');
    const doc = JSON.parse(content) as RedactionRulesDocument;
    // Workspace rules replace global rules with the same ID
    for (const workspaceRule of doc.rules) {
      const existingIndex = rules.findIndex(r => r.id === workspaceRule.id);
      if (existingIndex >= 0) {
        rules[existingIndex] = workspaceRule;
      } else {
        rules.push(workspaceRule);
      }
    }
  }

  return new RedactionRulesEngine(rules);
}

/**
 * Export redaction rules to a JSON file.
 */
export async function exportRedactionRules(rules: RedactionRule[], filePath: string): Promise<void> {
  const doc: RedactionRulesDocument = { version: 1, rules };
  await writeFile(filePath, JSON.stringify(doc, null, 2), 'utf-8');
}

/**
 * Import redaction rules from a JSON file.
 */
export async function importRedactionRules(filePath: string): Promise<RedactionRule[]> {
  const content = await readFile(filePath, 'utf-8');
  const doc = JSON.parse(content) as RedactionRulesDocument;
  return doc.rules;
}

/**
 * Get the default global rules file path.
 */
export function getGlobalRulesPath(): string {
  return GLOBAL_RULES_PATH;
}

/**
 * Get the default workspace rules file path.
 */
export function getWorkspaceRulesPath(): string {
  return WORKSPACE_RULES_PATH;
}
