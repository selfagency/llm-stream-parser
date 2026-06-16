import { expect, vi } from 'vitest';

import type { createSharedRendererHandle } from './shared.js';

export interface StepAssertionRendererOptions {
  onStep?: (stepIndex: number, usage: unknown) => void | Promise<void>;
}

export const testOnStepCall = async (
  createRenderer: (options: StepAssertionRendererOptions) => ReturnType<typeof createSharedRendererHandle>
): Promise<void> => {
  const onStep = vi.fn<(stepIndex: number, usage: unknown) => void>();
  const renderer = createRenderer({ onStep });

  await renderer.writeChunk({
    content: 'step 0',
    stepIndex: 0,
    stepUsage: { outputTokens: 2 }
  });
  await renderer.writeChunk({
    content: 'step 1',
    stepIndex: 1,
    usage: { inputTokens: 1, outputTokens: 3 }
  });
  await renderer.end();

  // biome-ignore lint/suspicious/noMisplacedAssertion: Test helper used inside it() blocks
  expect(onStep).toHaveBeenCalledTimes(2);
  // biome-ignore lint/suspicious/noMisplacedAssertion: Test helper used inside it() blocks
  expect(onStep).toHaveBeenNthCalledWith(1, 0, { outputTokens: 2 });
  // biome-ignore lint/suspicious/noMisplacedAssertion: Test helper used inside it() blocks
  expect(onStep).toHaveBeenNthCalledWith(2, 1, {
    inputTokens: 1,
    outputTokens: 3
  });
};
