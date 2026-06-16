import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';

import { defaultAcidPalette } from '../../theme/palette.ts';
import { type AgentEntry, AgentPicker } from './index.tsx';

describe('AgentPicker', () => {
  const agents: AgentEntry[] = [
    {
      id: 'superagents/research',
      name: 'Research',
      description: 'Deep research mode',
      provenance: 'bundled',
      active: true
    },
    {
      id: 'user/custom',
      name: 'Custom',
      description: 'My custom agent',
      provenance: 'user',
      active: false,
      model: 'claude-opus-4',
      toolCount: 3
    }
  ];

  it('renders agent list', () => {
    const { lastFrame } = render(
      <AgentPicker agents={agents} highlightIndex={0} palette={defaultAcidPalette} query="" />
    );
    const frame = lastFrame();
    expect(frame).toContain('Research');
    expect(frame).toContain('Custom');
  });

  it('shows provenance badges', () => {
    const { lastFrame } = render(
      <AgentPicker agents={agents} highlightIndex={0} palette={defaultAcidPalette} query="" />
    );
    expect(lastFrame()).toContain('built-in');
  });

  it('filters agents by query', () => {
    const { lastFrame } = render(
      <AgentPicker agents={agents} highlightIndex={0} palette={defaultAcidPalette} query="Custom" />
    );
    const frame = lastFrame();
    expect(frame).toContain('Custom');
    expect(frame).not.toContain('Research');
  });

  it('shows empty state when filter matches nothing', () => {
    const { lastFrame } = render(
      <AgentPicker agents={agents} highlightIndex={0} palette={defaultAcidPalette} query="no-match-xyz" />
    );
    expect(lastFrame()).toContain('no-match-xyz');
  });
});
