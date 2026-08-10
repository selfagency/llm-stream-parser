/**
 * Shared MSW test server setup and lifecycle helpers for @agentsy/testing.
 *
 * Provides a single `createTestServer` entry point that combines provider,
 * memory, and retrieval handlers into one MSW server instance with
 * Vitest lifecycle integration.
 *
 * @module @agentsy/testing/msw
 */

import type { HttpHandler } from 'msw';
import { setupServer } from 'msw/node';
import type { MockMemoryState } from './handlers/memory.js';
import { createMemoryHandlers, createMockMemoryState } from './handlers/memory.js';
import type { MockRetrievalState } from './handlers/retrieval.js';
import { createMockRetrievalState, createRetrievalHandlers } from './handlers/retrieval.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SetupServerApi = ReturnType<typeof setupServer>;

export interface TestServerConfig {
  /** Extra MSW handlers to register beyond the defaults */
  extraHandlers?: HttpHandler[];
  /** Whether to include memory/RAG handlers (default: true) */
  includeMemory?: boolean;
  /** Whether to include retrieval/embedding handlers (default: true) */
  includeRetrieval?: boolean;
  /** Base URL for memory handlers */
  memoryBaseUrl?: string;
  /** Pre-populated memory state */
  memoryState?: MockMemoryState;
  /** Base URL for retrieval handlers */
  retrievalBaseUrl?: string;
  /** Pre-populated retrieval state */
  retrievalState?: MockRetrievalState;
}

export interface TestServer {
  /** Memory/RAG state (mutate to control test scenarios) */
  memoryState: MockMemoryState;
  /** Retrieval state (mutate to control test scenarios) */
  retrievalState: MockRetrievalState;
  /** The underlying MSW SetupServerApi instance */
  server: SetupServerApi;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create an MSW test server with pre-configured handler sets.
 *
 * Call `server.listen()` in a Vitest `beforeAll` and `server.close()` in
 * `afterAll`. Call `server.resetHandlers()` in `afterEach` to isolate
 * tests from each other.
 *
 * @example
 * ```typescript
 * import { createTestServer } from '@agentsy/testing/msw';
 *
 * const ts = createTestServer();
 *
 * beforeAll(() => ts.server.listen({ onUnhandledRequest: 'error' }));
 * afterEach(() => ts.server.resetHandlers());
 * afterAll(() => ts.server.close());
 * ```
 */
function buildHandlers(
  config: TestServerConfig | undefined,
  memoryState: ReturnType<typeof createMockMemoryState>,
  retrievalState: ReturnType<typeof createMockRetrievalState>
): HttpHandler[] {
  return [
    ...((config?.includeMemory ?? true)
      ? createMemoryHandlers({
          state: memoryState,
          ...(config?.memoryBaseUrl === undefined ? {} : { baseUrl: config.memoryBaseUrl })
        })
      : []),
    ...((config?.includeRetrieval ?? true)
      ? createRetrievalHandlers({
          state: retrievalState,
          ...(config?.retrievalBaseUrl === undefined ? {} : { baseUrl: config.retrievalBaseUrl })
        })
      : []),
    ...(config?.extraHandlers ?? [])
  ];
}

export function createTestServer(config?: TestServerConfig): TestServer {
  const memoryState = config?.memoryState ?? createMockMemoryState();
  const retrievalState = config?.retrievalState ?? createMockRetrievalState();
  const handlers = buildHandlers(config, memoryState, retrievalState);
  const server = setupServer(...handlers);

  return { server, memoryState, retrievalState };
}
