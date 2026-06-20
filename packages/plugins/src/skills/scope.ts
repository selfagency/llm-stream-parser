/**
 * SkillScopeManager — manages project vs global skill scope resolution.
 *
 * Scope model:
 * - Project scope: skills committed in the repo under `.agents/skills/`
 * - Global scope: user-wide skills under `~/.agents/skills/`
 *
 * Resolution order:
 * 1. Project skill (shadows global with same name)
 * 2. Global skill
 * 3. XDG config/data roots
 * 4. Bundled built-ins
 *
 * @module @agentsy/plugins/skills
 */

import type { SkillMetadata } from './manifest.js';

/** Scope a skill is installed in. */
export type SkillScope = 'project' | 'global';

export type SkillSource = 'registry' | 'local' | 'bundled';

/** A skill entry with resolved scope. */
export interface ScopedSkill extends SkillMetadata {
  readonly filePath: string;
  readonly scope: SkillScope;
  readonly source: SkillSource;
}

/**
 * Skill lockfile entry for reproducible installs.
 */
export interface LockfileSkillEntry {
  readonly bundleHash?: string;
  readonly files: readonly string[];
  readonly name: string;
  readonly scope: SkillScope;
  readonly source: SkillSource;
}

/**
 * Lockfile format for reproducible installs.
 */
export interface SkillLockfile {
  readonly installedAt: string;
  readonly skills: readonly LockfileSkillEntry[];
  readonly version: number;
}

/**
 * Manages skill scope resolution — project skills shadow global skills.
 *
 * Merges skills from multiple discovery roots with scope metadata.
 */
/**
 * Resolve scoped skills from a flat list of discovered skills.
 *
 * Skills are ordered by scope priority (project first, then global),
 * with project skills shadowing globals by name.
 */
export function resolveScopedSkills(
  projectSkills: SkillMetadata[],
  globalSkills: SkillMetadata[],
  projectRoot?: string,
  globalRoot?: string
): ScopedSkill[] {
  const globalNames = new Set(globalSkills.map(s => s.name));
  const result: ScopedSkill[] = [];

  for (const skill of projectSkills) {
    result.push({
      ...skill,
      scope: 'project',
      source: 'local',
      filePath: projectRoot ?? ''
    });
    globalNames.delete(skill.name);
  }

  for (const skill of globalSkills) {
    if (!globalNames.has(skill.name)) {
      continue;
    }
    result.push({
      ...skill,
      scope: 'global',
      source: 'local',
      filePath: globalRoot ?? ''
    });
  }

  return result;
}

/**
 * Create a lockfile entry for a skill.
 */
export function skillToLockfileEntry(skill: ScopedSkill, bundleHash?: string): LockfileSkillEntry {
  return {
    name: skill.name,
    scope: skill.scope,
    source: skill.source,
    ...(bundleHash ? { bundleHash } : {}),
    files: []
  };
}

/**
 * Check whether a project skill exists that shadows a global one.
 */
export function isSkillShadowed(name: string, projectSkills: SkillMetadata[]): boolean {
  return projectSkills.some(s => s.name === name);
}
