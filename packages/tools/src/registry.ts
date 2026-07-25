import type { ToolAnnotations, ToolDefinition, ToolHandler, ToolResult } from './definitions.js';

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

  toJSON(): ToolStatus[] {
    return this.list().map(t => ({
      name: t.name,
      enabled: true,
      ...(t.annotations ? { annotations: t.annotations } : {})
    }));
  }
}
