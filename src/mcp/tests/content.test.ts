import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api-client.js', () => ({
  apiCall: vi.fn(),
  tabHeaders: vi.fn((tabId?: string) => (tabId ? { 'X-Tab-Id': tabId } : undefined)),
  truncateToWords: vi.fn((text: string, max: number) => {
    const words = text.split(/\s+/);
    return words.length <= max ? text : words.slice(0, max).join(' ') + '...';
  }),
  logActivity: vi.fn(),
}));

import { apiCall, logActivity } from '../api-client.js';
import { registerContentTools } from '../tools/content.js';
import { createMockServer, getHandler, expectTextContent, expectImageContent } from './mcp-test-helper.js';

const mockApiCall = vi.mocked(apiCall);
const mockLogActivity = vi.mocked(logActivity);

describe('MCP content tools', () => {
  const { server, tools } = createMockServer();
  registerContentTools(server);

  beforeEach(() => { vi.clearAllMocks(); });

  describe('zerant_read_page', () => {
    const handler = getHandler(tools, 'zerant_read_page');

    it('returns markdown-formatted page content', async () => {
      mockApiCall.mockResolvedValueOnce({ title: 'Test', url: 'https://test.com', description: 'A test page', text: 'Body text' });
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({});
      const text = expectTextContent(result, '# Test');
      expect(text).toContain('**URL:** https://test.com');
      expect(text).toContain('> A test page');
    });

    it('handles missing description', async () => {
      mockApiCall.mockResolvedValueOnce({ title: 'T', url: 'https://t.com', text: 'x' });
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({});
      const text = expectTextContent(result);
      expect(text).not.toContain('>');
    });
  });

  describe('zerant_screenshot', () => {
    const handler = getHandler(tools, 'zerant_screenshot');

    it('returns image content', async () => {
      mockApiCall.mockResolvedValueOnce('base64data');
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({});
      expectImageContent(result);
    });
  });

  describe('zerant_get_page_html', () => {
    const handler = getHandler(tools, 'zerant_get_page_html');

    it('returns raw HTML string', async () => {
      mockApiCall.mockResolvedValueOnce('<html>hi</html>');
      const result = await handler({});
      expectTextContent(result, '<html>hi</html>');
    });

    it('JSON-stringifies non-string response', async () => {
      mockApiCall.mockResolvedValueOnce({ html: '<html/>' });
      const result = await handler({});
      expectTextContent(result, '"html"');
    });
  });

  describe('zerant_extract_content', () => {
    const handler = getHandler(tools, 'zerant_extract_content');

    it('returns extracted content as JSON', async () => {
      mockApiCall.mockResolvedValueOnce({ title: 'T', body: 'B' });
      const result = await handler({});
      expectTextContent(result);
    });
  });

  describe('zerant_extract_url', () => {
    const handler = getHandler(tools, 'zerant_extract_url');

    it('extracts from URL', async () => {
      mockApiCall.mockResolvedValueOnce({ content: 'extracted' });
      mockLogActivity.mockResolvedValueOnce(undefined);
      await handler({ url: 'https://a.com' });
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/content/extract/url', { url: 'https://a.com' });
    });
  });

  describe('zerant_get_links', () => {
    const handler = getHandler(tools, 'zerant_get_links');

    it('formats link list', async () => {
      mockApiCall.mockResolvedValueOnce({ links: [{ text: 'GH', href: 'https://gh.com', visible: true }] });
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({});
      expectTextContent(result, '[GH](https://gh.com)');
    });

    it('marks hidden links', async () => {
      mockApiCall.mockResolvedValueOnce({ links: [{ text: 'X', href: 'https://x.com', visible: false }] });
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({});
      expectTextContent(result, '[hidden]');
    });
  });

  describe('zerant_execute_js', () => {
    const handler = getHandler(tools, 'zerant_execute_js');

    it('executes code and returns result', async () => {
      mockApiCall.mockResolvedValueOnce({ result: 42 });
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({ code: '1+1' });
      expectTextContent(result, '42');
    });

    it('returns error for rejected execution', async () => {
      mockApiCall.mockRejectedValueOnce(new Error('User rejected'));
      const result = await handler({ code: 'evil()' });
      expectTextContent(result, 'User rejected JavaScript execution');
    });

    it('propagates non-rejection errors', async () => {
      mockApiCall.mockRejectedValueOnce(new Error('network down'));
      await expect(handler({ code: 'x' })).rejects.toThrow('network down');
    });
  });
});
