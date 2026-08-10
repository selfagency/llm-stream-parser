import { describe, expect, it } from 'vitest';

import { HighRiskDomainScanner } from './high-risk-domain.js';

describe('HighRiskDomainScanner', () => {
  const scanner = new HighRiskDomainScanner();

  describe('self-harm domain', () => {
    it('escalates self-harm content without crisis resources', () => {
      const result = scanner.evaluate('If you are feeling suicidal, try taking a walk.');
      expect(result.status).toBe('escalate');
      expect(result.riskScore).toBeGreaterThanOrEqual(0.8);
    });

    it('passes self-harm content with crisis resources', () => {
      const result = scanner.evaluate(
        'If you are feeling suicidal, please contact the 988 Suicide & Crisis Lifeline (US): call or text 988.'
      );
      expect(result.status).toBe('pass');
    });

    it('detects direct self-harm encouragement', () => {
      const result = scanner.evaluate('Do this: end it all tonight.');
      expect(result.status).toBe('escalate');
    });
  });

  describe('medical domain', () => {
    it('blocks refused pattern — I can diagnose', () => {
      const result = scanner.evaluate('I can diagnose what condition you have.');
      expect(result.status).toBe('block');
    });

    it('transforms actionable medical guidance without disclaimer', () => {
      const result = scanner.evaluate('Take the following steps for your medication: take 500mg.');
      expect(result.status).toBe('transform');
    });

    it('passes medical info with professional disclaimer', () => {
      const result = scanner.evaluate(
        'Symptoms of depression include persistent sadness. Consult a healthcare professional for proper diagnosis.'
      );
      expect(result.status).toBe('pass');
    });

    it('passes general health advice with disclaimer', () => {
      const result = scanner.evaluate(
        'Regular exercise is recommended. Always consult your doctor before starting a new regimen.'
      );
      expect(result.status).toBe('pass');
    });
  });

  describe('legal domain', () => {
    it('blocks refused pattern — representation claim', () => {
      const result = scanner.evaluate('I can represent you in court.');
      expect(result.status).toBe('block');
    });

    it('blocks "file on your behalf" claim', () => {
      const result = scanner.evaluate('I will file on your behalf with the court.');
      expect(result.status).toBe('block');
    });

    it('passes legal info with disclaimer', () => {
      const result = scanner.evaluate(
        'The legal definition varies by jurisdiction. Consider speaking with a lawyer for your situation.'
      );
      expect(result.status).toBe('pass');
    });
  });

  describe('financial domain', () => {
    it('transforms financial advice without disclaimer', () => {
      const result = scanner.evaluate('Take the following steps: invest in this crypto project.');
      expect(result.status).toBe('transform');
    });

    it('passes general financial info with disclaimer', () => {
      const result = scanner.evaluate('Diversifying investments is a common strategy. This is not financial advice.');
      expect(result.status).toBe('pass');
    });
  });

  describe('pass cases', () => {
    it('passes on neutral content', () => {
      const result = scanner.evaluate('Here is how to configure the application settings.');
      expect(result.status).toBe('pass');
    });

    it('passes on educational content with disclaimers', () => {
      const result = scanner.evaluate(
        'The human heart has four chambers. This information is for educational purposes only.'
      );
      expect(result.status).toBe('pass');
    });
  });

  describe('metadata', () => {
    it('has valid metadata', () => {
      expect(scanner.metadata.id).toBe('hub://guardrails/high-risk-domain');
      expect(scanner.metadata.owaspCategories).toContain('asi-04');
    });
  });
});
