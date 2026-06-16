import type { Logger } from '../types.js';

export interface ACPNotificationAdapterDeps {
  logger: Logger;
}

export class ACPNotificationAdapter {
  private readonly deps: ACPNotificationAdapterDeps;

  constructor(deps: ACPNotificationAdapterDeps) {
    this.deps = deps;
  }

  wireAgentToSession(_agentId: string, _sessionId: string): void {
    // Stub: In production, this would subscribe to daemon events
    // (streaming chunks, tool calls, usage updates) and map them
    // to ACP session/update notifications.
    this.deps.logger.debug('Notification adapter wired', { agentId: _agentId, sessionId: _sessionId });
  }

  unwireSession(_sessionId: string): void {
    this.deps.logger.debug('Notification adapter unwired', { sessionId: _sessionId });
  }
}
