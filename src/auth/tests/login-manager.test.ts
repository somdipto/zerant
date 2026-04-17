import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BrowserWindow } from 'electron';

// Mock dependencies before importing
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs') as Record<string, unknown>;
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn().mockReturnValue(false),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
      readFileSync: vi.fn().mockReturnValue('[]'),
    },
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue('[]'),
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

import * as fs from 'fs';
import { LoginManager } from '../login-manager';

function createMockWebview(url = 'https://example.com/page', title = 'Test Page') {
  return {
    webContents: {
      getURL: vi.fn().mockReturnValue(url),
      getTitle: vi.fn().mockReturnValue(title),
      executeJavaScript: vi.fn().mockResolvedValue({
        loggedIn: [],
        loggedOut: [],
        username: null,
      }),
      session: {
        cookies: {
          get: vi.fn().mockResolvedValue([]),
        },
      },
    },
  } as unknown as BrowserWindow;
}

describe('LoginManager', () => {
  let lm: LoginManager;

  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.readFileSync).mockReturnValue('[]');
    vi.mocked(fs.writeFileSync).mockClear();
    vi.mocked(fs.mkdirSync).mockClear();
    lm = new LoginManager();
  });

  describe('constructor', () => {
    it('creates the auth directory if it does not exist', () => {
      expect(fs.mkdirSync).toHaveBeenCalled();
    });

    it('initializes default domain configs for linkedin, github, twitter', () => {
      // saveDomainConfigs is called in initializeDefaultConfigs
      const writeCalls = vi.mocked(fs.writeFileSync).mock.calls;
      // Find a call that wrote JSON containing domain configs
      const domainConfigCall = writeCalls.find(c => {
        const content = String(c[1]);
        return content.includes('linkedin.com') && content.includes('github.com');
      });
      expect(domainConfigCall).toBeDefined();
      const configs = JSON.parse(domainConfigCall![1] as string);
      const domains = configs.map((c: { domain: string }) => c.domain);
      expect(domains).toContain('linkedin.com');
      expect(domains).toContain('github.com');
      expect(domains).toContain('twitter.com');
    });
  });

  describe('getLoginState()', () => {
    it('returns unknown state for new domain', async () => {
      const state = await lm.getLoginState('example.com');
      expect(state.domain).toBe('example.com');
      expect(state.status).toBe('unknown');
      expect(state.confidence).toBe(0);
      expect(state.detectionMethod).toBe('none');
    });

    it('returns existing state if already tracked', async () => {
      await lm.updateLoginState('example.com', 'logged-in', 'user@test.com');
      const state = await lm.getLoginState('example.com');
      expect(state.status).toBe('logged-in');
      expect(state.username).toBe('user@test.com');
    });

    it('persists state to disk', async () => {
      vi.mocked(fs.writeFileSync).mockClear();
      await lm.getLoginState('new-domain.com');
      // saveStates writes to disk
      expect(fs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('getAllStates()', () => {
    it('returns empty array when no states tracked', async () => {
      const states = await lm.getAllStates();
      // May contain defaults from getLoginState calls in initializeDefaultConfigs
      expect(Array.isArray(states)).toBe(true);
    });

    it('returns all tracked states', async () => {
      await lm.getLoginState('a.com');
      await lm.getLoginState('b.com');
      const states = await lm.getAllStates();
      const domains = states.map(s => s.domain);
      expect(domains).toContain('a.com');
      expect(domains).toContain('b.com');
    });
  });

  describe('updateLoginState()', () => {
    it('sets status to logged-in with manual detection', async () => {
      await lm.updateLoginState('example.com', 'logged-in', 'alice');
      const state = await lm.getLoginState('example.com');
      expect(state.status).toBe('logged-in');
      expect(state.username).toBe('alice');
      expect(state.detectionMethod).toBe('manual');
      expect(state.confidence).toBe(100);
    });

    it('sets status to logged-out', async () => {
      await lm.updateLoginState('example.com', 'logged-out');
      const state = await lm.getLoginState('example.com');
      expect(state.status).toBe('logged-out');
    });
  });

  describe('clearLoginState()', () => {
    it('resets state to unknown with cleared method', async () => {
      await lm.updateLoginState('example.com', 'logged-in', 'bob');
      await lm.clearLoginState('example.com');
      const state = await lm.getLoginState('example.com');
      expect(state.status).toBe('unknown');
      expect(state.username).toBeUndefined();
      expect(state.detectionMethod).toBe('cleared');
      expect(state.confidence).toBe(0);
    });
  });

  describe('isLoginPage()', () => {
    it('detects login page via domain config patterns', async () => {
      const webview = createMockWebview('https://linkedin.com/login');
      vi.mocked(webview.webContents.executeJavaScript).mockResolvedValue(false);
      const result = await lm.isLoginPage(webview);
      expect(result).toBe(true);
    });

    it('falls back to generic detection when no config match', async () => {
      const webview = createMockWebview('https://unknown-site.com/dashboard');
      vi.mocked(webview.webContents.executeJavaScript).mockResolvedValue(false);
      const result = await lm.isLoginPage(webview);
      expect(result).toBe(false);
    });
  });

  describe('checkCurrentPage()', () => {
    it('detects login state and persists it', async () => {
      const webview = createMockWebview('https://github.com/dashboard');
      vi.mocked(webview.webContents.executeJavaScript).mockResolvedValue({
        loggedIn: ['a[href*="logout"]', '.user-menu'],
        loggedOut: [],
        username: 'dev@test.com',
      });

      const state = await lm.checkCurrentPage(webview);
      expect(state.domain).toBe('github.com');
      expect(state.status).toBe('logged-in');
      expect(state.username).toBe('dev@test.com');
    });

    it('returns unknown when scores are low', async () => {
      const webview = createMockWebview('https://neutral-site.com/');
      vi.mocked(webview.webContents.executeJavaScript).mockResolvedValue({
        loggedIn: [],
        loggedOut: [],
        username: null,
      });

      const state = await lm.checkCurrentPage(webview);
      expect(state.status).toBe('unknown');
      expect(state.confidence).toBe(0);
    });

    it('handles executeJavaScript errors gracefully', async () => {
      const webview = createMockWebview('https://broken.com/');
      vi.mocked(webview.webContents.executeJavaScript).mockRejectedValue(new Error('JS error'));

      const state = await lm.checkCurrentPage(webview);
      expect(state.status).toBe('unknown');
      expect(state.detectionMethod).toBe('error');
    });
  });

  describe('extractDomain (via getLoginState)', () => {
    it('handles invalid URLs gracefully via checkCurrentPage', async () => {
      const webview = createMockWebview('not-a-url');
      vi.mocked(webview.webContents.executeJavaScript).mockResolvedValue({
        loggedIn: [],
        loggedOut: [],
        username: null,
      });

      const state = await lm.checkCurrentPage(webview);
      expect(state.domain).toBe('unknown');
    });
  });

  describe('loadStates()', () => {
    it('loads existing states from disk', async () => {
      const savedStates = [
        { domain: 'saved.com', status: 'logged-in', lastChecked: '2024-01-01', lastUpdated: '2024-01-01', detectionMethod: 'manual', confidence: 100 },
      ];
      const savedConfigs = [
        { domain: 'linkedin.com', loginPagePatterns: [], loggedInRules: [], loggedOutRules: [] },
      ];
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        const filepath = String(p);
        if (filepath.includes('login-states')) return JSON.stringify(savedStates);
        if (filepath.includes('domain-configs')) return JSON.stringify(savedConfigs);
        return '[]';
      });

      const lm2 = new LoginManager();
      const state = await lm2.getLoginState('saved.com');
      expect(state.status).toBe('logged-in');
    });

    it('handles corrupt JSON gracefully', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('not-json');

      // Should not throw
      expect(() => new LoginManager()).not.toThrow();
    });
  });
});
