# @agentsy/daemon

Long-lived daemon process for Agentsy. The daemon is the central process that owns all stateful subsystems — agents, memory, streaming, job scheduling, connectors, and subprocess management.

## Architecture

The daemon exposes two interfaces:

1. **Internal IPC** — JSON-RPC 2.0 over Unix domain sockets for CLI/TUI clients
2. **ACP Agent** — Agent Client Protocol for editor integration (Zed, VS Code, JetBrains)

## Key Subsystems

- **IPCServer** — Unix socket JSON-RPC 2.0 server for internal clients
- **IPCClient** — Thin client for CLI/TUI to communicate with the daemon
- **ACPServer** — ACP Agent interface for editor integration
- **SubprocessManager** — Child process lifecycle with stall detection and memory limits
- **Supervisor** — Crash recovery and auto-restart
- **Sleeper** — Sleep/wake for idle subsystems
- **ServiceHost** — Generic service host with lifecycle management
- **AgentHost** — Multi-agent lifecycle manager
- **ScopeManager** — Folder-based scope isolation
- **JobScheduler** — Cron + one-time job scheduler
- **ConnectorHost** — Third-party connector manager
- **TUIBridge** — TUI display over IPC

## Usage

```typescript
import { Daemon } from '@agentsy/daemon';

const daemon = new Daemon({
  config: {
    ipc: { socketPath: '/tmp/agentsy.sock' },
    acp: { enabled: true, transport: 'stdio' }
  }
});

await daemon.start();
// ... daemon is running ...
await daemon.stop();
```

## CLI Commands

```bash
agentsy daemon start
agentsy daemon stop
agentsy daemon status
agentsy daemon restart
```
