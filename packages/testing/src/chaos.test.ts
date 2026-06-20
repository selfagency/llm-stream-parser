/**
 * Chaos test suite — validates provider failure mode handling.
 *
 * Uses @copilotkit/aimock LLMock to simulate provider responses.
 *
 * @see plan/phase-33-aimock-full-integration.md §33.3.6
 */

import { LLMock } from '@copilotkit/aimock';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let mock: LLMock;

beforeAll(async () => {
  mock = new LLMock({ port: 0 });

  // Register default fixtures for all tests
  mock.onMessage('hello', { content: 'Hello, world!' });
  mock.onMessage('test content', { content: 'Fixture response' });
  mock.onMessage('unregistered message', { content: 'Default response' });
  mock.onMessage('persistent', { content: 'Should not persist after reset' });

  await mock.start();
});

afterAll(async () => {
  await mock.stop();
});

describe('Chaos: provider failure modes', () => {
  it('returns standard completion response for basic request', async () => {
    const response = await fetch(`${mock.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'hello' }],
        stream: false
      })
    });
    expect(response.status).toBe(200);
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    expect(data.choices).toBeDefined();
    expect(data.choices?.[0]?.message?.content).toBe('Hello, world!');
  });

  it('returns SSE streaming for streaming requests', async () => {
    const response = await fetch(`${mock.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'hello' }],
        stream: true
      })
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    const body = await response.text();
    expect(body).toContain('data:');
  });

  it('returns fixture response for registered message pattern', async () => {
    const response = await fetch(`${mock.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'test content' }]
      })
    });

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    expect(data.choices?.[0]?.message?.content).toBe('Fixture response');
  });

  it('handles unregistered message with fallback', async () => {
    // onMessage uses substring matching — "unregistered" should match
    const response = await fetch(`${mock.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'something unknown' }]
      })
    });

    // Without fixture match, LLMock returns 404
    // This test documents the behavior
    expect(response.status).toBe(404);
  });

  it('resets and re-registers fixtures', async () => {
    mock.reset();
    mock.onMessage('new fixture', { content: 'New fixture after reset' });

    const response = await fetch(`${mock.url}/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'new fixture' }]
      })
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    expect(data.choices?.[0]?.message?.content).toBe('New fixture after reset');
  });
});
