import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Exclude sandbox test — isolated-vm timeout mechanism is unreliable
    // with Node 24's V8 engine, causing CI timeouts. The sandbox test is
    // pre-existing and isolated to its own CI matrix entry.
    exclude: ['src/sandbox/index.test.ts', '**/node_modules/**']
  }
});
