/**
 * Connectors CLI commands — manage platform connectors.
 *
 * ## Usage
 *
 * ```bash
 * agentsy connectors list                          # List configured connectors
 * agentsy connectors check                         # Health-check all connectors
 * agentsy connectors slack post-message <ch> <txt>  # Post a Slack message (stub)
 * agentsy connectors slack read-thread <ch> <ts>    # Read a Slack thread (stub)
 * agentsy connectors linear create-issue <title>   # Create a Linear issue (stub)
 * agentsy connectors github <command>               # Delegate to MCP (stub)
 * ```
 */

import { getFlagValue } from '../cli-args.js';
import type { CliIO } from '../index.js';

// =============================================================================
// Handlers — existing
// =============================================================================

async function handleConnectorsListCommand(_argv: readonly string[], io: CliIO): Promise<number> {
  const stdout = io.stdout ?? console.log;

  stdout('Available connectors:');
  stdout('');

  const { isDiscordAdapterAvailable } = await import('@agentsy/daemon/connectors');
  const { isSlackAdapterAvailable } = await import('@agentsy/daemon/connectors');
  const { isTelegramAdapterAvailable } = await import('@agentsy/daemon/connectors');

  stdout(`  Discord:   ${isDiscordAdapterAvailable() ? '✅ available' : '❌ not available (install discord.js)'}`);
  stdout(`  Slack:     ${isSlackAdapterAvailable() ? '✅ available' : '❌ not available (install @slack/bolt)'}`);
  stdout(`  Telegram:  ${isTelegramAdapterAvailable() ? '✅ available' : '❌ not available (install grammy)'}`);

  return 0;
}

async function handleConnectorsCheckCommand(_argv: readonly string[], io: CliIO): Promise<number> {
  const stdout = io.stdout ?? console.log;

  stdout('Checking connector availability...');
  stdout('');

  const { getConnectorSetupGuide, runConnectorDiagnostics } = await import('@agentsy/daemon/connectors');

  const report = runConnectorDiagnostics();
  let statusLabel: string;
  if (report.status === 'pass') {
    statusLabel = 'pass';
  } else if (report.status === 'warn') {
    statusLabel = 'warn';
  } else {
    statusLabel = 'fail';
  }
  stdout(`  Status: ${statusLabel}`);
  stdout(`  Summary: ${report.summary}`);
  stdout('');

  const guide = getConnectorSetupGuide();
  stdout('Setup guide:');
  for (const step of guide.steps) {
    stdout(`  - ${step}`);
  }

  return report.status === 'fail' ? 1 : 0;
}

// =============================================================================
// Handlers — Slack
// =============================================================================

async function handleSlackPostMessageCommand(argv: readonly string[], io: CliIO): Promise<number> {
  const stdout = io.stdout ?? console.log;
  const stderr = io.stderr ?? console.error;

  const channel = argv[0];
  const text = argv.slice(1).join(' ');

  if (!channel) {
    stderr('Usage: agentsy connectors slack post-message <channel> <text>');
    return 1;
  }
  if (!text) {
    stderr('Usage: agentsy connectors slack post-message <channel> <text>');
    return 1;
  }

  const { isSlackAdapterAvailable } = await import('@agentsy/daemon/connectors');
  if (!isSlackAdapterAvailable()) {
    stderr('Slack adapter is not available. Install @slack/bolt to use this command.');
    return 1;
  }

  stdout(`Slack adapter is available. Posting message to channel "${channel}": "${text}"`);
  stdout('Note: The actual Slack API call requires @slack/bolt to be installed and configured.');
  stdout('      This is a stub — the real integration will be wired in a later phase.');
  return 0;
}

async function handleSlackReadThreadCommand(argv: readonly string[], io: CliIO): Promise<number> {
  const stdout = io.stdout ?? console.log;
  const stderr = io.stderr ?? console.error;

  const channel = argv[0];
  const ts = argv[1];

  if (!channel) {
    stderr('Usage: agentsy connectors slack read-thread <channel> <ts>');
    return 1;
  }
  if (!ts) {
    stderr('Usage: agentsy connectors slack read-thread <channel> <ts>');
    return 1;
  }

  const { isSlackAdapterAvailable } = await import('@agentsy/daemon/connectors');
  if (!isSlackAdapterAvailable()) {
    stderr('Slack adapter is not available. Install @slack/bolt to use this command.');
    return 1;
  }

  stdout(`Slack adapter is available. Reading thread in channel "${channel}" with timestamp "${ts}"`);
  stdout('Note: The actual Slack API call requires @slack/bolt to be installed and configured.');
  stdout('      This is a stub — the real integration will be wired in a later phase.');
  return 0;
}

// =============================================================================
// Handlers — Slack sub-router
// =============================================================================

async function handleSlackCommand(argv: readonly string[], io: CliIO): Promise<number> {
  const subcommand = argv[0];
  const rest = argv.slice(1);

  if (subcommand === 'post-message') {
    return await handleSlackPostMessageCommand(rest, io);
  }

  if (subcommand === 'read-thread') {
    return await handleSlackReadThreadCommand(rest, io);
  }

  const stderr = io.stderr ?? console.error;
  stderr(`Unknown slack subcommand: ${subcommand ?? '(none)'}`);
  stderr('Supported: post-message, read-thread');
  return 1;
}

// =============================================================================
// Handlers — Linear
// =============================================================================

function handleLinearCreateIssueCommand(argv: readonly string[], io: CliIO): number {
  const stdout = io.stdout ?? console.log;
  const stderr = io.stderr ?? console.error;

  const title = argv[0];
  if (!title) {
    stderr('Usage: agentsy connectors linear create-issue <title> [--description <text>] [--team <id>]');
    return 1;
  }

  const description = getFlagValue(argv, '--description') ?? '(no description)';
  const teamId = getFlagValue(argv, '--team') ?? '(default team)';

  stdout('Linear issue creation stub:');
  stdout(`  Title:       ${title}`);
  stdout(`  Description: ${description}`);
  stdout(`  Team ID:     ${teamId}`);
  stdout('');
  stdout('Note: Linear issue creation requires the Linear API token to be configured via secrets.');
  stdout('      Run `agentsy secrets set linear_api_token <token>` to configure it.');
  stdout('      This is a stub — the real integration will be wired in a later phase.');
  return 0;
}

// =============================================================================
// Handlers — GitHub
// =============================================================================

function handleGitHubCommand(argv: readonly string[], io: CliIO): number {
  const stdout = io.stdout ?? console.log;
  const stderr = io.stderr ?? console.error;

  const command = argv[0];
  if (!command) {
    stderr('Usage: agentsy connectors github <command> [args...]');
    stderr('Example: agentsy connectors github list-issues');
    return 1;
  }

  stdout('GitHub operations are delegated to MCP (Model Context Protocol).');
  stdout('To use GitHub commands, configure a GitHub MCP server:');
  stdout('  agentsy mcp add github --command "npx @modelcontextprotocol/server-github"');
  stdout('');
  stdout(`Requested command: ${command} ${argv.slice(1).join(' ')}`);
  stdout('This is a stub — the real integration will be wired in a later phase.');
  return 0;
}

// =============================================================================
// Router
// =============================================================================

export async function runConnectorsCommand(argv: readonly string[], io: CliIO): Promise<number> {
  const subcommand = argv[0];
  const rest = argv.slice(1);

  switch (subcommand) {
    case 'list': {
      return await handleConnectorsListCommand(rest, io);
    }
    case 'check': {
      return await handleConnectorsCheckCommand(rest, io);
    }
    case 'slack': {
      return await handleSlackCommand(rest, io);
    }
    case 'linear': {
      return handleLinearCreateIssueCommand(rest, io);
    }
    case 'github': {
      return handleGitHubCommand(rest, io);
    }
    default: {
      const stderr = io.stderr ?? console.error;
      stderr(`Unknown connectors subcommand: ${subcommand ?? '(none)'}`);
      stderr('Supported: list, check, slack, linear, github');
      return 1;
    }
  }
}
