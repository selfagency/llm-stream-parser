import type { JsonObject } from '@agentsy/shared';
import type { ParseJsonOptions } from './parse-json.js';
import { DEFAULT_MAX_JSON_DEPTH, DEFAULT_MAX_JSON_KEYS, parseJson } from './parse-json.js';

type JsonSchema = JsonObject;

const REGEX_CACHE_MAX = 256;
const regexCache = new Map<string, RegExp>();
const regexAccessTimestamps = new WeakMap<RegExp, number>();
const NESTED_QUANTIFIER_REGEX = /\([^)]*[+*?][^)]*\)[+*?]/;
const CHAINED_QUANTIFIER_REGEX = /[+*?][+*?]/;
const GROUP_ALTERNATION_REGEX = /\([^)]*\|[^)]*\)[+*?]/;
const MATCH_NOTHING_REGEX = /(?!)/;
const LOCAL_DEF_REF_REGEX = /^#\/\$defs\/([^/]+)$/;

/**
 * Detect regex patterns with nested or chained quantifiers that can cause
 * catastrophic backtracking (ReDoS). Rejects patterns containing:
 *   - Nested quantifiers: (a+)+ (a*)* (a+)*
 *   - Alternation inside a quantified group: (a|b)+
 *   - Consecutive quantifiers without separator: ++, *+, ?+
 *   - Excessive alternation depth
 */
function hasDangerousQuantifier(pattern: string): boolean {
  if (pattern.length > 200) {
    return true;
  }
  // nosemgrep: regex-dos-meta-validation
  // These regexes only run against already-length-capped pattern strings (≤200 chars).
  // They detect nested quantifiers in *other* regexes as a security guard.
  // Nested quantifiers: quantifier on a group that itself contains a quantifier
  if (NESTED_QUANTIFIER_REGEX.test(pattern)) {
    return true;
  }
  // Chained possessive-style: two consecutive quantifiers
  if (CHAINED_QUANTIFIER_REGEX.test(pattern)) {
    return true;
  }
  // Alternation inside quantified group: (x|y)+
  if (GROUP_ALTERNATION_REGEX.test(pattern)) {
    return true;
  }
  return false;
}

function isUnsafePattern(pattern: string, trusted: boolean): boolean {
  return !trusted && (typeof pattern !== 'string' || pattern.length > 200 || hasDangerousQuantifier(pattern));
}

function evictLRURegexEntry(): void {
  let lruKey: string | undefined;
  let lruTime = Number.POSITIVE_INFINITY;
  for (const [key, value] of regexCache.entries()) {
    const accessTime = regexAccessTimestamps.get(value) ?? Number.POSITIVE_INFINITY;
    if (accessTime < lruTime) {
      lruTime = accessTime;
      lruKey = key;
    }
  }
  if (lruKey !== undefined) {
    const lruRegex = regexCache.get(lruKey);
    if (lruRegex) {
      regexAccessTimestamps.delete(lruRegex);
    }
    regexCache.delete(lruKey);
  }
}

function getCachedRegex(pattern: string, trusted = false): RegExp {
  const existing = regexCache.get(pattern);
  if (existing !== undefined) {
    // Update access timestamp without delete/re-insert to avoid disrupting LRU tracking
    regexAccessTimestamps.set(existing, Date.now());
    return existing;
  }

  let regex: RegExp;
  try {
    // nosemgrep: typescript.lang.security.detect-non-literal-regexp.detect-non-literal-regexp -- pattern is vetted by isUnsafePattern; LRU-cached with 256-entry cap
    regex = isUnsafePattern(pattern, trusted) ? MATCH_NOTHING_REGEX : new RegExp(pattern);
  } catch {
    // Malformed or ReDoS-vulnerable patterns: fail gracefully with match-nothing regex
    regex = MATCH_NOTHING_REGEX; // Negative lookahead that never matches
  }
  regexAccessTimestamps.set(regex, Date.now());

  if (regexCache.size >= REGEX_CACHE_MAX) {
    evictLRURegexEntry();
  }
  regexCache.set(pattern, regex);
  return regex;
}

export type JsonSchemaValidator = (
  data: unknown,
  schema: JsonObject
) =>
  | boolean
  | {
      valid: boolean;
      errors?: string[];
    };

export interface ValidateJsonSchemaOptions extends ParseJsonOptions {
  validator?: JsonSchemaValidator;
}

function typeOf(value: unknown): string {
  if (Array.isArray(value)) {
    return 'array';
  }
  if (value === null) {
    return 'null';
  }
  return typeof value;
}

interface ResolveContext {
  defs: Record<string, JsonSchema>;
  resolving: Set<string>;
}

function areArraysEqual(a: unknown[], b: unknown[]): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    // Fallback to element-wise comparison if JSON.stringify fails for some reason
    if (a.length !== b.length) {
      return false;
    }
    return a.every((val, i) => deepEqual(val, b[i]));
  }
}

function areObjectsEqual(aObj: Record<string, unknown>, bObj: Record<string, unknown>): boolean {
  try {
    return JSON.stringify(aObj) === JSON.stringify(bObj);
  } catch {
    const keysA = Object.keys(aObj);
    const keysB = Object.keys(bObj);
    if (keysA.length !== keysB.length) {
      return false;
    }
    return keysA.every(k => {
      // Reject keys that could be used for prototype pollution or accessing
      // dangerous builtins. These keys should not appear on plain JSON objects
      // produced by parsing untrusted input; if they do, treat as mismatch.
      if (k === '__proto__' || k === 'constructor') {
        return false;
      }
      if (!Object.hasOwn(bObj, k)) {
        return false;
      }
      // Safe to access own property now
      return deepEqual(aObj[k], bObj[k]);
    });
  }
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
    return areArraysEqual(a, b);
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    return false;
  }
  if (typeof a === 'object' && typeof b === 'object') {
    return areObjectsEqual(a as Record<string, unknown>, b as Record<string, unknown>);
  }
  return false;
}

// Simple format validation patterns (pragmatic; not full RFC compliance).
const FORMAT_PATTERNS: Record<string, string> = {
  date: String.raw`^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$`,
  'date-time': String.raw`^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d+)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)$`,
  email: String.raw`^[^\s@]+@[^\s@]+\.[^\s@]{2,}$`,
  ipv4: String.raw`^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(?:\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$`,
  ipv6:
    '^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$' +
    '|^([0-9a-fA-F]{1,4}:){1,7}:$' +
    '|^([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}$' +
    '|^([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}$' +
    '|^([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}$' +
    '|^([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}$' +
    '|^([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}$' +
    '|^[0-9a-fA-F]{1,4}:(:[0-9a-fA-F]{1,4}){1,6}$' +
    '|^:(:[0-9a-fA-F]{1,4}){1,7}$' +
    '|^::$',
  uri: String.raw`^[a-zA-Z][a-zA-Z0-9+\-.]*:`,
  uuid: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
};

function checkRef(
  value: unknown,
  schema: JsonSchema,
  path: string,
  errors: string[],
  context?: ResolveContext
): boolean {
  if (typeof schema.$ref !== 'string') {
    return false;
  }

  const ref = schema.$ref;
  const match = LOCAL_DEF_REF_REGEX.exec(ref);
  const defName = match?.[1];
  if (defName === undefined) {
    errors.push(`${path}: unsupported $ref (only local #/$defs/... references are supported): ${ref}`);
    return true;
  }
  if (context?.resolving.has(defName)) {
    errors.push(`${path}: circular $ref detected: ${ref}`);
    return true;
  }
  const defs = context?.defs;
  const defSchema = defs !== undefined && Object.hasOwn(defs, defName) ? defs[defName] : undefined;
  if (defSchema === undefined) {
    errors.push(`${path}: $ref not found in $defs: ${ref}`);
    return true;
  }
  if (context === undefined) {
    errors.push(`${path}: internal error resolving $ref context: ${ref}`);
    return true;
  }
  const newResolving = new Set(context.resolving);
  newResolving.add(defName);
  validateNode(value, defSchema, path, errors, {
    defs: context.defs,
    resolving: newResolving
  });
  return true;
}

function isValueTypeMatch(value: unknown, schemaType: string): boolean {
  if (schemaType === 'null') {
    return value === null;
  }
  if (schemaType === 'object') {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
  if (schemaType === 'array') {
    return Array.isArray(value);
  }
  if (schemaType === 'integer') {
    return typeof value === 'number' && Number.isInteger(value);
  }
  return typeof value === schemaType;
}

function checkTypeConstraint(
  value: unknown,
  schemaType: string,
  valueType: string,
  path: string,
  errors: string[]
): boolean {
  if (!isValueTypeMatch(value, schemaType)) {
    errors.push(`${path}: expected ${schemaType}, got ${valueType}`);
    return true;
  }
  return false;
}

function checkAnyOf(
  value: unknown,
  subSchemas: unknown[],
  path: string,
  errors: string[],
  context?: ResolveContext
): void {
  const matched = subSchemas.some(subSchema => {
    if (!subSchema || typeof subSchema !== 'object' || Array.isArray(subSchema)) {
      return false;
    }
    const subErrors: string[] = [];
    validateNode(value, subSchema as JsonSchema, path, subErrors, context);
    return subErrors.length === 0;
  });
  if (!matched) {
    errors.push(`${path}: value does not match any of the 'anyOf' schemas`);
  }
}

function checkOneOf(
  value: unknown,
  subSchemas: unknown[],
  path: string,
  errors: string[],
  context?: ResolveContext
): void {
  const matchCount = subSchemas.reduce((count: number, subSchema) => {
    if (!subSchema || typeof subSchema !== 'object' || Array.isArray(subSchema)) {
      return count;
    }
    const subErrors: string[] = [];
    validateNode(value, subSchema as JsonSchema, path, subErrors, context);
    return subErrors.length === 0 ? count + 1 : count;
  }, 0);
  if (matchCount !== 1) {
    errors.push(`${path}: value must match exactly one of the 'oneOf' schemas (matched ${String(matchCount)})`);
  }
}

// #lizard forgives
function checkAllOf(
  value: unknown,
  subSchemas: unknown[],
  path: string,
  errors: string[],
  context?: ResolveContext
): void {
  for (const subSchema of subSchemas) {
    if (!subSchema || typeof subSchema !== 'object' || Array.isArray(subSchema)) {
      continue;
    }
    validateNode(value, subSchema as JsonSchema, path, errors, context);
  }
}

function checkCompositeKeywords(
  value: unknown,
  schema: JsonSchema,
  path: string,
  errors: string[],
  context?: ResolveContext
): void {
  if (Array.isArray(schema.enum) && !schema.enum.some(item => deepEqual(item, value))) {
    errors.push(`${path}: value is not in enum`);
  }

  if ('const' in schema && !deepEqual(value, schema.const)) {
    errors.push(`${path}: value does not match const`);
  }

  if (schema.not && typeof schema.not === 'object' && !Array.isArray(schema.not)) {
    const notErrors: string[] = [];
    validateNode(value, schema.not as JsonSchema, path, notErrors, context);
    if (notErrors.length === 0) {
      errors.push(`${path}: value must not match the 'not' schema`);
    }
  }

  if (Array.isArray(schema.anyOf)) {
    checkAnyOf(value, schema.anyOf, path, errors, context);
  }
  if (Array.isArray(schema.oneOf)) {
    checkOneOf(value, schema.oneOf, path, errors, context);
  }
  if (Array.isArray(schema.allOf)) {
    checkAllOf(value, schema.allOf, path, errors, context);
  }
}

function checkPatternConstraint(value: string, pattern: string, path: string, errors: string[]): void {
  const MAX_PATTERN_LENGTH = 1024;
  if (pattern.length > MAX_PATTERN_LENGTH) {
    errors.push(`${path}: schema pattern exceeds maximum length (${MAX_PATTERN_LENGTH}); skipping validation`);
    return;
  }
  try {
    const regex = getCachedRegex(pattern);
    if (!regex.test(value)) {
      errors.push(`${path}: string does not match pattern ${pattern}`);
    }
  } catch {
    errors.push(`${path}: schema pattern is not a valid regular expression: ${pattern}`);
  }
}

function checkStringConstraints(value: string, schema: JsonSchema, path: string, errors: string[]): void {
  if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
    errors.push(`${path}: string is shorter than minLength ${schema.minLength}`);
  }
  if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) {
    errors.push(`${path}: string is longer than maxLength ${schema.maxLength}`);
  }

  if (typeof schema.pattern === 'string') {
    checkPatternConstraint(value, schema.pattern, path, errors);
  }

  if (typeof schema.format === 'string') {
    const formatPattern = FORMAT_PATTERNS[schema.format];
    if (formatPattern !== undefined) {
      const regex = getCachedRegex(formatPattern, true);
      if (!regex.test(value)) {
        errors.push(`${path}: string does not match format '${schema.format}'`);
      }
    }
  }
}

function checkNumberConstraints(value: number, schema: JsonSchema, path: string, errors: string[]): void {
  if (typeof schema.minimum === 'number' && value < schema.minimum) {
    errors.push(`${path}: number is below minimum ${schema.minimum}`);
  }
  if (typeof schema.maximum === 'number' && value > schema.maximum) {
    errors.push(`${path}: number is above maximum ${schema.maximum}`);
  }
  if (typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum) {
    errors.push(`${path}: number is not above exclusiveMinimum ${schema.exclusiveMinimum}`);
  }
  if (typeof schema.exclusiveMaximum === 'number' && value >= schema.exclusiveMaximum) {
    errors.push(`${path}: number is not below exclusiveMaximum ${schema.exclusiveMaximum}`);
  }
}

function checkArrayConstraints(
  value: unknown[],
  schema: JsonSchema,
  path: string,
  errors: string[],
  context?: ResolveContext
): void {
  if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
    errors.push(`${path}: array has fewer than ${schema.minItems} items`);
  }
  if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
    errors.push(`${path}: array has more than ${schema.maxItems} items`);
  }

  const itemSchema = schema.items;
  if (itemSchema && typeof itemSchema === 'object' && !Array.isArray(itemSchema)) {
    for (let i = 0; i < value.length; i++) {
      validateNode(value[i], itemSchema as JsonSchema, `${path}[${i}]`, errors, context);
    }
  }
}

function checkAdditionalProperties(
  value: Record<string, unknown>,
  properties: Record<string, unknown>,
  additionalProperties: unknown,
  path: string,
  errors: string[]
): void {
  if (additionalProperties !== false) {
    return;
  }
  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(properties, key)) {
      errors.push(`${path}.${key}: additional property is not allowed`);
    }
  }
}

function checkObjectConstraints(
  value: unknown,
  schema: JsonSchema,
  path: string,
  errors: string[],
  context?: ResolveContext
): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return;
  }

  const valueObj = value as Record<string, unknown>;
  const required = Array.isArray(schema.required) ? schema.required.filter(item => typeof item === 'string') : [];
  for (const key of required) {
    if (!Object.hasOwn(valueObj, key)) {
      errors.push(`${path}.${key}: missing required property`);
    }
  }

  const properties: Record<string, unknown> =
    schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)
      ? (schema.properties as Record<string, unknown>)
      : {};

  for (const [key, childSchema] of Object.entries(properties)) {
    if (Object.hasOwn(valueObj, key) && childSchema && typeof childSchema === 'object' && !Array.isArray(childSchema)) {
      validateNode(valueObj[key], childSchema as JsonSchema, `${path}.${key}`, errors, context); // nosemgrep: detect-object-injection -- key is Object.hasOwn-guarded on the preceding line
    }
  }

  checkAdditionalProperties(valueObj, properties, schema.additionalProperties, path, errors);
}

// #lizard forgives
function checkValueTypeConstraints(
  value: unknown,
  schema: JsonSchema,
  path: string,
  errors: string[],
  context?: ResolveContext
): void {
  if (typeof value === 'string') {
    checkStringConstraints(value, schema, path, errors);
  }
  if (typeof value === 'number') {
    checkNumberConstraints(value, schema, path, errors);
  }
  if (Array.isArray(value)) {
    checkArrayConstraints(value, schema, path, errors, context);
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    checkObjectConstraints(value, schema, path, errors, context);
  }
}

function validateNode(
  value: unknown,
  schema: JsonSchema,
  path: string,
  errors: string[],
  context?: ResolveContext
): void {
  if (checkRef(value, schema, path, errors, context)) {
    return;
  }

  const schemaType = typeof schema.type === 'string' ? schema.type : undefined;
  const valueType = typeOf(value);

  if (schemaType && checkTypeConstraint(value, schemaType, valueType, path, errors)) {
    return;
  }

  checkCompositeKeywords(value, schema, path, errors, context);
  checkValueTypeConstraints(value, schema, path, errors, context);
}

interface WalkLimitsState {
  errors: string[];
  keyCount: number;
}

function walkObjectNode(
  node: Record<string, unknown>,
  depth: number,
  maxDepth: number,
  maxKeys: number,
  state: WalkLimitsState
): void {
  const entries = Object.entries(node);
  state.keyCount += entries.length;
  if (maxKeys > 0 && state.keyCount > maxKeys) {
    state.errors.push(`$: JSON key count exceeds maxJsonKeys (${maxKeys})`);
    return;
  }
  for (const [, child] of entries) {
    walkForLimits(child, depth + 1, maxDepth, maxKeys, state);
  }
}

function walkForLimits(node: unknown, depth: number, maxDepth: number, maxKeys: number, state: WalkLimitsState): void {
  if (state.errors.length > 0) {
    return;
  }

  if (maxDepth > 0 && depth > maxDepth) {
    state.errors.push(`$: JSON depth exceeds maxJsonDepth (${maxDepth})`);
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      walkForLimits(item, depth + 1, maxDepth, maxKeys, state);
    }
    return;
  }

  if (node && typeof node === 'object') {
    walkObjectNode(node as Record<string, unknown>, depth, maxDepth, maxKeys, state);
  }
}

function parseWithLimits(
  text: string,
  options: ValidateJsonSchemaOptions,
  maxJsonDepth: number,
  maxJsonKeys: number
): unknown {
  const parsedWithLimits = parseJson(text, {
    ...options,
    maxJsonDepth,
    maxJsonKeys
  });
  if (parsedWithLimits !== null) {
    return parsedWithLimits;
  }
  return parseJson(text, { ...options, maxJsonDepth: 0, maxJsonKeys: 0 });
}

function runExternalValidator(
  parsed: unknown,
  schema: JsonObject,
  options: ValidateJsonSchemaOptions
): { success: false; errors: string[] } | null {
  if (!options.validator) {
    return null;
  }

  try {
    const validated = options.validator(parsed, schema);
    if (typeof validated === 'boolean') {
      if (!validated) {
        return { errors: ['$: external validator failed'], success: false };
      }
      return null;
    }

    if (!validated.valid) {
      return {
        errors: validated.errors && validated.errors.length > 0 ? validated.errors : ['$: external validator failed'],
        success: false
      };
    }
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      errors: [`$: external validator threw: ${message}`],
      success: false
    };
  }
}

/**
 * Parses JSON from text and validates it against a JSON Schema.
 *
 * @returns A discriminated union: `{ success: true; data: T }` on success,
 *          or `{ success: false; errors: string[] }` on failure.
 *          Never throws — all error conditions are captured in the `errors` array.
 */
export function validateJsonSchema<T = unknown>(
  text: string,
  schema: JsonObject,
  options: ValidateJsonSchemaOptions = {}
): { success: true; data: T } | { success: false; errors: string[] } {
  const maxJsonDepth = options.maxJsonDepth ?? DEFAULT_MAX_JSON_DEPTH;
  const maxJsonKeys = options.maxJsonKeys ?? DEFAULT_MAX_JSON_KEYS;

  const parsed = parseWithLimits(text, options, maxJsonDepth, maxJsonKeys);

  if (parsed === null) {
    return { errors: ['$: no valid JSON found in input'], success: false };
  }

  const limitsState: WalkLimitsState = { errors: [], keyCount: 0 };
  walkForLimits(parsed, 1, maxJsonDepth, maxJsonKeys, limitsState);
  if (limitsState.errors.length > 0) {
    return { errors: limitsState.errors, success: false };
  }

  // Extract $defs for local $ref resolution.
  const defs =
    schema.$defs && typeof schema.$defs === 'object' && !Array.isArray(schema.$defs)
      ? (schema.$defs as Record<string, JsonSchema>)
      : {};
  const context: ResolveContext = { defs, resolving: new Set<string>() };

  const errors: string[] = [];
  validateNode(parsed, schema, '$', errors, context);

  const externalResult = runExternalValidator(parsed, schema, options);
  if (externalResult !== null) {
    return externalResult;
  }

  if (errors.length > 0) {
    return { errors, success: false };
  }

  return { data: parsed as T, success: true };
}
