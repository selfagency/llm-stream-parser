export type MistralContentPart = { type: 'text'; text: string } | { type: 'image_url'; imageUrl: string };

export interface MistralToolCall {
  function: {
    name: string;
    arguments: string;
  };
  id: string;
  type: 'function';
}

export type MistralMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | MistralContentPart[] }
  | {
      role: 'assistant';
      content: string | MistralContentPart[] | null;
      toolCalls?: MistralToolCall[];
    }
  | { role: 'tool'; content: string | null; toolCallId: string; name?: string };

export type MistralOutboundPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mimeType: string; data: Uint8Array | string }
  | {
      type: 'tool-call';
      callId: string;
      name: string;
      input?: Record<string, unknown>;
    }
  | { type: 'tool-result'; callId: string; content: string };

export interface MistralOutboundMessage {
  parts: MistralOutboundPart[];
  role: 'system' | 'user' | 'assistant';
}

export interface MistralOutboundAdapterOptions {
  /** Optional custom tool-call id normalizer. */
  normalizeToolCallId?: (originalId: string) => string;
  /** Optional warning hook for dropped/adjusted parts. */
  onWarning?: (message: string, context?: Record<string, unknown>) => void;
}

interface CollectedMessageParts {
  imageParts: MistralContentPart[];
  text: string;
  toolCalls: MistralToolCall[];
  toolResults: { callId: string; content: string }[];
}

const VALID_MISTRAL_TOOL_CALL_ID = /^[A-Za-z0-9]{9}$/u;

function defaultNormalizeToolCallIdFactory(): (originalId: string) => string {
  let next = 0;
  const cache = new Map<string, string>();

  return (originalId: string): string => {
    if (VALID_MISTRAL_TOOL_CALL_ID.test(originalId)) {
      cache.set(originalId, originalId);
      return originalId;
    }

    const existing = cache.get(originalId);
    if (existing !== undefined) {
      return existing;
    }

    next += 1;
    const normalized = `tc${String(next).padStart(7, '0')}`;
    cache.set(originalId, normalized);
    return normalized;
  };
}

function toImageDataUri(mimeType: string, data: Uint8Array | string): string {
  if (typeof data === 'string') {
    if (data.startsWith('data:')) {
      return data;
    }
    return `data:${mimeType};base64,${data}`;
  }
  const base64 = Buffer.from(data).toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

// fallow-ignore-next-line complexity — message parsing with multi-field conditional collection
function collectMessageParts(
  message: MistralOutboundMessage,
  normalizeToolCallId: (originalId: string) => string,
  toolNameById: Map<string, string>,
  onWarning?: (message: string, context?: Record<string, unknown>) => void
): CollectedMessageParts {
  const textParts: string[] = [];
  const imageParts: MistralContentPart[] = [];
  const toolCalls: MistralToolCall[] = [];
  const toolResults: { callId: string; content: string }[] = [];

  for (const part of message.parts) {
    if (part.type === 'text') {
      textParts.push(part.text);
      continue;
    }

    if (part.type === 'image') {
      if (message.role === 'system') {
        onWarning?.('Dropping non-text system image part for Mistral message.', {
          mimeType: part.mimeType,
          role: message.role
        });
        continue;
      }

      imageParts.push({
        imageUrl: toImageDataUri(part.mimeType, part.data),
        type: 'image_url'
      });
      continue;
    }

    if (part.type === 'tool-call') {
      const normalizedCallId = normalizeToolCallId(part.callId);
      toolNameById.set(normalizedCallId, part.name);
      toolCalls.push({
        function: {
          arguments: JSON.stringify(part.input ?? {}),
          name: part.name
        },
        id: normalizedCallId,
        type: 'function'
      });
      continue;
    }

    const normalizedCallId = normalizeToolCallId(part.callId);
    toolResults.push({
      callId: normalizedCallId,
      content: part.content
    });
  }

  return {
    imageParts,
    text: textParts.join(''),
    toolCalls,
    toolResults
  };
}

// fallow-ignore-next-line complexity — content building with role+content-type branching
function buildContentForMistralMessage(
  role: MistralOutboundMessage['role'],
  text: string,
  imageParts: MistralContentPart[],
  hasToolCalls: boolean
): string | MistralContentPart[] | null | undefined {
  const hasText = text.length > 0;
  const hasImages = imageParts.length > 0;

  if (hasImages) {
    const multimodal: MistralContentPart[] = [];
    if (hasText) {
      multimodal.push({ text, type: 'text' });
    }
    multimodal.push(...imageParts);
    return multimodal;
  }

  if (hasText) {
    return text;
  }

  if (role === 'assistant' && hasToolCalls) {
    return null;
  }
}

// fallow-ignore-next-line complexity — system message emission with multi-field accounting
function emitSystemMessage(
  out: MistralMessage[],
  text: string,
  imageCount: number,
  toolCallCount: number,
  toolResultCount: number,
  onWarning?: (message: string, context?: Record<string, unknown>) => void
): void {
  if (text.length > 0) {
    out.push({ content: text, role: 'system' });
  }

  if (imageCount > 0 || toolCallCount > 0 || toolResultCount > 0) {
    onWarning?.('Dropped unsupported non-text/non-user system parts for Mistral message.', {
      hasImages: imageCount > 0,
      hasToolCalls: toolCallCount > 0,
      toolResults: toolResultCount
    });
  }
}

// fallow-ignore-next-line complexity — non-system message emission with conditional content+tool dispatch
function emitNonSystemMessage(
  out: MistralMessage[],
  role: Extract<MistralOutboundMessage['role'], 'assistant' | 'user'>,
  content: string | MistralContentPart[] | null | undefined,
  toolCalls: MistralToolCall[]
): void {
  if (role === 'assistant') {
    if (content !== undefined || toolCalls.length > 0) {
      out.push({
        content: content ?? null,
        role: 'assistant',
        ...(toolCalls.length > 0 ? { toolCalls } : {})
      });
    }
    return;
  }

  if (content !== undefined && content !== null) {
    out.push({ content, role: 'user' });
  }
}

function emitToolResults(
  out: MistralMessage[],
  toolResults: { callId: string; content: string }[],
  toolNameById: Map<string, string>
): void {
  for (const result of toolResults) {
    const toolName = toolNameById.get(result.callId);
    out.push({
      content: result.content,
      role: 'tool',
      toolCallId: result.callId,
      ...(typeof toolName === 'string' ? { name: toolName } : {})
    });
  }
}

/**
 * Converts VS Code-like outbound chat messages into Mistral chat request messages.
 */
export function toMistralMessages(
  messages: readonly MistralOutboundMessage[],
  options: MistralOutboundAdapterOptions = {}
): MistralMessage[] {
  const normalizeToolCallId = options.normalizeToolCallId ?? defaultNormalizeToolCallIdFactory();
  const out: MistralMessage[] = [];
  const toolNameById = new Map<string, string>();

  for (const message of messages) {
    const { text, imageParts, toolCalls, toolResults } = collectMessageParts(
      message,
      normalizeToolCallId,
      toolNameById,
      options.onWarning
    );
    const hasToolCalls = toolCalls.length > 0;

    if (message.role === 'system') {
      emitSystemMessage(out, text, imageParts.length, toolCalls.length, toolResults.length, options.onWarning);
      continue;
    }

    const content = buildContentForMistralMessage(message.role, text, imageParts, hasToolCalls);
    emitNonSystemMessage(out, message.role, content, toolCalls);
    emitToolResults(out, toolResults, toolNameById);
  }

  return out;
}
