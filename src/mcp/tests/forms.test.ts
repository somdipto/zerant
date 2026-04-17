import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api-client.js', () => ({
  apiCall: vi.fn(),
  tabHeaders: vi.fn((tabId?: string) => (tabId ? { 'X-Tab-Id': tabId } : undefined)),
  logActivity: vi.fn(),
}));

import { apiCall } from '../api-client.js';
import { registerFormTools } from '../tools/forms.js';
import { createMockServer, getHandler } from './mcp-test-helper.js';

const mockApiCall = vi.mocked(apiCall);

describe('MCP form tools', () => {
  const { server, tools } = createMockServer();
  registerFormTools(server);

  beforeEach(() => { vi.clearAllMocks(); });

  it('zerant_forms_saved lists saved forms', async () => {
    mockApiCall.mockResolvedValueOnce({ forms: [] });
    await getHandler(tools, 'zerant_forms_saved')({});
    expect(mockApiCall).toHaveBeenCalledWith('GET', '/forms/memory');
  });

  it('zerant_forms_saved filters by domain', async () => {
    mockApiCall.mockResolvedValueOnce({ forms: [] });
    await getHandler(tools, 'zerant_forms_saved')({ domain: 'github.com' });
    expect(mockApiCall).toHaveBeenCalledWith('GET', '/forms/memory/github.com');
  });

  it('zerant_form_fill fills form', async () => {
    mockApiCall.mockResolvedValueOnce({ filled: true });
    await getHandler(tools, 'zerant_form_fill')({});
    expect(mockApiCall).toHaveBeenCalledWith('POST', '/forms/fill', expect.any(Object), undefined);
  });

  it('zerant_forms_clear clears saved forms', async () => {
    mockApiCall.mockResolvedValueOnce({ ok: true });
    await getHandler(tools, 'zerant_forms_clear')({ domain: 'github.com' });
    expect(mockApiCall).toHaveBeenCalledWith('DELETE', '/forms/memory/github.com');
  });
});
