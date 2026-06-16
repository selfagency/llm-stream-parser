import type { Daemon } from '../daemon.js';
import type { SubprocessManager } from '../processes/subprocess-manager.js';
import type { Logger } from '../types.js';
import { ACPNotificationAdapter } from './acp-notification-adapter.js';
import { ACPSessionBridge } from './acp-session-bridge.js';

export interface ACPServerConfig {
  enabled: boolean;
  maxSessions?: number;
  transport: 'stdio' | 'websocket';
  websocketPort?: number;
}

export interface ACPServerDeps {
  daemon: Daemon;
  logger: Logger;
  subprocessManager: SubprocessManager;
}

export class ACPServer {
  private connection: {
    start: () => Promise<void>;
    stop: () => Promise<void>;
    sendNotification: (method: string, params: unknown) => void;
  } | null = null;
  private readonly activeSessions = new Map<string, ACPSessionBridge>();
  private readonly deps: ACPServerDeps;

  constructor(deps: ACPServerDeps) {
    this.deps = deps;
    this.sessionBridge = new ACPSessionBridge({
      daemon: deps.daemon,
      logger: deps.logger
    });
    this.notificationAdapter = new ACPNotificationAdapter({
      logger: deps.logger
    });
  }

  async start(config: ACPServerConfig): Promise<void> {
    if (!config.enabled) {
      this.deps.logger.info('ACP server disabled');
      return;
    }

    // Stub: In production, this would create an AgentSideConnection
    // from @agentclientprotocol/sdk and register ACP method handlers.
    // For now, we provide a minimal stub that logs activity.

    this.connection = {
      start: async () => {
        this.deps.logger.info('ACP server started', {
          transport: config.transport,
          port: config.websocketPort
        });
      },
      stop: async () => {
        this.deps.logger.info('ACP server stopped');
      },
      sendNotification: (_method: string, _params: unknown) => {
        // Stub — would send ACP notifications to connected clients
      }
    };

    await this.connection.start();
  }

  async stop(): Promise<void> {
    for (const [id, bridge] of this.activeSessions) {
      await bridge.close();
      this.activeSessions.delete(id);
    }

    if (this.connection) {
      await this.connection.stop();
      this.connection = null;
    }

    this.deps.logger.info('ACP server stopped');
  }
}
