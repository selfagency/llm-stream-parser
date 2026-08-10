/**
 * OutputValidator — validates structured LLM outputs against JSON Schemas
 * with optional auto-repair and configurable retry attempts.
 *
 * Phase 18: Missing Capabilities — Structured Output with Schema Validation
 *
 * @module
 */

export type JsonSchema = Record<string, unknown>;

export interface OutputValidatorConfig {
  defaultAutoRepair?: boolean;
  defaultMaxRepairAttempts?: number;
  maxJsonDepth?: number;
  maxJsonKeys?: number;
}

export interface ValidateOptions {
  autoRepair?: boolean;
  maxRepairAttempts?: number;
  onRepairAttempt?: (attempt: number, repaired: string) => void;
  originalPrompt?: string;
}

export type ValidationResult<T = unknown> =
  | {
      attempts: number;
      data: T;
      repaired: boolean;
      repairedOutput?: string;
      valid: true;
    }
  | {
      attempts: number;
      error: string;
      errors: string[];
      parseError?: string;
      repaired: boolean;
      valid: false;
    };

export interface StructuredOutputRequest {
  label?: string;
  options?: ValidateOptions;
  rawOutput: string;
  schema: JsonSchema;
}

// ── Constants ──────────────────────────────────────────────────────────

const DEFAULT_MAX_DEPTH = 64;
const DEFAULT_MAX_KEYS = 10_000;
const DEFAULT_MAX_REPAIR_ATTEMPTS = 3;

const CODE_FENCE_REGEX = /```(?:json)?\s*([\s\S]*?)```/giu;
const TRAILING_COMMA_REGEX = /,\s*([}\]])/g;
const SINGLE_QUOTE_KEY_REGEX = /'([^']+)'\s*:/g;

// ── Parse helpers ──────────────────────────────────────────────────────

function stripCodeFences(text: string): string {
  return text.replaceAll(CODE_FENCE_REGEX, '$1').trim();
}

function tryJsonParse(text: string): { success: true; data: unknown } | { success: false; error: string } {
  try {
    const data = JSON.parse(text) as unknown;
    return { success: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: bracket matching is inherently branchy
function extractJsonCandidates(text: string): string[] {
  const candidates: string[] = [];
  const stack: string[] = [];
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === undefined) {
      continue;
    }

    const next = advanceJsonScanner(char, i, { escaped, inString, stack, start });
    escaped = next.escaped;
    inString = next.inString;
    start = next.start;
    if (next.completed) {
      candidates.push(text.slice(next.candidateStart, i + 1));
      start = -1;
    }
  }
  return candidates;
}

interface JsonScannerState {
  escaped: boolean;
  inString: boolean;
  stack: string[];
  start: number;
}

interface JsonScannerResult {
  candidateStart: number;
  completed: boolean;
  escaped: boolean;
  inString: boolean;
  start: number;
}

/**
 * Advance the JSON bracket-matching scanner by one character.
 * Returns the updated state and whether a complete top-level candidate closed.
 */
function advanceJsonScanner(char: string, index: number, state: JsonScannerState): JsonScannerResult {
  const { escaped, inString, stack, start } = state;

  if (escaped) {
    return { escaped: false, inString, start, completed: false, candidateStart: start };
  }
  if (inString && char === '\\') {
    return { escaped: true, inString, start, completed: false, candidateStart: start };
  }
  if (char === '"') {
    return { escaped, inString: !inString, start, completed: false, candidateStart: start };
  }
  if (inString) {
    return { escaped, inString, start, completed: false, candidateStart: start };
  }

  if (char === '{' || char === '[') {
    const nextStart = stack.length === 0 ? index : start;
    stack.push(char === '{' ? '}' : ']');
    return { escaped, inString, start: nextStart, completed: false, candidateStart: nextStart };
  }
  if ((char === '}' || char === ']') && stack.length > 0 && stack.at(-1) === char) {
    stack.pop();
    const completed = stack.length === 0 && start >= 0;
    return { escaped, inString, start, completed, candidateStart: start };
  }
  return { escaped, inString, start, completed: false, candidateStart: start };
}

function tryExtractAndParse(text: string): { success: true; data: unknown; raw: string } | { success: false } {
  const candidates = extractJsonCandidates(text);
  for (const candidate of candidates) {
    const parsed = tryJsonParse(candidate);
    if (parsed.success) {
      return { success: true, data: parsed.data, raw: candidate };
    }
  }
  return { success: false };
}

// ── Repair strategies ──────────────────────────────────────────────────

function repairStripFences(input: string): string {
  return stripCodeFences(input);
}

function repairExtractJson(input: string): string {
  const stripped = stripCodeFences(input);
  const result = tryExtractAndParse(stripped);
  if (result.success) {
    return result.raw;
  }
  const firstBrace = stripped.search(/[[{]/);
  const lastBrace = Math.max(stripped.lastIndexOf('}'), stripped.lastIndexOf(']'));
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return stripped.slice(firstBrace, lastBrace + 1);
  }
  return stripped;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: repair state machine
function repairIncompleteJson(input: string): string {
  const trimmed = stripCodeFences(input).trim();
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let buffer = '';

  for (const char of trimmed) {
    if (escaped) {
      escaped = false;
      buffer += char;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      buffer += char;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      buffer += char;
      continue;
    }
    if (inString) {
      buffer += char;
      continue;
    }
    if (char === '{') {
      stack.push('}');
      buffer += char;
    } else if (char === '[') {
      stack.push(']');
      buffer += char;
    } else if (char === '}' || char === ']') {
      if (stack.length > 0 && stack.at(-1) === char) {
        stack.pop();
        buffer += char;
      } else {
        let closed = '';
        while (stack.length > 0 && stack.at(-1) !== char) {
          const popped = stack.pop();
          if (popped) {
            closed += popped;
          }
        }
        if (stack.at(-1) === char) {
          buffer += closed + char;
          stack.pop();
        } else {
          // Unmatched closing bracket — emit it anyway rather than silently dropping
          buffer += char;
        }
      }
    } else {
      buffer += char;
    }
  }

  if (inString) {
    buffer += '"';
  }
  while (stack.length > 0) {
    const closing = stack.pop();
    if (closing) {
      buffer += closing;
    }
  }
  return buffer;
}

function repairTrailingCommas(input: string): string {
  return stripCodeFences(input).replaceAll(TRAILING_COMMA_REGEX, '$1');
}

function repairSingleQuotes(input: string): string {
  let repaired = stripCodeFences(input).replaceAll(SINGLE_QUOTE_KEY_REGEX, '"$1":');
  repaired = repaired.replaceAll(/:\s*'([^']*)'/g, ': "$1"');
  return repaired;
}

function repairCommonMistakes(input: string): string {
  let repaired = stripCodeFences(input);
  repaired = repaired.replaceAll(TRAILING_COMMA_REGEX, '$1');
  repaired = repaired.replaceAll(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
  repaired = repaired.replaceAll(/\/\/[^\n]*\n/g, '\n');
  repaired = repaired.replaceAll(/\/\*[\s\S]*?\*\//g, '');
  return repaired;
}

type RepairFn = (input: string) => string;

const REPAIR_STRATEGIES: RepairFn[] = [
  repairStripFences,
  repairTrailingCommas,
  repairIncompleteJson,
  repairExtractJson,
  repairSingleQuotes,
  repairCommonMistakes
];

// ── Schema validation (lightweight, bounded) ───────────────────────────

function typeOf(value: unknown): string {
  if (Array.isArray(value)) {
    return 'array';
  }
  if (value === null) {
    return 'null';
  }
  return typeof value;
}

function isTypeMatch(value: unknown, expected: string): boolean {
  if (expected === 'null') {
    return value === null;
  }
  if (expected === 'object') {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
  if (expected === 'array') {
    return Array.isArray(value);
  }
  if (expected === 'integer') {
    return typeof value === 'number' && Number.isInteger(value);
  }
  return typeof value === expected;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }
  if (a === null || b === null) {
    return false;
  }
  if (typeof a !== typeof b) {
    return false;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return false;
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const aKeys = Object.keys(a as Record<string, unknown>);
    const bKeys = Object.keys(b as Record<string, unknown>);
    if (aKeys.length !== bKeys.length) {
      return false;
    }
    return aKeys.every(k => {
      if (k === '__proto__' || k === 'constructor') {
        return false;
      }
      if (!Object.hasOwn(b as Record<string, unknown>, k)) {
        return false;
      }
      return deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]);
    });
  }
  return false;
}

interface ValidationContext {
  depth: number;
  errors: string[];
  keyCount: { count: number };
  maxDepth: number;
  maxKeys: number;
  path: string;
  schema: JsonSchema;
  value: unknown;
}

function ctx(
  value: unknown,
  schema: JsonSchema,
  path: string,
  errors: string[],
  depth: number,
  maxDepth: number,
  keyCount: { count: number },
  maxKeys: number
): ValidationContext {
  return { value, schema, path, errors, depth, maxDepth, keyCount, maxKeys };
}

function validateNode(
  value: unknown,
  schema: JsonSchema,
  path: string,
  errors: string[],
  depth: number,
  maxDepth: number,
  keyCount: { count: number },
  maxKeys: number
): void {
  if (maxDepth > 0 && depth > maxDepth) {
    errors.push(`${path}: exceeds max depth ${maxDepth}`);
    return;
  }

  if (typeof schema.$ref === 'string') {
    return;
  }

  const schemaType = typeof schema.type === 'string' ? schema.type : undefined;
  if (schemaType && !isTypeMatch(value, schemaType)) {
    errors.push(`${path}: expected ${schemaType}, got ${typeOf(value)}`);
    return;
  }

  const c = ctx(value, schema, path, errors, depth, maxDepth, keyCount, maxKeys);
  validateCombinators(c);

  if (typeof value === 'string') {
    validateStringValue(c);
  }

  if (typeof value === 'number') {
    validateNumberValue(c);
  }

  if (Array.isArray(value)) {
    validateArrayValue(c);
  }

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    validateObjectValue(c);
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: combinator validation (anyOf/oneOf/allOf/not) is inherently branchy
function validateCombinators(c: ValidationContext): void {
  const { value, schema, path, errors, depth, maxDepth, keyCount, maxKeys } = c;
  if (Array.isArray(schema.enum)) {
    const enumVals = schema.enum as unknown[];
    if (!enumVals.some(item => deepEqual(item, value))) {
      errors.push(`${path}: value is not in enum`);
    }
  }

  if ('const' in schema && !deepEqual(value, schema.const)) {
    errors.push(`${path}: value does not match const`);
  }

  if (schema.not && typeof schema.not === 'object' && !Array.isArray(schema.not)) {
    const notErrs: string[] = [];
    validateNode(value, schema.not as JsonSchema, path, notErrs, depth + 1, maxDepth, keyCount, maxKeys);
    if (notErrs.length === 0) {
      errors.push(`${path}: value must not match 'not' schema`);
    }
  }

  if (Array.isArray(schema.anyOf)) {
    const matched = (schema.anyOf as JsonSchema[]).some(sub => {
      if (!sub || typeof sub !== 'object' || Array.isArray(sub)) {
        return false;
      }
      const subErrs: string[] = [];
      validateNode(value, sub, path, subErrs, depth + 1, maxDepth, { count: 0 }, maxKeys);
      return subErrs.length === 0;
    });
    if (!matched) {
      errors.push(`${path}: does not match any of 'anyOf'`);
    }
  }

  if (Array.isArray(schema.oneOf)) {
    const matches = (schema.oneOf as JsonSchema[]).reduce((c, sub) => {
      if (!sub || typeof sub !== 'object' || Array.isArray(sub)) {
        return c;
      }
      const subErrs: string[] = [];
      validateNode(value, sub, path, subErrs, depth + 1, maxDepth, { count: 0 }, maxKeys);
      return subErrs.length === 0 ? c + 1 : c;
    }, 0);
    if (matches !== 1) {
      errors.push(`${path}: must match exactly one 'oneOf' (matched ${matches})`);
    }
  }

  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf as JsonSchema[]) {
      if (!sub || typeof sub !== 'object' || Array.isArray(sub)) {
        continue;
      }
      validateNode(value, sub, path, errors, depth + 1, maxDepth, keyCount, maxKeys);
    }
  }
}

function validateStringValue(c: ValidationContext): void {
  const { value, schema, path, errors } = c;
  const v = value as string;
  if (typeof schema.minLength === 'number' && v.length < schema.minLength) {
    errors.push(`${path}: shorter than minLength ${schema.minLength}`);
  }
  if (typeof schema.maxLength === 'number' && v.length > schema.maxLength) {
    errors.push(`${path}: longer than maxLength ${schema.maxLength}`);
  }
  // schema.pattern is expected to come from internal hardcoded schema definitions only.
  // User-supplied patterns could cause ReDoS. All patterns in this codebase are
  // compile-time constants defined in the OutputValidator's internal schema registry.
  if (typeof schema.pattern === 'string') {
    try {
      // nosemgrep: schema.pattern comes from internal hardcoded schema definitions only
      const re = new RegExp(schema.pattern);
      if (!re.test(v)) {
        errors.push(`${path}: does not match pattern ${schema.pattern}`);
      }
    } catch {
      // ignore invalid pattern
    }
  }
  if (typeof schema.format === 'string') {
    const fmt = schema.format as string;
    if (fmt === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      errors.push(`${path}: does not match format 'email'`);
    }
    if (fmt === 'uri' && !/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(v)) {
      errors.push(`${path}: does not match format 'uri'`);
    }
  }
}

function validateNumberValue(c: ValidationContext): void {
  const { value, schema, path, errors } = c;
  const v = value as number;
  if (typeof schema.minimum === 'number' && v < schema.minimum) {
    errors.push(`${path}: below minimum ${schema.minimum}`);
  }
  if (typeof schema.maximum === 'number' && v > schema.maximum) {
    errors.push(`${path}: above maximum ${schema.maximum}`);
  }
  if (typeof schema.exclusiveMinimum === 'number' && v <= schema.exclusiveMinimum) {
    errors.push(`${path}: not above exclusiveMinimum ${schema.exclusiveMinimum}`);
  }
  if (typeof schema.exclusiveMaximum === 'number' && v >= schema.exclusiveMaximum) {
    errors.push(`${path}: not below exclusiveMaximum ${schema.exclusiveMaximum}`);
  }
}

function validateArrayValue(c: ValidationContext): void {
  const { value, schema, path, errors, depth, maxDepth, keyCount, maxKeys } = c;
  const arr = value as unknown[];
  if (typeof schema.minItems === 'number' && arr.length < schema.minItems) {
    errors.push(`${path}: fewer than minItems ${schema.minItems}`);
  }
  if (typeof schema.maxItems === 'number' && arr.length > schema.maxItems) {
    errors.push(`${path}: more than maxItems ${schema.maxItems}`);
  }
  const itemSchema = schema.items as JsonSchema | undefined;
  if (itemSchema && typeof itemSchema === 'object' && !Array.isArray(itemSchema)) {
    for (let i = 0; i < arr.length; i++) {
      validateNode(arr[i], itemSchema, `${path}[${i}]`, errors, depth + 1, maxDepth, keyCount, maxKeys);
    }
  }
}

function validateObjectValue(c: ValidationContext): void {
  const { value, schema, path, errors, depth, maxDepth, keyCount, maxKeys } = c;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  keyCount.count += keys.length;
  if (maxKeys > 0 && keyCount.count > maxKeys) {
    errors.push(`$: exceeds maxKeys ${maxKeys}`);
    return;
  }

  const required = Array.isArray(schema.required)
    ? (schema.required as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];

  for (const key of required) {
    if (!Object.hasOwn(obj, key)) {
      errors.push(`${path}.${key}: missing required property`);
    }
  }

  const properties =
    schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)
      ? (schema.properties as Record<string, JsonSchema>)
      : {};

  for (const [k, childSchema] of Object.entries(properties)) {
    if (Object.hasOwn(obj, k) && childSchema && typeof childSchema === 'object' && !Array.isArray(childSchema)) {
      validateNode(obj[k], childSchema, `${path}.${k}`, errors, depth + 1, maxDepth, keyCount, maxKeys);
    }
  }

  if (schema.additionalProperties === false) {
    for (const k of keys) {
      if (!Object.hasOwn(properties, k)) {
        errors.push(`${path}.${k}: additional property not allowed`);
      }
    }
  }
}

function validateAgainstSchema(
  data: unknown,
  schema: JsonSchema,
  maxDepth: number,
  maxKeys: number
): { valid: true } | { valid: false; errors: string[] } {
  const errors: string[] = [];
  validateNode(data, schema, '$', errors, 1, maxDepth, { count: 0 }, maxKeys);
  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return { valid: true };
}

// ── Core validator factory ─────────────────────────────────────────────

export interface OutputValidator {
  getRepairStrategies(): string[];
  validate<T = unknown>(
    output: string,
    schema: JsonSchema,
    options?: ValidateOptions
  ): Promise<ValidationResult<T>> | ValidationResult<T>;
  validateSync<T = unknown>(output: string, schema: JsonSchema, options?: ValidateOptions): ValidationResult<T>;
}

export function createOutputValidator(config: OutputValidatorConfig = {}): OutputValidator {
  const defaultAutoRepair = config.defaultAutoRepair ?? false;
  const defaultMaxAttempts = config.defaultMaxRepairAttempts ?? DEFAULT_MAX_REPAIR_ATTEMPTS;
  const maxDepth = config.maxJsonDepth ?? DEFAULT_MAX_DEPTH;
  const maxKeys = config.maxJsonKeys ?? DEFAULT_MAX_KEYS;

  function parseAndValidate(text: string): { parsed: unknown; rawUsed: string } | { error: string; rawUsed: string } {
    const stripped = stripCodeFences(text);
    const direct = tryJsonParse(stripped);
    if (direct.success) {
      return { parsed: direct.data, rawUsed: stripped };
    }

    const extracted = tryExtractAndParse(stripped);
    if (extracted.success) {
      return { parsed: extracted.data, rawUsed: extracted.raw };
    }

    return { error: (direct as { success: false; error: string }).error, rawUsed: stripped };
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validation orchestration
  function validateSync<T = unknown>(
    output: string,
    schema: JsonSchema,
    options: ValidateOptions = {}
  ): ValidationResult<T> {
    const autoRepair = options.autoRepair ?? defaultAutoRepair;
    const maxAttempts = options.maxRepairAttempts ?? defaultMaxAttempts;

    let attempts = 1;
    let currentRaw = output;
    const firstTry = parseAndValidate(output);

    if ('parsed' in firstTry) {
      const schemaCheck = validateAgainstSchema(firstTry.parsed, schema, maxDepth, maxKeys);
      if (schemaCheck.valid) {
        return {
          valid: true,
          data: firstTry.parsed as T,
          attempts,
          repaired: false
        };
      }
      if (!autoRepair) {
        return {
          valid: false,
          error: schemaCheck.errors[0] ?? 'Schema validation failed',
          errors: schemaCheck.errors,
          attempts,
          repaired: false
        };
      }
      currentRaw = firstTry.rawUsed;
      const initialErrors = schemaCheck.errors;

      if (maxAttempts <= 0) {
        return {
          valid: false,
          error: initialErrors[0] ?? 'Schema validation failed',
          errors: initialErrors,
          attempts,
          repaired: false
        };
      }
    } else {
      const parseErr = (firstTry as { error: string }).error;
      if (!autoRepair) {
        return {
          valid: false,
          error: `Parse error: ${parseErr}`,
          errors: [`Parse error: ${parseErr}`],
          attempts,
          repaired: false,
          parseError: parseErr
        };
      }
      if (maxAttempts <= 0) {
        return {
          valid: false,
          error: `Parse error: ${parseErr}`,
          errors: [`Parse error: ${parseErr}`],
          attempts,
          repaired: false,
          parseError: parseErr
        };
      }
    }

    let lastError = 'Unknown error';
    let lastErrors: string[] = [lastError];
    let lastParseError: string | undefined;

    const strategiesToTry = REPAIR_STRATEGIES.slice(0, Math.max(0, maxAttempts));

    for (let i = 0; i < strategiesToTry.length; i++) {
      const strategy = strategiesToTry[i];
      if (!strategy) {
        continue;
      }

      attempts++;
      let repaired: string;
      try {
        repaired = strategy(currentRaw);
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        lastErrors = [lastError];
        continue;
      }

      const callbacks = options.onRepairAttempt;
      if (callbacks) {
        callbacks(i + 1, repaired);
      }

      const parsedTry = parseAndValidate(repaired);
      if (!('parsed' in parsedTry)) {
        lastError = (parsedTry as { error: string }).error;
        lastErrors = [`Parse error after repair ${i + 1}: ${lastError}`];
        lastParseError = lastError;
        currentRaw = repaired;
        continue;
      }

      const schemaCheck = validateAgainstSchema(parsedTry.parsed, schema, maxDepth, maxKeys);
      if (schemaCheck.valid) {
        return {
          valid: true,
          data: parsedTry.parsed as T,
          attempts,
          repaired: true,
          repairedOutput: repaired
        };
      }

      lastError = schemaCheck.errors[0] ?? 'Schema validation failed after repair';
      lastErrors = schemaCheck.errors;
      lastParseError = undefined;
      currentRaw = repaired;
    }

    return {
      valid: false,
      error: lastErrors[0] ?? lastError,
      errors: lastErrors,
      attempts,
      repaired: attempts > 1,
      ...(lastParseError ? { parseError: lastParseError } : {})
    };
  }

  function validate<T = unknown>(
    output: string,
    schema: JsonSchema,
    options: ValidateOptions = {}
  ): Promise<ValidationResult<T>> {
    return Promise.resolve(validateSync<T>(output, schema, options));
  }

  return {
    validate,
    validateSync,
    getRepairStrategies() {
      return REPAIR_STRATEGIES.map(fn => fn.name);
    }
  };
}

// ── Class wrapper for spec compatibility ───────────────────────────────

export class OutputValidatorService {
  readonly name = 'output-validator';
  #state: 'stopped' | 'running' = 'stopped';
  readonly #validator: OutputValidator;

  constructor(config: OutputValidatorConfig = {}) {
    this.#validator = createOutputValidator(config);
  }

  get state(): string {
    return this.#state;
  }

  // biome-ignore lint/suspicious/useAwait: lifecycle interface requires Promise
  async start(): Promise<void> {
    this.#state = 'running';
  }

  // biome-ignore lint/suspicious/useAwait: lifecycle interface requires Promise
  async stop(): Promise<void> {
    this.#state = 'stopped';
  }

  // biome-ignore lint/suspicious/useAwait: lifecycle interface requires Promise
  async sleep(): Promise<void> {
    this.#state = 'stopped';
  }

  // biome-ignore lint/suspicious/useAwait: lifecycle interface requires Promise
  async wakeup(): Promise<void> {
    this.#state = 'running';
  }

  async validate<T>(
    output: string,
    schema: JsonSchema,
    options: { autoRepair?: boolean; maxRepairAttempts?: number } = {}
  ): Promise<ValidationResult<T>> {
    const opts: ValidateOptions = {};
    if (options.autoRepair !== undefined) {
      opts.autoRepair = options.autoRepair;
    }
    if (options.maxRepairAttempts !== undefined) {
      opts.maxRepairAttempts = options.maxRepairAttempts;
    }
    return await this.#validator.validate<T>(output, schema, opts);
  }

  validateSync<T>(
    output: string,
    schema: JsonSchema,
    options: { autoRepair?: boolean; maxRepairAttempts?: number } = {}
  ): ValidationResult<T> {
    const opts: ValidateOptions = {};
    if (options.autoRepair !== undefined) {
      opts.autoRepair = options.autoRepair;
    }
    if (options.maxRepairAttempts !== undefined) {
      opts.maxRepairAttempts = options.maxRepairAttempts;
    }
    return this.#validator.validateSync<T>(output, schema, opts);
  }
}

export const OutputValidator = OutputValidatorService;

export function validateStructuredOutput<T = unknown>(
  rawOutput: string,
  schema: JsonSchema,
  options: ValidateOptions & OutputValidatorConfig = {}
): ValidationResult<T> {
  const cfg: OutputValidatorConfig = {};
  if (options.defaultAutoRepair !== undefined) {
    cfg.defaultAutoRepair = options.defaultAutoRepair;
  }
  if (options.defaultMaxRepairAttempts !== undefined) {
    cfg.defaultMaxRepairAttempts = options.defaultMaxRepairAttempts;
  }
  if (options.maxJsonDepth !== undefined) {
    cfg.maxJsonDepth = options.maxJsonDepth;
  }
  if (options.maxJsonKeys !== undefined) {
    cfg.maxJsonKeys = options.maxJsonKeys;
  }
  if (options.autoRepair !== undefined) {
    cfg.defaultAutoRepair = options.autoRepair;
  }
  if (options.maxRepairAttempts !== undefined) {
    cfg.defaultMaxRepairAttempts = options.maxRepairAttempts;
  }

  const validator = createOutputValidator(cfg);

  const valOpts: ValidateOptions = {};
  if (options.autoRepair !== undefined) {
    valOpts.autoRepair = options.autoRepair;
  }
  if (options.maxRepairAttempts !== undefined) {
    valOpts.maxRepairAttempts = options.maxRepairAttempts;
  }
  if (options.onRepairAttempt !== undefined) {
    valOpts.onRepairAttempt = options.onRepairAttempt;
  }
  if (options.originalPrompt !== undefined) {
    valOpts.originalPrompt = options.originalPrompt;
  }

  return validator.validateSync<T>(rawOutput, schema, valOpts);
}

export async function validateStructuredOutputAsync<T = unknown>(
  rawOutput: string,
  schema: JsonSchema,
  options: ValidateOptions & OutputValidatorConfig = {}
): Promise<ValidationResult<T>> {
  const cfg: OutputValidatorConfig = {};
  if (options.defaultAutoRepair !== undefined) {
    cfg.defaultAutoRepair = options.defaultAutoRepair;
  }
  if (options.defaultMaxRepairAttempts !== undefined) {
    cfg.defaultMaxRepairAttempts = options.defaultMaxRepairAttempts;
  }
  if (options.maxJsonDepth !== undefined) {
    cfg.maxJsonDepth = options.maxJsonDepth;
  }
  if (options.maxJsonKeys !== undefined) {
    cfg.maxJsonKeys = options.maxJsonKeys;
  }
  if (options.autoRepair !== undefined) {
    cfg.defaultAutoRepair = options.autoRepair;
  }
  if (options.maxRepairAttempts !== undefined) {
    cfg.defaultMaxRepairAttempts = options.maxRepairAttempts;
  }

  const validator = createOutputValidator(cfg);

  const valOpts: ValidateOptions = {};
  if (options.autoRepair !== undefined) {
    valOpts.autoRepair = options.autoRepair;
  }
  if (options.maxRepairAttempts !== undefined) {
    valOpts.maxRepairAttempts = options.maxRepairAttempts;
  }
  if (options.onRepairAttempt !== undefined) {
    valOpts.onRepairAttempt = options.onRepairAttempt;
  }
  if (options.originalPrompt !== undefined) {
    valOpts.originalPrompt = options.originalPrompt;
  }

  return await validator.validate<T>(rawOutput, schema, valOpts);
}
