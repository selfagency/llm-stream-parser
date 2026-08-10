/**
 * AG-UI Protocol Integration
 *
 * Exports event types and adapter functions for integrating with the AG-UI protocol.
 * This module allows llm-stream-parser to emit AG-UI-compatible events for any frontend.
 */

export type {
  AgUiEvent,
  ReasoningEndEvent,
  ReasoningMessageContentEvent,
  ReasoningMessageEndEvent,
  ReasoningMessageStartEvent,
  ReasoningStartEvent,
  RunErrorEvent,
  RunFinishedEvent,
  RunStartedEvent,
  TextMessageContentEvent,
  ToolCallArgsEvent,
  ToolCallEndEvent,
  ToolCallStartEvent
} from '@agentsy/shared';
export { EventType } from '@agentsy/shared';
export type { AdapterOptions } from './adapter.js';
export { toAgUiStream } from './adapter.js';
export type { CopilotKitEvent, CustomUIEvent } from './event-converters.js';
export {
  convertEventStream,
  createEventConverter,
  toCopilotKitEvent,
  toCustomUIEvent
} from './event-converters.js';
export {
  createInterruptEvent,
  InterruptController,
  InterruptReason,
  TimeoutInterrupt
} from './interrupt-handler.js';
export type { Observable, Observer, Subscription } from './observable.js';
export { toObservable } from './observable.js';
export type { ReasoningMapperOptions } from './reasoning-mapper.js';
export { mapReasoningToEvents } from './reasoning-mapper.js';
export type { JsonPatchOp } from './state-manager.js';
export {
  applyJsonPatches,
  computeStateDelta,
  createStateDeltaEvent,
  createStateSnapshotEvent,
  StateManager
} from './state-manager.js';
