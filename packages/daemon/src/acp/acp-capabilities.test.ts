import { describe, expect, it } from 'vitest';
import { AGENT_CAPABILITIES } from './acp-capabilities.js';

describe('AGENT_CAPABILITIES', () => {
  it('should have core capabilities enabled (Phase 14)', () => {
    expect(AGENT_CAPABILITIES.loadSession).toBe(true);
    expect(AGENT_CAPABILITIES.sessionCapabilities.close).toBe(true);
    expect(AGENT_CAPABILITIES.sessionCapabilities.list).toBe(true);
    expect(AGENT_CAPABILITIES.sessionCapabilities.delete).toBe(true);
    expect(AGENT_CAPABILITIES.sessionCapabilities.resume).toBe(true);
    expect(AGENT_CAPABILITIES.sessionCapabilities.additionalDirectories).toBe(true);
    expect(AGENT_CAPABILITIES.permissionKindProbing).toBe(true);
  });

  it('should have image/audio still disabled (stub)', () => {
    expect(AGENT_CAPABILITIES.promptCapabilities.image).toBe(false);
    expect(AGENT_CAPABILITIES.promptCapabilities.audio).toBe(false);
    expect(AGENT_CAPABILITIES.mcpCapabilities.http).toBe(false);
    expect(AGENT_CAPABILITIES.mcpCapabilities.sse).toBe(false);
  });

  it('should have embeddedContext enabled', () => {
    expect(AGENT_CAPABILITIES.promptCapabilities.embeddedContext).toBe(true);
  });
});
