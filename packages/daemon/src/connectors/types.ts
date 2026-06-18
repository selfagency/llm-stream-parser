/**
 * Inbound message from a platform adapter
 */
export interface InboundMessage {
  attachments?: Attachment[];
  channelId: string;
  rawPayload: unknown;
  text: string;
  threadId?: string;
  userId: string;
}

/**
 * Outbound message to send to a platform adapter
 */
export interface OutboundMessage {
  attachments?: Attachment[];
  channelId: string;
  text: string;
  threadId?: string;
  userId: string;
}

/**
 * Attachment metadata
 */
export interface Attachment {
  filename?: string;
  id: string;
  metadata?: Record<string, unknown>;
  mimeType?: string;
  type: 'image' | 'video' | 'audio' | 'document' | 'other';
  url?: string;
}

/**
 * Channel adapter configuration and interface
 */
export interface ChannelAdapter<TConfig = unknown> {
  connect(config: TConfig): Promise<void>;
  disconnect(): Promise<void>;
  id: string;
  onMessage(handler: (msg: InboundMessage) => Promise<void>): void;
  send(msg: OutboundMessage): Promise<void>;
  type: string;
}

/**
 * Session storage interface
 */
export interface SessionStore {
  delete(key: string): Promise<void>;
  get(key: string): Promise<string | null>;
  has(key: string): Promise<boolean>;
  set(key: string, value: string): Promise<void>;
}

/**
 * Agent session manager options
 */
export interface AgentSessionManagerOptions {
  maxIdleTime?: number;
  sessionStore?: SessionStore;
}

/**
 * Connector gateway options
 */
export interface ConnectorGatewayOptions {
  adapters: ChannelAdapter[];
  sessionManager?: AgentSessionManagerOptions;
}

/**
 * Built-in command handler
 */
export interface BuiltInCommand {
  command: string;
  description: string;
}

/**
 * Built-in commands available via connector gateway
 */
export const BUILT_IN_COMMANDS: readonly BuiltInCommand[] = [
  { command: '/status', description: 'Show current session status' },
  { command: '/new', description: 'Start a new conversation' },
  { command: '/reset', description: 'Reset the current conversation' },
  { command: '/compact', description: 'Compact conversation history' },
  { command: '/think', description: 'Toggle verbose thinking' },
  { command: '/verbose', description: 'Add verbose output' },
  { command: '/usage', description: 'Show usage statistics' }
] as const;

/**
 * Built-in command type
 */
export type BuiltInCommandType = (typeof BUILT_IN_COMMANDS)[number]['command'];

/**
 * Check if a message is a built-in command
 */
export function isBuiltInCommand(text: string): text is BuiltInCommandType {
  return BUILT_IN_COMMANDS.some(cmd => text.startsWith(cmd.command));
}

/**
 * Strip XML context injection patterns (SEC-013)
 */
export function stripXmlContextTags(text: string): string {
  return text
    .replaceAll(/<SYSTEM>[\s\S]*?<\/SYSTEM>/giu, '')
    .replaceAll(/<system>[\s\S]*?<\/system>/giu, '')
    .replaceAll(/<INSTRUCTION>[\s\S]*?<\/INSTRUCTION>/giu, '')
    .replaceAll(/<instruction>[\s\S]*?<\/instruction>/giu, '')
    .replaceAll(/<THOUGHT>[\s\S]*?<\/THOUGHT>/giu, '')
    .replaceAll(/<thought>[\s\S]*?<\/thought>/giu, '');
}
