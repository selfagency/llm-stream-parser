/**
 * Model-tier routing adapter for the orchestrator.
 *
 * Re-exports from `gateway-backed-router.ts` for backward compatibility.
 * All new code should import directly from `gateway-backed-router.js`.
 *
 * Architecture decision (2026-06-15):
 *   - The canonical implementation lives in `gateway-backed-router.ts`
 *   - This file is a re-export barrel to preserve existing imports
 */

export type { TaskTier } from '../types/routing.js';
export {
  DEFAULT_ESCALATION_POLICY,
  type EscalationPolicy,
  GatewayBackedModelRouter,
  NO_ESCALATION_POLICY,
  type SelectionRecord,
  type TierAwareModelRouter,
  type TierAwareModelRouterOptions
} from './gateway-backed-router.js';
