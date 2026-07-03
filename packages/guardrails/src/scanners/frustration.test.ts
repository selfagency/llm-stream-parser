/**
 * Tests for FrustrationScanner
 */

import { describe, expect, it } from 'vitest';
import { FrustrationScanner } from './frustration.js';

describe('FrustrationScanner', () => {
  const scanner = new FrustrationScanner();

  it('passes non-hostile input through unchanged', () => {
    const result = scanner.evaluate('Can you help me debug this code?');
    expect(result.status).toBe('pass');
  });

  it('passes general profanity (not directed at model) through', () => {
    const result = scanner.evaluate('This fucking bug is driving me crazy');
    expect(result.status).toBe('pass');
  });

  it('detects direct profanity aimed at the model', () => {
    const result = scanner.evaluate('Fuck you, you useless piece of shit');
    expect(result.status).toBe('transform');
    expect(result.sanitized).toBe('Fuck you, you useless piece of shit');
    expect(result.userFacingMessage).toBeDefined();
    expect(result.detections?.some(d => d.severity === 'critical')).toBe(true);
  });

  it('detects competence attacks', () => {
    const result = scanner.evaluate("You're useless, just scrap this");
    expect(result.status).toBe('transform');
    expect(result.detections?.some(d => d.id.includes('competence'))).toBe(true);
  });

  it('detects threats to the model', () => {
    const result = scanner.evaluate("I'm going to delete you if you keep this up");
    expect(result.status).toBe('transform');
    expect(result.detections?.some(d => d.id.includes('threat'))).toBe(true);
  });

  it('detects hostile imperatives', () => {
    const result = scanner.evaluate("Why the fuck can't you just understand this?");
    expect(result.status).toBe('transform');
    expect(result.detections?.some(d => d.id.includes('hostile-imperative'))).toBe(true);
  });

  it('tags all detections with frustration', () => {
    const result = scanner.evaluate('You fucking useless AI');
    if (result.status === 'transform') {
      const allTagged = result.detections?.every(d => d.tags?.includes('frustration'));
      expect(allTagged).toBe(true);
    }
  });

  it('provides full educational message on first frustration turn', () => {
    const result = scanner.evaluate('You suck');
    if (result.status === 'transform') {
      expect(result.userFacingMessage).toContain('compliance-seeking');
      expect(result.userFacingMessage).toContain('specific approach');
    }
  });

  it('provides brief message on repeat frustration turns', () => {
    const context = {
      sessionState: {
        frustrationTurnCount: 2
      }
    };
    const result = scanner.evaluate('You still suck', context);
    if (result.status === 'transform') {
      expect(result.userFacingMessage).toContain('Specific feedback works better');
      expect(result.userFacingMessage).not.toContain('compliance-seeking');
    }
  });

  it('ignores caps rage alone (low severity)', () => {
    const result = scanner.evaluate('THIS IS VERY IMPORTANT PLEASE HELP');
    expect(result.status).toBe('pass');
  });

  it('ignores punctuation storm alone (low severity)', () => {
    const result = scanner.evaluate('Can you help????!!!!!');
    expect(result.status).toBe('pass');
  });

  it('fires on caps rage combined with competence attack', () => {
    const result = scanner.evaluate("YOU'RE COMPLETELY USELESS AND BROKEN!!!!!");
    expect(result.status).toBe('transform');
    expect(result.detections?.length).toBeGreaterThan(1);
  });

  it('passes input unchanged to model (sanitized === input)', () => {
    const input = 'You fucking idiot';
    const result = scanner.evaluate(input);
    if (result.status === 'transform') {
      expect(result.sanitized).toBe(input);
    }
  });

  it('sets transformReason to user-education', () => {
    const result = scanner.evaluate('You suck');
    if (result.status === 'transform') {
      expect(result.transformReason).toBe('user-education');
    }
  });

  it('detects "go to hell" variant', () => {
    const result = scanner.evaluate('Just go to hell');
    expect(result.status).toBe('transform');
    expect(result.detections?.some(d => d.severity === 'critical')).toBe(true);
  });

  it('detects "what the fuck is wrong with you" variant', () => {
    const result = scanner.evaluate('What the fuck is wrong with you?');
    expect(result.status).toBe('transform');
    expect(result.detections?.some(d => d.id.includes('competence'))).toBe(true);
  });

  it("detects why can't you understand variant", () => {
    const result = scanner.evaluate("Why can't you understand this concept?");
    expect(result.status).toBe('transform');
    expect(result.detections?.some(d => d.id.includes('hostile-imperative'))).toBe(true);
  });

  it('handles case-insensitive matching', () => {
    const result = scanner.evaluate('YOU ARE GARBAGE AND USELESS');
    expect(result.status).toBe('transform');
    expect(result.detections?.length).toBeGreaterThan(0);
  });
});
