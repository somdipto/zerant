import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api-client.js', () => ({
  apiCall: vi.fn(),
  tabHeaders: vi.fn(),
  logActivity: vi.fn(),
}));

vi.mock('../coerce.js', async (importOriginal) => importOriginal());

import { apiCall, logActivity } from '../api-client.js';
import { registerHistoryTools } from '../tools/history.js';
import { createMockServer, getHandler, expectTextContent } from './mcp-test-helper.js';

const mockApiCall = vi.mocked(apiCall);
const mockLogActivity = vi.mocked(logActivity);

describe('MCP history tools', () => {
  const { server, tools } = createMockServer();
  registerHistoryTools(server);

  beforeEach(() => { vi.clearAllMocks(); });

  describe('zerant_history_list', () => {
    const handler = getHandler(tools, 'zerant_history_list');

    it('returns formatted history entries', async () => {
      mockApiCall.mockResolvedValueOnce({
        entries: [{ url: 'https://a.com', title: 'A', lastVisitTime: '2024-01-01T00:00:00Z', visitCount: 3 }],
        total: 1,
      });
      const result = await handler({});
      const text = expectTextContent(result, 'Browsing history');
      expect(text).toContain('[A](https://a.com)');
      expect(text).toContain('3 visits');
    });

    it('builds query string with pagination', async () => {
      mockApiCall.mockResolvedValueOnce({ entries: [], total: 0 });
      await handler({ limit: 10, offset: 20 });
      const endpoint = mockApiCall.mock.calls[0][1] as string;
      expect(endpoint).toContain('limit=10');
      expect(endpoint).toContain('offset=20');
    });
  });

  describe('zerant_history_clear', () => {
    const handler = getHandler(tools, 'zerant_history_clear');

    it('clears history', async () => {
      mockApiCall.mockResolvedValueOnce({ ok: true });
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({});
      expectTextContent(result);
      expect(mockApiCall).toHaveBeenCalledWith('DELETE', '/history/clear');
    });
  });

  describe('zerant_search_history', () => {
    const handler = getHandler(tools, 'zerant_search_history');

    it('returns search results', async () => {
      mockApiCall.mockResolvedValueOnce({
        results: [{ url: 'https://b.com', title: 'B', visitedAt: 1700000000000 }],
      });
      const result = await handler({ query: 'test' });
      expectTextContent(result, 'History results for "test"');
    });
  });

  describe('zerant_activity_log', () => {
    const handler = getHandler(tools, 'zerant_activity_log');

    it('returns activity entries', async () => {
      mockApiCall.mockResolvedValueOnce({
        entries: [{ type: 'navigate', detail: 'https://a.com', ts: 1700000000000 }],
      });
      const result = await handler({});
      expectTextContent(result, 'Activity log');
    });
  });

  describe('zerant_site_memory_list', () => {
    const handler = getHandler(tools, 'zerant_site_memory_list');

    it('lists remembered sites', async () => {
      mockApiCall.mockResolvedValueOnce({ sites: [{ domain: 'github.com' }] });
      const result = await handler({});
      expectTextContent(result, 'github.com');
    });
  });

  describe('zerant_site_memory_get', () => {
    const handler = getHandler(tools, 'zerant_site_memory_get');

    it('gets memory for domain', async () => {
      mockApiCall.mockResolvedValueOnce({ notes: [] });
      await handler({ domain: 'github.com' });
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/memory/site/github.com');
    });
  });

  describe('zerant_site_memory_search', () => {
    const handler = getHandler(tools, 'zerant_site_memory_search');

    it('searches site memory', async () => {
      mockApiCall.mockResolvedValueOnce({ results: [] });
      await handler({ query: 'login' });
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/memory/search?q=login');
    });
  });

  describe('zerant_site_memory_diff', () => {
    const handler = getHandler(tools, 'zerant_site_memory_diff');

    it('gets memory diff', async () => {
      mockApiCall.mockResolvedValueOnce({ changes: [] });
      await handler({ domain: 'github.com' });
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/memory/site/github.com/diff');
    });
  });
});
