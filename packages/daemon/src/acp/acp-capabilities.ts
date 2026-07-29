/**
 * The capabilities this Agentsy daemon advertises to ACP clients.
 * These determine which ACP methods the client can invoke and
 * which features are available.
 */
/**
 * Phase 18: Full ACP capabilities with image/audio and MCP HTTP/SSE support.
 */
export const AGENT_CAPABILITIES = {
  loadSession: true,
  sessionCapabilities: {
    close: true,
    list: true,
    delete: true,
    resume: true,
    additionalDirectories: true
  },
  promptCapabilities: {
    image: true,
    audio: true,
    embeddedContext: true
  },
  mcpCapabilities: {
    http: true,
    sse: true
  },
  permissionKindProbing: true
} as const;
