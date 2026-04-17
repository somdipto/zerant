import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api-client.js', () => ({
  apiCall: vi.fn(),
  tabHeaders: vi.fn(),
  logActivity: vi.fn(),
}));

import { apiCall, logActivity } from '../api-client.js';
import { registerPinboardTools } from '../tools/pinboards.js';
import { createMockServer, getHandler, expectTextContent } from './mcp-test-helper.js';

const mockApiCall = vi.mocked(apiCall);
const mockLogActivity = vi.mocked(logActivity);

describe('MCP pinboard tools', () => {
  const { server, tools } = createMockServer();
  registerPinboardTools(server);

  beforeEach(() => { vi.clearAllMocks(); });

  describe('zerant_pinboard_list', () => {
    it('lists pinboards', async () => {
      mockApiCall.mockResolvedValueOnce([{ id: 'p1', name: 'Research' }]);
      const result = await getHandler(tools, 'zerant_pinboard_list')({});
      expectTextContent(result);
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/pinboards');
    });
  });

  describe('zerant_pinboard_create', () => {
    it('creates a pinboard', async () => {
      mockApiCall.mockResolvedValueOnce({ id: 'p2' });
      mockLogActivity.mockResolvedValueOnce(undefined);
      await getHandler(tools, 'zerant_pinboard_create')({ name: 'Ideas', emoji: '💡' });
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/pinboards', { name: 'Ideas', emoji: '💡' });
    });
  });

  describe('zerant_pinboard_get', () => {
    it('gets a pinboard', async () => {
      mockApiCall.mockResolvedValueOnce({ id: 'p1', items: [] });
      await getHandler(tools, 'zerant_pinboard_get')({ id: 'p1' });
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/pinboards/p1');
    });
  });

  describe('zerant_pinboard_update', () => {
    it('updates a pinboard', async () => {
      mockApiCall.mockResolvedValueOnce({ id: 'p1' });
      mockLogActivity.mockResolvedValueOnce(undefined);
      await getHandler(tools, 'zerant_pinboard_update')({ id: 'p1', name: 'Updated' });
      expect(mockApiCall).toHaveBeenCalledWith('PUT', '/pinboards/p1', { name: 'Updated' });
    });
  });

  describe('zerant_pinboard_delete', () => {
    it('deletes a pinboard', async () => {
      mockApiCall.mockResolvedValueOnce({ ok: true });
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await getHandler(tools, 'zerant_pinboard_delete')({ id: 'p1' });
      expectTextContent(result, 'Deleted pinboard: p1');
    });

    it('handles not found', async () => {
      mockApiCall.mockResolvedValueOnce({ ok: false });
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await getHandler(tools, 'zerant_pinboard_delete')({ id: 'bad' });
      expectTextContent(result, 'Pinboard not found');
    });
  });

  describe('zerant_pinboard_items', () => {
    it('lists items', async () => {
      mockApiCall.mockResolvedValueOnce({ items: [] });
      await getHandler(tools, 'zerant_pinboard_items')({ id: 'p1' });
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/pinboards/p1/items');
    });
  });

  describe('zerant_pinboard_add_item', () => {
    it('adds an item', async () => {
      mockApiCall.mockResolvedValueOnce({ id: 'item1' });
      mockLogActivity.mockResolvedValueOnce(undefined);
      await getHandler(tools, 'zerant_pinboard_add_item')({ id: 'p1', type: 'link', url: 'https://a.com' });
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/pinboards/p1/items', expect.objectContaining({ type: 'link', url: 'https://a.com' }));
    });
  });

  describe('zerant_pinboard_remove_item', () => {
    it('removes an item', async () => {
      mockApiCall.mockResolvedValueOnce({ ok: true });
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await getHandler(tools, 'zerant_pinboard_remove_item')({ id: 'p1', itemId: 'i1' });
      expectTextContent(result, 'Removed item i1');
    });

    it('handles not found', async () => {
      mockApiCall.mockResolvedValueOnce({ ok: false });
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await getHandler(tools, 'zerant_pinboard_remove_item')({ id: 'p1', itemId: 'bad' });
      expectTextContent(result, 'not found');
    });
  });

  describe('zerant_pinboard_reorder_items', () => {
    it('reorders items', async () => {
      mockApiCall.mockResolvedValueOnce({ ok: true });
      await getHandler(tools, 'zerant_pinboard_reorder_items')({ id: 'p1', itemIds: ['i2', 'i1'] });
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/pinboards/p1/items/reorder', { itemIds: ['i2', 'i1'] });
    });
  });
});
