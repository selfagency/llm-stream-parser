import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import { CapabilityRefineFlow, ModelSearchFlow, ProviderDiscoveryFlow } from './model-selection-flows.js';

vi.mock('@agentsy/models', () => ({
  discoverLocalProviders: vi.fn().mockResolvedValue({
    discovered: [{ provider: 'ollama', models: [{ id: 'llama3', name: 'Llama 3' }] }],
    ollama: { available: true, models: [{ id: 'llama3', name: 'Llama 3' }] },
    vllm: { available: false, models: [] }
  }),
  searchModels: vi.fn().mockReturnValue([{ modelId: 'claude-sonnet', reason: 'keyword match', score: 0.8 }])
}));

describe('model selection flows', () => {
  it('renders model search results from query input', () => {
    const { lastFrame, stdin } = render(<ModelSearchFlow />);

    stdin.write('c');
    stdin.write('l');
    stdin.write('a');
    stdin.write('u');
    stdin.write('d');
    stdin.write('e');

    expect(lastFrame()).toContain('claude');
  });

  it('renders provider discovery state', async () => {
    const { lastFrame, unmount } = render(<ProviderDiscoveryFlow />);

    await Promise.resolve();
    await Promise.resolve();

    expect(lastFrame()).toContain('ollama');
    unmount();
  });

  it('renders capability refine flow', () => {
    const { lastFrame } = render(<CapabilityRefineFlow />);
    expect(lastFrame()).toContain('scope');
  });
});
