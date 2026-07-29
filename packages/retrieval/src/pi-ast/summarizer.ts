/**
 * pi-ast: Tree-sitter-inspired structural summaries for context compression
 *
 * Extracts top-level functions, classes, exports, imports from TS, JS, Python, Go
 * and produces a compact structural summary that replaces full file content when
 * over size threshold.
 */

export type SupportedLanguage = 'typescript' | 'javascript' | 'python' | 'go' | 'unknown';

export type SymbolKind =
  | 'class'
  | 'constant'
  | 'export'
  | 'function'
  | 'import'
  | 'interface'
  | 'method'
  | 'package'
  | 'type'
  | 'variable';

export interface SymbolInfo {
  readonly exported: boolean;
  readonly isAsync?: boolean;
  readonly kind: SymbolKind;
  readonly line: number;
  readonly name: string;
  readonly parentClass?: string;
  readonly signature: string;
}

export interface ImportInfo {
  readonly isDefault?: boolean;
  readonly isTypeOnly?: boolean;
  readonly line: number;
  readonly names: readonly string[];
  readonly raw: string;
  readonly source: string;
}

export interface ExportInfo {
  readonly kind: SymbolKind;
  readonly line: number;
  readonly name: string;
  readonly raw: string;
}

export interface FileSummary {
  readonly compressionRatio: number;
  readonly exports: readonly ExportInfo[];
  readonly filePath: string;
  readonly imports: readonly ImportInfo[];
  readonly language: SupportedLanguage;
  readonly originalSize: number;
  readonly summarySize: number;
  readonly summaryText: string;
  readonly symbols: readonly SymbolInfo[];
  readonly totalLines: number;
  readonly wasSummarized: boolean;
}

export interface SummarizerOptions {
  readonly includePrivate?: boolean;
  readonly maxBodyLines?: number;
  readonly maxSymbols?: number;
  readonly sizeThresholdChars?: number;
  readonly sizeThresholdLines?: number;
}

interface InternalOptions {
  readonly includePrivate: boolean;
  readonly maxBodyLines: number;
  readonly maxSymbols: number;
  readonly sizeThresholdChars: number;
  readonly sizeThresholdLines: number;
}

const DEFAULT_OPTIONS: InternalOptions = {
  includePrivate: false,
  maxBodyLines: 3,
  maxSymbols: 200,
  sizeThresholdChars: 12_000,
  sizeThresholdLines: 300
};

function resolveOptions(options?: SummarizerOptions): InternalOptions {
  return {
    includePrivate: options?.includePrivate ?? DEFAULT_OPTIONS.includePrivate,
    maxBodyLines: options?.maxBodyLines ?? DEFAULT_OPTIONS.maxBodyLines,
    maxSymbols: options?.maxSymbols ?? DEFAULT_OPTIONS.maxSymbols,
    sizeThresholdChars: options?.sizeThresholdChars ?? DEFAULT_OPTIONS.sizeThresholdChars,
    sizeThresholdLines: options?.sizeThresholdLines ?? DEFAULT_OPTIONS.sizeThresholdLines
  };
}

// ── Language Detection ──────────────────────────────────────────────────────

export function detectLanguage(filePath: string): SupportedLanguage {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.ts') || lower.endsWith('.tsx') || lower.endsWith('.mts') || lower.endsWith('.cts')) {
    return 'typescript';
  }
  if (lower.endsWith('.js') || lower.endsWith('.jsx') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) {
    return 'javascript';
  }
  if (lower.endsWith('.py') || lower.endsWith('.pyw')) {
    return 'python';
  }
  if (lower.endsWith('.go')) {
    return 'go';
  }
  return 'unknown';
}

// ── Shared Helpers ──────────────────────────────────────────────────────────

function extractBraceImportNames(statement: string): readonly string[] {
  const braceMatch = statement.match(/\{([^}]+)\}/);
  if (braceMatch) {
    const inside = braceMatch[1] ?? '';
    return inside
      .split(',')
      .map(s => {
        const part = s.trim().split(/\s+as\s+/)[0];
        return part?.trim() ?? '';
      })
      .filter(Boolean);
  }
  const defaultMatch = statement.match(/import\s+(\w+)\s+from/);
  if (defaultMatch) {
    const n = defaultMatch[1] ?? '';
    return n ? [n] : [];
  }
  const starMatch = statement.match(/import\s+\*\s+as\s+(\w+)/);
  if (starMatch) {
    const n = starMatch[1] ?? '';
    return n ? [n] : [];
  }
  return [];
}

function splitCsvNames(csv: string): readonly string[] {
  return csv
    .split(',')
    .map(s => {
      const part = s.trim().split(/\s+as\s+/)[0];
      return part?.trim() ?? '';
    })
    .filter(Boolean);
}

function isMethodKeyword(name: string): boolean {
  const keywords = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'throw', 'import', 'export', 'from']);
  return keywords.has(name);
}

function buildFunctionSignature(line: string): string {
  const withoutBody = line.replace(/\{.*$/, '').trim();
  if (withoutBody.endsWith('}')) {
    return withoutBody;
  }
  if (!withoutBody.includes('{')) {
    return `${withoutBody} { ... }`;
  }
  return withoutBody.replace(/\{.*$/, '{ ... }').trim();
}

function buildArrowFunctionSignature(line: string): string {
  const trimmed = line.trim();
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) {
    return trimmed.slice(0, 200);
  }
  const left = trimmed.slice(0, eqIdx).trim();
  const right = trimmed
    .slice(eqIdx + 1)
    .trim()
    .slice(0, 150);
  const arrowIdx = right.indexOf('=>');
  const arrowPart = arrowIdx === -1 ? right.slice(0, 80) : right.slice(0, arrowIdx + 2);
  return `${left} = ${arrowPart} ...`.slice(0, 250);
}

// ── TS / JS Parsing ─────────────────────────────────────────────────────────

interface TsParseResult {
  readonly exports: ExportInfo[];
  readonly imports: ImportInfo[];
  readonly symbols: SymbolInfo[];
}

const TS_IMPORT_RE = /^\s*import\s+(?:type\s+)?(?:\{[^}]*\}|[\w*\s{},]+)\s+from\s+['"]([^'"]+)['"]/;
const TS_IMPORT_SIDE_EFFECT_RE = /^\s*import\s+['"]([^'"]+)['"]\s*;?\s*$/;
const TS_IMPORT_TYPE_RE = /^\s*import\s+type\s+.*from\s+['"]([^'"]+)['"]/;
const TS_REQUIRE_RE = /(?:const|let|var)\s+.*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/;
const TS_EXPORT_FUNC_RE = /^\s*export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)\s*(\([^)]*\)?)\s*(?::\s*[^{;]+)?/;
const TS_EXPORT_CLASS_RE =
  /^\s*export\s+(?:default\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?(?:\s+implements\s+[^{]+)?/;
const TS_EXPORT_INTERFACE_RE = /^\s*export\s+interface\s+(\w+)(?:\s*<[^>]*>)?/;
const TS_EXPORT_TYPE_RE = /^\s*export\s+type\s+(\w+)(?:\s*<[^>]*>)?\s*=/;
const TS_EXPORT_CONST_RE = /^\s*export\s+(?:const|let|var)\s+(\w+)\s*[:=]/;
const TS_EXPORT_DEFAULT_CLASS_RE = /^\s*export\s+default\s+class\s+(\w+)?/;
const TS_EXPORT_DEFAULT_FUNC_RE = /^\s*export\s+default\s+(?:async\s+)?function\s+(\w+)?\s*(\([^)]*\)?)?/;
const TS_EXPORT_ENUM_RE = /^\s*export\s+(?:const\s+)?enum\s+(\w+)/;
const TS_EXPORT_FROM_RE = /^\s*export\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\*)\s+from\s+['"]([^'"]+)['"]/;
const TS_FUNC_RE = /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*(\([^)]*\)?)\s*(?::\s*[^{;]+)?/;
const TS_CLASS_RE = /^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?(?:\s+implements\s+[^{]+)?/;
const TS_INTERFACE_RE = /^\s*(?:export\s+)?interface\s+(\w+)(?:\s*<[^>]*>)?/;
const TS_TYPE_RE = /^\s*(?:export\s+)?type\s+(\w+)(?:\s*<[^>]*>)?\s*=/;
const TS_CONST_FN_RE = /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/;
const TS_CONST_FUNCTION_RE = /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?function\b/;
const TS_ARROW_FN_SIMPLE_RE =
  /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s+)?\([^)]*\)\s*(?::\s*[^=]+)?\s*=>/;
const TS_VAR_RE = /^\s*(?:export\s+)?(?:const|let|var)\s+(\w+)\s*[:=]/;
const TS_ENUM_RE = /^\s*(?:export\s+)?(?:const\s+)?enum\s+(\w+)/;
const TS_METHOD_RE =
  /^\s{2,}(?:public\s+|private\s+|protected\s+|static\s+|override\s+|readonly\s+|abstract\s+)*(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*[^{;]+)?\s*[{;]/;

function parseTsImports(lines: readonly string[]): ImportInfo[] {
  const imports: ImportInfo[] = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const trimmed = raw.trim();
    if (!trimmed.startsWith('import')) {
      const req = raw.match(TS_REQUIRE_RE);
      if (req) {
        imports.push({
          line: i + 1,
          names: [],
          raw: trimmed,
          source: req[1] ?? ''
        });
      }
      continue;
    }
    const match = raw.match(TS_IMPORT_RE) ?? raw.match(TS_IMPORT_TYPE_RE);
    if (match) {
      imports.push({
        isTypeOnly: trimmed.includes('import type'),
        line: i + 1,
        names: extractBraceImportNames(trimmed),
        raw: trimmed,
        source: match[1] ?? ''
      });
    } else {
      const side = raw.match(TS_IMPORT_SIDE_EFFECT_RE);
      if (side) {
        imports.push({
          line: i + 1,
          names: [],
          raw: trimmed,
          source: side[1] ?? ''
        });
      }
    }
  }
  return imports;
}

function tryParseTsFunction(
  trimmed: string,
  lineIndex: number,
  exported: boolean,
  seen: Set<string>
): SymbolInfo | null {
  const pattern = trimmed.startsWith('export') ? TS_EXPORT_FUNC_RE : TS_FUNC_RE;
  const m = trimmed.match(pattern);
  if (!m) {
    return null;
  }
  const name = m[1] ?? 'anonymous';
  const key = `function:${name}`;
  if (seen.has(key)) {
    return null;
  }
  seen.add(key);
  return {
    exported,
    isAsync: trimmed.includes('async'),
    kind: 'function',
    line: lineIndex + 1,
    name,
    signature: buildFunctionSignature(trimmed)
  };
}

function tryParseTsClass(
  trimmed: string,
  lineIndex: number,
  exported: boolean,
  seen: Set<string>,
  includePrivate: boolean
): SymbolInfo | null {
  const classPattern = includePrivate || exported ? TS_CLASS_RE : null;
  const classM =
    trimmed.match(TS_EXPORT_CLASS_RE) ??
    (classPattern ? trimmed.match(classPattern) : null) ??
    trimmed.match(TS_EXPORT_DEFAULT_CLASS_RE);
  if (!classM) {
    return null;
  }
  const name = classM[1] ?? 'default';
  const key = `class:${name}`;
  if (seen.has(key)) {
    return null;
  }
  seen.add(key);
  return {
    exported,
    kind: 'class',
    line: lineIndex + 1,
    name,
    signature: trimmed.replace(/\{.*$/, '{ ... }').trim()
  };
}

function tryParseTsInterface(
  trimmed: string,
  lineIndex: number,
  exported: boolean,
  seen: Set<string>,
  includePrivate: boolean
): SymbolInfo | null {
  const iface = trimmed.match(TS_EXPORT_INTERFACE_RE) ?? (includePrivate ? trimmed.match(TS_INTERFACE_RE) : null);
  if (!iface) {
    return null;
  }
  const name = iface[1] ?? '';
  if (!name) {
    return null;
  }
  const key = `interface:${name}`;
  if (seen.has(key)) {
    return null;
  }
  seen.add(key);
  return {
    exported,
    kind: 'interface',
    line: lineIndex + 1,
    name,
    signature: `${exported ? 'export ' : ''}interface ${name} { ... }`
  };
}

function tryParseTsType(
  trimmed: string,
  lineIndex: number,
  exported: boolean,
  seen: Set<string>,
  includePrivate: boolean
): SymbolInfo | null {
  const typeM = trimmed.match(TS_EXPORT_TYPE_RE) ?? (includePrivate ? trimmed.match(TS_TYPE_RE) : null);
  if (!typeM) {
    return null;
  }
  const name = typeM[1] ?? '';
  if (!name) {
    return null;
  }
  const key = `type:${name}`;
  if (seen.has(key)) {
    return null;
  }
  seen.add(key);
  return {
    exported,
    kind: 'type',
    line: lineIndex + 1,
    name,
    signature: trimmed
      .replace(/=\s*.+$/, '= ...')
      .trim()
      .slice(0, 200)
  };
}

function tryParseTsEnum(
  trimmed: string,
  lineIndex: number,
  exported: boolean,
  seen: Set<string>,
  includePrivate: boolean
): SymbolInfo | null {
  const enumM = trimmed.match(TS_EXPORT_ENUM_RE) ?? (includePrivate ? trimmed.match(TS_ENUM_RE) : null);
  if (!enumM) {
    return null;
  }
  const name = enumM[1] ?? '';
  if (!name) {
    return null;
  }
  const key = `constant:${name}`;
  if (seen.has(key)) {
    return null;
  }
  seen.add(key);
  return {
    exported,
    kind: 'constant',
    line: lineIndex + 1,
    name,
    signature: trimmed.replace(/\{.*$/, '{ ... }').trim()
  };
}

function tryParseTsArrowFunction(
  trimmed: string,
  lineIndex: number,
  exported: boolean,
  seen: Set<string>
): SymbolInfo | null {
  const arrowFn =
    trimmed.match(TS_CONST_FN_RE) ?? trimmed.match(TS_CONST_FUNCTION_RE) ?? trimmed.match(TS_ARROW_FN_SIMPLE_RE);
  if (!arrowFn) {
    return null;
  }
  const name = arrowFn[1] ?? '';
  if (!name) {
    return null;
  }
  const key = `function:${name}`;
  if (seen.has(key)) {
    return null;
  }
  seen.add(key);
  return {
    exported,
    isAsync: trimmed.includes('async'),
    kind: 'function',
    line: lineIndex + 1,
    name,
    signature: buildArrowFunctionSignature(trimmed)
  };
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: TS parsing with class/method state tracking
function parseTypeScript(content: string, includePrivate: boolean): TsParseResult {
  const lines = content.split('\n');
  const imports = parseTsImports(lines);
  const exports: ExportInfo[] = [];
  const symbols: SymbolInfo[] = [];
  const seenSymbols = new Set<string>();

  let braceDepth = 0;
  let currentClass: string | null = null;
  let classBraceDepth = -1;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i] ?? '';
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      const open = (line.match(/{/g) ?? []).length;
      const close = (line.match(/}/g) ?? []).length;
      braceDepth += open - close;
      if (currentClass !== null && braceDepth <= classBraceDepth) {
        currentClass = null;
        classBraceDepth = -1;
      }
      continue;
    }

    const isTopLevel = currentClass === null && braceDepth === 0;
    const exported = trimmed.startsWith('export');

    if (isTopLevel || exported) {
      const expFrom = trimmed.match(TS_EXPORT_FROM_RE);
      if (expFrom) {
        exports.push({
          kind: 'export',
          line: i + 1,
          name: `* from ${expFrom[1]}`,
          raw: trimmed
        });
      }

      const fnSym = tryParseTsFunction(trimmed, i, exported, seenSymbols);
      if (fnSym) {
        symbols.push(fnSym);
        if (exported) {
          exports.push({ kind: 'function', line: i + 1, name: fnSym.name, raw: trimmed });
        }
      }

      const defFn = trimmed.match(TS_EXPORT_DEFAULT_FUNC_RE);
      if (defFn && !seenSymbols.has('function:default')) {
        const name = defFn[1] ?? 'default';
        const sym: SymbolInfo = {
          exported: true,
          isAsync: trimmed.includes('async'),
          kind: 'function',
          line: i + 1,
          name,
          signature: buildFunctionSignature(trimmed)
        };
        symbols.push(sym);
        seenSymbols.add('function:default');
        exports.push({ kind: 'function', line: i + 1, name, raw: trimmed });
      }

      const classSym = tryParseTsClass(trimmed, i, exported, seenSymbols, includePrivate);
      if (classSym) {
        symbols.push(classSym);
        if (exported || trimmed.includes('export')) {
          exports.push({ kind: 'class', line: i + 1, name: classSym.name, raw: trimmed });
        }
        currentClass = classSym.name;
        classBraceDepth = braceDepth;
      }

      const ifaceSym = tryParseTsInterface(trimmed, i, exported, seenSymbols, includePrivate);
      if (ifaceSym) {
        symbols.push(ifaceSym);
        if (exported) {
          exports.push({ kind: 'interface', line: i + 1, name: ifaceSym.name, raw: trimmed });
        }
      }

      const typeSym = tryParseTsType(trimmed, i, exported, seenSymbols, includePrivate);
      if (typeSym) {
        symbols.push(typeSym);
        if (exported) {
          exports.push({ kind: 'type', line: i + 1, name: typeSym.name, raw: trimmed });
        }
      }

      const enumSym = tryParseTsEnum(trimmed, i, exported, seenSymbols, includePrivate);
      if (enumSym) {
        symbols.push(enumSym);
        if (exported) {
          exports.push({ kind: 'constant', line: i + 1, name: enumSym.name, raw: trimmed });
        }
      }

      const arrowSym = tryParseTsArrowFunction(trimmed, i, exported, seenSymbols);
      if (arrowSym) {
        symbols.push(arrowSym);
        if (exported) {
          exports.push({ kind: 'function', line: i + 1, name: arrowSym.name, raw: trimmed });
        }
      } else if (includePrivate || exported) {
        const varMatch = trimmed.match(TS_VAR_RE);
        if (varMatch && !trimmed.includes('=>') && !trimmed.includes('function')) {
          const constName = trimmed.match(TS_EXPORT_CONST_RE)?.[1] ?? varMatch[1] ?? '';
          if (constName) {
            const key = `variable:${constName}`;
            const variableSeen = seenSymbols.has(key) || seenSymbols.has(`function:${constName}`);
            if (!variableSeen) {
              const isConstExport = Boolean(trimmed.match(TS_EXPORT_CONST_RE));
              if (isConstExport || includePrivate) {
                const alreadyFn = symbols.some(s => s.name === constName && s.kind === 'function');
                if (!alreadyFn) {
                  symbols.push({
                    exported: isConstExport || exported,
                    kind: 'variable',
                    line: i + 1,
                    name: constName,
                    signature: trimmed.slice(0, 200)
                  });
                  seenSymbols.add(key);
                  if (isConstExport || exported) {
                    exports.push({ kind: 'variable', line: i + 1, name: constName, raw: trimmed });
                  }
                }
              }
            }
          }
        }
      }
    }

    if (currentClass !== null && braceDepth > classBraceDepth) {
      const methodMatch = line.match(TS_METHOD_RE);
      if (methodMatch) {
        const methodName = methodMatch[1];
        if (methodName && !isMethodKeyword(methodName)) {
          const key = `method:${currentClass}.${methodName}`;
          if (!seenSymbols.has(key)) {
            symbols.push({
              exported: false,
              kind: 'method',
              line: i + 1,
              name: methodName,
              parentClass: currentClass,
              signature: trimmed.replace(/\{.*$/, '{ ... }').slice(0, 200)
            });
            seenSymbols.add(key);
          }
        }
      }
    }

    const open = (line.match(/{/g) ?? []).length;
    const close = (line.match(/}/g) ?? []).length;
    braceDepth += open - close;
    if (currentClass !== null && braceDepth <= classBraceDepth) {
      currentClass = null;
      classBraceDepth = -1;
    }
  }

  return { exports, imports, symbols };
}

// ── Python Parsing ──────────────────────────────────────────────────────────

interface PythonParseResult {
  readonly exports: ExportInfo[];
  readonly imports: ImportInfo[];
  readonly symbols: SymbolInfo[];
}

const PY_IMPORT_RE = /^\s*(?:from\s+(\S+)\s+)?import\s+(.+)$/;
const PY_FUNC_RE = /^\s*(?:async\s+)?def\s+(\w+)\s*(\([^)]*\))\s*(?:->\s*[^:]+)?\s*:/;
const PY_CLASS_RE = /^\s*class\s+(\w+)(?:\s*\([^)]*\))?\s*:/;

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Python indent tracking
function parsePython(content: string, includePrivate: boolean): PythonParseResult {
  const lines = content.split('\n');
  const imports: ImportInfo[] = [];
  const exports: ExportInfo[] = [];
  const symbols: SymbolInfo[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const indent = raw.length - raw.trimStart().length;
    const isTopLevel = indent === 0;
    const skipNonTopLevel = !(includePrivate || isTopLevel);
    if (skipNonTopLevel) {
      continue;
    }

    const importMatch = trimmed.match(PY_IMPORT_RE);
    if (importMatch) {
      const fromPart = importMatch[1];
      const importPart = importMatch[2] ?? '';
      const source = fromPart ?? importPart.split(',')[0]?.trim() ?? '';
      imports.push({
        line: i + 1,
        names: splitCsvNames(importPart),
        raw: trimmed,
        source
      });
      continue;
    }

    if (isTopLevel) {
      const funcM = trimmed.match(PY_FUNC_RE);
      if (funcM) {
        const name = funcM[1] ?? '';
        if (!name) {
          // skip
        } else if (!includePrivate && name.startsWith('_')) {
          // skip private
        } else {
          const key = `function:${name}`;
          if (!seen.has(key)) {
            symbols.push({
              exported: true,
              isAsync: trimmed.startsWith('async'),
              kind: 'function',
              line: i + 1,
              name,
              signature: trimmed.replace(/:\s*$/, ': ...').slice(0, 250)
            });
            seen.add(key);
            exports.push({ kind: 'function', line: i + 1, name, raw: trimmed });
          }
        }
      }
      const classM = trimmed.match(PY_CLASS_RE);
      if (classM) {
        const name = classM[1] ?? '';
        if (!name) {
          // skip
        } else if (!includePrivate && name.startsWith('_')) {
          // skip private
        } else {
          const key = `class:${name}`;
          if (!seen.has(key)) {
            symbols.push({
              exported: true,
              kind: 'class',
              line: i + 1,
              name,
              signature: trimmed.replace(/:\s*$/, ': ...').slice(0, 250)
            });
            seen.add(key);
            exports.push({ kind: 'class', line: i + 1, name, raw: trimmed });
          }
        }
      }
    } else if (includePrivate) {
      const funcM = trimmed.match(PY_FUNC_RE);
      if (funcM) {
        const name = funcM[1] ?? '';
        if (name) {
          const key = `method:${name}:${i}`;
          if (!seen.has(key)) {
            symbols.push({
              exported: false,
              kind: 'method',
              line: i + 1,
              name,
              signature: trimmed.replace(/:\s*$/, ': ...').slice(0, 250)
            });
            seen.add(key);
          }
        }
      }
    }
  }

  return { exports, imports, symbols };
}

// ── Go Parsing ──────────────────────────────────────────────────────────────

interface GoParseResult {
  readonly exports: ExportInfo[];
  readonly imports: ImportInfo[];
  readonly symbols: SymbolInfo[];
}

const GO_PACKAGE_RE = /^\s*package\s+(\w+)/;
const GO_IMPORT_SINGLE_RE = /^\s*import\s+(?:\w+\s+)?["`]([^"`]+)["`]/;
const GO_IMPORT_START_RE = /^\s*import\s+\($/;
const GO_IMPORT_ENTRY_RE = /^\s*(?:\w+\s+)?["`]([^"`]+)["`]/;
const GO_FUNC_RE = /^\s*func\s+(?:\(\s*\w+\s+[^)]+\s*\)\s+)?(\w+)\s*(\([^)]*\))\s*(\(?[^ {]*\)?)?\s*\{?/;
const GO_TYPE_RE = /^\s*type\s+(\w+)\s+(struct|interface|\w+)/;
const GO_CONST_RE = /^\s*const\s+(\w+)/;

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Go import block state machine
function parseGo(content: string, includePrivate: boolean): GoParseResult {
  const lines = content.split('\n');
  const imports: ImportInfo[] = [];
  const exports: ExportInfo[] = [];
  const symbols: SymbolInfo[] = [];
  const seen = new Set<string>();
  let inImportBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('//')) {
      continue;
    }

    const pkgM = trimmed.match(GO_PACKAGE_RE);
    if (pkgM) {
      if (includePrivate) {
        symbols.push({
          exported: false,
          kind: 'package',
          line: i + 1,
          name: pkgM[1] ?? '',
          signature: trimmed
        });
      }
      continue;
    }

    if (GO_IMPORT_START_RE.test(trimmed)) {
      inImportBlock = true;
      continue;
    }
    if (inImportBlock && trimmed === ')') {
      inImportBlock = false;
      continue;
    }
    if (inImportBlock) {
      const entryM = trimmed.match(GO_IMPORT_ENTRY_RE);
      if (entryM) {
        imports.push({
          line: i + 1,
          names: [],
          raw: trimmed,
          source: entryM[1] ?? ''
        });
      }
      continue;
    }

    const singleImport = trimmed.match(GO_IMPORT_SINGLE_RE);
    if (singleImport) {
      imports.push({
        line: i + 1,
        names: [],
        raw: trimmed,
        source: singleImport[1] ?? ''
      });
      continue;
    }

    const funcM = trimmed.match(GO_FUNC_RE);
    if (funcM) {
      const name = funcM[1] ?? '';
      if (!name) {
        continue;
      }
      const isExported = /^[A-Z]/.test(name);
      const skipPrivateSymbol = !(isExported || includePrivate);
      if (skipPrivateSymbol) {
        continue;
      }
      const key = `function:${name}`;
      if (seen.has(key)) {
        continue;
      }
      const params = funcM[2] ?? '()';
      const returns = (funcM[3] ?? '').trim();
      const sig = returns ? `func ${name}${params} ${returns} { ... }` : `func ${name}${params} { ... }`;
      symbols.push({
        exported: isExported,
        kind: 'function',
        line: i + 1,
        name,
        signature: sig.slice(0, 250)
      });
      seen.add(key);
      if (isExported) {
        exports.push({ kind: 'function', line: i + 1, name, raw: trimmed });
      }
      continue;
    }

    const typeM = trimmed.match(GO_TYPE_RE);
    if (typeM) {
      const name = typeM[1] ?? '';
      const kindStr = typeM[2] ?? '';
      if (!name) {
        continue;
      }
      const isExported = /^[A-Z]/.test(name);
      const skipPrivateType = !(isExported || includePrivate);
      if (skipPrivateType) {
        continue;
      }
      const key = `type:${name}`;
      if (seen.has(key)) {
        continue;
      }
      let mappedKind: SymbolKind = 'type';
      if (kindStr === 'struct') {
        mappedKind = 'class';
      } else if (kindStr === 'interface') {
        mappedKind = 'interface';
      }
      symbols.push({
        exported: isExported,
        kind: kindStr === 'struct' ? 'class' : mappedKind,
        line: i + 1,
        name,
        signature: `type ${name} ${kindStr} { ... }`.slice(0, 250)
      });
      seen.add(key);
      if (isExported) {
        exports.push({ kind: mappedKind, line: i + 1, name, raw: trimmed });
      }
      continue;
    }

    const constM = trimmed.match(GO_CONST_RE);
    if (constM && includePrivate) {
      const name = constM[1] ?? '';
      const isExported = /^[A-Z]/.test(name);
      const key = `constant:${name}`;
      if (!seen.has(key)) {
        symbols.push({
          exported: isExported,
          kind: 'constant',
          line: i + 1,
          name,
          signature: trimmed.slice(0, 200)
        });
        seen.add(key);
      }
    }
  }

  return { exports, imports, symbols };
}

// ── Summary Formatting ──────────────────────────────────────────────────────

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: summary formatting groups symbols and truncates
function formatSummary(
  filePath: string,
  language: SupportedLanguage,
  totalLines: number,
  imports: readonly ImportInfo[],
  exports: readonly ExportInfo[],
  symbols: readonly SymbolInfo[],
  wasSummarized: boolean
): string {
  const out: string[] = [];
  out.push(`# Structural Summary: ${filePath}`);
  out.push(`- Language: ${language}`);
  out.push(`- Lines: ${totalLines} ${wasSummarized ? '(summarized)' : '(full)'}`);
  out.push(`- Symbols: ${symbols.length}, Imports: ${imports.length}, Exports: ${exports.length}`);
  out.push('');

  if (imports.length > 0) {
    out.push(`## Imports (${imports.length})`);
    for (const imp of imports.slice(0, 50)) {
      out.push(`- L${imp.line}: ${imp.raw}`);
    }
    if (imports.length > 50) {
      out.push(`- ... and ${imports.length - 50} more imports`);
    }
    out.push('');
  }

  if (exports.length > 0) {
    out.push(`## Exports (${exports.length})`);
    for (const exp of exports.slice(0, 100)) {
      out.push(`- L${exp.line}: ${exp.kind} ${exp.name}`);
    }
    if (exports.length > 100) {
      out.push(`- ... and ${exports.length - 100} more exports`);
    }
    out.push('');
  }

  const grouped = groupByKind(symbols);
  for (const [kind, groupSymbols] of Object.entries(grouped)) {
    if (groupSymbols.length === 0) {
      continue;
    }
    out.push(`### ${capitalize(kind)} (${groupSymbols.length})`);
    for (const sym of groupSymbols.slice(0, 100)) {
      const expMarker = sym.exported ? '[export] ' : '';
      const parentInfo = sym.parentClass ? ` (in ${sym.parentClass})` : '';
      out.push(`- L${sym.line}: ${expMarker}${sym.signature}${parentInfo}`);
    }
    if (groupSymbols.length > 100) {
      out.push(`- ... and ${groupSymbols.length - 100} more ${kind}s`);
    }
    out.push('');
  }

  return out.join('\n');
}

function groupByKind(symbols: readonly SymbolInfo[]): Record<string, SymbolInfo[]> {
  const groups: Record<string, SymbolInfo[]> = {};
  for (const sym of symbols) {
    const k = sym.kind;
    if (!groups[k]) {
      groups[k] = [];
    }
    groups[k].push(sym);
  }
  const order = [
    'package',
    'import',
    'class',
    'interface',
    'type',
    'function',
    'method',
    'constant',
    'variable',
    'export'
  ];
  const ordered: Record<string, SymbolInfo[]> = {};
  for (const kind of order) {
    if (groups[kind]) {
      ordered[kind] = groups[kind];
    }
  }
  for (const kind of Object.keys(groups)) {
    if (!ordered[kind]) {
      const g = groups[kind];
      if (g) {
        ordered[kind] = g;
      }
    }
  }
  return ordered;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Core Logic ──────────────────────────────────────────────────────────────

export interface Summarizer {
  compressIfNeeded(content: string, filePath: string): string;
  readonly options: InternalOptions;
  shouldSummarize(content: string, filePath?: string): boolean;
  summarize(content: string, filePath: string): FileSummary;
  summarizeToString(content: string, filePath: string): string;
}

export function createSummarizer(options?: SummarizerOptions): Summarizer {
  const resolved = resolveOptions(options);

  function parse(content: string, filePath: string) {
    const lang = detectLanguage(filePath);
    let imports: ImportInfo[] = [];
    let exports: ExportInfo[] = [];
    let symbols: SymbolInfo[] = [];

    switch (lang) {
      case 'typescript':
      case 'javascript': {
        const r = parseTypeScript(content, resolved.includePrivate);
        imports = r.imports;
        exports = r.exports;
        symbols = r.symbols;
        break;
      }
      case 'python': {
        const r = parsePython(content, resolved.includePrivate);
        imports = r.imports;
        exports = r.exports;
        symbols = r.symbols;
        break;
      }
      case 'go': {
        const r = parseGo(content, resolved.includePrivate);
        imports = r.imports;
        exports = r.exports;
        symbols = r.symbols;
        break;
      }
      default: {
        const r = parseTypeScript(content, resolved.includePrivate);
        imports = r.imports;
        exports = r.exports;
        symbols = r.symbols;
        break;
      }
    }

    if (symbols.length > resolved.maxSymbols) {
      symbols = symbols.slice(0, resolved.maxSymbols);
    }

    return { lang, exports, imports, symbols };
  }

  return {
    options: resolved,

    shouldSummarize(content: string): boolean {
      const lines = content.split('\n').length;
      if (lines > resolved.sizeThresholdLines) {
        return true;
      }
      if (content.length > resolved.sizeThresholdChars) {
        return true;
      }
      return false;
    },

    summarize(content: string, filePath: string): FileSummary {
      const totalLines = content.split('\n').length;
      const originalSize = content.length;
      const { lang, exports, imports, symbols } = parse(content, filePath);
      const wasSummarized = totalLines > resolved.sizeThresholdLines || originalSize > resolved.sizeThresholdChars;
      // Only format summary when file is over threshold; return original source otherwise
      const summaryText = wasSummarized
        ? formatSummary(filePath, lang, totalLines, imports, exports, symbols, true)
        : content;
      return {
        compressionRatio: originalSize > 0 ? summaryText.length / originalSize : 1,
        exports,
        filePath,
        imports,
        language: lang,
        originalSize,
        summarySize: summaryText.length,
        summaryText,
        symbols,
        totalLines,
        wasSummarized
      };
    },

    summarizeToString(content: string, filePath: string): string {
      const { lang, exports, imports, symbols } = parse(content, filePath);
      return formatSummary(filePath, lang, content.split('\n').length, imports, exports, symbols, true);
    },

    compressIfNeeded(content: string, filePath: string): string {
      const lines = content.split('\n').length;
      const should = lines > resolved.sizeThresholdLines || content.length > resolved.sizeThresholdChars;
      if (!should) {
        return content;
      }
      const { lang, exports, imports, symbols } = parse(content, filePath);
      const summary = formatSummary(filePath, lang, lines, imports, exports, symbols, true);
      // Never return a summary longer than the original — defeats the purpose
      return summary.length < content.length ? summary : content;
    }
  };
}

export function summarizeFile(content: string, filePath: string, options?: SummarizerOptions): FileSummary {
  return createSummarizer(options).summarize(content, filePath);
}

export function shouldSummarizeFile(content: string, options?: SummarizerOptions): boolean {
  return createSummarizer(options).shouldSummarize(content);
}

export function compressFileContent(content: string, filePath: string, options?: SummarizerOptions): string {
  return createSummarizer(options).compressIfNeeded(content, filePath);
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function fitsTokenBudget(summary: FileSummary, tokenBudget: number): boolean {
  return estimateTokens(summary.summaryText) <= tokenBudget;
}
