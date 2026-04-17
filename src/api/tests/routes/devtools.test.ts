import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type * as ConstantsModule from '../../../utils/constants';

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  session: {},
  webContents: {
    fromId: vi.fn().mockReturnValue(null),
    getAllWebContents: vi.fn().mockReturnValue([]),
  },
}));

// Mock the constants module so DEFAULT_TIMEOUT_MS is short for timeout tests
vi.mock('../../../utils/constants', async (importOriginal) => {
  const actual = await importOriginal<typeof ConstantsModule>();
  return {
    ...actual,
    DEFAULT_TIMEOUT_MS: 100, // 100ms instead of 30s for fast tests
  };
});

import express from 'express';
import { registerDevtoolsRoutes } from '../../routes/devtools';
import { createMockContext, createTestApp } from '../helpers';
import type { RouteContext } from '../../context';

/** Creates a test app with a large JSON body limit (needed for the 413 test) */
function createLargeBodyTestApp(ctx: RouteContext) {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  const router = express.Router();
  registerDevtoolsRoutes(router, ctx);
  app.use(router);
  return app;
}

describe('Devtools Routes', () => {
  let ctx: RouteContext;
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockContext();
    app = createTestApp(registerDevtoolsRoutes, ctx);
  });

  // ─── GET /devtools/status ──────────────────────────

  describe('GET /devtools/status', () => {
    it('returns devtools status for the active tab with scope metadata', async () => {
      const managerStatus = { attached: true, tabId: 'tab-2', wcId: 200, console: { entries: 4, errors: 1, lastId: 9 }, network: { entries: 7 } };
      const scopedStatus = { attached: true, tabId: 'tab-1', wcId: 100, console: { entries: 2, errors: 1, lastId: 5 }, network: { entries: 3 } };
      vi.mocked(ctx.devToolsManager.getStatus)
        .mockReturnValueOnce(managerStatus as any)
        .mockReturnValueOnce(scopedStatus as any);

      const res = await request(app).get('/devtools/status');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ...scopedStatus,
        scope: { kind: 'tab', tabId: 'tab-1', wcId: 100, source: 'active' },
        managerPrimary: { attached: true, tabId: 'tab-2', wcId: 200 },
      });
      expect(ctx.devToolsManager.getStatus).toHaveBeenNthCalledWith(1);
      expect(ctx.devToolsManager.getStatus).toHaveBeenNthCalledWith(2, { tabId: 'tab-1', wcId: 100 });
    });

    it('returns 404 when X-Tab-Id header refers to unknown tab', async () => {
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([]);

      const res = await request(app).get('/devtools/status').set('X-Tab-Id', 'tab-missing');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Tab tab-missing not found');
    });

    it('returns scoped status when valid X-Tab-Id header is provided', async () => {
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([
        { id: 'tab-2', webContentsId: 202, url: 'https://two.example', title: 'Two', active: false, source: 'wingman', partition: 'persist:zerant' } as any,
      ]);
      const managerStatus = { attached: true, tabId: 'tab-2', wcId: 202 };
      const scopedStatus = { attached: true, tabId: 'tab-2', wcId: 202, console: { entries: 1, errors: 0, lastId: 1 }, network: { entries: 0 } };
      vi.mocked(ctx.devToolsManager.getStatus)
        .mockReturnValueOnce(managerStatus as any)
        .mockReturnValueOnce(scopedStatus as any);

      const res = await request(app).get('/devtools/status').set('X-Tab-Id', 'tab-2');

      expect(res.status).toBe(200);
      expect(res.body.scope).toEqual({ kind: 'tab', tabId: 'tab-2', wcId: 202, source: 'header' });
    });

    it('returns default empty scoped status when no active tab exists', async () => {
      vi.mocked(ctx.tabManager.getActiveTab).mockReturnValue(null as any);
      const managerStatus = { attached: false, tabId: null, wcId: null };
      vi.mocked(ctx.devToolsManager.getStatus).mockReturnValue(managerStatus as any);

      const res = await request(app).get('/devtools/status');

      expect(res.status).toBe(200);
      expect(res.body.scope).toEqual({ kind: 'tab', tabId: null, wcId: null, source: 'active' });
      expect(res.body.attached).toBe(false);
      expect(res.body.console).toEqual({ entries: 0, errors: 0, lastId: 0 });
    });

    it('returns 500 when getStatus throws', async () => {
      vi.mocked(ctx.devToolsManager.getStatus).mockImplementation(() => {
        throw new Error('CDP failed');
      });

      const res = await request(app).get('/devtools/status');

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('CDP failed');
    });
  });

  // ─── GET /devtools/console ─────────────────────────

  describe('GET /devtools/console', () => {
    it('returns console entries with defaults', async () => {
      const entries = [{ id: 1, level: 'log', text: 'hello' }];
      const counts = { log: 1, error: 0 };
      vi.mocked(ctx.devToolsManager.getConsoleEntries).mockReturnValue(entries as any);
      vi.mocked(ctx.devToolsManager.getConsoleCounts).mockReturnValue(counts as any);

      const res = await request(app).get('/devtools/console');

      expect(res.status).toBe(200);
      expect(res.body.scope).toEqual({ kind: 'tab', tabId: 'tab-1', wcId: 100, source: 'active' });
      expect(res.body.entries).toEqual(entries);
      expect(res.body.counts).toEqual(counts);
      expect(res.body.total).toBe(1);
      expect(ctx.devToolsManager.getConsoleEntries).toHaveBeenCalledWith({
        level: undefined,
        sinceId: undefined,
        limit: 100,
        search: undefined,
        tabId: 'tab-1',
      });
      expect(ctx.devToolsManager.getConsoleCounts).toHaveBeenCalledWith('tab-1');
    });

    it('parses level, since_id, limit, and search query params', async () => {
      vi.mocked(ctx.devToolsManager.getConsoleEntries).mockReturnValue([] as any);
      vi.mocked(ctx.devToolsManager.getConsoleCounts).mockReturnValue({} as any);

      const res = await request(app)
        .get('/devtools/console')
        .query({ level: 'error', since_id: '5', limit: '20', search: 'foo' });

      expect(res.status).toBe(200);
      expect(ctx.devToolsManager.getConsoleEntries).toHaveBeenCalledWith({
        level: 'error',
        sinceId: 5,
        limit: 20,
        search: 'foo',
        tabId: 'tab-1',
      });
    });

    it('uses X-Tab-Id to scope console retrieval to a background tab', async () => {
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([
        { id: 'tab-2', webContentsId: 202, url: 'https://two.example', title: 'Two', active: false, source: 'wingman', partition: 'persist:zerant' } as any,
      ]);
      vi.mocked(ctx.devToolsManager.getConsoleEntries).mockReturnValue([] as any);
      vi.mocked(ctx.devToolsManager.getConsoleCounts).mockReturnValue({} as any);

      const res = await request(app)
        .get('/devtools/console')
        .set('X-Tab-Id', 'tab-2');

      expect(res.status).toBe(200);
      expect(res.body.scope).toEqual({ kind: 'tab', tabId: 'tab-2', wcId: 202, source: 'header' });
      expect(ctx.devToolsManager.getConsoleEntries).toHaveBeenCalledWith(expect.objectContaining({ tabId: 'tab-2' }));
      expect(ctx.devToolsManager.getConsoleCounts).toHaveBeenCalledWith('tab-2');
    });

    it('returns 404 when X-Tab-Id header refers to unknown tab', async () => {
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([]);

      const res = await request(app).get('/devtools/console').set('X-Tab-Id', 'tab-gone');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Tab tab-gone not found');
    });

    it('returns empty entries and zero counts when no active tab', async () => {
      vi.mocked(ctx.tabManager.getActiveTab).mockReturnValue(null as any);

      const res = await request(app).get('/devtools/console');

      expect(res.status).toBe(200);
      expect(res.body.entries).toEqual([]);
      expect(res.body.counts).toEqual({ log: 0, info: 0, warn: 0, error: 0, debug: 0 });
      expect(res.body.total).toBe(0);
      expect(ctx.devToolsManager.getConsoleEntries).not.toHaveBeenCalled();
    });
  });

  // ─── GET /devtools/console/errors ──────────────────

  describe('GET /devtools/console/errors', () => {
    it('returns console errors with default limit', async () => {
      const errors = [{ id: 1, level: 'error', text: 'oops' }];
      vi.mocked(ctx.devToolsManager.getConsoleErrors).mockReturnValue(errors as any);

      const res = await request(app).get('/devtools/console/errors');

      expect(res.status).toBe(200);
      expect(res.body.errors).toEqual(errors);
      expect(res.body.total).toBe(1);
      expect(res.body.scope).toEqual({ kind: 'tab', tabId: 'tab-1', wcId: 100, source: 'active' });
      expect(ctx.devToolsManager.getConsoleErrors).toHaveBeenCalledWith(50, 'tab-1');
    });

    it('parses limit query param', async () => {
      vi.mocked(ctx.devToolsManager.getConsoleErrors).mockReturnValue([] as any);

      const res = await request(app)
        .get('/devtools/console/errors')
        .query({ limit: '10' });

      expect(res.status).toBe(200);
      expect(ctx.devToolsManager.getConsoleErrors).toHaveBeenCalledWith(10, 'tab-1');
    });

    it('returns 404 when X-Tab-Id header refers to unknown tab', async () => {
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([]);

      const res = await request(app).get('/devtools/console/errors').set('X-Tab-Id', 'tab-gone');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Tab tab-gone not found');
    });

    it('returns empty errors array when no active tab', async () => {
      vi.mocked(ctx.tabManager.getActiveTab).mockReturnValue(null as any);

      const res = await request(app).get('/devtools/console/errors');

      expect(res.status).toBe(200);
      expect(res.body.errors).toEqual([]);
      expect(res.body.total).toBe(0);
      expect(ctx.devToolsManager.getConsoleErrors).not.toHaveBeenCalled();
    });
  });

  // ─── POST /devtools/console/clear ──────────────────

  describe('POST /devtools/console/clear', () => {
    it('clears the console buffer', async () => {
      const res = await request(app).post('/devtools/console/clear');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ok: true,
        scope: { kind: 'tab', tabId: 'tab-1', wcId: 100, source: 'active' },
      });
      expect(ctx.devToolsManager.clearConsole).toHaveBeenCalledWith('tab-1');
    });

    it('returns 404 when X-Tab-Id header refers to unknown tab', async () => {
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([]);

      const res = await request(app).post('/devtools/console/clear').set('X-Tab-Id', 'tab-gone');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Tab tab-gone not found');
    });

    it('returns 404 when there is no active tab', async () => {
      vi.mocked(ctx.tabManager.getActiveTab).mockReturnValue(null as any);

      const res = await request(app).post('/devtools/console/clear');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('No active tab');
    });

    it('clears a specific background tab when tabId is in body', async () => {
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([
        { id: 'tab-2', webContentsId: 202, url: 'https://two.example', title: 'Two', active: false, source: 'wingman', partition: 'persist:zerant' } as any,
      ]);

      const res = await request(app).post('/devtools/console/clear').send({ tabId: 'tab-2' });

      expect(res.status).toBe(200);
      expect(res.body.scope).toEqual({ kind: 'tab', tabId: 'tab-2', wcId: 202, source: 'body' });
      expect(ctx.devToolsManager.clearConsole).toHaveBeenCalledWith('tab-2');
    });
  });

  // ─── GET /devtools/network ─────────────────────────

  describe('GET /devtools/network', () => {
    it('returns network entries with defaults', async () => {
      const entries = [{ requestId: 'r1', url: 'https://api.example.com' }];
      vi.mocked(ctx.devToolsManager.getNetworkEntries).mockReturnValue(entries as any);

      const res = await request(app).get('/devtools/network');

      expect(res.status).toBe(200);
      expect(res.body.scope).toEqual({ kind: 'tab', tabId: 'tab-1', wcId: 100, source: 'active' });
      expect(res.body.entries).toEqual(entries);
      expect(res.body.total).toBe(1);
      expect(ctx.devToolsManager.getNetworkEntries).toHaveBeenCalledWith({
        limit: 100,
        domain: undefined,
        type: undefined,
        failed: undefined,
        search: undefined,
        statusMin: undefined,
        statusMax: undefined,
        tabId: 'tab-1',
        wcId: 100,
      });
    });

    it('parses all network query params', async () => {
      vi.mocked(ctx.devToolsManager.getNetworkEntries).mockReturnValue([] as any);

      const res = await request(app)
        .get('/devtools/network')
        .query({
          limit: '50',
          domain: 'api.example.com',
          type: 'XHR',
          failed: 'true',
          search: 'users',
          status_min: '400',
          status_max: '500',
        });

      expect(res.status).toBe(200);
      expect(ctx.devToolsManager.getNetworkEntries).toHaveBeenCalledWith({
        limit: 50,
        domain: 'api.example.com',
        type: 'XHR',
        failed: true,
        search: 'users',
        statusMin: 400,
        statusMax: 500,
        tabId: 'tab-1',
        wcId: 100,
      });
    });

    it('parses failed=false correctly', async () => {
      vi.mocked(ctx.devToolsManager.getNetworkEntries).mockReturnValue([] as any);

      await request(app).get('/devtools/network').query({ failed: 'false' });

      expect(ctx.devToolsManager.getNetworkEntries).toHaveBeenCalledWith(
        expect.objectContaining({ failed: false, tabId: 'tab-1', wcId: 100 }),
      );
    });

    it('returns 404 when X-Tab-Id header refers to unknown tab', async () => {
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([]);

      const res = await request(app).get('/devtools/network').set('X-Tab-Id', 'tab-gone');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Tab tab-gone not found');
    });

    it('returns empty entries when no active tab', async () => {
      vi.mocked(ctx.tabManager.getActiveTab).mockReturnValue(null as any);

      const res = await request(app).get('/devtools/network');

      expect(res.status).toBe(200);
      expect(res.body.entries).toEqual([]);
      expect(res.body.total).toBe(0);
      expect(ctx.devToolsManager.getNetworkEntries).not.toHaveBeenCalled();
    });
  });

  // ─── GET /devtools/network/:requestId/body ─────────

  describe('GET /devtools/network/:requestId/body', () => {
    it('returns response body when available', async () => {
      const body = { base64Encoded: false, body: '{"ok":true}' };
      vi.mocked(ctx.devToolsManager.getResponseBody).mockResolvedValue(body as any);

      const res = await request(app).get('/devtools/network/req-123/body');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ...body,
        requestId: 'req-123',
        scope: { kind: 'tab', tabId: 'tab-1', wcId: 100, source: 'active' },
      });
      expect(ctx.devToolsManager.getResponseBody).toHaveBeenCalledWith('req-123', { tabId: 'tab-1', wcId: 100 });
    });

    it('returns 404 when body is null', async () => {
      vi.mocked(ctx.devToolsManager.getResponseBody).mockResolvedValue(null as any);

      const res = await request(app).get('/devtools/network/req-123/body');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Response body not available (evicted or streamed)');
    });

    it('returns 404 when X-Tab-Id header refers to unknown tab', async () => {
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([]);

      const res = await request(app).get('/devtools/network/req-123/body').set('X-Tab-Id', 'tab-gone');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Tab tab-gone not found');
    });

    it('returns 404 when there is no active tab', async () => {
      vi.mocked(ctx.tabManager.getActiveTab).mockReturnValue(null as any);

      const res = await request(app).get('/devtools/network/req-123/body');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('No active tab');
    });
  });

  // ─── POST /devtools/network/clear ──────────────────

  describe('POST /devtools/network/clear', () => {
    it('clears the network log', async () => {
      const res = await request(app).post('/devtools/network/clear');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ok: true,
        scope: { kind: 'tab', tabId: 'tab-1', wcId: 100, source: 'active' },
      });
      expect(ctx.devToolsManager.clearNetwork).toHaveBeenCalledWith('tab-1');
    });

    it('returns 404 when X-Tab-Id header refers to unknown tab', async () => {
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([]);

      const res = await request(app).post('/devtools/network/clear').set('X-Tab-Id', 'tab-gone');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Tab tab-gone not found');
    });

    it('returns 404 when there is no active tab', async () => {
      vi.mocked(ctx.tabManager.getActiveTab).mockReturnValue(null as any);

      const res = await request(app).post('/devtools/network/clear');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('No active tab');
    });
  });

  // ─── POST /devtools/dom/query ──────────────────────

  describe('POST /devtools/dom/query', () => {
    it('queries DOM by CSS selector', async () => {
      const nodes = [{ nodeId: 1, tagName: 'div' }];
      vi.mocked(ctx.devToolsManager.queryDOM).mockResolvedValue(nodes as any);

      const res = await request(app)
        .post('/devtools/dom/query')
        .send({ selector: '.main', maxResults: 5 });

      expect(res.status).toBe(200);
      expect(res.body.scope).toEqual({ kind: 'tab', tabId: 'tab-1', wcId: 100, source: 'active' });
      expect(res.body.nodes).toEqual(nodes);
      expect(res.body.total).toBe(1);
      expect(ctx.devToolsManager.queryDOM).toHaveBeenCalledWith('.main', 5, 100);
    });

    it('uses default maxResults of 10', async () => {
      vi.mocked(ctx.devToolsManager.queryDOM).mockResolvedValue([] as any);

      await request(app)
        .post('/devtools/dom/query')
        .send({ selector: 'div' });

      expect(ctx.devToolsManager.queryDOM).toHaveBeenCalledWith('div', 10, 100);
    });

    it('returns 400 when selector is missing', async () => {
      const res = await request(app)
        .post('/devtools/dom/query')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('selector required');
    });

    it('returns 404 when X-Tab-Id header refers to unknown tab', async () => {
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([]);

      const res = await request(app)
        .post('/devtools/dom/query')
        .set('X-Tab-Id', 'tab-gone')
        .send({ selector: 'div' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Tab tab-gone not found');
    });

    it('returns 404 when there is no active tab', async () => {
      vi.mocked(ctx.tabManager.getActiveTab).mockReturnValue(null as any);

      const res = await request(app)
        .post('/devtools/dom/query')
        .send({ selector: 'div' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('No active tab');
    });
  });

  // ─── POST /devtools/dom/xpath ──────────────────────

  describe('POST /devtools/dom/xpath', () => {
    it('queries DOM by XPath expression', async () => {
      const nodes = [{ nodeId: 1, tagName: 'span' }];
      vi.mocked(ctx.devToolsManager.queryXPath).mockResolvedValue(nodes as any);

      const res = await request(app)
        .post('/devtools/dom/xpath')
        .send({ expression: '//div[@class="main"]', maxResults: 3 });

      expect(res.status).toBe(200);
      expect(res.body.scope).toEqual({ kind: 'tab', tabId: 'tab-1', wcId: 100, source: 'active' });
      expect(res.body.nodes).toEqual(nodes);
      expect(res.body.total).toBe(1);
      expect(ctx.devToolsManager.queryXPath).toHaveBeenCalledWith('//div[@class="main"]', 3, 100);
    });

    it('uses default maxResults of 10', async () => {
      vi.mocked(ctx.devToolsManager.queryXPath).mockResolvedValue([] as any);

      await request(app)
        .post('/devtools/dom/xpath')
        .send({ expression: '//h1' });

      expect(ctx.devToolsManager.queryXPath).toHaveBeenCalledWith('//h1', 10, 100);
    });

    it('returns 400 when expression is missing', async () => {
      const res = await request(app)
        .post('/devtools/dom/xpath')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('expression required');
    });

    it('returns 404 when X-Tab-Id header refers to unknown tab', async () => {
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([]);

      const res = await request(app)
        .post('/devtools/dom/xpath')
        .set('X-Tab-Id', 'tab-gone')
        .send({ expression: '//div' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Tab tab-gone not found');
    });

    it('returns 404 when there is no active tab', async () => {
      vi.mocked(ctx.tabManager.getActiveTab).mockReturnValue(null as any);

      const res = await request(app)
        .post('/devtools/dom/xpath')
        .send({ expression: '//div' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('No active tab');
    });
  });

  // ─── GET /devtools/storage ─────────────────────────

  describe('GET /devtools/storage', () => {
    it('returns storage data', async () => {
      const data = { cookies: [], localStorage: {}, sessionStorage: {} };
      vi.mocked(ctx.devToolsManager.getStorage).mockResolvedValue(data as any);

      const res = await request(app).get('/devtools/storage');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ...data,
        scope: { kind: 'tab', tabId: 'tab-1', wcId: 100, source: 'active' },
      });
      expect(ctx.devToolsManager.getStorage).toHaveBeenCalledWith(100);
    });

    it('returns 404 when X-Tab-Id header refers to unknown tab', async () => {
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([]);

      const res = await request(app).get('/devtools/storage').set('X-Tab-Id', 'tab-gone');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Tab tab-gone not found');
    });

    it('returns 404 when there is no active tab', async () => {
      vi.mocked(ctx.tabManager.getActiveTab).mockReturnValue(null as any);

      const res = await request(app).get('/devtools/storage');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('No active tab');
    });
  });

  // ─── GET /devtools/performance ─────────────────────

  describe('GET /devtools/performance', () => {
    it('returns performance metrics when available', async () => {
      const metrics = { Timestamp: 1234, Documents: 5 };
      vi.mocked(ctx.devToolsManager.getPerformanceMetrics).mockResolvedValue(metrics as any);

      const res = await request(app).get('/devtools/performance');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        ...metrics,
        scope: { kind: 'tab', tabId: 'tab-1', wcId: 100, source: 'active' },
      });
      expect(ctx.devToolsManager.getPerformanceMetrics).toHaveBeenCalledWith(100);
    });

    it('returns 503 when metrics are null', async () => {
      vi.mocked(ctx.devToolsManager.getPerformanceMetrics).mockResolvedValue(null as any);

      const res = await request(app).get('/devtools/performance');

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('No targeted tab or CDP not attached');
    });

    it('returns 404 when X-Tab-Id header refers to unknown tab', async () => {
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([]);

      const res = await request(app).get('/devtools/performance').set('X-Tab-Id', 'tab-gone');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Tab tab-gone not found');
    });

    it('returns 404 when there is no active tab', async () => {
      vi.mocked(ctx.tabManager.getActiveTab).mockReturnValue(null as any);

      const res = await request(app).get('/devtools/performance');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('No active tab');
    });
  });

  // ─── POST /devtools/evaluate ───────────────────────

  describe('POST /devtools/evaluate', () => {
    it('evaluates an expression with defaults', async () => {
      const result = { type: 'number', value: 42 };
      vi.mocked(ctx.devToolsManager.evaluateInTab).mockResolvedValue(result as any);

      const res = await request(app)
        .post('/devtools/evaluate')
        .send({ expression: '1 + 1' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.result).toEqual(result);
      expect(res.body.scope).toEqual({ kind: 'tab', tabId: 'tab-1', wcId: 100, source: 'active' });
      expect(ctx.devToolsManager.evaluateInTab).toHaveBeenCalledWith(100, '1 + 1', {
        returnByValue: true,
        awaitPromise: true,
      });
    });

    it('passes returnByValue and awaitPromise options', async () => {
      vi.mocked(ctx.devToolsManager.evaluateInTab).mockResolvedValue({} as any);

      await request(app)
        .post('/devtools/evaluate')
        .send({ expression: 'document', returnByValue: false, awaitPromise: false });

      expect(ctx.devToolsManager.evaluateInTab).toHaveBeenCalledWith(100, 'document', {
        returnByValue: false,
        awaitPromise: false,
      });
    });

    it('returns 400 when expression is missing', async () => {
      const res = await request(app)
        .post('/devtools/evaluate')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('expression required');
    });

    it('returns 404 when X-Tab-Id header refers to unknown tab', async () => {
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([]);

      const res = await request(app)
        .post('/devtools/evaluate')
        .set('X-Tab-Id', 'tab-gone')
        .send({ expression: '1+1' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Tab tab-gone not found');
    });

    it('returns 404 when there is no active tab', async () => {
      vi.mocked(ctx.tabManager.getActiveTab).mockReturnValue(null as any);

      const res = await request(app)
        .post('/devtools/evaluate')
        .send({ expression: '1+1' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('No active tab');
    });

    it('returns 413 when expression exceeds 1MB', async () => {
      // Need a larger JSON body limit than express default (100KB)
      const bigApp = createLargeBodyTestApp(ctx);
      const hugeExpression = 'x'.repeat(1_048_577);

      const res = await request(bigApp)
        .post('/devtools/evaluate')
        .send({ expression: hugeExpression });

      expect(res.status).toBe(413);
      expect(res.body.error).toBe('Expression too large (max 1MB)');
    });

    it('returns 408 when evaluation times out', async () => {
      // evaluate returns a promise that never resolves
      vi.mocked(ctx.devToolsManager.evaluateInTab).mockReturnValue(new Promise(() => {}) as any);

      const res = await request(app)
        .post('/devtools/evaluate')
        .send({ expression: 'while(true){}' });

      expect(res.status).toBe(408);
      // The mocked DEFAULT_TIMEOUT_MS is 100ms, so 0.1s
      expect(res.body.error).toMatch(/Execution timed out/);
    });

    it('returns 500 when evaluate throws', async () => {
      vi.mocked(ctx.devToolsManager.evaluateInTab).mockRejectedValue(new Error('CDP disconnected'));

      const res = await request(app)
        .post('/devtools/evaluate')
        .send({ expression: 'foo()' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('CDP disconnected');
    });
  });

  // ─── POST /devtools/cdp ───────────────────────────

  describe('POST /devtools/cdp', () => {
    it('sends a raw CDP command', async () => {
      const result = { nodes: [] };
      vi.mocked(ctx.devToolsManager.sendCommandToTab).mockResolvedValue(result as any);

      const res = await request(app)
        .post('/devtools/cdp')
        .send({ method: 'DOM.getDocument', params: { depth: 1 } });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.result).toEqual(result);
      expect(res.body.scope).toEqual({ kind: 'tab', tabId: 'tab-1', wcId: 100, source: 'active' });
      expect(ctx.devToolsManager.sendCommandToTab).toHaveBeenCalledWith(100, 'DOM.getDocument', { depth: 1 });
    });

    it('sends a CDP command without params', async () => {
      vi.mocked(ctx.devToolsManager.sendCommandToTab).mockResolvedValue({} as any);

      const res = await request(app)
        .post('/devtools/cdp')
        .send({ method: 'Page.reload' });

      expect(res.status).toBe(200);
      expect(ctx.devToolsManager.sendCommandToTab).toHaveBeenCalledWith(100, 'Page.reload', undefined);
    });

    it('returns 400 when method is missing', async () => {
      const res = await request(app)
        .post('/devtools/cdp')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('method required');
    });

    it('returns 404 when X-Tab-Id header refers to unknown tab', async () => {
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([]);

      const res = await request(app)
        .post('/devtools/cdp')
        .set('X-Tab-Id', 'tab-gone')
        .send({ method: 'Page.reload' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Tab tab-gone not found');
    });

    it('returns 404 when there is no active tab', async () => {
      vi.mocked(ctx.tabManager.getActiveTab).mockReturnValue(null as any);

      const res = await request(app)
        .post('/devtools/cdp')
        .send({ method: 'Page.reload' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('No active tab');
    });
  });

  // ─── POST /devtools/screenshot/element ─────────────

  describe('POST /devtools/screenshot/element', () => {
    it('returns a PNG screenshot of the element', async () => {
      const pngBuffer = Buffer.from('fake-png-data');
      vi.mocked(ctx.devToolsManager.screenshotElement).mockResolvedValue(pngBuffer as any);

      const res = await request(app)
        .post('/devtools/screenshot/element')
        .send({ selector: '#hero' })
        .responseType('blob');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/image\/png/);
      expect(Buffer.isBuffer(res.body)).toBe(true);
      expect(res.body.toString()).toBe('fake-png-data');
      expect(ctx.devToolsManager.screenshotElement).toHaveBeenCalledWith('#hero', 100);
    });

    it('returns 400 when selector is missing', async () => {
      const res = await request(app)
        .post('/devtools/screenshot/element')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('selector required');
    });

    it('returns 404 when element is not found', async () => {
      vi.mocked(ctx.devToolsManager.screenshotElement).mockResolvedValue(null as any);

      const res = await request(app)
        .post('/devtools/screenshot/element')
        .send({ selector: '#nonexistent' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Element not found or screenshot failed');
    });

    it('returns 404 when X-Tab-Id header refers to unknown tab', async () => {
      vi.mocked(ctx.tabManager.listTabs).mockReturnValue([]);

      const res = await request(app)
        .post('/devtools/screenshot/element')
        .set('X-Tab-Id', 'tab-gone')
        .send({ selector: '#hero' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Tab tab-gone not found');
    });

    it('returns 404 when there is no active tab', async () => {
      vi.mocked(ctx.tabManager.getActiveTab).mockReturnValue(null as any);

      const res = await request(app)
        .post('/devtools/screenshot/element')
        .send({ selector: '#hero' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('No active tab');
    });
  });

  // ─── POST /devtools/toggle ─────────────────────────

  describe('POST /devtools/toggle', () => {
    it('opens devtools when currently closed', async () => {
      const mockWc = {
        isDevToolsOpened: vi.fn().mockReturnValueOnce(false).mockReturnValue(true),
        openDevTools: vi.fn(),
        closeDevTools: vi.fn(),
      };
      vi.mocked(ctx.tabManager.getActiveWebContents).mockResolvedValue(mockWc as any);

      const res = await request(app).post('/devtools/toggle');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(mockWc.openDevTools).toHaveBeenCalledWith({ mode: 'detach' });
      expect(mockWc.closeDevTools).not.toHaveBeenCalled();
    });

    it('closes devtools when currently open', async () => {
      const mockWc = {
        isDevToolsOpened: vi.fn().mockReturnValueOnce(true).mockReturnValue(false),
        openDevTools: vi.fn(),
        closeDevTools: vi.fn(),
      };
      vi.mocked(ctx.tabManager.getActiveWebContents).mockResolvedValue(mockWc as any);

      const res = await request(app).post('/devtools/toggle');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(mockWc.closeDevTools).toHaveBeenCalled();
      expect(mockWc.openDevTools).not.toHaveBeenCalled();
    });

    it('returns 404 when there is no active tab', async () => {
      vi.mocked(ctx.tabManager.getActiveWebContents).mockResolvedValue(null as any);

      const res = await request(app).post('/devtools/toggle');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('No active tab');
    });
  });
});
