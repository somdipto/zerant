import type { ConfigManager } from '../config/manager';

// ─── Types ───────────────────────────────────────────────────────────────────

interface WingmanEvent {
  type: string;
  tabId: string;
  timestamp: number;
  data: Record<string, unknown>;
}

// ─── Manager ─────────────────────────────────────────────────────────────────

/**
 * WingmanStream — Pushes real-time activity events to OpenClaw.
 */
export class WingmanStream {

  // === 1. Private state ===

  private configManager: ConfigManager;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private enabled: boolean = true;
  private eventCount: number = 0;
  private rateLimitResetTime: number = 0;

  // === 2. Constructor ===

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
  }

  // === 4. Public methods ===

  /** Send event to OpenClaw (non-blocking) */
  async emit(event: WingmanEvent): Promise<void> {
    if (!this.enabled) return;
    const config = this.configManager.getConfig();
    if (!config.webhook?.enabled || !config.webhook?.url || !config.webhook?.notifyOnActivity) return;

    // Rate limit: max 10 events/second
    const now = Date.now();
    if (now > this.rateLimitResetTime) {
      this.eventCount = 0;
      this.rateLimitResetTime = now + 1000;
    }
    if (++this.eventCount > 10) return;

    const url = config.webhook.url.replace(/\/$/, '');

    try {
      await fetch(`${url}/api/sessions/main/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.webhook.secret ? { 'Authorization': `Bearer ${config.webhook.secret}` } : {}),
        },
        body: JSON.stringify({
          type: 'zerant-activity',
          text: this.formatEventText(event),
          metadata: {
            eventType: event.type,
            tabId: event.tabId,
            timestamp: event.timestamp,
            source: 'zerant-browser',
            ...event.data,
          },
        }),
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      // Silent fail — OpenClaw may not be running
    }
  }

  /** Debounced emit — groups rapid-fire events */
  emitDebounced(key: string, event: WingmanEvent, delayMs: number): void {
    const existing = this.debounceTimers.get(key);
    if (existing) clearTimeout(existing);
    this.debounceTimers.set(key, setTimeout(() => {
      this.debounceTimers.delete(key);
      void this.emit(event);
    }, delayMs));
  }

  /** Toggle stream on/off */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** Check if stream is enabled */
  isEnabled(): boolean {
    return this.enabled;
  }

  // === 6. Cleanup ===

  /** Cleanup timers */
  destroy(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  // === 7. Private helpers ===

  /** Format event as readable text for the AI wingman */
  private formatEventText(event: WingmanEvent): string {
    switch (event.type) {
      case 'tab-switched':
        return `[Zerant] The user switched to tab: ${event.data.title} (${event.data.url})`;
      case 'navigated':
        return `[Zerant] The user navigated to: ${event.data.url} (${event.data.title})`;
      case 'page-loaded':
        return `[Zerant] Page loaded: ${event.data.title} (${event.data.url}) in ${event.data.loadTimeMs}ms`;
      case 'tab-opened':
        return `[Zerant] The user opened new tab: ${event.data.url}`;
      case 'tab-closed':
        return `[Zerant] The user closed tab: ${event.data.title} (${event.data.url})`;
      case 'text-selected':
        return `[Zerant] The user selected text on ${event.data.url}: "${event.data.text}"`;
      case 'scroll-position':
        return `[Zerant] The user scrolled to ${event.data.scrollPercent}% on ${event.data.url}`;
      case 'form-interaction':
        return `[Zerant] The user is interacting with ${event.data.fieldType} field "${event.data.fieldName}" on ${event.data.url}`;
      default:
        return `[Zerant] Activity: ${event.type}`;
    }
  }
}
