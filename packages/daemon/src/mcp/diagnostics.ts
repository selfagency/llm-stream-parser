import type { McpCapabilities, McpServerConfig } from './types.js';

export interface McpDiagnosticCheck {
  id: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface McpDiagnosticsReport {
  checks: McpDiagnosticCheck[];
  status: 'pass' | 'warn' | 'fail';
  summary: string;
  target: 'mcp';
}

export interface McpSetupGuide {
  steps: string[];
  summary: string;
  target: 'mcp';
}

export function runMcpDiagnostics(config: Partial<McpServerConfig> = {}): McpDiagnosticsReport {
  const capabilities: McpCapabilities = config.capabilities ?? {};
  const checks: McpDiagnosticCheck[] = [
    {
      id: 'server-name',
      level: config.name ? 'info' : 'warn',
      message: config.name ? `MCP server name is ${config.name}.` : 'MCP server name is not configured.'
    },
    {
      id: 'tools-capability',
      level: capabilities.tools === false ? 'warn' : 'info',
      message:
        capabilities.tools === false ? 'Tools capability is disabled.' : 'Tools capability is available or unspecified.'
    }
  ];

  let status: 'fail' | 'warn' | 'pass';
  if (checks.some(check => check.level === 'error')) {
    status = 'fail';
  } else if (checks.some(check => check.level === 'warn')) {
    status = 'warn';
  } else {
    status = 'pass';
  }

  return {
    checks,
    status,
    summary: status === 'pass' ? 'MCP configuration looks good.' : 'MCP configuration has warnings or errors.',
    target: 'mcp'
  };
}

export function getMcpSetupGuide(): McpSetupGuide {
  return {
    target: 'mcp',
    summary: 'Configure MCP server name, tools, prompts, and resources.',
    steps: [
      'Define the MCP server name and version.',
      'Register tools, prompts, and resources as needed.',
      'Verify capability flags before exposing the server to clients.',
      'Run the framework doctor after wiring the server into a host surface.'
    ]
  };
}
