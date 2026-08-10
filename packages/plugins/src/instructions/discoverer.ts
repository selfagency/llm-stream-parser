/**
 * Instructions discoverer — walks standard instruction file locations and
 * returns ordered {@link InstructionFile} results.
 *
 * Search roots (checked in order):
 * 1. `AGENTS.md` (project root)
 * 2. `CLAUDE.md` (project root)
 * 3. `copilot-instructions.md` (project root)
 * 4. `.cursor/rules/*.md` (project root)
 * 5. `~/.agentsy/instructions.md`
 * 6. `~/.config/agentsy/instructions.md`
 *
 * @module @agentsy/plugins/instructions
 */

import { readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { extname, resolve } from 'node:path';

import type { InstructionFile } from './types.js';

/**
 * Describes a single file root before resolution.
 */
interface FileRoot {
  /** Whether files from this root are always injected. */
  alwaysInject: boolean;
  /** True when the root is a glob pattern (e.g. `*.md` in a directory). */
  isGlob: boolean;
  /** Absolute path or path pattern to search. */
  path: string;
  /**
   * Priority assigned to files discovered at this root.
   * Higher values = higher precedence.
   */
  priority: number;
  /** Scope label for this root. */
  scope: 'workspace' | 'user';
}

/**
 * Discovers instruction files from well-known filesystem locations.
 *
 * The discoverer walks project-level roots first, then user-global
 * roots. Results are ordered by priority (highest first).
 */
export class InstructionsDiscoverer {
  readonly projectDir: string;
  /** Ordered list of file roots to search. */
  readonly roots: FileRoot[];

  /** @param projectDir - Project root directory. Defaults to `process.cwd()`. */
  constructor(projectDir?: string) {
    this.projectDir = projectDir ?? process.cwd();
    const userDir = homedir();

    this.roots = [
      {
        // Handoff documents — highest priority, always injected.
        // Written by ContextMonitor when an agent's context degrades.
        // Stored in .agentsy/handoffs/ so the glob discoverer can find them.
        path: resolve(this.projectDir, '.agentsy', 'handoffs'),
        priority: 95,
        scope: 'workspace',
        alwaysInject: true,
        isGlob: true
      },
      {
        path: resolve(this.projectDir, 'AGENTS.md'),
        priority: 90,
        scope: 'workspace',
        alwaysInject: true,
        isGlob: false
      },
      {
        path: resolve(this.projectDir, 'CLAUDE.md'),
        priority: 80,
        scope: 'workspace',
        alwaysInject: true,
        isGlob: false
      },
      {
        path: resolve(this.projectDir, 'copilot-instructions.md'),
        priority: 70,
        scope: 'workspace',
        alwaysInject: true,
        isGlob: false
      },
      {
        path: resolve(this.projectDir, '.cursor', 'rules'),
        priority: 60,
        scope: 'workspace',
        alwaysInject: false,
        isGlob: true
      },
      {
        path: resolve(userDir, '.agentsy', 'instructions.md'),
        priority: 50,
        scope: 'user',
        alwaysInject: false,
        isGlob: false
      },
      {
        path: resolve(userDir, '.config', 'agentsy', 'instructions.md'),
        priority: 40,
        scope: 'user',
        alwaysInject: false,
        isGlob: false
      }
    ];
  }

  /**
   * Discover instruction files across all configured roots.
   *
   * Results are sorted by priority in descending order (highest first).
   * Files that cannot be read are silently skipped.
   *
   * @returns All discovered instruction files, ordered by priority.
   */
  async discover(): Promise<InstructionFile[]> {
    const results: InstructionFile[] = [];
    const settled = await Promise.allSettled(this.roots.map(root => this.#discoverRoot(root)));

    for (const result of settled) {
      if (result.status === 'fulfilled') {
        results.push(...result.value);
      }
      // Rejected roots are silently skipped
    }

    return results.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Discover files from a single root definition.
   */
  async #discoverRoot(root: FileRoot): Promise<InstructionFile[]> {
    if (root.isGlob) {
      return this.#discoverGlob(root);
    }

    try {
      const content = await readFile(root.path, 'utf-8');
      return [
        {
          path: root.path,
          scope: root.scope,
          alwaysInject: root.alwaysInject,
          content,
          priority: root.priority
        }
      ];
    } catch {
      return [];
    }
  }

  /**
   * Discover files from a glob root (directory of `.md` files).
   */
  async #discoverGlob(root: FileRoot): Promise<InstructionFile[]> {
    try {
      const entries = await readdir(root.path, { withFileTypes: true });
      const mdFiles = entries.filter(entry => entry.isFile() && extname(entry.name) === '.md');

      const settled = await Promise.allSettled(
        mdFiles.map(async (entry): Promise<InstructionFile> => {
          const filePath = resolve(root.path, entry.name);
          const content = await readFile(filePath, 'utf-8');

          return {
            path: filePath,
            scope: root.scope,
            alwaysInject: root.alwaysInject,
            content,
            priority: root.priority
          } satisfies InstructionFile;
        })
      );

      return settled
        .filter((result): result is PromiseFulfilledResult<InstructionFile> => result.status === 'fulfilled')
        .map(result => result.value);
    } catch {
      return [];
    }
  }
}
