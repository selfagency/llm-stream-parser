/**
 * Health bridge — wraps AFT's `aft_inspect` as a health check source.
 *
 * Feeds diagnostic data (LSP errors, unused exports, complexity hotspots)
 * into the observability metrics pipeline.
 *
 * @module @agentsy/observability/cortexkit
 */

import { getAftSessionBridge } from '@agentsy/shared';

export interface HealthReport {
  complexity: number;
  deadCode: number;
  diagnostics: number;
  timestamp: string;
  unusedExports: number;
}

/**
 * Create a health bridge that polls AFT diagnostics for a project root.
 *
 * @param projectRoot - Project root directory to inspect
 */
export function createHealthBridge(projectRoot: string) {
  return {
    /**
     * Run a full health check via `aft_inspect` and return structured results.
     */
    // fallow-ignore-next-line complexity — health check routing with multiple sections
    async check(): Promise<HealthReport> {
      const bridge = await getAftSessionBridge({ projectRoot });

      const result = await bridge.send('inspect', {
        scope: projectRoot,
        sections: ['diagnostics', 'dead_code', 'unused_exports']
      });

      const data = result ?? {};

      return {
        complexity: 0,
        deadCode: Array.isArray(data.deadCode) ? data.deadCode.length : 0,
        diagnostics: Array.isArray(data.diagnostics) ? data.diagnostics.length : 0,
        unusedExports: Array.isArray(data.unusedExports) ? data.unusedExports.length : 0,
        timestamp: new Date().toISOString()
      };
    },

    /**
     * Quick connectivity check — verifies the AFT binary responds.
     */
    async ping(): Promise<boolean> {
      try {
        const bridge = await getAftSessionBridge({ projectRoot });
        await bridge.send('ping');
        return true;
      } catch {
        return false;
      }
    }
  };
}
