/**
 * The capabilities this Agentsy daemon advertises to ACP clients.
 * These determine which ACP methods the client can invoke and
 * which features are available.
 */
export const AGENT_CAPABILITIES = {
  loadSession: false,
  sessionCapabilities: {
    close: false,
    list: false,
    delete: false,
    resume: false,
    additionalDirectories: false
  },
  promptCapabilities: {
    image: false,
    audio: false,
    embeddedContext: false
  },
  mcpCapabilities: {
    http: false,
    sse: false
  }
} as const;
