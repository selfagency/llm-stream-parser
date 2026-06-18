#!/usr/bin/env node
import { runCli } from './index.js';

// NOSONAR — async IIFE is required for CJS build compatibility (top-level await breaks esbuild CJS output)
(async () => {
  const argv = process.argv.slice(2);
  const exitCode = await runCli(argv);
  process.exit(exitCode);
})();
