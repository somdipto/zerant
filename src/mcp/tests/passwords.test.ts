import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api-client.js', () => ({
  apiCall: vi.fn(),
  tabHeaders: vi.fn(),
  logActivity: vi.fn(),
}));

vi.mock('../coerce.js', async (importOriginal) => importOriginal());

import { apiCall, logActivity } from '../api-client.js';
import { registerPasswordTools } from '../tools/passwords.js';
import { createMockServer, getHandler } from './mcp-test-helper.js';

const mockApiCall = vi.mocked(apiCall);
const mockLogActivity = vi.mocked(logActivity);

describe('MCP password tools', () => {
  const { server, tools } = createMockServer();
  registerPasswordTools(server);

  beforeEach(() => { vi.clearAllMocks(); });

  it('zerant_password_status returns vault status', async () => {
    mockApiCall.mockResolvedValueOnce({ locked: true });
    await getHandler(tools, 'zerant_password_status')({});
    expect(mockApiCall).toHaveBeenCalledWith('GET', '/passwords/status');
  });

  it('zerant_password_unlock unlocks vault', async () => {
    mockApiCall.mockResolvedValueOnce({ unlocked: true });
    await getHandler(tools, 'zerant_password_unlock')({ masterPassword: 'secret' });
    expect(mockApiCall).toHaveBeenCalledWith('POST', '/passwords/unlock', { password: 'secret' });
  });

  it('zerant_password_lock locks vault', async () => {
    mockApiCall.mockResolvedValueOnce({ locked: true });
    await getHandler(tools, 'zerant_password_lock')({});
    expect(mockApiCall).toHaveBeenCalledWith('POST', '/passwords/lock');
  });

  it('zerant_password_generate generates password', async () => {
    mockApiCall.mockResolvedValueOnce({ password: 'abc123' });
    await getHandler(tools, 'zerant_password_generate')({ length: 32 });
    const endpoint = mockApiCall.mock.calls[0][1] as string;
    expect(endpoint).toContain('length=32');
  });

  it('zerant_password_suggest suggests passwords for URL', async () => {
    mockApiCall.mockResolvedValueOnce({ suggestions: [] });
    await getHandler(tools, 'zerant_password_suggest')({ url: 'github.com' });
    expect(mockApiCall).toHaveBeenCalledWith('GET', '/passwords/suggest?domain=github.com');
  });

  it('zerant_password_save saves a password', async () => {
    mockApiCall.mockResolvedValueOnce({ ok: true });
    mockLogActivity.mockResolvedValueOnce(undefined);
    await getHandler(tools, 'zerant_password_save')({ url: 'github.com', username: 'robin', password: 'pw123' });
    expect(mockApiCall).toHaveBeenCalledWith('POST', '/passwords/save', { domain: 'github.com', username: 'robin', payload: 'pw123' });
  });
});
