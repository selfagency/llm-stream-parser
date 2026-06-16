declare module 'cli-markdown' {
  const render: (markdown: string, options?: Record<string, unknown>) => string;
  export default render;
}

declare module 'cli-highlight' {
  export function highlight(code: string, options?: { language?: string }): string;
  export function supportsLanguage(lang: string): boolean;
}
