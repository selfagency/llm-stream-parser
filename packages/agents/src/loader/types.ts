export interface LoadAgentOptions {
  filePath: string;
  validate?: boolean;
}

export interface LoadAgentError {
  cause?: unknown;
  filePath?: string;
  message: string;
}

export interface LoadAgentResult {
  agent: import('../specs/types.js').LoadedAgent | null;
  errors: LoadAgentError[];
}
