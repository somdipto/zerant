import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api-client.js', () => ({
  apiCall: vi.fn(),
  tabHeaders: vi.fn(),
  logActivity: vi.fn(),
}));

import { apiCall, logActivity } from '../api-client.js';
import { registerClipboardTools } from '../tools/clipboard.js';
import { createMockServer, getHandler, expectTextContent } from './mcp-test-helper.js';

const mockApiCall = vi.mocked(apiCall);
const mockLogActivity = vi.mocked(logActivity);

describe('MCP clipboard tools', () => {
  const { server, tools } = createMockServer();
  registerClipboardTools(server);

  beforeEach(() => { vi.clearAllMocks(); });

  describe('zerant_clipboard_read', () => {
    const handler = getHandler(tools, 'zerant_clipboard_read');

    it('returns text content', async () => {
      mockApiCall.mockResolvedValueOnce({ text: 'hello', formats: ['text'] });
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({});
      expect(result.content[0]).toEqual({ type: 'text', text: 'hello' });
    });

    it('returns image content', async () => {
      mockApiCall.mockResolvedValueOnce({ image: { base64: 'data:image/png;base64,ABC' }, hasImage: true, formats: ['image'] });
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({});
      expect(result.content[0]).toMatchObject({ type: 'image', data: 'ABC', mimeType: 'image/png' });
    });

    it('returns empty message when clipboard is empty', async () => {
      mockApiCall.mockResolvedValueOnce({ formats: [] });
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({});
      expect(result.content[0].text).toContain('Clipboard is empty');
    });

    it('falls back to html when no text', async () => {
      mockApiCall.mockResolvedValueOnce({ html: '<b>hi</b>', formats: ['html'] });
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({});
      expect(result.content[0]).toEqual({ type: 'text', text: '<b>hi</b>' });
    });
  });

  describe('zerant_clipboard_write', () => {
    const handler = getHandler(tools, 'zerant_clipboard_write');

    it('writes text to clipboard', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({ text: 'hello' });
      expectTextContent(result, 'Copied text to clipboard');
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/clipboard/text', { text: 'hello' });
    });

    it('writes image to clipboard', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({ image_base64: 'ABC' });
      expectTextContent(result, 'Copied image to clipboard');
    });

    it('writes both text and image', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({ text: 'hi', image_base64: 'ABC' });
      expectTextContent(result, 'text and image');
    });

    it('returns error when nothing provided', async () => {
      const result = await handler({});
      expectTextContent(result, 'Error');
    });
  });

  describe('zerant_clipboard_save', () => {
    const handler = getHandler(tools, 'zerant_clipboard_save');

    it('saves clipboard to file', async () => {
      mockApiCall.mockResolvedValueOnce({ path: '/tmp/shot.png', size: 2048 });
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({ filename: 'shot.png' });
      expectTextContent(result, 'Saved to /tmp/shot.png');
      expectTextContent(result, '2.0 KB');
    });
  });
});
