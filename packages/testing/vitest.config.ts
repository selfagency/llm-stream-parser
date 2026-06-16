import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

const __filename = import.meta.filename;
const __dirname = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@agentsy/core/processor',
        replacement: resolve(__dirname, '../core/src/processor/index.ts')
      },
      {
        find: '@agentsy/core/recovery',
        replacement: resolve(__dirname, '../core/src/recovery/index.ts')
      },
      {
        find: '@agentsy/core/sse',
        replacement: resolve(__dirname, '../core/src/sse/index.ts')
      },
      {
        find: '@agentsy/core/context',
        replacement: resolve(__dirname, '../core/src/context/index.ts')
      },
      {
        find: '@agentsy/core/formatting',
        replacement: resolve(__dirname, '../core/src/formatting/index.ts')
      },
      {
        find: '@agentsy/core/structured',
        replacement: resolve(__dirname, '../core/src/structured/index.ts')
      },
      {
        find: '@agentsy/core/thinking',
        replacement: resolve(__dirname, '../core/src/thinking/index.ts')
      },
      {
        find: '@agentsy/core/tool-calls',
        replacement: resolve(__dirname, '../core/src/tool-calls/index.ts')
      },
      {
        find: '@agentsy/core/xml-filter',
        replacement: resolve(__dirname, '../core/src/xml-filter/index.ts')
      },
      {
        find: '@agentsy/providers/adapters',
        replacement: resolve(__dirname, '../providers/src/adapters/index.ts')
      },
      {
        find: '@agentsy/providers/normalizers',
        replacement: resolve(__dirname, '../providers/src/normalizers/index.ts')
      },
      {
        find: '@agentsy/providers/pipeline',
        replacement: resolve(__dirname, '../providers/src/pipeline/index.ts')
      },
      {
        find: '@agentsy/memory',
        replacement: resolve(__dirname, '../memory/src/index.ts')
      },
      {
        find: '@agentsy/core',
        replacement: resolve(__dirname, '../core/src/index.ts')
      },
      {
        find: '@agentsy/providers',
        replacement: resolve(__dirname, '../providers/src/index.ts')
      },
      {
        find: '@agentsy/ui',
        replacement: resolve(__dirname, '../renderers/src/index.ts')
      }
    ]
  },
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov']
    },
    environment: 'node',
    globals: false
  }
});
