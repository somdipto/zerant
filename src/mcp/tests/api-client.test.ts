import { afterEach, describe, expect, it } from 'vitest';
import { getMcpSource } from '../api-client.js';

describe('MCP api client helpers', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('defaults to wingman when no MCP source env is configured', () => {
    delete process.env.ZERANT_SOURCE;
    delete process.env.ZERANT_MCP_SOURCE;
    delete process.env.ZERANT_ACTOR_SOURCE;

    expect(getMcpSource()).toBe('wingman');
  });

  it('prefers ZERANT_SOURCE when configured', () => {
    process.env.ZERANT_SOURCE = 'claude';
    process.env.ZERANT_MCP_SOURCE = 'openclaw';

    expect(getMcpSource()).toBe('claude');
  });

  it('falls back to ZERANT_MCP_SOURCE and normalizes whitespace', () => {
    delete process.env.ZERANT_SOURCE;
    process.env.ZERANT_MCP_SOURCE = '  codex  ';

    expect(getMcpSource()).toBe('codex');
  });
});
