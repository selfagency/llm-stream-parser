/**
 * GatewayClient — optional IPC shim for daemon-connected consumers.
 *
 * Provides the same `Gateway` interface but delegates to the daemon
 * over Unix socket IPC. Only used by agentsy's own CLI and TUI when
 * connected to a running daemon — external consumers don't need this.
 *
 * When importing, use `GatewayClientShim` to disambiguate from the
 * `GatewayClient` interface in `types.ts`:
 * ```typescript
 * import { GatewayClientShim as GatewayClient } from '@agentsy/gateway';
 * ```
 *
 * @module
 */

import type { RoutingRequest } from './ethics/types.js';
import type { Gateway } from './gateway.js';
import type { RoutingDecision } from './persistence/records.js';
import type { ProviderEntry } from './types.js';

/**
 * Minimal IPC client interface for the GatewayClientShim.
 *
 * In production, this is wired to the daemon's JSON-RPC 2.0 IPC client
 * (`packages/daemon/src/ipc/client.ts`). For testing, a mock can be used.
 */
export interface GatewayIPCClient {
  call(method: string, params?: Record<string, unknown>): Promise<unknown>;
}

/**
 * GatewayClientShim — delegates routing calls to the daemon over IPC.
 *
 * Implements the same method signatures as `Gateway` but forwards
 * every call to the daemon's `RoutingService` via JSON-RPC 2.0.
 */
export class GatewayClientShim implements Pick<Gateway, 'selectModel' | 'spillover' | 'registerProvider'> {
  readonly #ipc: GatewayIPCClient;

  constructor(ipc: GatewayIPCClient) {
    this.#ipc = ipc;
  }

  // biome-ignore lint/suspicious/useAwait: interface requires Promise return; delegates to IPC
  async selectModel(request: RoutingRequest): Promise<RoutingDecision> {
    return this.#ipc.call(
      'routing.selectModel',
      request as unknown as Record<string, unknown>
    ) as Promise<RoutingDecision>;
  }

  // biome-ignore lint/suspicious/useAwait: interface requires Promise return; delegates to IPC
  async spillover(decision: RoutingDecision): Promise<RoutingDecision | null> {
    return this.#ipc.call(
      'routing.spillover',
      decision as unknown as Record<string, unknown>
    ) as Promise<RoutingDecision | null>;
  }

  async registerProvider(provider: ProviderEntry): Promise<void> {
    await this.#ipc.call('routing.registerProvider', provider as unknown as Record<string, unknown>);
  }
}
