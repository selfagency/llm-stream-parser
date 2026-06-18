import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  dts: true,
  entry: {
    index: 'src/index.ts'
  },
  external: ['@agentsy/shared'],
  format: ['esm'],
  treeshake: true
});
