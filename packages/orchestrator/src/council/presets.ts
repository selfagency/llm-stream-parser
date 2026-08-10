import type { CouncilDefinition } from './types.js';

export const COUNCIL_PRESETS: Record<string, CouncilDefinition> = {
  coding: {
    name: 'Coding Council',
    description: 'Expert coding assistants for production-ready solutions',
    domain: 'coding',
    members: [
      { model: 'claude-sonnet-4-5', provider: 'anthropic', role: 'architect' },
      { model: 'gpt-4o', provider: 'openai', role: 'implementer' },
      { model: 'gemini-2.0-flash', provider: 'google', role: 'reviewer' }
    ],
    chairman: { model: 'claude-sonnet-4-5', provider: 'anthropic' }
  },

  research: {
    name: 'Research Council',
    description: 'Scientific research assistants for evidence-based analysis',
    domain: 'research',
    members: [
      { model: 'claude-opus', provider: 'anthropic', role: 'analyst' },
      { model: 'gpt-4o', provider: 'openai', role: 'synthesizer' },
      { model: 'gemini-2.0-pro', provider: 'google', role: 'fact-checker' }
    ],
    chairman: { model: 'claude-opus', provider: 'anthropic' }
  },

  review: {
    name: 'Review Council',
    description: 'Multiple reviewers for thorough code/security review',
    domain: 'review',
    members: [
      { model: 'claude-sonnet-4-5', provider: 'anthropic', role: 'security' },
      { model: 'gpt-4o', provider: 'openai', role: 'performance' },
      { model: 'gemini-2.0-flash', provider: 'google', role: 'maintainability' }
    ],
    chairman: { model: 'claude-sonnet-4-5', provider: 'anthropic' }
  },

  architecture: {
    name: 'Architecture Council',
    description: 'Principal engineers for system design decisions',
    domain: 'architecture',
    members: [
      { model: 'claude-opus', provider: 'anthropic', role: 'patterns' },
      { model: 'gpt-4o', provider: 'openai', role: 'scalability' },
      { model: 'gemini-2.0-pro', provider: 'google', role: 'tradeoffs' }
    ],
    chairman: { model: 'claude-opus', provider: 'anthropic' }
  },

  general: {
    name: 'General Council',
    description: 'Balanced council for complex questions',
    domain: 'general',
    members: [
      { model: 'claude-sonnet-4-5', provider: 'anthropic' },
      { model: 'gpt-4o', provider: 'openai' },
      { model: 'gemini-2.0-flash', provider: 'google' }
    ],
    chairman: { model: 'claude-sonnet-4-5', provider: 'anthropic' }
  }
};
