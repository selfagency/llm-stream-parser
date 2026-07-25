export interface ToolResult {
  exitCode?: number;
  stderr?: string;
  stdout?: string;
}

export interface Message {
  content: string;
  role: string;
}

export class ReflectionLoop {
  private _reflectionCount = 0;
  private readonly _maxReflections: number;

  constructor(maxReflections = 3) {
    this._maxReflections = maxReflections;
  }

  shouldReflect(toolName: string, result: ToolResult): boolean {
    const relevantTools = ['run_command', 'lint', 'test'];
    if (!relevantTools.includes(toolName)) {
      return false;
    }
    if (this._reflectionCount >= this._maxReflections) {
      return false;
    }
    if (result.exitCode === undefined || result.exitCode === 0) {
      return false;
    }
    return true;
  }

  buildReflectionMessage(result: ToolResult): Message {
    this._reflectionCount++;
    return {
      role: 'user',
      content: `The previous command failed with exit code ${result.exitCode}. Output:\n\n${result.stdout ?? ''}\n\nPlease fix the issue and try again.`
    };
  }

  get reflectionCount(): number {
    return this._reflectionCount;
  }
}
