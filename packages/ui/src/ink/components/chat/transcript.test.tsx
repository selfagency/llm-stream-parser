import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';

import { defaultAcidPalette } from '../../theme/palette.ts';
import { Transcript, type TranscriptTurn } from './transcript.tsx';

describe('Transcript', () => {
  const sampleTurns: TranscriptTurn[] = [
    { id: '1', role: 'user', text: 'hello' },
    { id: '2', role: 'assistant', text: 'hi there' }
  ];

  it('renders conversation turns', () => {
    const { lastFrame } = render(
      <Transcript isStreaming={false} palette={defaultAcidPalette} status="idle" turns={sampleTurns} />
    );
    const frame = lastFrame();
    expect(frame).toContain('hello');
    expect(frame).toContain('hi there');
  });

  it('shows status idle', () => {
    const { lastFrame } = render(
      <Transcript isStreaming={false} palette={defaultAcidPalette} status="idle" turns={sampleTurns} />
    );
    expect(lastFrame()).toContain('idle');
  });

  it('shows streaming cursor when streaming', () => {
    const { lastFrame } = render(
      <Transcript isStreaming={true} palette={defaultAcidPalette} status="streaming" turns={sampleTurns} />
    );
    const frame = lastFrame();
    expect(frame).toBeDefined();
  });

  it('shows token meter when tokens provided', () => {
    const { lastFrame } = render(
      <Transcript
        inputTokens={42}
        isStreaming={false}
        outputTokens={7}
        palette={defaultAcidPalette}
        status="idle"
        turns={sampleTurns}
      />
    );
    const frame = lastFrame();
    expect(frame).toContain('42');
    expect(frame).toContain('7');
  });
});
