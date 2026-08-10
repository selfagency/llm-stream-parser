import type { GuardrailPhase, GuardrailPipeline } from '@agentsy/guardrails';
import type { HookResult, RuntimeHookEvent } from './types.js';

/**
 * Create a hook that runs input guardrails on `UserPromptSubmit`.
 *
 * The handler evaluates user input against the guardrail pipeline.
 * If blocked, execution halts. If transformed, the replacement is passed
 * as a transform payload.
 *
 * Priority defaults to 50 (before approval at 100).
 */
export function createInputGuardrailHook(pipeline: GuardrailPipeline): {
  handler: (event: RuntimeHookEvent) => Promise<HookResult>;
  id: string;
  priority: number;
} {
  return {
    id: 'guardrails:input',
    priority: 50,
    handler: (event: RuntimeHookEvent): Promise<HookResult> => {
      if (event.type !== 'UserPromptSubmit') {
        return Promise.resolve({ continue: true });
      }

      return pipeline
        .evaluate(event.input, 'input' satisfies GuardrailPhase, {
          sessionId: event.sessionId
        })
        .then(({ result }) => {
          if (result.status === 'block') {
            return {
              continue: false,
              reason: result.reason ?? 'Input blocked by guardrail policy'
            } satisfies HookResult;
          }

          if (result.status === 'transform' && result.sanitized) {
            return {
              transform: { sanitized: result.sanitized }
            } satisfies HookResult;
          }

          if (result.status === 'escalate' && result.reason) {
            // escalate is differentiated from block — pause for approval
            return {
              continue: false,
              reason: result.reason
            } satisfies HookResult;
          }

          if (result.status === 'quarantine' && result.reason) {
            return {
              continue: false,
              reason: `Quarantined: ${result.reason}`
            } satisfies HookResult;
          }

          return { continue: true } satisfies HookResult;
        });
    }
  };
}

/**
 * Create a hook that runs tool input guardrails on `PreToolCall`.
 *
 * Evaluates tool arguments against the pipeline before execution.
 * Priority defaults to 75 (before approval at 100, after input at 50).
 */
export function createToolInputGuardrailHook(pipeline: GuardrailPipeline): {
  handler: (event: RuntimeHookEvent) => Promise<HookResult>;
  id: string;
  priority: number;
} {
  return {
    id: 'guardrails:tool-input',
    priority: 75,
    handler: (event: RuntimeHookEvent): Promise<HookResult> => {
      if (event.type !== 'PreToolCall') {
        return Promise.resolve({ continue: true });
      }

      return pipeline
        .evaluate(
          typeof event.args === 'string' ? event.args : JSON.stringify(event.args),
          'tool-input' satisfies GuardrailPhase,
          {
            sessionId: event.sessionId,
            toolName: event.toolName
          }
        )
        .then(({ result }) => {
          if (result.status === 'block') {
            return {
              continue: false,
              reason: result.reason ?? `Tool call "${event.toolName}" blocked by guardrail`
            } satisfies HookResult;
          }

          if (result.status === 'transform' && result.sanitized) {
            return {
              transform: { sanitized: result.sanitized }
            } satisfies HookResult;
          }

          if (result.status === 'escalate' && result.reason) {
            return {
              continue: false,
              reason: result.reason
            } satisfies HookResult;
          }

          if (result.status === 'quarantine' && result.reason) {
            return {
              continue: false,
              reason: `Quarantined: ${result.reason}`
            } satisfies HookResult;
          }

          return { continue: true } satisfies HookResult;
        });
    }
  };
}

/**
 * Create a hook that runs tool output guardrails on `PostToolCall`.
 *
 * Evaluates tool results after execution. If blocked, the hook stops
 * the result from reaching the model/user.
 *
 * Priority defaults to 80.
 */
export function createToolOutputGuardrailHook(pipeline: GuardrailPipeline): {
  handler: (event: RuntimeHookEvent) => Promise<HookResult>;
  id: string;
  priority: number;
} {
  return {
    id: 'guardrails:tool-output',
    priority: 80,
    handler: (event: RuntimeHookEvent): Promise<HookResult> => {
      if (event.type !== 'PostToolCall') {
        return Promise.resolve({ continue: true });
      }

      return pipeline
        .evaluate(
          typeof event.result === 'string' ? event.result : JSON.stringify(event.result),
          'tool-output' satisfies GuardrailPhase,
          {
            sessionId: event.sessionId,
            toolName: event.toolName
          }
        )
        .then(({ result }) => {
          if (result.status === 'block') {
            return {
              continue: false,
              reason: result.reason ?? `Tool result from "${event.toolName}" blocked by guardrail`
            } satisfies HookResult;
          }

          if (result.status === 'transform' && result.sanitized) {
            return {
              transform: { sanitized: result.sanitized }
            } satisfies HookResult;
          }

          if (result.status === 'escalate' && result.reason) {
            return {
              continue: false,
              reason: result.reason
            } satisfies HookResult;
          }

          if (result.status === 'quarantine' && result.reason) {
            return {
              continue: false,
              reason: `Quarantined: ${result.reason}`
            } satisfies HookResult;
          }

          return { continue: true } satisfies HookResult;
        });
    }
  };
}

/**
 * Create a hook that runs output guardrails on `PreResponse`.
 *
 * Evaluates the model response before it reaches the user.
 * Priority defaults to 50.
 */
export function createOutputGuardrailHook(pipeline: GuardrailPipeline): {
  handler: (event: RuntimeHookEvent) => Promise<HookResult>;
  id: string;
  priority: number;
} {
  return {
    id: 'guardrails:output',
    priority: 50,
    handler: (event: RuntimeHookEvent): Promise<HookResult> => {
      if (event.type !== 'PreResponse') {
        return Promise.resolve({ continue: true });
      }

      return pipeline
        .evaluate(
          typeof event.response === 'string' ? event.response : JSON.stringify(event.response),
          'output' satisfies GuardrailPhase,
          {
            sessionId: event.sessionId
          }
        )
        .then(({ result }) => {
          if (result.status === 'block') {
            return {
              continue: false,
              reason: result.reason ?? 'Response blocked by guardrail policy'
            } satisfies HookResult;
          }

          if (result.status === 'transform' && result.sanitized) {
            return {
              transform: { sanitized: result.sanitized }
            } satisfies HookResult;
          }

          if (result.status === 'quarantine' && result.reason) {
            return {
              continue: false,
              reason: `Quarantined: ${result.reason}`
            } satisfies HookResult;
          }

          return { continue: true } satisfies HookResult;
        });
    }
  };
}

// =============================================================================
// Phase 10 — guardrail lifecycle hooks
// =============================================================================

/**
 * Create a hook that runs retrieval guardrails on `PreRetrieval`.
 *
 * Evaluates the retrieval query before RAG lookup.
 * Priority defaults to 65.
 */
export function createRetrievalGuardrailHook(pipeline: GuardrailPipeline): {
  handler: (event: RuntimeHookEvent) => Promise<HookResult>;
  id: string;
  priority: number;
} {
  return {
    id: 'guardrails:retrieval',
    priority: 65,
    handler: (event: RuntimeHookEvent): Promise<HookResult> => {
      if (event.type !== 'PreRetrieval') {
        return Promise.resolve({ continue: true });
      }

      return pipeline
        .evaluate(event.query, 'retrieval' satisfies GuardrailPhase, {
          sessionId: event.sessionId,
          retrievalDomains: event.retrievalDomains
        })
        .then(({ result }) => {
          if (result.status === 'block') {
            return {
              continue: false,
              reason: result.reason ?? 'Retrieval query blocked by guardrail'
            } satisfies HookResult;
          }
          if (result.status === 'transform' && result.sanitized) {
            return { transform: { sanitized: result.sanitized } } satisfies HookResult;
          }
          return { continue: true } satisfies HookResult;
        });
    }
  };
}

/**
 * Create a hook that runs post-retrieval guardrails on `PostRetrieval`.
 *
 * Evaluates retrieved content before it is injected into model context.
 * Priority defaults to 66.
 */
export function createPostRetrievalGuardrailHook(pipeline: GuardrailPipeline): {
  handler: (event: RuntimeHookEvent) => Promise<HookResult>;
  id: string;
  priority: number;
} {
  return {
    id: 'guardrails:post-retrieval',
    priority: 66,
    handler: (event: RuntimeHookEvent): Promise<HookResult> => {
      if (event.type !== 'PostRetrieval') {
        return Promise.resolve({ continue: true });
      }

      const combined = event.retrieved.map(r => r.content).join('\n');
      return pipeline
        .evaluate(combined, 'retrieval' satisfies GuardrailPhase, {
          sessionId: event.sessionId
        })
        .then(({ result }) => {
          if (result.status === 'block') {
            return {
              continue: false,
              reason: result.reason ?? 'Retrieved content blocked by guardrail'
            } satisfies HookResult;
          }
          if (result.status === 'transform' && result.sanitized) {
            return { transform: { sanitized: result.sanitized } } satisfies HookResult;
          }
          return { continue: true } satisfies HookResult;
        });
    }
  };
}

/**
 * Create a hook that runs memory write guardrails on `PreMemoryWrite`.
 *
 * Evaluates memory entries before they are persisted.
 * Priority defaults to 70.
 */
export function createMemoryWriteGuardrailHook(pipeline: GuardrailPipeline): {
  handler: (event: RuntimeHookEvent) => Promise<HookResult>;
  id: string;
  priority: number;
} {
  return {
    id: 'guardrails:memory-write',
    priority: 70,
    handler: (event: RuntimeHookEvent): Promise<HookResult> => {
      if (event.type !== 'PreMemoryWrite') {
        return Promise.resolve({ continue: true });
      }

      const combined = event.entries.map(e => e.content).join('\n');
      return pipeline
        .evaluate(combined, 'memory' satisfies GuardrailPhase, {
          sessionId: event.sessionId
        })
        .then(({ result }) => {
          if (result.status === 'block') {
            return {
              continue: false,
              reason: result.reason ?? 'Memory write blocked by guardrail'
            } satisfies HookResult;
          }
          if (result.status === 'transform' && result.sanitized) {
            return { transform: { sanitized: result.sanitized } } satisfies HookResult;
          }
          return { continue: true } satisfies HookResult;
        });
    }
  };
}

/**
 * Create a hook that runs action guardrails on `PreAction`.
 *
 * Evaluates high-impact action parameters before execution.
 * Priority defaults to 77 (after tool-input at 75, before tool-output at 80).
 */
export function createPreActionGuardrailHook(pipeline: GuardrailPipeline): {
  handler: (event: RuntimeHookEvent) => Promise<HookResult>;
  id: string;
  priority: number;
} {
  return {
    id: 'guardrails:pre-action',
    priority: 77,
    handler: (event: RuntimeHookEvent): Promise<HookResult> => {
      if (event.type !== 'PreAction') {
        return Promise.resolve({ continue: true });
      }

      const input = JSON.stringify(event.params);
      return pipeline
        .evaluate(input, 'action' satisfies GuardrailPhase, {
          sessionId: event.sessionId,
          actionName: event.actionName,
          approvalGranted: event.approvalGranted,
          params: event.params
        })
        .then(({ result }) => {
          if (result.status === 'block') {
            return { continue: false, reason: result.reason ?? 'Action blocked by guardrail' } satisfies HookResult;
          }
          if (result.status === 'escalate' && result.reason) {
            return {
              continue: false,
              reason: result.reason,
              approvalRequired: { approvalId: `action_${event.actionName}` },
              actionName: event.actionName,
              params: event.params as Record<string, unknown>
            } satisfies HookResult;
          }
          return { continue: true } satisfies HookResult;
        });
    }
  };
}

/**
 * Create a hook that runs egress guardrails on `PreEgress`.
 *
 * Evaluates outbound HTTP requests before they are sent.
 * Priority defaults to 85.
 */
export function createEgressGuardrailHook(pipeline: GuardrailPipeline): {
  handler: (event: RuntimeHookEvent) => Promise<HookResult>;
  id: string;
  priority: number;
} {
  return {
    id: 'guardrails:egress',
    priority: 85,
    handler: (event: RuntimeHookEvent): Promise<HookResult> => {
      if (event.type !== 'PreEgress') {
        return Promise.resolve({ continue: true });
      }

      const input = `${event.method} ${event.url}${event.body ? `\n${event.body}` : ''}`;
      return pipeline
        .evaluate(input, 'egress' satisfies GuardrailPhase, {
          sessionId: event.sessionId,
          url: event.url,
          method: event.method,
          headers: event.headers
        })
        .then(({ result }) => {
          if (result.status === 'block') {
            return {
              continue: false,
              reason: result.reason ?? 'Egress request blocked by guardrail'
            } satisfies HookResult;
          }
          if (result.status === 'transform' && result.sanitized) {
            return { transform: { sanitized: result.sanitized } } satisfies HookResult;
          }
          return { continue: true } satisfies HookResult;
        });
    }
  };
}
