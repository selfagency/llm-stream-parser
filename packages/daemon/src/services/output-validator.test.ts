/**
 * Tests for OutputValidator — schema validation + autoRepair.
 *
 * Acceptance criteria:
 * - Validates structured output against JSONSchema before returning to client
 * - autoRepair attempts fix for malformed JSON with maxRepairAttempts
 * - Returns ValidationResult with valid flag, data or error details
 * - Integrated into daemon stream pipeline
 * - Unit: valid pass, invalid fail, autoRepair recovery, max attempts exhausted
 * - Integration: daemon structured output endpoint validates and repairs
 */

import { describe, expect, it, vi } from 'vitest';
import {
  createOutputValidator,
  OutputValidator,
  OutputValidatorService,
  validateStructuredOutput,
  validateStructuredOutputAsync
} from './output-validator.js';

// ── Shared schemas ─────────────────────────────────────────────────────

const simpleSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    age: { type: 'number' }
  },
  required: ['name']
};

const strictSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    age: { type: 'number' }
  },
  required: ['name', 'age'],
  additionalProperties: false
};

const nestedSchema = {
  type: 'object',
  properties: {
    user: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        email: { type: 'string', format: 'email' }
      },
      required: ['id']
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1
    }
  },
  required: ['user']
};

// ── Factory ────────────────────────────────────────────────────────────

describe('createOutputValidator factory', () => {
  it('creates a validator with default config', () => {
    const validator = createOutputValidator();
    expect(validator).toBeDefined();
    expect(typeof validator.validateSync).toBe('function');
    expect(typeof validator.validate).toBe('function');
  });

  it('exposes repair strategies list', () => {
    const validator = createOutputValidator();
    const strategies = validator.getRepairStrategies();
    expect(strategies.length).toBeGreaterThan(0);
    expect(strategies).toContain('repairStripFences');
  });
});

// ── Valid pass ─────────────────────────────────────────────────────────

describe('OutputValidator — valid schema pass', () => {
  it('validates correct JSON against schema', () => {
    const v = createOutputValidator();
    const result = v.validateSync('{"name": "Alice", "age": 30}', simpleSchema);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.data).toEqual({ name: 'Alice', age: 30 });
      expect(result.attempts).toBe(1);
      expect(result.repaired).toBe(false);
    }
  });

  it('parses JSON wrapped in markdown code fences', () => {
    const v = createOutputValidator();
    const raw = '```json\n{"name": "Bob"}\n```';
    const result = v.validateSync(raw, simpleSchema);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect((result.data as { name: string }).name).toBe('Bob');
    }
  });

  it('extracts JSON from surrounding prose', () => {
    const v = createOutputValidator();
    const raw = 'Here is the result: {"name": "Carol"} — hope it helps';
    const result = v.validateSync(raw, simpleSchema);
    expect(result.valid).toBe(true);
  });

  it('validates nested schema', () => {
    const v = createOutputValidator();
    const raw = JSON.stringify({ user: { id: 'u-1', email: 'a@b.com' }, tags: ['x'] });
    const result = v.validateSync(raw, nestedSchema);
    expect(result.valid).toBe(true);
  });
});

// ── Invalid fail ───────────────────────────────────────────────────────

describe('OutputValidator — invalid schema fail', () => {
  it('fails when required property missing', () => {
    const v = createOutputValidator();
    const result = v.validateSync('{"age": 30}', simpleSchema);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('missing required');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.attempts).toBe(1);
    }
  });

  it('fails when type mismatched', () => {
    const v = createOutputValidator();
    const result = v.validateSync('{"name": 123}', simpleSchema);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('expected string');
    }
  });

  it('fails on invalid JSON without autoRepair', () => {
    const v = createOutputValidator({ defaultAutoRepair: false });
    const result = v.validateSync('{ invalid json', simpleSchema);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.parseError).toBeDefined();
      expect(result.repaired).toBe(false);
    }
  });

  it('fails on additionalProperties when disallowed', () => {
    const v = createOutputValidator();
    const result = v.validateSync('{"name": "A", "age": 1, "extra": true}', strictSchema);
    expect(result.valid).toBe(false);
  });

  it('fails on array minItems violation', () => {
    const v = createOutputValidator();
    const result = v.validateSync('{"user": {"id": "1"}, "tags": []}', nestedSchema);
    expect(result.valid).toBe(false);
  });
});

// ── autoRepair recovery ────────────────────────────────────────────────

describe('OutputValidator — autoRepair recovery', () => {
  it('repairs trailing comma', () => {
    const v = createOutputValidator();
    const raw = '{"name": "Alice", "age": 30,}';
    const result = v.validateSync(raw, simpleSchema, { autoRepair: true, maxRepairAttempts: 3 });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.repaired).toBe(true);
      expect(result.attempts).toBeGreaterThan(1);
    }
  });

  it('repairs incomplete JSON (missing closing brace)', () => {
    const v = createOutputValidator();
    const raw = '{"name": "Alice", "age": 30';
    const result = v.validateSync(raw, simpleSchema, { autoRepair: true, maxRepairAttempts: 3 });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.repaired).toBe(true);
    }
  });

  it('repairs JSON with code fences and trailing commas combined', () => {
    const v = createOutputValidator();
    const raw = '```json\n{"name": "Bob",}\n```';
    const result = v.validateSync(raw, simpleSchema, { autoRepair: true, maxRepairAttempts: 5 });
    expect(result.valid).toBe(true);
  });

  it('repairs single-quoted JSON', () => {
    const v = createOutputValidator();
    const raw = "{'name': 'Carol'}";
    const result = v.validateSync(raw, simpleSchema, { autoRepair: true, maxRepairAttempts: 5 });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect((result.data as { name: string }).name).toBe('Carol');
    }
  });

  it('repairs unquoted keys', () => {
    const v = createOutputValidator();
    const raw = '{name: "Dave"}';
    const result = v.validateSync(raw, simpleSchema, { autoRepair: true, maxRepairAttempts: 6 });
    expect(result.valid).toBe(true);
  });

  it('calls onRepairAttempt callback', () => {
    const v = createOutputValidator();
    const cb = vi.fn();
    const raw = '{"name": "Eve",}';
    v.validateSync(raw, simpleSchema, {
      autoRepair: true,
      maxRepairAttempts: 3,
      onRepairAttempt: cb
    });
    // At least one repair attempt should have fired if repaired
    // (trailing comma strategy is 4th, but earlier strategies may also fire)
    expect(cb).toHaveBeenCalled();
  });

  it('succeeds after multiple attempts (attempts tracking)', () => {
    const v = createOutputValidator();
    // This needs at least 3 strategies: fences + extract + incomplete + trailing comma etc.
    // Craft input that only fixes on 3rd strategy (trailing comma)
    const raw = 'Result:\n```\n{"name": "Frank", "age": 40,}\n```';
    const result = v.validateSync(raw, simpleSchema, { autoRepair: true, maxRepairAttempts: 6 });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.attempts).toBeGreaterThan(1);
      expect(result.repairedOutput).toBeDefined();
    }
  });
});

// ── max attempts exhausted ─────────────────────────────────────────────

describe('OutputValidator — max attempts exhausted', () => {
  it('fails when maxRepairAttempts exceeded with irrecoverable input', () => {
    const v = createOutputValidator();
    const raw = 'this is not json at all, no braces whatsoever just text';
    const result = v.validateSync(raw, simpleSchema, { autoRepair: true, maxRepairAttempts: 2 });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.attempts).toBe(3); // 1 initial + 2 repairs
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  it('respects maxRepairAttempts = 0 (no repair)', () => {
    const v = createOutputValidator();
    const raw = '{"name": "Alice",}';
    const result = v.validateSync(raw, simpleSchema, { autoRepair: true, maxRepairAttempts: 0 });
    expect(result.valid).toBe(false);
    expect(result.attempts).toBe(1);
    expect(result.repaired).toBe(false);
  });

  it('respects maxRepairAttempts = 1', () => {
    const v = createOutputValidator();
    // Input that needs 2nd strategy but we only allow 1 — may still pass if first strategy fixes it
    // Use totally broken input to ensure failure
    const raw = '<<<not json>>>';
    const result = v.validateSync(raw, simpleSchema, { autoRepair: true, maxRepairAttempts: 1 });
    expect(result.valid).toBe(false);
    expect(result.attempts).toBe(2);
  });

  it('honors defaultMaxRepairAttempts from config', () => {
    const v = createOutputValidator({ defaultMaxRepairAttempts: 1, defaultAutoRepair: true });
    const raw = 'not json';
    const result = v.validateSync(raw, simpleSchema);
    expect(result.attempts).toBe(2); // 1 + defaultMax 1
  });
});

// ── Class wrapper ──────────────────────────────────────────────────────

describe('OutputValidatorService class', () => {
  it('validates via async validate method', async () => {
    const svc = new OutputValidatorService();
    await svc.start();
    const result = await svc.validate('{"name": "Grace"}', simpleSchema);
    expect(result.valid).toBe(true);
    await svc.stop();
  });

  it('has service lifecycle', async () => {
    const svc = new OutputValidatorService();
    expect(svc.state).toBe('stopped');
    await svc.start();
    expect(svc.state).toBe('running');
    await svc.sleep();
    expect(svc.state).toBe('stopped');
    await svc.wakeup();
    expect(svc.state).toBe('running');
    await svc.stop();
    expect(svc.state).toBe('stopped');
  });

  it('OutputValidator alias works', async () => {
    const svc = new OutputValidator({ defaultAutoRepair: true });
    const result = await svc.validate('{"name": "Hank",}', simpleSchema, {
      autoRepair: true,
      maxRepairAttempts: 5
    });
    expect(result.valid).toBe(true);
  });
});

// ── Helpers ─────────────────────────────────────────────────────────────

describe('validateStructuredOutput helpers', () => {
  it('sync helper validates correctly', () => {
    const result = validateStructuredOutput('{"name": "Ivy"}', simpleSchema);
    expect(result.valid).toBe(true);
  });

  it('async helper validates with autoRepair', async () => {
    const result = await validateStructuredOutputAsync('{"name": "Jack",}', simpleSchema, {
      autoRepair: true,
      maxRepairAttempts: 5
    });
    expect(result.valid).toBe(true);
  });
});

// ── Integration: daemon structured output endpoint ─────────────────────

describe('Integration — daemon structured output endpoint', () => {
  it('simulates daemon validating outputs before returning to client', () => {
    // Simulate what StreamManager / IPC handler would do:
    // LLM returns raw text, daemon validates against requested schema before emitting to client
    const validator = createOutputValidator({ defaultAutoRepair: true, defaultMaxRepairAttempts: 5 });

    const schema = {
      type: 'object',
      properties: {
        answer: { type: 'string' },
        confidence: { type: 'number', minimum: 0, maximum: 1 }
      },
      required: ['answer', 'confidence']
    };

    // Case 1: valid output — passes straight through
    const validRaw = '{"answer": "Paris is the capital", "confidence": 0.95}';
    const validResult = validator.validateSync(validRaw, schema);
    expect(validResult.valid).toBe(true);
    if (validResult.valid) {
      // Daemon would return this data to client
      expect(validResult.data).toMatchObject({ answer: expect.any(String) });
    }

    // Case 2: malformed but repairable — daemon auto-repairs before returning
    const repairableRaw = '```json\n{"answer": "Paris", "confidence": 0.9,}\n```';
    const repairedResult = validator.validateSync(repairableRaw, schema, {
      autoRepair: true,
      maxRepairAttempts: 5
    });
    expect(repairedResult.valid).toBe(true);
    if (repairedResult.valid) {
      expect(repairedResult.repaired).toBe(true);
    }

    // Case 3: unrepairable — daemon should return error to client
    const badRaw = 'I think the answer is Paris';
    const badResult = validator.validateSync(badRaw, schema, {
      autoRepair: true,
      maxRepairAttempts: 3
    });
    expect(badResult.valid).toBe(false);
    if (!badResult.valid) {
      expect(badResult.error).toBeDefined();
      expect(badResult.errors.length).toBeGreaterThan(0);
    }
  });

  it('integration with StreamManager-style usage and lifecycle', async () => {
    const svc = new OutputValidatorService({ defaultAutoRepair: true, defaultMaxRepairAttempts: 4 });
    await svc.start();

    // Simulate LLM streaming accumulated output that ends malformed
    // Actually incomplete: missing }
    const incomplete = '{"name": "IntegrationTest", "age": 42';
    const result = await svc.validate(incomplete, simpleSchema, { autoRepair: true, maxRepairAttempts: 4 });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect((result.data as { name: string }).name).toBe('IntegrationTest');
    }

    await svc.stop();
  });

  it('daemon pipeline helper used as guard before IPC broadcast', () => {
    // Mimic StreamManager deciding to validate structured output chunks
    function simulateDaemonReturn(raw: string): { success: boolean; payload: unknown } {
      const res = validateStructuredOutput(raw, simpleSchema, { autoRepair: true, maxRepairAttempts: 5 });
      if (!res.valid) {
        return { success: false, payload: { error: res.error } };
      }
      return { success: true, payload: res.data };
    }

    const ok = simulateDaemonReturn('{"name": "Pipeline"}');
    expect(ok.success).toBe(true);

    const repaired = simulateDaemonReturn('{"name": "Pipeline",}');
    expect(repaired.success).toBe(true);

    const failed = simulateDaemonReturn('not json');
    expect(failed.success).toBe(false);
  });
});
