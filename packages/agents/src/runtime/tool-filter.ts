/**
 * Agent tool-filter bridge — applies per-agent allow/deny rules at registration.
 *
 * Self-contained to avoid build-time dependency on @agentsy/runtime dist.
 * Mirrors runtime/sandbox/tool-filter logic.
 *
 * @module
 */

import type { AgentSpec } from '../specs/types.js';

export interface ToolFilterConfig {
  readonly allow?: readonly string[];
  readonly deny?: readonly string[];
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

function toRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\*/g, '.*')}$`);
}

function matches(name: string, pattern: string): boolean {
  if (!pattern) {
    return false;
  }
  if (pattern === '*') {
    return true;
  }
  if (!pattern.includes('*')) {
    return name === pattern;
  }
  return toRegExp(pattern).test(name);
}

function matchesAny(name: string, patterns: readonly string[]): boolean {
  for (const p of patterns) {
    if (matches(name, p)) {
      return true;
    }
  }
  return false;
}

function normalize(input: readonly string[] | undefined): string[] {
  if (!input) {
    return [];
  }
  return input.map(s => s.trim()).filter(s => s.length > 0);
}

function filterToolsInternal<T extends MinimalTool>(
  tools: readonly T[],
  config: ToolFilterConfig,
  debug?: (msg: string, meta?: Record<string, unknown>) => void
): ToolFilterResult<T> {
  const allow = normalize(config.allow);
  const deny = normalize(config.deny);
  const allNames = tools.map(t => t.name);
  let intermediate: readonly T[];
  if (allow.length > 0) {
    intermediate = tools.filter(t => matchesAny(t.name, allow));
  } else {
    intermediate = tools;
  }
  const allowed: T[] = [];
  const denied: T[] = [];
  const stripped: string[] = [];
  for (const tool of intermediate) {
    if (deny.length > 0 && matchesAny(tool.name, deny)) {
      denied.push(tool);
      stripped.push(tool.name);
    } else {
      allowed.push(tool);
    }
  }
  if (allow.length > 0) {
    const excluded = allNames.filter(n => !matchesAny(n, allow));
    for (const n of excluded) {
      if (!stripped.includes(n)) {
        stripped.push(n);
      }
    }
  }
  if (debug && stripped.length > 0) {
    debug('[tool-filter] stripped tools denied by agent rules', {
      stripped,
      denied: denied.map(d => d.name),
      allow,
      deny
    });
  } else if (stripped.length > 0 && typeof process !== 'undefined' && process.env.DEBUG) {
    console.debug('[tool-filter] stripped tools:', stripped.join(', '));
  }
  return { allowed, denied, strippedNames: stripped };
}

interface CreateFilterOptions {
  debug?: (msg: string, meta?: Record<string, unknown>) => void;
}

function createRuntimeFilter(config: ToolFilterConfig, opts: CreateFilterOptions = {}) {
  const allow = normalize(config.allow);
  const deny = normalize(config.deny);
  const normalized: ToolFilterConfig = {
    ...(allow.length > 0 ? { allow } : {}),
    ...(deny.length > 0 ? { deny } : {})
  };
  return {
    config: normalized,
    filter<U extends MinimalTool>(tools: readonly U[]): ToolFilterResult<U> {
      if (opts.debug) {
        return filterToolsInternal(tools, normalized, opts.debug);
      }
      return filterToolsInternal(tools, normalized);
    },
    filterNames(names: readonly string[]) {
      const tools = names.map(n => ({ name: n }));
      const result = opts.debug
        ? filterToolsInternal(tools, normalized, opts.debug)
        : filterToolsInternal(tools, normalized);
      return {
        allowed: result.allowed.map(t => t.name),
        denied: result.denied.map(t => t.name),
        stripped: result.strippedNames as string[]
      };
    },
    assertNonEmpty<U extends MinimalTool>(result: ToolFilterResult<U>, agentName?: string): void {
      if (result.allowed.length === 0) {
        const suffix = agentName ? ` for agent "${agentName}"` : '';
        throw new EmptyToolListError(
          `Tool filtering resulted in empty tool list${suffix}. Stripped: [${result.strippedNames.join(', ')}]`
        );
      }
    }
  };
}

function filterTools<T extends MinimalTool>(
  tools: readonly T[],
  config: ToolFilterConfig,
  opts: CreateFilterOptions = {}
): ToolFilterResult<T> {
  if (opts.debug) {
    return filterToolsInternal(tools, config, opts.debug);
  }
  return filterToolsInternal(tools, config);
}

function assertNonEmptyTools<T extends MinimalTool>(result: ToolFilterResult<T>, agentName?: string): void {
  if (result.allowed.length === 0) {
    const suffix = agentName ? ` for agent "${agentName}"` : '';
    throw new EmptyToolListError(
      `Tool filtering resulted in empty tool list${suffix}. Stripped: [${result.strippedNames.join(', ')}]`
    );
  }
}

export interface AgentToolFilterOptions {
  readonly debug?: (message: string, meta?: Record<string, unknown>) => void;
}

/**
 * Extract tool filter config from an AgentSpec.
 */
export function getToolFilterConfig(spec: AgentSpec): ToolFilterConfig | null {
  if (!spec.tools) {
    return null;
  }
  const allow = spec.tools.allow?.filter(s => s.trim().length > 0);
  const deny = spec.tools.deny?.filter(s => s.trim().length > 0);
  if ((!allow || allow.length === 0) && (!deny || deny.length === 0)) {
    return null;
  }
  return {
    ...(allow && allow.length > 0 ? { allow } : {}),
    ...(deny && deny.length > 0 ? { deny } : {})
  };
}

/**
 * Filter tools visible to model for a given agent spec.
 * Returns unfiltered list if spec has no tools config.
 *
 * Throws EmptyToolListError if post-filter list would be empty.
 */
export function getFilteredToolsForAgent<T extends MinimalTool>(
  spec: AgentSpec,
  allTools: readonly T[],
  options: AgentToolFilterOptions = {}
): readonly T[] {
  const config = getToolFilterConfig(spec);
  if (!config) {
    return allTools;
  }
  const filterOpts: CreateFilterOptions = {};
  if (options.debug) {
    filterOpts.debug = options.debug;
  }
  const runtimeFilter = createRuntimeFilter(config, filterOpts);
  const result = runtimeFilter.filter(allTools);
  runtimeFilter.assertNonEmpty(result, spec.name);
  return result.allowed;
}

/**
 * Same as getFilteredToolsForAgent but also returns the full filter result
 * (allowed, denied, strippedNames) for logging / debugging.
 */
export function getFilteredToolsWithResult<T extends MinimalTool>(
  spec: AgentSpec,
  allTools: readonly T[],
  options: AgentToolFilterOptions = {}
): ToolFilterResult<T> {
  const config = getToolFilterConfig(spec);
  if (!config) {
    return {
      allowed: allTools,
      denied: [],
      strippedNames: []
    };
  }
  const filterOpts: CreateFilterOptions = {};
  if (options.debug) {
    filterOpts.debug = options.debug;
  }
  const result = filterTools(allTools, config, filterOpts);
  assertNonEmptyTools(result, spec.name);
  return result;
}

/**
 * Convenience: check if a tool name would be visible to model for this agent.
 */
export function isToolAllowedForAgent(spec: AgentSpec, toolName: string, allToolNames: readonly string[]): boolean {
  const config = getToolFilterConfig(spec);
  if (!config) {
    return allToolNames.includes(toolName);
  }
  const filter = createRuntimeFilter(config);
  const { allowed } = filter.filterNames(allToolNames);
  return allowed.includes(toolName);
}

/**
 * Validate at spawn time that agent won't end up with empty tool list.
 * Throws EmptyToolListError if filtering results in empty list.
 */
export function assertAgentToolsNonEmpty<T extends MinimalTool>(spec: AgentSpec, allTools: readonly T[]): void {
  const config = getToolFilterConfig(spec);
  if (!config) {
    if (allTools.length === 0) {
      throw new EmptyToolListError(`Agent ${spec.name} has no tools registered`);
    }
    return;
  }
  const result = filterTools(allTools, config);
  if (result.allowed.length === 0) {
    throw new EmptyToolListError(
      `Tool filtering resulted in empty tool list for agent ${spec.name}. Stripped: [${result.strippedNames.join(', ')}]`
    );
  }
}
