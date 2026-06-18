import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';

import { defaultAcidPalette } from '../../theme/palette.ts';
import { TokenMeter } from './token-meter.tsx';

describe('TokenMeter', () => {
  it('displays input and output token counts', () => {
    const { lastFrame } = render(<TokenMeter input={100} output={50} palette={defaultAcidPalette} />);
    const frame = lastFrame();
    expect(frame).toContain('100');
    expect(frame).toContain('50');
  });

  it('displays total when provided', () => {
    const { lastFrame } = render(<TokenMeter input={100} output={50} palette={defaultAcidPalette} total={150} />);
    const frame = lastFrame();
    expect(frame).toContain('100');
    expect(frame).toContain('50');
    expect(frame).toContain('150');
  });

  it('renders custom label', () => {
    const { lastFrame } = render(<TokenMeter input={5} label="tokens:" output={10} palette={defaultAcidPalette} />);
    expect(lastFrame()).toContain('tokens:');
  });
});
