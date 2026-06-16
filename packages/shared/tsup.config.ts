import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  dts: true,
  entry: {
    index: 'src/index.ts',
    'cortexkit/index': 'src/cortexkit/index.ts',
    'types/index': 'src/types/index.ts'
  },
  external: ['better-sqlite3', '@cortexkit/aft-bridge'],
  format: ['esm', 'cjs'],
  sourcemap: true,
  target: 'es2022'
});
