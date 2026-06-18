import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  dts: true,
  entry: { index: 'src/index.ts', cli: 'src/cli.ts', config: 'src/config/index.ts' },
  external: [
    '@agentsy/core',
    '@agentsy/daemon',
    '@agentsy/models',
    '@agentsy/providers',
    '@agentsy/secrets',
    '@agentsy/tokenomics',
    '@cortexkit/aft',
    '@cortexkit/magic-context'
  ],
  format: ['esm', 'cjs'],
  sourcemap: true,
  splitting: false,
  target: 'es2022'
});
