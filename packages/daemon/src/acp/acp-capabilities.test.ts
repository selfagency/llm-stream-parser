import { describe, expect, it } from 'vitest';
import { AGENT_CAPABILITIES } from './acp-capabilities.js';

describe('AGENT_CAPABILITIES', () => {
  it('should support session operations', () => {
    expect(AGENT_CAPABILITIES.loadSession).toBe(true);
    expect(AGENT_CAPABILITIES.sessionCapabilities.close).toBe(true);
    expect(AGENT_CAPABILITIES.sessionCapabilities.list).toBe(true);
    expect(AGENT_CAPABILITIES.sessionCapabilities.delete).toBe(true);
    expect(AGENT_CAPABILITIES.sessionCapabilities.resume).toBe(true);
    expect(AGENT_CAPABILITIES.sessionCapabilities.additionalDirectories).toBe(true);
  });

  it('should not support image or audio prompts yet', () => {
    expect(AGENT_CAPABILITIES.promptCapabilities.image).toBe(false);
    expect(AGENT_CAPABILITIES.promptCapabilities.audio).toBe(false);
    expect(AGENT_CAPABILITIES.promptCapabilities.embeddedContext).toBe(true);
  });

  it('should support MCP transports', () => {
    expect(AGENT_CAPABILITIES.mcpCapabilities.http).toBe(true);
    expect(AGENT_CAPABILITIES.mcpCapabilities.sse).toBe(true);
  });
});
