/**
 * Event-sourced rollout — materialized views.
 *
 * JSONL append-only event log (persisted in SQLite per session) is the
 * source of truth. Materialized views are derived projections optimized
 * for different consumers: conversation, tool_calls, inference, compaction.
 *
 * This module is pure and has no side effects; it operates on in-memory
 * RolloutItem arrays, making it suitable for both daemon and core usage.
 *
 * @module
 */

// ── Rollout Item Types ─────────────────────────────────────

export type RolloutItemType =
  | 'assistant'
  | 'compaction'
  | 'error'
  | 'inference'
  | 'reasoning'
  | 'session_meta'
  | 'system'
  | 'tool_call'
  | 'tool_result'
  | 'user';

export interface RolloutItem {
  readonly data: Record<string, unknown>;
  readonly id: string;
  readonly sequence: number;
  readonly sessionId: string;
  readonly timestamp: string;
  readonly type: RolloutItemType;
}

// ── View Types ─────────────────────────────────────────────

export interface ConversationEntry {
  readonly content: string;
  readonly role: 'assistant' | 'system' | 'user';
  readonly sequence: number;
  readonly sessionId: string;
  readonly timestamp: string;
}

export type ConversationView = readonly ConversationEntry[];

export interface ToolCallEntry {
  readonly arguments: Record<string, unknown>;
  readonly name: string;
  readonly result?: unknown;
  readonly sequence: number;
  readonly sessionId: string;
  readonly status: 'completed' | 'failed' | 'running';
  readonly timestamp: string;
  readonly toolCallId: string;
}

export type ToolCallsView = readonly ToolCallEntry[];

export interface InferenceEntry {
  readonly costUsd?: number;
  readonly durationMs?: number;
  readonly inputTokens?: number;
  readonly model?: string;
  readonly outputTokens?: number;
  readonly raw: Record<string, unknown>;
  readonly sequence: number;
  readonly sessionId: string;
  readonly timestamp: string;
}

export type InferenceView = readonly InferenceEntry[];

export interface CompactionEntry {
  readonly compactedTokenCount?: number;
  readonly originalTokenCount?: number;
  readonly raw: Record<string, unknown>;
  readonly sequence: number;
  readonly sessionId: string;
  readonly summary: string;
  readonly timestamp: string;
}

export type CompactionView = readonly CompactionEntry[];

export interface MaterializedViews {
  readonly compaction: CompactionView;
  readonly conversation: ConversationView;
  readonly inference: InferenceView;
  readonly toolCalls: ToolCallsView;
}

// ── Helpers ────────────────────────────────────────────────

interface LooseData {
  args?: unknown;
  arguments?: unknown;
  compactedTokenCount?: unknown;
  content?: unknown;
  costUsd?: unknown;
  durationMs?: unknown;
  id?: unknown;
  inputTokens?: unknown;
  model?: unknown;
  name?: unknown;
  originalTokenCount?: unknown;
  output?: unknown;
  outputTokens?: unknown;
  prompt?: unknown;
  result?: unknown;
  status?: unknown;
  summary?: unknown;
  text?: unknown;
  toolCallId?: unknown;
  toolName?: unknown;
  usage?: unknown;
}

function asLoose(data: Record<string, unknown>): LooseData {
  return data as LooseData;
}

function toStringContent(data: Record<string, unknown>): string {
  const d = asLoose(data);
  if (typeof d.content === 'string') {
    return d.content;
  }
  if (typeof d.text === 'string') {
    return d.text;
  }
  if (typeof d.prompt === 'string') {
    return d.prompt;
  }
  if (typeof d.summary === 'string') {
    return d.summary;
  }
  return JSON.stringify(data);
}

function toNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getStringField(data: Record<string, unknown>, field: keyof LooseData): string | undefined {
  const loose = asLoose(data);
  const v = loose[field];
  return typeof v === 'string' ? v : undefined;
}

function getRecordField(data: Record<string, unknown>, field: keyof LooseData): Record<string, unknown> | undefined {
  const loose = asLoose(data);
  const v = loose[field];
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

// ── View Derivation ────────────────────────────────────────

export function deriveConversationView(items: readonly RolloutItem[]): ConversationView {
  const result: ConversationEntry[] = [];

  for (const item of items) {
    if (item.type === 'system' || item.type === 'session_meta') {
      result.push({
        content: toStringContent(item.data),
        role: 'system',
        sequence: item.sequence,
        sessionId: item.sessionId,
        timestamp: item.timestamp
      });
    } else if (item.type === 'user') {
      result.push({
        content: toStringContent(item.data),
        role: 'user',
        sequence: item.sequence,
        sessionId: item.sessionId,
        timestamp: item.timestamp
      });
    } else if (item.type === 'assistant') {
      result.push({
        content: toStringContent(item.data),
        role: 'assistant',
        sequence: item.sequence,
        sessionId: item.sessionId,
        timestamp: item.timestamp
      });
    }
  }

  return result.sort((a, b) => a.sequence - b.sequence);
}

function extractToolCallId(data: Record<string, unknown>, sessionId: string, sequence: number): string {
  return getStringField(data, 'toolCallId') ?? getStringField(data, 'id') ?? `${sessionId}-${sequence}`;
}

function extractToolName(data: Record<string, unknown>): string {
  return getStringField(data, 'name') ?? getStringField(data, 'toolName') ?? 'unknown';
}

function extractArguments(data: Record<string, unknown>): Record<string, unknown> {
  return getRecordField(data, 'arguments') ?? getRecordField(data, 'args') ?? {};
}

function handleToolCall(item: RolloutItem, callMap: Map<string, ToolCallEntry>, order: ToolCallEntry[]): void {
  const id = extractToolCallId(item.data, item.sessionId, item.sequence);
  const name = extractToolName(item.data);
  const args = extractArguments(item.data);

  const entry: ToolCallEntry = {
    arguments: args,
    name,
    sequence: item.sequence,
    sessionId: item.sessionId,
    status: 'running',
    timestamp: item.timestamp,
    toolCallId: id
  };
  callMap.set(id, entry);
  order.push(entry);
}

function handleToolResult(item: RolloutItem, callMap: Map<string, ToolCallEntry>, order: ToolCallEntry[]): void {
  const loose = asLoose(item.data);
  const rawId = getStringField(item.data, 'toolCallId') ?? getStringField(item.data, 'id') ?? '';
  if (rawId && callMap.has(rawId)) {
    const existing = callMap.get(rawId);
    if (!existing) {
      return;
    }
    const updated: ToolCallEntry = {
      arguments: existing.arguments,
      name: existing.name,
      result: loose.result ?? loose.output ?? item.data,
      sequence: existing.sequence,
      sessionId: item.sessionId,
      status: (getStringField(item.data, 'status') as ToolCallEntry['status']) ?? 'completed',
      timestamp: item.timestamp,
      toolCallId: existing.toolCallId
    };
    callMap.set(rawId, updated);
    const idx = order.findIndex(e => e.toolCallId === rawId);
    if (idx !== -1) {
      order[idx] = updated;
    }
  } else {
    addOrphanToolResult(item, loose, rawId, callMap, order);
  }
}

/** Record a tool result that has no matching prior tool call. */
function addOrphanToolResult(
  item: RolloutItem,
  loose: LooseData,
  rawId: string,
  callMap: Map<string, ToolCallEntry>,
  order: ToolCallEntry[]
): void {
  const orphanId = rawId || `${item.sessionId}-${item.sequence}`;
  const entry: ToolCallEntry = {
    arguments: {},
    name: getStringField(item.data, 'name') ?? 'unknown',
    result: loose.result ?? loose.output,
    sequence: item.sequence,
    sessionId: item.sessionId,
    status: 'completed',
    timestamp: item.timestamp,
    toolCallId: orphanId
  };
  callMap.set(orphanId, entry);
  order.push(entry);
}

export function deriveToolCallsView(items: readonly RolloutItem[]): ToolCallsView {
  const callMap = new Map<string, ToolCallEntry>();
  const order: ToolCallEntry[] = [];

  for (const item of items) {
    if (item.type === 'tool_call') {
      handleToolCall(item, callMap, order);
    } else if (item.type === 'tool_result') {
      handleToolResult(item, callMap, order);
    }
  }

  return order.sort((a, b) => a.sequence - b.sequence);
}

function isInferenceCandidate(item: RolloutItem): boolean {
  if (item.type === 'inference') {
    return true;
  }
  if (item.type === 'assistant') {
    const usage = asLoose(item.data).usage;
    return usage !== undefined;
  }
  return false;
}

export function deriveInferenceView(items: readonly RolloutItem[]): InferenceView {
  const result: InferenceEntry[] = [];

  for (const item of items) {
    if (!isInferenceCandidate(item)) {
      continue;
    }
    const loose = asLoose(item.data);
    const usageData = (loose.usage as Record<string, unknown>) ?? item.data;
    const usageLoose = asLoose(usageData);
    result.push({
      costUsd: toNumber(loose.costUsd) ?? toNumber(usageLoose.costUsd),
      durationMs: toNumber(loose.durationMs),
      inputTokens: toNumber(loose.inputTokens) ?? toNumber(usageLoose.inputTokens),
      model: getStringField(item.data, 'model') ?? getStringField(usageData, 'model'),
      outputTokens: toNumber(loose.outputTokens) ?? toNumber(usageLoose.outputTokens),
      raw: item.data,
      sequence: item.sequence,
      sessionId: item.sessionId,
      timestamp: item.timestamp
    });
  }

  return result.sort((a, b) => a.sequence - b.sequence);
}

export function deriveCompactionView(items: readonly RolloutItem[]): CompactionView {
  const result: CompactionEntry[] = [];

  for (const item of items) {
    if (item.type !== 'compaction') {
      continue;
    }
    result.push({
      compactedTokenCount: toNumber(asLoose(item.data).compactedTokenCount),
      originalTokenCount: toNumber(asLoose(item.data).originalTokenCount),
      raw: item.data,
      sequence: item.sequence,
      sessionId: item.sessionId,
      summary: getStringField(item.data, 'summary') ?? toStringContent(item.data),
      timestamp: item.timestamp
    });
  }

  return result.sort((a, b) => a.sequence - b.sequence);
}

export function createMaterializedViews(items: readonly RolloutItem[]): MaterializedViews {
  return {
    compaction: deriveCompactionView(items),
    conversation: deriveConversationView(items),
    inference: deriveInferenceView(items),
    toolCalls: deriveToolCallsView(items)
  };
}

// ── Factory ────────────────────────────────────────────────

export interface CreateRolloutItemOptions {
  readonly data?: Record<string, unknown>;
  readonly id?: string;
  readonly sequence: number;
  readonly sessionId: string;
  readonly timestamp?: string;
  readonly type: RolloutItemType;
}

let fallbackIdCounter = 0;

export function createRolloutItem(options: CreateRolloutItemOptions): RolloutItem {
  if (!options.sessionId) {
    throw new Error('sessionId is required for RolloutItem');
  }
  if (!Number.isInteger(options.sequence) || options.sequence < 1) {
    throw new Error('sequence must be a positive integer');
  }

  return {
    data: options.data ?? {},
    id: options.id ?? `rollout-${Date.now()}-${++fallbackIdCounter}`,
    sequence: options.sequence,
    sessionId: options.sessionId,
    timestamp: options.timestamp ?? new Date().toISOString(),
    type: options.type
  };
}

// ── JSONL Serialization ────────────────────────────────────

export function rolloutItemToJsonl(item: RolloutItem): string {
  return JSON.stringify(item);
}

export function rolloutItemsToJsonl(items: readonly RolloutItem[]): string {
  return items.map(rolloutItemToJsonl).join('\n');
}

export function rolloutItemsFromJsonl(jsonl: string): RolloutItem[] {
  if (!jsonl.trim()) {
    return [];
  }
  const lines = jsonl.split('\n').filter(l => l.trim().length > 0);
  const items: RolloutItem[] = [];

  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as RolloutItem;
      const hasRequired = parsed.sessionId && parsed.type && typeof parsed.sequence === 'number';
      if (hasRequired) {
        items.push(parsed);
      }
    } catch {
      // skip malformed line — graceful degradation
    }
  }

  return items.sort((a, b) => a.sequence - b.sequence);
}
