import { describe, expect, it } from 'vitest';

import { getMcpSetupGuide, runMcpDiagnostics } from './diagnostics.js';

describe('MCP diagnostics', () => {
  it('returns a setup guide', () => {
    expect(getMcpSetupGuide().target).toBe('mcp');
  });

  it('returns a diagnostics report', () => {
    expect(runMcpDiagnostics().target).toBe('mcp');
  });
});
