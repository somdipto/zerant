import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall, logActivity } from '../api-client.js';
import { coerceShape } from '../coerce.js';

export function registerSidebarTools(server: McpServer): void {
  server.tool(
    'zerant_sidebar_config',
    'Get the current sidebar configuration (items, state, active item).',
    async () => {
      const data = await apiCall('GET', '/sidebar/config');
      await logActivity('sidebar_config');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_sidebar_update',
    'Update sidebar configuration (state, activeItemId, item order).',
    {
      config: z.object({}).passthrough().describe('Sidebar configuration fields to update'),
    },
    async ({ config }) => {
      const data = await apiCall('POST', '/sidebar/config', config);
      await logActivity('sidebar_update');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_sidebar_toggle_item',
    'Toggle a sidebar item on or off.',
    {
      id: z.string().describe('Sidebar item ID to toggle'),
    },
    async ({ id }) => {
      const data = await apiCall('POST', `/sidebar/items/${encodeURIComponent(id)}/toggle`);
      await logActivity('sidebar_toggle_item', id);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_sidebar_activate_item',
    'Activate a sidebar item (open its panel), or deactivate if already active.',
    {
      id: z.string().describe('Sidebar item ID to activate'),
    },
    async ({ id }) => {
      const data = await apiCall('POST', `/sidebar/items/${encodeURIComponent(id)}/activate`);
      await logActivity('sidebar_activate_item', id);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_sidebar_reorder',
    'Reorder sidebar items by providing an ordered list of item IDs.',
    coerceShape({
      orderedIds: z.array(z.string()).describe('Array of sidebar item IDs in desired order'),
    }),
    async ({ orderedIds }) => {
      const data = await apiCall('POST', '/sidebar/reorder', { orderedIds });
      await logActivity('sidebar_reorder');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_sidebar_state',
    'Set the sidebar visibility state.',
    {
      state: z.enum(['hidden', 'narrow', 'wide']).describe('Sidebar state: hidden, narrow, or wide'),
    },
    async ({ state }) => {
      const data = await apiCall('POST', '/sidebar/state', { state });
      await logActivity('sidebar_state', state);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}
