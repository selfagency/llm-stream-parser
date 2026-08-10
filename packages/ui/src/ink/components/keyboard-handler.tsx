import type { Key } from 'ink';
import { useInput } from 'ink';

export interface KeyboardOptions {
  enabled?: boolean;
  onCancel?: () => void;
  onInterrupt?: () => void;
  onKeypress?: (input: string, key: Key) => void;
}

interface KeyboardHandlerProps {
  readonly keyboard: KeyboardOptions;
}

export function KeyboardHandler({ keyboard }: KeyboardHandlerProps) {
  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      keyboard.onInterrupt?.();
    } else if (key.escape) {
      keyboard.onCancel?.();
    } else {
      keyboard.onKeypress?.(input, key);
    }
  });

  return null;
}
