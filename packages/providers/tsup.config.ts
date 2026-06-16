import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  dts: true,
  entry: {
    adapters: 'src/adapters/index.ts',
    caching: 'src/caching/index.ts',
    index: 'src/index.ts',
    normalizers: 'src/normalizers/index.ts',
    pipeline: 'src/pipeline/index.ts',
    profiles: 'src/profiles/index.ts',
    'request-path': 'src/request-path.ts',
    'universal-client': 'src/universal-client/index.ts'
  },
  external: [
    '@agentsy/core',
    '@agentsy/core/processor',
    '@agentsy/core/structured',
    '@agentsy/core/tool-calls',
    '@agentsy/shared',
    'zod'
  ],
  format: ['esm', 'cjs'],
  minify: false,
  sourcemap: true,
  splitting: false,
  target: 'node18',
  treeshake: true
});
