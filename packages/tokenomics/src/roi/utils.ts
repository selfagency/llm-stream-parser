/**
 * Shared ROI utility functions.
 *
 * @module roi/utils
 */

/**
 * Compute the average 30-day survival rate across a set of ledger entries.
 * Entries with a `null` survival rate (not yet calculable) are filtered out.
 *
 * Returns `0` when no entries have survival data.
 */
export function computeAverageSurvivalRate(entries: { survivalRate30d: number | null }[]): number {
  const survivalRates = entries.map(e => e.survivalRate30d).filter((r): r is number => r !== null);
  return survivalRates.length > 0 ? survivalRates.reduce((sum, r) => sum + r, 0) / survivalRates.length : 0;
}
