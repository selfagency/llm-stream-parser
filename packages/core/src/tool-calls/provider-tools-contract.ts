import type { JsonObject } from '@agentsy/shared';

/**
 * Shared provider-facing tools payload contract that is interoperable with NativeTool[].
 */
export interface ProviderTool {
  format?: 'bare-xml' | 'json-wrapped' | 'native-json';
  id?: string;
  metadata?: Record<string, unknown>;
  name: string;
  parameters: JsonObject;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || isNonEmptyString(value);
}

function isOptionalJsonObject(value: unknown): value is JsonObject | undefined {
  return value === undefined || isJsonObject(value);
}

const VALID_FORMATS = ['bare-xml', 'json-wrapped', 'native-json'] as const;

function isValidFormat(value: unknown): value is (typeof VALID_FORMATS)[number] | undefined {
  if (value === undefined) {
    return true;
  }
  if (typeof value === 'string') {
    return VALID_FORMATS.includes(value as (typeof VALID_FORMATS)[number]);
  }
  return false;
}

export function isProviderTool(obj: unknown): obj is ProviderTool {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const tool = obj as Record<string, unknown>;

  return (
    isNonEmptyString(tool.name) &&
    isJsonObject(tool.parameters) &&
    isOptionalString(tool.id) &&
    isValidFormat(tool.format || '') &&
    isOptionalJsonObject(tool.metadata)
  );
}

export function providerToolToNative(tool: ProviderTool): {
  name: string;
  arguments: JsonObject;
  id?: string;
} {
  return {
    arguments: tool.parameters,
    name: tool.name,
    ...(tool.id !== undefined && { id: tool.id })
  };
}

export function nativeToProviderTool(nativeTool: { name: string; arguments: JsonObject; id?: string }): ProviderTool {
  return {
    name: nativeTool.name,
    parameters: nativeTool.arguments,
    ...(nativeTool.id !== undefined && { id: nativeTool.id }),
    format: 'native-json'
  };
}
