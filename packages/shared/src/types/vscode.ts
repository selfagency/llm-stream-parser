/**
 * VSCode extension integration types.
 */

import type { AgentId, SessionId } from './brands.js';

/**
 * Extension provider configuration.
 */
export interface ExtensionProviderConfig {
  /** VSCode activation events. */
  activationEvents?: string[];

  /** API key for authentication. */
  apiKey?: string;

  /** API endpoint for the extension. */
  apiUrl: string;

  /** Commands to register. */
  commands?: {
    command: string;
    title: string;
    category?: string;
  }[];

  /** Configuration schema for settings. */
  configurationSchema?: Record<string, unknown>;

  /** Default agent ID to activate. */
  defaultAgentId?: AgentId;

  /** Default session ID to use. */
  defaultSessionId?: SessionId;

  /** Display name. */
  displayName: string;

  /** Extension identifier. */
  extensionId: string;
  /** Provider identifier. */
  name: string;
}

/**
 * Lifecycle hooks for a provider extension.
 */
export interface IProviderLifecycle {
  /** Called when extension is activated. */
  onActivate(): Promise<void>;

  /** Called when connection to provider is established. */
  onConnect(): Promise<void>;

  /** Called when extension is deactivated. */
  onDeactivate(): Promise<void>;

  /** Called when connection to provider is closed. */
  onDisconnect(): Promise<void>;
}
