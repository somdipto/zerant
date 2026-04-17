import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockedPaths = vi.hoisted(() => ({ root: '' }));

vi.mock('../../utils/paths', () => ({
  zerantDir: (...segments: string[]) => path.join(mockedPaths.root, ...segments),
}));

import { BlocklistUpdater, BLOCKLIST_SOURCES, parseBlocklistContent } from '../blocklists/updater';
import { BLOCKLIST_REFRESH_INTERVALS_MS, type BlocklistSourceDefinition, type BlocklistSourceFreshness } from '../types';

interface StoredSourceFreshness {
  lastUpdated: string | null;
  lastAttempted: string | null;
  lastError: string | null;
  consecutiveFailures: number;
}

function createDbStub() {
  const blocklistEntries = new Map<string, { source: string; category: string }>();
  const freshnessBySource = new Map<string, StoredSourceFreshness>();
  const metadata = new Map<string, string>();

  const readFreshness = (sourceName: string): StoredSourceFreshness => freshnessBySource.get(sourceName) ?? {
    lastUpdated: null,
    lastAttempted: null,
    lastError: null,
    consecutiveFailures: 0,
  };

  const api = {
    syncBlocklistSource: vi.fn((sourceName: string, domains: string[], category: string) => {
      for (const [domain, entry] of blocklistEntries.entries()) {
        if (entry.source === sourceName) {
          blocklistEntries.delete(domain);
        }
      }

      for (const domain of domains) {
        blocklistEntries.set(domain, { source: sourceName, category });
      }

      return domains.length;
    }),
    setBlocklistMeta: vi.fn((key: string, value: string) => {
      metadata.set(key, value);
    }),
    getBlocklistSourceFreshness: vi.fn((source: BlocklistSourceDefinition, now = Date.now()): BlocklistSourceFreshness => {
      const stored = readFreshness(source.name);
      const refreshIntervalMs = BLOCKLIST_REFRESH_INTERVALS_MS[source.refreshTier];
      const lastUpdatedMs = stored.lastUpdated ? Date.parse(stored.lastUpdated) : Number.NaN;
      const hasValidLastUpdated = Number.isFinite(lastUpdatedMs);

      return {
        name: source.name,
        category: source.category,
        refreshTier: source.refreshTier,
        refreshIntervalMs,
        lastUpdated: stored.lastUpdated,
        lastAttempted: stored.lastAttempted,
        lastError: stored.lastError,
        consecutiveFailures: stored.consecutiveFailures,
        nextDueAt: hasValidLastUpdated ? new Date(lastUpdatedMs + refreshIntervalMs).toISOString() : null,
        due: !hasValidLastUpdated || now >= (lastUpdatedMs + refreshIntervalMs),
      };
    }),
    getBlocklistSourceFreshnessSnapshot: vi.fn((sources: BlocklistSourceDefinition[], now = Date.now()) =>
      sources.map((source) => api.getBlocklistSourceFreshness(source, now)),
    ),
    setBlocklistSourceFreshness: vi.fn((sourceName: string, freshness: Partial<StoredSourceFreshness>) => {
      const existing = readFreshness(sourceName);
      freshnessBySource.set(sourceName, {
        ...existing,
        ...freshness,
        consecutiveFailures: freshness.consecutiveFailures ?? existing.consecutiveFailures,
      });
    }),
    isDomainBlocked: (domain: string) => {
      const entry = blocklistEntries.get(domain);
      return entry
        ? { blocked: true, source: entry.source, category: entry.category }
        : { blocked: false };
    },
    getMetadataValue: (key: string) => metadata.get(key) ?? null,
  };

  return api;
}

let db = createDbStub();

function getSource(name: string): BlocklistSourceDefinition {
  const source = BLOCKLIST_SOURCES.find((candidate) => candidate.name === name);
  if (!source) {
    throw new Error(`Unknown blocklist source in test: ${name}`);
  }
  return source;
}

describe('BlocklistUpdater tiered refresh', () => {
  afterEach(() => {
    if (mockedPaths.root && fs.existsSync(mockedPaths.root)) {
      fs.rmSync(mockedPaths.root, { recursive: true, force: true });
    }
    mockedPaths.root = '';
    db = createDbStub();
    vi.restoreAllMocks();
  });

  it('updates only due sources and records failures per source', async () => {
    mockedPaths.root = fs.mkdtempSync(path.join(os.tmpdir(), 'zerant-updater-'));

    const shield = { reload: vi.fn() };
    const updater = new BlocklistUpdater(db as never, shield as never);
    const now = Date.parse('2026-03-07T12:00:00.000Z');
    const urlhausSource = getSource('urlhaus');
    const phishingSource = getSource('phishing');
    const openPhishSource = getSource('openphish');
    const threatfoxDomainsSource = getSource('threatfox-domains');
    const threatfoxUrlsSource = getSource('threatfox-urls');
    const stevenblackSource = getSource('stevenblack');

    db.setBlocklistSourceFreshness(phishingSource.name, {
      lastUpdated: new Date(now - 60_000).toISOString(),
    });
    db.setBlocklistSourceFreshness(openPhishSource.name, {
      lastUpdated: new Date(now - 60_000).toISOString(),
    });
    db.setBlocklistSourceFreshness(threatfoxDomainsSource.name, {
      lastUpdated: new Date(now - 60_000).toISOString(),
    });
    db.setBlocklistSourceFreshness(threatfoxUrlsSource.name, {
      lastUpdated: new Date(now - 60_000).toISOString(),
    });
    db.setBlocklistSourceFreshness(stevenblackSource.name, {
      lastUpdated: new Date(now - (8 * 24 * 60 * 60 * 1000)).toISOString(),
    });

    vi.spyOn(updater as any, 'download').mockImplementation(async (url: string) => {
      if (url === urlhausSource.url) {
        return 'http://malware.example/path\n';
      }
      if (url === stevenblackSource.url) {
        throw new Error('weekly feed down');
      }
      throw new Error(`unexpected download: ${url}`);
    });

    const result = await updater.updateDueSources(now);

    expect(result.sources).toEqual([
      {
        name: 'urlhaus',
        refreshTier: 'hourly',
        domains: 1,
        added: 1,
        success: true,
        error: null,
      },
      {
        name: stevenblackSource.name,
        refreshTier: 'weekly',
        domains: 0,
        added: 0,
        success: false,
        error: 'weekly feed down',
      },
    ]);
    expect(result.errors).toEqual([`${stevenblackSource.name}: weekly feed down`]);
    expect(shield.reload).toHaveBeenCalledTimes(1);

    expect(db.isDomainBlocked('malware.example')).toEqual({
      blocked: true,
      source: urlhausSource.name,
      category: 'malware',
    });

    const hourlyStatus = db.getBlocklistSourceFreshness(urlhausSource, now);
    expect(hourlyStatus.lastUpdated).not.toBeNull();
    expect(hourlyStatus.lastError).toBeNull();
    expect(hourlyStatus.consecutiveFailures).toBe(0);

    const weeklyStatus = db.getBlocklistSourceFreshness(stevenblackSource, now);
    expect(weeklyStatus.lastUpdated).toBe(new Date(now - (8 * 24 * 60 * 60 * 1000)).toISOString());
    expect(weeklyStatus.lastError).toBe('weekly feed down');
    expect(weeklyStatus.consecutiveFailures).toBe(1);

    const dailyStatus = db.getBlocklistSourceFreshness(phishingSource, now);
    expect(dailyStatus.lastAttempted).toBeNull();
    expect(db.getMetadataValue('lastUpdated')).not.toBeNull();
  });

  it('reports source freshness based on the configured tier cadence', () => {
    mockedPaths.root = fs.mkdtempSync(path.join(os.tmpdir(), 'zerant-updater-'));

    const shield = { reload: vi.fn() };
    const updater = new BlocklistUpdater(db as never, shield as never);
    const now = Date.parse('2026-03-07T12:00:00.000Z');
    const urlhausSource = getSource('urlhaus');
    const phishingSource = getSource('phishing');
    const openPhishSource = getSource('openphish');
    const threatfoxDomainsSource = getSource('threatfox-domains');
    const threatfoxUrlsSource = getSource('threatfox-urls');
    const stevenblackSource = getSource('stevenblack');

    db.setBlocklistSourceFreshness(urlhausSource.name, {
      lastUpdated: new Date(now - (30 * 60 * 1000)).toISOString(),
    });
    db.setBlocklistSourceFreshness(phishingSource.name, {
      lastUpdated: new Date(now - (2 * 24 * 60 * 60 * 1000)).toISOString(),
    });
    db.setBlocklistSourceFreshness(openPhishSource.name, {
      lastUpdated: new Date(now - (6 * 60 * 60 * 1000)).toISOString(),
    });
    db.setBlocklistSourceFreshness(threatfoxDomainsSource.name, {
      lastUpdated: new Date(now - (2 * 60 * 60 * 1000)).toISOString(),
    });
    db.setBlocklistSourceFreshness(threatfoxUrlsSource.name, {
      lastUpdated: new Date(now - (30 * 60 * 1000)).toISOString(),
    });

    const statuses = updater.getSourceStatuses(now);
    expect(statuses.map((status) => ({
      name: status.name,
      refreshTier: status.refreshTier,
      due: status.due,
    }))).toEqual([
      { name: urlhausSource.name, refreshTier: 'hourly', due: false },
      { name: phishingSource.name, refreshTier: 'daily', due: true },
      { name: openPhishSource.name, refreshTier: 'daily', due: false },
      { name: threatfoxDomainsSource.name, refreshTier: 'hourly', due: true },
      { name: threatfoxUrlsSource.name, refreshTier: 'hourly', due: false },
      { name: stevenblackSource.name, refreshTier: 'weekly', due: true },
    ]);
  });

  it('filters ThreatFox CSV feeds down to high-confidence domain and URL IOCs', () => {
    const feed = [
      '################################################################',
      '# ThreatFox IOCs: recent additions - CSV format                #',
      '################################################################',
      '# "first_seen_utc","ioc_id","ioc_value","ioc_type","threat_type","fk_malware","malware_alias","malware_printable","last_seen_utc","confidence_level","is_compromised","reference","tags","anonymous","reporter"',
      '"2026-03-07 13:29:53", "1760922", "fernsecur.windfield.in.net", "domain", "payload_delivery", "js.clearfake", "None", "ClearFake", "2026-03-07 13:30:20", "100", "False", "None", "ClearFake", "0", "threatcat_ch"',
      '"2026-03-07 13:29:12", "1760921", "https://evil.example/payload", "url", "payload_delivery", "win.strelastealer", "None", "StrelaStealer", "", "90", "True", "None", "StrelaStealer", "0", "threatcat_ch"',
      '"2026-03-07 13:19:55", "1760920", "low-confidence.example", "domain", "payload_delivery", "js.clearfake", "None", "ClearFake", "2026-03-07 13:20:17", "50", "False", "None", "ClearFake", "0", "threatcat_ch"',
    ].join('\n');

    const domains = parseBlocklistContent(getSource('threatfox-domains'), feed);
    const urls = parseBlocklistContent(getSource('threatfox-urls'), feed);

    expect(domains.domains).toEqual(['fernsecur.windfield.in.net']);
    expect(urls.domains).toEqual(['evil.example']);
  });
});
