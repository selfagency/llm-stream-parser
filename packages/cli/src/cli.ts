#!/usr/bin/env node
import { runCli } from './index.js';

const argv = process.argv.slice(2);
const exitCode = await runCli(argv);
process.exit(exitCode);
