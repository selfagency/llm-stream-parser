/**
 * BootstrapService — daemon service for project auto-detection.
 *
 * On session open (ACP session/new or CLI invocation), BootstrapService:
 * 1. Checks if .agentsy/config.yml exists
 * 2. If not, runs scanProject() and writes config.yml
 * 3. Loads ProjectProfile and Magic Context compartments into the session
 * 4. Returns profile + recommendations to the agent
 *
 * @module
 */

import type { DbQueryFn } from '@agentsy/bootstrap';
import {
  configExists,
  createDefaultConfig,
  readConfig,
  recommend,
  scanProject,
  seedMagicContext,
  writeConfig
} from '@agentsy/bootstrap';
import type { Logger } from '../types.js';

// ── Service interface ───────────────────────────────────

export interface Service {
  readonly name: string;
  sleep(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  wakeup(): Promise<void>;
}

// ── Deps and result types ───────────────────────────────

export interface BootstrapServiceDeps {
  /** Optional database query function for seeding Magic Context compartments. */
  dbQuery?: DbQueryFn;
  logger: Logger;
}

export interface BootstrapResult {
  profile: import('@agentsy/bootstrap').ProjectProfile;
  recommendations: import('@agentsy/bootstrap').RecommendationEntry[];
}

// ── Service ─────────────────────────────────────────────

export class BootstrapService implements Service {
  readonly name = 'bootstrap';
  readonly #logger: Logger;
  readonly #dbQuery: DbQueryFn | undefined;

  constructor(deps: BootstrapServiceDeps) {
    this.#logger = deps.logger.child('bootstrap');
    this.#dbQuery = deps.dbQuery;
  }

  // biome-ignore lint/suspicious/useAwait: interface requires Promise return; impl is sync
  async start(): Promise<void> {
    this.#logger.debug('BootstrapService started');
  }

  // biome-ignore lint/suspicious/useAwait: interface requires Promise return; impl is sync
  async sleep(): Promise<void> {
    this.#logger.debug('BootstrapService sleeping');
  }

  // biome-ignore lint/suspicious/useAwait: interface requires Promise return; impl is sync
  async wakeup(): Promise<void> {
    this.#logger.debug('BootstrapService waking');
  }

  // biome-ignore lint/suspicious/useAwait: interface requires Promise return; impl is sync
  async stop(): Promise<void> {
    this.#logger.debug('BootstrapService stopped');
  }

  /**
   * Run the bootstrap sequence for a project root.
   *
   * This is the main entry point, called on session open. It:
   * 1. Checks if .agentsy/config.yml exists
   * 2. If not, scans the project and writes a default config
   * 3. Reads the config (whether freshly created or pre-existing)
   * 4. Seeds Magic Context compartments if a dbQuery was provided
   * 5. Generates and returns recommendations
   */
  async bootstrap(rootPath: string): Promise<BootstrapResult> {
    this.#logger.info(`Bootstrapping project at: ${rootPath}`);

    const exists = await configExists(rootPath);

    if (!exists) {
      this.#logger.info('No .agentsy/config.yml found — running project scan');
      const profile = await scanProject(rootPath);
      const config = createDefaultConfig(rootPath, profile);
      await writeConfig(rootPath, config);
      this.#logger.info(`Config written for ${profile.languages.join(', ')} project`);
    }

    const config = await readConfig(rootPath);
    if (!config) {
      throw new Error(`Failed to read .agentsy/config.yml after bootstrap at: ${rootPath}`);
    }

    // Seed Magic Context compartments if database is available
    const dbQuery = this.#dbQuery;
    if (dbQuery) {
      try {
        seedMagicContext(dbQuery, config.project.profile);
        this.#logger.debug('Magic Context compartments seeded');
      } catch (error) {
        this.#logger.warn(`Failed to seed Magic Context: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const recommendations = recommend(config.project.profile, config.installed);

    this.#logger.info(
      `Bootstrap complete — ${config.project.profile.languages.length} language(s), ${recommendations.length} recommendation(s)`
    );

    return {
      profile: config.project.profile,
      recommendations
    };
  }
}
