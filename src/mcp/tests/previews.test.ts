import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api-client.js', () => ({
  apiCall: vi.fn(),
  tabHeaders: vi.fn(),
  logActivity: vi.fn(),
}));

import { apiCall, logActivity } from '../api-client.js';
import { registerPreviewTools } from '../tools/previews.js';
import { createMockServer, getHandler, expectTextContent } from './mcp-test-helper.js';

const mockApiCall = vi.mocked(apiCall);
const mockLogActivity = vi.mocked(logActivity);

describe('MCP preview tools', () => {
  const { server, tools } = createMockServer();
  registerPreviewTools(server);

  beforeEach(() => { vi.clearAllMocks(); });

  it('zerant_preview_create creates preview', async () => {
    mockApiCall.mockResolvedValueOnce({ id: 'pv1', url: 'http://localhost:3000/pv1', title: 'Test' });
    mockLogActivity.mockResolvedValueOnce(undefined);
    await getHandler(tools, 'zerant_preview_create')({ html: '<h1>Hi</h1>', title: 'Test' });
    expect(mockApiCall).toHaveBeenCalledWith('POST', '/preview', { html: '<h1>Hi</h1>', title: 'Test' });
  });

  it('zerant_preview_update updates preview', async () => {
    mockApiCall.mockResolvedValueOnce({ id: 'pv1', version: 2, url: 'http://localhost/pv1' });
    mockLogActivity.mockResolvedValueOnce(undefined);
    await getHandler(tools, 'zerant_preview_update')({ id: 'pv1', html: '<h1>Updated</h1>' });
    expect(mockApiCall).toHaveBeenCalledWith('PUT', '/preview/pv1', { html: '<h1>Updated</h1>' });
  });

  it('zerant_preview_list lists previews', async () => {
    mockApiCall.mockResolvedValueOnce({ previews: [] });
    await getHandler(tools, 'zerant_preview_list')({});
    expect(mockApiCall).toHaveBeenCalledWith('GET', '/previews');
  });

  it('zerant_preview_delete deletes preview', async () => {
    mockApiCall.mockResolvedValueOnce({});
    mockLogActivity.mockResolvedValueOnce(undefined);
    const result = await getHandler(tools, 'zerant_preview_delete')({ id: 'pv1' });
    expectTextContent(result, "Preview 'pv1' deleted");
    expect(mockApiCall).toHaveBeenCalledWith('DELETE', '/preview/pv1');
  });
});
