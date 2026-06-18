

## 13. Phase 8 — Learning Loop & Background Jobs

**Priority**: P2 — Sprint 4
**Story points**: 3
**Branch**: `feat/learning-loop`
**Depends on**: Phase 7 (learning loop consumes retrieval results)
**Unblocks**: Phase 15 (bootstrap needs the event bus)
**Closes**: nothing from the gap analysis; infrastructure for the learning loop

### 13.1 Current State

The learning loop runs as a foreground job that blocks the CLI. There's no background execution, no event-driven triggers, and no way to schedule learning jobs.

### 13.2 New Design: Background + Event-Driven

The learning loop runs as a daemon background job on a configurable schedule AND is triggered by specific events (canary detection, observation threshold).

**Triggers**:
- **Timer-based**: Bree-scheduled job, default every 1 hour.
- **Canary detection**: when a memory item is flagged as a "canary" (anomalous pattern), trigger learning immediately.
- **Observation threshold**: when the count of unprocessed `kind: 'event'` memory items exceeds a threshold (default 100), trigger learning.

**Learning job**:
1. Read unprocessed `kind: 'event'` memory items.
2. Run the consolidation LLM call (summarize events into `kind: 'semantic'` items).
3. Index the new semantic items via `RetrievalService.indexNewContent` (Phase 7).
4. Mark the events as processed.

### 13.3 Event Bus

```typescript
// packages/daemon/src/events/event-bus.ts (NEW)

export interface EventBus {
  publish(event: DaemonEvent): void;
  subscribe(eventType: string, handler: (event: DaemonEvent) => Promise<void>): () => void;
}

export class HonkerEventBus implements EventBus {
  constructor(private honker: HonkerDB) {
    // Uses Honker's NOTIFY/LISTEN for cross-process wake
  }

  publish(event: DaemonEvent): void {
    this.honker.queue('events').enqueue(JSON.stringify(event));
  }

  subscribe(eventType: string, handler: (event: DaemonEvent) => Promise<void>): () => void {
    const consumer = this.honker.queue('events').consumer(`events-${eventType}`);
    consumer.subscribe(async (msg) => {
      const event = JSON.parse(msg) as DaemonEvent;
      if (event.type === eventType) {
        await handler(event);
      }
    });
    return () => consumer.unsubscribe();
  }
}
```

### 13.4 Learning Job

```typescript
// packages/daemon/src/jobs/learning-job.ts

export class LearningJob {
  constructor(
    private db: UnifiedDB,
    private retrieval: RetrievalService,
    private llm: UniversalClient,
    private eventBus: EventBus,
  ) {
    // Subscribe to canary and observation events
    this.eventBus.subscribe('memory.canary', () => this.run());
    this.eventBus.subscribe('memory.observation-threshold', () => this.run());
  }

  async run(): Promise<void> {
    const events = await this.db.query(
      `SELECT * FROM memory_items WHERE kind = 'event' AND processed_at IS NULL
       ORDER BY created_at ASC LIMIT 500`
    );

    if (events.length === 0) return;

    // Consolidate events into semantic items
    const consolidated = await this.llm.complete({
      messages: [
        { role: 'system', content: CONSOLIDATION_PROMPT },
        { role: 'user', content: JSON.stringify(events) },
      ],
      responseFormat: { type: 'json_schema', schema: SEMANTIC_ITEMS_SCHEMA },
    });

    const semanticItems = JSON.parse(consolidated) as MemoryItem[];

    // Insert semantic items
    for (const item of semanticItems) {
      await this.db.execute(
        'INSERT INTO memory_items (id, scope, kind, content, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [randomUUID(), item.scope, 'semantic', item.content, JSON.stringify(item.metadata), new Date().toISOString()]
      );
    }

    // Mark events as processed
    for (const event of events) {
      await this.db.execute(
        'UPDATE memory_items SET processed_at = ? WHERE id = ?',
        [new Date().toISOString(), event.id]
      );
    }

    // Index new semantic items via Phase 7 RetrievalService
    await this.retrieval.indexNewContent();
  }
}
```

### 13.5 Tests

- Unit: `LearningJob.run` consolidates events into semantic items and marks events as processed.
- Unit: event bus publishes and subscribes across processes (using Honker NOTIFY/LISTEN).
- Integration: canary event triggers learning job immediately.

### 13.6 Verification

- [ ] `LearningJob` runs as a Bree-scheduled job
- [ ] Event bus uses Honker NOTIFY/LISTEN for cross-process wake
- [ ] Canary and observation events trigger learning immediately
- [ ] `pnpm check-types && pnpm lint && pnpm test` green

---


