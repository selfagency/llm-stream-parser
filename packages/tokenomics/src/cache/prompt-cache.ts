/**
 * Prompt cache header injection for Anthropic-style `cache_control` markers.
 *
 * Injects `cache_control: { type: "ephemeral" }` on static context segments
 * (system prompt, instructions, skills) while leaving dynamic segments
 * (user messages, tool results) untouched. This ensures the cache prefix
 * is never busted on compaction — only the static prefix is annotated.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A content block within a message that may carry a `cache_control` directive.
 */
export interface CacheAnnotatedContent {
  cache_control?: { type: 'ephemeral' };
  text: string;
  type: string;
  [key: string]: unknown;
}

/**
 * A message in the conversation that may carry `cache_control` on its content.
 */
export interface CacheAnnotatedMessage {
  cache_control?: { type: 'ephemeral' };
  content: string | CacheAnnotatedContent[];
  role: 'system' | 'user' | 'assistant' | 'tool';
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when a message role is considered "static" — part of the
 * prompt prefix that should be cached across turns.
 */
function isStaticRole(role: string): boolean {
  return role === 'system';
}

/**
 * Returns true when a content block type is considered static context.
 */
function isStaticContentType(type: string): boolean {
  return type === 'text';
}

// ---------------------------------------------------------------------------
// Annotation
// ---------------------------------------------------------------------------

/**
 * Annotate cacheable segments in a message array with
 * `cache_control: { type: "ephemeral" }`.
 *
 * Rules:
 * - System messages always get `cache_control` on the message level.
 * - Content blocks of static types (text) within system messages get
 *   per-block `cache_control`.
 * - User, assistant, and tool messages are left untouched — they are
 *   dynamic and would bust the cache prefix.
 *
 * @param messages  The full conversation message array.
 * @param staticBoundary  Index into `messages` up to which (exclusive)
 *                        messages are considered static prefix. Pass
 *                        `messages.length` to annotate all system messages.
 *                        Defaults to the first non-system message boundary.
 * @returns A new array with cache annotations applied. Original is unchanged.
 */
export function annotateCacheableSegments(
  messages: CacheAnnotatedMessage[],
  staticBoundary?: number
): CacheAnnotatedMessage[] {
  const boundary = staticBoundary ?? messages.findIndex(m => !isStaticRole(m.role));

  return messages.map((message, idx) => {
    // Only annotate messages within the static boundary
    if (idx >= boundary) {
      return message;
    }

    // System messages get message-level cache_control
    if (isStaticRole(message.role)) {
      const annotated: CacheAnnotatedMessage = {
        ...message,
        cache_control: { type: 'ephemeral' }
      };

      // Also annotate individual content blocks if they are an array
      if (Array.isArray(message.content)) {
        annotated.content = message.content.map(block => {
          if (isStaticContentType(block.type)) {
            return { ...block, cache_control: { type: 'ephemeral' } };
          }
          return block;
        });
      }

      return annotated;
    }

    return message;
  });
}

/**
 * Strip all `cache_control` annotations from a message array.
 * Useful before serialising for non-cache-aware providers.
 */
export function stripCacheAnnotations(messages: CacheAnnotatedMessage[]): CacheAnnotatedMessage[] {
  return messages.map(message => {
    const { cache_control: _cc, ...rest } = message;

    if (Array.isArray(rest.content)) {
      return {
        ...rest,
        content: rest.content.map(block => {
          const { cache_control: _bcc, ...blockRest } = block as CacheAnnotatedContent;
          return blockRest;
        })
      };
    }

    return rest;
  });
}
