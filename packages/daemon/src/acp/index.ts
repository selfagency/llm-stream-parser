/**
 * ACP subsystem — Agent Client Protocol interface for editor integration.
 *
 * Implements the ACP Agent interface using @agentclientprotocol/sdk,
 * enabling integration with Zed, VS Code (ACP Client extension), and JetBrains.
 *
 * @module
 */

export { AGENT_CAPABILITIES } from './acp-capabilities.js';
export { ACPNotificationAdapter, type ACPNotificationAdapterDeps } from './acp-notification-adapter.js';
export { ACPServer, type ACPServerConfig, type ACPServerDeps } from './acp-server.js';
export { ACPSessionBridge, type ACPSessionBridgeDeps } from './acp-session-bridge.js';
