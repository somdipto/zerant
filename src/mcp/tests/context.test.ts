import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api-client.js', () => ({
  apiCall: vi.fn(),
  tabHeaders: vi.fn(),
  logActivity: vi.fn(),
}));

vi.mock('../coerce.js', async (importOriginal) => importOriginal());

import { apiCall } from '../api-client.js';
import { registerContextTools } from '../tools/context.js';
import { createMockServer, getHandler } from './mcp-test-helper.js';

const mockApiCall = vi.mocked(apiCall);

describe('MCP context tools', () => {
  const { server, tools } = createMockServer();
  registerContextTools(server);

  beforeEach(() => { vi.clearAllMocks(); });

  it('zerant_context_recent returns recent pages', async () => {
    mockApiCall.mockResolvedValueOnce({ pages: [] });
    await getHandler(tools, 'zerant_context_recent')({});
    expect(mockApiCall).toHaveBeenCalledWith('GET', '/context/recent');
  });

  it('zerant_context_recent applies limit', async () => {
    mockApiCall.mockResolvedValueOnce({ pages: [] });
    await getHandler(tools, 'zerant_context_recent')({ limit: 10 });
    const endpoint = mockApiCall.mock.calls[0][1] as string;
    expect(endpoint).toContain('limit=10');
  });

  it('zerant_context_search searches context', async () => {
    mockApiCall.mockResolvedValueOnce({ results: [] });
    await getHandler(tools, 'zerant_context_search')({ query: 'react' });
    expect(mockApiCall).toHaveBeenCalledWith('GET', '/context/search?q=react');
  });

  it('zerant_context_page gets page context', async () => {
    mockApiCall.mockResolvedValueOnce({ data: {} });
    await getHandler(tools, 'zerant_context_page')({ url: 'https://a.com' });
    expect(mockApiCall).toHaveBeenCalledWith('GET', '/context/page?url=https%3A%2F%2Fa.com');
  });

  it('zerant_context_summary returns summary', async () => {
    mockApiCall.mockResolvedValueOnce({ total: 50 });
    await getHandler(tools, 'zerant_context_summary')({});
    expect(mockApiCall).toHaveBeenCalledWith('GET', '/context/summary');
  });

  it('zerant_context_note adds a note', async () => {
    mockApiCall.mockResolvedValueOnce({ ok: true });
    await getHandler(tools, 'zerant_context_note')({ url: 'https://a.com', note: 'important' });
    expect(mockApiCall).toHaveBeenCalledWith('POST', '/context/note', { url: 'https://a.com', note: 'important' });
  });
});
