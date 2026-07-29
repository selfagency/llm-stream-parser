/**
 * Skills.sh Registry Adapter
 *
 * REST API client for https://www.skills.sh/api/v1/
 * 6 endpoints: list, search, curated, detail, audit
 * Uses SHA-256 content hash as version fingerprint (no semver).
 *
 * @module
 */

import type { RegistryAdapter, RegistryEntry } from './types.js';

// ── Constants ─────────────────────────────────────────────

const DEFAULT_BASE_URL = 'https://www.skills.sh/api/v1';

// ── Options ───────────────────────────────────────────────

export interface SkillsShAdapterOptions {
  /** Base URL for the Skills.sh API (default: https://www.skills.sh/api/v1) */
  baseUrl?: string;
  /** Custom fetch implementation (default: global fetch) */
  fetch?: typeof globalThis.fetch;
  /** OIDC token for Vercel-authenticated requests */
  token?: string;
}

// ── Internal types ────────────────────────────────────────

interface SkillsShSkill {
  readonly category?: string;
  readonly contentHash?: string;
  readonly description?: string;
  readonly id: string;
  readonly name: string;
  readonly tags?: string[];
}

interface SkillsShListResponse {
  readonly cursor?: string;
  readonly skills: SkillsShSkill[];
  readonly total?: number;
}

interface SkillsShSearchResponse {
  readonly query: string;
  readonly results: SkillsShSkill[];
  readonly total?: number;
}

interface SkillsShCuratedResponse {
  readonly sections: Array<{
    readonly name: string;
    readonly skills: SkillsShSkill[];
  }>;
}

interface SkillsShDetailResponse {
  readonly dependencies?: string[];
  readonly readme?: string;
  readonly skill: SkillsShSkill;
}

// ── Type guards ───────────────────────────────────────────

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isSkillsShSkill(value: unknown): value is SkillsShSkill {
  if (!isObject(value)) {
    return false;
  }
  return isValidString(value.id) && isValidString(value.name);
}

function isSkillsShListResponse(value: unknown): value is SkillsShListResponse {
  if (!isObject(value)) {
    return false;
  }
  return Array.isArray(value.skills) && value.skills.every(isSkillsShSkill);
}

function isSkillsShSearchResponse(value: unknown): value is SkillsShSearchResponse {
  if (!isObject(value)) {
    return false;
  }
  return Array.isArray(value.results) && value.results.every(isSkillsShSkill);
}

function isSkillsShCuratedResponse(value: unknown): value is SkillsShCuratedResponse {
  if (!isObject(value)) {
    return false;
  }
  if (!Array.isArray(value.sections)) {
    return false;
  }
  return value.sections.every(
    (s: unknown) =>
      isObject(s) &&
      isValidString(s.name as string) &&
      Array.isArray(s.skills) &&
      (s.skills as unknown[]).every(isSkillsShSkill)
  );
}

function isSkillsShDetailResponse(value: unknown): value is SkillsShDetailResponse {
  if (!isObject(value)) {
    return false;
  }
  return isSkillsShSkill(value.skill);
}

// ── Helpers ───────────────────────────────────────────────

function skillToEntry(skill: SkillsShSkill): RegistryEntry {
  const base: Omit<RegistryEntry, 'version'> = {
    id: skill.id,
    name: skill.name,
    description: skill.description ?? '',
    source: 'skills.sh'
  };
  if (skill.contentHash === undefined) {
    return base;
  }
  return { ...base, version: skill.contentHash };
}

function buildHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json'
  };
  if (token !== undefined && token.length > 0) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function fetchJson(
  url: string,
  headers: Record<string, string>,
  fetchFn: typeof globalThis.fetch
): Promise<unknown> {
  const response = await fetchFn(url, { headers });
  if (!response.ok) {
    throw new Error(`Skills.sh API error: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as unknown;
}

// ── Adapter factory ───────────────────────────────────────

export function createSkillsShAdapter(options?: SkillsShAdapterOptions): RegistryAdapter {
  const baseUrl = options?.baseUrl ?? DEFAULT_BASE_URL;
  const token = options?.token;
  const fetchFn = options?.fetch ?? globalThis.fetch;

  return {
    name: 'skills-sh',

    async list(): Promise<RegistryEntry[]> {
      const url = `${baseUrl}/list`;
      const data = await fetchJson(url, buildHeaders(token), fetchFn);

      if (!isSkillsShListResponse(data)) {
        throw new Error('Skills.sh: invalid list response format');
      }

      return data.skills.map(skillToEntry);
    },

    async search(query: string): Promise<RegistryEntry[]> {
      const url = `${baseUrl}/search?q=${encodeURIComponent(query)}`;
      const data = await fetchJson(url, buildHeaders(token), fetchFn);

      if (isSkillsShListResponse(data)) {
        // Some implementations return list-shaped responses for search
        return data.skills.map(skillToEntry);
      }

      if (!isSkillsShSearchResponse(data)) {
        throw new Error('Skills.sh: invalid search response format');
      }

      return data.results.map(skillToEntry);
    },

    async get(id: string): Promise<RegistryEntry | null> {
      const url = `${baseUrl}/detail?id=${encodeURIComponent(id)}`;
      try {
        const data = await fetchJson(url, buildHeaders(token), fetchFn);

        if (isSkillsShDetailResponse(data)) {
          return skillToEntry(data.skill);
        }

        // Fallback: search for the skill
        const searchResults = await this.search(id);
        return searchResults.find(s => s.id === id) ?? null;
      } catch {
        return null;
      }
    }
  };
}

// ── Additional endpoints (not part of RegistryAdapter interface) ──

export interface SkillsShAuditResult {
  issues: string[];
  passed: boolean;
  skillId: string;
}

export interface SkillsShCuratedSection {
  name: string;
  skills: RegistryEntry[];
}

export async function curated(
  _adapter: RegistryAdapter & { name: 'skills-sh' },
  options?: SkillsShAdapterOptions
): Promise<SkillsShCuratedSection[]> {
  const baseUrl = options?.baseUrl ?? DEFAULT_BASE_URL;
  const token = options?.token;
  const fetchFn = options?.fetch ?? globalThis.fetch;

  const url = `${baseUrl}/curated`;
  const data = await fetchJson(url, buildHeaders(token), fetchFn);

  if (!isSkillsShCuratedResponse(data)) {
    throw new Error('Skills.sh: invalid curated response format');
  }

  return data.sections.map(section => ({
    name: section.name,
    skills: section.skills.map(skillToEntry)
  }));
}

export async function audit(
  _adapter: RegistryAdapter & { name: 'skills-sh' },
  skillId: string,
  options?: SkillsShAdapterOptions
): Promise<SkillsShAuditResult> {
  const baseUrl = options?.baseUrl ?? DEFAULT_BASE_URL;
  const token = options?.token;
  const fetchFn = options?.fetch ?? globalThis.fetch;

  const url = `${baseUrl}/audit?id=${encodeURIComponent(skillId)}`;
  const data = await fetchJson(url, buildHeaders(token), fetchFn);

  if (!isObject(data)) {
    throw new Error('Skills.sh: invalid audit response format');
  }

  const issues = Array.isArray(data.issues) ? (data.issues as string[]).filter(isValidString) : [];

  return {
    skillId: isValidString(data.skillId) ? (data.skillId as string) : skillId,
    passed: data.passed === true,
    issues
  };
}
