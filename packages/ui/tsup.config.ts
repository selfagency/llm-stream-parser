import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  dts: true,
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli/index.ts',
    ink: 'src/ink/index.ts',
    plain: 'src/plain/index.ts',
    'streaming-md': 'src/streaming-md/index.ts',
    adapters: 'src/adapters/index.ts',
    'ui/index': 'src/ui/index.ts',
    'ink/themes': 'src/ink/themes/index.ts'
  },
  format: ['esm', 'cjs'],
  sourcemap: true,
  splitting: false,
  target: 'es2022'
});
