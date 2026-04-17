import * as fs from 'fs';
import * as path from 'path';
import { zerantDir, ensureDir } from '../utils/paths';
import { createLogger } from '../utils/logger';
import type { SidebarConfig, SidebarItem, SidebarState } from './types';

const log = createLogger('SidebarManager');

// ─── Default config ─────────────────────────────────────────────────

// Sidebar items in 3 sections (similar to Opera):
// Section 1: Workspaces (top)
// Section 2: Communication — Google Calendar, Gmail, then chat apps
// Section 3: Browser utilities — Pinboards, Bookmarks, History, Downloads, Personal News
// Fixed footer (hardcoded in UI, not in items): Tips (💡) + Setup (⚙️)
const DEFAULT_CONFIG: SidebarConfig = {
  state: 'wide',
  activeItemId: null,
  panelPinned: false,
  panelWidths: {},
  items: [
    // === SECTION 1: Workspaces ===
    { id: 'workspaces', label: 'Workspaces',      icon: '', type: 'panel',   enabled: true, order: 0 },
    // === SECTION 2: Communication ===
    { id: 'calendar',   label: 'Google Calendar', icon: '', type: 'webview', enabled: true, order: 10 },
    { id: 'gmail',      label: 'Gmail',           icon: '', type: 'webview', enabled: true, order: 11 },
    { id: 'whatsapp',   label: 'WhatsApp',        icon: '', type: 'webview', enabled: true, order: 12 },
    { id: 'telegram',   label: 'Telegram',        icon: '', type: 'webview', enabled: true, order: 13 },
    { id: 'discord',    label: 'Discord',         icon: '', type: 'webview', enabled: true, order: 14 },
    { id: 'slack',      label: 'Slack',           icon: '', type: 'webview', enabled: true, order: 15 },
    { id: 'instagram',  label: 'Instagram',       icon: '', type: 'webview', enabled: true, order: 16 },
    { id: 'x',          label: 'X (Twitter)',     icon: '', type: 'webview', enabled: true, order: 17 },
    // === SECTION 3: Browser utilities ===
    { id: 'pinboards',  label: 'Pinboards',       icon: '', type: 'panel',   enabled: true, order: 20 },
    { id: 'bookmarks',  label: 'Bookmarks',       icon: '', type: 'panel',   enabled: true, order: 21 },
    { id: 'history',    label: 'History',         icon: '', type: 'panel',   enabled: true, order: 22 },
    { id: 'downloads',  label: 'Downloads',       icon: '', type: 'panel',   enabled: false, order: 23 },
    { id: 'news',       label: 'Personal News',   icon: '', type: 'panel',   enabled: false, order: 24 },
  ]
};

// ─── Storage path ───────────────────────────────────────────────────

const STORAGE_PATH = path.join(zerantDir(), 'sidebar-config.json');

// ─── Manager ────────────────────────────────────────────────────────

/**
 * SidebarManager — sidebar layout, item visibility, and panel state.
 *
 * Persistence: ~/.zerant/sidebar-config.json
 * API routes:  src/api/routes/sidebar.ts
 * MCP tools:   src/mcp/tools/sidebar.ts
 */
export class SidebarManager {

  // === 1. Private state ===

  private config: SidebarConfig;

  // === 2. Constructor ===

  constructor() {
    this.config = this.load();
  }

  // === 3. Dependency setters ===
  // (none — SidebarManager has no external dependencies)

  // === 4. Public methods ===

  /** Get the current sidebar configuration. */
  getConfig(): SidebarConfig { return this.config; }

  /**
   * Merge partial updates into the sidebar configuration and persist.
   * @param partial - fields to update (state, activeItemId, panelPinned, etc.)
   * @returns the updated configuration
   */
  updateConfig(partial: Partial<SidebarConfig>): SidebarConfig {
    this.config = { ...this.config, ...partial };
    this.save();
    return this.config;
  }

  /**
   * Toggle a sidebar item's enabled/disabled state.
   * @param id - sidebar item ID
   * @returns the toggled item, or undefined if not found
   */
  toggleItem(id: string): SidebarItem | undefined {
    const item = this.config.items.find(i => i.id === id);
    if (!item) return undefined;
    item.enabled = !item.enabled;
    this.save();
    return item;
  }

  /**
   * Reorder sidebar items by assigning new order values from the given ID sequence.
   * @param orderedIds - item IDs in desired display order
   */
  reorderItems(orderedIds: string[]): void {
    orderedIds.forEach((id, idx) => {
      const item = this.config.items.find(i => i.id === id);
      if (item) item.order = idx;
    });
    this.config.items.sort((a, b) => a.order - b.order);
    this.save();
  }

  /** Set the sidebar visibility state (hidden, narrow, or wide). */
  setState(state: SidebarState): void {
    this.config.state = state;
    this.save();
  }

  /** Set which sidebar item's panel is open, or null to close all panels. */
  setActiveItem(id: string | null): void {
    this.config.activeItemId = id;
    this.save();
  }

  // === 5. Sync integration ===
  // (none — sidebar config is local-only)

  // === 6. Cleanup ===

  /** Clean up resources (currently a no-op). */
  destroy(): void { /* nothing to clean up */ }

  // === 7. Private I/O ===

  private load(): SidebarConfig {
    try {
      if (fs.existsSync(STORAGE_PATH)) {
        const raw = JSON.parse(fs.readFileSync(STORAGE_PATH, "utf8"));
        const savedIds = new Set((raw.items || []).map((i: SidebarItem) => i.id));
        const missingItems = DEFAULT_CONFIG.items.filter(i => !savedIds.has(i.id));
        const mergedItems = [...(raw.items || []), ...missingItems];
        return { ...DEFAULT_CONFIG, ...raw, items: mergedItems };
      }
    } catch (e) {
      log.warn('Failed to load sidebar config:', e instanceof Error ? e.message : String(e));
    }
    return { ...DEFAULT_CONFIG, items: [...DEFAULT_CONFIG.items] };
  }

  private save(): void {
    try {
      ensureDir(zerantDir());
      fs.writeFileSync(STORAGE_PATH, JSON.stringify(this.config, null, 2));
    } catch (e) {
      log.warn('Failed to save sidebar config:', e instanceof Error ? e.message : String(e));
    }
  }
}
