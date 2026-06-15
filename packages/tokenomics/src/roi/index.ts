/**
 * ROI module — compute return-on-investment from ledger data, expose
 * via MCP tools, and build ethical transparency reports.
 *
 * @module roi
 */

// Calculator
export type { AiAttributionBreakdown, RoiSnapshot } from './calculator.js';
export { computeRoiSnapshot, tryReadAiAttribution } from './calculator.js';

// MCP server
export type {
  ArtifactOutputSummary,
  CodeSurvivalSummary,
  CostPerUnitSummary,
  DeploymentCorrelation,
  FrustrationReport,
  McpToolName,
  SpendSummary
} from './mcp-server.js';
export {
  getArtifactOutput,
  getCodeSurvival,
  getCostPerUnit,
  getDeploymentCorrelation,
  getFrustrationReport,
  getSpendSummary,
  mcpTools
} from './mcp-server.js';

// Transparency report
export type { TransparencyReport } from './transparency-report.js';
export { buildTransparencyReport } from './transparency-report.js';
