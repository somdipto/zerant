import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api-client.js', () => ({
  apiCall: vi.fn(),
  tabHeaders: vi.fn(),
  logActivity: vi.fn(),
}));

import { apiCall } from '../api-client.js';
import { registerDataTools } from '../tools/data.js';
import { createMockServer, getHandler, expectTextContent } from './mcp-test-helper.js';

const mockApiCall = vi.mocked(apiCall);

describe('MCP data tools', () => {
  const { server, tools } = createMockServer();
  registerDataTools(server);

  beforeEach(() => { vi.clearAllMocks(); });

  describe('zerant_chrome_import_status', () => {
    it('returns import status', async () => {
      mockApiCall.mockResolvedValueOnce({ available: true });
      const result = await getHandler(tools, 'zerant_chrome_import_status')({});
      expectTextContent(result);
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/import/chrome/status');
    });
  });

  describe('zerant_chrome_import_profiles', () => {
    it('returns chrome profiles', async () => {
      mockApiCall.mockResolvedValueOnce({ profiles: [] });
      const result = await getHandler(tools, 'zerant_chrome_import_profiles')({});
      expectTextContent(result);
    });
  });

  describe('zerant_chrome_import_bookmarks', () => {
    it('imports bookmarks', async () => {
      mockApiCall.mockResolvedValueOnce({ imported: 50 });
      await getHandler(tools, 'zerant_chrome_import_bookmarks')({});
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/import/chrome/bookmarks');
    });
  });

  describe('zerant_chrome_import_history', () => {
    it('imports history', async () => {
      mockApiCall.mockResolvedValueOnce({ imported: 100 });
      await getHandler(tools, 'zerant_chrome_import_history')({});
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/import/chrome/history');
    });
  });

  describe('zerant_chrome_import_cookies', () => {
    it('imports cookies', async () => {
      mockApiCall.mockResolvedValueOnce({ imported: 20 });
      await getHandler(tools, 'zerant_chrome_import_cookies')({});
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/import/chrome/cookies');
    });
  });

  describe('zerant_chrome_sync_start', () => {
    it('starts sync', async () => {
      mockApiCall.mockResolvedValueOnce({ syncing: true });
      await getHandler(tools, 'zerant_chrome_sync_start')({ profile: 'Default' });
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/import/chrome/sync/start', { profile: 'Default' });
    });
  });

  describe('zerant_chrome_sync_stop', () => {
    it('stops sync', async () => {
      mockApiCall.mockResolvedValueOnce({ syncing: false });
      await getHandler(tools, 'zerant_chrome_sync_stop')({});
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/import/chrome/sync/stop');
    });
  });

  describe('zerant_data_export', () => {
    it('exports data', async () => {
      mockApiCall.mockResolvedValueOnce({ data: {} });
      await getHandler(tools, 'zerant_data_export')({});
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/data/export');
    });
  });

  describe('zerant_data_import', () => {
    it('imports data', async () => {
      mockApiCall.mockResolvedValueOnce({ ok: true });
      await getHandler(tools, 'zerant_data_import')({ data: { bookmarks: [] } });
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/data/import', { bookmarks: [] });
    });
  });

  describe('zerant_data_wipe', () => {
    it('wipes data', async () => {
      mockApiCall.mockResolvedValueOnce({ wiped: true });
      await getHandler(tools, 'zerant_data_wipe')({});
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/data/wipe');
    });
  });

  describe('zerant_downloads_list', () => {
    it('lists downloads', async () => {
      mockApiCall.mockResolvedValueOnce({ downloads: [] });
      await getHandler(tools, 'zerant_downloads_list')({});
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/downloads');
    });
  });

  describe('zerant_config_get', () => {
    it('gets config', async () => {
      mockApiCall.mockResolvedValueOnce({ theme: 'dark' });
      await getHandler(tools, 'zerant_config_get')({});
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/config');
    });
  });

  describe('zerant_config_update', () => {
    it('updates config', async () => {
      mockApiCall.mockResolvedValueOnce({ ok: true });
      await getHandler(tools, 'zerant_config_update')({ settings: { theme: 'light' } });
      expect(mockApiCall).toHaveBeenCalledWith('PATCH', '/config', { theme: 'light' });
    });
  });

  describe('zerant_get_cookies', () => {
    it('gets cookies with URL filter', async () => {
      mockApiCall.mockResolvedValueOnce({ cookies: [] });
      await getHandler(tools, 'zerant_get_cookies')({ url: 'https://a.com' });
      const endpoint = mockApiCall.mock.calls[0][1] as string;
      expect(endpoint).toContain('url=');
    });

    it('gets all cookies without filter', async () => {
      mockApiCall.mockResolvedValueOnce({ cookies: [] });
      await getHandler(tools, 'zerant_get_cookies')({});
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/cookies');
    });
  });

  describe('zerant_clear_cookies', () => {
    it('clears cookies', async () => {
      mockApiCall.mockResolvedValueOnce({ ok: true });
      await getHandler(tools, 'zerant_clear_cookies')({ domain: 'a.com' });
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/cookies/clear', { domain: 'a.com' });
    });
  });

  describe('zerant_browser_status', () => {
    it('returns status', async () => {
      mockApiCall.mockResolvedValueOnce({ running: true });
      await getHandler(tools, 'zerant_browser_status')({});
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/status');
    });
  });

  describe('zerant_active_tab_context', () => {
    it('returns active tab context', async () => {
      mockApiCall.mockResolvedValueOnce({ title: 'Google' });
      await getHandler(tools, 'zerant_active_tab_context')({});
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/active-tab/context');
    });
  });
});
