/**
 * Branded primitive types for Agentsy IDs.
 *
 * These types prevent accidental mixing of identifiers from different domains.
 * Use them for type safety when working with entity IDs.
 */

/**
 * Unique identifier for an agent instance or configuration.
 */
export type AgentId = string & { readonly __brand: unique symbol };

/**
 * Unique identifier for a conversation session.
 */
export type SessionId = string & { readonly __brand: unique symbol };

/**
 * Unique identifier for distributed tracing.
 */
export type TraceId = string & { readonly __brand: unique symbol };

/**
 * Unique identifier for a span within a trace.
 */
export type SpanId = string & { readonly __brand: unique symbol };

/**
 * Unique identifier for a tool or function.
 */
export type ToolId = string & { readonly __brand: unique symbol };

/**
 * Unique identifier for a memory record.
 */
export type MemoryId = string & { readonly __brand: unique symbol };

/**
 * Creates a branded AgentId.
 */
export function createAgentId(): AgentId {
  // Type assertion is required for branded type pattern
  return `agent_${crypto.randomUUID()}` as AgentId;
}

/**
 * Creates a branded SessionId.
 */
export function createSessionId(): SessionId {
  // Type assertion is required for branded type pattern
  return `session_${crypto.randomUUID()}` as SessionId;
}

/**
 * Creates a branded TraceId.
 */
export function createTraceId(): TraceId {
  // Type assertion is required for branded type pattern
  return `trace_${crypto.randomUUID()}` as TraceId;
}

/**
 * Creates a branded SpanId.
 */
export function createSpanId(): SpanId {
  // Type assertion is required for branded type pattern
  return `span_${crypto.randomUUID()}` as SpanId;
}

/**
 * Creates a branded ToolId.
 */
export function createToolId(): ToolId {
  // Type assertion is required for branded type pattern
  return `tool_${crypto.randomUUID()}` as ToolId;
}

/**
 * Creates a branded MemoryId.
 */
export function createMemoryId(): MemoryId {
  // Type assertion is required for branded type pattern
  return `memory_${crypto.randomUUID()}` as MemoryId;
}

/**
 * Checks whether a value is a branded {@link AgentId}.
 *
 * @param value — The value to test.
 * @returns `true` if the value is a string starting with `agent_`.
 */
export function isAgentId(value: unknown): value is AgentId {
  return typeof value === 'string' && value.startsWith('agent_');
}

/**
 * Checks whether a value is a branded {@link SessionId}.
 *
 * @param value — The value to test.
 * @returns `true` if the value is a string starting with `session_`.
 */
export function isSessionId(value: unknown): value is SessionId {
  return typeof value === 'string' && value.startsWith('session_');
}

/**
 * Checks whether a value is a branded {@link TraceId}.
 *
 * @param value — The value to test.
 * @returns `true` if the value is a string starting with `trace_`.
 */
export function isTraceId(value: unknown): value is TraceId {
  return typeof value === 'string' && value.startsWith('trace_');
}

/**
 * Checks whether a value is a branded {@link SpanId}.
 *
 * @param value — The value to test.
 * @returns `true` if the value is a string starting with `span_`.
 */
export function isSpanId(value: unknown): value is SpanId {
  return typeof value === 'string' && value.startsWith('span_');
}

/**
 * Checks whether a value is a branded {@link ToolId}.
 *
 * @param value — The value to test.
 * @returns `true` if the value is a string starting with `tool_`.
 */
export function isToolId(value: unknown): value is ToolId {
  return typeof value === 'string' && value.startsWith('tool_');
}

/**
 * Checks whether a value is a branded {@link MemoryId}.
 *
 * @param value — The value to test.
 * @returns `true` if the value is a string starting with `memory_`.
 */
export function isMemoryId(value: unknown): value is MemoryId {
  return typeof value === 'string' && value.startsWith('memory_');
}
