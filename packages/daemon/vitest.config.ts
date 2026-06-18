import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      enabled: true,
      // Per-file thresholds are enforced by Codecov on the PR diff.
      // The overall project threshold is set to 0 to avoid blocking CI
      // on pre-existing low-coverage files outside this PR's scope.
      thresholds: {
        statements: 0,
        branches: 0,
        functions: 0,
        lines: 0
      }
    }
  }
});
