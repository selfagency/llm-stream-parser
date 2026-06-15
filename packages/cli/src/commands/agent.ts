import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CliIO } from '../index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = resolve(__dirname, '../../../../agents/src/specs');

interface AgentInfo {
  description: string;
  layers: number;
  name: string;
  orchestrator: string;
  role: string;
  skills: number;
  tokenBudget: number;
}

async function discoverAgents(): Promise<AgentInfo[]> {
  const agents: AgentInfo[] = [];
  try {
    const files = await readdir(AGENTS_DIR);
    const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

    for (const file of yamlFiles) {
      const content = await readFile(resolve(AGENTS_DIR, file), 'utf-8');
      const name = file.replace(/\.(yaml|yml)$/, '');
      const role = extractField(content, 'role') ?? 'unknown';
      const description = extractField(content, 'description') ?? '';
      const tokenBudget = Number(extractField(content, 'token-budget') ?? '0');
      const orchestrator = extractField(content, 'orchestrator') ?? 'sequential';
      const layers = (content.match(/^\s+- role:/gm) ?? []).length;
      const skills = (content.match(/^\s+- name:/gm) ?? []).length;

      agents.push({ name, role, description, tokenBudget, orchestrator, layers, skills });
    }
  } catch {
    // Agents directory not found — return empty
  }
  return agents;
}

const YAML_FIELD_PATTERNS: Record<string, RegExp> = {
  name: /^name:\s*(.+)$/m,
  role: /^role:\s*(.+)$/m,
  orchestration: /^orchestration:\s*(.+)$/m,
  budget: /^budget:\s*(.+)$/m
};

function extractField(yaml: string, field: string): string | undefined {
  if (!Object.hasOwn(YAML_FIELD_PATTERNS, field)) {
    return;
  }
  const pattern = YAML_FIELD_PATTERNS[field];
  if (pattern === undefined) {
    return;
  }
  const match = yaml.match(pattern);
  return match?.[1]?.replace(/^["']|["']$/g, '').trim();
}

function formatAgentTable(agents: AgentInfo[]): string {
  const rows = agents.map(
    a =>
      `  ${a.name.padEnd(16)} ${a.role.padEnd(24)} ${String(a.tokenBudget).padStart(6)}  ${a.orchestrator.padEnd(12)} ${a.layers} layers  ${a.skills} skills`
  );
  return [
    '  NAME             ROLE                       BUDGET  ORCHESTRATOR  STRUCTURE',
    `  ${'-'.repeat(90)}`,
    ...rows
  ].join('\n');
}

function writeOut(io: CliIO, msg: string): void {
  if (io.stdout) {
    io.stdout(msg);
  }
}

function writeErr(io: CliIO, msg: string): void {
  if (io.stderr) {
    io.stderr(msg);
  }
}

function findAgentOrExit(agents: AgentInfo[], name: string, io: CliIO, usage: string): AgentInfo | null {
  const agent = agents.find(a => a.name === name);
  if (!agent) {
    writeErr(io, `Agent "${name}" not found.\n`);
    writeErr(io, `Usage: agentsy agent ${usage}\n`);
    return null;
  }
  return agent;
}

export async function runAgentCommand(args: readonly string[], io: CliIO): Promise<number> {
  const subcommand = args[0] ?? 'list';

  switch (subcommand) {
    case 'list': {
      const agents = await discoverAgents();
      if (agents.length === 0) {
        writeErr(io, 'No agents found.\n');
        return 0;
      }
      writeOut(io, `${formatAgentTable(agents)}\n`);
      return 0;
    }

    case 'show': {
      const agentName = args[1];
      if (!agentName) {
        writeErr(io, 'Usage: agentsy agent show <name>\n');
        return 1;
      }
      const agents = await discoverAgents();
      const agent = findAgentOrExit(agents, agentName, io, 'show <name>');
      if (!agent) {
        return 1;
      }
      writeOut(io, `Name:         ${agent.name}\n`);
      writeOut(io, `Role:         ${agent.role}\n`);
      writeOut(io, `Description:  ${agent.description}\n`);
      writeOut(io, `Budget:       ${agent.tokenBudget} tokens\n`);
      writeOut(io, `Orchestrator: ${agent.orchestrator}\n`);
      writeOut(io, `Layers:       ${agent.layers}\n`);
      writeOut(io, `Skills:       ${agent.skills}\n`);
      return 0;
    }

    case 'run': {
      const agentName = args[1];
      const task = args.slice(2).join(' ');
      if (!(agentName && task)) {
        writeErr(io, 'Usage: agentsy agent run <name> <task>\n');
        return 1;
      }
      writeErr(io, `[agent] running "${agentName}" with task: "${task}"\n`);
      writeErr(io, '[agent] note: agent execution requires the @agentsy/agents runtime\n');
      return 0;
    }

    case 'explain': {
      const agentName = args[1];
      if (!agentName) {
        writeErr(io, 'Usage: agentsy agent explain <name>\n');
        return 1;
      }
      const agents = await discoverAgents();
      const agent = findAgentOrExit(agents, agentName, io, 'explain <name>');
      if (!agent) {
        return 1;
      }
      writeOut(io, `Agent: ${agent.name}\n`);
      writeOut(io, `Role: ${agent.role}\n`);
      writeOut(io, `\nDescription:\n  ${agent.description}\n`);
      writeOut(io, '\nArchitecture:\n');
      writeOut(io, `  Orchestrator: ${agent.orchestrator}\n`);
      writeOut(io, `  Token Budget: ${agent.tokenBudget} tokens/session\n`);
      writeOut(io, `  Layers:       ${agent.layers}\n`);
      writeOut(io, `  Skills:       ${agent.skills}\n`);
      return 0;
    }

    default:
      writeErr(io, `Unknown agent subcommand: ${subcommand}\n`);
      writeErr(io, 'Usage: agentsy agent <list|show|run|explain>\n');
      return 1;
  }
}
