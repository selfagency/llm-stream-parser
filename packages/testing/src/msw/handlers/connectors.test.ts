import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestServer } from '../index.js';
import { createConnectorHandlers, createMockConnectorState } from './connectors.js';

const connectorState = createMockConnectorState();

const ts = createTestServer({
  includeMemory: false,
  includeRetrieval: false,
  extraHandlers: createConnectorHandlers({ state: connectorState })
});

beforeAll(() => ts.server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  ts.server.resetHandlers();
  connectorState.slackMessages = [];
});
afterAll(() => ts.server.close());

describe('connector MSW handlers', () => {
  describe('Slack', () => {
    it('posts a message via chat.postMessage', async () => {
      const res = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'C12345', text: 'Hello from test' })
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { ok?: boolean; channel?: string; ts?: string };
      expect(data.ok).toBe(true);
      expect(data.channel).toBe('C12345');
      expect(data.ts).toBeDefined();
    });

    it('reads conversation history', async () => {
      // First post a message
      await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'C12345', text: 'Test message' })
      });

      const res = await fetch('https://slack.com/api/conversations.history');
      expect(res.status).toBe(200);
      const data = (await res.json()) as { ok?: boolean; messages?: Array<{ text: string }> };
      expect(data.ok).toBe(true);
      expect(data.messages).toHaveLength(1);
      expect(data.messages?.[0]?.text).toBe('Test message');
    });

    it('handles empty conversation history', async () => {
      const res = await fetch('https://slack.com/api/conversations.history');
      expect(res.status).toBe(200);
      const data = (await res.json()) as { messages?: unknown[] };
      expect(data.messages).toEqual([]);
    });
  });

  describe('GitHub', () => {
    it('returns repository info', async () => {
      const res = await fetch('https://api.github.com/repos/test-owner/test-repo');
      expect(res.status).toBe(200);
      const data = (await res.json()) as { name?: string; full_name?: string };
      expect(data.name).toBe('test-repo');
      expect(data.full_name).toBe('test-owner/test-repo');
    });

    it('handles different owner/repo params', async () => {
      const res = await fetch('https://api.github.com/repos/my-org/my-project');
      expect(res.status).toBe(200);
      const data = (await res.json()) as { name?: string; full_name?: string };
      expect(data.name).toBe('my-project');
      expect(data.full_name).toBe('my-org/my-project');
    });
  });

  describe('Linear', () => {
    it('creates an issue via GraphQL mutation', async () => {
      const res = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'mutation { issueCreate(input: { title: "Test" }) { success issue { id title } } }',
          variables: { title: 'Test' }
        })
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data?: { issueCreate?: { success?: boolean; issue?: { id: string } } } };
      expect(data.data?.issueCreate?.success).toBe(true);
      expect(data.data?.issueCreate?.issue?.id).toBe('linear-1');
    });

    it('returns empty data for unknown mutations', async () => {
      const res = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'query { viewer { id } }' })
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as { data?: Record<string, unknown> };
      expect(data.data).toEqual({});
    });
  });
});
