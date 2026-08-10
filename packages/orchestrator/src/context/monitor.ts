/**
 * Context-window monitor — detects when a running agent's context is degrading
 * and triggers a handoff before it dies.
 *
 * Inspired by Claude Code Tip 5 ("context is like milk") and Tip 8 (handoff docs).
 *
 * The monitor tracks token usage per step. When usage crosses the warning
 * threshold, it emits a warning. When it crosses the handoff threshold, it
 * writes a HandoffDocument to both the session store AND a file on disk,
 * then signals the orchestrator to spawn a fresh agent.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// ── Types ────────────────────────────────────────────────────────────────

export interface ContextMonitorConfig {
  /** Directory for handoff files (default: cwd) */
  handoffDir?: string;
  /** Context usage % that triggers handoff (default 85) */
  handoffThreshold: number;
  /** Max context tokens for the model (default 200_000) */
  maxContextTokens: number;
  /** Context usage % that triggers warning (default 70) */
  warningThreshold: number;
}

export type ContextStatus = 'fresh' | 'stale' | 'critical';

export interface ContextSnapshot {
  agentId: string;
  estimatedUsage: number;
  percent: number;
  status: ContextStatus;
  stepIndex: number;
}

export type ContextAction =
  | { type: 'continue' }
  | { type: 'warn'; snapshot: ContextSnapshot }
  | { type: 'handoff'; snapshot: ContextSnapshot; document: HandoffDocument };

export interface HandoffDocument {
  agentId: string;
  checkpointId: string;
  currentProgress: string[];
  goal: string;
  nextSteps: string[];
  timestamp: number;
  whatDidNotWork: string[];
  whatWorked: string[];
}

// ── Monitor ──────────────────────────────────────────────────────────────

export class ContextMonitor {
  readonly #config: ContextMonitorConfig;
  #cumulativeTokens = 0;
  #warned = false;

  constructor(config: Partial<ContextMonitorConfig> = {}) {
    this.#config = {
      handoffThreshold: 85,
      warningThreshold: 70,
      maxContextTokens: 200_000,
      ...config
    };
  }

  /** Called after each step; returns action to take. */
  check(
    agentId: string,
    stepTokens: number,
    stepIndex: number,
    handoffBuilder?: () => Omit<HandoffDocument, 'agentId' | 'timestamp' | 'checkpointId'>
  ): ContextAction {
    this.#cumulativeTokens += stepTokens;
    const percent = Math.round((this.#cumulativeTokens / this.#config.maxContextTokens) * 100);

    const snapshot: ContextSnapshot = {
      agentId,
      estimatedUsage: this.#cumulativeTokens,
      percent,
      status: toMonitorStatus(percent, this.#config),
      stepIndex
    };

    if (snapshot.status === 'critical') {
      const base = handoffBuilder?.() ?? {
        goal: 'Unknown — no handoff builder provided',
        currentProgress: [],
        whatWorked: [],
        whatDidNotWork: [],
        nextSteps: []
      };
      const checkpointId = `handoff_${Date.now()}`;
      const document: HandoffDocument = {
        ...base,
        agentId,
        checkpointId,
        timestamp: Date.now()
      };
      this.#writeHandoffFile(document);
      return { type: 'handoff', snapshot, document };
    }

    if (snapshot.status === 'stale' && !this.#warned) {
      this.#warned = true;
      return { type: 'warn', snapshot };
    }

    return { type: 'continue' };
  }

  /** Write handoff document to disk (both session store and file). */
  #writeHandoffFile(document: HandoffDocument): string {
    const dir = this.#config.handoffDir ?? process.cwd();
    const handoffDir = join(dir, '.agentsy', 'handoffs');
    const filePath = join(handoffDir, `HANDOFF_${document.agentId}.md`);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, this.#renderHandoffMarkdown(document), 'utf-8');
    return filePath;
  }

  /** Render handoff as human-readable markdown (inspectable, not documentation theater). */
  #renderHandoffMarkdown(doc: HandoffDocument): string {
    return `# Handoff — Agent ${doc.agentId}

> Generated ${new Date(doc.timestamp).toISOString()} | Checkpoint: ${doc.checkpointId}

## Goal

${doc.goal}

## Current Progress

${doc.currentProgress.map(p => `- ${p}`).join('\n') || '_None recorded_'}

## What Worked

${doc.whatWorked.map(p => `- ${p}`).join('\n') || '_None recorded_'}

## What Didn't Work

${doc.whatDidNotWork.map(p => `- ${p}`).join('\n') || '_None recorded_'}

## Next Steps

${doc.nextSteps.map(p => `- ${p}`).join('\n') || '_None recorded_'}
`;
  }

  /** Reset monitor state (for testing or fresh agent spawn). */
  reset(): void {
    this.#cumulativeTokens = 0;
    this.#warned = false;
  }

  /** Get current snapshot without side effects. */
  snapshot(agentId: string, stepIndex: number): ContextSnapshot {
    const percent = Math.round((this.#cumulativeTokens / this.#config.maxContextTokens) * 100);
    return {
      agentId,
      estimatedUsage: this.#cumulativeTokens,
      percent,
      status: toMonitorStatus(percent, this.#config),
      stepIndex
    };
  }
}

function toMonitorStatus(
  percent: number,
  config: { warningThreshold: number; handoffThreshold: number }
): 'fresh' | 'stale' | 'critical' {
  if (percent >= config.handoffThreshold) {
    return 'critical';
  }
  if (percent >= config.warningThreshold) {
    return 'stale';
  }
  return 'fresh';
}
