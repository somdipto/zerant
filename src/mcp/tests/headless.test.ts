import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api-client.js', () => ({
  apiCall: vi.fn(),
  tabHeaders: vi.fn(),
  logActivity: vi.fn(),
}));

import { apiCall } from '../api-client.js';
import { registerHeadlessTools } from '../tools/headless.js';
import { createMockServer, getHandler } from './mcp-test-helper.js';

const mockApiCall = vi.mocked(apiCall);

describe('MCP headless tools', () => {
  const { server, tools } = createMockServer();
  registerHeadlessTools(server);

  beforeEach(() => { vi.clearAllMocks(); });

  it('zerant_headless_open opens URL', async () => {
    mockApiCall.mockResolvedValueOnce({ url: 'https://a.com' });

    await getHandler(tools, 'zerant_headless_open')({ url: 'https://a.com' });
    expect(mockApiCall).toHaveBeenCalledWith('POST', '/headless/open', { url: 'https://a.com' });
  });

  it('zerant_headless_content returns content', async () => {
    mockApiCall.mockResolvedValueOnce({ html: '<html/>' });
    await getHandler(tools, 'zerant_headless_content')({});
    expect(mockApiCall).toHaveBeenCalledWith('GET', '/headless/content');
  });

  it('zerant_headless_status returns status', async () => {
    mockApiCall.mockResolvedValueOnce({ open: false });
    await getHandler(tools, 'zerant_headless_status')({});
    expect(mockApiCall).toHaveBeenCalledWith('GET', '/headless/status');
  });

  it('zerant_headless_close closes browser', async () => {
    mockApiCall.mockResolvedValueOnce({ ok: true });

    await getHandler(tools, 'zerant_headless_close')({});
    expect(mockApiCall).toHaveBeenCalledWith('POST', '/headless/close');
  });

  it('zerant_headless_show makes window visible', async () => {
    mockApiCall.mockResolvedValueOnce({});
    await getHandler(tools, 'zerant_headless_show')({});
    expect(mockApiCall).toHaveBeenCalledWith('POST', '/headless/show');
  });

  it('zerant_headless_hide hides window', async () => {
    mockApiCall.mockResolvedValueOnce({});
    await getHandler(tools, 'zerant_headless_hide')({});
    expect(mockApiCall).toHaveBeenCalledWith('POST', '/headless/hide');
  });
});
