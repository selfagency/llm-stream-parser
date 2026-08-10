/**
 * Multi-Root Workspace — manages multiple project roots scanned independently
 * and merged into a single composite ProjectProfile.
 *
 * @module
 */

import type { ProjectProfile } from './scanner.js';
import { scanProject } from './scanner.js';

// ── Types ───────────────────────────────────────────────

export interface WorkspaceConfig {
  mergedProfile?: ProjectProfile;
  roots: string[];
}

// ── Helpers ─────────────────────────────────────────────

function deduplicate<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function majorityVote<T extends string>(items: T[]): T {
  const counts = new Map<T, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  let best: T = items[0] as T;
  let bestCount = 0;
  for (const [item, count] of counts) {
    if (count > bestCount) {
      best = item;
      bestCount = count;
    }
  }
  return best;
}

function _unionArrays<T>(...arrays: T[][]): T[] {
  const seen = new Set<T>();
  const result: T[] = [];
  for (const arr of arrays) {
    for (const item of arr) {
      if (!seen.has(item)) {
        seen.add(item);
        result.push(item);
      }
    }
  }
  return result;
}

// ── Workspace Manager ───────────────────────────────────

export class WorkspaceManager {
  private roots: string[] = [];

  addRoot(rootPath: string): void {
    const normalized = rootPath.replace(/\/+$/, '');
    if (!this.roots.includes(normalized)) {
      this.roots.push(normalized);
    }
  }

  removeRoot(rootPath: string): void {
    const normalized = rootPath.replace(/\/+$/, '');
    this.roots = this.roots.filter(r => r !== normalized);
  }

  listRoots(): readonly string[] {
    return [...this.roots];
  }

  async mergeProfiles(): Promise<ProjectProfile> {
    if (this.roots.length === 0) {
      throw new Error('No roots configured — cannot merge profiles');
    }

    const profiles = await Promise.all(this.roots.map(root => scanProject(root)));

    return this.mergeProfileArray(profiles);
  }

  /** Merge an array of profiles into a single composite profile. */
  mergeProfileArray(profiles: ProjectProfile[]): ProjectProfile {
    if (profiles.length === 0) {
      throw new Error('At least one profile is required to merge');
    }

    if (profiles.length === 1) {
      return profiles[0] as ProjectProfile;
    }

    const languages = deduplicate(profiles.flatMap(p => p.languages));
    const frameworks = deduplicate(profiles.flatMap(p => p.frameworks));
    const linter = deduplicate(profiles.flatMap(p => p.linter));
    const testRunner = deduplicate(profiles.flatMap(p => p.testRunner));
    const ci = deduplicate(profiles.flatMap(p => p.ci));
    const deploymentTarget = deduplicate(profiles.flatMap(p => p.deploymentTarget));

    const packageManager = majorityVote(profiles.map(p => p.packageManager));
    const buildSystem = majorityVote(profiles.map(p => p.buildSystem));
    const monorepo = profiles.some(p => p.monorepo);

    const monorepoTool = monorepo
      ? majorityVote(
          profiles
            .filter(
              (p): p is typeof p & { monorepoTool: NonNullable<ProjectProfile['monorepoTool']> } =>
                p.monorepo && p.monorepoTool !== undefined
            )
            .map(p => p.monorepoTool)
        )
      : undefined;

    return {
      rootPath: profiles[0]?.rootPath ?? '',
      languages,
      frameworks,
      packageManager,
      buildSystem,
      linter,
      testRunner,
      monorepo,
      ...(monorepoTool === undefined ? {} : { monorepoTool }),
      ci,
      deploymentTarget,
      detectedAt: new Date().toISOString()
    };
  }
}
