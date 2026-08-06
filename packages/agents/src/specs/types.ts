import type { AtlasManifest } from '@agentsy/atlas';

export interface AgentLayer {
  dependsOn?: string[];
  execution?: 'sequential' | 'parallel';
  goal: string;
  model?: string;
  role: string;
  skills: string[];
  tokenBudget: number;
}

export interface ToolFilterSpec {
  allow?: string[];
  deny?: string[];
}

export interface AgentSpec {
  atlas?: AtlasManifest;
  constraints?: string[];
  description: string;
  hooks?: AgentHooks;
  layers?: AgentLayer[];
  name: string;
  orchestrator?: 'sequential' | 'parallel' | 'sisyphus';
  role: string;
  skillRegistry?: SkillMetadata[];
  tokenBudget?: number;
  tools?: ToolFilterSpec;
}

export interface AgentHooks {
  layerTransition?: string[];
  onError?: string[];
  onRetry?: string[];
  postCleanup?: string[];
  postInit?: string[];
  postSkill?: string[];
  postTurn?: string[];
  preCleanup?: string[];
  preInit?: string[];
  preSkill?: string[];
  preTurn?: string[];
  skillSelection?: string[];
  stepExecute?: string[];
  stepTransition?: string[];
}

export interface SkillMetadata {
  applicableTo: string[];
  confidence: number;
  cost: `${number}-${number}`;
  latency: `${number}-${number}`;
  model?: string;
  name: string;
}

export interface TokenBudget {
  allocations: Map<string, number>;
  remaining: number;
  total: number;
  used: number;
}

export type AgentHook = (context: AgentExecutionContext) => Promise<void> | void;

export interface AgentExecutionContext {
  agent: LoadedAgent;
  results: Map<string, unknown>;
  spec: AgentSpec;
  state: {
    currentLayer?: string;
    currentStep?: number;
    completedSteps: string[];
    failedSteps: string[];
    errors: Error[];
  };
  task: string;
  tokens: {
    total: number;
    used: number;
    remaining: number;
  };
}

export interface LoadedAgent {
  budget: TokenBudget;
  hooks: Map<string, AgentHook[]>;
  skillRegistry: SkillMetadata[];
  spec: AgentSpec;
}
