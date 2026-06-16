import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export function isDiscordAdapterAvailable(): boolean {
  const DISCOVERED = Symbol.for('@agentsy/connectors/discord/discovered');
  if (Reflect.has(globalThis, DISCOVERED)) {
    return true;
  }

  try {
    require.resolve('discord.js');
    Reflect.set(globalThis, DISCOVERED, true);
    return true;
  } catch {
    return false;
  }
}

export class DiscordAdapterNotAvailableError extends Error {
  name = 'DiscordAdapterNotAvailableError';
  message = 'DiscordAdapter requires the discord.js peer dependency. Install it with pnpm add discord.js@^14.';
}

export const DiscordAdapter = {
  connect: () => {
    throw new DiscordAdapterNotAvailableError();
  },
  disconnect: () => {
    throw new DiscordAdapterNotAvailableError();
  },
  onMessage: () => {
    throw new DiscordAdapterNotAvailableError();
  },
  send: () => {
    throw new DiscordAdapterNotAvailableError();
  }
};
