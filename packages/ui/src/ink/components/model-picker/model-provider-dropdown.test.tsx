import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import { defaultAcidPalette } from '../../theme/palette.js';
import { ModelProviderDropdown } from './model-provider-dropdown.js';

describe('ModelProviderDropdown', () => {
  it('renders model options through the dropdown primitive', () => {
    const { lastFrame } = render(
      <ModelProviderDropdown
        focused
        modelId="m2"
        models={[
          { capabilities: ['tool-use'], id: 'm1', name: 'Model One', provider: 'openai', supportsStreaming: true },
          { capabilities: ['reasoning'], id: 'm2', name: 'Model Two', provider: 'anthropic', supportsStreaming: false }
        ]}
        onModelChange={vi.fn()}
        palette={defaultAcidPalette}
        providerId="anthropic"
      />
    );

    expect(lastFrame()).toContain('MODEL');
    expect(lastFrame()).toContain('Model Two');
  });
});
