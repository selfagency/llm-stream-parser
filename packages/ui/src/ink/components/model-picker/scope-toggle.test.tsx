import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';

import { defaultAcidPalette } from '../../theme/palette.ts';
import type { ScopeValue } from './scope-toggle.tsx';
import { parseScope, ScopeToggle } from './scope-toggle.tsx';

describe('ScopeToggle', () => {
  it('shows cloud as active', () => {
    const { lastFrame } = render(<ScopeToggle currentScope="cloud" palette={defaultAcidPalette} />);
    const frame = lastFrame();
    expect(frame).toContain('cloud');
    expect(frame).toContain('local');
    expect(frame).toContain('●');
    expect(frame).toContain('○');
  });

  it('shows local as active', () => {
    const { lastFrame } = render(<ScopeToggle currentScope="local" palette={defaultAcidPalette} />);
    const frame = lastFrame();
    expect(frame).toContain('local');
    expect(frame).toContain('cloud');
  });
});

describe('parseScope', () => {
  it('parses valid values', () => {
    expect(parseScope('local')).toBe<ScopeValue>('local');
    expect(parseScope('cloud')).toBe<ScopeValue>('cloud');
  });

  it('falls back for invalid values', () => {
    expect(parseScope('invalid')).toBe('cloud');
    expect(parseScope(undefined)).toBe('cloud');
    expect(parseScope('invalid', 'local')).toBe('local');
  });
});
