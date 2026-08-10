import { describe, expect, it } from 'vitest';
import { createHttpTool } from './index.js';

interface HttpFetchData {
  body: string;
  bodyFormat: string;
  headers: Record<string, string>;
  status: number;
  statusText: string;
}

describe('http_fetch tool', () => {
  it('returns a tool definition with correct metadata', () => {
    const tool = createHttpTool();
    expect(tool.name).toBe('http_fetch');
    expect(tool.description).toBeTruthy();
    expect(tool.handler).toBeInstanceOf(Function);
    expect(tool.parameters).toBeDefined();
    expect(tool.parameters?.find(p => p.name === 'url')?.required).toBe(true);
  });

  it('returns error for missing url', async () => {
    const tool = createHttpTool();
    const result = await tool.handler({});
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Missing required parameter');
  });

  it('returns error for empty url', async () => {
    const tool = createHttpTool();
    const result = await tool.handler({ url: '' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Missing required parameter');
  });

  it('fetches a URL and returns response data', async () => {
    const tool = createHttpTool();
    const result = await tool.handler({ url: 'https://example.com' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as HttpFetchData;
      expect(data.status).toBe(200);
      expect(data.body).toBeDefined();
      expect(data.bodyFormat).toBeDefined();
      expect(data.headers).toBeDefined();
      // example.com is HTML, so bodyFormat should be 'markdown'
      expect(data.bodyFormat).toBe('markdown');
      // Body should be markdown, not raw HTML
      expect(data.body).toContain('Example Domain');
      expect(data.body).not.toContain('<html>');
    }
  });

  it('returns bodyFormat as markdown for HTML content', async () => {
    const tool = createHttpTool();
    const result = await tool.handler({ url: 'https://example.com' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as HttpFetchData;
      expect(data.bodyFormat).toBe('markdown');
    }
  });

  it('returns bodyFormat as content-type for non-HTML content', async () => {
    const tool = createHttpTool();
    // Use a URL that returns JSON (jsonplaceholder is fast and reliable)
    const result = await tool.handler({ url: 'https://jsonplaceholder.typicode.com/posts/1' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const data = result.data as HttpFetchData;
      // jsonplaceholder returns application/json
      expect(data.bodyFormat).not.toBe('markdown');
      expect(typeof data.bodyFormat).toBe('string');
    }
  }, 15_000);

  it('handles fetch errors gracefully', async () => {
    const tool = createHttpTool();
    const result = await tool.handler({ url: 'https://nonexistent-domain-12345.com' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('http_fetch error');
  });
});
