import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall, logActivity } from '../api-client.js';
import { coerceShape } from '../coerce.js';

export function registerEventTools(server: McpServer): void {
  // ── Events ──

  server.tool(
    'zerant_events_recent',
    'Get recent browser events (navigation, clicks, tab changes, etc.).',
    coerceShape({
      limit: z.number().optional().describe('Maximum number of events to return (default: 50)'),
    }),
    async ({ limit }) => {
      const params = new URLSearchParams();
      if (limit) params.set('limit', String(limit));
      const qs = params.toString();
      const endpoint = qs ? `/events/recent?${qs}` : '/events/recent';
      const data = await apiCall('GET', endpoint);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── Live Mode ──

  server.tool(
    'zerant_live_status',
    'Get current live monitoring mode status (enabled/disabled).',
    async () => {
      const data = await apiCall('GET', '/live/status');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_live_toggle',
    'Toggle live monitoring mode on/off. When enabled, Wingman receives real-time browser events.',
    coerceShape({
      enabled: z.boolean().optional().describe('Set live mode on (true) or off (false). Omit to toggle.'),
    }),
    async ({ enabled }) => {
      const body: Record<string, unknown> = {};
      if (enabled !== undefined) body.enabled = enabled;
      const data = await apiCall('POST', '/live/toggle', body);
      await logActivity('live_toggle', `enabled: ${data.enabled}`);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── Behavior ──

  server.tool(
    'zerant_behavior_stats',
    'Get behavioral learning statistics (browsing patterns, site preferences, time-of-day patterns).',
    async () => {
      const data = await apiCall('GET', '/behavior/stats');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_behavior_clear',
    'Clear all collected behavioral data. This is irreversible.',
    {},
    {
      destructiveHint: true,
      readOnlyHint: false,
    },
    async () => {
      const data = await apiCall('POST', '/behavior/clear');
      await logActivity('behavior_clear');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}
