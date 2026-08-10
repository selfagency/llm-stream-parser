/**
 * RoutingService — hosts the gateway in the daemon.
 *
 * Instantiates `createGateway()` with `UnifiedDB`-backed persistence
 * and manages its lifecycle via `ServiceHost`. Does NOT reimplement
 * routing logic — all routing decisions delegate to the `@agentsy/gateway`
 * library.
 *
 * @module
 */

import {
  createGateway,
  type Gateway,
  type GatewayOptions,
  type ProviderEthicsPolicyHook,
  type RoutingDecision,
  type RoutingRequest
} from '@agentsy/gateway';

import type { UnifiedDB } from '../db/unified-db.js';
import type { Service } from '../types.js';
import { UnifiedDBPersistenceAdapter } from './unified-db-persistence-adapter.js';

export type ServiceState = 'stopped' | 'starting' | 'active' | 'sleeping' | 'stopping';

export interface RoutingServiceDeps {
  db: UnifiedDB;
  ethicsPolicy?: ProviderEthicsPolicyHook;
}

/**
 * Daemon service that hosts the gateway.
 *
 * Wraps `createGateway()` with `UnifiedDB`-backed persistence and
 * optional ethics policy. Exposes `selectModel()` and `spillover()`
 * for IPC handlers and other daemon services.
 */
export class RoutingService implements Service {
  readonly name = 'routing';
  #state: ServiceState = 'stopped';
  #gateway: Gateway | null = null;
  readonly #deps: RoutingServiceDeps;

  constructor(deps: RoutingServiceDeps) {
    this.#deps = deps;
  }

  get state(): ServiceState {
    return this.#state;
  }

  async start(): Promise<void> {
    this.#state = 'starting';

    const persistence = new UnifiedDBPersistenceAdapter(this.#deps.db);

    const options: GatewayOptions = {
      persistence,
      ...(this.#deps.ethicsPolicy ? { ethicsPolicy: this.#deps.ethicsPolicy } : {})
    };

    this.#gateway = createGateway(options);

    // Restore circuit-breaker state from UnifiedDB for each registered provider
    for (const providerId of this.#gateway.providerIds) {
      const row = await persistence.loadCircuitBreakerState(providerId);
      if (row) {
        this.#gateway.restoreCircuitBreakerState(providerId, row);
      }
    }

    this.#state = 'active';
  }

  // biome-ignore lint/suspicious/useAwait: interface requires Promise return; delegates to gateway
  async selectModel(request: RoutingRequest): Promise<RoutingDecision> {
    if (!this.#gateway) {
      throw new Error('RoutingService not started');
    }
    return this.#gateway.selectModel(request);
  }

  // biome-ignore lint/suspicious/useAwait: interface requires Promise return; delegates to gateway
  async spillover(decision: RoutingDecision): Promise<RoutingDecision | null> {
    if (!this.#gateway) {
      throw new Error('RoutingService not started');
    }
    return this.#gateway.spillover(decision);
  }

  // biome-ignore lint/suspicious/useAwait: interface requires Promise return; impl is sync
  async sleep(): Promise<void> {
    this.#state = 'sleeping';
  }

  // biome-ignore lint/suspicious/useAwait: interface requires Promise return; impl is sync
  async wakeup(): Promise<void> {
    this.#state = 'active';
  }

  async stop(): Promise<void> {
    this.#state = 'stopping';
    if (this.#gateway) {
      await this.#gateway.flush();
    }
    this.#gateway = null;
    this.#state = 'stopped';
  }

  /** Expose the underlying gateway instance for direct access by other services. */
  get gatewayInstance(): Gateway | null {
    return this.#gateway;
  }
}
