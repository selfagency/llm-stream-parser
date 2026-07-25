import { describe, expect, it } from 'vitest';
import { assertBlock, assertDetections, assertPass } from './test-helpers.js';
import { ToxicityScanner } from './toxicity.js';

describe('ToxicityScanner', () => {
  const scanner = new ToxicityScanner();

  it('passes on benign text', async () => {
    await assertPass(scanner, 'Thank you for your help!');
    await assertPass(scanner, 'The sunset was beautiful today.');
    await assertPass(scanner, 'I appreciate your thoughtful analysis.');
  });

  it('escalates hate speech (lowered severity for human review)', async () => {
    const r = await scanner.evaluate('You are a white supremacist');
    expect(r.status).toBe('escalate');
    assertDetections(r, ['hate-speech']);
  });

  it('escalates nazi reference (medium severity, not block)', async () => {
    const r = await scanner.evaluate('that is a nazi ideology');
    expect(r.status).toBe('escalate');
    assertDetections(r, ['hate-speech']);
  });

  it('blocks violence', async () => {
    const r = await assertBlock(scanner, 'kill yourself', 'Toxic content');
    assertDetections(r, ['violence']);
  });

  it('blocks self-harm references', async () => {
    const r = await assertBlock(scanner, 'I want to end my life', 'Toxic content');
    assertDetections(r, ['self-harm']);
  });

  it('warns on NSFW content', async () => {
    const r = await scanner.evaluate('This site has explicit content');
    expect(r.detections?.some(d => d.id === 'nsfw-content')).toBe(true);
  });

  it('has correct metadata', () => {
    const meta = scanner.metadata;
    expect(meta.id).toBe('hub://guardrails/toxicity');
    expect(meta.owaspCategories).toContain('asi-08');
  });
});
