# @agentsy/agents

Default agents implementation with YAML specifications, hook system, and skill composition.

## Overview

This package provides:
- **4 Default Agents**: Coder, Researcher, Planner, and General agents
- **YAML-first Definitions**: Introspectable, version-controlled agent specifications
- **Hook-based Composition**: Decoupled orchestration lifecycle
- **Skill Activation**: Cost-aware skill selection with confidence scoring
- **Multi-orchestrator Support**: Sequential, parallel, and Sisyphus patterns

## Installation

```bash
pnpm add @agentsy/agents
```

## Usage

### Loading Agents

```typescript
import { loadAgent } from '@agentsy/agents';

const { agent, errors } = await loadAgent({ 
  filePath: './src/specs/coder.yaml' 
});
```

### Executing Agents

```typescript
import { executeAgent } from '@agentsy/agents';

const result = await executeAgent(agent, 'Write a React component', {
  validate: true,
  maxRetries: 3,
});
```

### Default Agents

- **coder**: Multi-role agent for code generation, testing, and review (45K tokens)
- **researcher**: Planner-executor for web research with citation tracking (30K tokens)
- **planner**: Sisyphus-based atomic step decomposition (20K tokens)
- **general**: Adaptive reasoning with pattern learning (5K tokens)

## Architecture

See the implementation plans:
- [Phase 15: Council Mode](../../plan/24-PHASE-15-COUNCIL-MODE.md)
- [Executive Summary](../../plan/31-DEFAULT-AGENTS-EXECUTIVE-SUMMARY.md)
- [Implementation Plan](../../plan/32-DEFAULT-AGENTS-IMPLEMENTATION-PLAN.md)
- [Architecture Reference](../../plan/33-DEFAULT-AGENTS-ARCHITECTURE.md)