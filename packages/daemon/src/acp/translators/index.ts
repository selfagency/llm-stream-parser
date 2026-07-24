// fallow-ignore-file unused-file

/**
 * ACP Translators — protocol-level transformation modules.
 *
 * Based on openclaw's 13-translator ACP implementation, agentsy
 * implements the 6 most critical translators for editor integration.
 *
 * @module
 */

export type { CancelScope } from './cancel-scoping.js';
export { CancelScopingTranslator } from './cancel-scoping.js';
export type { ErrorKind, ErrorKindResult } from './error-kind.js';
export { ErrorKindTranslator } from './error-kind.js';
export type { PermissionRequest } from './permission-relay.js';
export { PermissionRelayTranslator } from './permission-relay.js';
export { ReplayTranslator } from './replay.js';
export type { LineageInfo } from './session-lineage.js';
export { SessionLineageTranslator } from './session-lineage.js';
export type { ToolStreamEvent } from './tool-streaming.js';
export { ToolStreamingTranslator } from './tool-streaming.js';
export type { Translator, TranslatorContext, TranslatorResult } from './types.js';
