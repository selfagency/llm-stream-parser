import type { ToolDefinition } from '../../definitions.js';
import {
  createShellTool as createPersistentShellTool,
  type PersistentShellManager,
  type ShellToolOptions
} from '../../shell/index.js';

export type { PersistentShell, PersistentShellManager } from '../../shell/index.js';

export interface ShellToolFactoryOptions extends ShellToolOptions {
  readonly manager?: PersistentShellManager;
}

/**
 * Factory for shell_exec tool that uses a persistent shell session per agent.
 *
 * This wrapper maintains backward compatibility with the previous stateless
 * implementation while now providing CWD tracking and env accumulation.
 * Each run_command invocation uses the persistent shell.
 */
export function createShellTool(options: ShellToolFactoryOptions = {}): ToolDefinition {
  return createPersistentShellTool(options);
}
