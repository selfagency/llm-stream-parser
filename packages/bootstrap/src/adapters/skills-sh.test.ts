import { afterEach, describe, expect, it, vi } from 'vitest';
import { audit, createSkillsShAdapter, curated } from './skills-sh.js';

// ── Fixtures ──────────────────────────────────────────────

const LIST_FIXTURE = {
  skills: [
    {
      id: 'skill-ts',
      name: 'TypeScript Patterns',
      description: 'Advanced TypeScript patterns',
      contentHash: 'a1b2c3d4'
    },
    { id: 'skill-react', name: 'React Hooks', description: 'React hooks deep dive', contentHash: 'e5f6g7h8' },
    {
      id: 'skill-node',
      name: 'Node.js Best Practices',
      description: 'Production Node.js patterns',
      contentHash: 'i9j0k1l2'
    }
  ],
  total: 3
};

const SEARCH_FIXTURE = {
  results: [{ id: 'skill-react', name: 'React Hooks', description: 'React hooks deep dive', contentHash: 'e5f6g7h8' }],
  total: 1,
  query: 'react'
};

const CURATED_FIXTURE = {
  sections: [
    {
      name: 'Frontend',
      skills: [
        { id: 'skill-react', name: 'React Hooks', description: 'React hooks deep dive', contentHash: 'e5f6g7h8' }
      ]
    },
    {
      name: 'Backend',
      skills: [
        {
          id: 'skill-node',
          name: 'Node.js Best Practices',
          description: 'Production Node.js patterns',
          contentHash: 'i9j0k1l2'
        }
      ]
    }
  ]
};

const DETAIL_FIXTURE = {
  skill: {
    id: 'skill-ts',
    name: 'TypeScript Patterns',
    description: 'Advanced TypeScript patterns',
    contentHash: 'a1b2c3d4'
  },
  readme: '# TypeScript Patterns\n...'
};

const AUDIT_FIXTURE = {
  skillId: 'skill-ts',
  passed: true,
  issues: []
};

// ── Mock fetch factory ───────────────────────────────────

function createMockFetch(fixtures: Record<string, unknown>) {
  return vi.fn((url: string | URL | Request) => {
    const urlStr = url.toString();

    for (const [pattern, data] of Object.entries(fixtures)) {
      if (urlStr.includes(pattern)) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => data
        } as Response;
      }
    }

    return {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => ({ error: 'not found' })
    } as Response;
  });
}

// ── Tests ─────────────────────────────────────────────────

describe('SkillsShAdapter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('list', () => {
    it('should return all skills as registry entries', async () => {
      const mockFetch = createMockFetch({ '/list': LIST_FIXTURE });
      const adapter = createSkillsShAdapter({ fetch: mockFetch });
      const entries = await adapter.list();

      expect(entries).toHaveLength(3);
      expect(entries[0]?.id).toBe('skill-ts');
      expect(entries[0]?.version).toBe('a1b2c3d4');
      expect(entries[1]?.source).toBe('skills.sh');
    });

    it('should throw on invalid response format', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ notSkills: true })
      } as Response);

      const adapter = createSkillsShAdapter({ fetch: mockFetch });
      await expect(adapter.list()).rejects.toThrow('invalid list response');
    });

    it('should include auth token in request headers', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => LIST_FIXTURE
      } as Response);

      const adapter = createSkillsShAdapter({ fetch: mockFetch, token: 'test-token' });
      await adapter.list();

      const callHeaders = mockFetch.mock.calls[0]?.[1] as RequestInit | undefined;
      const headers = callHeaders?.headers as Record<string, string> | undefined;
      expect(headers?.Authorization).toBe('Bearer test-token');
    });
  });

  describe('search', () => {
    it('should return matching skills', async () => {
      const mockFetch = createMockFetch({ '/search': SEARCH_FIXTURE });
      const adapter = createSkillsShAdapter({ fetch: mockFetch });
      const results = await adapter.search('react');

      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe('skill-react');
    });

    it('should encode query parameter', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => SEARCH_FIXTURE
      } as Response);

      const adapter = createSkillsShAdapter({ fetch: mockFetch });
      await adapter.search('react hooks');

      const callUrl = mockFetch.mock.calls[0]?.[0]?.toString() ?? '';
      expect(callUrl).toContain('q=react%20hooks');
    });
  });

  describe('get', () => {
    it('should return a skill by id', async () => {
      const mockFetch = createMockFetch({ '/detail': DETAIL_FIXTURE });
      const adapter = createSkillsShAdapter({ fetch: mockFetch });
      const entry = await adapter.get('skill-ts');

      expect(entry).not.toBeNull();
      expect(entry?.name).toBe('TypeScript Patterns');
    });

    it('should return null for missing skill', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({ error: 'not found' })
      } as Response);

      const adapter = createSkillsShAdapter({ fetch: mockFetch });
      const entry = await adapter.get('non-existent');
      expect(entry).toBeNull();
    });
  });

  describe('adapter name', () => {
    it('should expose the adapter name', () => {
      const mockFetch = createMockFetch({});
      const adapter = createSkillsShAdapter({ fetch: mockFetch });
      expect(adapter.name).toBe('skills-sh');
    });
  });

  describe('curated (extra endpoint)', () => {
    it('should return curated sections', async () => {
      const mockFetch = createMockFetch({ '/curated': CURATED_FIXTURE });
      const adapter = createSkillsShAdapter({ fetch: mockFetch });
      const sections = await curated(adapter, { fetch: mockFetch });

      expect(sections).toHaveLength(2);
      expect(sections[0]?.name).toBe('Frontend');
      expect(sections[0]?.skills).toHaveLength(1);
      expect(sections[1]?.name).toBe('Backend');
    });
  });

  describe('audit (extra endpoint)', () => {
    it('should return audit result', async () => {
      const mockFetch = createMockFetch({ '/audit': AUDIT_FIXTURE });
      const adapter = createSkillsShAdapter({ fetch: mockFetch });
      const result = await audit(adapter, 'skill-ts', { fetch: mockFetch });

      expect(result.skillId).toBe('skill-ts');
      expect(result.passed).toBe(true);
      expect(result.issues).toEqual([]);
    });
  });
});
