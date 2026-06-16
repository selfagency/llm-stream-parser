/**
 * Represents a JSON Schema object used for tool input validation.
 * The specific structure follows the JSON Schema specification.
 */
export type JsonSchema = Record<string, unknown>;

/**
 * Branded string type representing a tool URI.
 * Used to ensure type safety when passing URIs between MCP components.
 * Use a type assertion (`uri as ToolUri`) to create values of this type.
 */
export type ToolUri = string & { readonly __brand: unique symbol };

// ── Content Types ────────────────────────────────────────────────────────────

/**
 * Text content returned from a tool call.
 */
export interface TextContent {
  /** Optional identifier for audit tracing. */
  auditId?: string;
  /** The text content body. */
  text: string;
  type: 'text';
}

/**
 * Image content returned from a tool call.
 * The image data is base64-encoded.
 */
export interface ImageContent {
  /** Optional identifier for audit tracing. */
  auditId?: string;
  /** Base64-encoded image data. */
  data: string;
  /** MIME type of the image (e.g. "image/png"). */
  mimeType: string;
  type: 'image';
}

/**
 * Embedded resource content returned from a tool call.
 */
export interface EmbeddedResource {
  /** Optional identifier for audit tracing. */
  auditId?: string;
  /** The embedded resource contents. */
  resource: ResourceContents;
  type: 'resource';
}

/**
 * Contents of a resource used in embedded resource content.
 */
export interface ResourceContents {
  /** Binary representation of the resource (mutually exclusive with text). */
  blob?: string;
  /** Optional MIME type of the resource. */
  mimeType?: string;
  /** Text representation of the resource (mutually exclusive with blob). */
  text?: string;
  /** Resource URI, branded as a ToolUri. */
  uri: ToolUri;
}

/**
 * Union of all content types that can be returned from a tool call.
 */
export type ToolContent = TextContent | ImageContent | EmbeddedResource;

// ── Tool Annotations ─────────────────────────────────────────────────────────

/**
 * Annotations describing a tool's runtime behavior.
 * These hints help clients understand how a tool affects external state.
 */
export interface ToolAnnotations {
  /** When true, this tool may perform destructive operations (delete, overwrite). */
  destructiveHint?: boolean;
  /** When true, calling this tool with the same arguments produces the same result. */
  idempotentHint?: boolean;
  /** When true, this tool may interact with or depend on external systems. */
  openWorldHint?: boolean;
  /** When true, this tool only reads data without modifying state. */
  readOnlyHint?: boolean;
}

// ── Tool Definitions ─────────────────────────────────────────────────────────

/**
 * MCP Tool definition for tool invocation.
 * Describes a callable tool that can be exposed to MCP clients.
 */
export interface McpTool {
  /** Optional annotations describing tool behavior. */
  annotations?: ToolAnnotations;
  description: string;
  /**
   * Handler function invoked when the tool is called.
   * This is an implementation detail, not part of the MCP wire protocol.
   */
  handler: (input: unknown) => Promise<unknown>;
  /** JSON Schema describing the expected tool input. */
  inputSchema?: JsonSchema;
  name: string;
}

/**
 * CallTool request payload as defined by the MCP spec.
 */
export interface CallToolRequest {
  method: 'tools/call';
  params: {
    name: string;
    arguments?: Record<string, unknown>;
  };
}

// ── Resource Definitions ─────────────────────────────────────────────────────

/**
 * MCP Resource definition for data access.
 */
export interface McpResource {
  description: string;
  mimeType?: string;
  name: string;
  uri: string;
}

// ── Prompt Definitions ───────────────────────────────────────────────────────

/**
 * MCP Prompt template for structured prompts.
 */
export interface McpPrompt {
  arguments?: Record<string, string>;
  description: string;
  name: string;
}

// ── Server Configuration ─────────────────────────────────────────────────────

/**
 * MCP Server configuration.
 */
export interface McpServerConfig {
  capabilities?: McpCapabilities;
  name: string;
  prompts?: McpPrompt[];
  resources?: McpResource[];
  tools?: McpTool[];
  version?: string;
}

/**
 * MCP Server capabilities.
 */
export interface McpCapabilities {
  prompts?: boolean;
  resources?: boolean;
  streaming?: boolean;
  tools?: boolean;
}

// ── Invocation Types ─────────────────────────────────────────────────────────

/**
 * MCP Tool invocation parameters.
 */
export interface McpToolInvocation {
  arguments?: Record<string, unknown>;
  toolName: string;
}

/**
 * MCP Tool result.
 */
export interface McpToolResult {
  /** Array of content items returned by the tool. */
  content: ToolContent[];
  /** Whether the tool invocation resulted in an error. */
  isError?: boolean;
}

// ── Resource Results ─────────────────────────────────────────────────────────

/**
 * MCP Resource read result.
 */
export interface McpResourceResult {
  contents: string;
  mimeType?: string;
  uri: string;
}
