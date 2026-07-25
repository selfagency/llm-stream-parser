/**
 * AFT Bridge Helpers — thin wrapper around BridgePool for tool definitions.
 *
 * Each AFT tool calls `callBridge(command, params)` to invoke the
 * AFT Rust binary via the bridge pool.
 *
 * @module
 */

// ── Types ───────────────────────────────────────────────

export interface AftResponse {
  data?: unknown;
  error?: string;
  success: boolean;
}

export type CallBridgeFn = (
  command: string,
  params: Record<string, unknown>,
  options?: { sessionId?: string; timeoutMs?: number }
) => Promise<AftResponse>;

// ── Helper ──────────────────────────────────────────────

/**
 * Create a callBridge function tied to a bridge pool.
 * This is the only interface AFT tool definitions need — they
 * call `callBridge('command', { arg1: val1 })` and get back
 * a structured response.
 */
export function createCallBridgeFn(_pool: unknown, _projectRoot: string): CallBridgeFn {
  // In production, this would:
  // 1. Get a bridge from the pool for the project root
  // 2. Send the command via bridge.send(command, params, opts)
  // 3. Return the parsed response
  //
  // For now, return a stub since the BridgePool infrastructure
  // is not yet fully wired into the tools package.
  return async (
    command: string,
    params: Record<string, unknown>,
    _options?: { sessionId?: string; timeoutMs?: number }
  ) =>
    ({
      success: true,
      data: { command, params, note: 'AFT bridge not yet wired — stub response' }
    }) satisfies AftResponse;
}
