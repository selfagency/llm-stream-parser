import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    specs: 'src/specs/index.ts',
    loader: 'src/loader/index.ts',
    runtime: 'src/runtime/index.ts',
    hooks: 'src/hooks/index.ts',
    skills: 'src/skills/index.ts'
  },
  external: [
    '@agentsy/core',
    '@agentsy/context',
    '@agentsy/memory',
    '@agentsy/models',
    '@agentsy/orchestrator',
    '@agentsy/plugins',
    '@agentsy/runtime',
    '@agentsy/session',
    '@agentsy/tokenomics',
    '@agentsy/shared',
    'yaml',
    'zod'
  ],
  format: ['esm', 'cjs'],
  target: 'node18',
  treeshake: true,
  clean: true,
  sourcemap: true,
  dts: true
});
