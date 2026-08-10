import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  dts: true,
  entry: {
    index: 'src/index.ts'
  },
  external: [
    '@agentsy/core',
    '@agentsy/guardrails',
    '@agentsy/models',
    '@agentsy/observability',
    '@agentsy/providers',
    '@agentsy/secrets',
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
