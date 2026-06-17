// CLI: @agentsy/memory init — standalone initialization entrypoint

import type { InitOptions, InitResult } from '../init.js';
import { initMemory } from '../init.js';

export { type InitOptions, type InitResult, initMemory };

/**
 * Run the init CLI with parsed arguments.
 * Returns the InitResult on success, throws on failure.
 */
// fallow-ignore-next-line complexity — CLI flag parsing with multiple switch cases
export function runInitCli(args: string[] = process.argv.slice(2)): InitResult {
  if (args[0] === '--help' || args[0] === '-h') {
    console.log(`
@agentsy/memory init — Initialize memory engine

Usage: agentsy-memory init [options]

Options:
  --transport <stdio|http>   MCP transport mode (default: stdio)
  --port <number>            HTTP port (default: 4231)
  --skip-mcp                 Skip MCP server creation
  --skip-db                  Skip database initialization
  --force                    Overwrite existing files
  --help, -h                 Show this help message

Environment variables:
  AGENTSY_MEMORY_DB              Database path (default: .agentsy/memory.db)
  AGENTSY_MEMORY_TRANSPORT       Transport mode (default: stdio)
  AGENTSY_MEMORY_PORT            HTTP port (default: 4231)
  AGENTSY_MEMORY_SYNC_URL        Turso sync URL (optional)
  AGENTSY_MEMORY_SYNC_AUTH_TOKEN Turso auth token (optional)
`);
    process.exit(0);
  }

  const options: InitOptions = {};

  // biome-ignore lint/style/useForOf: index-based iteration needed for args[++i] consumption
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--transport': {
        options.config = options.config ?? {};
        options.config.mcp = options.config.mcp ?? {};
        const transportVal = args[++i];
        if (transportVal) {
          options.config.mcp.transport = transportVal as 'stdio' | 'http';
        }
        break;
      }
      case '--port': {
        options.config = options.config ?? {};
        options.config.mcp = options.config.mcp ?? {};
        const portVal = args[++i];
        if (portVal) {
          options.config.mcp.port = Number.parseInt(portVal, 10);
        }
        break;
      }
      case '--skip-mcp':
        options.skipMcp = true;
        break;
      case '--skip-db':
        options.skipDb = true;
        break;
      case '--force':
        options.force = true;
        break;
      default:
        break;
    }
  }

  return initMemory(options);
}

/** Main entrypoint for `agentsy-memory init` CLI. */
export function main(): void {
  try {
    const result = runInitCli();

    const hasServer = 'server' in result && result.server !== undefined;
    console.log('✓ @agentsy/memory initialized');
    console.log(
      `  Engine: ${result.engine.stats().totalItems} items, ${(result.engine.stats().budgetUtilization * 100).toFixed(1)}% budget used`
    );
    console.log(`  Config: db=${result.config.db.path}, transport=${result.config.mcp.transport ?? 'stdio'}`);

    if (hasServer) {
      console.log('  MCP server created. Call server.start() to begin listening.');
    }
  } catch (err) {
    console.error('✗ Failed to initialize @agentsy/memory:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
