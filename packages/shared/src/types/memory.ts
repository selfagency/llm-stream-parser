/**
 * Memory storage types.
 */

import type { MemoryId } from './brands.js';

/**
 * Memory record with content and metadata.
 */
export interface MemoryRecord {
  /** Stored content. */
  content: string;

  /** Timestamp when record was created. */
  createdAt?: number;
  /** Memory identifier. */
  id: MemoryId;

  /** Optional metadata. */
  metadata?: Record<string, unknown>;

  /** Timestamp when record was last updated. */
  updatedAt?: number;
}

/**
 * Memory store interface for persistence.
 */
export interface MemoryStore {
  /** Remove a memory record. */
  delete(id: MemoryId): void;

  /** Retrieve a memory record by ID. */
  get(id: MemoryId): MemoryRecord | undefined;

  /** List all memory records. */
  list(): MemoryRecord[];
  /** Store a memory record. */
  put(record: MemoryRecord): void;

  /** Search memory records by query. */
  search(query: string): MemoryRecord[];
}

/**
 * Single entry in the agent virtual filesystem.
 */
export interface AgentFsEntry {
  /** UTF-8 string content. */
  readonly content: string;
  /** SHA-256 hash of the content. */
  readonly contentHash: string;
  /** Unix timestamp (ms) when created. */
  readonly createdAt: number;
  /** Full path including filename. */
  readonly path: string;
  /** Unix timestamp (ms) when last updated. */
  readonly updatedAt: number;
}

/**
 * Options for creating an AgentFS manager.
 */
export interface AgentFsOptions {
  /** Optional namespace for isolating filesystems. */
  readonly namespace?: string;
}

/**
 * Management interface for the agent virtual filesystem.
 */
export interface AgentFsManager {
  /** Remove all entries. */
  clear(): void;
  /** Delete a path from the filesystem. */
  delete(path: string): boolean;
  /** Check if a path exists. */
  has(path: string): boolean;
  /** Bulk import existing entries, preserving timestamps. */
  import(entries: AgentFsEntry[]): void;
  /** List all entries in the filesystem. */
  list(): AgentFsEntry[];
  /** Current namespace. */
  readonly namespace: string;
  /** Read an entry by its path. */
  read(path: string): AgentFsEntry | undefined;
  /** Write content to a path, creating or updating the entry. */
  write(path: string, content: string): AgentFsEntry;
}
