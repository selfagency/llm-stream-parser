import { expect, test } from '@microsoft/tui-test';

test.describe('guardrails command', () => {
  test('list prints available guardrails', async ({ terminal }) => {
    await terminal.submit('node dist/cli.js guardrails list');
    // Match the highest-priority (last) scanner — always visible at bottom of viewport
    await expect(terminal.getByText(/delayed-exfiltration|scope-drift/)).toBeVisible();
  });

  test('policy show prints default policy', async ({ terminal }) => {
    await terminal.submit('node dist/cli.js guardrails policy');
    await expect(terminal.getByText('Policy: ./.agentsy/policy.yaml')).toBeVisible();
  });
});
