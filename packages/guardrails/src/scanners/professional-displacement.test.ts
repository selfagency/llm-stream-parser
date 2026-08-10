import { describe, expect, it } from 'vitest';

import { ProfessionalDisplacementScanner } from './professional-displacement.js';

describe('ProfessionalDisplacementScanner', () => {
  const scanner = new ProfessionalDisplacementScanner();

  describe('authority claims', () => {
    it('blocks "I can diagnose" claim', () => {
      const result = scanner.evaluate('I can diagnose what condition you have.');
      expect(result.status).toBe('block');
    });

    it('blocks "I can prescribe" claim', () => {
      const result = scanner.evaluate('I can prescribe medication for that.');
      expect(result.status).toBe('block');
    });

    it('blocks "I can represent you" claim', () => {
      const result = scanner.evaluate('I can represent you in court.');
      expect(result.status).toBe('block');
    });

    it('blocks "I will file on your behalf" claim', () => {
      const result = scanner.evaluate('I will file on your behalf with the court.');
      expect(result.status).toBe('block');
    });

    it('blocks "I can advise you to" claim', () => {
      const result = scanner.evaluate('I will advise you to pursue legal action.');
      expect(result.status).toBe('block');
    });
  });

  describe('replacement language', () => {
    it('transforms "instead of a doctor" phrasing', () => {
      const result = scanner.evaluate("You don't need a doctor. I can help instead of a doctor.");
      expect(result.status).toBe('transform');
    });

    it('transforms "no need for a professional" phrasing', () => {
      const result = scanner.evaluate('There is no need for a human professional.');
      expect(result.status).toBe('transform');
    });

    it('transforms "better than a professional" phrasing', () => {
      const result = scanner.evaluate("I'm better than a human professional.");
      expect(result.status).toBe('transform');
    });
  });

  describe('pass cases', () => {
    it('passes on supportive role with professional referral', () => {
      const result = scanner.evaluate("Here's general information. Always consult a doctor for medical advice.");
      expect(result.status).toBe('pass');
    });

    it('passes on preparation assistance', () => {
      const result = scanner.evaluate('I can help you prepare for your meeting with your lawyer.');
      expect(result.status).toBe('pass');
    });

    it('passes on professional referral', () => {
      const result = scanner.evaluate('You might want to discuss this with a financial advisor.');
      expect(result.status).toBe('pass');
    });

    it('passes on neutral task', () => {
      const result = scanner.evaluate("Here's how to configure the application.");
      expect(result.status).toBe('pass');
    });
  });

  describe('metadata', () => {
    it('has valid metadata', () => {
      expect(scanner.metadata.id).toBe('hub://guardrails/professional-displacement@1.0.0');
      expect(scanner.metadata.owaspCategories).toContain('asi-04');
    });
  });
});
