import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing NetworkShield
vi.mock('fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    promises: {
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
      rename: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

vi.mock('../../utils/paths', () => ({
  zerantDir: (...parts: string[]) => `/tmp/zerant-test/${parts.join('/')}`,
}));

vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../blocklists/updater', () => ({
  BLOCKLIST_SOURCES: [],
  parseBlocklistFile: vi.fn(),
}));

import { NetworkShield } from '../network-shield';

function createMockDb() {
  return {
    isDomainBlocked: vi.fn().mockReturnValue({ blocked: false }),
    getBlocklistStats: vi.fn().mockReturnValue({ total: 0 }),
    setBlocklistMeta: vi.fn(),
  } as unknown as Parameters<typeof NetworkShield extends new (db: infer T) => unknown ? never : never>[0];
}

describe('NetworkShield', () => {
  let shield: NetworkShield;
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
    shield = new NetworkShield(db as never);
  });

  describe('checkDomain', () => {
    it('returns not blocked for unknown domain', () => {
      const result = shield.checkDomain('example.com');
      expect(result.blocked).toBe(false);
    });

    it('blocks exact match in blocklist', () => {
      // Inject a blocked domain via the internal set
      const mutable = shield as unknown as { blockedDomains: Set<string> };
      mutable.blockedDomains.add('malware.com');

      const result = shield.checkDomain('malware.com');
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('Domain in blocklist');
    });

    it('blocks subdomain when parent is in blocklist', () => {
      const mutable = shield as unknown as { blockedDomains: Set<string> };
      mutable.blockedDomains.add('malware.com');

      const result = shield.checkDomain('sub.malware.com');
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('Parent domain');
    });

    it('does NOT block parent when only subdomain is in blocklist', () => {
      const mutable = shield as unknown as { blockedDomains: Set<string> };
      mutable.blockedDomains.add('tracker.example.com');

      const result = shield.checkDomain('example.com');
      expect(result.blocked).toBe(false);
    });

    it('is case-insensitive', () => {
      const mutable = shield as unknown as { blockedDomains: Set<string> };
      mutable.blockedDomains.add('malware.com');

      expect(shield.checkDomain('MALWARE.COM').blocked).toBe(true);
      expect(shield.checkDomain('Malware.Com').blocked).toBe(true);
    });

    it('falls back to DB lookup when not in memory blocklist', () => {
      (db.isDomainBlocked as ReturnType<typeof vi.fn>).mockReturnValue({ blocked: true, source: 'manual' });

      const result = shield.checkDomain('db-blocked.com');
      expect(result.blocked).toBe(true);
      expect(result.source).toBe('manual');
    });

    it('allows domains on the DOMAIN_ALLOWLIST (e.g. linkedin.com)', () => {
      const mutable = shield as unknown as { blockedDomains: Set<string> };
      // Even if linkedin.com is in the blocklist, it should be allowed
      mutable.blockedDomains.add('linkedin.com');

      expect(shield.checkDomain('linkedin.com').blocked).toBe(false);
      expect(shield.checkDomain('www.linkedin.com').blocked).toBe(false);
    });

    it('blocks deep subdomains when root is in blocklist', () => {
      const mutable = shield as unknown as { blockedDomains: Set<string> };
      mutable.blockedDomains.add('evil.com');

      expect(shield.checkDomain('a.b.c.evil.com').blocked).toBe(true);
    });

    it('does not block unrelated TLD', () => {
      const mutable = shield as unknown as { blockedDomains: Set<string> };
      mutable.blockedDomains.add('evil.com');

      expect(shield.checkDomain('evil.org').blocked).toBe(false);
    });
  });

  describe('checkUrl', () => {
    it('blocks URL with blocked IP origin', () => {
      const mutable = shield as unknown as { blockedIpOrigins: Set<string> };
      mutable.blockedIpOrigins.add('192.168.1.100:8080');

      const result = shield.checkUrl('http://192.168.1.100:8080/malware.exe');
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain('IP origin');
    });

    it('falls through to checkDomain for non-IP URLs', () => {
      const mutable = shield as unknown as { blockedDomains: Set<string> };
      mutable.blockedDomains.add('malware.com');

      const result = shield.checkUrl('https://malware.com/payload');
      expect(result.blocked).toBe(true);
    });

    it('returns not blocked for invalid URL', () => {
      const result = shield.checkUrl('not-a-url');
      expect(result.blocked).toBe(false);
    });

    it('returns not blocked for empty URL', () => {
      const result = shield.checkUrl('');
      expect(result.blocked).toBe(false);
    });
  });

  describe('getStats', () => {
    it('returns memory and DB entry counts', () => {
      const mutable = shield as unknown as { blockedDomains: Set<string> };
      mutable.blockedDomains.add('a.com');
      mutable.blockedDomains.add('b.com');
      (db.getBlocklistStats as ReturnType<typeof vi.fn>).mockReturnValue({ total: 5 });

      const stats = shield.getStats();
      expect(stats.memoryEntries).toBe(2);
      expect(stats.dbEntries).toBe(5);
    });
  });
});
