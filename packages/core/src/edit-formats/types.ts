/**
 * A single file edit operation produced by an edit-format parser.
 *
 * `original` is set for search-replace (the SEARCH text) and udiff (the diff text).
 * For whole-file edits, only `replacement` is needed.
 */
export interface FileEdit {
  filePath: string;
  /** The original content — SEARCH text for search-replace, diff text for udiff */
  original?: string;
  /** The replacement content — new text for search-replace / whole-file */
  replacement: string;
  type: 'search-replace' | 'udiff' | 'whole-file';
}

/** Wraps a list of successfully parsed edits and any errors encountered. */
export interface EditParseResult {
  edits: readonly FileEdit[];
  errors: readonly string[];
}
