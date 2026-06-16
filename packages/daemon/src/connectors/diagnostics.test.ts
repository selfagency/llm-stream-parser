import { describe, expect, it } from 'vitest';

import { getConnectorSetupGuide, runConnectorDiagnostics } from './diagnostics.js';

describe('connector diagnostics', () => {
  it('returns a setup guide', () => {
    expect(getConnectorSetupGuide().target).toBe('connectors');
  });

  it('returns a diagnostics report', () => {
    expect(runConnectorDiagnostics().target).toBe('connectors');
  });
});
