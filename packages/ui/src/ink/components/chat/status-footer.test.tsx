import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';

import { defaultAcidPalette } from '../../theme/palette.ts';
import { StatusFooter } from './status-footer.tsx';

describe('StatusFooter', () => {
  it('displays status text', () => {
    const { lastFrame } = render(<StatusFooter palette={defaultAcidPalette} status="idle" />);
    expect(lastFrame()).toContain('idle');
  });

  it('displays model name when provided', () => {
    const { lastFrame } = render(
      <StatusFooter modelName="claude-sonnet-4" palette={defaultAcidPalette} status="connected" />
    );
    expect(lastFrame()).toContain('claude-sonnet-4');
  });

  it('displays elapsed time', () => {
    const { lastFrame } = render(<StatusFooter elapsedSec={42} palette={defaultAcidPalette} status="streaming" />);
    expect(lastFrame()).toContain('42s');
  });

  it('displays provider info', () => {
    const { lastFrame } = render(
      <StatusFooter palette={defaultAcidPalette} provider="anthropic" status="connecting" />
    );
    expect(lastFrame()).toContain('anthropic');
  });
});
