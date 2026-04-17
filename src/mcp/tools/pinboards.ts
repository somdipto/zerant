import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall, logActivity } from '../api-client.js';
import { coerceShape } from '../coerce.js';

export function registerPinboardTools(server: McpServer): void {
  server.tool(
    'zerant_pinboard_list',
    'List all pinboards (without items)',
    async () => {
      const data = await apiCall('GET', '/pinboards');
      await logActivity('pinboard_list');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_pinboard_create',
    'Create a new pinboard',
    {
      name: z.string().describe('Name of the pinboard'),
      emoji: z.string().optional().describe('Optional emoji icon for the pinboard'),
    },
    async ({ name, emoji }) => {
      const data = await apiCall('POST', '/pinboards', { name, emoji });
      await logActivity('pinboard_create', name);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_pinboard_get',
    'Get a pinboard by ID, including all its items',
    {
      id: z.string().describe('Pinboard ID'),
    },
    async ({ id }) => {
      const data = await apiCall('GET', `/pinboards/${encodeURIComponent(id)}`);
      await logActivity('pinboard_get', id);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_pinboard_update',
    'Update a pinboard name or emoji',
    {
      id: z.string().describe('Pinboard ID'),
      name: z.string().optional().describe('New name'),
      emoji: z.string().optional().describe('New emoji icon'),
    },
    async ({ id, name, emoji }) => {
      const data = await apiCall('PUT', `/pinboards/${encodeURIComponent(id)}`, { name, emoji });
      await logActivity('pinboard_update', id);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_pinboard_delete',
    'Delete a pinboard and all its items',
    {
      id: z.string().describe('Pinboard ID to delete'),
    },
    {
      destructiveHint: true,
      readOnlyHint: false,
      openWorldHint: false,
    },
    async ({ id }) => {
      const data = await apiCall('DELETE', `/pinboards/${encodeURIComponent(id)}`);
      await logActivity('pinboard_delete', id);
      return { content: [{ type: 'text', text: data.ok ? `Deleted pinboard: ${id}` : `Pinboard not found: ${id}` }] };
    }
  );

  server.tool(
    'zerant_pinboard_items',
    'Get all items in a pinboard',
    {
      id: z.string().describe('Pinboard ID'),
    },
    async ({ id }) => {
      const data = await apiCall('GET', `/pinboards/${encodeURIComponent(id)}/items`);
      await logActivity('pinboard_items', id);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_pinboard_add_item',
    'Add an item to a pinboard. Type must be link, image, text, or quote.',
    {
      id: z.string().describe('Pinboard ID'),
      type: z.enum(['link', 'image', 'text', 'quote']).describe('Item type: link, image, text, or quote'),
      url: z.string().optional().describe('URL for link or image items'),
      title: z.string().optional().describe('Item title'),
      content: z.string().optional().describe('Text content for text or quote items'),
      thumbnail: z.string().optional().describe('Thumbnail URL'),
      note: z.string().optional().describe('Optional note about the item'),
      sourceUrl: z.string().optional().describe('Source URL for quote items'),
    },
    async ({ id, type, url, title, content, thumbnail, note, sourceUrl }) => {
      const data = await apiCall('POST', `/pinboards/${encodeURIComponent(id)}/items`, {
        type, url, title, content, thumbnail, note, sourceUrl,
      });
      await logActivity('pinboard_add_item', `${id}: ${type}`);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_pinboard_remove_item',
    'Remove an item from a pinboard',
    {
      id: z.string().describe('Pinboard ID'),
      itemId: z.string().describe('Item ID to remove'),
    },
    {
      destructiveHint: true,
      readOnlyHint: false,
      openWorldHint: false,
    },
    async ({ id, itemId }) => {
      const data = await apiCall('DELETE', `/pinboards/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}`);
      await logActivity('pinboard_remove_item', `${id}/${itemId}`);
      return { content: [{ type: 'text', text: data.ok ? `Removed item ${itemId} from pinboard ${id}` : `Item or pinboard not found` }] };
    }
  );

  server.tool(
    'zerant_pinboard_settings',
    'Update display settings for a pinboard (layout, background, etc.)',
    {
      id: z.string().describe('Pinboard ID'),
      layout: z.unknown().optional().describe('Layout configuration'),
      background: z.unknown().optional().describe('Background configuration'),
    },
    async ({ id, layout, background }) => {
      const body: Record<string, unknown> = {};
      if (layout !== undefined) body.layout = layout;
      if (background !== undefined) body.background = background;
      const data = await apiCall('PUT', `/pinboards/${encodeURIComponent(id)}/settings`, body);
      await logActivity('pinboard_settings', id);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_pinboard_reorder_items',
    'Reorder items within a pinboard by providing the desired item ID order.',
    coerceShape({
      id: z.string().describe('Pinboard ID'),
      itemIds: z.array(z.string()).describe('Ordered array of item IDs representing the new order'),
    }),
    async ({ id, itemIds }) => {
      const data = await apiCall('POST', `/pinboards/${encodeURIComponent(id)}/items/reorder`, { itemIds });
      await logActivity('pinboard_reorder_items', id);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}
