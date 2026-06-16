import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  dts: true,
  entry: ['src/index.ts'],
  external: ['@agentsy/shared'],
  format: ['esm'],
  sourcemap: true
});
