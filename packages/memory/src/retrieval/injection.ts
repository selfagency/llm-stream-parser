import { createHash } from 'node:crypto';

export interface MemoryContextCandidate {
  content: string;
  id: string;
  scope: string;
  score: number;
  title?: string;
}

export interface FormatMemoryContextOptions {
  maxContentChars?: number;
  maxItems?: number;
}

export interface XmlContextContracts {
  dedupeXmlContextBlocksByTag(blocks: string[]): string[];
  splitLeadingXmlContextBlocks(input: string): {
    contextBlocks: string[];
    remaining: string;
  };
}

const DEFAULT_MAX_ITEMS = 8;
const DEFAULT_MAX_CONTENT_CHARS = 1200;

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function sanitizeText(value: string): string {
  return Array.from(value)
    .filter(character => {
      const codePoint = character.codePointAt(0) ?? 0;
      const isControl =
        (codePoint >= 0x00 && codePoint <= 0x08) ||
        (codePoint >= 0x0b && codePoint <= 0x0c) ||
        (codePoint >= 0x0e && codePoint <= 0x1f) ||
        codePoint === 0x7f;
      return !isControl;
    })
    .join('');
}

function splitLeadingXmlContextBlocks(input: string): {
  contextBlocks: string[];
  remaining: string;
} {
  const blocks: string[] = [];
  let remaining = input.trimStart();
  const blockPattern = /^<(memory_context|[a-z_][a-z0-9_.-]{0,63})[^>]*>[\s\S]*?<\/\1>/iu;

  while (true) {
    const match = blockPattern.exec(remaining);
    if (match?.index !== 0) {
      break;
    }

    const matchedText = match[0];
    blocks.push(matchedText.trim());
    remaining = remaining.slice(matchedText.length).trimStart();
  }

  return {
    contextBlocks: blocks,
    remaining: blocks.length > 0 ? remaining : input
  };
}

function dedupeXmlContextBlocksByTag(blocks: string[]): string[] {
  const latestByTag = new Map<string, string>();

  for (const block of blocks) {
    const tagMatch = /^<([a-z_][a-z0-9_.-]{0,63})\b/iu.exec(block);
    const tag = tagMatch?.[1] ?? `__raw__:${createHash('sha256').update(block).digest('hex').slice(0, 8)}`;
    latestByTag.set(tag, block.trim());
  }

  return [...latestByTag.values()];
}

const defaultContracts: XmlContextContracts = {
  dedupeXmlContextBlocksByTag,
  splitLeadingXmlContextBlocks
};

export function formatMemoryContextXml(
  candidates: MemoryContextCandidate[],
  options: FormatMemoryContextOptions = {}
): string {
  const maxItems = Math.max(1, options.maxItems ?? DEFAULT_MAX_ITEMS);
  const maxContentChars = Math.max(128, options.maxContentChars ?? DEFAULT_MAX_CONTENT_CHARS);

  const body = candidates
    .slice(0, maxItems)
    .map(candidate => {
      const title = sanitizeText(candidate.title ?? 'memory');
      const content = sanitizeText(candidate.content).slice(0, maxContentChars);
      return [
        `<memory_item id="${escapeXml(candidate.id)}" scope="${escapeXml(candidate.scope)}" score="${candidate.score.toFixed(3)}">`,
        `<title>${escapeXml(title)}</title>`,
        `<content>${escapeXml(content)}</content>`,
        '</memory_item>'
      ].join('');
    })
    .join('');

  return `<memory_context>${body}</memory_context>`;
}

export function injectMemoryContext(
  existingPrompt: string,
  incomingMemoryContext: string,
  contracts: XmlContextContracts = defaultContracts
): string {
  const existing = contracts.splitLeadingXmlContextBlocks(existingPrompt);
  const mergedBlocks = contracts.dedupeXmlContextBlocksByTag([...existing.contextBlocks, incomingMemoryContext]);
  const contextPrefix = mergedBlocks.filter(Boolean).join('\n');

  if (contextPrefix.length === 0) {
    return existingPrompt;
  }

  if (existing.remaining.trim().length === 0) {
    return contextPrefix;
  }

  return `${contextPrefix}\n${existing.remaining}`;
}
