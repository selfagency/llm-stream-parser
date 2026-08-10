import { Text } from 'ink';
import { useEffect, useState } from 'react';

import { animationInterval, showAnimatedCursor } from '../../theme/motion.ts';

export interface StreamingCursorProps {
  /** Semantic palette colour string for the cursor. */
  readonly color: string;
  /** Whether streaming is active. */
  readonly isStreaming: boolean;
  /** Cursor symbol (default: block). */
  readonly symbol?: string;
}

const cursorFrames = ['▌', '▐', '█', '▐'];

/**
 * Animated cursor shown during streaming response.
 *
 * Respects reduced-motion preferences: static symbol when animation
 * is disabled, animated frames otherwise.
 */
export function StreamingCursor({ color, isStreaming, symbol }: StreamingCursorProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!(isStreaming && showAnimatedCursor())) {
      setFrame(0);
      return;
    }

    const interval = setInterval(() => setFrame(f => (f + 1) % cursorFrames.length), animationInterval(200, 1000));

    return () => {
      clearInterval(interval);
    };
  }, [isStreaming]);

  if (!isStreaming) {
    return null;
  }

  const display = symbol ?? cursorFrames.at(frame) ?? '▌';
  return <Text color={color}>{display}</Text>;
}
