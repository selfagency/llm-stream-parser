import { describe, expect, it } from 'vitest';

import {
  compressFileContent,
  createSummarizer,
  detectLanguage,
  estimateTokens,
  fitsTokenBudget,
  shouldSummarizeFile,
  summarizeFile
} from './summarizer.js';

const TS_SAMPLE = `
import { foo } from './foo.js';
import type { Config } from './config.js';
import * as utils from './utils.js';
import './side-effect.js';

export interface User {
  id: string;
  name: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: Error };

export const VERSION = '1.0.0';

export function createUser(name: string): User {
  return { id: '1', name };
}

export async function fetchUser(id: string): Promise<User> {
  // fetch logic
  return { id, name: 'test' };
}

export class UserService {
  private cache = new Map<string, User>();

  constructor(private config: Config) {}

  getUser(id: string): User | undefined {
    return this.cache.get(id);
  }

  async saveUser(user: User): Promise<void> {
    this.cache.set(user.id, user);
  }

  static createDefault(): UserService {
    return new UserService({} as Config);
  }
}

export const createDefaultUser = (name: string): User => {
  return createUser(name);
};

export default class DefaultService {
  run(): void {}
}

function internalHelper(): void {
  // not exported
}

const internalConst = 42;
`;

const JS_SAMPLE = `
const fs = require('fs');
import { readFile } from 'fs/promises';

export function loadFile(path) {
  return fs.readFileSync(path, 'utf-8');
}

export class FileLoader {
  load(p) {
    return loadFile(p);
  }
}

export const VERSION = '2.0.0';
`;

const PYTHON_SAMPLE = `
import os
import sys
from typing import List, Dict
from mymodule import foo, bar

def create_user(name: str) -> dict:
    return {"id": "1", "name": name}

async def fetch_user(user_id: str):
    return {"id": user_id}

class UserService:
    def __init__(self, config):
        self.config = config

    def get_user(self, user_id: str):
        return None

    async def save_user(self, user):
        pass

def _private_helper():
    pass
`;

const GO_SAMPLE = `
package userservice

import (
  "fmt"
  "context"
  "github.com/example/config"
)

import "os"

type User struct {
  ID string
  Name string
}

type Service interface {
  GetUser(id string) (User, error)
}

func CreateUser(name string) User {
  return User{ID: "1", Name: name}
}

func (s *Service) GetUser(ctx context.Context, id string) (User, error) {
  return User{}, nil
}

func privateHelper() {
  fmt.Println("private")
}

const DefaultTimeout = 30
`;

describe('detectLanguage', () => {
  it('detects typescript', () => {
    expect(detectLanguage('file.ts')).toBe('typescript');
    expect(detectLanguage('file.tsx')).toBe('typescript');
    expect(detectLanguage('src/index.mts')).toBe('typescript');
  });

  it('detects javascript', () => {
    expect(detectLanguage('file.js')).toBe('javascript');
    expect(detectLanguage('file.jsx')).toBe('javascript');
    expect(detectLanguage('file.mjs')).toBe('javascript');
  });

  it('detects python', () => {
    expect(detectLanguage('script.py')).toBe('python');
  });

  it('detects go', () => {
    expect(detectLanguage('main.go')).toBe('go');
  });

  it('returns unknown for unknown extensions', () => {
    expect(detectLanguage('file.unknown')).toBe('unknown');
    expect(detectLanguage('Makefile')).toBe('unknown');
  });
});

describe('createSummarizer', () => {
  it('creates with default options', () => {
    const summarizer = createSummarizer();
    expect(summarizer.options.sizeThresholdLines).toBe(300);
    expect(summarizer.options.sizeThresholdChars).toBe(12_000);
  });

  it('creates with custom options', () => {
    const summarizer = createSummarizer({ sizeThresholdLines: 100, includePrivate: true });
    expect(summarizer.options.sizeThresholdLines).toBe(100);
    expect(summarizer.options.includePrivate).toBe(true);
  });

  it('detects language via standalone function', () => {
    expect(detectLanguage('file.ts')).toBe('typescript');
    expect(detectLanguage('file.py')).toBe('python');
  });
});

describe('shouldSummarizeFile', () => {
  it('returns false for small files', () => {
    const small = 'line1\nline2\nline3';
    expect(shouldSummarizeFile(small)).toBe(false);
  });

  it('returns true for files over line threshold', () => {
    const manyLines = Array.from({ length: 400 }, (_, i) => `line ${i}`).join('\n');
    expect(shouldSummarizeFile(manyLines)).toBe(true);
  });

  it('returns true for files over char threshold', () => {
    const long = 'a'.repeat(13_000);
    expect(shouldSummarizeFile(long)).toBe(true);
  });

  it('respects custom thresholds', () => {
    const content = Array.from({ length: 150 }, () => 'x').join('\n');
    expect(shouldSummarizeFile(content, { sizeThresholdLines: 100 })).toBe(true);
    expect(shouldSummarizeFile(content, { sizeThresholdLines: 200 })).toBe(false);
  });
});

describe('summarizeFile - TypeScript', () => {
  it('extracts top-level functions, classes, exports', () => {
    const summary = summarizeFile(TS_SAMPLE, 'src/users.ts', {
      sizeThresholdLines: 10,
      includePrivate: true
    });

    expect(summary.language).toBe('typescript');
    expect(summary.wasSummarized).toBe(true);
    expect(summary.imports.length).toBeGreaterThanOrEqual(4);
    expect(summary.exports.length).toBeGreaterThanOrEqual(5);
    expect(summary.symbols.length).toBeGreaterThanOrEqual(6);

    const names = summary.symbols.map(s => s.name);
    expect(names).toContain('User');
    expect(names).toContain('Result');
    expect(names).toContain('createUser');
    expect(names).toContain('fetchUser');
    expect(names).toContain('UserService');
    expect(names).toContain('VERSION');
    expect(names).toContain('createDefaultUser');
  });

  it('detects function export correctly', () => {
    const summary = summarizeFile(TS_SAMPLE, 'test.ts', { sizeThresholdLines: 5 });
    const funcs = summary.symbols.filter(s => s.kind === 'function');
    expect(funcs.length).toBeGreaterThanOrEqual(3);
    const exported = summary.symbols.filter(s => s.exported);
    expect(exported.length).toBeGreaterThan(0);
  });

  it('detects class and its methods', () => {
    const summary = summarizeFile(TS_SAMPLE, 'test.ts', {
      sizeThresholdLines: 5,
      includePrivate: true
    });
    const classes = summary.symbols.filter(s => s.kind === 'class');
    expect(classes.length).toBeGreaterThanOrEqual(1);
    const methods = summary.symbols.filter(s => s.kind === 'method');
    expect(methods.length).toBeGreaterThanOrEqual(2);
    expect(methods.some(m => m.name === 'getUser')).toBe(true);
  });

  it('includes imports in summary', () => {
    const summary = summarizeFile(TS_SAMPLE, 'test.ts', { sizeThresholdLines: 5 });
    expect(summary.imports.length).toBe(4);
    expect(summary.imports[0]?.source).toBe('./foo.js');
    expect(summary.summaryText).toContain('Imports');
  });

  it('includes signatures but omits bodies', () => {
    const summary = summarizeFile(TS_SAMPLE, 'test.ts', { sizeThresholdLines: 5 });
    expect(summary.summaryText).toContain('createUser');
    expect(summary.summaryText).not.toContain('return { id:');
  });

  it('handles default export class', () => {
    const summary = summarizeFile(TS_SAMPLE, 'test.ts', { sizeThresholdLines: 5 });
    const defaultClass = summary.symbols.find(s => s.name === 'DefaultService');
    expect(defaultClass).toBeDefined();
    expect(defaultClass?.exported).toBe(true);
  });
});

describe('summarizeFile - JavaScript', () => {
  it('parses JS file', () => {
    const summary = summarizeFile(JS_SAMPLE, 'file.js', { sizeThresholdLines: 5 });
    expect(summary.language).toBe('javascript');
    expect(summary.symbols.length).toBeGreaterThanOrEqual(2);
    expect(summary.summaryText).toContain('loadFile');
    expect(summary.summaryText).toContain('FileLoader');
  });

  it('extracts require imports', () => {
    const summary = summarizeFile(JS_SAMPLE, 'file.js', { sizeThresholdLines: 1 });
    expect(summary.imports.length).toBeGreaterThanOrEqual(1);
  });
});

describe('summarizeFile - Python', () => {
  it('parses Python file with functions and classes', () => {
    const summary = summarizeFile(PYTHON_SAMPLE, 'script.py', {
      sizeThresholdLines: 5,
      includePrivate: true
    });
    expect(summary.language).toBe('python');
    expect(summary.symbols.length).toBeGreaterThanOrEqual(3);
    const names = summary.symbols.map(s => s.name);
    expect(names).toContain('create_user');
    expect(names).toContain('UserService');
  });

  it('extracts imports', () => {
    const summary = summarizeFile(PYTHON_SAMPLE, 'script.py', { sizeThresholdLines: 5 });
    expect(summary.imports.length).toBeGreaterThanOrEqual(3);
    expect(summary.summaryText).toContain('Imports');
  });

  it('handles async functions', () => {
    const summary = summarizeFile(PYTHON_SAMPLE, 'script.py', {
      sizeThresholdLines: 5,
      includePrivate: false
    });
    const asyncFuncs = summary.symbols.filter(s => s.isAsync);
    expect(asyncFuncs.length).toBeGreaterThanOrEqual(1);
  });
});

describe('summarizeFile - Go', () => {
  it('parses Go file with package, structs, funcs', () => {
    const summary = summarizeFile(GO_SAMPLE, 'main.go', {
      sizeThresholdLines: 5,
      includePrivate: true
    });
    expect(summary.language).toBe('go');
    expect(summary.symbols.length).toBeGreaterThanOrEqual(3);
    const names = summary.symbols.map(s => s.name);
    expect(names).toContain('User');
    expect(names).toContain('CreateUser');
  });

  it('detects exported vs private based on capital letter', () => {
    const summary = summarizeFile(GO_SAMPLE, 'main.go', {
      sizeThresholdLines: 1,
      includePrivate: false
    });
    const exported = summary.symbols.filter(s => s.exported);
    expect(exported.length).toBeGreaterThan(0);
    const privateSymbols = summary.symbols.filter(s => !s.exported);
    expect(privateSymbols.length).toBe(0);

    const withPrivate = summarizeFile(GO_SAMPLE, 'main.go', {
      sizeThresholdLines: 1,
      includePrivate: true
    });
    const allPrivate = withPrivate.symbols.filter(s => !s.exported);
    expect(allPrivate.length).toBeGreaterThan(0);
  });

  it('extracts Go imports including block imports', () => {
    const summary = summarizeFile(GO_SAMPLE, 'main.go', { sizeThresholdLines: 1 });
    expect(summary.imports.length).toBeGreaterThanOrEqual(3);
  });
});

describe('large file handling', () => {
  it('summarizes large file to smaller size', () => {
    const largeContent = Array.from({ length: 500 }, (_, i) => {
      if (i % 20 === 0) {
        return `export function func${i}(): void {`;
      }
      if (i % 20 === 10) {
        return `  console.log("line ${i}");`;
      }
      if (i % 20 === 19) {
        return '}';
      }
      return `  // line ${i} with some content to increase size significantly for testing compression`;
    }).join('\n');

    const summary = summarizeFile(largeContent, 'large.ts', { sizeThresholdLines: 100 });

    expect(summary.wasSummarized).toBe(true);
    expect(summary.summarySize).toBeLessThan(summary.originalSize);
    expect(summary.compressionRatio).toBeLessThan(1);
    expect(summary.summaryText.length).toBeLessThan(largeContent.length);
  });

  it('does not summarize small files', () => {
    const small = 'export function small(): void { return; }';
    const summary = summarizeFile(small, 'small.ts', { sizeThresholdLines: 300 });
    expect(summary.wasSummarized).toBe(false);
    expect(summary.summaryText).toBe(small);
  });

  it('compressFileContent returns original when under threshold', () => {
    const small = 'export const x = 1;';
    const result = compressFileContent(small, 'small.ts', { sizeThresholdLines: 100 });
    expect(result).toBe(small);
  });

  it('compressFileContent returns summary when over threshold', () => {
    const large = Array.from({ length: 400 }, (_, i) => `export function f${i}() { return ${i}; }`).join('\n');
    const result = compressFileContent(large, 'large.ts', { sizeThresholdLines: 100 });
    expect(result).toContain('Structural Summary');
    expect(result.length).toBeLessThan(large.length);
  });
});

describe('integration - token budget', () => {
  it('compressed summary fits token budget', () => {
    const largeContent = Array.from({ length: 1000 }, (_, i) => {
      if (i % 30 === 0) {
        return `export function func${i}() {`;
      }
      if (i % 30 === 15) {
        return `  return ${i};`;
      }
      if (i % 30 === 29) {
        return '}';
      }
      return `  const x${i} = ${i} * 2; // filler line ${i}`;
    }).join('\n');

    const summarizer = createSummarizer({ sizeThresholdLines: 200 });
    const summary = summarizer.summarize(largeContent, 'huge.ts');

    expect(summary.wasSummarized).toBe(true);
    expect(summary.summarySize).toBeLessThan(summary.originalSize);

    const tokens = estimateTokens(summary.summaryText);
    const originalTokens = estimateTokens(largeContent);
    expect(tokens).toBeLessThan(originalTokens);

    // Fits in 2000 token budget (compressed should be much smaller)
    expect(fitsTokenBudget(summary, 2000)).toBe(true);
    // Original would not fit in small budget
    const tinyBudget = 500;
    const originalFits = estimateTokens(largeContent) <= tinyBudget;
    expect(originalFits).toBe(false);
    // Compression ratio is good
    expect(summary.compressionRatio).toBeLessThan(0.5);
  });

  it('summary includes all important sections', () => {
    const content = `
import { a } from './a.js';
import { b } from './b.js';
export function foo() {}
export class Bar {}
export interface Baz {}
export type Qux = string;
export const VERSION = '1.0';
`;
    const summary = summarizeFile(content, 'test.ts', { sizeThresholdLines: 2 });
    expect(summary.summaryText).toContain('Structural Summary');
    expect(summary.summaryText).toContain('Language');
    expect(summary.summaryText).toContain('Imports');
    expect(summary.summaryText).toContain('Exports');
    expect(summary.summaryText).toContain('Symbols');
  });

  it('handles empty file', () => {
    const summary = summarizeFile('', 'empty.ts', { sizeThresholdLines: 1 });
    expect(summary.totalLines).toBe(1);
    expect(summary.symbols.length).toBe(0);
    expect(summary.summaryText).toBeDefined();
  });

  it('handles file with only side effects', () => {
    const content = `
import './polyfill.js';
console.log('hello');
`;
    const summary = summarizeFile(content, 'side.ts', { sizeThresholdLines: 1 });
    expect(summary.imports.length).toBe(1);
    expect(summary.summaryText).toContain('Imports');
  });
});

describe('summarizer factory integration', () => {
  it('shouldSummarize respects thresholds', () => {
    const s = createSummarizer({ sizeThresholdLines: 10, sizeThresholdChars: 100 });
    expect(s.shouldSummarize('a\n'.repeat(5))).toBe(false);
    expect(s.shouldSummarize('a\n'.repeat(11))).toBe(true);
    expect(s.shouldSummarize('a'.repeat(101))).toBe(true);
  });

  it('summarizeToString always returns summary even for small files', () => {
    const s = createSummarizer({ sizeThresholdLines: 1000 });
    const small = 'export function foo() {}';
    const result = s.summarizeToString(small, 'small.ts');
    expect(result).toContain('Structural Summary');
  });

  it('compressIfNeeded integrates with context compression flow', () => {
    const s = createSummarizer({ sizeThresholdLines: 50 });
    const small = 'export const x = 1;';
    expect(s.compressIfNeeded(small, 'small.ts')).toBe(small);

    const large = Array.from({ length: 100 }, (_, i) => `export function f${i}() {}`).join('\n');
    const compressed = s.compressIfNeeded(large, 'large.ts');
    expect(compressed).not.toBe(large);
    expect(compressed).toContain('Structural Summary');
    expect(compressed.length).toBeLessThan(large.length);
  });
});
