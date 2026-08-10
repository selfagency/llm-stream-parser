/**
 * Agent session state machine
 * Manages agent lifecycle: init → ready → running → pause → resume → done
 */

export const AgentSessionState = {
  INIT: 'init',
  READY: 'ready',
  RUNNING: 'running',
  PAUSED: 'paused',
  DONE: 'done',
  ERROR: 'error'
} as const;
export type AgentSessionState = (typeof AgentSessionState)[keyof typeof AgentSessionState];

export type AgentSessionTransition =
  | { from: 'init'; to: 'ready' }
  | { from: 'ready'; to: 'running' }
  | { from: 'running'; to: 'paused' }
  | { from: 'paused'; to: 'running' }
  | { from: 'running'; to: 'done' }
  | { from: 'running'; to: 'error' }
  | { from: 'error'; to: 'ready' };

const VALID_TRANSITIONS: Record<AgentSessionState, AgentSessionState[]> = {
  [AgentSessionState.INIT]: [AgentSessionState.READY],
  [AgentSessionState.READY]: [AgentSessionState.RUNNING],
  [AgentSessionState.RUNNING]: [AgentSessionState.PAUSED, AgentSessionState.DONE, AgentSessionState.ERROR],
  [AgentSessionState.PAUSED]: [AgentSessionState.RUNNING],
  [AgentSessionState.DONE]: [],
  [AgentSessionState.ERROR]: [AgentSessionState.READY]
};

export class AgentStateMachine {
  private current: AgentSessionState = AgentSessionState.INIT;
  private readonly listeners: Array<(from: AgentSessionState, to: AgentSessionState) => void> = [];

  get state(): AgentSessionState {
    return this.current;
  }

  onTransition(listener: (from: AgentSessionState, to: AgentSessionState) => void): void {
    this.listeners.push(listener);
  }

  transition(to: AgentSessionState): void {
    const allowed = VALID_TRANSITIONS[this.current];
    if (!allowed.includes(to)) {
      throw new Error(`Invalid state transition: ${this.current} → ${to}. Allowed: [${allowed.join(', ')}]`);
    }

    const from = this.current;
    this.current = to;

    for (const listener of this.listeners) {
      listener(from, to);
    }
  }

  canTransition(to: AgentSessionState): boolean {
    return VALID_TRANSITIONS[this.current].includes(to);
  }

  reset(): void {
    this.current = AgentSessionState.INIT;
  }
}
