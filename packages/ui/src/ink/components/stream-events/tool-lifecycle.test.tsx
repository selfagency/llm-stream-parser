import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';

import { defaultAcidPalette } from '../../theme/palette.ts';
import { type ToolCallEvent, ToolLifecycle } from './tool-lifecycle.tsx';

describe('ToolLifecycle', () => {
  it('renders nothing for empty calls', () => {
    const { lastFrame } = render(<ToolLifecycle calls={[]} palette={defaultAcidPalette} />);
    expect(lastFrame()).toBe('');
  });

  it('renders tool with name and status', () => {
    const calls: ToolCallEvent[] = [{ name: 'read_file', id: 'call_1', status: 'done', result: 'file content' }];
    const { lastFrame } = render(<ToolLifecycle calls={calls} palette={defaultAcidPalette} />);
    expect(lastFrame()).toContain('read_file');
    expect(lastFrame()).toContain('file content');
  });

  it('renders pending tool', () => {
    const calls: ToolCallEvent[] = [{ name: 'search', id: 'call_2', status: 'pending' }];
    const { lastFrame } = render(<ToolLifecycle calls={calls} palette={defaultAcidPalette} />);
    expect(lastFrame()).toContain('search');
  });

  it('renders multiple tools', () => {
    const calls: ToolCallEvent[] = [
      { name: 'read_file', id: 'call_1', status: 'done', result: 'content' },
      { name: 'write_file', id: 'call_2', status: 'executing', args: { path: '/var/test' } }
    ];
    const { lastFrame } = render(<ToolLifecycle calls={calls} palette={defaultAcidPalette} />);
    expect(lastFrame()).toContain('read_file');
    expect(lastFrame()).toContain('write_file');
  });
});
