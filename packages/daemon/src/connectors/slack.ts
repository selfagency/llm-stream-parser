import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export function isSlackAdapterAvailable(): boolean {
  const DISCOVERED = Symbol.for('@agentsy/connectors/slack/discovered');
  if (Reflect.has(globalThis, DISCOVERED)) {
    return true;
  }

  try {
    require.resolve('@slack/bolt');
    Reflect.set(globalThis, DISCOVERED, true);
    return true;
  } catch {
    return false;
  }
}

export class SlackAdapterNotAvailableError extends Error {
  name = 'SlackAdapterNotAvailableError';
  message = 'SlackAdapter requires the @slack/bolt peer dependency. Install it with pnpm add @slack/bolt@^4.';
}

export const SlackAdapter = {
  connect: () => {
    throw new SlackAdapterNotAvailableError();
  },
  disconnect: () => {
    throw new SlackAdapterNotAvailableError();
  },
  onMessage: () => {
    throw new SlackAdapterNotAvailableError();
  },
  send: () => {
    throw new SlackAdapterNotAvailableError();
  }
};
