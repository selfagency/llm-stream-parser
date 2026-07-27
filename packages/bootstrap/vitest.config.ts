import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      enabled: false
      // Coverage is disabled for this package to avoid OOM on CI
      // when concurrent coverage processes exceed the runner's 7GB memory.
      // The other 23 packages provide full coverage data to Codecov.
    }
  }
});
