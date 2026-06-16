/**
 * LLM request types.
 */

/**
 * Standardized input for any LLM request.
 * This is a generic interface that can be adapted to any provider (OpenAI, Anthropic, Gemini, etc.).
 */
export interface CompletionRequest {
  /** Frequency penalty for token sampling. */
  frequencyPenalty?: number;

  /** Maximum tokens to generate. */
  maxTokens?: number;

  /** Messages to send to the model. Each message has a role and content parts. */
  messages: CompletionMessage[];
  /** Model identifier (e.g., 'gpt-4', 'claude-3-opus', 'gemini-pro'). */
  model: string;

  /** Number of completions to generate. */
  n?: number;

  /** Presence penalty for token sampling. */
  presencePenalty?: number;

  /** Seed for deterministic outputs. */
  seed?: number;

  /** Stop sequences to halt generation. */
  stop?: string[];

  /** Whether to stream the response. */
  stream?: boolean;

  /** Temperature for response sampling (0.0-2.0). */
  temperature?: number;

  /** Optional tools/function calling configuration. */
  tools?: ToolDefinition[];

  /** Top-k sampling parameter. */
  topK?: number;

  /** Top-p (nucleus) sampling parameter. */
  topP?: number;
}

/**
 * Message in a completion request.
 */
export interface CompletionMessage {
  /** Message content or parts. */
  content: string | ContentPart[] | null;
  /** Message role. */
  role: 'system' | 'user' | 'assistant' | 'tool';

  /** Optional tool call result (for role: 'tool'). */
  toolCallId?: string;
  /**
   * Name of the tool (for role: 'tool').
   * @deprecated Use toolCallId instead.
   */
  toolName?: string;

  /** Tool calls made by the assistant (for role: 'assistant'). */
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

/**
 * Content part in a message.
 * Supports text, images, and tool calls.
 */
export type ContentPart = TextPart | ImagePart | ToolCallPart | ToolResultPart;

/** Plain text content. */
export interface TextPart {
  text: string;
  type: 'text';
}

/** Image content (for multimodal models). */
export interface ImagePart {
  /** Optional alternative text for accessibility. */
  detail?: 'auto' | 'low' | 'high';
  /** Image data as URL or base64-encoded string. */
  imageUrl: string;
  type: 'image';
}

/** Tool/function call content. */
export interface ToolCallPart {
  /** Tool call ID for associating with responses. */
  id: string;
  /** Structured arguments to pass to the tool. */
  input: Record<string, unknown>;
  /** Name of the tool to call. */
  name: string;
  type: 'tool_call';
}

/** Tool/function result content. */
export interface ToolResultPart {
  /** The result content from the tool. */
  content: string;
  /** Tool call ID this result corresponds to. */
  toolCallId: string;
  type: 'tool_result';
}

/**
 * Tool/function definition.
 */
export interface ToolDefinition {
  /** Tool description. */
  description: string;

  /** JSON Schema defining the function's parameters. */
  inputSchema: Record<string, unknown>;

  /** Optional: Union of input types (string, number, object, array, etc.). */
  inputType?: string;
  /** Tool name. */
  name: string;
}
