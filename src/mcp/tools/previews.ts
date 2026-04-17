import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall, logActivity } from '../api-client.js';

export function registerPreviewTools(server: McpServer): void {
  server.tool(
    'zerant_preview_create',
    'Create a live HTML preview page in Zerant Browser. Returns the preview URL. The page supports live reload — use zerant_preview_update to push changes.',
    {
      html: z.string().describe('The HTML content for the preview page'),
      title: z.string().optional().describe('Optional title for the preview'),
    },
    async ({ html, title }) => {
      const body: Record<string, string> = { html };
      if (title) body.title = title;
      const data = await apiCall('POST', '/preview', body);
      await logActivity('preview_create', data.title || title || 'Untitled');
      return { content: [{ type: 'text', text: JSON.stringify({ id: data.id, url: data.url, title: data.title }) }] };
    }
  );

  server.tool(
    'zerant_preview_update',
    'Update the HTML content of an existing preview. The browser tab will live-reload automatically.',
    {
      id: z.string().describe('The preview ID to update'),
      html: z.string().describe('The new HTML content'),
    },
    async ({ id, html }) => {
      const data = await apiCall('PUT', `/preview/${encodeURIComponent(id)}`, { html });
      await logActivity('preview_update', `${id} (v${data.version})`);
      return { content: [{ type: 'text', text: JSON.stringify({ id: data.id, version: data.version, url: data.url }) }] };
    }
  );

  server.tool(
    'zerant_preview_list',
    'List all active HTML previews with their IDs, titles, and URLs.',
    async () => {
      const data = await apiCall('GET', '/previews');
      await logActivity('preview_list');
      return { content: [{ type: 'text', text: JSON.stringify(data.previews) }] };
    }
  );

  server.tool(
    'zerant_preview_delete',
    'Delete an existing HTML preview.',
    {
      id: z.string().describe('The preview ID to delete'),
    },
    {
      destructiveHint: true,
      readOnlyHint: false,
      openWorldHint: false,
    },
    async ({ id }) => {
      await apiCall('DELETE', `/preview/${encodeURIComponent(id)}`);
      await logActivity('preview_delete', id);
      return { content: [{ type: 'text', text: `Preview '${id}' deleted` }] };
    }
  );
}
