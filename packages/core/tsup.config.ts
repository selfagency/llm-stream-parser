import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  dts: true,
  entry: {
    context: 'src/context/index.ts',
    formatting: 'src/formatting/index.ts',
    index: 'src/index.ts',
    processor: 'src/processor/index.ts',
    recovery: 'src/recovery/index.ts',
    retry: 'src/retry/index.ts',
    'slash-commands': 'src/slash-commands/index.ts',
    sse: 'src/sse/index.ts',
    'stream-to-events': 'src/stream-to-events.ts',
    structured: 'src/structured/index.ts',
    thinking: 'src/thinking/index.ts',
    'tool-calls': 'src/tool-calls/index.ts',
    'xml-filter': 'src/xml-filter/index.ts'
  },
  external: ['@agentsy/shared', 'zod'],
  format: ['esm', 'cjs'],
  minify: false,
  sourcemap: true,
  splitting: false,
  target: 'node18',
  treeshake: true
});
