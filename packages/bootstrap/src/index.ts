/**
 * @agentsy/bootstrap — Project auto-detection, bootstrap, and component recommendation engine.
 *
 * @module
 */

export {
  type AgentsyConfig,
  configExists,
  configPath,
  createDefaultConfig,
  createProjectTools,
  type InstalledComponents,
  type RecommendationEntry,
  readConfig,
  writeConfig
} from './config.js';
export { type DbQueryFn, seedMagicContext } from './generators/index.js';
export { type WorkspaceConfig, WorkspaceManager } from './multi-root.js';
export { recommend } from './recommend.js';
export { type Framework, type Language, type PackageManager, type ProjectProfile, scanProject } from './scanner.js';
