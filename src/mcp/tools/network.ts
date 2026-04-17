import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall, tabHeaders } from '../api-client.js';
import { coerceShape } from '../coerce.js';

export function registerNetworkTools(server: McpServer): void {
  server.tool(
    'zerant_network_log',
    'Get the webRequest-based network log for the active tab by default, or for a specific background tab when tabId is provided. Lighter-weight than DevTools network and useful for recent request inspection.',
    coerceShape({
      domain: z.string().optional().describe('Filter by domain'),
      type: z.string().optional().describe('Filter by resource type'),
      limit: z.number().optional().describe('Maximum entries to return (default: 100)'),
      tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
    }),
    async ({ domain, type, limit, tabId }) => {
      const params = new URLSearchParams();
      if (domain) params.set('domain', domain);
      if (type) params.set('type', type);
      if (limit !== undefined) params.set('limit', String(limit));
      const qs = params.toString();
      const endpoint = qs ? `/network/log?${qs}` : '/network/log';
      const data = await apiCall('GET', endpoint, undefined, tabHeaders(tabId));
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_network_apis',
    'Get a summary of detected API endpoints for the active tab by default, or for a specific background tab when tabId is provided.',
    {
      tabId: z.string().optional().describe('Optional tab ID to target a specific tab instead of the active tab'),
    },
    async ({ tabId }) => {
      const data = await apiCall('GET', '/network/apis', undefined, tabHeaders(tabId));
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_network_domains',
    'Get a list of request domains for the active tab by default, or for a specific background tab when tabId is provided.',
    {
      tabId: z.string().optional().describe('Optional tab ID to target a specific tab instead of the active tab'),
    },
    async ({ tabId }) => {
      const data = await apiCall('GET', '/network/domains', undefined, tabHeaders(tabId));
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_network_har',
    'Export the active tab network log as a HAR (HTTP Archive) by default, or export a specific background tab when tabId is provided.',
    {
      tabId: z.string().optional().describe('Optional tab ID to target a specific tab instead of the active tab'),
    },
    async ({ tabId }) => {
      const data = await apiCall('GET', '/network/har', undefined, tabHeaders(tabId));
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_network_mock',
    'Add a network mock rule to intercept and override HTTP responses. Matched requests will return the specified status, body, and headers instead of hitting the real server. WARNING: This modifies network behavior.',
    coerceShape({
      url: z.string().describe('URL pattern to match (supports wildcards)'),
      method: z.string().optional().describe('HTTP method to match (e.g. "GET", "POST")'),
      status: z.number().optional().describe('HTTP status code to return (default: 200)'),
      body: z.string().optional().describe('Response body to return'),
      headers: z.record(z.string(), z.string()).optional().describe('Response headers to return'),
    }),
    {
      destructiveHint: true,
      readOnlyHint: false,
      openWorldHint: false,
    },
    async ({ url, method, status, body, headers }) => {
      const payload: Record<string, unknown> = { pattern: url };
      if (method) payload.method = method;
      if (status !== undefined) payload.status = status;
      if (body) payload.body = body;
      if (headers) payload.headers = headers;
      const data = await apiCall('POST', '/network/mock', payload);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_network_unmock',
    'Remove a network mock rule by URL pattern. The matching pattern must be the same as the one used when creating the mock.',
    {
      url: z.string().describe('URL pattern of the mock to remove'),
    },
    async ({ url }) => {
      const data = await apiCall('POST', '/network/unmock', { pattern: url });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_network_mocks',
    'List all active network mock rules. Shows the URL patterns being intercepted and their configured responses.',
    async () => {
      const data = await apiCall('GET', '/network/mocks');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_network_clear',
    'Clear the webRequest-level network log for the active tab by default, or for a specific background tab when tabId is provided.',
    {
      tabId: z.string().optional().describe('Optional tab ID to clear a specific tab instead of the active tab'),
    },
    async ({ tabId }) => {
      const data = await apiCall('DELETE', '/network/clear', undefined, tabHeaders(tabId));
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_network_mock_clear',
    'Remove all active network mock rules at once. WARNING: This clears all mock rules — real network requests will resume for all previously mocked patterns.',
    {},
    {
      destructiveHint: true,
      readOnlyHint: false,
      openWorldHint: false,
    },
    async () => {
      const data = await apiCall('POST', '/network/mock-clear');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}
