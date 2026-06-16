import type { JsonObject } from '@agentsy/shared';

export interface XmlToolCall {
  /** How this tool call was encoded in the stream. */
  format: 'bare-xml' | 'json-wrapped' | 'native-json';
  /** Provider-assigned call ID, present when the provider supplies one (e.g. OpenAI, Anthropic, Bedrock). */
  id?: string;
  name: string;
  parameters: JsonObject;
}

const MAX_XML_TOOL_CALL_INPUT_LENGTH = 1_000_000;

const VALID_TAG_START_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_';
const VALID_PARAM_NAME_REGEX = /^[A-Za-z_]\w*$/;
const JSON_START_REGEX = /[{[]/;

const VALID_TAG_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_:-';

interface ParsedXmlElement {
  endIndex: number;
  inner: string;
  name: string;
}

function isValidTagStartCharacter(char: string): boolean {
  return VALID_TAG_START_CHARACTERS.includes(char);
}

function isValidTagCharacter(char: string): boolean {
  return VALID_TAG_CHARACTERS.includes(char);
}

function stripMarkdownCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('```')) {
    return trimmed;
  }

  const firstLineEnd = trimmed.indexOf('\n');
  if (firstLineEnd === -1) {
    return trimmed.replaceAll('```', '').trim();
  }

  const openingFence = trimmed.slice(0, firstLineEnd).trim().toLowerCase();
  if (openingFence !== '```' && openingFence !== '```json' && openingFence !== '```xml') {
    return trimmed;
  }

  const closingFenceIndex = trimmed.lastIndexOf('```');
  if (closingFenceIndex <= firstLineEnd) {
    return trimmed.slice(firstLineEnd + 1).trim();
  }

  return trimmed.slice(firstLineEnd + 1, closingFenceIndex).trim();
}

function parseXmlElement(text: string, startIndex: number): ParsedXmlElement | null {
  if (text[startIndex] !== '<') {
    return null;
  }

  const firstTagChar = text[startIndex + 1];
  if (firstTagChar === undefined || !isValidTagStartCharacter(firstTagChar)) {
    return null;
  }

  let tagEnd = startIndex + 2;
  while (tagEnd < text.length && isValidTagCharacter(text[tagEnd] ?? '')) {
    tagEnd += 1;
  }

  const tagName = text.slice(startIndex + 1, tagEnd);
  if (tagName.length === 0) {
    return null;
  }

  const openEnd = text.indexOf('>', tagEnd);
  if (openEnd === -1) {
    return null;
  }

  const closingPrefix = `</${tagName}`;
  const closeStart = text.indexOf(closingPrefix, openEnd + 1);
  if (closeStart === -1) {
    return null;
  }

  const closeEnd = text.indexOf('>', closeStart + closingPrefix.length);
  if (closeEnd === -1) {
    return null;
  }

  const closeSuffix = text.slice(closeStart + closingPrefix.length, closeEnd).trim();
  if (closeSuffix.length > 0) {
    return null;
  }

  return {
    endIndex: closeEnd + 1,
    inner: text.slice(openEnd + 1, closeStart),
    name: tagName
  };
}

function extractBareXmlParams(inner: string): JsonObject {
  const VALID_PARAM_NAME = VALID_PARAM_NAME_REGEX;
  const params: JsonObject = {} as JsonObject;
  let cursor = 0;

  while (cursor < inner.length) {
    const nextOpen = inner.indexOf('<', cursor);
    if (nextOpen === -1) {
      break;
    }

    const element = parseXmlElement(inner, nextOpen);
    if (element === null) {
      cursor = nextOpen + 1;
      continue;
    }

    if (VALID_PARAM_NAME.test(element.name)) {
      params[element.name] = element.inner.trim();
    }

    cursor = element.endIndex;
  }

  return params;
}

function cleanXml(text: string): string {
  if (text.length > MAX_XML_TOOL_CALL_INPUT_LENGTH) {
    return text;
  }

  let cleaned = text.replaceAll('```xml', '').replaceAll('```XML', '').replaceAll('```', '');
  const firstTagIndex = cleaned.indexOf('<');
  if (firstTagIndex > 0) {
    cleaned = cleaned.slice(firstTagIndex);
  }

  const lastTagIndex = cleaned.lastIndexOf('>');
  if (lastTagIndex !== -1 && lastTagIndex < cleaned.length - 1) {
    cleaned = cleaned.slice(0, lastTagIndex + 1);
  }

  return cleaned;
}

/**
 * Attempts to parse bare Hermes-style JSON tool call output produced by models
 * like Qwen2.5Coder that ignore the XML system prompt and output raw JSON:
 *   {"name": "fn_name", "arguments": {...}}
 * or the OpenAI-style array variant:
 *   [{"name": "fn_name", "arguments": {...}}]
 */
function extractBareJsonToolCalls(text: string, knownTools: Set<string>): XmlToolCall[] {
  if (text.length > MAX_XML_TOOL_CALL_INPUT_LENGTH) {
    return [];
  }

  // Try to be permissive: models sometimes emit prose or markdown fences
  // before the raw JSON. Strip common fences and then find the first JSON
  // object/array opening and attempt to parse from there.
  const normalized = stripMarkdownCodeFence(text);
  const firstBracket = normalized.search(JSON_START_REGEX);
  if (firstBracket === -1) {
    return [];
  }

  const jsonSlice = normalized.slice(firstBracket).trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonSlice);
  } catch {
    return [];
  }

  const candidates: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
  const results: XmlToolCall[] = [];

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      continue;
    }
    const obj: Record<string, unknown> = candidate as Record<string, unknown>;
    const name = typeof obj.name === 'string' ? obj.name : null;
    if (!(name && knownTools.has(name))) {
      continue;
    }
    const args = obj.arguments ?? obj.parameters ?? {};
    const parameters =
      typeof args === 'object' && !Array.isArray(args) ? ({ ...args } as JsonObject) : ({} as JsonObject);

    results.push({ name, parameters, format: 'json-wrapped' });
  }

  return results;
}

function extractJsonWrappedToolCall(rawTag: string, inner: string, knownTools: Set<string>): XmlToolCall | null {
  if (!isJsonToolCallWrapper(rawTag)) {
    return null;
  }

  const parsed = parseJsonToolCallPayload(inner);
  if (parsed === null) {
    return null;
  }

  const name = parseKnownToolName(parsed.name, knownTools);
  if (name === null) {
    return null;
  }

  return {
    format: 'json-wrapped',
    name,
    parameters: normalizeWrappedToolCallArguments(parsed)
  };
}

function isJsonToolCallWrapper(rawTag: string): boolean {
  const wrapperName = rawTag.toLowerCase();
  return wrapperName === 'toolcall' || wrapperName === 'tool_call';
}

function parseJsonToolCallPayload(inner: string): { name?: unknown; arguments?: unknown; parameters?: unknown } | null {
  try {
    return JSON.parse(inner.trim()) as {
      name?: unknown;
      arguments?: unknown;
      parameters?: unknown;
    };
  } catch {
    return null;
  }
}

function parseKnownToolName(name: unknown, knownTools: Set<string>): string | null {
  if (typeof name !== 'string') {
    return null;
  }
  return knownTools.has(name) ? name : null;
}

function normalizeWrappedToolCallArguments(parsed: { arguments?: unknown; parameters?: unknown }): JsonObject {
  const args = pickFirstObjectValue(parsed.arguments, parsed.parameters);
  if (args === null) {
    return {} as JsonObject;
  }
  const result: JsonObject = { ...args } as JsonObject;
  return result;
}

function pickFirstObjectValue(...values: unknown[]): Record<string, unknown> | null {
  for (const value of values) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return null;
}

/**
 * Extracts tool calls from LLM output. Supports three formats:
 * - Bare XML: `<tool_name><param>value</param></tool_name>`
 * - JSON-wrapped: `<tool_call>{"name":"fn","arguments":{…}}</tool_call>` (Hermes / Qwen3)
 * - Bare JSON fallback: `{"name":"fn","arguments":{…}}` (Qwen2.5Coder when XML prompt is ignored)
 *
 * `<think>…</think>` reasoning blocks emitted by Qwen/DeepSeek before tool calls
 * are silently skipped.
 *
 * @returns An array of successfully parsed tool calls. Malformed or unrecognised
 *          tool calls are silently skipped — the function never throws.
 */

export function extractXmlToolCalls(text: string, knownTools: Set<string>): XmlToolCall[] {
  if (knownTools.size === 0 || text.length > MAX_XML_TOOL_CALL_INPUT_LENGTH) {
    return [];
  }

  const cleaned = cleanXml(text);
  const results: XmlToolCall[] = [];

  let cursor = 0;
  while (cursor < cleaned.length) {
    const nextOpen = cleaned.indexOf('<', cursor);
    if (nextOpen === -1) {
      break;
    }

    const element = parseXmlElement(cleaned, nextOpen);
    if (element === null) {
      cursor = nextOpen + 1;
      continue;
    }

    const parsed = parseXmlToolCallMatch(element.name, element.inner, knownTools);
    if (parsed !== null) {
      results.push(parsed);
    }

    cursor = element.endIndex;
  }

  // Fallback: models like Qwen2.5Coder that ignore the XML system prompt and
  // emit a raw Hermes-style JSON object or array instead of XML.
  if (results.length === 0) {
    return extractBareJsonToolCalls(text, knownTools);
  }

  return results;
}

function parseXmlToolCallMatch(toolName: string, inner: string, knownTools: Set<string>): XmlToolCall | null {
  if (toolName.toLowerCase() === 'think') {
    return null;
  }

  const jsonWrapped = extractJsonWrappedToolCall(toolName, inner, knownTools);
  if (jsonWrapped !== null) {
    return jsonWrapped;
  }

  if (!knownTools.has(toolName)) {
    return null;
  }

  return {
    format: 'bare-xml',
    name: toolName,
    parameters: extractBareXmlParams(inner)
  };
}
