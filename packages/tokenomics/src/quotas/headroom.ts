/**
 * Replica-level budget and headroom types for quota-aware routing.
 *
 * These types extend the existing `TokenBudget`/`TokenUsage` system
 * with replica and account identity, enabling gateway to make
 * per-replica routing decisions based on remaining quota.
 */

import type { TokenUsage } from '../token-manager.js';

// =============================================================================
// Extended usage identity — optional fields on existing TokenUsage
// =============================================================================

/**
 * Extends the base `TokenUsage` with replica-level routing context.
 * These fields are optional — existing call sites that don't use
 * replica routing are unaffected.
 */
export interface ReplicaUsageFields {
  accountId?: string;
  logicalModelId?: string;
  providerId?: string;
  replicaId?: string;
}

export type ReplicaAwareUsage = TokenUsage & ReplicaUsageFields;

// =============================================================================
// Replica budget
// =============================================================================

/** Minute in milliseconds. */
export const MINUTE_MS = 60_000;

export interface ReplicaBudget {
  accountId?: string;
  logicalModelId: string;
  maxCostHour?: number;
  maxCostMinute?: number;
  maxCostMonth?: number;
  maxCostWeek?: number;
  maxRequestsMinute?: number;
  maxTokensHour?: number;
  maxTokensMinute?: number;
  maxTokensMonth?: number;
  maxTokensWeek?: number;
  providerId: string;
  replicaId: string;
}

// =============================================================================
// Headroom snapshot — what remains for routing decisions
// =============================================================================

export type HeadroomConfidence = 'header-derived' | 'tokenomics-derived' | 'estimated';

export interface ReplicaHeadroomSnapshot {
  confidence: HeadroomConfidence;
  lastUpdatedAt: string;
  logicalModelId: string;
  providerId: string;
  remainingCostHour?: number;
  remainingCostMinute?: number;
  remainingCostMonth?: number;
  remainingCostWeek?: number;
  remainingRequestsMinute?: number;
  remainingTokensHour?: number;
  remainingTokensMinute?: number;
  remainingTokensMonth?: number;
  remainingTokensWeek?: number;
  replicaId: string;
}

// =============================================================================
// Window algebra
// =============================================================================

export function alignToHour(date: Date): Date {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d;
}

export function alignToWeek(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

export function alignToMonth(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export const HOUR_MS = 3_600_000;
export const WEEK_MS = 7 * 24 * HOUR_MS;
export const MONTH_MS = 30 * 24 * HOUR_MS;

// =============================================================================
// Headroom percentage helper — 0-100 score for routing
// =============================================================================

/**
 * Compute a 0-100 headroom percentage from remaining vs max.
 * Returns 0 when max is zero or negative; clamps result to [0, 100].
 */
export function computeHeadroomPercentage(remaining: number, max: number): number {
  if (max <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round((remaining / max) * 100)));
}
