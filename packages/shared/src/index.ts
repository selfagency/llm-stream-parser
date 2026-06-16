/**
 * @agentsy/shared — Shared types, utilities, and CortexKit integration.
 *
 * This barrel re-exports everything from the types/ and cortexkit/ subdirectories.
 * Consumers should prefer subpath imports for clarity:
 *   - @agentsy/shared for all shared types
 *   - @agentsy/shared/cortexkit for CortexKit utilities
 */

export * from './cortexkit/index.js';
export * from './types/index.js';
