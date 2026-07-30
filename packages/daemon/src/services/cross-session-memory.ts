/**
 * CrossSessionMemory — aggregates memories across sessions, groups by topic,
 * calculates confidence, and produces concise summaries.
 *
 * Phase 18: Missing Capabilities — Cross-Session Memory Persistence
 *
 * - Queries memory.recall with scope, kind semantic, limit 100
 * - groupByTopic clusters by normalized topic
 * - calculateConfidence uses recency + frequency + consistency
 * - summarize produces concise topic summary
 *
 * @module
 */

import { createNoopLogger, type Logger } from './types.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface MemoryItem {
  content: string;
  id: string;
  metadata?: Record<string, unknown> & {
    sessionId?: string;
    topic?: string;
  };
  score?: number;
  sessionId?: string;
  timestamp: Date | number | string;
  topic?: string;
}

export interface RecallParams {
  kind?: string;
  limit?: number;
  query: string;
  scope: string;
}

export interface CrossSessionMemoryProvider {
  recall(params: RecallParams): Promise<MemoryItem[]> | MemoryItem[];
}

export interface CrossSessionMemoryDeps {
  logger?: Logger;
  memory: CrossSessionMemoryProvider;
  now?: () => Date;
}

export interface CrossSessionMemoryOptions {
  maxQueryLimit?: number;
  minConfidence?: number;
}

export interface TopicGroup {
  items: MemoryItem[];
  key: string;
}

export interface CrossSessionInsight {
  confidence: number;
  earliestMemory: Date;
  latestMemory: Date;
  memoryCount: number;
  sessionIds: string[];
  summary: string;
  topic: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_LIMIT = 100;
const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'can',
  'this',
  'that',
  'these',
  'those',
  'i',
  'you',
  'he',
  'she',
  'it',
  'we',
  'they',
  'what',
  'which',
  'who',
  'whom',
  'whose',
  'where',
  'when',
  'why',
  'how'
]);

// ── Helpers ────────────────────────────────────────────────────────────────

function parseTimestamp(value: Date | number | string): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return new Date();
    }
    return value;
  }
  if (typeof value === 'number') {
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) {
      return new Date();
    }
    return d;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return new Date();
  }
  return d;
}

function validateScope(scope: string): void {
  if (typeof scope !== 'string' || scope.trim().length === 0) {
    throw new Error('Invalid scope: must be a non-empty string');
  }
}

function normalizeTopic(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/gu)
    .filter(t => {
      if (t.length <= 2) {
        return false;
      }
      if (STOPWORDS.has(t)) {
        return false;
      }
      return true;
    });
}

function extractTopicFromContent(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return 'general';
  }

  const topicPrefix = /^(?:topic|subject|about|theme)\s*[-:]\s*(.+)$/im.exec(trimmed);
  if (topicPrefix?.[1]) {
    const rawCandidate = topicPrefix[1].split(/[\n.!?]/)[0];
    if (rawCandidate) {
      const normalized = normalizeTopic(rawCandidate.trim().slice(0, 80));
      if (normalized.length >= 3) {
        return normalized;
      }
    }
  }

  const tokens = tokenize(trimmed);
  if (tokens.length === 0) {
    return 'general';
  }
  const unique = [...new Set(tokens)];
  const top = unique.slice(0, 3).join(' ');
  if (top.trim().length === 0) {
    return 'general';
  }
  return normalizeTopic(top);
}

function getTopic(item: MemoryItem): string {
  if (typeof item.topic === 'string' && item.topic.trim().length > 0) {
    return normalizeTopic(item.topic);
  }
  const metaTopic = item.metadata?.topic;
  if (typeof metaTopic === 'string' && metaTopic.trim().length > 0) {
    return normalizeTopic(metaTopic);
  }
  return extractTopicFromContent(item.content);
}

function getSessionId(item: MemoryItem): string {
  if (typeof item.sessionId === 'string' && item.sessionId.length > 0) {
    return item.sessionId;
  }
  const metaSid = item.metadata?.sessionId;
  if (typeof metaSid === 'string' && metaSid.length > 0) {
    return metaSid;
  }
  return 'unknown';
}

function computeRecencyScore(latestMs: number, nowMs: number): number {
  const ageMs = Math.max(0, nowMs - latestMs);
  const ageHours = ageMs / (1000 * 60 * 60);
  const ageDays = ageHours / 24;
  const raw = Math.exp(-ageDays / 14);
  return Math.max(0, Math.min(1, raw));
}

function computeFrequencyScore(count: number): number {
  if (count <= 1) {
    return 0.25;
  }
  const logScore = Math.log10(count + 1) / Math.log10(11);
  return Math.max(0, Math.min(1, logScore));
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Jaccard + topic unanimity is inherently branchy
function computeConsistencyScore(items: MemoryItem[]): number {
  if (items.length <= 1) {
    return 0.7;
  }

  const tokenSets = items.map(it => new Set(tokenize(it.content)));

  const topics = items.map(getTopic);
  const uniqueTopics = new Set(topics);
  const topicConsistency = uniqueTopics.size === 1 ? 1 : 1 / uniqueTopics.size;

  let totalJaccard = 0;
  let pairs = 0;
  for (let i = 0; i < tokenSets.length; i++) {
    for (let j = i + 1; j < tokenSets.length; j++) {
      const a = tokenSets[i] as Set<string>;
      const b = tokenSets[j] as Set<string>;
      if (a.size === 0 && b.size === 0) {
        totalJaccard += 1;
      } else {
        let intersection = 0;
        for (const tok of a) {
          if (b.has(tok)) {
            intersection++;
          }
        }
        const union = a.size + b.size - intersection;
        if (union === 0) {
          totalJaccard += 0;
        } else {
          totalJaccard += intersection / union;
        }
      }
      pairs++;
    }
  }
  const jaccardAvg = pairs === 0 ? 0.5 : totalJaccard / pairs;

  return Math.max(0, Math.min(1, topicConsistency * 0.6 + jaccardAvg * 0.4));
}

function summarizeGroup(items: MemoryItem[]): string {
  if (items.length === 0) {
    return '';
  }

  const seen = new Set<string>();
  const sentences: string[] = [];

  for (const item of items) {
    const content = item.content.trim();
    if (content.length === 0) {
      continue;
    }
    const firstSentenceMatch = /^[^.!?]+[.!?]?/m.exec(content);
    const rawSentence = firstSentenceMatch?.[0] ?? content;
    const sentence = rawSentence.trim().slice(0, 220);
    const key = sentence.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    sentences.push(sentence);
    if (sentences.length >= 3) {
      break;
    }
  }

  if (sentences.length === 0) {
    const fallback = items[0]?.content.trim().slice(0, 200) ?? '';
    return fallback;
  }

  if (sentences.length === 1) {
    const single = sentences[0];
    if (!single) {
      return '';
    }
    return single.slice(0, 280);
  }

  const combined = sentences.join(' ').replace(/\s+/g, ' ').trim();
  if (combined.length <= 300) {
    return combined;
  }
  return `${combined.slice(0, 297).trimEnd()}...`;
}

function sortByRecencyDesc(items: MemoryItem[]): MemoryItem[] {
  return [...items].sort((a, b) => {
    const aMs = parseTimestamp(a.timestamp).getTime();
    const bMs = parseTimestamp(b.timestamp).getTime();
    return bMs - aMs;
  });
}

// ── Core logic exported for testing ────────────────────────────────────────

export function groupByTopic(memories: MemoryItem[]): TopicGroup[] {
  if (!Array.isArray(memories) || memories.length === 0) {
    return [];
  }

  const buckets = new Map<string, MemoryItem[]>();

  for (const mem of memories) {
    if (!mem) {
      continue;
    }
    if (typeof mem.content !== 'string') {
      continue;
    }
    const topic = getTopic(mem);
    const list = buckets.get(topic);
    if (list) {
      list.push(mem);
    } else {
      buckets.set(topic, [mem]);
    }
  }

  const result: TopicGroup[] = [];
  for (const [key, items] of buckets) {
    result.push({ key, items: sortByRecencyDesc(items) });
  }

  result.sort((a, b) => {
    if (b.items.length !== a.items.length) {
      return b.items.length - a.items.length;
    }
    const aLatest = a.items[0] ? parseTimestamp(a.items[0].timestamp).getTime() : 0;
    const bLatest = b.items[0] ? parseTimestamp(b.items[0].timestamp).getTime() : 0;
    return bLatest - aLatest;
  });

  return result;
}

export function calculateConfidence(items: MemoryItem[], now: Date = new Date()): number {
  if (!Array.isArray(items) || items.length === 0) {
    return 0;
  }

  const sorted = sortByRecencyDesc(items);
  const latest = sorted[0];
  if (!latest) {
    return 0;
  }

  const latestMs = parseTimestamp(latest.timestamp).getTime();
  const nowMs = now.getTime();

  const recency = computeRecencyScore(latestMs, nowMs);
  const frequency = computeFrequencyScore(items.length);
  const consistency = computeConsistencyScore(items);

  const raw = recency * 0.4 + frequency * 0.3 + consistency * 0.3;
  return Math.round(Math.max(0, Math.min(1, raw)) * 1000) / 1000;
}

export function summarize(items: MemoryItem[]): string {
  return summarizeGroup(items);
}

// ── Factory ────────────────────────────────────────────────────────────────

export interface CrossSessionMemory {
  calculateConfidence(items: MemoryItem[], now?: Date): number;
  getCrossSessionInsights(scope: string): Promise<CrossSessionInsight[]>;
  groupByTopic(memories: MemoryItem[]): TopicGroup[];
  readonly name: string;
  start(): Promise<void>;
  readonly state: 'stopped' | 'running';
  stop(): Promise<void>;
  summarize(items: MemoryItem[]): string;
}

export function createCrossSessionMemory(
  deps: CrossSessionMemoryDeps,
  options: CrossSessionMemoryOptions = {}
): CrossSessionMemory {
  if (!deps.memory || typeof deps.memory.recall !== 'function') {
    throw new Error('CrossSessionMemory requires memory.recall');
  }

  const logger = deps.logger ?? createNoopLogger();
  const nowFn = deps.now ?? (() => new Date());
  const maxLimit = options.maxQueryLimit ?? DEFAULT_LIMIT;
  const minConfidence = options.minConfidence ?? 0;

  let _state: 'stopped' | 'running' = 'stopped';

  function ensureRunning(): void {
    if (_state !== 'running') {
      logger.debug('CrossSessionMemory not started, proceeding anyway');
    }
  }

  async function doGetInsights(scope: string): Promise<CrossSessionInsight[]> {
    validateScope(scope);
    ensureRunning();

    const now = nowFn();

    let memories: MemoryItem[];
    try {
      const result = deps.memory.recall({
        query: '*',
        scope,
        kind: 'semantic',
        limit: maxLimit
      });
      if (result instanceof Promise) {
        memories = await result;
      } else {
        memories = result;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('memory.recall failed', { scope, error: message });
      throw new Error(`Failed to recall memories for scope "${scope}": ${message}`);
    }

    if (!Array.isArray(memories)) {
      logger.warn('memory.recall returned non-array', { scope });
      memories = [];
    }

    if (memories.length === 0) {
      return [];
    }

    const grouped = groupByTopic(memories);

    const insights: CrossSessionInsight[] = [];

    for (const group of grouped) {
      const confidence = calculateConfidence(group.items, now);
      if (confidence < minConfidence) {
        continue;
      }

      const sorted = sortByRecencyDesc(group.items);
      if (sorted.length === 0) {
        continue;
      }
      const latest = sorted[0] as MemoryItem;
      const earliest = (sorted.at(-1) as MemoryItem) ?? latest;

      const latestDate = parseTimestamp(latest.timestamp);
      const earliestDate = parseTimestamp(earliest.timestamp);

      const sessionIds = [...new Set(sorted.map(getSessionId))].filter(id => id !== 'unknown');

      insights.push({
        topic: group.key,
        memoryCount: group.items.length,
        earliestMemory: earliestDate,
        latestMemory: latestDate,
        confidence,
        summary: summarizeGroup(group.items),
        sessionIds
      });
    }

    insights.sort((a, b) => {
      if (b.confidence !== a.confidence) {
        return b.confidence - a.confidence;
      }
      return b.latestMemory.getTime() - a.latestMemory.getTime();
    });

    logger.info('Cross-session insights computed', {
      scope,
      groups: grouped.length,
      insights: insights.length
    });

    return insights;
  }

  const manager: CrossSessionMemory = {
    name: 'cross-session-memory',

    get state() {
      return _state;
    },

    start(): Promise<void> {
      _state = 'running';
      logger.info('CrossSessionMemory started');
      return Promise.resolve();
    },

    stop(): Promise<void> {
      _state = 'stopped';
      logger.info('CrossSessionMemory stopped');
      return Promise.resolve();
    },

    getCrossSessionInsights(scope: string): Promise<CrossSessionInsight[]> {
      return doGetInsights(scope);
    },

    groupByTopic(mems: MemoryItem[]): TopicGroup[] {
      return groupByTopic(mems);
    },

    calculateConfidence(items: MemoryItem[], now?: Date): number {
      if (now) {
        return calculateConfidence(items, now);
      }
      return calculateConfidence(items, nowFn());
    },

    summarize(items: MemoryItem[]): string {
      return summarizeGroup(items);
    }
  };

  return manager;
}

// ── Class wrapper for compatibility ────────────────────────────────────────

export class CrossSessionMemoryService implements CrossSessionMemory {
  readonly #inner: CrossSessionMemory;
  readonly name = 'cross-session-memory';

  constructor(deps: CrossSessionMemoryDeps, options: CrossSessionMemoryOptions = {}) {
    this.#inner = createCrossSessionMemory(deps, options);
  }

  get state(): 'stopped' | 'running' {
    return this.#inner.state;
  }

  async start(): Promise<void> {
    await this.#inner.start();
  }

  async stop(): Promise<void> {
    await this.#inner.stop();
  }

  getCrossSessionInsights(scope: string): Promise<CrossSessionInsight[]> {
    return this.#inner.getCrossSessionInsights(scope);
  }

  groupByTopic(memories: MemoryItem[]): TopicGroup[] {
    return this.#inner.groupByTopic(memories);
  }

  calculateConfidence(items: MemoryItem[], now?: Date): number {
    return this.#inner.calculateConfidence(items, now);
  }

  summarize(items: MemoryItem[]): string {
    return this.#inner.summarize(items);
  }
}
