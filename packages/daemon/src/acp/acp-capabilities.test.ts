import { describe, expect, it } from 'vitest';
import { AGENT_CAPABILITIES } from './acp-capabilities.js';

describe('AGENT_CAPABILITIES', () => {
  it('should have all capabilities set to false (Phase 1 stub)', () => {
    expect(AGENT_CAPABILITIES.loadSession).toBe(false);
    expect(AGENT_CAPABILITIES.sessionCapabilities.close).toBe(false);
    expect(AGENT_CAPABILITIES.sessionCapabilities.list).toBe(false);
    expect(AGENT_CAPABILITIES.sessionCapabilities.delete).toBe(false);
    expect(AGENT_CAPABILITIES.sessionCapabilities.resume).toBe(false);
    expect(AGENT_CAPABILITIES.sessionCapabilities.additionalDirectories).toBe(false);
    expect(AGENT_CAPABILITIES.promptCapabilities.image).toBe(false);
    expect(AGENT_CAPABILITIES.promptCapabilities.audio).toBe(false);
    expect(AGENT_CAPABILITIES.promptCapabilities.embeddedContext).toBe(false);
    expect(AGENT_CAPABILITIES.mcpCapabilities.http).toBe(false);
    expect(AGENT_CAPABILITIES.mcpCapabilities.sse).toBe(false);
  });
});
