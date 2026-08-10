import { describe, expect, it } from 'vitest';
import { isSkillShadowed, resolveScopedSkills } from './scope.js';

describe('resolveScopedSkills', () => {
  const projectSkill = { name: 'typescript', description: 'TS skill', path: '/project/.agents' } as const;
  const globalSkill = { name: 'docker', description: 'Docker skill', path: '/home/user/.agents' } as const;

  it('resolves project skills before global skills', () => {
    const resolved = resolveScopedSkills([projectSkill], [globalSkill]);
    expect(resolved).toHaveLength(2);
    expect(resolved[0]?.name).toBe('typescript');
    expect(resolved[0]?.scope).toBe('project');
    expect(resolved[1]?.name).toBe('docker');
    expect(resolved[1]?.scope).toBe('global');
  });

  it('project skill shadows global skill with same name', () => {
    const sameNameGlobal = { name: 'typescript', description: 'Global TS', path: '/home/user/.agents' } as const;
    const resolved = resolveScopedSkills([projectSkill], [sameNameGlobal]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.name).toBe('typescript');
    expect(resolved[0]?.scope).toBe('project');
  });

  it('handles empty project or global lists', () => {
    const onlyGlobal = resolveScopedSkills([], [globalSkill]);
    expect(onlyGlobal).toHaveLength(1);
    expect(onlyGlobal[0]?.scope).toBe('global');

    const onlyProject = resolveScopedSkills([projectSkill], []);
    expect(onlyProject).toHaveLength(1);
    expect(onlyProject[0]?.scope).toBe('project');
  });

  it('detects shadowed skills', () => {
    expect(isSkillShadowed('typescript', [projectSkill])).toBe(true);
    expect(isSkillShadowed('docker', [projectSkill])).toBe(false);
  });
});
