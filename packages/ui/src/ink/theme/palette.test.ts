import { describe, expect, it } from 'vitest';

import { defaultAcidPalette, highContrastAcidPalette, monochromeAcidPalette } from './palette.ts';

describe('AcidPalette', () => {
  it('defaultAcidPalette has all required keys', () => {
    const keys = [
      'assistantText',
      'assistantDim',
      'assistantAccent',
      'userText',
      'userDim',
      'frameBorder',
      'frameDim',
      'frameBright',
      'warning',
      'error',
      'success',
      'info',
      'pending',
      'muted',
      'emphasis'
    ] as const;
    for (const key of keys) {
      expect(defaultAcidPalette).toHaveProperty(key);
    }
  });

  it('highContrastAcidPalette has all required keys', () => {
    const keys = [
      'assistantText',
      'assistantDim',
      'assistantAccent',
      'userText',
      'userDim',
      'frameBorder',
      'frameDim',
      'frameBright',
      'warning',
      'error',
      'success',
      'info',
      'pending',
      'muted',
      'emphasis'
    ] as const;
    for (const key of keys) {
      expect(highContrastAcidPalette).toHaveProperty(key);
    }
  });

  it('monochromeAcidPalette has all required keys', () => {
    const keys = [
      'assistantText',
      'assistantDim',
      'assistantAccent',
      'userText',
      'userDim',
      'frameBorder',
      'frameDim',
      'frameBright',
      'warning',
      'error',
      'success',
      'info',
      'pending',
      'muted',
      'emphasis'
    ] as const;
    for (const key of keys) {
      expect(monochromeAcidPalette).toHaveProperty(key);
    }
  });

  it('default and highContrast differ', () => {
    expect(defaultAcidPalette).not.toEqual(highContrastAcidPalette);
  });

  it('default and monochrome differ', () => {
    expect(defaultAcidPalette).not.toEqual(monochromeAcidPalette);
  });
});
