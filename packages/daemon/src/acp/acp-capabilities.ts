/**
 * The capabilities this Agentsy daemon advertises to ACP clients.
 * These determine which ACP methods the client can invoke and
 * which features are available.
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
    image: false,
    audio: false,
    embeddedContext: true
  },
  mcpCapabilities: {
    http: true,
    sse: true
  }
} as const;
