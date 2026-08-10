import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import { defaultAcidPalette } from '../../theme/palette.js';
import { Dropdown } from './dropdown.js';

describe('Dropdown', () => {
  it('renders closed state with selected label', () => {
    const { lastFrame } = render(
      <Dropdown
        isFocused
        onChange={vi.fn()}
        open={false}
        options={[
          { label: 'Thinking: low', value: 'low' },
          { label: 'Thinking: high', value: 'high' }
        ]}
        palette={defaultAcidPalette}
        title="THINKING"
        value="high"
      />
    );

    expect(lastFrame()).toContain('THINKING');
    expect(lastFrame()).toContain('Thinking: high');
  });

  it('renders open menu and filters by typed query', () => {
    const { lastFrame, stdin } = render(
      <Dropdown
        isFocused
        onChange={vi.fn()}
        open
        options={[
          { label: 'Agent A', value: 'agent-a' },
          { label: 'Agent B', value: 'agent-b' }
        ]}
        palette={defaultAcidPalette}
        title="AGENTS"
      />
    );

    expect(lastFrame()).toContain('Agent A');
    expect(lastFrame()).toContain('Agent B');

    stdin.write('b');
    expect(lastFrame()).toContain('Agent B');
    expect(lastFrame()).not.toContain('Agent A');
  });

  it('submits highlighted option on Enter', () => {
    const onChange = vi.fn();
    const { stdin } = render(
      <Dropdown
        isFocused
        onChange={onChange}
        open
        options={[
          { label: 'Low', value: 'low' },
          { label: 'High', value: 'high' }
        ]}
        palette={defaultAcidPalette}
        title="THINKING"
      />
    );

    stdin.write('\u001b[B');
    stdin.write('\r');

    expect(onChange).toHaveBeenCalledWith('high');
  });
});
