// CLI: @agentsy/memory mcp — MCP server daemon entrypoint

import { createMemoryEngine } from '../cognitive/memory-engine.js';
import { loadConfig, type MemoryConfig } from '../config.js';
import { createMemoryMCPServer } from '../mcp/server.js';

export type { MemoryMCPServer } from '../mcp/server.js';
export { createMemoryEngine, loadConfig, type MemoryConfig };

/**
 * Start the MCP memory server with the given config.
 * Handles SIGTERM/SIGINT for graceful shutdown.
 */
// fallow-ignore-next-line complexity — CLI flag parsing with multiple switch cases
export async function runMcpServerCli(args: string[] = process.argv.slice(2)): Promise<void> {
  if (args[0] === '--help' || args[0] === '-h') {
    console.log(`
@agentsy/memory mcp — Start the MCP memory server

Usage: agentsy-memory-mcp [options]

Options:
  --transport <stdio|http>   MCP transport mode (default: stdio)
  --port <number>            HTTP port (default: 4231)
  --log-level <level>        Log level: debug|info|warn|error (default: info)
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

  const configOverrides: Partial<MemoryConfig> = {};

  // biome-ignore lint/style/useForOf: index-based iteration needed for args[++i] consumption
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--transport': {
        configOverrides.mcp ??= {};
        const transportVal = args[++i];
        if (transportVal) {
          configOverrides.mcp.transport = transportVal as 'stdio' | 'http';
        }
        break;
      }
      case '--port': {
        configOverrides.mcp ??= {};
        const portVal = args[++i];
        if (portVal) {
          configOverrides.mcp.port = Number.parseInt(portVal, 10);
        }
        break;
      }
      case '--log-level': {
        const logVal = args[++i];
        if (logVal) {
          configOverrides.logLevel = logVal as MemoryConfig['logLevel'];
        }
        break;
      }
      default:
        break;
    }
  }

  const config = loadConfig(configOverrides);
  const engine = createMemoryEngine();

  const server = createMemoryMCPServer(engine, config.mcp);

  // Handle graceful shutdown
  let shuttingDown = false;
  async function shutdown(): Promise<void> {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    await server.close();
    process.exit(0);
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await server.start();
}

/** Main entrypoint for `agentsy-memory-mcp` CLI. */
export async function main(): Promise<void> {
  try {
    await runMcpServerCli();
  } catch (err) {
    console.error('Failed to start MCP server:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
