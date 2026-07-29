import { describe, expect, it } from 'vitest';

import {
  createArgumentSubstitutor,
  expandSlashCommandPrompt,
  parseArgumentString,
  parseSlashInvocation,
  substituteArguments
} from './argument-substitution.js';

describe('parseArgumentString', () => {
  it('returns [] for empty string', () => {
    expect(parseArgumentString('')).toEqual([]);
    expect(parseArgumentString('   ')).toEqual([]);
  });

  it('splits simple whitespace separated args', () => {
    expect(parseArgumentString('a b c')).toEqual(['a', 'b', 'c']);
    expect(parseArgumentString('src/utils/parser.ts')).toEqual(['src/utils/parser.ts']);
  });

  it('preserves quoted args with spaces', () => {
    expect(parseArgumentString('"a b" c')).toEqual(['a b', 'c']);
    expect(parseArgumentString('\'a b\' "c d"')).toEqual(['a b', 'c d']);
    expect(parseArgumentString('foo "bar baz" qux')).toEqual(['foo', 'bar baz', 'qux']);
  });

  it('handles mixed single and double quotes', () => {
    expect(parseArgumentString(`'file with spaces.txt' other`)).toEqual(['file with spaces.txt', 'other']);
  });

  it('handles multiple spaces between args', () => {
    expect(parseArgumentString('a   b\t\tc')).toEqual(['a', 'b', 'c']);
  });

  it('handles escaped quotes inside double-quoted string', () => {
    expect(parseArgumentString('"a \\"b\\" c"')).toEqual(['a "b" c']);
  });
});

describe('parseSlashInvocation', () => {
  it('parses command name only', () => {
    expect(parseSlashInvocation('/refactor')).toEqual({
      commandName: '/refactor',
      argsString: '',
      args: []
    });
  });

  it('parses command with single arg', () => {
    const res = parseSlashInvocation('/refactor src/utils/parser.ts');
    expect(res.commandName).toBe('/refactor');
    expect(res.argsString).toBe('src/utils/parser.ts');
    expect(res.args).toEqual(['src/utils/parser.ts']);
  });

  it('parses command with multiple args', () => {
    const res = parseSlashInvocation('/cmd arg1 arg2 arg3');
    expect(res.commandName).toBe('/cmd');
    expect(res.argsString).toBe('arg1 arg2 arg3');
    expect(res.args).toEqual(['arg1', 'arg2', 'arg3']);
  });

  it('preserves quoted args in parsed invocation', () => {
    const res = parseSlashInvocation('/cmd "file with spaces.txt" arg2');
    expect(res.commandName).toBe('/cmd');
    expect(res.args).toEqual(['file with spaces.txt', 'arg2']);
    expect(res.argsString).toBe('"file with spaces.txt" arg2');
  });
});

describe('substituteArguments', () => {
  it('replaces $ARGUMENTS with full argument string', () => {
    const result = substituteArguments('Refactor $ARGUMENTS to improve', 'src/utils/parser.ts');
    expect(result.substituted).toBe('Refactor src/utils/parser.ts to improve');
    expect(result.warnings).toEqual([]);
    expect(result.argsString).toBe('src/utils/parser.ts');
  });

  it('replaces $1, $2 positional args', () => {
    const result = substituteArguments('File $1 and $2', 'a.ts b.ts');
    expect(result.substituted).toBe('File a.ts and b.ts');
    expect(result.args).toEqual(['a.ts', 'b.ts']);
  });

  it('handles multiple args placeholders', () => {
    const result = substituteArguments('$1 $2 $3', 'x y z');
    expect(result.substituted).toBe('x y z');
  });

  it('returns empty string for missing positional arg with warning', () => {
    const result = substituteArguments('File $1 and $2', 'onlyOne');
    expect(result.substituted).toBe('File onlyOne and ');
    expect(result.warnings).toContain('Missing argument $2: only 1 argument(s) provided');
  });

  it('handles no args', () => {
    const result = substituteArguments('Refactor $ARGUMENTS to improve', '');
    expect(result.substituted).toBe('Refactor  to improve');
    expect(result.args).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('handles no args with positional placeholders → warnings', () => {
    const result = substituteArguments('File $1', '');
    expect(result.substituted).toBe('File ');
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain('$1');
  });

  it('preserves quoted args when substituting $1', () => {
    const result = substituteArguments('Process $1', '"file with spaces.txt"');
    expect(result.substituted).toBe('Process file with spaces.txt');
    expect(result.args).toEqual(['file with spaces.txt']);
  });

  it('preserves $ARGUMENTS as quoted original', () => {
    const rawArgs = '"file with spaces.txt" arg2';
    const result = substituteArguments('Process $ARGUMENTS', rawArgs);
    expect(result.substituted).toBe(`Process ${rawArgs}`);
    expect(result.args).toEqual(['file with spaces.txt', 'arg2']);
  });

  it('supports escaping with $$ → literal $', () => {
    const result = substituteArguments('Cost $$1 and $1', 'file.ts');
    // $$ => $ placeholder, so $$1 becomes $1 literal, $1 after should substitute
    expect(result.substituted).toBe('Cost $1 and file.ts');
  });

  it('supports escaping with \\$ → literal $', () => {
    const result = substituteArguments('Literal \\$ARGUMENTS and $ARGUMENTS', 'foo');
    expect(result.substituted).toBe('Literal $ARGUMENTS and foo');
  });

  it('escapes $$ARGUMENTS to literal', () => {
    const result = substituteArguments('Show $$ARGUMENTS', 'foo');
    expect(result.substituted).toBe('Show $ARGUMENTS');
  });

  it('handles multiple occurrences of same placeholder', () => {
    const result = substituteArguments('$1 and $1', 'dup');
    expect(result.substituted).toBe('dup and dup');
  });

  it('handles $ARGUMENTS appearing multiple times', () => {
    const result = substituteArguments('$ARGUMENTS | $ARGUMENTS', 'a b');
    expect(result.substituted).toBe('a b | a b');
  });

  it('handles mix of $ARGUMENTS and $1/$2', () => {
    const result = substituteArguments('Full: $ARGUMENTS, first: $1, second: $2', 'x y');
    expect(result.substituted).toBe('Full: x y, first: x, second: y');
  });

  it('supports $N beyond 9 (e.g., $10)', () => {
    const args = Array.from({ length: 11 }, (_, i) => `arg${i + 1}`).join(' ');
    const result = substituteArguments('tenth=$10 eleventh=$11', args);
    expect(result.substituted).toBe('tenth=arg10 eleventh=arg11');
  });
});

describe('expandSlashCommandPrompt', () => {
  it('expands /refactor src/file.ts correctly (integration example)', () => {
    const template =
      'Refactor $ARGUMENTS to improve readability and reduce complexity. Apply the SOLID principles where appropriate.';
    const result = expandSlashCommandPrompt(template, '/refactor src/utils/parser.ts');
    expect(result.substituted).toBe(
      'Refactor src/utils/parser.ts to improve readability and reduce complexity. Apply the SOLID principles where appropriate.'
    );
  });

  it('integration: /refactor with multiple args and $1 $2', () => {
    const template = 'Refactor $1 using $2';
    const result = expandSlashCommandPrompt(template, '/refactor src/a.ts src/b.ts');
    expect(result.substituted).toBe('Refactor src/a.ts using src/b.ts');
  });

  it('integration: invocation with quoted path', () => {
    const template = 'Refactor $ARGUMENTS';
    const result = expandSlashCommandPrompt(template, '/refactor "my file.ts"');
    expect(result.substituted).toBe('Refactor "my file.ts"');
    expect(result.args).toEqual(['my file.ts']);
  });

  it('integration: no args invocation still expands', () => {
    const template = 'Do something with $ARGUMENTS';
    const result = expandSlashCommandPrompt(template, '/do');
    expect(result.substituted).toBe('Do something with ');
  });
});

describe('createArgumentSubstitutor factory', () => {
  it('returns all methods', () => {
    const api = createArgumentSubstitutor();
    expect(typeof api.parseArgumentString).toBe('function');
    expect(typeof api.parseSlashInvocation).toBe('function');
    expect(typeof api.substituteArguments).toBe('function');
    expect(typeof api.expandSlashCommandPrompt).toBe('function');
  });

  it('factory methods behave same as direct exports', () => {
    const api = createArgumentSubstitutor();
    const direct = substituteArguments('hi $1', 'world');
    const viaFactory = api.substituteArguments('hi $1', 'world');
    expect(direct.substituted).toBe(viaFactory.substituted);
  });
});
