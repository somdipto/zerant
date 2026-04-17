import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall, logActivity } from '../api-client.js';
import { coerceShape } from '../coerce.js';

export function registerContextTools(server: McpServer): void {
  server.tool(
    'zerant_context_recent',
    'Get recently visited pages from the context bridge',
    coerceShape({
      limit: z.number().optional().describe('Maximum number of pages to return (default: 50)'),
    }),
    async ({ limit }) => {
      const params = limit ? `?limit=${limit}` : '';
      const data = await apiCall('GET', `/context/recent${params}`);
      await logActivity('context_recent');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_context_search',
    'Search the context bridge for pages matching a query',
    {
      query: z.string().describe('Search query string'),
    },
    async ({ query }) => {
      const data = await apiCall('GET', `/context/search?q=${encodeURIComponent(query)}`);
      await logActivity('context_search', query);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_context_page',
    'Get context bridge data for a specific page by URL',
    {
      url: z.string().describe('URL of the page to retrieve'),
    },
    async ({ url }) => {
      const data = await apiCall('GET', `/context/page?url=${encodeURIComponent(url)}`);
      await logActivity('context_page', url);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_context_summary',
    'Get a summary of the context bridge state',
    async () => {
      const data = await apiCall('GET', '/context/summary');
      await logActivity('context_summary');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_context_note',
    'Add a note to a page in the context bridge',
    {
      url: z.string().describe('URL of the page to annotate'),
      note: z.string().describe('Note text to attach to the page'),
    },
    async ({ url, note }) => {
      const data = await apiCall('POST', '/context/note', { url, note });
      await logActivity('context_note', url);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}
