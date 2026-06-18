import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  dts: true,
  entry: {
    index: 'src/index.ts',
    'sanitize/index': 'src/sanitize/index.ts'
  },
  external: ['@agentsy/shared'],
  format: ['esm'],
  treeshake: true
});
