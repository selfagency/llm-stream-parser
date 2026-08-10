/**
 * Annotations about tool behavior used for safety gating.
 */
export interface ToolAnnotations {
  /** Tool can modify or delete user data. */
  readonly destructiveHint?: boolean;
  /** Tool is safe to call multiple times (same input → same output). */
  readonly idempotentHint?: boolean;
  /** If true, the tool is safe to run in parallel with itself. */
  readonly isConcurrencySafe?: boolean;
  /** If true, the tool only reads and can run concurrently. */
  readonly isReadOnly?: boolean;
  /** Tool interacts with external systems beyond the agent's workspace. */
  readonly openWorldHint?: boolean;
  /** Tool primarily reads data without side effects. */
  readonly readOnlyHint?: boolean;
  /** Tool requires explicit user approval before execution. */
  readonly requiresApproval?: boolean;
}

/**
 * Tool execution handler signature.
 */
export type ToolHandler = (input: Record<string, unknown>) => ToolResult | Promise<ToolResult>;

/**
 * Invocation argument describing a tool parameter with JSON Schema-like properties.
 */
export interface ToolParameter {
  readonly description?: string;
  readonly name: string;
  readonly required?: boolean;
  readonly type: 'string' | 'number' | 'boolean' | 'array' | 'object';
}

/**
 * Canonical tool definition used by the registry and approval gating.
 */
export interface ToolDefinition<_T = unknown> {
  /** If true, the tool is always included in the tool list regardless of deferral. */
  readonly alwaysLoad?: boolean;
  /** Tool annotations for safety gating. */
  readonly annotations?: ToolAnnotations;
  /** Function that produces an audit-log entry from the tool's input arguments. */
  readonly backfillObservableInput?: (args: unknown) => string;
  /** Human-readable description of what the tool does. */
  readonly description: string;
  /** Tool handler function. */
  readonly handler: ToolHandler;
  /** How the tool handles interruption while executing. */
  readonly interruptBehavior?: 'cancel' | 'defer' | 'block';
  /** If true, the tool is safe to run in parallel with itself. */
  readonly isConcurrencySafe?: boolean;
  /** If true, the tool can modify or delete user data and requires approval. */
  readonly isDestructive?: boolean;

  // ── Rich tool fields ────────────────────────────────────────────────────────

  /** If true, the tool only reads and can run concurrently. */
  readonly isReadOnly?: boolean;
  /** Maximum result size in characters before disk-spill kicks in (default 10_000). */
  readonly maxResultSizeChars?: number;
  /** Unique tool identifier. */
  readonly name: string;
  /** Parameter definitions for the tool. */
  readonly parameters?: ToolParameter[];
  /** Extended JSON Schema for complex inputs. */
  readonly schema?: Record<string, unknown>;
  /** Keyword used by ToolSearch to find this tool when deferred. */
  readonly searchHint?: string;
  /** If true, the tool definition is not loaded until the tool is invoked. */
  readonly shouldDefer?: boolean;
}

/**
 * Result from executing a tool.
 */
export interface ToolResult<T = unknown> {
  readonly data: T;
  readonly error?: string;
  readonly ok: boolean;
}
