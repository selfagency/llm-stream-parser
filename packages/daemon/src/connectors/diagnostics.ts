import type { ConnectorGatewayOptions } from './types.js';

export interface ConnectorDiagnosticCheck {
  id: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface ConnectorDiagnosticsReport {
  checks: ConnectorDiagnosticCheck[];
  status: 'pass' | 'warn' | 'fail';
  summary: string;
  target: 'connectors';
}

export interface ConnectorSetupGuide {
  steps: string[];
  summary: string;
  target: 'connectors';
}

export function runConnectorDiagnostics(config: Partial<ConnectorGatewayOptions> = {}): ConnectorDiagnosticsReport {
  const checks: ConnectorDiagnosticCheck[] = [
    {
      id: 'adapter-count',
      level: (config.adapters?.length ?? 0) > 0 ? 'info' : 'warn',
      message:
        (config.adapters?.length ?? 0) > 0 ? 'At least one adapter is configured.' : 'No adapters are configured.'
    }
  ];

  return {
    checks,
    status: checks.some(check => check.level === 'warn') ? 'warn' : 'pass',
    summary: 'Connector configuration evaluated.',
    target: 'connectors'
  };
}

export function getConnectorSetupGuide(): ConnectorSetupGuide {
  return {
    target: 'connectors',
    summary: 'Configure channel adapters and session management for your host integration.',
    steps: [
      'Register a channel adapter implementation.',
      'Wire session storage if you need durable conversation tracking.',
      'Confirm built-in commands and XML stripping behavior match your host.',
      'Run the framework doctor for the host surface after wiring adapters.'
    ]
  };
}
