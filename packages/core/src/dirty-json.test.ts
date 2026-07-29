import { describe, expect, it } from 'vitest';

import { DirtyJson, dirtyParse } from './dirty-json.js';

// ── Fixture malformed JSON inputs ──────────────────────────────────────────

const TRAILING_COMMA_OBJ = '{ "a": 1, "b": 2, }';
const TRAILING_COMMA_NESTED = '{ "a": 1, "b": [ 1, 2, ], }';
const TRAILING_COMMA_ARR = '[ 1, 2, 3, ]';

const MISSING_BRACKET_OBJ = '{ "a": { "b": 1 }';
const MISSING_BRACKET_NESTED = '{ "a": [ 1, { "b": 2 }';
const MISSING_BRACKET_DEEP = '{ "a": { "b": { "c": 3 }';

const TRUNCATED_OBJ = '{ "a": 1, "b": 2';
const TRUNCATED_NESTED = '{ "a": [ 1, 2, 3';

const VALID_OBJ = '{ "a": 1, "b": "hello", "c": true }';
const VALID_ARR = '[ 1, 2, 3 ]';
const VALID_NESTED = '{ "a": { "b": [ 1, 2, 3 ] }, "c": "done" }';

const EMPTY_STRING = '';

const COMMENT_LINE = '{ "a": 1, // this is a comment\n  "b": 2 }';
const COMMENT_AFTER_VALUE = '{ "a": 1 // trailing comment\n}';
const COMMENT_MULTI_LINE = '{\n  "a": 1, // comment 1\n  "b": 2, // comment 2\n}';

// ── dirtyParse convenience function ─────────────────────────────────────────

describe('dirtyParse', () => {
  it('parses valid JSON objects', () => {
    const result = dirtyParse<Record<string, unknown>>(VALID_OBJ);
    expect(result).toEqual({ a: 1, b: 'hello', c: true });
  });

  it('parses valid JSON arrays', () => {
    const result = dirtyParse<number[]>(VALID_ARR);
    expect(result).toEqual([1, 2, 3]);
  });

  it('parses valid nested JSON', () => {
    const result = dirtyParse<Record<string, unknown>>(VALID_NESTED);
    expect(result).toEqual({ a: { b: [1, 2, 3] }, c: 'done' });
  });

  it('returns null for empty string', () => {
    expect(dirtyParse(EMPTY_STRING)).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(dirtyParse('   \n  ')).toBeNull();
  });

  it('recovers from trailing commas in objects', () => {
    const result = dirtyParse<Record<string, unknown>>(TRAILING_COMMA_OBJ);
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('recovers from trailing commas in nested structures', () => {
    const result = dirtyParse<Record<string, unknown>>(TRAILING_COMMA_NESTED);
    expect(result).toEqual({ a: 1, b: [1, 2] });
  });

  it('recovers from trailing commas in arrays', () => {
    const result = dirtyParse<number[]>(TRAILING_COMMA_ARR);
    expect(result).toEqual([1, 2, 3]);
  });

  it('recovers from missing closing brackets (object)', () => {
    const result = dirtyParse<Record<string, unknown>>(MISSING_BRACKET_OBJ);
    expect(result).toEqual({ a: { b: 1 } });
  });

  it('recovers from missing closing brackets (nested)', () => {
    const result = dirtyParse<Record<string, unknown>>(MISSING_BRACKET_NESTED);
    expect(result).toEqual({ a: [1, { b: 2 }] });
  });

  it('recovers from missing closing brackets (deep)', () => {
    const result = dirtyParse<Record<string, unknown>>(MISSING_BRACKET_DEEP);
    expect(result).toEqual({ a: { b: { c: 3 } } });
  });

  it('recovers from truncated JSON (object)', () => {
    const result = dirtyParse<Record<string, unknown>>(TRUNCATED_OBJ);
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('recovers from truncated JSON (nested array)', () => {
    const result = dirtyParse<Record<string, unknown>>(TRUNCATED_NESTED);
    expect(result).toEqual({ a: [1, 2, 3] });
  });

  it('recovers from line comments (// style)', () => {
    const result = dirtyParse<Record<string, unknown>>(COMMENT_LINE);
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('recovers from trailing comments after values', () => {
    const result = dirtyParse<Record<string, unknown>>(COMMENT_AFTER_VALUE);
    expect(result).toEqual({ a: 1 });
  });

  it('recovers from multi-line comments', () => {
    const result = dirtyParse<Record<string, unknown>>(COMMENT_MULTI_LINE);
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('recovers from combined trailing commas and missing brackets', () => {
    const input = '{ "a": 1, "b": [ 1, 2, ]';
    const result = dirtyParse<Record<string, unknown>>(input);
    expect(result).toEqual({ a: 1, b: [1, 2] });
  });

  it('recovers from combined comments and trailing commas', () => {
    const input = '{ "a": 1, // comment\n  "b": 2, }';
    const result = dirtyParse<Record<string, unknown>>(input);
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('returns null for completely malformed input', () => {
    expect(dirtyParse('<not json>')).toBeNull();
  });

  it('returns null for garbage text', () => {
    expect(dirtyParse('aksdjhf lskajdfh laksjdhf')).toBeNull();
  });
});

// ── DirtyJson streaming class ──────────────────────────────────────────────

describe('DirtyJson streaming class', () => {
  it('accumulates chunks via feed() and parses full result', () => {
    const parser = new DirtyJson();
    parser.feed('{ "a"');
    parser.feed(': 1, "b"');
    parser.feed(': 2 }');
    expect(parser.parse<Record<string, unknown>>()).toEqual({ a: 1, b: 2 });
  });

  it('handles trailing commas in streamed input', () => {
    const parser = new DirtyJson();
    parser.feed('{ "a": 1,');
    parser.feed('"b": 2, }');
    expect(parser.parse<Record<string, unknown>>()).toEqual({ a: 1, b: 2 });
  });

  it('handles missing brackets in streamed input', () => {
    const parser = new DirtyJson();
    parser.feed('{ "a": { "b": 1 }');
    expect(parser.parse<Record<string, unknown>>()).toEqual({ a: { b: 1 } });
  });

  it('reset() clears the buffer', () => {
    const parser = new DirtyJson();
    parser.feed('{ "a": 1 }');
    parser.reset();
    expect(parser.parse()).toBeNull();
  });

  it('parses valid streamed JSON with multiple feeds', () => {
    const parser = new DirtyJson();
    parser.feed('{ "a" : 1 ');
    parser.feed(', "b" : [ 1, 2, 3 ] }');
    expect(parser.parse<Record<string, unknown>>()).toEqual({ a: 1, b: [1, 2, 3] });
  });

  it('is reusable after reset', () => {
    const parser = new DirtyJson();
    parser.feed('{ "a": 1 }');
    expect(parser.parse()).toEqual({ a: 1 });
    parser.reset();
    parser.feed('{ "b": 2 }');
    expect(parser.parse()).toEqual({ b: 2 });
  });

  it('returns null from empty parser', () => {
    const parser = new DirtyJson();
    expect(parser.parse()).toBeNull();
  });

  it('recovers from comments in streamed chunks', () => {
    const parser = new DirtyJson();
    parser.feed('{ "a": 1, // comment\n');
    parser.feed('  "b": 2 }');
    expect(parser.parse<Record<string, unknown>>()).toEqual({ a: 1, b: 2 });
  });
});
