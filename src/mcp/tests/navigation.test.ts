import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api-client.js', () => ({
  apiCall: vi.fn(),
  tabHeaders: vi.fn((tabId?: string) => (tabId ? { 'X-Tab-Id': tabId } : undefined)),
  logActivity: vi.fn(),
}));

vi.mock('../coerce.js', async (importOriginal) => importOriginal());

import { apiCall, tabHeaders, logActivity } from '../api-client.js';
import { registerNavigationTools } from '../tools/navigation.js';
import { createMockServer, getHandler, expectTextContent } from './mcp-test-helper.js';

const mockApiCall = vi.mocked(apiCall);
const mockLogActivity = vi.mocked(logActivity);

describe('MCP navigation tools', () => {
  const { server, tools } = createMockServer();
  registerNavigationTools(server);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── zerant_navigate ───────────────────────────────────────────────
  describe('zerant_navigate', () => {
    const handler = getHandler(tools, 'zerant_navigate');

    it('navigates to a URL', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ url: 'https://example.com' });
      expectTextContent(result, 'Navigated to https://example.com');
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/navigate', { url: 'https://example.com' }, undefined);
      expect(mockLogActivity).toHaveBeenCalledWith('navigate', 'https://example.com');
    });

    it('targets a specific tab via tabId', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);

      await handler({ url: 'https://a.com', tabId: 't1' });
      expect(vi.mocked(tabHeaders)).toHaveBeenCalledWith('t1');
    });
  });

  // ── zerant_go_back ────────────────────────────────────────────────
  describe('zerant_go_back', () => {
    const handler = getHandler(tools, 'zerant_go_back');

    it('calls history.back()', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({});
      expectTextContent(result, 'Navigated back');
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/execute-js', { code: 'window.history.back()' });
    });
  });

  // ── zerant_go_forward ─────────────────────────────────────────────
  describe('zerant_go_forward', () => {
    const handler = getHandler(tools, 'zerant_go_forward');

    it('calls history.forward()', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({});
      expectTextContent(result, 'Navigated forward');
    });
  });

  // ── zerant_reload ─────────────────────────────────────────────────
  describe('zerant_reload', () => {
    const handler = getHandler(tools, 'zerant_reload');

    it('reloads the page', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({});
      expectTextContent(result, 'Page reloaded');
    });
  });

  // ── zerant_click ──────────────────────────────────────────────────
  describe('zerant_click', () => {
    const handler = getHandler(tools, 'zerant_click');

    it('clicks an element by selector', async () => {
      mockApiCall.mockResolvedValueOnce({ scope: { tabId: 'tab-1' }, completion: { mode: 'confirmed' } });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ selector: '#btn' });
      expectTextContent(result, 'Clicked #btn (tab tab-1; confirmed)');
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/click', { selector: '#btn' }, undefined);
    });
  });

  // ── zerant_type ───────────────────────────────────────────────────
  describe('zerant_type', () => {
    const handler = getHandler(tools, 'zerant_type');

    it('types text into an input', async () => {
      mockApiCall.mockResolvedValueOnce({ scope: { tabId: 'tab-2' }, completion: { mode: 'confirmed' } });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ selector: '#email', text: 'test@mail.com', clear: false });
      expectTextContent(result, 'Typed "test@mail.com" into #email (tab tab-2; confirmed)');
      expect(mockApiCall).toHaveBeenCalledWith(
        'POST', '/type',
        { selector: '#email', text: 'test@mail.com', clear: false },
        undefined,
      );
    });
  });

  // ── zerant_scroll ─────────────────────────────────────────────────
  describe('zerant_scroll', () => {
    const handler = getHandler(tools, 'zerant_scroll');

    it('scrolls down by pixels', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ direction: 'down', amount: 300 });
      expectTextContent(result, 'Scrolled down 300px');
    });

    it('scrolls to bottom', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ direction: 'down', amount: 500, target: 'bottom' });
      expectTextContent(result, 'Scrolled bottom');
    });
  });

  // ── zerant_press_key ──────────────────────────────────────────────
  describe('zerant_press_key', () => {
    const handler = getHandler(tools, 'zerant_press_key');

    it('presses a key without modifiers', async () => {
      mockApiCall.mockResolvedValueOnce({ scope: { tabId: 'tab-3' }, completion: { mode: 'dispatched' } });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ key: 'Enter' });
      expectTextContent(result, 'Pressed key Enter (tab tab-3; dispatched)');
    });

    it('presses a key with modifiers', async () => {
      mockApiCall.mockResolvedValueOnce({ scope: { tabId: 'tab-4' }, completion: { mode: 'confirmed' } });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ key: 'c', modifiers: ['control'] });
      expectTextContent(result, 'Pressed key control+c (tab tab-4; confirmed)');
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/press-key', { key: 'c', modifiers: ['control'] }, undefined);
    });
  });

  // ── zerant_wait_for_load ──────────────────────────────────────────
  describe('zerant_wait_for_load', () => {
    const handler = getHandler(tools, 'zerant_wait_for_load');

    it('reports success when page loads', async () => {
      mockApiCall.mockResolvedValueOnce({ timeout: false, scope: { tabId: 'tab-5' } });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ timeout: 10000 });
      expectTextContent(result, 'Page loaded successfully');
    });

    it('reports timeout', async () => {
      mockApiCall.mockResolvedValueOnce({ timeout: true, scope: { tabId: 'tab-6' } });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ timeout: 5000 });
      expectTextContent(result, 'timed out');
    });

    it('passes tabId header when provided', async () => {
      mockApiCall.mockResolvedValueOnce({ timeout: false, scope: { tabId: 't9' } });
      mockLogActivity.mockResolvedValueOnce(undefined);

      await handler({ tabId: 't9' });
      expect(vi.mocked(tabHeaders)).toHaveBeenCalledWith('t9');
    });
  });

  // ── zerant_press_key_combo ────────────────────────────────────────
  describe('zerant_press_key_combo', () => {
    const handler = getHandler(tools, 'zerant_press_key_combo');

    it('sends a key sequence and summarizes result', async () => {
      mockApiCall.mockResolvedValueOnce({ scope: { tabId: 'tab-10' }, completion: { mode: 'dispatched' } });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ keys: ['Tab', 'Tab', 'Enter'] });
      expectTextContent(result, 'Pressed keys Tab → Tab → Enter');
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/press-key-combo', { keys: ['Tab', 'Tab', 'Enter'] }, undefined);
    });

    it('passes tabId header when provided', async () => {
      mockApiCall.mockResolvedValueOnce({ scope: { tabId: 'tab-11' }, completion: { mode: 'confirmed' } });
      mockLogActivity.mockResolvedValueOnce(undefined);

      await handler({ keys: ['Enter'], tabId: 'tab-11' });
      expect(vi.mocked(tabHeaders)).toHaveBeenCalledWith('tab-11');
    });
  });

  // ── summarizeActionResult caveat ──────────────────────────────────
  describe('summarizeActionResult caveat handling', () => {
    it('includes caveat in the click result summary when present', async () => {
      mockApiCall.mockResolvedValueOnce({
        scope: { tabId: 'tab-c' },
        completion: {
          mode: 'dispatched',
          caveat: 'Key dispatch finished, but no immediate focus, value, or navigation change was observable.',
        },
      });
      mockLogActivity.mockResolvedValueOnce(undefined);

      const handler = getHandler(tools, 'zerant_click');
      const result = await handler({ selector: '#btn' });
      expectTextContent(result, 'Caveat:');
    });
  });
});
