import * as fs from 'fs';
import { zerantDir, ensureDir } from '../utils/paths';
import { createLogger } from '../utils/logger';
import type { SyncManager } from '../sync/manager';

const log = createLogger('SessionRestore');

export interface SavedTab {
  id: string;
  url: string;
  title: string;
  groupId: string | null;
  pinned: boolean;
  workspaceId?: string | null;
}

export interface SavedSession {
  savedAt: number;
  activeTabId: string | null;
  tabs: SavedTab[];
}

/** URLs to skip when saving session state */
const SKIP_URL_PATTERNS = [
  'about:blank',
  'about:newtab',
  'chrome://',
  'devtools://',
];

function shouldSkipUrl(url: string): boolean {
  if (!url) return true;
  for (const pattern of SKIP_URL_PATTERNS) {
    if (url.startsWith(pattern)) return true;
  }
  if (url.startsWith('file://') && url.includes('newtab.html')) return true;
  return false;
}

export class SessionRestoreManager {
  private sessionPath: string;
  private syncManager: SyncManager | null;

  constructor(syncManager?: SyncManager | null) {
    this.sessionPath = zerantDir('session.json');
    this.syncManager = syncManager ?? null;
  }

  /** Save current tab state to disk (synchronous for crash safety) */
  save(tabs: SavedTab[], activeTabId: string | null): void {
    const filteredTabs = tabs.filter(t => !shouldSkipUrl(t.url));
    if (filteredTabs.length === 0) return;

    const data: SavedSession = {
      savedAt: Date.now(),
      activeTabId,
      tabs: filteredTabs,
    };

    ensureDir(zerantDir());

    const tmpPath = this.sessionPath + '.tmp';
    try {
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
      fs.renameSync(tmpPath, this.sessionPath);
    } catch (e) {
      log.warn('Failed to save session:', e instanceof Error ? e.message : String(e));
      try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    }

    // Also sync to shared folder if available
    if (this.syncManager?.isConfigured()) {
      this.syncManager.writeShared('session.json', data);
    }
  }

  /** Load saved session from disk */
  load(): SavedSession | null {
    if (!fs.existsSync(this.sessionPath)) return null;
    try {
      const raw = fs.readFileSync(this.sessionPath, 'utf-8');
      const data = JSON.parse(raw) as SavedSession;
      if (!data.tabs || !Array.isArray(data.tabs) || data.tabs.length === 0) return null;
      return data;
    } catch (e) {
      log.warn('Failed to load session:', e instanceof Error ? e.message : String(e));
      return null;
    }
  }

  /** Delete session file */
  clear(): void {
    try {
      if (fs.existsSync(this.sessionPath)) {
        fs.unlinkSync(this.sessionPath);
      }
    } catch (e) {
      log.warn('Failed to clear session:', e instanceof Error ? e.message : String(e));
    }
  }
}
