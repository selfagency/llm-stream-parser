
## 28. Phase 22 — Web Fetcher HTML-to-Markdown Enhancement

**Priority**: P3 — Sprint 6
**Story points**: 2
**Branch**: `feat/web-fetcher-markdown`
**Depends on**: nothing (standalone tool enhancement)
**Unblocks**: better agent consumption of web content

### 28.1 Goal

When the `http_fetch` tool fetches HTML content, automatically convert it to Markdown for the agent's ease of consumption. Uses [`turndown`](https://npmx.dev/package/turndown) — a lightweight HTML-to-Markdown converter.

### 28.2 Design

Update `packages/tools/src/tools/http/index.ts`:

```typescript
import TurndownService from 'turndown';

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
});

async function handleHttpFetch(input: Record<string, unknown>): Promise<ToolResult> {
  // ... existing fetch logic ...
  const response = await executeFetch(url, method, input);
  const rawBody = await response.text();
  const contentType = response.headers.get('content-type') ?? '';

  let body = rawBody;
  let converted = false;

  // Auto-convert HTML to Markdown
  if (contentType.includes('text/html') && rawBody.trim().startsWith('<')) {
    try {
      body = turndown.turndown(rawBody);
      converted = true;
    } catch {
      // If conversion fails, return raw HTML — don't break the fetch
      body = rawBody;
    }
  }

  return {
    ok: true,
    data: {
      status: response.status,
      statusText: response.statusText,
      body,
      bodyFormat: converted ? 'markdown' : (contentType.includes('text/html') ? 'html' : contentType),
      headers: Object.fromEntries(response.headers.entries()),
    },
  };
}
```

### 28.3 File-by-File Change List

**Modified** (2 files):

- `packages/tools/src/tools/http/index.ts` — add turndown conversion
- `packages/tools/package.json` — add `turndown` dependency

**New** (1 file):

- `packages/tools/src/tools/http/index.test.ts` — test HTML→Markdown conversion, non-HTML passthrough, conversion failure fallback

### 28.4 Verification

- [x] `http_fetch` returns Markdown when content-type is `text/html`
- [x] `http_fetch` returns raw body when content-type is not HTML
- [x] `http_fetch` returns raw HTML when turndown conversion throws (graceful fallback)
- [x] `bodyFormat` field correctly reports `markdown` | `html` | `<content-type>`
- [x] `pnpm check-types && pnpm lint && pnpm test` green

---
