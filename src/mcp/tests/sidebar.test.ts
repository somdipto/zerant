import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api-client.js', () => ({
  apiCall: vi.fn(),
  tabHeaders: vi.fn(),
  logActivity: vi.fn(),
}));

import { apiCall } from '../api-client.js';
import { registerSidebarTools } from '../tools/sidebar.js';
import { createMockServer, getHandler } from './mcp-test-helper.js';

const mockApiCall = vi.mocked(apiCall);

describe('MCP sidebar tools', () => {
  const { server, tools } = createMockServer();
  registerSidebarTools(server);

  beforeEach(() => { vi.clearAllMocks(); });

  it('zerant_sidebar_config returns config', async () => {
    mockApiCall.mockResolvedValueOnce({ items: [] });
    await getHandler(tools, 'zerant_sidebar_config')({});
    expect(mockApiCall).toHaveBeenCalledWith('GET', '/sidebar/config');
  });

  it('zerant_sidebar_update updates config', async () => {
    mockApiCall.mockResolvedValueOnce({ ok: true });
    await getHandler(tools, 'zerant_sidebar_update')({ config: { width: 300 } });
    expect(mockApiCall).toHaveBeenCalledWith('POST', '/sidebar/config', { width: 300 });
  });

  it('zerant_sidebar_toggle_item toggles item', async () => {
    mockApiCall.mockResolvedValueOnce({ visible: true });
    await getHandler(tools, 'zerant_sidebar_toggle_item')({ id: 'bookmarks' });
    expect(mockApiCall).toHaveBeenCalledWith('POST', '/sidebar/items/bookmarks/toggle');
  });

  it('zerant_sidebar_activate_item activates item', async () => {
    mockApiCall.mockResolvedValueOnce({ active: true });
    await getHandler(tools, 'zerant_sidebar_activate_item')({ id: 'history' });
    expect(mockApiCall).toHaveBeenCalledWith('POST', '/sidebar/items/history/activate');
  });

  it('zerant_sidebar_reorder reorders items', async () => {
    mockApiCall.mockResolvedValueOnce({ ok: true });
    await getHandler(tools, 'zerant_sidebar_reorder')({ orderedIds: ['a', 'b', 'c'] });
    expect(mockApiCall).toHaveBeenCalledWith('POST', '/sidebar/reorder', { orderedIds: ['a', 'b', 'c'] });
  });

  it('zerant_sidebar_state sets state', async () => {
    mockApiCall.mockResolvedValueOnce({ state: 'wide' });
    await getHandler(tools, 'zerant_sidebar_state')({ state: 'wide' });
    expect(mockApiCall).toHaveBeenCalledWith('POST', '/sidebar/state', { state: 'wide' });
  });
});
