import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall, logActivity } from '../api-client.js';
import { coerceShape } from '../coerce.js';

export function registerAwarenessTools(server: McpServer): void {

  server.tool(
    'zerant_awareness_digest',
    'Get a smart digest of recent browser activity — what the user has been doing, ' +
    'sites visited, interactions, errors encountered, and tab changes. ' +
    'Call this at the start of a conversation to understand what the user is working on, ' +
    'or periodically to stay aware of their context.',
    coerceShape({
      minutes: z.number().optional().describe(
        'How many minutes of activity to include (default: 5, max: 60)'
      ),
    }),
    async ({ minutes }) => {
      const params = new URLSearchParams();
      if (minutes) params.set('minutes', String(minutes));
      const qs = params.toString();
      const data = await apiCall('GET', `/awareness/digest${qs ? '?' + qs : ''}`);
      await logActivity('awareness_digest', `${minutes || 5} min`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_awareness_focus',
    'Quick check: what is the user doing right now? Returns the active tab, ' +
    'current activity type (reading/typing/navigating/idle), and whether there are errors. ' +
    'Much lighter than awareness_digest — use this for quick context checks.',
    async () => {
      const data = await apiCall('GET', '/awareness/focus');
      await logActivity('awareness_focus');
      return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
    }
  );
}
