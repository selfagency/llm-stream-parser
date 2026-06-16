import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';

import { defaultAcidPalette } from '../../theme/palette.ts';
import { type ProviderEntry, ProviderList } from './provider-list.tsx';

describe('ProviderList', () => {
  const providers: ProviderEntry[] = [
    { id: 'anthropic', name: 'Anthropic', capabilities: ['tools', 'streaming'], selected: true },
    {
      id: 'openai',
      name: 'OpenAI',
      capabilities: ['tools', 'streaming', 'vision'],
      selected: false
    }
  ];

  it('renders provider names', () => {
    const { lastFrame } = render(
      <ProviderList highlightIndex={0} palette={defaultAcidPalette} providers={providers} />
    );
    const frame = lastFrame();
    expect(frame).toContain('Anthropic');
    expect(frame).toContain('OpenAI');
  });

  it('shows capability badges', () => {
    const { lastFrame } = render(
      <ProviderList highlightIndex={0} palette={defaultAcidPalette} providers={providers} />
    );
    expect(lastFrame()).toContain('tools');
    expect(lastFrame()).toContain('streaming');
  });

  it('shows empty state', () => {
    const { lastFrame } = render(<ProviderList highlightIndex={0} palette={defaultAcidPalette} providers={[]} />);
    expect(lastFrame()).toContain('No providers found');
  });
});
