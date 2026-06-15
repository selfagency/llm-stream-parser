import { defineConfig } from 'tsup';

export default defineConfig({
  clean: true,
  dts: true,
  entry: {
    index: 'src/index.ts',
    injection: 'src/injection/index.ts',
    provider: 'src/provider/index.ts',
    config: 'src/config/index.ts'
  },
  external: [
    '@agentsy/runtime',
    '@agentsy/types',
    '@aws-sdk/client-secrets-manager',
    '@azure/identity',
    '@azure/keyvault-secrets',
    '@google-cloud/secret-manager'
  ],
  format: ['esm', 'cjs'],
  sourcemap: true,
  splitting: false,
  target: 'es2022'
});
