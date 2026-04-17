import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api-client.js', () => ({
  apiCall: vi.fn(),
  tabHeaders: vi.fn(),
  logActivity: vi.fn(),
}));

import { apiCall } from '../api-client.js';
import { registerAuthTools } from '../tools/auth.js';
import { createMockServer, getHandler, expectTextContent } from './mcp-test-helper.js';

const mockApiCall = vi.mocked(apiCall);

describe('MCP auth tools', () => {
  const { server, tools } = createMockServer();
  registerAuthTools(server);

  beforeEach(() => { vi.clearAllMocks(); });

  it('zerant_auth_states returns all auth states', async () => {
    mockApiCall.mockResolvedValueOnce({ states: [] });
    const result = await getHandler(tools, 'zerant_auth_states')({});
    expectTextContent(result);
    expect(mockApiCall).toHaveBeenCalledWith('GET', '/auth/states');
  });

  it('zerant_auth_state returns state for domain', async () => {
    mockApiCall.mockResolvedValueOnce({ status: 'logged_in' });
    await getHandler(tools, 'zerant_auth_state')({ domain: 'github.com' });
    expect(mockApiCall).toHaveBeenCalledWith('GET', '/auth/state/github.com');
  });

  it('zerant_auth_check checks current page auth', async () => {
    mockApiCall.mockResolvedValueOnce({ authenticated: true });
    await getHandler(tools, 'zerant_auth_check')({});
    expect(mockApiCall).toHaveBeenCalledWith('POST', '/auth/check');
  });

  it('zerant_auth_is_login_page detects login pages', async () => {
    mockApiCall.mockResolvedValueOnce({ isLoginPage: true });
    await getHandler(tools, 'zerant_auth_is_login_page')({});
    expect(mockApiCall).toHaveBeenCalledWith('GET', '/auth/is-login-page');
  });

  it('zerant_auth_update updates auth state', async () => {
    mockApiCall.mockResolvedValueOnce({ ok: true });
    await getHandler(tools, 'zerant_auth_update')({ domain: 'x.com', status: 'logged_in', username: 'robin' });
    expect(mockApiCall).toHaveBeenCalledWith('POST', '/auth/update', { domain: 'x.com', status: 'logged_in', username: 'robin' });
  });

  it('zerant_auth_delete deletes auth state', async () => {
    mockApiCall.mockResolvedValueOnce({ ok: true });
    await getHandler(tools, 'zerant_auth_delete')({ domain: 'x.com' });
    expect(mockApiCall).toHaveBeenCalledWith('DELETE', '/auth/state/x.com');
  });
});
