export type {
  AgentExecutionContext,
  LoadedAgent,
  TokenBudget
} from '../specs/types.js';

export interface ExecuteOptions {
  continueOnError?: boolean;
  maxRetries?: number;
  onProgress?: (progress: ExecutionProgress) => void;
  validate?: boolean;
}

export interface ExecutionProgress {
  message: string;
  output?: unknown;
  phase: string;
  progress: number;
}

export interface ExecutionResult {
  duration: number;
  errors: Error[];
  output?: unknown;
  stepsCompleted: string[];
  stepsFailed: string[];
  success: boolean;
  tokensUsed: number;
}
