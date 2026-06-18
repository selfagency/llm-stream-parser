/**
 * Service host subsystem.
 *
 * Generic service host with lifecycle management (start, stop, sleep, wake).
 *
 * @module
 */

export { RoutingService, type RoutingServiceDeps } from './routing-service.js';
export { ServiceHost, type ServiceHostDeps, type ServiceState } from './service-host.js';
export { UnifiedDBPersistenceAdapter } from './unified-db-persistence-adapter.js';
