/**
 * Messaging protocol for inter-agent communication
 */

export enum MessagePriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum MessageType {
  TASK = 'task',
  RESULT = 'result',
  ERROR = 'error',
  STATUS = 'status',
  REQUEST = 'request',
  RESPONSE = 'response',
  EVENT = 'event'
}

export interface AgentMessage {
  correlationId?: string;
  id: string;
  payload: unknown;
  priority: MessagePriority;
  recipient?: string;
  sender: string;
  timestamp: number;
  type: MessageType;
}

export type MessageHandler = (message: AgentMessage) => Promise<AgentMessage | void>;

/**
 * Simple message bus for agent communication
 */
export class MessageBus {
  private readonly handlers = new Map<string, MessageHandler[]>();
  private history: AgentMessage[] = [];
  private readonly maxHistory: number;

  constructor(maxHistory = 1000) {
    this.maxHistory = maxHistory;
  }

  /**
   * Subscribe to messages matching a type or sender
   */
  subscribe(pattern: string, handler: MessageHandler): void {
    const existing = this.handlers.get(pattern) ?? [];
    existing.push(handler);
    this.handlers.set(pattern, existing);
  }

  /**
   * Unsubscribe a handler
   */
  unsubscribe(pattern: string, handler: MessageHandler): void {
    const existing = this.handlers.get(pattern);
    if (!existing) {
      return;
    }
    this.handlers.set(
      pattern,
      existing.filter(h => h !== handler)
    );
  }

  /**
   * Publish a message to the bus
   */
  async publish(message: AgentMessage): Promise<AgentMessage[]> {
    this.history.push(message);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    const responses: AgentMessage[] = [];

    for (const [pattern, handlers] of this.handlers) {
      if (this.matches(message, pattern)) {
        for (const handler of handlers) {
          const response = await handler(message);
          if (response) {
            responses.push(response);
          }
        }
      }
    }

    return responses;
  }

  /**
   * Send a message and wait for a response (request-response pattern)
   */
  async request(
    message: Omit<AgentMessage, 'id' | 'timestamp'>,
    timeoutMs = 30_000
  ): Promise<AgentMessage | undefined> {
    const correlationId = crypto.randomUUID();
    const fullMessage: AgentMessage = {
      ...message,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      correlationId
    };

    return new Promise<AgentMessage | undefined>(resolve => {
      const timeout = setTimeout(() => {
        this.unsubscribe(`correlation:${correlationId}`, handler);
        resolve(undefined);
      }, timeoutMs);

      const handler: MessageHandler = async (response: AgentMessage) => {
        if (response.correlationId === correlationId) {
          clearTimeout(timeout);
          this.unsubscribe(`correlation:${correlationId}`, handler);
          resolve(response);
        }
      };

      this.subscribe(`correlation:${correlationId}`, handler);
      void this.publish(fullMessage);
    });
  }

  /**
   * Get message history
   */
  getHistory(): readonly AgentMessage[] {
    return [...this.history];
  }

  /**
   * Clear message history
   */
  clearHistory(): void {
    this.history = [];
  }

  private matches(message: AgentMessage, pattern: string): boolean {
    if (pattern.startsWith('correlation:')) {
      return message.correlationId === pattern.slice('correlation:'.length);
    }
    if (pattern === '*') {
      return true;
    }
    if (pattern === message.type) {
      return true;
    }
    if (pattern === message.sender) {
      return true;
    }
    return false;
  }
}
