/**
 * Logger Implementation
 *
 * Structured logger with multiple severity levels
 */

import type { Logger } from '../core/types.js';

export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

/**
 * Logger configuration
 */
export interface LoggerConfig {
  /** Whether to include timestamps */
  includeTimestamp?: boolean;
  /** Optional custom log level names */
  levelNames?: Record<LogLevel, string>;
  /** Minimum log level to output */
  minLevel?: LogLevel;
}

/**
 * Log entry with metadata
 */
export interface LogEntry {
  attributes?: Record<string, unknown>;
  error?: unknown;
  level: LogLevel;
  levelName: string;
  message: string;
  timestamp: number;
}

/**
 * Logger implementation
 */
export class LoggerImpl implements Logger {
  private readonly config: Required<LoggerConfig>;
  private _buffer: LogEntry[] = [];
  private readonly DEFAULT_LEVEL_NAMES: Record<LogLevel, string> = {
    [LogLevel.DEBUG]: 'DEBUG',
    [LogLevel.INFO]: 'INFO',
    [LogLevel.WARN]: 'WARN',
    [LogLevel.ERROR]: 'ERROR'
  };

  // fallow-ignore-next-line complexity — config merging with multiple optional fields
  constructor(config?: LoggerConfig) {
    this.config = {
      includeTimestamp: config?.includeTimestamp ?? true,
      levelNames: { ...this.DEFAULT_LEVEL_NAMES, ...config?.levelNames },
      minLevel: config?.minLevel ?? LogLevel.INFO
    };
  }

  info(message: string, attributes?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, attributes);
  }

  debug(message: string, attributes?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, attributes);
  }

  warn(message: string, attributes?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, attributes);
  }

  error(message: string, attributes?: Record<string, unknown>, error?: unknown): void {
    this.log(LogLevel.ERROR, message, attributes, error);
  }

  // fallow-ignore-next-line complexity — log routing with level check and conditional output
  private log(level: LogLevel, message: string, attributes?: Record<string, unknown>, error?: unknown): void {
    if (level < this.config.minLevel) {
      return; // Below minimum level, skip
    }

    const levelName = this.config.levelNames[level] ?? this.DEFAULT_LEVEL_NAMES[level];
    const timestamp = this.config.includeTimestamp ? Date.now() : 0;

    const entry: LogEntry = {
      level,
      levelName,
      message,
      timestamp
    };

    if (attributes) {
      entry.attributes = attributes;
    }
    if (error) {
      entry.error = error;
    }

    this._buffer.push(entry);

    // For now, just output to console
    const timestampStr = this.config.includeTimestamp ? new Date(timestamp).toISOString() : '';
    const prefix = levelName.padEnd(5);
    const suffix = timestampStr ? ` ${timestampStr}` : '';
    const logPrefix = `[${prefix}${suffix}]`;
    console.log(logPrefix, message, attributes ?? '', entry.error ?? '');
  }

  /**
   * Flush all buffered log entries to configured sinks
   */
  flush(): LogEntry[] {
    const entries = [...this._buffer];
    this._buffer = [];
    return entries;
  }

  /**
   * Get all buffered log entries without flushing
   */
  getBufferedEntries(): LogEntry[] {
    return [...this._buffer];
  }
}
