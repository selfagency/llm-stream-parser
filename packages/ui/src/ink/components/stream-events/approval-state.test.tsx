import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';

import { defaultAcidPalette } from '../../theme/palette.ts';
import { ApprovalState } from './approval-state.tsx';

describe('ApprovalState', () => {
  it('renders pending state', () => {
    const { lastFrame } = render(
      <ApprovalState action="execute tool: read_file" palette={defaultAcidPalette} status="pending" />
    );
    expect(lastFrame()).toContain('read_file');
  });

  it('renders approved state', () => {
    const { lastFrame } = render(<ApprovalState action="write file" palette={defaultAcidPalette} status="approved" />);
    const frame = lastFrame();
    expect(frame).toContain('write file');
  });

  it('renders rejected state', () => {
    const { lastFrame } = render(<ApprovalState action="delete file" palette={defaultAcidPalette} status="rejected" />);
    const frame = lastFrame();
    expect(frame).toContain('delete file');
  });
});
