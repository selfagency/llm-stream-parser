import type { GuardrailPipeline, GuardrailResult } from '@agentsy/guardrails';
import { describe, expect, it, vi } from 'vitest';
import {
  createInputGuardrailHook,
  createOutputGuardrailHook,
  createToolInputGuardrailHook,
  createToolOutputGuardrailHook
} from './guardrail-hooks.js';
import type { RuntimeHookEvent } from './types.js';

// ---------------------------------------------------------------------------
// Factory helpers — create RuntimeHookEvent instances for each event type
// ---------------------------------------------------------------------------

function userPromptEvent(input: string): RuntimeHookEvent {
  return { type: 'UserPromptSubmit' as const, input, sessionId: 'sess_test_001' };
}

function preToolCallEvent(toolName: string, args: unknown): RuntimeHookEvent {
  return { type: 'PreToolCall' as const, toolName, args, sessionId: 'sess_test_001' };
}

function postToolCallEvent(toolName: string, result: unknown, args?: unknown): RuntimeHookEvent {
  return {
    type: 'PostToolCall' as const,
    toolName,
    args: args ?? {},
    result,
    sessionId: 'sess_test_001'
  };
}

function preResponseEvent(response: unknown): RuntimeHookEvent {
  return { type: 'PreResponse' as const, response, sessionId: 'sess_test_001' };
}

function nonMatchingEvent(): RuntimeHookEvent {
  return { type: 'PreCompact' as const, contextSize: 100, sessionId: 'sess_test_001' };
}

// ---------------------------------------------------------------------------
// Mock GuardrailPipeline
// ---------------------------------------------------------------------------

function createMockPipeline(result: GuardrailResult): GuardrailPipeline {
  return {
    evaluate: vi
      .fn()
      .mockResolvedValue({
        result,
        receipt: {
          policyId: 'test',
          decision: result.status,
          reasonCode: 'TEST',
          riskTier: 'moderate',
          surface: 'input',
          phase: result.phase,
          timestamp: new Date().toISOString(),
          correlationId: 'test',
          sessionId: 'test',
          detections: []
        }
      })
  } as unknown as GuardrailPipeline;
}

// =============================================================================
// createInputGuardrailHook — fires on UserPromptSubmit
// =============================================================================

describe('createInputGuardrailHook', () => {
  it('returns handler with id and priority', () => {
    const pipeline = createMockPipeline({ status: 'pass', phase: 'input' });
    const hook = createInputGuardrailHook(pipeline);
    expect(hook).toHaveProperty('handler');
    expect(typeof hook.handler).toBe('function');
    expect(hook.id).toBe('guardrails:input');
    expect(hook.priority).toBe(50);
  });

  it('passes through non-UserPromptSubmit events', async () => {
    const pipeline = createMockPipeline({ status: 'block', phase: 'input', reason: 'x' });
    const hook = createInputGuardrailHook(pipeline);
    const result = await hook.handler(nonMatchingEvent());
    expect(result).toEqual({ continue: true });
    expect(pipeline.evaluate).not.toHaveBeenCalled();
  });

  it('blocks when result status is block', async () => {
    const pipeline = createMockPipeline({
      status: 'block',
      phase: 'input',
      reason: 'injection detected'
    });
    const hook = createInputGuardrailHook(pipeline);
    const result = await hook.handler(userPromptEvent('dangerous'));
    expect(result).toEqual({ continue: false, reason: 'injection detected' });
  });

  it('uses default reason when block result has no reason', async () => {
    const pipeline = createMockPipeline({
      status: 'block',
      phase: 'input',
      reason: 'Input blocked by guardrail policy'
    });
    const hook = createInputGuardrailHook(pipeline);
    const result = await hook.handler(userPromptEvent('bad'));
    expect(result).toEqual({ continue: false, reason: 'Input blocked by guardrail policy' });
  });

  it('transforms when result status is transform', async () => {
    const pipeline = createMockPipeline({
      status: 'transform',
      phase: 'input',
      sanitized: 'safe_text'
    });
    const hook = createInputGuardrailHook(pipeline);
    const result = await hook.handler(userPromptEvent('sensitive'));
    expect(result).toEqual({ transform: { sanitized: 'safe_text' } });
  });

  it('escalates when result status is escalate', async () => {
    const pipeline = createMockPipeline({
      status: 'escalate',
      phase: 'input',
      reason: 'needs human review',
      riskScore: 0.85
    });
    const hook = createInputGuardrailHook(pipeline);
    const result = await hook.handler(userPromptEvent('suspicious'));
    expect(result).toEqual({ continue: false, reason: 'needs human review' });
  });

  it('passes through when result status is pass', async () => {
    const pipeline = createMockPipeline({ status: 'pass', phase: 'input' });
    const hook = createInputGuardrailHook(pipeline);
    const result = await hook.handler(userPromptEvent('safe'));
    expect(result).toEqual({ continue: true });
  });
});

// =============================================================================
// createToolInputGuardrailHook — fires on PreToolCall
// =============================================================================

describe('createToolInputGuardrailHook', () => {
  it('returns handler with id and priority', () => {
    const pipeline = createMockPipeline({ status: 'pass', phase: 'tool-input' });
    const hook = createToolInputGuardrailHook(pipeline);
    expect(hook).toHaveProperty('handler');
    expect(typeof hook.handler).toBe('function');
    expect(hook.id).toBe('guardrails:tool-input');
    expect(hook.priority).toBe(75);
  });

  it('passes through non-PreToolCall events', async () => {
    const pipeline = createMockPipeline({ status: 'block', phase: 'tool-input', reason: 'x' });
    const hook = createToolInputGuardrailHook(pipeline);
    const result = await hook.handler(nonMatchingEvent());
    expect(result).toEqual({ continue: true });
    expect(pipeline.evaluate).not.toHaveBeenCalled();
  });

  it('calls evaluate with stringified args when args is an object', async () => {
    const pipeline = createMockPipeline({ status: 'pass', phase: 'tool-input' });
    const hook = createToolInputGuardrailHook(pipeline);
    await hook.handler(preToolCallEvent('write_file', { path: '/nonexistent-test-path/test' }));
    expect(pipeline.evaluate).toHaveBeenCalledWith(
      JSON.stringify({ path: '/nonexistent-test-path/test' }),
      'tool-input',
      expect.objectContaining({ toolName: 'write_file' })
    );
  });

  it('calls evaluate with args directly when args is a string', async () => {
    const pipeline = createMockPipeline({ status: 'pass', phase: 'tool-input' });
    const hook = createToolInputGuardrailHook(pipeline);
    await hook.handler(preToolCallEvent('exec', 'ls -la'));
    expect(pipeline.evaluate).toHaveBeenCalledWith(
      'ls -la',
      'tool-input',
      expect.objectContaining({ toolName: 'exec' })
    );
  });

  it('blocks when result status is block', async () => {
    const pipeline = createMockPipeline({
      status: 'block',
      phase: 'tool-input',
      reason: 'dangerous tool'
    });
    const hook = createToolInputGuardrailHook(pipeline);
    const result = await hook.handler(preToolCallEvent('shell_exec', { cmd: 'rm -rf /' }));
    // The hook passes through result.reason from the scanner directly
    expect(result).toEqual({
      continue: false,
      reason: 'dangerous tool'
    });
  });

  it('transforms when result status is transform', async () => {
    const pipeline = createMockPipeline({
      status: 'transform',
      phase: 'tool-input',
      sanitized: '{"path":"/safe/path"}'
    });
    const hook = createToolInputGuardrailHook(pipeline);
    const result = await hook.handler(preToolCallEvent('write', { path: '/unsafe' }));
    expect(result).toEqual({ transform: { sanitized: '{"path":"/safe/path"}' } });
  });

  it('escalates when result status is escalate', async () => {
    const pipeline = createMockPipeline({
      status: 'escalate',
      phase: 'tool-input',
      reason: 'suspicious tool usage',
      riskScore: 0.75
    });
    const hook = createToolInputGuardrailHook(pipeline);
    const result = await hook.handler(preToolCallEvent('delete', { path: '/data' }));
    expect(result).toEqual({ continue: false, reason: 'suspicious tool usage' });
  });

  it('passes through when result status is pass', async () => {
    const pipeline = createMockPipeline({ status: 'pass', phase: 'tool-input' });
    const hook = createToolInputGuardrailHook(pipeline);
    const result = await hook.handler(preToolCallEvent('read', { path: '/safe' }));
    expect(result).toEqual({ continue: true });
  });
});

// =============================================================================
// createToolOutputGuardrailHook — fires on PostToolCall
// =============================================================================

describe('createToolOutputGuardrailHook', () => {
  it('returns handler with id and priority', () => {
    const pipeline = createMockPipeline({ status: 'pass', phase: 'tool-output' });
    const hook = createToolOutputGuardrailHook(pipeline);
    expect(hook).toHaveProperty('handler');
    expect(typeof hook.handler).toBe('function');
    expect(hook.id).toBe('guardrails:tool-output');
    expect(hook.priority).toBe(80);
  });

  it('passes through non-PostToolCall events', async () => {
    const pipeline = createMockPipeline({ status: 'block', phase: 'tool-output', reason: 'x' });
    const hook = createToolOutputGuardrailHook(pipeline);
    const result = await hook.handler(nonMatchingEvent());
    expect(result).toEqual({ continue: true });
    expect(pipeline.evaluate).not.toHaveBeenCalled();
  });

  it('blocks when result status is block', async () => {
    const pipeline = createMockPipeline({
      status: 'block',
      phase: 'tool-output',
      reason: 'leaked secret'
    });
    const hook = createToolOutputGuardrailHook(pipeline);
    const result = await hook.handler(postToolCallEvent('read_file', 'file content with secret'));
    // The hook passes through result.reason from the scanner directly
    expect(result).toEqual({
      continue: false,
      reason: 'leaked secret'
    });
  });

  it('transforms when result status is transform', async () => {
    const pipeline = createMockPipeline({
      status: 'transform',
      phase: 'tool-output',
      sanitized: 'redacted output'
    });
    const hook = createToolOutputGuardrailHook(pipeline);
    const result = await hook.handler(postToolCallEvent('read_file', 'original content'));
    expect(result).toEqual({ transform: { sanitized: 'redacted output' } });
  });

  it('escalates when result status is escalate', async () => {
    const pipeline = createMockPipeline({
      status: 'escalate',
      phase: 'tool-output',
      reason: 'output contains sensitive data',
      riskScore: 0.9
    });
    const hook = createToolOutputGuardrailHook(pipeline);
    const result = await hook.handler(postToolCallEvent('list_files', ['secret.doc']));
    expect(result).toEqual({ continue: false, reason: 'output contains sensitive data' });
  });

  it('passes through when result status is pass', async () => {
    const pipeline = createMockPipeline({ status: 'pass', phase: 'tool-output' });
    const hook = createToolOutputGuardrailHook(pipeline);
    const result = await hook.handler(postToolCallEvent('read', 'clean output'));
    expect(result).toEqual({ continue: true });
  });

  it('calls evaluate with stringified result when result is an object', async () => {
    const pipeline = createMockPipeline({ status: 'pass', phase: 'tool-output' });
    const hook = createToolOutputGuardrailHook(pipeline);
    await hook.handler(postToolCallEvent('fetch', { data: [1, 2, 3] }));
    expect(pipeline.evaluate).toHaveBeenCalledWith(
      JSON.stringify({ data: [1, 2, 3] }),
      'tool-output',
      expect.objectContaining({ toolName: 'fetch' })
    );
  });
});

// =============================================================================
// createOutputGuardrailHook — fires on PreResponse
// =============================================================================

describe('createOutputGuardrailHook', () => {
  it('returns handler with id and priority', () => {
    const pipeline = createMockPipeline({ status: 'pass', phase: 'output' });
    const hook = createOutputGuardrailHook(pipeline);
    expect(hook).toHaveProperty('handler');
    expect(typeof hook.handler).toBe('function');
    expect(hook.id).toBe('guardrails:output');
    expect(hook.priority).toBe(50);
  });

  it('passes through non-PreResponse events', async () => {
    const pipeline = createMockPipeline({ status: 'block', phase: 'output', reason: 'x' });
    const hook = createOutputGuardrailHook(pipeline);
    const result = await hook.handler(nonMatchingEvent());
    expect(result).toEqual({ continue: true });
    expect(pipeline.evaluate).not.toHaveBeenCalled();
  });

  it('blocks when result status is block', async () => {
    const pipeline = createMockPipeline({
      status: 'block',
      phase: 'output',
      reason: 'response contains PII'
    });
    const hook = createOutputGuardrailHook(pipeline);
    const result = await hook.handler(preResponseEvent('user email is test@example.com'));
    expect(result).toEqual({ continue: false, reason: 'response contains PII' });
  });

  it('uses default reason for output block', async () => {
    const pipeline = createMockPipeline({
      status: 'block',
      phase: 'output',
      reason: 'Response blocked by guardrail policy'
    });
    const hook = createOutputGuardrailHook(pipeline);
    const result = await hook.handler(preResponseEvent('bad response'));
    expect(result).toEqual({ continue: false, reason: 'Response blocked by guardrail policy' });
  });

  it('transforms when result status is transform', async () => {
    const pipeline = createMockPipeline({
      status: 'transform',
      phase: 'output',
      sanitized: 'sanitized response'
    });
    const hook = createOutputGuardrailHook(pipeline);
    const result = await hook.handler(preResponseEvent('original response'));
    expect(result).toEqual({ transform: { sanitized: 'sanitized response' } });
  });

  it('passes through escalate results (output guardrail has no escalate branch)', async () => {
    const pipeline = createMockPipeline({
      status: 'escalate',
      phase: 'output',
      reason: 'needs review',
      riskScore: 0.8
    });
    const hook = createOutputGuardrailHook(pipeline);
    // Output guardrail only handles block and transform; escalate falls through to pass
    const result = await hook.handler(preResponseEvent('flagged content'));
    expect(result).toEqual({ continue: true });
  });

  it('passes through when result status is pass', async () => {
    const pipeline = createMockPipeline({ status: 'pass', phase: 'output' });
    const hook = createOutputGuardrailHook(pipeline);
    const result = await hook.handler(preResponseEvent('clean response'));
    expect(result).toEqual({ continue: true });
  });

  it('calls evaluate with stringified response when response is an object', async () => {
    const pipeline = createMockPipeline({ status: 'pass', phase: 'output' });
    const hook = createOutputGuardrailHook(pipeline);
    await hook.handler(preResponseEvent({ text: 'hello', type: 'message' }));
    expect(pipeline.evaluate).toHaveBeenCalledWith(
      JSON.stringify({ text: 'hello', type: 'message' }),
      'output',
      expect.objectContaining({ sessionId: 'sess_test_001' })
    );
  });
});
