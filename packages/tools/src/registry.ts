import type { ToolAnnotations, ToolDefinition, ToolHandler, ToolResult } from './definitions.js';

export interface ToolFilterConfig {
  readonly allow?: readonly string[];
  readonly deny?: readonly string[];
}

export interface ToolFilterResult {
  readonly allowed: readonly ToolRegistration[];
  readonly denied: readonly ToolRegistration[];
  readonly strippedNames: readonly string[];
}

export class EmptyToolListError extends Error {
  constructor(message = 'Tool filtering resulted in empty tool list') {
    super(message);
    this.name = 'EmptyToolListError';
  }
}

function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\*/g, '.*')}$`);
}

function matchesPattern(name: string, pattern: string): boolean {
  if (!pattern) {
    return false;
  }
  if (pattern === '*') {
    return true;
  }
  if (!pattern.includes('*')) {
    return name === pattern;
  }
  return patternToRegExp(pattern).test(name);
}

function matchesAny(name: string, patterns: readonly string[]): boolean {
  for (const p of patterns) {
    if (matchesPattern(name, p)) {
      return true;
    }
  }
  return false;
}

function normalizeList(input: readonly string[] | undefined): string[] {
  if (!input || input.length === 0) {
    return [];
  }
  return input.map(s => s.trim()).filter(s => s.length > 0);
}

export interface ToolRegistration {
  readonly annotations?: ToolAnnotations;
  readonly handler: ToolHandler;
  readonly name: string;
}

export interface ToolStatus {
  readonly annotations?: ToolAnnotations;
  readonly enabled: boolean;
  readonly name: string;
}

export class ToolRegistry {
  readonly #tools = new Map<string, ToolRegistration>();

  register(tool: ToolDefinition): void;
  register(name: string, handler: ToolHandler, annotations?: ToolAnnotations): void;
  register(nameOrTool: string | ToolDefinition, handler?: ToolHandler, annotations?: ToolAnnotations): void {
    if (typeof nameOrTool === 'object') {
      const tool = nameOrTool;
      this.#tools.set(tool.name, {
        ...(tool.annotations ? { annotations: { ...tool.annotations } } : {}),
        handler: tool.handler,
        name: tool.name
      });
    } else {
      this.#tools.set(nameOrTool, {
        ...(annotations ? { annotations: { ...annotations } } : {}),
        // biome-ignore lint/style/noNonNullAssertion: validated by overload — handler required when nameOrTool is string
        handler: handler!,
        name: nameOrTool
      });
    }
  }

  get(name: string): ToolRegistration | undefined {
    return this.#tools.get(name);
  }

  list(): ToolRegistration[] {
    return Array.from(this.#tools.values());
  }

  async execute(name: string, input: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.#tools.get(name);
    if (!tool) {
      return { ok: false, data: null, error: `Tool not found: ${name}` };
    }
    try {
      return await tool.handler(input);
    } catch (error) {
      return {
        ok: false,
        data: null,
        error: error instanceof Error ? `Handler error: ${error.message}` : String(error)
      };
    }
  }

  /**
   * Replace an existing tool registration. If the tool doesn't exist,
   * registers it as new. Returns the previous registration if any.
   * This is the mechanism for "hoisting" — AFT tools replace baseline
   * tools by name while preserving their annotations in the registry.
   */
  replace(name: string, definition: ToolDefinition): ToolRegistration | null {
    const previous = this.#tools.get(name) ?? null;
    this.#tools.set(name, {
      ...(definition.annotations ? { annotations: { ...definition.annotations } } : {}),
      handler: definition.handler,
      name
    });
    return previous;
  }

  remove(name: string): boolean {
    return this.#tools.delete(name);
  }

  clear(): void {
    this.#tools.clear();
  }

  get size(): number {
    return this.#tools.size;
  }

  listByAnnotation(key: keyof ToolAnnotations): ToolRegistration[] {
    // nosemgrep: key is typed as keyof ToolAnnotations — caller-controlled but type-constrained
    return this.list().filter(t => t.annotations?.[key]);
  }

  /**
   * Filter tools by allow/deny rules, stripping denied tools before model sees them.
   * - allow list (if present) restricts to only matching names (supports * wildcards)
   * - deny list then removes matching names, deny wins over allow
   * - logs stripped names at debug level when debug logger provided
   */
  filter(config: ToolFilterConfig, debug?: (msg: string, meta?: Record<string, unknown>) => void): ToolFilterResult {
    const allowList = normalizeList(config.allow);
    const denyList = normalizeList(config.deny);
    const all = this.list();
    const allNames = all.map(t => t.name);

    let intermediate: ToolRegistration[];
    if (allowList.length > 0) {
      intermediate = all.filter(t => matchesAny(t.name, allowList));
    } else {
      intermediate = [...all];
    }

    const allowed: ToolRegistration[] = [];
    const denied: ToolRegistration[] = [];
    const stripped: string[] = [];

    for (const reg of intermediate) {
      if (denyList.length > 0 && matchesAny(reg.name, denyList)) {
        denied.push(reg);
        stripped.push(reg.name);
      } else {
        allowed.push(reg);
      }
    }

    if (allowList.length > 0) {
      const excluded = allNames.filter(n => !matchesAny(n, allowList));
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
        allow: allowList,
        deny: denyList
      });
    } else if (stripped.length > 0 && typeof process !== 'undefined' && process.env.DEBUG) {
      console.debug('[tool-filter] stripped tools:', stripped.join(', '));
    }

    return { allowed, denied, strippedNames: stripped };
  }

  /**
   * List tools visible to model after applying filter. Convenience wrapper.
   */
  listFiltered(config: ToolFilterConfig): ToolRegistration[] {
    return this.filter(config).allowed as ToolRegistration[];
  }

  /**
   * Assert filtered result non-empty, throw EmptyToolListError if empty.
   */
  assertNonEmptyFiltered(result: ToolFilterResult, agentName?: string): void {
    if (result.allowed.length === 0) {
      const suffix = agentName ? ` for agent "${agentName}"` : '';
      throw new EmptyToolListError(
        `Tool filtering resulted in empty tool list${suffix}. Stripped: [${result.strippedNames.join(', ')}]`
      );
    }
  }

  toJSON(): ToolStatus[] {
    return this.list().map(t => ({
      name: t.name,
      enabled: true,
      ...(t.annotations ? { annotations: t.annotations } : {})
    }));
  }
}
