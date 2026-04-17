import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WebContents } from 'electron';

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs') as Record<string, unknown>;
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn().mockReturnValue(true),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      readFileSync: vi.fn().mockReturnValue('{}'),
      readdirSync: vi.fn().mockReturnValue([]),
    },
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue('{}'),
    readdirSync: vi.fn().mockReturnValue([]),
  };
});

vi.mock('../../utils/paths', () => ({
  zerantDir: vi.fn((...args: string[]) => '/tmp/zerant-test/' + args.join('/')),
}));

vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../utils/security', () => ({
  resolvePathWithinRoot: vi.fn((root: string, file: string) => root + '/' + file),
  tryParseUrl: (url: string) => { try { return new URL(url); } catch { return null; } },
  urlHasProtocol: (url: URL, ...protocols: string[]) => protocols.some(p => url.protocol === p),
}));

import fs from 'fs';
import { SiteMemoryManager } from '../site-memory';

function createMockWc(pageData = {
  title: 'Test Page',
  description: 'A test description',
  headings: ['Heading 1', 'Heading 2'],
  formsCount: 1,
  linksCount: 10,
  textPreview: 'This is the text preview of the page',
}) {
  return {
    executeJavaScript: vi.fn().mockResolvedValue(pageData),
  } as unknown as WebContents;
}

describe('SiteMemoryManager', () => {
  let smm: SiteMemoryManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    smm = new SiteMemoryManager();
  });

  describe('constructor', () => {
    it('creates memory directory if missing', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      new SiteMemoryManager();
      expect(fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    });
  });

  describe('recordVisit()', () => {
    it('records visit and returns SiteVisit', async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        if (String(p).endsWith('.json')) return false; // site file doesn't exist
        return true;
      });

      const wc = createMockWc();
      const visit = await smm.recordVisit(wc, 'https://example.com/page');
      expect(visit).not.toBeNull();
      expect(visit!.title).toBe('Test Page');
      expect(visit!.url).toBe('https://example.com/page');
      expect(visit!.headings).toEqual(['Heading 1', 'Heading 2']);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('returns null for non-http URLs', async () => {
      const wc = createMockWc();
      const visit = await smm.recordVisit(wc, 'file:///tmp/test.html');
      expect(visit).toBeNull();
    });

    it('returns null for invalid URLs', async () => {
      const wc = createMockWc();
      const visit = await smm.recordVisit(wc, 'not-a-url');
      expect(visit).toBeNull();
    });

    it('computes diff when previous visit exists', async () => {
      const existingSite = {
        domain: 'example.com',
        firstVisit: 1000,
        lastVisit: 2000,
        visitCount: 1,
        totalTimeMs: 0,
        visits: [{
          url: 'https://example.com/',
          title: 'Old Title',
          description: 'Old desc',
          headings: ['Old Heading'],
          formsCount: 0,
          linksCount: 5,
          textPreview: 'old text',
          timestamp: 2000,
        }],
        diffs: [],
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existingSite));

      const wc = createMockWc({
        title: 'New Title',
        description: 'New desc',
        headings: ['New Heading'],
        formsCount: 2,
        linksCount: 15,
        textPreview: 'new text',
      });

      const visit = await smm.recordVisit(wc, 'https://example.com/');
      expect(visit).not.toBeNull();

      // Verify the saved data includes a diff
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const saved = JSON.parse(writeCall[1] as string);
      expect(saved.diffs.length).toBe(1);
      expect(saved.diffs[0].changes.titleChanged).toBe(true);
      expect(saved.diffs[0].changes.descriptionChanged).toBe(true);
      expect(saved.diffs[0].changes.newHeadings).toEqual(['New Heading']);
      expect(saved.diffs[0].changes.removedHeadings).toEqual(['Old Heading']);
    });

    it('does not create diff when nothing changed', async () => {
      const pageData = {
        title: 'Same',
        description: 'Same desc',
        headings: ['H1'],
        formsCount: 1,
        linksCount: 5,
        textPreview: 'same text',
      };
      const existingSite = {
        domain: 'example.com',
        firstVisit: 1000, lastVisit: 2000, visitCount: 1, totalTimeMs: 0,
        visits: [{ url: 'https://example.com/', ...pageData, timestamp: 2000 }],
        diffs: [],
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existingSite));

      const wc = createMockWc(pageData);
      await smm.recordVisit(wc, 'https://example.com/');

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const saved = JSON.parse(writeCall[1] as string);
      expect(saved.diffs.length).toBe(0);
    });

    it('handles executeJavaScript errors gracefully', async () => {
      const wc = { executeJavaScript: vi.fn().mockRejectedValue(new Error('JS error')) } as unknown as WebContents;
      const visit = await smm.recordVisit(wc, 'https://error.com/');
      expect(visit).toBeNull();
    });
  });

  describe('trackVisitStart() / trackVisitEnd()', () => {
    it('tracks time spent on a domain', () => {
      const existingSite = {
        domain: 'example.com', firstVisit: 1000, lastVisit: 2000, visitCount: 1, totalTimeMs: 0, visits: [], diffs: [],
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existingSite));

      smm.trackVisitStart('https://example.com/');
      // Small delay to simulate time passing, then end
      smm.trackVisitEnd('https://example.com/');

      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('does nothing on visitEnd if no matching start', () => {
      smm.trackVisitEnd('https://never-started.com/');
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('listSites()', () => {
    it('returns empty array when no sites exist', () => {
      vi.mocked(fs.readdirSync).mockReturnValue([]);
      expect(smm.listSites()).toEqual([]);
    });

    it('returns domain summaries from disk', () => {
      const siteData = { domain: 'example.com', lastVisit: 3000, visitCount: 5 };
      vi.mocked(fs.readdirSync).mockReturnValue(['example.com.json' as unknown as fs.Dirent]);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(siteData));

      const sites = smm.listSites();
      expect(sites).toHaveLength(1);
      expect(sites[0].domain).toBe('example.com');
      expect(sites[0].visitCount).toBe(5);
    });

    it('skips corrupt files', () => {
      vi.mocked(fs.readdirSync).mockReturnValue(['bad.json' as unknown as fs.Dirent]);
      vi.mocked(fs.readFileSync).mockReturnValue('not json');

      const sites = smm.listSites();
      expect(sites).toEqual([]);
    });
  });

  describe('getSite()', () => {
    it('returns null for unknown domain', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(smm.getSite('unknown.com')).toBeNull();
    });

    it('returns full site data', () => {
      const siteData = {
        domain: 'known.com', firstVisit: 1000, lastVisit: 2000,
        visitCount: 3, totalTimeMs: 60000, visits: [], diffs: [],
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(siteData));

      const site = smm.getSite('known.com');
      expect(site!.domain).toBe('known.com');
      expect(site!.visitCount).toBe(3);
    });
  });

  describe('getDiffs()', () => {
    it('returns empty array for unknown domain', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(smm.getDiffs('unknown.com')).toEqual([]);
    });
  });

  describe('search()', () => {
    it('searches across all sites and returns matches with snippets', () => {
      const siteData = {
        domain: 'example.com', firstVisit: 1000, lastVisit: 2000, visitCount: 1, totalTimeMs: 0,
        visits: [{
          url: 'https://example.com/',
          title: 'Test Page',
          description: 'contains the keyword searchterm here',
          headings: [],
          formsCount: 0,
          linksCount: 0,
          textPreview: '',
          timestamp: 2000,
        }],
        diffs: [],
      };
      vi.mocked(fs.readdirSync).mockReturnValue(['example.com.json' as unknown as fs.Dirent]);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(siteData));

      const results = smm.search('searchterm');
      expect(results).toHaveLength(1);
      expect(results[0].domain).toBe('example.com');
      expect(results[0].snippet).toContain('searchterm');
    });

    it('returns empty array when no matches', () => {
      vi.mocked(fs.readdirSync).mockReturnValue([]);
      expect(smm.search('nothing')).toEqual([]);
    });
  });

  describe('getAverageTime()', () => {
    it('returns 0 for unknown domain', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(smm.getAverageTime('unknown.com')).toBe(0);
    });

    it('calculates average time per visit', () => {
      const siteData = {
        domain: 'timed.com', firstVisit: 1000, lastVisit: 2000,
        visitCount: 4, totalTimeMs: 20000, visits: [], diffs: [],
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(siteData));

      expect(smm.getAverageTime('timed.com')).toBe(5000);
    });
  });
});
