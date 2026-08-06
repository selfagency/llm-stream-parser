/**
 * ACP subsystem — Agent Client Protocol interface for editor integration.
 * @module
 */

export { AGENT_CAPABILITIES } from './acp-capabilities.js';
export { ACPNotificationAdapter, type ACPNotificationAdapterDeps } from './acp-notification-adapter.js';
export { ACPServer, type ACPServerConfig, type ACPServerDeps } from './acp-server.js';
export { type ACPPromptCallbacks, ACPSessionBridge, type ACPSessionBridgeDeps } from './acp-session-bridge.js';
export {
  AGENT_CAPABILITIES as AGENT_CAPABILITIES_V2,
  type AgentCapabilities,
  type ASRPipelineOptions,
  type ASRResult,
  type AudioBlock,
  createASRPipelineStub,
  type EmbeddedContextBlock,
  forwardImagesToVisionModel,
  getMCPCapabilities,
  getPromptCapabilities,
  getSessionCapabilities,
  type ImageBlock,
  isAudioBlock,
  isImageBlock,
  isTextBlock,
  type ParsedPrompt,
  type PromptContentBlock,
  parsePromptContent,
  type TextBlock,
  type VisionModelForward,
  validateAudioBlock,
  validateCapabilitiesAdvertisement,
  validateImageBlock
} from './capabilities.js';
export {
  ACPMCPManager,
  type ACPMCPManagerDeps,
  createMCPManager,
  type ManagedMCPServer,
  type MCPServerDefinition,
  type StartResult
} from './mcp-manager.js';
export {
  ACPSessionPersistence,
  type ACPSessionRecord,
  createSessionPersistence,
  type PersistedSessionState
} from './session-persistence.js';
