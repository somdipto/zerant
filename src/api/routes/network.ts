import type { Router, Request, Response } from 'express';
import type { RouteContext } from '../context';
import { resolveRequestedTab } from '../context';
import type { Tab } from '../../tabs/manager';
import { handleRouteError } from '../../utils/errors';

interface EffectiveTabTarget {
  requestedTabId: string | null;
  tab: Tab | null;
  source: 'header' | 'body' | 'query' | 'session' | 'active';
}

function sendRequestedTabNotFound(res: Response, tabId: string): void {
  res.status(404).json({ error: `Tab ${tabId} not found` });
}

function resolveEffectiveTabTarget(
  ctx: RouteContext,
  req: Request,
  opts?: { allowBody?: boolean; allowQuery?: boolean },
): EffectiveTabTarget {
  const requestedTab = resolveRequestedTab(ctx, req, opts);
  if (requestedTab.requestedTabId) {
    return {
      requestedTabId: requestedTab.requestedTabId,
      tab: requestedTab.tab,
      source: requestedTab.source ?? 'header',
    };
  }

  return {
    requestedTabId: null,
    tab: ctx.tabManager.getActiveTab(),
    source: 'active',
  };
}

function buildTabScope(target: EffectiveTabTarget): {
  kind: 'tab';
  tabId: string | null;
  wcId: number | null;
  source: EffectiveTabTarget['source'];
} {
  return {
    kind: 'tab',
    tabId: target.tab?.id ?? target.requestedTabId ?? null,
    wcId: target.tab?.webContentsId ?? null,
    source: target.source,
  };
}

/**
 * Register network inspector and mock/intercept routes.
 * @param router - Express router to attach routes to
 * @param ctx - shared manager registry and main BrowserWindow
 */
export function registerNetworkRoutes(router: Router, ctx: RouteContext): void {
  // ═══════════════════════════════════════════════
  // NETWORK INSPECTOR — Phase 3.8
  // ═══════════════════════════════════════════════

  router.get('/network/log', (req: Request, res: Response) => {
    try {
      const target = resolveEffectiveTabTarget(ctx, req, { allowQuery: true });
      if (target.requestedTabId && !target.tab) {
        sendRequestedTabNotFound(res, target.requestedTabId);
        return;
      }
      const limit = parseInt(req.query.limit as string) || 100;
      const domain = req.query.domain as string | undefined;
      const type = req.query.type as string | undefined;
      const entries = target.tab
        ? ctx.networkInspector.getLog({ limit, domain, type, tabId: target.tab.id, wcId: target.tab.webContentsId })
        : [];
      res.json({ scope: buildTabScope(target), entries, count: entries.length });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.get('/network/apis', (req: Request, res: Response) => {
    try {
      const target = resolveEffectiveTabTarget(ctx, req, { allowQuery: true });
      if (target.requestedTabId && !target.tab) {
        sendRequestedTabNotFound(res, target.requestedTabId);
        return;
      }
      const apis = target.tab
        ? ctx.networkInspector.getApis({ tabId: target.tab.id, wcId: target.tab.webContentsId })
        : {};
      res.json({ scope: buildTabScope(target), apis });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.get('/network/domains', (req: Request, res: Response) => {
    try {
      const target = resolveEffectiveTabTarget(ctx, req, { allowQuery: true });
      if (target.requestedTabId && !target.tab) {
        sendRequestedTabNotFound(res, target.requestedTabId);
        return;
      }
      const domains = target.tab
        ? ctx.networkInspector.getDomains({ tabId: target.tab.id, wcId: target.tab.webContentsId })
        : [];
      res.json({ scope: buildTabScope(target), domains });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.get('/network/har', (req: Request, res: Response) => {
    try {
      const target = resolveEffectiveTabTarget(ctx, req, { allowQuery: true });
      if (target.requestedTabId && !target.tab) {
        sendRequestedTabNotFound(res, target.requestedTabId);
        return;
      }
      const limit = parseInt(req.query.limit as string) || 100;
      const domain = req.query.domain as string | undefined;
      const har = target.tab
        ? ctx.networkInspector.toHar({ limit, domain, tabId: target.tab.id, wcId: target.tab.webContentsId })
        : ctx.networkInspector.toHar({ limit: 0, domain });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const suffix = domain ? `-${domain.replace(/[^a-zA-Z0-9.-]/g, '_')}` : '';
      const tabSuffix = target.tab?.id ? `-tab-${target.tab.id.replace(/[^a-zA-Z0-9.-]/g, '_')}` : '-tab-none';
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="zerant-network${tabSuffix}${suffix}-${stamp}.har"`);
      res.json(har);
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.delete('/network/clear', (req: Request, res: Response) => {
    try {
      const target = resolveEffectiveTabTarget(ctx, req, { allowBody: true, allowQuery: true });
      if (target.requestedTabId && !target.tab) {
        sendRequestedTabNotFound(res, target.requestedTabId);
        return;
      }
      if (!target.tab) {
        res.status(404).json({ error: 'No active tab' });
        return;
      }
      ctx.networkInspector.clear(target.tab.id);
      res.json({ ok: true, scope: buildTabScope(target) });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // ═══════════════════════════════════════════════
  // NETWORK MOCK — Request Interceptie & Mocking
  // ═══════════════════════════════════════════════

  router.post('/network/mock', async (req: Request, res: Response) => {
    try {
      const { pattern, abort, status, body, headers, delay } = req.body;
      if (!pattern) { res.status(400).json({ error: 'pattern required' }); return; }
      const rule = await ctx.networkMocker.addRule({ pattern, abort, status, body, headers, delay });
      res.json({ ok: true, id: rule.id, pattern: rule.pattern });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // Alias: agent-browser compatible
  router.post('/network/route', async (req: Request, res: Response) => {
    try {
      const { pattern, abort, status, body, headers, delay } = req.body;
      if (!pattern) { res.status(400).json({ error: 'pattern required' }); return; }
      const rule = await ctx.networkMocker.addRule({ pattern, abort, status, body, headers, delay });
      res.json({ ok: true, id: rule.id, pattern: rule.pattern });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.get('/network/mocks', (_req: Request, res: Response) => {
    try {
      const mocks = ctx.networkMocker.getRules().map(r => ({
        id: r.id,
        pattern: r.pattern,
        status: r.status,
        abort: r.abort || false,
        delay: r.delay,
        createdAt: r.createdAt,
      }));
      res.json({ ok: true, mocks, count: mocks.length });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/network/unmock', async (req: Request, res: Response) => {
    try {
      const { pattern, id } = req.body;
      if (!pattern && !id) { res.status(400).json({ error: 'pattern or id required' }); return; }
      let removed = 0;
      if (id) {
        removed = await ctx.networkMocker.removeRuleById(id);
      } else {
        removed = await ctx.networkMocker.removeRule(pattern);
      }
      res.json({ ok: true, removed });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  // Alias: agent-browser compatible
  router.post('/network/unroute', async (req: Request, res: Response) => {
    try {
      const { pattern, id } = req.body;
      if (!pattern && !id) { res.status(400).json({ error: 'pattern or id required' }); return; }
      let removed = 0;
      if (id) {
        removed = await ctx.networkMocker.removeRuleById(id);
      } else {
        removed = await ctx.networkMocker.removeRule(pattern);
      }
      res.json({ ok: true, removed });
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  router.post('/network/mock-clear', async (_req: Request, res: Response) => {
    try {
      const removed = await ctx.networkMocker.clearRules();
      res.json({ ok: true, removed });
    } catch (e) {
      handleRouteError(res, e);
    }
  });
}
