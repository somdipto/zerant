import path from 'path';
import fs from 'fs';
import { STATUS_CODES } from 'http';
import type { RequestDispatcher } from './dispatcher';
import { zerantDir } from '../utils/paths';
import { createLogger } from '../utils/logger';

const log = createLogger('NetworkInspector');

// ─── Types ───

export interface NetworkRequest {
  id: number;
  url: string;
  method: string;
  status: number;
  contentType: string;
  size: number;
  timestamp: number;
  initiator: string;
  domain: string;
  durationMs: number;
  resourceType?: string;
  tabId?: string;
  wcId?: number;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string[]>;
}

interface DomainData {
  domain: string;
  requests: number;
  apis: string[];
  lastSeen: number;
}

interface NetworkQueryOptions {
  limit?: number;
  domain?: string;
  type?: string;
  tabId?: string;
  wcId?: number;
}

interface HarHeader {
  name: string;
  value: string;
}

interface HarEntry {
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    httpVersion: string;
    cookies: unknown[];
    headers: HarHeader[];
    queryString: Array<{ name: string; value: string }>;
    headersSize: number;
    bodySize: number;
  };
  response: {
    status: number;
    statusText: string;
    httpVersion: string;
    cookies: unknown[];
    headers: HarHeader[];
    content: {
      size: number;
      mimeType: string;
    };
    redirectURL: string;
    headersSize: number;
    bodySize: number;
  };
  cache: Record<string, never>;
  timings: {
    blocked: number;
    dns: number;
    connect: number;
    send: number;
    wait: number;
    receive: number;
    ssl: number;
  };
}

export interface HarExport {
  log: {
    version: '1.2';
    creator: {
      name: 'Zerant Browser';
      version: string;
    };
    pages: Array<{
      startedDateTime: string;
      id: string;
      title: string;
      pageTimings: {
        onContentLoad: number;
        onLoad: number;
      };
    }>;
    entries: HarEntry[];
  };
}

// ─── Manager ───

/**
 * NetworkInspector — Logs and analyzes network traffic via RequestDispatcher.
 *
 * Runs in the main process (NOT in webview) — safe for anti-detection.
 * Stores last 1000 requests in memory, flushes per-domain data to ~/.zerant/network/.
 */
export class NetworkInspector {
  // === 1. Private state ===
  private requests: NetworkRequest[] = [];
  private pendingRequests: Map<string, Partial<NetworkRequest>> = new Map();
  private counter = 0;
  private maxRequests = 1000;
  private networkDir: string;
  private domainStats: Map<string, DomainData> = new Map();
  private tabIdResolver?: (wcId: number) => string | null;

  // === 2. Constructor ===
  constructor() {
    this.networkDir = zerantDir('network');
    if (!fs.existsSync(this.networkDir)) {
      fs.mkdirSync(this.networkDir, { recursive: true });
    }
  }

  // === 3. Dependency setters ===

  setTabIdResolver(resolver: (wcId: number) => string | null): void {
    this.tabIdResolver = resolver;
  }

  /** Register as a dispatcher consumer (late registration supported) */
  registerWith(dispatcher: RequestDispatcher): void {
    dispatcher.registerBeforeRequest({
      name: 'NetworkInspector',
      priority: 100,
      handler: (details) => {
        const domain = this.extractDomain(details.url);
        if (domain && !details.url.startsWith('file://') && !details.url.startsWith('devtools://')) {
          const id = ++this.counter;
          const wcId = this.getWebContentsId(details);
          const tabId = wcId !== undefined ? this.tabIdResolver?.(wcId) ?? undefined : undefined;
          this.pendingRequests.set(String(details.id ?? id), {
            id,
            url: details.url,
            method: details.method || 'GET',
            timestamp: Date.now(),
            domain,
            initiator: details.referrer || '',
            status: 0,
            contentType: '',
            size: 0,
            durationMs: 0,
            resourceType: this.getResourceType(details),
            tabId,
            wcId,
            requestHeaders: {},
            responseHeaders: {},
          });
        }
        return null;
      }
    });

    dispatcher.registerBeforeSendHeaders({
      name: 'NetworkInspector',
      priority: 100,
      handler: (details, headers) => {
        const pending = this.pendingRequests.get(String(details.id ?? ''));
        if (pending) {
          pending.requestHeaders = { ...headers };
        }
        return headers;
      }
    });

    dispatcher.registerHeadersReceived({
      name: 'NetworkInspector',
      priority: 100,
      handler: (details, responseHeaders) => {
        const pending = this.pendingRequests.get(String(details.id ?? ''));
        if (pending) {
          pending.responseHeaders = { ...responseHeaders };
        }
        return responseHeaders;
      }
    });

    dispatcher.registerCompleted({
      name: 'NetworkInspector',
      handler: (details) => {
        const key = String(details.id ?? '');
        const pending = this.pendingRequests.get(key);
        if (pending) {
          const contentType = details.responseHeaders?.['content-type']?.[0]
            || details.responseHeaders?.['Content-Type']?.[0]
            || '';

          const req: NetworkRequest = {
            id: pending.id!,
            url: pending.url!,
            method: pending.method!,
            status: details.statusCode,
            contentType,
            size: details.responseHeaders?.['content-length']
              ? parseInt(details.responseHeaders['content-length'][0], 10) || 0
              : 0,
            timestamp: pending.timestamp!,
            initiator: pending.initiator!,
            domain: pending.domain!,
            durationMs: Math.max(0, Date.now() - pending.timestamp!),
            resourceType: pending.resourceType,
            tabId: pending.tabId,
            wcId: pending.wcId,
            requestHeaders: pending.requestHeaders || {},
            responseHeaders: pending.responseHeaders || details.responseHeaders || {},
          };

          this.addRequest(req);
          this.pendingRequests.delete(key);
        }
      }
    });

    dispatcher.registerError({
      name: 'NetworkInspector',
      handler: (details) => {
        this.pendingRequests.delete(String(details.id ?? ''));
      }
    });
  }

  // === 4. Public methods ===

  /** Flush domain data to disk (call on navigation away) */
  flushDomain(domain: string): void {
    const data = this.domainStats.get(domain);
    if (!data) return;

    try {
      const filePath = path.join(this.networkDir, `${domain.replace(/[^a-zA-Z0-9.-]/g, '_')}.json`);
      let existing: DomainData = { domain, requests: 0, apis: [], lastSeen: 0 };

      if (fs.existsSync(filePath)) {
        try {
          existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch (e) { log.warn('Network domain file parse failed, starting fresh:', e instanceof Error ? e.message : String(e)); }
      }

      // Merge
      existing.requests += data.requests;
      existing.lastSeen = data.lastSeen;
      for (const api of data.apis) {
        if (!existing.apis.includes(api)) {
          existing.apis.push(api);
        }
      }

      fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));
    } catch (e) {
      log.warn('Network domain flush failed for', domain + ':', e instanceof Error ? e.message : String(e));
    }
  }

  /** Get recent requests, optionally filtered */
  getLog(opts: NetworkQueryOptions = {}): NetworkRequest[] {
    const filtered = this.filterRequests(opts);
    const limit = opts.limit ?? 100;
    return filtered.slice(-limit);
  }

  /** Get discovered API endpoints grouped by domain */
  getApis(opts: Omit<NetworkQueryOptions, 'limit'> = {}): Record<string, string[]> {
    const result = new Map<string, Set<string>>();
    for (const request of this.filterRequests(opts)) {
      if (!this.isApiEndpoint(request)) {
        continue;
      }
      const apiPath = this.extractApiPath(request.url);
      if (!apiPath) {
        continue;
      }
      if (!result.has(request.domain)) {
        result.set(request.domain, new Set());
      }
      result.get(request.domain)!.add(apiPath);
    }

    return Object.fromEntries(
      Array.from(result.entries()).map(([domain, apis]) => [domain, Array.from(apis)]),
    );
  }

  /** Get domain list with request counts */
  getDomains(opts: Omit<NetworkQueryOptions, 'limit'> = {}): Array<{ domain: string; requests: number; lastSeen: number; apiCount: number }> {
    const domains = new Map<string, DomainData>();

    for (const request of this.filterRequests(opts)) {
      let entry = domains.get(request.domain);
      if (!entry) {
        entry = {
          domain: request.domain,
          requests: 0,
          apis: [],
          lastSeen: 0,
        };
        domains.set(request.domain, entry);
      }
      entry.requests += 1;
      entry.lastSeen = Math.max(entry.lastSeen, request.timestamp);
      if (this.isApiEndpoint(request)) {
        const apiPath = this.extractApiPath(request.url);
        if (apiPath && !entry.apis.includes(apiPath)) {
          entry.apis.push(apiPath);
        }
      }
    }

    return Array.from(domains.values()).map(d => ({
      domain: d.domain,
      requests: d.requests,
      lastSeen: d.lastSeen,
      apiCount: d.apis.length,
    })).sort((a, b) => b.requests - a.requests);
  }

  /**
   * Export logged requests as a HAR 1.2 archive.
   */
  toHar(opts: NetworkQueryOptions = {}): HarExport {
    const entries = this.getLog(opts).map((request) => this.toHarEntry(request));
    const startedDateTime = entries[0]?.startedDateTime ?? new Date().toISOString();
    const scopeLabel = opts.tabId
      ? `tab ${opts.tabId}`
      : opts.wcId !== undefined
        ? `webContents ${opts.wcId}`
        : 'active tab';
    const title = opts.domain
      ? `Network log for ${opts.domain} (${scopeLabel})`
      : `Zerant network log (${scopeLabel})`;

    return {
      log: {
        version: '1.2',
        creator: {
          name: 'Zerant Browser',
          version: process.env.npm_package_version || '0.0.0',
        },
        pages: [{
          startedDateTime,
          id: 'page_1',
          title,
          pageTimings: {
            onContentLoad: -1,
            onLoad: -1,
          },
        }],
        entries,
      },
    };
  }

  /** Clear all logged data */
  clear(tabId?: string): void {
    if (tabId) {
      this.requests = this.requests.filter(request => request.tabId !== tabId);
      this.pendingRequests = new Map(
        Array.from(this.pendingRequests.entries()).filter(([, pending]) => pending.tabId !== tabId),
      );
      this.rebuildDomainStats();
      return;
    }
    this.requests = [];
    this.pendingRequests.clear();
    this.domainStats.clear();
  }

  // === 6. Cleanup ===

  /** Destroy — flush all domains */
  destroy(): void {
    for (const domain of this.domainStats.keys()) {
      this.flushDomain(domain);
    }
  }

  // === 7. Private helpers ===

  /** Add a completed request to the log */
  private addRequest(req: NetworkRequest): void {
    this.requests.push(req);
    if (this.requests.length > this.maxRequests) {
      this.requests = this.requests.slice(-this.maxRequests);
    }

    // Update domain stats
    let domainData = this.domainStats.get(req.domain);
    if (!domainData) {
      domainData = { domain: req.domain, requests: 0, apis: [], lastSeen: 0 };
      this.domainStats.set(req.domain, domainData);
    }
    domainData.requests++;
    domainData.lastSeen = req.timestamp;

    // Auto-discover API endpoints
    if (this.isApiEndpoint(req)) {
      const apiPath = this.extractApiPath(req.url);
      if (apiPath && !domainData.apis.includes(apiPath)) {
        domainData.apis.push(apiPath);
      }
    }
  }

  private filterRequests(opts: NetworkQueryOptions = {}): NetworkRequest[] {
    let filtered = this.requests;
    if (opts.tabId) {
      filtered = filtered.filter(request => request.tabId === opts.tabId);
    }
    if (opts.wcId !== undefined) {
      filtered = filtered.filter(request => request.wcId === opts.wcId);
    }
    if (opts.domain) {
      filtered = filtered.filter(request => request.domain === opts.domain);
    }
    if (opts.type) {
      const type = opts.type.toLowerCase();
      filtered = filtered.filter(request => request.resourceType?.toLowerCase() === type);
    }
    return filtered;
  }

  private rebuildDomainStats(): void {
    this.domainStats.clear();
    for (const request of this.requests) {
      let domainData = this.domainStats.get(request.domain);
      if (!domainData) {
        domainData = { domain: request.domain, requests: 0, apis: [], lastSeen: 0 };
        this.domainStats.set(request.domain, domainData);
      }
      domainData.requests += 1;
      domainData.lastSeen = request.timestamp;
      if (this.isApiEndpoint(request)) {
        const apiPath = this.extractApiPath(request.url);
        if (apiPath && !domainData.apis.includes(apiPath)) {
          domainData.apis.push(apiPath);
        }
      }
    }
  }

  /** Check if a request looks like an API call */
  private isApiEndpoint(req: NetworkRequest): boolean {
    const ct = req.contentType.toLowerCase();
    const url = req.url.toLowerCase();

    // JSON responses
    if (ct.includes('application/json')) return true;
    // Known API path patterns
    if (url.includes('/api/') || url.includes('/v1/') || url.includes('/v2/') || url.includes('/v3/')) return true;
    if (url.includes('/graphql')) return true;
    if (url.includes('/rest/')) return true;
    // XHR-like endpoints
    if (ct.includes('application/xml') && !url.endsWith('.xml')) return true;

    return false;
  }

  /** Extract a normalized API path from a URL */
  private extractApiPath(url: string): string {
    try {
      const parsed = new URL(url);
      // Remove query params, normalize
      let p = parsed.pathname;
      // Replace UUIDs and numeric IDs with placeholders
      p = p.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/{uuid}');
      p = p.replace(/\/\d+/g, '/{id}');
      return p;
    } catch {
      return '';
    }
  }

  /** Extract domain from URL */
  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }

  private getWebContentsId(details: { webContentsId?: number }): number | undefined {
    return typeof details.webContentsId === 'number' ? details.webContentsId : undefined;
  }

  private getResourceType(details: { resourceType?: string }): string | undefined {
    return typeof details.resourceType === 'string' ? details.resourceType : undefined;
  }

  private toHarEntry(request: NetworkRequest): HarEntry {
    const parsedUrl = new URL(request.url);
    const queryString = Array.from(parsedUrl.searchParams.entries()).map(([name, value]) => ({ name, value }));

    return {
      startedDateTime: new Date(request.timestamp).toISOString(),
      time: request.durationMs,
      request: {
        method: request.method,
        url: request.url,
        httpVersion: 'HTTP/1.1',
        cookies: [],
        headers: this.flattenRequestHeaders(request.requestHeaders),
        queryString,
        headersSize: -1,
        bodySize: -1,
      },
      response: {
        status: request.status,
        statusText: STATUS_CODES[request.status] || '',
        httpVersion: 'HTTP/1.1',
        cookies: [],
        headers: this.flattenResponseHeaders(request.responseHeaders),
        content: {
          size: request.size,
          mimeType: request.contentType || 'application/octet-stream',
        },
        redirectURL: '',
        headersSize: -1,
        bodySize: request.size || -1,
      },
      cache: {},
      timings: {
        blocked: 0,
        dns: -1,
        connect: -1,
        send: 0,
        wait: request.durationMs,
        receive: 0,
        ssl: -1,
      },
    };
  }

  private flattenRequestHeaders(headers: Record<string, string>): HarHeader[] {
    return Object.entries(headers).map(([name, value]) => ({ name, value }));
  }

  private flattenResponseHeaders(headers: Record<string, string[]>): HarHeader[] {
    return Object.entries(headers).flatMap(([name, values]) =>
      values.map((value) => ({ name, value }))
    );
  }
}
