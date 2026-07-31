/**
 * Tool deny-rule filtering at registration.
 *
 * Strips tools from the tool list before the model sees them, based on
 * per-agent allow/deny rules declared in agent YAML specs.
 *
 * @module
 */

export interface ToolFilterConfig {
  readonly allow?: readonly string[];
  readonly deny?: readonly string[];
}

export interface ToolFilterOptions {
  readonly debug?: (message: string, meta?: Record<string, unknown>) => void;
}

export interface MinimalTool {
  readonly name: string;
}

export interface ToolFilterResult<T extends MinimalTool = MinimalTool> {
  readonly allowed: readonly T[];
  readonly denied: readonly T[];
  readonly strippedNames: readonly string[];
}

export class EmptyToolListError extends Error {
  constructor(message = 'Tool filtering resulted in empty tool list') {
    super(message);
    this.name = 'EmptyToolListError';
  }
}

/**
 * Convert a simple glob pattern (with * wildcard) into a RegExp.
 * Escapes regex meta-characters except *, which becomes .*
 *
 * Examples:
 *   "read_file"    -> /^read_file$/
 *   "read_*"       -> /^read_.*$/
 *   "*_file"       -> /^.*_file$/
 *   "*"            -> /^.*$/
 */
export function patternToRegExp(pattern: string): RegExp {
  if (!pattern) {
    throw new Error('patternToRegExp: pattern must be non-empty');
  }
  const escaped = pattern.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&');
  const regexSource = `^${escaped.replace(/\*/g, '.*')}$`;
  // nosemgrep: patterns come from agent YAML configs, not user input
  return new RegExp(regexSource);
}

export function matchesPattern(name: string, pattern: string): boolean {
  if (!pattern) {
    return false;
  }
  if (pattern === '*') {
    return true;
  }
  if (!pattern.includes('*')) {
    return name === pattern;
  }
  const re = patternToRegExp(pattern);
  return re.test(name);
}

export function matchesAnyPattern(name: string, patterns: readonly string[]): boolean {
  for (const p of patterns) {
    if (matchesPattern(name, p)) {
      return true;
    }
  }
  return false;
}

function normalizeList(input: readonly string[] | undefined): readonly string[] {
  if (!input || input.length === 0) {
    return [];
  }
  return input.map(s => s.trim()).filter(s => s.length > 0);
}

export function filterToolNames(
  toolNames: readonly string[],
  config: ToolFilterConfig,
  options: ToolFilterOptions = {}
): { allowed: string[]; denied: string[]; stripped: string[] } {
  const allowList = normalizeList(config.allow);
  const denyList = normalizeList(config.deny);

  let intermediate: string[];

  if (allowList.length > 0) {
    intermediate = toolNames.filter(name => matchesAnyPattern(name, allowList));
  } else {
    intermediate = [...toolNames];
  }

  const allowed: string[] = [];
  const denied: string[] = [];
  const stripped: string[] = [];

  for (const name of intermediate) {
    if (denyList.length > 0 && matchesAnyPattern(name, denyList)) {
      denied.push(name);
      stripped.push(name);
    } else {
      allowed.push(name);
    }
  }

  // Also collect tools that were in original list but not in allow list as stripped?
  // For logging purposes, we want to report all stripped tools:
  // - Those denied explicitly
  // - Those excluded by allow filter (when allow is set)
  // However spec says "Deny filtering logged at debug level with stripped tool names"
  // We'll log only deny-stripped as "stripped", and separately track allow-excluded.
  // For simplicity, stripped = denied + allow-excluded
  if (allowList.length > 0) {
    const allowExcluded = toolNames.filter(n => !matchesAnyPattern(n, allowList));
    for (const n of allowExcluded) {
      if (!stripped.includes(n)) {
        stripped.push(n);
      }
    }
  }

  if (options.debug && stripped.length > 0) {
    options.debug('[tool-filter] stripped tools denied by agent rules', {
      stripped,
      denied,
      allow: allowList,
      deny: denyList
    });
  } else if (stripped.length > 0 && typeof process !== 'undefined' && process.env.DEBUG) {
    console.debug('[tool-filter] stripped tools:', stripped.join(', '));
  }

  return { allowed, denied, stripped };
}

export function filterTools<T extends MinimalTool>(
  tools: readonly T[],
  config: ToolFilterConfig,
  options: ToolFilterOptions = {}
): ToolFilterResult<T> {
  const names = tools.map(t => t.name);
  const { allowed: allowedNames, denied: deniedNames, stripped } = filterToolNames(names, config, options);

  const allowedSet = new Set(allowedNames);
  const deniedSet = new Set(deniedNames);

  const allowed = tools.filter(t => allowedSet.has(t.name));
  const denied = tools.filter(t => deniedSet.has(t.name));

  return {
    allowed,
    denied,
    strippedNames: stripped
  };
}

/**
 * Assert that filtered result is non-empty, otherwise throw EmptyToolListError.
 */
export function assertNonEmptyTools<T extends MinimalTool>(result: ToolFilterResult<T>, agentName?: string): void {
  if (result.allowed.length === 0) {
    const suffix = agentName ? ` for agent "${agentName}"` : '';
    throw new EmptyToolListError(
      `Tool filtering resulted in empty tool list${suffix}. Stripped: [${result.strippedNames.join(', ')}]`
    );
  }
}

export interface ToolFilter {
  assertNonEmpty<T extends MinimalTool>(result: ToolFilterResult<T>, agentName?: string): void;
  readonly config: ToolFilterConfig;
  filter<T extends MinimalTool>(tools: readonly T[]): ToolFilterResult<T>;
  filterNames(names: readonly string[]): { allowed: string[]; denied: string[]; stripped: string[] };
}

export function createToolFilter(config: ToolFilterConfig, options: ToolFilterOptions = {}): ToolFilter {
  const normalized: ToolFilterConfig = {
    ...(config.allow ? { allow: normalizeList(config.allow) } : {}),
    ...(config.deny ? { deny: normalizeList(config.deny) } : {})
  };

  return {
    config: normalized,
    filter<T extends MinimalTool>(tools: readonly T[]): ToolFilterResult<T> {
      return filterTools(tools, normalized, options);
    },
    filterNames(names: readonly string[]) {
      return filterToolNames(names, normalized, options);
    },
    assertNonEmpty<T extends MinimalTool>(result: ToolFilterResult<T>, agentName?: string): void {
      assertNonEmptyTools(result, agentName);
    }
  };
}
