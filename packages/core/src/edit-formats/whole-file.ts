import type { EditParseResult, FileEdit } from './types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const _FILE_HEADER_REGEX = /^(?:={3,}|---)\s+(.+)$/m;

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parses whole-file replacement blocks from model output.
 *
 * ## Format
 *
 * Each block starts with a header line containing the file path prefixed by
 * `=== ` or `--- `, followed by the entire new file content until the next
 * header or end of input:
 *
 * ```text
 * === src/index.ts
 * export function greet(name: string): string {
 *   return `Hello, ${name}!`;
 * }
 * === src/utils.ts
 * export const VERSION = '1.0.0';
 * ```
 *
 * The filepath may also be wrapped in XML tags:
 * ```text
 * <filename>src/index.ts</filename>
 * new content here
 * ```
 *
 * Content before the first recognised header is treated as preamble and
 * ignored.
 *
 * ## Error recovery
 *
 * Headers without subsequent content are still emitted (with an empty
 * replacement string).  The function never throws.
 */
export function parseWholeFile(text: string): EditParseResult {
  const edits: FileEdit[] = [];
  const errors: string[] = [];

  // Try XML-tag format first: <filename>path</filename> / <path>path</path>
  const xmlParser = parseXmlTagFormat(text);
  if (xmlParser.edits.length > 0) {
    return xmlParser;
  }

  // === / --- header format
  const lines = text.split('\n');
  let currentFile: string | null = null;
  let contentStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    const headerMatch = /^(?:={3,}|---)\s+(.+)$/.exec(line);
    if (headerMatch) {
      // Flush previous file
      if (currentFile) {
        const endContent = lines.slice(contentStart, i).join('\n');
        edits.push({
          filePath: currentFile,
          type: 'whole-file',
          replacement: endContent
        });
      }

      currentFile = headerMatch[1]?.trim() ?? null;
      if (!currentFile) {
        errors.push('Empty file path in header');
        continue;
      }
      contentStart = i + 1;
      continue;
    }

    // Also check for standalone XML-style filename on its own line
    if (currentFile === null) {
      const xmlMatch = /<filename>(.+?)<\/filename>/.exec(line);
      if (xmlMatch) {
        const path = xmlMatch[1]?.trim();
        if (path) {
          currentFile = path;
          contentStart = i + 1;
        }
      }
    }
  }

  // Flush last file
  if (currentFile && contentStart >= 0) {
    const endContent = lines.slice(contentStart).join('\n');
    edits.push({
      filePath: currentFile,
      type: 'whole-file',
      replacement: endContent
    });
  }

  if (edits.length === 0 && errors.length === 0) {
    errors.push('No whole-file edits found in text');
  }

  return { edits, errors };
}

// ---------------------------------------------------------------------------
// XML-tag format attempt
// ---------------------------------------------------------------------------

/**
 * Tries parsing text as a sequence of `<filename>path</filename>` blocks where
 * everything after the closing tag (until the next `<filename>` or EOF) is the
 * file content.
 */
function parseXmlTagFormat(text: string): EditParseResult {
  const edits: FileEdit[] = [];
  const errors: string[] = [];

  // Pattern: <filename>path</filename>  ...content...
  //          <path>path</path>          ...content...
  const xmlPattern =
    /<(?:filename|path)>\s*(.+?)\s*<\/(?:filename|path)>\s*\n?([\s\S]*?)(?=\n\s*<(?:filename|path)>|$)/gi;

  let match: RegExpExecArray | null;
  while ((match = xmlPattern.exec(text)) !== null) {
    const filePath = (match[1] ?? '').trim();
    const content = match[2] ?? '';

    if (!filePath) {
      errors.push('Empty file path in XML tag');
      continue;
    }

    edits.push({
      filePath,
      type: 'whole-file',
      replacement: content.trimEnd()
    });
  }

  return { edits, errors };
}
