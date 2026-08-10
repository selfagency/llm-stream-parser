import { describe, expect, it } from 'vitest';
import { SecretDetectionScanner } from './secret-detection.js';
import { assertBlock, assertDetections, assertPass } from './test-helpers.js';

describe('SecretDetectionScanner', () => {
  const scanner = new SecretDetectionScanner();

  it('passes on clean text', async () => {
    await assertPass(scanner, 'The server is running on port 8080.');
    await assertPass(scanner, 'Use the API reference at docs.example.com.');
    await assertPass(scanner, 'npm install @agentsy/core');
  });

  it('blocks GitHub token', async () => {
    const r = await assertBlock(scanner, 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'Critical secrets detected');
    assertDetections(r, ['github-token']);
  });

  it('blocks AWS access key', async () => {
    const r = await assertBlock(scanner, 'AKIAIOSFODNN7EXAMPLE', 'Critical secrets detected');
    assertDetections(r, ['aws-access-key']);
  });

  it('blocks Slack webhook', async () => {
    const r = await assertBlock(scanner, 'https://hooks.slack.com/services/T00/B00/xxxxx', 'Critical secrets detected');
    assertDetections(r, ['slack-webhook']);
  });

  it('blocks Stripe live key', async () => {
    const r = await assertBlock(scanner, 'sk_live_xxxxxxxxxxxxxxxxxxxx', 'Critical secrets detected');
    assertDetections(r, ['stripe-live-key']);
  });

  it('detects OpenAI API key', async () => {
    const r = await assertBlock(scanner, 'api_key=sk-xxxxxxxxxxxxxxxxxxxx', 'Critical secrets detected');
    assertDetections(r, ['openai-api-key']);
  });

  // E-33: Vercel pattern — requires context, bare 24-char alnum is not flagged
  it('passes on bare 24-char alphanumeric string (no Vercel context)', async () => {
    await assertPass(scanner, 'session token is AbCdEfGhIjKlMnOpQrStUvWx');
  });

  it('detects Vercel token with context keyword', async () => {
    const r = await scanner.evaluate('Vercel: AbCdEfGhIjKlMnOpQrStUvWx');
    expect(r.status).not.toBe('pass');
    assertDetections(r, ['vercel-token']);
  });

  // E-33: Postmark — requires context, bare UUID is not flagged
  it('passes on bare UUID (no Postmark context)', async () => {
    await assertPass(scanner, 'uuid: 550e8400-e29b-41d4-a716-446655440000');
  });

  it('detects Postmark token with context keyword', async () => {
    const r = await scanner.evaluate('Postmark: 550e8400-e29b-41d4-a716-446655440000');
    expect(r.status).not.toBe('pass');
    assertDetections(r, ['postmark-server-token']);
  });

  // E-33: Snyk — requires context, bare UUID is not flagged
  it('passes on bare UUID (no Snyk context)', async () => {
    await assertPass(scanner, 'uuid: 550e8400-e29b-41d4-a716-446655440000');
  });

  it('detects Snyk token with context keyword', async () => {
    // nosemgrep: test fixture with fake UUID, not a real Snyk key
    const r = await scanner.evaluate('snyk: 550e8400-e29b-41d4-a716-446655440000');
    expect(r.status).not.toBe('pass');
    assertDetections(r, ['snyk-token']);
  });

  it('has correct metadata', () => {
    const meta = scanner.metadata;
    expect(meta.id).toBe('hub://guardrails/secret-detection');
    expect(meta.owaspCategories).toContain('asi-08');
  });
});
