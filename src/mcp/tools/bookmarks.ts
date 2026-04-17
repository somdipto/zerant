import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall, logActivity } from '../api-client.js';

export function registerBookmarkTools(server: McpServer): void {
  server.tool(
    'zerant_bookmarks_list',
    'List all bookmarks and folders as a full tree',
    {},
    async () => {
      const data = await apiCall('GET', '/bookmarks');
      const text = JSON.stringify(data, null, 2);
      return { content: [{ type: 'text', text }] };
    }
  );

  server.tool(
    'zerant_bookmark_add',
    'Add a new bookmark',
    {
      url: z.string().describe('URL to bookmark'),
      title: z.string().optional().describe('Bookmark title (defaults to URL if not provided)'),
      folderId: z.string().optional().describe('Parent folder ID to place the bookmark in'),
    },
    async ({ url, title, folderId }) => {
      const data = await apiCall('POST', '/bookmarks/add', {
        name: title || url,
        url,
        parentId: folderId,
      });
      await logActivity('bookmark_add', url);
      return { content: [{ type: 'text', text: `Bookmark added: ${data.bookmark?.name || url}` }] };
    }
  );

  server.tool(
    'zerant_bookmark_delete',
    'Delete a bookmark or folder by its ID',
    {
      id: z.string().describe('Bookmark or folder ID to delete'),
    },
    {
      destructiveHint: true,
      readOnlyHint: false,
      openWorldHint: false,
    },
    async ({ id }) => {
      const data = await apiCall('DELETE', '/bookmarks/remove', { id });
      await logActivity('bookmark_delete', id);
      return { content: [{ type: 'text', text: data.ok ? `Deleted bookmark: ${id}` : `Bookmark not found: ${id}` }] };
    }
  );

  server.tool(
    'zerant_bookmark_update',
    'Update the title or URL of an existing bookmark',
    {
      id: z.string().describe('Bookmark ID to update'),
      title: z.string().optional().describe('New title'),
      url: z.string().optional().describe('New URL'),
    },
    async ({ id, title, url }) => {
      const data = await apiCall('PUT', '/bookmarks/update', {
        id,
        name: title,
        url,
      });
      await logActivity('bookmark_update', id);
      return { content: [{ type: 'text', text: `Updated bookmark: ${data.bookmark?.name || id}` }] };
    }
  );

  server.tool(
    'zerant_bookmark_folder_add',
    'Create a new bookmark folder',
    {
      name: z.string().describe('Folder name'),
      parentId: z.string().optional().describe('Parent folder ID for nesting'),
    },
    async ({ name, parentId }) => {
      const data = await apiCall('POST', '/bookmarks/add-folder', { name, parentId });
      await logActivity('bookmark_folder_add', name);
      return { content: [{ type: 'text', text: `Created folder: ${data.folder?.name || name}` }] };
    }
  );

  server.tool(
    'zerant_bookmark_move',
    'Move a bookmark or folder into a different parent folder',
    {
      id: z.string().describe('Bookmark or folder ID to move'),
      folderId: z.string().describe('Destination folder ID'),
    },
    async ({ id, folderId }) => {
      const data = await apiCall('POST', '/bookmarks/move', { id, parentId: folderId });
      await logActivity('bookmark_move', `${id} → ${folderId}`);
      return { content: [{ type: 'text', text: data.ok ? `Moved ${id} to folder ${folderId}` : `Failed to move bookmark ${id}` }] };
    }
  );

  server.tool(
    'zerant_bookmark_check',
    'Check whether a URL is already bookmarked',
    {
      url: z.string().describe('URL to check'),
    },
    async ({ url }) => {
      const data = await apiCall('GET', `/bookmarks/check?url=${encodeURIComponent(url)}`);
      const text = data.bookmarked
        ? `Yes — "${data.bookmark?.name}" is bookmarked`
        : `No — ${url} is not bookmarked`;
      return { content: [{ type: 'text', text }] };
    }
  );

  server.tool(
    'zerant_search_bookmarks',
    'Search through saved bookmarks by keyword',
    {
      query: z.string().describe('Search query'),
    },
    async ({ query }) => {
      const data = await apiCall('GET', `/bookmarks/search?q=${encodeURIComponent(query)}`);
      const results: Array<{ name: string; url: string }> = data.results || [];

      let text = `Bookmark results for "${query}" (${results.length}):\n\n`;
      for (const bm of results) {
        text += `- [${bm.name}](${bm.url})\n`;
      }

      return { content: [{ type: 'text', text }] };
    }
  );
}
