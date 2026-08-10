import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';

import { defaultAcidPalette } from '../../theme/palette.ts';
import { MessageBubble } from './message-bubble.tsx';

describe('MessageBubble', () => {
  it('renders user message right-aligned', () => {
    const { lastFrame } = render(
      // biome-ignore lint/a11y/useValidAriaRole: component prop, not HTML attribute
      <MessageBubble palette={defaultAcidPalette} role="user" text="hello" />
    );
    expect(lastFrame()).toContain('hello');
    expect(lastFrame()).toContain('you');
  });

  it('renders assistant message left-aligned', () => {
    const { lastFrame } = render(
      // biome-ignore lint/a11y/useValidAriaRole: component prop, not HTML attribute
      <MessageBubble palette={defaultAcidPalette} role="assistant" text="response" />
    );
    expect(lastFrame()).toContain('response');
    expect(lastFrame()).toContain('assistant');
  });

  it('renders system message with warning style', () => {
    const { lastFrame } = render(
      // biome-ignore lint/a11y/useValidAriaRole: component prop, not HTML attribute
      <MessageBubble palette={defaultAcidPalette} role="system" text="system message" />
    );
    expect(lastFrame()).toContain('system message');
    expect(lastFrame()).toContain('system');
  });

  it('renders timestamp when provided', () => {
    const { lastFrame } = render(
      // biome-ignore lint/a11y/useValidAriaRole: component prop, not HTML attribute
      <MessageBubble palette={defaultAcidPalette} role="user" text="hi" timestamp="12:34:56" />
    );
    expect(lastFrame()).toContain('12:34:56');
  });

  it('renders dim text when dim prop is true', () => {
    const { lastFrame } = render(
      // biome-ignore lint/a11y/useValidAriaRole: component prop, not HTML attribute
      <MessageBubble dim palette={defaultAcidPalette} role="user" text="dim text" />
    );
    expect(lastFrame()).toContain('dim text');
  });
});
