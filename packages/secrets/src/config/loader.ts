/**
 * Config file discovery and loading for `.agentsy/secrets.yaml`.
 *
 * Discovery order:
 *   1. `./.agentsy/secrets.yaml` (project-local)
 *   2. `./secrets.yaml` (repo-root)
 *   3. `~/.config/agentsy/secrets.yaml` (user-global)
 *
 * First found wins. Returns an empty config if no file exists.
 */

import { access, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

import { parse as parseYaml } from 'yaml';
import type { SecretsConfig } from './schema.js';
import { secretsConfigSchema } from './schema.js';

/** Possible config file locations in priority order. */
function getConfigPaths(rootDir?: string): string[] {
  const cwd = rootDir ? resolve(rootDir) : process.cwd();
  return [
    join(cwd, '.agentsy', 'secrets.yaml'),
    join(cwd, 'secrets.yaml'),
    join(homedir(), '.config', 'agentsy', 'secrets.yaml')
  ];
}

/**
 * Discover and load the secrets config file.
 *
 * @param rootDir - Optional working directory (defaults to process.cwd()).
 * @returns A validated SecretsConfig (empty config if no file found).
 */
export async function loadConfig(rootDir?: string): Promise<SecretsConfig> {
  const paths = getConfigPaths(rootDir);

  for (const filePath of paths) {
    let exists = false;
    try {
      await access(filePath);
      exists = true;
    } catch {
      // File not found — try next path.
    }

    if (!exists) {
      continue;
    }

    const raw = await readFile(filePath, 'utf-8');
    const parsed = parseYaml(raw) as Record<string, unknown>;
    return secretsConfigSchema.parse(parsed);
  }

  // No config file found — return defaults.
  return secretsConfigSchema.parse({});
}

/**
 * Synchronously discover the config file path (for CLI init checks).
 * Returns the first existing path, or the project-local path as default.
 */
export async function discoverConfigPath(rootDir?: string): Promise<string> {
  const paths = getConfigPaths(rootDir);

  for (const filePath of paths) {
    try {
      await access(filePath);
      return filePath;
    } catch {
      // Try next path.
    }
  }

  // Return the preferred (project-local) path as default.
  return paths[0] as string;
}
