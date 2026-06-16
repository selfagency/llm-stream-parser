import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  dts: true,
  entry: {
    agents: 'src/agents/index.ts',
    index: 'src/index.ts',
    manifest: 'src/manifest/index.ts',
    sandbox: 'src/sandbox/index.ts',
    instructions: 'src/instructions/index.ts',
    skills: 'src/skills/index.ts',
    slash: 'src/slash/index.ts'
  },
  external: ['@agentsy/shared'],
  format: ['esm', 'cjs'],
  sourcemap: true,
  splitting: false,
  target: 'es2022'
});
