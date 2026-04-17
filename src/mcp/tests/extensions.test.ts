import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api-client.js', () => ({
  apiCall: vi.fn(),
  tabHeaders: vi.fn(),
  logActivity: vi.fn(),
}));

vi.mock('../coerce.js', async (importOriginal) => importOriginal());

import { apiCall, logActivity } from '../api-client.js';
import { registerExtensionTools } from '../tools/extensions.js';
import { createMockServer, getHandler, expectTextContent } from './mcp-test-helper.js';

const mockApiCall = vi.mocked(apiCall);
const mockLogActivity = vi.mocked(logActivity);

describe('MCP extension tools', () => {
  const { server, tools } = createMockServer();
  registerExtensionTools(server);

  beforeEach(() => { vi.clearAllMocks(); });

  describe('zerant_extensions_list', () => {
    it('lists extensions', async () => {
      mockApiCall.mockResolvedValueOnce([{ id: 'ext1' }]);
      const result = await getHandler(tools, 'zerant_extensions_list')({});
      expectTextContent(result);
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/extensions/list');
    });
  });

  describe('zerant_extension_load', () => {
    it('loads an extension from path', async () => {
      mockApiCall.mockResolvedValueOnce({ id: 'ext2' });
      mockLogActivity.mockResolvedValueOnce(undefined);
      await getHandler(tools, 'zerant_extension_load')({ path: '/tmp/ext' });
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/extensions/load', { path: '/tmp/ext' });
    });
  });

  describe('zerant_extension_install', () => {
    it('installs an extension', async () => {
      mockApiCall.mockResolvedValueOnce({ id: 'ext3' });
      mockLogActivity.mockResolvedValueOnce(undefined);
      await getHandler(tools, 'zerant_extension_install')({ input: 'ublock-origin' });
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/extensions/install', { input: 'ublock-origin' });
    });
  });

  describe('zerant_extension_uninstall', () => {
    it('uninstalls an extension', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);
      await getHandler(tools, 'zerant_extension_uninstall')({ id: 'ext1' });
      expect(mockApiCall).toHaveBeenCalledWith('DELETE', '/extensions/uninstall/ext1');
    });
  });

  describe('zerant_extensions_chrome_list', () => {
    it('lists chrome extensions', async () => {
      mockApiCall.mockResolvedValueOnce([]);
      await getHandler(tools, 'zerant_extensions_chrome_list')({});
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/extensions/chrome/list');
    });

    it('filters by profile', async () => {
      mockApiCall.mockResolvedValueOnce([]);
      await getHandler(tools, 'zerant_extensions_chrome_list')({ profile: 'Work' });
      const endpoint = mockApiCall.mock.calls[0][1] as string;
      expect(endpoint).toContain('profile=Work');
    });
  });

  describe('zerant_extensions_chrome_import', () => {
    it('imports chrome extension', async () => {
      mockApiCall.mockResolvedValueOnce({ imported: 1 });
      await getHandler(tools, 'zerant_extensions_chrome_import')({ extensionId: 'abc' });
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/extensions/chrome/import', { extensionId: 'abc' });
    });
  });

  describe('zerant_extensions_gallery', () => {
    it('lists gallery extensions', async () => {
      mockApiCall.mockResolvedValueOnce({ extensions: [] });
      await getHandler(tools, 'zerant_extensions_gallery')({});
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/extensions/gallery');
    });
  });

  describe('zerant_extensions_updates_check', () => {
    it('checks for updates', async () => {
      mockApiCall.mockResolvedValueOnce({ updates: [] });
      await getHandler(tools, 'zerant_extensions_updates_check')({});
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/extensions/updates/check');
    });
  });

  describe('zerant_extensions_disk_usage', () => {
    it('returns disk usage', async () => {
      mockApiCall.mockResolvedValueOnce({ total: 1024 });
      await getHandler(tools, 'zerant_extensions_disk_usage')({});
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/extensions/disk-usage');
    });
  });

  describe('zerant_extensions_conflicts', () => {
    it('returns conflicts', async () => {
      mockApiCall.mockResolvedValueOnce({ conflicts: [] });
      await getHandler(tools, 'zerant_extensions_conflicts')({});
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/extensions/conflicts');
    });
  });
});
