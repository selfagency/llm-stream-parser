/**
 * Structured Markdown compaction template — 8 stable, grep-able sections.
 *
 * Produces Markdown output rather than free text so downstream tooling
 * can grep for section headers and parse reliably.
 *
 * Sections (fixed order):
 * 1. Goal
 * 2. Constraints
 * 3. Progress
 * 4. Decisions
 * 5. Next Steps
 * 6. Critical Context
 * 7. Relevant Files
 * 8. Session Meta
 */

export const COMPACTION_SECTIONS = [
  'Goal',
  'Constraints',
  'Progress',
  'Decisions',
  'Next Steps',
  'Critical Context',
  'Relevant Files',
  'Session Meta'
] as const;

export type CompactionSection = (typeof COMPACTION_SECTIONS)[number];

export interface CompactionTemplateData {
  constraints: string;
  criticalContext: string;
  decisions: string;
  goal: string;
  nextSteps: string;
  progress: string;
  relevantFiles: string;
  sessionMeta: string;
}

export type PartialCompactionTemplateData = Partial<CompactionTemplateData>;

export interface CompactionTemplateRenderOptions {
  includeToc?: boolean;
  placeholder?: string;
  title?: string;
}

export interface CompactionTemplateRenderer {
  createData: (partial?: PartialCompactionTemplateData) => CompactionTemplateData;
  parse: (markdown: string) => CompactionTemplateData;
  render: (data: PartialCompactionTemplateData, options?: CompactionTemplateRenderOptions) => string;
  validate: (markdown: string) => { valid: boolean; missingSections: CompactionSection[] };
}

const SECTION_KEY_MAP: Record<CompactionSection, keyof CompactionTemplateData> = {
  Goal: 'goal',
  Constraints: 'constraints',
  Progress: 'progress',
  Decisions: 'decisions',
  'Next Steps': 'nextSteps',
  'Critical Context': 'criticalContext',
  'Relevant Files': 'relevantFiles',
  'Session Meta': 'sessionMeta'
};

const DEFAULT_PLACEHOLDER = '_No content recorded._';
const DEFAULT_TITLE = '# Session Compaction Summary';

function normalizeContent(value: string | undefined): string {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : '';
}

export function createCompactionTemplateData(partial: PartialCompactionTemplateData = {}): CompactionTemplateData {
  return {
    constraints: normalizeContent(partial.constraints),
    criticalContext: normalizeContent(partial.criticalContext),
    decisions: normalizeContent(partial.decisions),
    goal: normalizeContent(partial.goal),
    nextSteps: normalizeContent(partial.nextSteps),
    progress: normalizeContent(partial.progress),
    relevantFiles: normalizeContent(partial.relevantFiles),
    sessionMeta: normalizeContent(partial.sessionMeta)
  };
}

export function renderCompactionTemplate(
  data: PartialCompactionTemplateData,
  options: CompactionTemplateRenderOptions = {}
): string {
  const full = createCompactionTemplateData(data);
  const placeholder = options.placeholder ?? DEFAULT_PLACEHOLDER;
  const title = options.title ?? DEFAULT_TITLE;
  const includeToc = options.includeToc ?? false;

  const lines: string[] = [];
  lines.push(title);
  lines.push('');

  if (includeToc) {
    lines.push('## Table of Contents');
    lines.push('');
    for (const section of COMPACTION_SECTIONS) {
      const anchor = section.toLowerCase().replace(/[\s]+/g, '-');
      lines.push(`- [${section}](#${anchor})`);
    }
    lines.push('');
  }

  for (const section of COMPACTION_SECTIONS) {
    const key = SECTION_KEY_MAP[section];
    const raw = full[key];
    const content = raw.length > 0 ? raw : placeholder;
    lines.push(`## ${section}`);
    lines.push('');
    lines.push(content);
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

interface HeaderMatch {
  headerLength: number;
  index: number;
  section: string;
}

function collectHeaderMatches(markdown: string): HeaderMatch[] {
  const headerPattern = /^##\s+(.+?)\s*$/gm;
  const matches: HeaderMatch[] = [];
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: regex exec loop
  while ((m = headerPattern.exec(markdown)) !== null) {
    const sectionName = m[1]?.trim();
    if (sectionName) {
      matches.push({
        section: sectionName,
        index: m.index,
        headerLength: m[0].length
      });
    }
  }
  return matches;
}

function resolveSection(sectionName: string): CompactionSection | undefined {
  return COMPACTION_SECTIONS.find(s => s.toLowerCase() === sectionName.toLowerCase());
}

function isPlaceholderContent(content: string, extraPlaceholder?: string): boolean {
  if (content === '' || content === DEFAULT_PLACEHOLDER || content.startsWith('_No ')) {
    return true;
  }
  if (extraPlaceholder && content === extraPlaceholder) {
    return true;
  }
  return false;
}

export function parseCompactionTemplate(markdown: string, placeholder?: string): CompactionTemplateData {
  const result = createCompactionTemplateData();

  if (!markdown || markdown.trim().length === 0) {
    return result;
  }

  const matches = collectHeaderMatches(markdown);

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    if (!current) {
      continue;
    }
    const next = matches[i + 1];
    const contentStart = current.index + current.headerLength;
    const contentEnd = next ? next.index : markdown.length;
    const rawContent = markdown.slice(contentStart, contentEnd).trim();

    const normalizedSection = resolveSection(current.section);
    if (!normalizedSection) {
      continue;
    }

    const key = SECTION_KEY_MAP[normalizedSection];
    if (isPlaceholderContent(rawContent, placeholder)) {
      result[key] = '';
    } else {
      result[key] = rawContent;
    }
  }

  return result;
}

export function validateCompactionTemplate(markdown: string): {
  valid: boolean;
  missingSections: CompactionSection[];
} {
  const missing: CompactionSection[] = [];

  for (const section of COMPACTION_SECTIONS) {
    const pattern = new RegExp(`^##\\s+${escapeRegExp(section)}\\s*$`, 'im');
    if (!pattern.test(markdown)) {
      missing.push(section);
    }
  }

  return {
    valid: missing.length === 0,
    missingSections: missing
  };
}

function escapeRegExp(str: string): string {
  return str.replaceAll(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

export interface CreateCompactionTemplateOptions {
  defaultPlaceholder?: string;
  defaultTitle?: string;
}

export function createCompactionTemplate(options: CreateCompactionTemplateOptions = {}): CompactionTemplateRenderer {
  const placeholder = options.defaultPlaceholder ?? DEFAULT_PLACEHOLDER;
  const title = options.defaultTitle ?? DEFAULT_TITLE;

  return {
    createData: partial => createCompactionTemplateData(partial),
    parse: markdown => parseCompactionTemplate(markdown, placeholder),
    render: (data, renderOptions) =>
      renderCompactionTemplate(data, {
        placeholder: renderOptions?.placeholder ?? placeholder,
        title: renderOptions?.title ?? title,
        ...(renderOptions?.includeToc === undefined ? {} : { includeToc: renderOptions.includeToc })
      }),
    validate: markdown => validateCompactionTemplate(markdown)
  };
}

/**
 * Estimate token count (rough: ~4 chars per token).
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface CompactToTemplateOptions {
  maxChars?: number;
  maxTokens?: number;
  placeholder?: string;
  title?: string;
}

export function truncateSectionContent(content: string, maxChars: number): string {
  if (content.length <= maxChars) {
    return content;
  }
  const truncated = content.slice(0, maxChars - 50).trimEnd();
  return `${truncated}\n\n...[truncated ${content.length - truncated.length} chars]`;
}

export function compactToTemplate(data: PartialCompactionTemplateData, options: CompactToTemplateOptions = {}): string {
  const effectiveMaxChars = options.maxChars ?? (options.maxTokens ? options.maxTokens * 4 : undefined);
  const renderOpts: CompactionTemplateRenderOptions = {
    ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
    ...(options.title === undefined ? {} : { title: options.title })
  };

  if (!effectiveMaxChars) {
    return renderCompactionTemplate(data, renderOpts);
  }

  const full = createCompactionTemplateData(data);
  let rendered = renderCompactionTemplate(full, renderOpts);

  if (rendered.length <= effectiveMaxChars) {
    return rendered;
  }

  const keys = (Object.keys(full) as Array<keyof CompactionTemplateData>).sort(
    (a, b) => full[b].length - full[a].length
  );

  const reservedForStructure = 500;
  const budgetPerSection = Math.max(100, Math.floor((effectiveMaxChars - reservedForStructure) / 8));

  for (const key of keys) {
    if (full[key].length > budgetPerSection) {
      full[key] = truncateSectionContent(full[key], budgetPerSection);
    }
  }

  rendered = renderCompactionTemplate(full, renderOpts);

  if (rendered.length > effectiveMaxChars) {
    return `${rendered.slice(0, effectiveMaxChars - 30)}\n\n...[hard truncated]`;
  }

  return rendered;
}
