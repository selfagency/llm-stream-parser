/**
 * Mock for VS Code API.
 * This is used during testing when running outside the VS Code extension host context.
 */

export class Uri {
  public scheme = 'file';
  public authority = '';
  public path = '';
  public query = '';
  public fragment = '';
  public fsPath = '';

  constructor(schemeOrValue?: string, authority?: string, path?: string, query?: string, fragment?: string) {
    if (schemeOrValue && authority && path) {
      // Full constructor with all parameters
      this.scheme = schemeOrValue;
      this.authority = authority ?? '';
      this.path = path ?? '';
      this.query = query ?? '';
      this.fragment = fragment ?? '';
    } else if (schemeOrValue) {
      // Single string parameter - treating as value to parse
      this.path = schemeOrValue;
    }
  }

  static parse(_value: string): Uri {
    const uri = new Uri();
    uri.path = _value;
    return uri;
  }

  static file(_path: string): Uri {
    const uri = new Uri();
    uri.scheme = 'file';
    uri.path = _path;
    uri.fsPath = _path;
    return uri;
  }

  toString(): string {
    return this.path;
  }
}

export class ChatResponseProgressPart {
  public value: string;

  constructor(value: string) {
    this.value = value;
  }
}

export class Location {
  public uri: Uri;
  public range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };

  constructor(
    uri: Uri,
    range: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    }
  ) {
    this.uri = uri;
    this.range = range;
  }
}

export interface ChatResponseStream {
  anchor(value: unknown, title?: string): void;
  button(value: unknown): void;
  filetree(dir: unknown, baseUri: unknown): void;
  markdown(value: string | { value: string }): void;
  progress(value: string): void;
  push(part: unknown): void;
  reference(value: unknown): void;
}

export interface CancellationToken {
  isCancellationRequested: boolean;
  onCancellationRequested(listener: () => void): { dispose(): void };
}

export interface ExtensionContext {
  extensionMode: number;
  extensionUri: Uri;
  globalStoragePath: string;
  storagePath: string;
}

// Minimal mock interfaces for type compatibility
export interface LanguageModelChatProvider {
  id?: string;
}
export interface ChatContext {
  history?: unknown[];
}
export interface ChatRequest {
  prompt: string;
}
export interface ChatResponse {
  result?: unknown;
}
export interface ChatResult {
  metadata?: Record<string, unknown>;
}
export interface ExternalUri {
  uri: string;
}
export interface ChatMessage {
  content: string;
  role: string;
}
