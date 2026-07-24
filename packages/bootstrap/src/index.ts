/**
 * @agentsy/bootstrap — Project auto-detection, bootstrap, and component recommendation engine.
 *
 * @module
 */

export {
  type AgentsyConfig,
  createDefaultConfig,
  createProjectTools,
  type InstalledComponents,
  type RecommendationEntry,
  readConfig,
  writeConfig
} from './config.js';
export { recommend } from './recommend.js';
export { type Framework, type Language, type PackageManager, type ProjectProfile, scanProject } from './scanner.js';
