import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    dangerouslyIgnoreUnhandledErrors: true,
    coverage: {
      provider: 'istanbul',
      include: ['src/**/*.ts'],
      all: false,
      thresholds: {
        statements: 0,
        branches: 0,
        functions: 0,
        lines: 0
      }
    }
  }
});
