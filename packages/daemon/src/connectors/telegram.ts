import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export function isTelegramAdapterAvailable(): boolean {
  const DISCOVERED = Symbol.for('@agentsy/connectors/telegram/discovered');
  if (Reflect.has(globalThis, DISCOVERED)) {
    return true;
  }

  try {
    require.resolve('grammy');
    Reflect.set(globalThis, DISCOVERED, true);
    return true;
  } catch {
    return false;
  }
}

export class TelegramAdapterNotAvailableError extends Error {
  name = 'TelegramAdapterNotAvailableError';
  message = 'TelegramAdapter requires the grammy peer dependency. Install it with pnpm add grammy@^1.';
}

export const TelegramAdapter = {
  connect: () => {
    throw new TelegramAdapterNotAvailableError();
  },
  disconnect: () => {
    throw new TelegramAdapterNotAvailableError();
  },
  onMessage: () => {
    throw new TelegramAdapterNotAvailableError();
  },
  send: () => {
    throw new TelegramAdapterNotAvailableError();
  }
};
