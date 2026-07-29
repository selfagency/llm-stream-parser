import { mkdir, writeFile } from 'node:fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEccToolsAdapter } from './adapters/ecc-tools.js';
import { createGuardrailsHubAdapter, getValidatorDetails } from './adapters/guardrails-hub.js';
import { createMcpRegistryAdapter } from './adapters/mcp-registry.js';
import { createSkillsShAdapter } from './adapters/skills-sh.js';
import type { AgentsyConfig, RecommendationEntry } from './config.js';
import { readConfig, writeConfig } from './config.js';
import {
  type GuardrailPipeline,
  type InstallOptions,
  installById,
  installComponent,
  installRecommended,
  type SubprocessManager
} from './install.js';

// ── Mocks ─────────────────────────────────────────────────

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined as never),
  writeFile: vi.fn().mockResolvedValue(undefined as never)
}));

vi.mock('./config.js', () => ({
  readConfig: vi.fn(),
  writeConfig: vi.fn(),
  configPath: vi.fn(),
  createDefaultConfig: vi.fn()
}));

vi.mock('./adapters/mcp-registry.js', () => ({
  createMcpRegistryAdapter: vi.fn()
}));

vi.mock('./adapters/skills-sh.js', () => ({
  createSkillsShAdapter: vi.fn()
}));

vi.mock('./adapters/guardrails-hub.js', () => ({
  createGuardrailsHubAdapter: vi.fn(),
  getValidatorDetails: vi.fn()
}));

vi.mock('./adapters/ecc-tools.js', () => ({
  createEccToolsAdapter: vi.fn()
}));

// ── Fixtures ──────────────────────────────────────────────

const ROOT = '/test/project';

const MOCK_CONFIG: AgentsyConfig = {
  schemaVersion: 1,
  project: {
    rootPath: ROOT,
    profile: {
      rootPath: ROOT,
      languages: ['typescript'],
      frameworks: ['next.js', 'react'],
      packageManager: 'pnpm',
      buildSystem: 'next',
      linter: ['biome'],
      testRunner: ['vitest'],
      monorepo: false,
      ci: ['github-actions'],
      deploymentTarget: ['vercel'],
      detectedAt: '2026-07-25T00:00:00Z'
    },
    detectedAt: '2026-07-25T00:00:00Z'
  },
  installed: {
    connectors: [],
    guardrails: [],
    hooks: [],
    mcpServers: [],
    skills: []
  },
  recommendations: [
    {
      componentType: 'mcp-server',
      componentId: 'io.modelcontextprotocol.postgres',
      confidence: 0.9,
      installCommand: 'agentsy install mcp io.modelcontextprotocol.postgres',
      reason: 'Detected PostgreSQL ORM in project'
    },
    {
      componentType: 'skill',
      componentId: 'nextjs-app-router',
      confidence: 0.8,
      installCommand: 'agentsy install skill nextjs-app-router',
      reason: 'Detected Next.js'
    },
    {
      componentType: 'guardrail',
      componentId: 'builtin:pii',
      confidence: 0.7,
      installCommand: 'agentsy install guardrail builtin:pii',
      reason: 'Python projects often handle data'
    }
  ] as RecommendationEntry[],
  artifacts: {
    agentsMd: false,
    aft: false,
    magicContext: false
  }
};

function mockEntry(id: string, name: string): ReturnType<ReturnType<typeof createMcpRegistryAdapter>['get']> {
  return Promise.resolve({
    id,
    name,
    description: `Description for ${name}`,
    source: 'test',
    version: '1.0.0'
  });
}

function makeMockAdapter(getResult: unknown) {
  return {
    name: 'test-adapter',
    get: vi.fn().mockResolvedValue(getResult as never),
    list: vi.fn(),
    search: vi.fn()
  };
}

function defaultOptions(): InstallOptions {
  return { rootPath: ROOT };
}

// ── Tests ─────────────────────────────────────────────────

describe('installComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (readConfig as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_CONFIG);
    (writeConfig as ReturnType<typeof vi.fn>).mockResolvedValue(undefined as never);
  });

  describe('mcp-server', () => {
    it('should install an MCP server from registry', async () => {
      const adapter = makeMockAdapter(mockEntry('io.modelcontextprotocol.postgres', 'postgres'));
      (createMcpRegistryAdapter as ReturnType<typeof vi.fn>).mockReturnValue(adapter);

      const rec: RecommendationEntry = {
        componentType: 'mcp-server',
        componentId: 'io.modelcontextprotocol.postgres',
        confidence: 0.9,
        installCommand: 'agentsy install mcp io.modelcontextprotocol.postgres',
        reason: 'Test'
      };

      const result = await installComponent(rec, defaultOptions());

      expect(result.success).toBe(true);
      expect(result.componentId).toBe('io.modelcontextprotocol.postgres');
      expect(result.componentType).toBe('mcp-server');
      expect(adapter.get).toHaveBeenCalledWith('io.modelcontextprotocol.postgres');
      expect(writeConfig).toHaveBeenCalled();
    });

    it('should use SubprocessManager when provided', async () => {
      const adapter = makeMockAdapter(mockEntry('io.modelcontextprotocol.postgres', 'postgres'));
      (createMcpRegistryAdapter as ReturnType<typeof vi.fn>).mockReturnValue(adapter);

      const subprocessManager: SubprocessManager = {
        start: vi.fn().mockResolvedValue({ pid: 12_345 })
      };

      const rec: RecommendationEntry = {
        componentType: 'mcp-server',
        componentId: 'io.modelcontextprotocol.postgres',
        confidence: 0.9,
        installCommand: 'agentsy install mcp io.modelcontextprotocol.postgres',
        reason: 'Test'
      };

      const result = await installComponent(rec, { ...defaultOptions(), subprocessManager });

      expect(result.success).toBe(true);
      expect(subprocessManager.start).toHaveBeenCalledWith('io.modelcontextprotocol.postgres');
    });

    it('should fail if MCP server not found in registry', async () => {
      const adapter = makeMockAdapter(null);
      (createMcpRegistryAdapter as ReturnType<typeof vi.fn>).mockReturnValue(adapter);

      const rec: RecommendationEntry = {
        componentType: 'mcp-server',
        componentId: 'unknown.server',
        confidence: 0.9,
        installCommand: 'agentsy install mcp unknown.server',
        reason: 'Test'
      };

      const result = await installComponent(rec, defaultOptions());

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('skill', () => {
    it('should install a skill from Skills.sh registry', async () => {
      const adapter = makeMockAdapter(mockEntry('nextjs-app-router', 'nextjs-app-router'));
      (createSkillsShAdapter as ReturnType<typeof vi.fn>).mockReturnValue(adapter);

      const rec: RecommendationEntry = {
        componentType: 'skill',
        componentId: 'nextjs-app-router',
        confidence: 0.8,
        installCommand: 'agentsy install skill nextjs-app-router',
        reason: 'Test'
      };

      const result = await installComponent(rec, defaultOptions());

      expect(result.success).toBe(true);
      expect(adapter.get).toHaveBeenCalledWith('nextjs-app-router');
      expect(mkdir).toHaveBeenCalled();
      expect(writeFile).toHaveBeenCalled();
      expect(writeConfig).toHaveBeenCalled();
    });

    it('should write SKILL.md with AgentSkills frontmatter', async () => {
      const adapter = makeMockAdapter(
        Promise.resolve({
          id: 'astro-islands',
          name: 'astro-islands',
          description: 'Astro islands architecture skill',
          source: 'skills.sh',
          version: 'abc123'
        })
      );
      (createSkillsShAdapter as ReturnType<typeof vi.fn>).mockReturnValue(adapter);

      const rec: RecommendationEntry = {
        componentType: 'skill',
        componentId: 'astro-islands',
        confidence: 0.8,
        installCommand: 'agentsy install skill astro-islands',
        reason: 'Test'
      };

      await installComponent(rec, defaultOptions());

      expect(writeFile).toHaveBeenCalledOnce();
      const callArgs = (writeFile as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string, string];
      expect(callArgs[0]).toContain('SKILL.md');
      expect(callArgs[1]).toContain('name: astro-islands');
      expect(callArgs[1]).toContain('description: Astro islands architecture skill');
      expect(callArgs[1]).toContain('version: abc123');
    });

    it('should fail if skill not found in registry', async () => {
      const adapter = makeMockAdapter(null);
      (createSkillsShAdapter as ReturnType<typeof vi.fn>).mockReturnValue(adapter);

      const rec: RecommendationEntry = {
        componentType: 'skill',
        componentId: 'nonexistent-skill',
        confidence: 0.7,
        installCommand: 'agentsy install skill nonexistent-skill',
        reason: 'Test'
      };

      const result = await installComponent(rec, defaultOptions());

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should not create duplicate when skill already installed', async () => {
      const configWithExisting: AgentsyConfig = {
        ...MOCK_CONFIG,
        installed: {
          ...MOCK_CONFIG.installed,
          skills: ['nextjs-app-router']
        }
      };
      (readConfig as ReturnType<typeof vi.fn>).mockResolvedValue(configWithExisting);

      const adapter = makeMockAdapter(mockEntry('nextjs-app-router', 'nextjs-app-router'));
      (createSkillsShAdapter as ReturnType<typeof vi.fn>).mockReturnValue(adapter);

      const rec: RecommendationEntry = {
        componentType: 'skill',
        componentId: 'nextjs-app-router',
        confidence: 0.8,
        installCommand: 'agentsy install skill nextjs-app-router',
        reason: 'Test'
      };

      await installComponent(rec, defaultOptions());

      expect(writeConfig).not.toHaveBeenCalled();
    });
  });

  describe('guardrail', () => {
    it('should install a guardrail from hub', async () => {
      const adapter = makeMockAdapter(
        Promise.resolve({
          id: 'builtin:no-toxic-language',
          name: 'NoToxicLanguage',
          description: 'Detects toxic language [RULE — ported]',
          source: 'guardrails-hub',
          version: undefined
        })
      );
      (createGuardrailsHubAdapter as ReturnType<typeof vi.fn>).mockReturnValue(adapter);
      (getValidatorDetails as ReturnType<typeof vi.fn>).mockReturnValue({
        id: 'builtin:no-toxic-language',
        name: 'NoToxicLanguage',
        description: 'Detects toxic language',
        strategy: 'rule',
        portStatus: 'ported',
        pythonModule: 'guardrails_api.validators',
        pythonValidator: 'detoxify'
      });

      const rec: RecommendationEntry = {
        componentType: 'guardrail',
        componentId: 'builtin:no-toxic-language',
        confidence: 0.7,
        installCommand: 'agentsy install guardrail builtin:no-toxic-language',
        reason: 'Test'
      };

      const result = await installComponent(rec, defaultOptions());

      expect(result.success).toBe(true);
      expect(adapter.get).toHaveBeenCalledWith('builtin:no-toxic-language');
      expect(writeConfig).toHaveBeenCalled();
    });

    it('should register with GuardrailPipeline when provided', async () => {
      const adapter = makeMockAdapter(
        Promise.resolve({
          id: 'builtin:no-toxic-language',
          name: 'NoToxicLanguage',
          description: 'Detects toxic language [RULE — ported]',
          source: 'guardrails-hub',
          version: undefined
        })
      );
      (createGuardrailsHubAdapter as ReturnType<typeof vi.fn>).mockReturnValue(adapter);
      (getValidatorDetails as ReturnType<typeof vi.fn>).mockReturnValue({
        id: 'builtin:no-toxic-language',
        name: 'NoToxicLanguage',
        description: 'Detects toxic language',
        strategy: 'rule',
        portStatus: 'ported',
        pythonModule: 'guardrails_api.validators',
        pythonValidator: 'detoxify'
      });

      const pipeline: GuardrailPipeline = {
        register: vi.fn().mockResolvedValue(undefined as never)
      };

      const rec: RecommendationEntry = {
        componentType: 'guardrail',
        componentId: 'builtin:no-toxic-language',
        confidence: 0.7,
        installCommand: 'agentsy install guardrail builtin:no-toxic-language',
        reason: 'Test'
      };

      const result = await installComponent(rec, { ...defaultOptions(), guardrailPipeline: pipeline });

      expect(result.success).toBe(true);
      expect(pipeline.register).toHaveBeenCalledWith('builtin:no-toxic-language');
    });

    it('should fail if guardrail not found in hub', async () => {
      const adapter = makeMockAdapter(null);
      (createGuardrailsHubAdapter as ReturnType<typeof vi.fn>).mockReturnValue(adapter);

      const rec: RecommendationEntry = {
        componentType: 'guardrail',
        componentId: 'builtin:unknown',
        confidence: 0.7,
        installCommand: 'agentsy install guardrail builtin:unknown',
        reason: 'Test'
      };

      const result = await installComponent(rec, defaultOptions());

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('connector', () => {
    it('should install a connector from ECC Tools registry and persist to config', async () => {
      const adapter = makeMockAdapter(mockEntry('comp-logger', 'Logger'));
      (createEccToolsAdapter as ReturnType<typeof vi.fn>).mockReturnValue(adapter);

      const rec: RecommendationEntry = {
        componentType: 'connector',
        componentId: 'comp-logger',
        confidence: 0.6,
        installCommand: 'agentsy install connector comp-logger',
        reason: 'Test'
      };

      const result = await installComponent(rec, defaultOptions());

      expect(result.success).toBe(true);
      expect(adapter.get).toHaveBeenCalledWith('comp-logger');
      expect(writeConfig).toHaveBeenCalled();
      const writtenConfig = (writeConfig as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as AgentsyConfig;
      expect(writtenConfig.installed.connectors).toContain('comp-logger');
    });

    it('should fail if connector not found in registry', async () => {
      const adapter = makeMockAdapter(null);
      (createEccToolsAdapter as ReturnType<typeof vi.fn>).mockReturnValue(adapter);

      const rec: RecommendationEntry = {
        componentType: 'connector',
        componentId: 'unknown-connector',
        confidence: 0.6,
        installCommand: 'agentsy install connector unknown-connector',
        reason: 'Test'
      };

      const result = await installComponent(rec, defaultOptions());

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('error handling', () => {
    it('should catch and return adapter errors gracefully', async () => {
      const adapter = {
        name: 'test-adapter',
        get: vi.fn().mockRejectedValue(new Error('Network timeout')),
        list: vi.fn(),
        search: vi.fn()
      };
      (createMcpRegistryAdapter as ReturnType<typeof vi.fn>).mockReturnValue(adapter);

      const rec: RecommendationEntry = {
        componentType: 'mcp-server',
        componentId: 'io.modelcontextprotocol.test',
        confidence: 0.9,
        installCommand: 'agentsy install mcp io.modelcontextprotocol.test',
        reason: 'Test'
      };

      const result = await installComponent(rec, defaultOptions());

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network timeout');
    });

    it('should handle non-Error thrown values', async () => {
      const adapter = {
        name: 'test-adapter',
        get: vi.fn().mockRejectedValue('string error' as never),
        list: vi.fn(),
        search: vi.fn()
      };
      (createMcpRegistryAdapter as ReturnType<typeof vi.fn>).mockReturnValue(adapter);

      const rec: RecommendationEntry = {
        componentType: 'mcp-server',
        componentId: 'io.modelcontextprotocol.test',
        confidence: 0.9,
        installCommand: 'agentsy install mcp io.modelcontextprotocol.test',
        reason: 'Test'
      };

      const result = await installComponent(rec, defaultOptions());

      expect(result.success).toBe(false);
      expect(result.error).toBe('string error');
    });
  });
});

// ── installById tests ────────────────────────────────────

describe('installById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (readConfig as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_CONFIG);
    (writeConfig as ReturnType<typeof vi.fn>).mockResolvedValue(undefined as never);
  });

  it('should construct a recommendation and install it', async () => {
    const adapter = makeMockAdapter(mockEntry('io.modelcontextprotocol.postgres', 'postgres'));
    (createMcpRegistryAdapter as ReturnType<typeof vi.fn>).mockReturnValue(adapter);

    const result = await installById(ROOT, 'mcp-server', 'io.modelcontextprotocol.postgres');

    expect(result.success).toBe(true);
    expect(result.componentId).toBe('io.modelcontextprotocol.postgres');
    expect(result.componentType).toBe('mcp-server');
  });

  it('should accept optional subprocessManager and guardrailPipeline', async () => {
    const adapter = makeMockAdapter(mockEntry('io.modelcontextprotocol.postgres', 'postgres'));
    (createMcpRegistryAdapter as ReturnType<typeof vi.fn>).mockReturnValue(adapter);

    const subprocessManager: SubprocessManager = {
      start: vi.fn().mockResolvedValue({ pid: 99 })
    };
    const guardrailPipeline: GuardrailPipeline = {
      register: vi.fn()
    };

    await installById(ROOT, 'mcp-server', 'io.modelcontextprotocol.postgres', {
      subprocessManager,
      guardrailPipeline
    });

    expect(subprocessManager.start).toHaveBeenCalled();
  });
});

// ── installRecommended tests ─────────────────────────────

describe('installRecommended', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (readConfig as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_CONFIG);
    (writeConfig as ReturnType<typeof vi.fn>).mockResolvedValue(undefined as never);
  });

  it('should install all recommendations with confidence >= 0.8 by default', async () => {
    const mcpAdapter = makeMockAdapter(mockEntry('io.modelcontextprotocol.postgres', 'postgres'));
    const skillAdapter = makeMockAdapter(mockEntry('nextjs-app-router', 'nextjs-app-router'));
    (createMcpRegistryAdapter as ReturnType<typeof vi.fn>).mockReturnValue(mcpAdapter);
    (createSkillsShAdapter as ReturnType<typeof vi.fn>).mockReturnValue(skillAdapter);

    const results = await installRecommended(ROOT);

    expect(results).toHaveLength(2);
    expect(results[0]?.success).toBe(true);
    expect(results[1]?.success).toBe(true);
    // confidence 0.7 guardrail should NOT be installed
    const guardrailResult = results.find(r => r.componentType === 'guardrail');
    expect(guardrailResult).toBeUndefined();
  });

  it('should use custom threshold when provided', async () => {
    const mcpAdapter = makeMockAdapter(mockEntry('io.modelcontextprotocol.postgres', 'postgres'));
    const skillAdapter = makeMockAdapter(mockEntry('nextjs-app-router', 'nextjs-app-router'));
    const guardrailAdapter = makeMockAdapter(
      Promise.resolve({
        id: 'builtin:pii',
        name: 'PII Guard',
        description: 'PII detection',
        source: 'guardrails-hub',
        version: undefined
      })
    );
    (createMcpRegistryAdapter as ReturnType<typeof vi.fn>).mockReturnValue(mcpAdapter);
    (createSkillsShAdapter as ReturnType<typeof vi.fn>).mockReturnValue(skillAdapter);
    (createGuardrailsHubAdapter as ReturnType<typeof vi.fn>).mockReturnValue(guardrailAdapter);

    const results = await installRecommended(ROOT, 0.7);

    expect(results).toHaveLength(3);
  });

  it('should throw if no config found', async () => {
    (readConfig as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(installRecommended(ROOT)).rejects.toThrow('No .agentsy/config.yml found');
  });

  it('should return empty array if no recommendations meet threshold', async () => {
    (readConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...MOCK_CONFIG,
      recommendations: []
    });

    const results = await installRecommended(ROOT);

    expect(results).toEqual([]);
  });
});
