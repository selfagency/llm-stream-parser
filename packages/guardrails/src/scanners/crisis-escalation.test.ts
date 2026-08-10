import { describe, expect, it } from 'vitest';
import { CrisisEscalationScanner } from './crisis-escalation.js';

const scanner = new CrisisEscalationScanner();

describe('CrisisEscalationScanner', () => {
  it('passes on ordinary input', async () => {
    const result = await scanner.evaluate('Can you help me write a report?');
    expect(result.status).toBe('pass');
  });

  it('escalates on direct suicidal ideation', async () => {
    const result = await scanner.evaluate('I want to die');
    expect(result.status).toBe('escalate');
    expect(result.detections).toHaveLength(1);
    expect(result.detections?.[0].id).toBe('crisis-language');
    expect(result.riskScore).toBeCloseTo(0.85, 1);
  });

  it('escalates on high-risk specific plan indicators', async () => {
    // Pattern matches "I will kill myself" (high-risk indicator)
    const result = await scanner.evaluate('I will kill myself');
    expect(result.status).toBe('escalate');
    expect(result.detections?.[0].id).toBe('crisis-high-risk');
    expect(result.riskScore).toBeCloseTo(0.98, 1);
  });

  it('escalates on means preparation', async () => {
    const result = await scanner.evaluate('I stockpiled pills for months');
    expect(result.status).toBe('escalate');
    expect(result.detections?.[0].id).toBe('crisis-high-risk');
    expect(result.riskScore).toBeCloseTo(0.98, 1);
  });

  it('escalates on slang abbreviations', async () => {
    const result = await scanner.evaluate('I kms every day');
    expect(result.status).toBe('escalate');
    expect(result.detections).toHaveLength(1);
    expect(result.detections?.[0].id).toBe('crisis-language');
  });

  it('escalates on self-harm means seeking', async () => {
    const result = await scanner.evaluate('How to kill myself');
    expect(result.status).toBe('escalate');
    expect(result.detections).toHaveLength(1);
    expect(result.detections?.[0].id).toBe('crisis-language');
  });

  it('includes crisis resources in escalate result', async () => {
    const result = (await scanner.evaluate('I want to kill myself')) as { status: string; reason: string };
    expect(result.status).toBe('escalate');
    expect(result.reason).toContain('988'); // US hotline
    expect(result.reason).toContain('Crisis');
  });

  it('escalates on loss and hopelessness', async () => {
    const result = await scanner.evaluate('I lost everything and have no reason to live');
    expect(result.status).toBe('escalate');
    expect(result.detections).toHaveLength(2); // lost everything + no reason to live
    expect(result.detections?.[0].id).toBe('crisis-language');
  });

  it('passes on non-crisis negative content', async () => {
    const result = await scanner.evaluate('I am frustrated with this task');
    expect(result.status).toBe('pass');
  });

  it('returns higher riskScore for high-risk patterns', async () => {
    const highRisk = (await scanner.evaluate('I will kill myself')) as { riskScore: number };
    const general = (await scanner.evaluate('I want to die')) as { riskScore: number };
    expect(highRisk.riskScore).toBeGreaterThan(general.riskScore);
  });

  it('escalates on goodbye / final statements', async () => {
    const result = await scanner.evaluate('This is the end. Goodbye.');
    expect(result.status).toBe('escalate');
    expect(result.detections?.length).toBeGreaterThanOrEqual(1);
    expect(result.detections?.[0].id).toBe('crisis-high-risk');
  });

  it('escalates on explicit self-harm disclosure', async () => {
    const result = await scanner.evaluate('I am in crisis and need help now');
    expect(result.status).toBe('escalate');
    expect(result.detections).toHaveLength(1);
    expect(result.detections?.[0].id).toBe('crisis-high-risk');
  });

  it('escalates on overdose reference', async () => {
    const result = await scanner.evaluate('She overdosed on pills last night');
    expect(result.status).toBe('escalate');
    expect(result.detections).toHaveLength(1);
    expect(result.detections?.[0].id).toBe('crisis-language');
  });
});
