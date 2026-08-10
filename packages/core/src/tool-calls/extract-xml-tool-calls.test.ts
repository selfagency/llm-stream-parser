import { describe, expect, it } from 'vitest';

import { extractXmlToolCalls } from './extract-xml-tool-calls.js';

describe('extractXmlToolCalls', () => {
  const tools = new Set(['search', 'calculate']);

  it('returns empty array for empty knownTools', () => {
    expect(extractXmlToolCalls('<search>test</search>', new Set())).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(extractXmlToolCalls('', tools)).toEqual([]);
  });

  it('parses bare XML tool call', () => {
    const result = extractXmlToolCalls('<search><query>hello</query></search>', tools);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('search');
    expect(result[0]?.format).toBe('bare-xml');
  });

  it('parses JSON-wrapped tool call', () => {
    const result = extractXmlToolCalls(
      '<tool_call>{"name": "search", "arguments": {"query": "hello"}}</tool_call>',
      tools
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('search');
    expect(result[0]?.format).toBe('json-wrapped');
  });

  it('skips think blocks', () => {
    const result = extractXmlToolCalls('<think>reasoning</think><search>q</search>', tools);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('search');
  });

  it('falls back to bare JSON when no XML tool calls found', () => {
    const result = extractXmlToolCalls('{"name": "search", "arguments": {"query": "test"}}', tools);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('search');
  });

  it('handles bare JSON array format', () => {
    const result = extractXmlToolCalls(
      '[{"name": "search", "arguments": {"query": "a"}}, {"name": "calculate", "arguments": {"expr": "1+1"}}]',
      tools
    );
    expect(result).toHaveLength(2);
    expect(result[0]?.name).toBe('search');
    expect(result[1]?.name).toBe('calculate');
  });

  it('filters out unknown tools', () => {
    const result = extractXmlToolCalls('{"name": "unknown_tool", "arguments": {}}', tools);
    expect(result).toHaveLength(0);
  });

  it('handles markdown code fences', () => {
    const result = extractXmlToolCalls('```json\n{"name": "search", "arguments": {"query": "test"}}\n```', tools);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('search');
  });

  it('handles null/undefined candidate gracefully', () => {
    // The path through parseToolCallCandidate with null input
    const result = extractXmlToolCalls('[null, {"name": "search", "arguments": {"q": "t"}}]', tools);
    expect(result).toHaveLength(1);
  });

  it('handles tool call with parameters field', () => {
    const result = extractXmlToolCalls('{"name": "calculate", "parameters": {"expr": "2+2"}}', tools);
    expect(result).toHaveLength(1);
    expect(result[0]?.parameters).toEqual({ expr: '2+2' });
  });

  it('handles tool call without arguments both names', () => {
    const result = extractXmlToolCalls('{"name": "search", "parameters": {}}', tools);
    expect(result).toHaveLength(1);
  });
});
