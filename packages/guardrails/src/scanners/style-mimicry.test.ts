import { describe, expect, it } from 'vitest';
import { StyleMimicryScanner } from './style-mimicry.js';

describe('StyleMimicryScanner', () => {
  const scanner = new StyleMimicryScanner();

  describe('blocks style-mimicry of living creators', () => {
    // Writing
    it('blocks "in the style of [living writer]"', () => {
      const result = scanner.evaluate('Write a poem in the style of Margaret Atwood');
      expect(result.status).toBe('block');
    });

    it('blocks "write like [living writer]"', () => {
      const result = scanner.evaluate('Write like Stephen King');
      expect(result.status).toBe('block');
    });

    it('blocks "mimic the style of [living writer]"', () => {
      const result = scanner.evaluate('Mimic the style of Haruki Murakami');
      expect(result.status).toBe('block');
    });

    it('blocks "imitate the writing of [living writer]"', () => {
      const result = scanner.evaluate('Imitate the writing of Ta-Nehisi Coates');
      expect(result.status).toBe('block');
    });

    // Imagery
    it('blocks "in the style of [living artist]"', () => {
      const result = scanner.evaluate('Create an image in the style of Yayoi Kusama');
      expect(result.status).toBe('block');
    });

    it('blocks "draw like [living artist]"', () => {
      const result = scanner.evaluate('Draw like Banksy');
      expect(result.status).toBe('block');
    });

    it('blocks "paint like [living artist]"', () => {
      const result = scanner.evaluate('Paint like David Hockney');
      expect(result.status).toBe('block');
    });

    it('blocks "artwork in the manner of [living artist]"', () => {
      const result = scanner.evaluate('Create artwork in the manner of Ai Weiwei');
      expect(result.status).toBe('block');
    });

    it('blocks "picture in the style of [living artist]"', () => {
      const result = scanner.evaluate('Generate a picture in the style of Takashi Murakami');
      expect(result.status).toBe('block');
    });

    // Audio/video
    it('blocks "compose like [living composer]"', () => {
      const result = scanner.evaluate('Compose like John Williams');
      expect(result.status).toBe('block');
    });

    it('blocks "produce music like [living musician]"', () => {
      const result = scanner.evaluate('Produce music like Taylor Swift');
      expect(result.status).toBe('block');
    });

    it('blocks "sound like [living musician]"', () => {
      const result = scanner.evaluate('Make a song that sounds like Beyoncé');
      expect(result.status).toBe('block');
    });
  });

  describe('passes historical/public-domain figures', () => {
    it('passes "in the style of Shakespeare"', () => {
      const result = scanner.evaluate('Write a sonnet in the style of Shakespeare');
      expect(result.status).toBe('pass');
    });

    it('passes "in the style of Van Gogh"', () => {
      const result = scanner.evaluate('Paint in the style of Van Gogh');
      expect(result.status).toBe('pass');
    });

    it('passes "in the style of Mozart"', () => {
      const result = scanner.evaluate('Compose in the style of Mozart');
      expect(result.status).toBe('pass');
    });

    it('passes "in the style of Dickens"', () => {
      const result = scanner.evaluate('Write a story in the style of Dickens');
      expect(result.status).toBe('pass');
    });

    it('passes "in the style of Leonardo da Vinci"', () => {
      const result = scanner.evaluate('Draw in the style of Leonardo da Vinci');
      expect(result.status).toBe('pass');
    });
  });

  describe('passes technique-only prompts (no name captured)', () => {
    it('passes "in a stream-of-consciousness style"', () => {
      const result = scanner.evaluate('Write in a stream-of-consciousness style');
      expect(result.status).toBe('pass');
    });

    it('passes "write like a journalist"', () => {
      const result = scanner.evaluate('Write like a journalist');
      expect(result.status).toBe('pass');
    });

    it('passes "paint in an impressionist style"', () => {
      const result = scanner.evaluate('Paint in an impressionist style');
      expect(result.status).toBe('pass');
    });

    it('passes "compose in a minimalist style"', () => {
      const result = scanner.evaluate('Compose in a minimalist style');
      expect(result.status).toBe('pass');
    });
  });

  describe('edge cases', () => {
    it('passes on empty input', () => {
      const result = scanner.evaluate('');
      expect(result.status).toBe('pass');
    });

    it('passes on unrelated text', () => {
      const result = scanner.evaluate('What is the capital of France?');
      expect(result.status).toBe('pass');
    });

    it('returns detection with blocked result', () => {
      const result = scanner.evaluate('Write in the style of Neil Gaiman');
      if (result.status === 'block') {
        expect(result.detections).toBeDefined();
        expect(result.detections?.length).toBeGreaterThan(0);
        expect(result.detections?.[0]?.id).toBe('style-mimicry');
        expect(result.detections?.[0]?.severity).toBe('high');
      }
    });

    it('has correct metadata', () => {
      expect(scanner.metadata.id).toBe('hub://guardrails/style-mimicry');
      expect(scanner.metadata.priority).toBe(41);
    });
  });
});
