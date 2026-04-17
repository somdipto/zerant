import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api-client.js', () => ({
  apiCall: vi.fn(),
  tabHeaders: vi.fn((tabId?: string) => (tabId ? { 'X-Tab-Id': tabId } : undefined)),
  logActivity: vi.fn(),
}));

vi.mock('../coerce.js', async (importOriginal) => importOriginal());

import { apiCall, tabHeaders, logActivity } from '../api-client.js';
import { registerDevtoolsTools } from '../tools/devtools.js';
import { createMockServer, getHandler, expectTextContent, expectImageContent } from './mcp-test-helper.js';

const mockApiCall = vi.mocked(apiCall);
const mockLogActivity = vi.mocked(logActivity);

describe('MCP devtools tools', () => {
  const { server, tools } = createMockServer();
  registerDevtoolsTools(server);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── zerant_devtools_console ───────────────────────────────────────
  describe('zerant_devtools_console', () => {
    const handler = getHandler(tools, 'zerant_devtools_console');

    it('returns console entries as JSON', async () => {
      const data = { entries: [{ level: 'log', text: 'hello' }] };
      mockApiCall.mockResolvedValueOnce(data);

      const result = await handler({});
      const text = expectTextContent(result);
      expect(JSON.parse(text)).toEqual(data);
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/devtools/console', undefined, undefined);
    });

    it('builds query string with filters', async () => {
      mockApiCall.mockResolvedValueOnce({});

      await handler({ level: 'error', search: 'TypeError', limit: 20, tabId: 't1' });
      const endpoint = mockApiCall.mock.calls[0][1] as string;
      expect(endpoint).toContain('level=error');
      expect(endpoint).toContain('search=TypeError');
      expect(endpoint).toContain('limit=20');
      expect(vi.mocked(tabHeaders)).toHaveBeenCalledWith('t1');
    });
  });

  // ── zerant_devtools_console_errors ────────────────────────────────
  describe('zerant_devtools_console_errors', () => {
    const handler = getHandler(tools, 'zerant_devtools_console_errors');

    it('returns errors from console', async () => {
      mockApiCall.mockResolvedValueOnce({ entries: [] });

      const result = await handler({});
      expectTextContent(result);
    });

    it('applies limit filter', async () => {
      mockApiCall.mockResolvedValueOnce({});

      await handler({ limit: 5 });
      const endpoint = mockApiCall.mock.calls[0][1] as string;
      expect(endpoint).toContain('limit=5');
    });
  });

  // ── zerant_devtools_console_clear ─────────────────────────────────
  describe('zerant_devtools_console_clear', () => {
    const handler = getHandler(tools, 'zerant_devtools_console_clear');

    it('clears console buffer', async () => {
      mockApiCall.mockResolvedValueOnce({ ok: true });
      const result = await handler({});
      expectTextContent(result);
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/devtools/console/clear', undefined, undefined);
    });

    it('forwards tabId as X-Tab-Id header', async () => {
      mockApiCall.mockResolvedValueOnce({ ok: true });
      await handler({ tabId: 'tab-3' });
      expect(vi.mocked(tabHeaders)).toHaveBeenCalledWith('tab-3');
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/devtools/console/clear', undefined, { 'X-Tab-Id': 'tab-3' });
    });
  });

  // ── zerant_devtools_network ───────────────────────────────────────
  describe('zerant_devtools_network', () => {
    const handler = getHandler(tools, 'zerant_devtools_network');

    it('returns network entries as JSON', async () => {
      const data = { entries: [{ url: 'https://api.com/data', method: 'GET' }] };
      mockApiCall.mockResolvedValueOnce(data);

      const result = await handler({});
      const text = expectTextContent(result);
      expect(JSON.parse(text)).toEqual(data);
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/devtools/network', undefined, undefined);
    });

    it('builds query string with filters', async () => {
      mockApiCall.mockResolvedValueOnce({});

      await handler({ domain: 'api.com', type: 'XHR', limit: 50, failed: true });
      const endpoint = mockApiCall.mock.calls[0][1] as string;
      expect(endpoint).toContain('domain=api.com');
      expect(endpoint).toContain('type=XHR');
      expect(endpoint).toContain('limit=50');
      expect(endpoint).toContain('failed=true');
    });

    it('forwards tabId as X-Tab-Id header', async () => {
      mockApiCall.mockResolvedValueOnce({});
      await handler({ tabId: 'tab-5' });
      expect(vi.mocked(tabHeaders)).toHaveBeenCalledWith('tab-5');
    });
  });

  // ── zerant_devtools_network_body ──────────────────────────────────
  describe('zerant_devtools_network_body', () => {
    const handler = getHandler(tools, 'zerant_devtools_network_body');

    it('returns body for a specific request', async () => {
      mockApiCall.mockResolvedValueOnce({ body: '{"data": true}' });

      const result = await handler({ requestId: 'req-42' });
      expectTextContent(result);
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/devtools/network/req-42/body', undefined, undefined);
    });
  });

  // ── zerant_devtools_network_clear ─────────────────────────────────
  describe('zerant_devtools_network_clear', () => {
    const handler = getHandler(tools, 'zerant_devtools_network_clear');

    it('clears network log', async () => {
      mockApiCall.mockResolvedValueOnce({ ok: true });
      const result = await handler({});
      expectTextContent(result);
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/devtools/network/clear', undefined, undefined);
    });

    it('forwards tabId as X-Tab-Id header', async () => {
      mockApiCall.mockResolvedValueOnce({ ok: true });
      await handler({ tabId: 'tab-4' });
      expect(vi.mocked(tabHeaders)).toHaveBeenCalledWith('tab-4');
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/devtools/network/clear', undefined, { 'X-Tab-Id': 'tab-4' });
    });
  });

  // ── zerant_devtools_evaluate ──────────────────────────────────────
  describe('zerant_devtools_evaluate', () => {
    const handler = getHandler(tools, 'zerant_devtools_evaluate');

    it('evaluates JS expression', async () => {
      mockApiCall.mockResolvedValueOnce({ result: { value: 42 } });

      const result = await handler({ expression: '1 + 1' });
      expectTextContent(result);
      expect(mockApiCall).toHaveBeenCalledWith(
        'POST', '/devtools/evaluate',
        { expression: '1 + 1' },
        undefined,
      );
    });

    it('targets specific tab', async () => {
      mockApiCall.mockResolvedValueOnce({ result: {} });

      await handler({ expression: 'document.title', tabId: 't2' });
      expect(vi.mocked(tabHeaders)).toHaveBeenCalledWith('t2');
    });
  });

  // ── zerant_devtools_dom_query ─────────────────────────────────────
  describe('zerant_devtools_dom_query', () => {
    const handler = getHandler(tools, 'zerant_devtools_dom_query');

    it('queries DOM by CSS selector', async () => {
      mockApiCall.mockResolvedValueOnce({ nodes: [{ tag: 'div' }] });

      const result = await handler({ selector: '.app' });
      expectTextContent(result);
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/devtools/dom/query', { selector: '.app' }, undefined);
    });
  });

  // ── zerant_devtools_dom_xpath ──────────────────────────────────────
  describe('zerant_devtools_dom_xpath', () => {
    const handler = getHandler(tools, 'zerant_devtools_dom_xpath');

    it('queries DOM by XPath', async () => {
      mockApiCall.mockResolvedValueOnce({ nodes: [] });

      const result = await handler({ expression: '//div[@class="app"]' });
      expectTextContent(result);
    });
  });

  // ── zerant_devtools_screenshot_element ─────────────────────────────
  describe('zerant_devtools_screenshot_element', () => {
    const handler = getHandler(tools, 'zerant_devtools_screenshot_element');

    it('returns an image response', async () => {
      mockApiCall.mockResolvedValueOnce('iVBORw0KGgo=');
      mockLogActivity.mockResolvedValueOnce(undefined);

      const result = await handler({ selector: '#hero' });
      const data = expectImageContent(result);
      expect(data).toBe('iVBORw0KGgo=');
      expect(mockApiCall).toHaveBeenCalledWith(
        'POST', '/devtools/screenshot/element',
        { selector: '#hero' },
        undefined,
      );
    });
  });

  // ── zerant_devtools_cdp ───────────────────────────────────────────
  describe('zerant_devtools_cdp', () => {
    const handler = getHandler(tools, 'zerant_devtools_cdp');

    it('sends a raw CDP command', async () => {
      mockApiCall.mockResolvedValueOnce({ result: {} });

      const result = await handler({ method: 'Page.reload', params: { ignoreCache: true } });
      expectTextContent(result);
      expect(mockApiCall).toHaveBeenCalledWith(
        'POST',
        '/devtools/cdp',
        { method: 'Page.reload', params: { ignoreCache: true } },
        undefined,
      );
    });
  });

  // ── zerant_devtools_status ────────────────────────────────────────
  describe('zerant_devtools_status', () => {
    const handler = getHandler(tools, 'zerant_devtools_status');

    it('returns devtools status', async () => {
      mockApiCall.mockResolvedValueOnce({ connected: true });
      const result = await handler({});
      expectTextContent(result);
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/devtools/status', undefined, undefined);
    });
  });

  // ── zerant_devtools_toggle ────────────────────────────────────────
  describe('zerant_devtools_toggle', () => {
    const handler = getHandler(tools, 'zerant_devtools_toggle');

    it('toggles devtools', async () => {
      mockApiCall.mockResolvedValueOnce({ open: true });
      const result = await handler({});
      expectTextContent(result);
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/devtools/toggle');
    });
  });

  describe('tab-aware forwarding', () => {
    it('forwards tabId for network body lookups', async () => {
      mockApiCall.mockResolvedValueOnce({});
      const handler = getHandler(tools, 'zerant_devtools_network_body');

      await handler({ requestId: 'req-1', tabId: 'tab-7' });

      expect(vi.mocked(tabHeaders)).toHaveBeenCalledWith('tab-7');
      expect(mockApiCall).toHaveBeenCalledWith(
        'GET',
        '/devtools/network/req-1/body',
        undefined,
        { 'X-Tab-Id': 'tab-7' },
      );
    });

    it('forwards tabId for status and raw CDP calls', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockApiCall.mockResolvedValueOnce({});
      const statusHandler = getHandler(tools, 'zerant_devtools_status');
      const cdpHandler = getHandler(tools, 'zerant_devtools_cdp');

      await statusHandler({ tabId: 'tab-8' });
      await cdpHandler({ method: 'Page.reload', tabId: 'tab-8' });

      expect(vi.mocked(tabHeaders)).toHaveBeenCalledWith('tab-8');
      expect(mockApiCall).toHaveBeenNthCalledWith(1, 'GET', '/devtools/status', undefined, { 'X-Tab-Id': 'tab-8' });
      expect(mockApiCall).toHaveBeenNthCalledWith(2, 'POST', '/devtools/cdp', { method: 'Page.reload', params: undefined }, { 'X-Tab-Id': 'tab-8' });
    });
  });
});
