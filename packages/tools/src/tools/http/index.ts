import TurndownService from 'turndown';
import type { ToolDefinition, ToolResult } from '../../definitions.js';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*'
});

export function createHttpTool(): ToolDefinition {
  return {
    name: 'http_fetch',
    description: 'Fetch a URL. Can trigger side effects on external systems.',
    annotations: {
      readOnlyHint: false,
      openWorldHint: true
    },
    parameters: [
      { name: 'url', type: 'string', required: true, description: 'URL to fetch' },
      { name: 'method', type: 'string', required: false, description: 'HTTP method (default: GET)' },
      { name: 'headers', type: 'object', required: false, description: 'Request headers' },
      { name: 'body', type: 'string', required: false, description: 'Request body (POST/PUT)' },
      { name: 'timeout', type: 'number', required: false, description: 'Timeout in ms' }
    ],
    handler: handleHttpFetch
  };
}

async function handleHttpFetch(input: Record<string, unknown>): Promise<ToolResult> {
  const url = typeof input.url === 'string' ? input.url : '';
  if (!url) {
    return { ok: false, data: null, error: 'Missing required parameter: url' };
  }

  const method = typeof input.method === 'string' ? input.method.toUpperCase() : 'GET';

  try {
    const response = await executeFetch(url, method, input);
    const rawBody = await response.text();
    const contentType = response.headers.get('content-type') ?? '';

    let body = rawBody;
    let bodyFormat: string;

    // Auto-convert HTML to Markdown
    if (contentType.includes('text/html') && rawBody.trim().startsWith('<')) {
      try {
        body = turndown.turndown(rawBody);
        bodyFormat = 'markdown';
      } catch {
        // If conversion fails, return raw HTML — don't break the fetch
        body = rawBody;
        bodyFormat = 'html';
      }
    } else {
      bodyFormat = contentType.includes('text/html') ? 'html' : contentType;
    }

    return {
      ok: true,
      data: {
        status: response.status,
        statusText: response.statusText,
        body,
        bodyFormat,
        headers: Object.fromEntries(response.headers.entries())
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, data: null, error: `http_fetch error: ${message}` };
  }
}

async function executeFetch(url: string, method: string, input: Record<string, unknown>): Promise<Response> {
  const timeout = typeof input.timeout === 'number' ? input.timeout : 10_000;
  const headers: Record<string, string> =
    input.headers && typeof input.headers === 'object' ? (input.headers as Record<string, string>) : {};
  const body = typeof input.body === 'string' ? input.body : undefined;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  const init: RequestInit = { method, headers, signal: controller.signal };
  if (body !== undefined) {
    init.body = body;
  }

  try {
    return await fetch(url, init);
  } finally {
    clearTimeout(timer);
  }
}
