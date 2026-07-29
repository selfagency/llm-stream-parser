import type { Message } from './state/schema.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single entry in the session tree. */
export interface SessionEntry {
  createdAt: string;
  id: string;
  messages: Message[];
  parentId: string | null;
  summary?: string;
}

/** A node in the hierarchical tree representation, used for /tree navigation. */
export interface SessionTreeNode {
  children: SessionTreeNode[];
  entry: SessionEntry;
}

// ---------------------------------------------------------------------------
// SessionTree
// ---------------------------------------------------------------------------

/**
 * Tree structure for session entries with fork/clone/summarize support.
 *
 * Entries form a forest where each root (parentId === null) represents either
 * an original session or a fork point. `fork` creates a new root that inherits
 * all messages from its source ancestor chain. `clone` duplicates a subtree
 * under a new identity. `summarizeLongRunning` flags entries whose message
 * count or ancestor depth exceeds a threshold.
 */
export class SessionTree {
  private readonly entries: SessionEntry[] = [];
  private nextId = 1;

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Add a new session entry.
   * When `parentId` is omitted or undefined, the entry becomes a root.
   * When `parentId` is provided, the entry becomes a child of that parent.
   */
  addEntry(messages: Message[], parentId?: string): SessionEntry {
    if (parentId !== undefined) {
      this.assertEntryExists(parentId);
    }

    const entry: SessionEntry = {
      id: this.generateId(),
      parentId: parentId ?? null,
      messages: [...messages],
      createdAt: new Date().toISOString()
    };
    this.entries.push(entry);
    return this.cloneEntry(entry);
  }

  /**
   * Create a new root branch from any existing entry.
   * The new entry collects all messages from the source entry and every
   * ancestor up to the root, preserving chronological order.
   * The returned entry has parentId === null (it is a new root).
   */
  fork(fromEntryId: string): SessionEntry {
    const source = this.findEntry(fromEntryId);
    const allMessages = this.collectAncestorMessages(source);

    const entry: SessionEntry = {
      id: this.generateId(),
      parentId: null,
      messages: allMessages,
      createdAt: new Date().toISOString()
    };
    this.entries.push(entry);
    return this.cloneEntry(entry);
  }

  /**
   * Clone an entry and every descendant in its subtree.
   * Each cloned entry gets a new id; parentId references between cloned
   * entries are remapped so the cloned subtree mirrors the original shape.
   * Returns the cloned entries in breadth-first order (root first).
   */
  clone(branchEntryId: string): SessionEntry[] {
    const source = this.findEntry(branchEntryId);
    const descendants = this.collectDescendants(source);
    const allToClone = [source, ...descendants];

    // Assign new IDs before creating entries to resolve parent references
    const idMap = new Map<string, string>();
    for (const entry of allToClone) {
      idMap.set(entry.id, this.generateId());
    }

    const cloned: SessionEntry[] = [];
    for (const entry of allToClone) {
      const newId = this.idMapGet(idMap, entry.id);
      const newParentId = entry.parentId ? (idMap.get(entry.parentId) ?? null) : null;

      const clonedEntry: SessionEntry = {
        id: newId,
        parentId: newParentId,
        messages: [...entry.messages],
        ...(entry.summary === undefined ? {} : { summary: entry.summary }),
        createdAt: new Date().toISOString()
      };
      cloned.push(clonedEntry);
      this.entries.push(clonedEntry);
    }

    return cloned.map(e => this.cloneEntry(e));
  }

  /**
   * Return the session forest as a hierarchical tree structure.
   * Every root entry becomes a top-level tree node with nested children.
   */
  getTree(): SessionTreeNode[] {
    const roots = this.entries.filter(e => e.parentId === null);
    return roots.map(root => this.buildTreeNode(root));
  }

  /**
   * Return entries that need summarization.
   * An entry qualifies when its message count or its depth from the
   * nearest root meets or exceeds `threshold`.
   */
  summarizeLongRunning(threshold: number): SessionEntry[] {
    return this.entries.filter(entry => {
      if (entry.messages.length >= threshold) {
        return true;
      }
      return this.computeDepth(entry) >= threshold;
    });
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private generateId(): string {
    const id = `entry_${this.nextId}`;
    this.nextId++;
    return id;
  }

  private findEntry(id: string): SessionEntry {
    const entry = this.entries.find(e => e.id === id);
    if (!entry) {
      throw new Error(`Entry ${id} not found`);
    }
    return entry;
  }

  private assertEntryExists(id: string): void {
    this.findEntry(id);
  }

  private cloneEntry(entry: SessionEntry): SessionEntry {
    return { ...entry, messages: [...entry.messages] };
  }

  /** Walk up the parent chain, collect every root-to-entry message in order. */
  private collectAncestorMessages(entry: SessionEntry): Message[] {
    const chain: SessionEntry[] = [];
    let current: SessionEntry | undefined = entry;

    // Walk up, prepend so root messages come first
    while (current) {
      chain.unshift(current);
      const entryParentId: string | null = current.parentId;
      current = entryParentId ? (this.entries.find(e => e.id === entryParentId) ?? undefined) : undefined;
    }

    const result: Message[] = [];
    for (const e of chain) {
      result.push(...e.messages);
    }
    return result;
  }

  /** Recursively collect all descendants (children, grandchildren, etc.). */
  private collectDescendants(entry: SessionEntry): SessionEntry[] {
    const result: SessionEntry[] = [];
    const children = this.entries.filter(e => e.parentId === entry.id);
    for (const child of children) {
      result.push(child);
      result.push(...this.collectDescendants(child));
    }
    return result;
  }

  /** Compute the depth of an entry (0 for root, 1 for its child, etc.). */
  private computeDepth(entry: SessionEntry): number {
    let depth = 0;
    let current: SessionEntry | undefined = entry;
    while (current !== undefined) {
      if (!current.parentId) {
        break;
      }
      depth++;
      const entryId: string | null = current.parentId;
      current = this.entries.find(e => e.id === entryId) ?? undefined;
    }
    return depth;
  }

  /** Build a tree node recursively. */
  private buildTreeNode(entry: SessionEntry): SessionTreeNode {
    const children = this.entries.filter(e => e.parentId === entry.id).map(child => this.buildTreeNode(child));

    return {
      entry: this.cloneEntry(entry),
      children
    };
  }

  /** Safe Map#get with a non-null assertion (idMap always contains the key). */
  private idMapGet(map: Map<string, string>, key: string): string {
    const value = map.get(key);
    if (value === undefined) {
      throw new Error(`Internal: missing id mapping for ${key}`);
    }
    return value;
  }
}
