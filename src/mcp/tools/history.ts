import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall, logActivity } from '../api-client.js';
import { coerceShape } from '../coerce.js';

export function registerHistoryTools(server: McpServer): void {
  server.tool(
    'zerant_history_list',
    'List recent browsing history with pagination',
    coerceShape({
      limit: z.number().optional().describe('Max entries to return (default 100)'),
      offset: z.number().optional().describe('Offset for pagination (default 0)'),
    }),
    async ({ limit, offset }) => {
      const params = new URLSearchParams();
      if (limit !== undefined) params.set('limit', String(limit));
      if (offset !== undefined) params.set('offset', String(offset));
      const qs = params.toString();
      const data = await apiCall('GET', qs ? `/history?${qs}` : '/history');
      const entries: Array<{ url: string; title: string; lastVisitTime: string; visitCount?: number }> = data.entries || [];

      let text = `Browsing history (${entries.length} of ${data.total ?? '?'}):\n\n`;
      for (const entry of entries) {
        const time = new Date(entry.lastVisitTime).toLocaleString();
        const visits = entry.visitCount ? ` (${entry.visitCount} visits)` : '';
        text += `- [${entry.title || entry.url}](${entry.url}) — ${time}${visits}\n`;
      }

      return { content: [{ type: 'text', text }] };
    }
  );

  server.tool(
    'zerant_history_clear',
    'Clear all browsing history. This is irreversible.',
    {},
    {
      destructiveHint: true,
      readOnlyHint: false,
    },
    async () => {
      const data = await apiCall('DELETE', '/history/clear');
      await logActivity('clear_history', 'all history');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_search_history',
    'Search through browsing history by keyword',
    {
      query: z.string().describe('Search query'),
    },
    async ({ query }) => {
      const data = await apiCall('GET', `/history/search?q=${encodeURIComponent(query)}`);
      const results: Array<{ url: string; title: string; visitedAt: number }> = data.results || [];

      let text = `History results for "${query}" (${results.length}):\n\n`;
      for (const entry of results) {
        const time = new Date(entry.visitedAt).toLocaleString();
        text += `- [${entry.title || entry.url}](${entry.url}) — ${time}\n`;
      }

      return { content: [{ type: 'text', text }] };
    }
  );

  server.tool(
    'zerant_activity_log',
    'Get recent browser activity events (navigations, clicks, searches, etc.)',
    coerceShape({
      limit: z.number().optional().describe('Max entries to return (default 100)'),
    }),
    async ({ limit }) => {
      const params = new URLSearchParams();
      if (limit !== undefined) params.set('limit', String(limit));
      const qs = params.toString();
      const data = await apiCall('GET', qs ? `/activity-log?${qs}` : '/activity-log');
      const entries: Array<{ type: string; detail?: string; ts: number }> = data.entries || [];

      let text = `Activity log (${entries.length} entries):\n\n`;
      for (const entry of entries) {
        const time = new Date(entry.ts).toLocaleString();
        text += `- [${time}] ${entry.type}${entry.detail ? `: ${entry.detail}` : ''}\n`;
      }

      return { content: [{ type: 'text', text }] };
    }
  );

  server.tool(
    'zerant_site_memory_list',
    'List all sites the browser remembers context for',
    async () => {
      const data = await apiCall('GET', '/memory/sites');
      const sites: Array<{ domain: string; lastVisited?: number }> = data.sites || [];

      let text = `Remembered sites (${sites.length}):\n\n`;
      for (const site of sites) {
        const visited = site.lastVisited ? ` — last visited ${new Date(site.lastVisited).toLocaleString()}` : '';
        text += `- ${site.domain}${visited}\n`;
      }

      return { content: [{ type: 'text', text }] };
    }
  );

  server.tool(
    'zerant_site_memory_get',
    'Get stored context/memory for a specific domain',
    {
      domain: z.string().describe('Domain to look up (e.g. "github.com")'),
    },
    async ({ domain }) => {
      const data = await apiCall('GET', `/memory/site/${encodeURIComponent(domain)}`);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_site_memory_search',
    'Search across all site memory/context by keyword',
    {
      query: z.string().describe('Search query'),
    },
    async ({ query }) => {
      const data = await apiCall('GET', `/memory/search?q=${encodeURIComponent(query)}`);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_site_memory_diff',
    'Get a diff of changes in site memory for a specific domain since the last visit.',
    {
      domain: z.string().describe('Domain to get memory diff for (e.g. "github.com")'),
    },
    async ({ domain }) => {
      const data = await apiCall('GET', `/memory/site/${encodeURIComponent(domain)}/diff`);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}
