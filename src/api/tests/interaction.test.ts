import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  session: {},
  webContents: {
    fromId: vi.fn().mockReturnValue(null),
    getAllWebContents: vi.fn().mockReturnValue([]),
  },
}));

import { webContents } from 'electron';
import {
  resolveEffectiveTabTarget,
  buildInteractionScope,
  sendRequestedTabNotFound,
} from '../interaction';
import { createMockContext } from './helpers';

function makeReq(overrides: {
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
} = {}): Request {
  return {
    headers: overrides.headers ?? {},
    body: overrides.body ?? {},
    query: overrides.query ?? {},
  } as unknown as Request;
}

function makeRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response;
}

describe('sendRequestedTabNotFound', () => {
  it('sends a 404 json error with the tab id', () => {
    const res = makeRes();
    sendRequestedTabNotFound(res, 'tab-xyz');
    expect((res as any).status).toHaveBeenCalledWith(404);
    expect((res as any).json).toHaveBeenCalledWith({ error: 'Tab tab-xyz not found' });
  });
});

describe('resolveEffectiveTabTarget', () => {
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    ctx = createMockContext();
  });

  it('resolves from X-Tab-Id header when present', () => {
    const req = makeReq({ headers: { 'x-tab-id': 'tab-1' } });
    const result = resolveEffectiveTabTarget(ctx, req);
    expect(result.requestedTabId).toBe('tab-1');
    expect(result.tab?.id).toBe('tab-1');
    expect(result.source).toBe('header');
    expect(result.sessionName).toBeNull();
  });

  it('returns tab:null when X-Tab-Id does not match any tab', () => {
    vi.mocked(ctx.tabManager.listTabs).mockReturnValue([]);
    const req = makeReq({ headers: { 'x-tab-id': 'tab-missing' } });
    const result = resolveEffectiveTabTarget(ctx, req);
    expect(result.requestedTabId).toBe('tab-missing');
    expect(result.tab).toBeNull();
    expect(result.source).toBe('header');
  });

  it('falls back to active tab when no tab id or session provided', () => {
    const req = makeReq();
    const result = resolveEffectiveTabTarget(ctx, req);
    expect(result.requestedTabId).toBeNull();
    expect(result.tab?.id).toBe('tab-1');
    expect(result.source).toBe('active');
    expect(result.sessionName).toBeNull();
  });

  it('resolves by session when x-session header is set (non-default)', () => {
    vi.mocked(ctx.sessionManager.resolvePartition).mockReturnValue('persist:my-session');
    vi.mocked(ctx.tabManager.listTabs).mockReturnValue([
      {
        id: 'tab-s',
        webContentsId: 300,
        url: 'https://session.example.com',
        title: 'Session',
        active: false,
        source: 'wingman',
        partition: 'persist:my-session',
      } as any,
    ]);
    const req = makeReq({ headers: { 'x-session': 'my-session' } });
    const result = resolveEffectiveTabTarget(ctx, req);
    expect(result.source).toBe('session');
    expect(result.sessionName).toBe('my-session');
    expect(result.tab?.id).toBe('tab-s');
  });

  it('returns null session tab when session partition has no matching tab', () => {
    vi.mocked(ctx.sessionManager.resolvePartition).mockReturnValue('persist:empty-session');
    vi.mocked(ctx.tabManager.listTabs).mockReturnValue([]);
    const req = makeReq({ headers: { 'x-session': 'empty-session' } });
    const result = resolveEffectiveTabTarget(ctx, req);
    expect(result.source).toBe('session');
    expect(result.sessionName).toBe('empty-session');
    expect(result.tab).toBeNull();
  });

  it('falls back to active tab when x-session is "default"', () => {
    const req = makeReq({ headers: { 'x-session': 'default' } });
    const result = resolveEffectiveTabTarget(ctx, req);
    expect(result.source).toBe('active');
    expect(result.sessionName).toBeNull();
  });

  it('skips session resolution when allowSession is false', () => {
    vi.mocked(ctx.sessionManager.resolvePartition).mockReturnValue('persist:my-session');
    const req = makeReq({ headers: { 'x-session': 'my-session' } });
    const result = resolveEffectiveTabTarget(ctx, req, { allowSession: false });
    expect(result.source).toBe('active');
    expect(result.sessionName).toBeNull();
  });
});

describe('buildInteractionScope', () => {
  it('builds scope from a resolved tab', () => {
    const scope = buildInteractionScope({
      requestedTabId: null,
      tab: {
        id: 'tab-1',
        webContentsId: 100,
        url: 'https://example.com',
        title: 'Example',
        active: true,
        source: 'user',
        partition: 'persist:zerant',
      } as any,
      source: 'active',
      sessionName: null,
    });

    expect(scope).toEqual({
      kind: 'tab',
      tabId: 'tab-1',
      wcId: 100,
      source: 'active',
      url: 'https://example.com',
      title: 'Example',
      sessionName: null,
    });
  });

  it('builds scope when tab is null but requestedTabId is set', () => {
    vi.mocked(webContents.fromId).mockReturnValue(null);

    const scope = buildInteractionScope({
      requestedTabId: 'tab-ghost',
      tab: null,
      source: 'header',
      sessionName: null,
    });

    expect(scope).toEqual({
      kind: 'tab',
      tabId: 'tab-ghost',
      wcId: null,
      source: 'header',
      url: null,
      title: null,
      sessionName: null,
    });
  });

  it('includes sessionName for session-scoped targets', () => {
    const scope = buildInteractionScope({
      requestedTabId: null,
      tab: {
        id: 'tab-s',
        webContentsId: 200,
        url: 'https://s.example.com',
        title: 'Session Tab',
        active: false,
        source: 'wingman',
        partition: 'persist:work',
      } as any,
      source: 'session',
      sessionName: 'work',
    });

    expect(scope.sessionName).toBe('work');
    expect(scope.source).toBe('session');
    expect(scope.tabId).toBe('tab-s');
  });
});
