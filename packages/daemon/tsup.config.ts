import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  dts: true,
  entry: {
    index: 'src/index.ts',
    'ipc/index': 'src/ipc/index.ts',
    'acp/index': 'src/acp/index.ts',
    'pool/index': 'src/pool/index.ts',
    'processes/index': 'src/processes/index.ts',
    'lifecycle/index': 'src/lifecycle/index.ts',
    'services/index': 'src/services/index.ts',
    'agents/index': 'src/agents/index.ts',
    'jobs/index': 'src/jobs/index.ts',
    'connectors/index': 'src/connectors/index.ts',
    'db/index': 'src/db/index.ts',
    'display/index': 'src/display/index.ts',
    'cli/index': 'src/cli/index.ts'
  },
  format: ['esm', 'cjs'],
  sourcemap: true,
  splitting: false,
  target: 'es2022'
});
