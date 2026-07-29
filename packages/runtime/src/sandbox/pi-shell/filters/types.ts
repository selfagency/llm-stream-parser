export type OutputFilterId = 'cargo' | 'docker' | 'git' | 'go' | 'jvm' | 'npm' | 'python' | 'generic';

export interface FilterContext {
  readonly command?: string;
  readonly outputSample?: string;
}

export interface ShellFilter {
  detect(context: FilterContext): boolean;
  filter(lines: string[]): string[];
  readonly id: OutputFilterId;
}
