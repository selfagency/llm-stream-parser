import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    manifest: 'src/manifest.ts',
    validate: 'src/validate.ts',
    bridge: 'src/bridge.ts'
  },
  external: ['zod'],
  format: ['esm'],
  target: 'node18',
  treeshake: true,
  clean: true,
  sourcemap: true,
  dts: true
});
