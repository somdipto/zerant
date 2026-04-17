import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall, tabHeaders, logActivity } from '../api-client.js';

export function registerFormTools(server: McpServer): void {
  server.tool(
    'zerant_forms_saved',
    'List saved form autofill data. Optionally filter by domain to get form data for a specific site.',
    {
      domain: z.string().optional().describe('Optional domain to filter saved form data'),
    },
    async ({ domain }) => {
      const path = domain ? `/forms/memory/${encodeURIComponent(domain)}` : '/forms/memory';
      const data = await apiCall('GET', path);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_form_fill',
    'Get saved form fill data for a domain, ready to inject into form fields',
    {
      tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
    },
    async ({ tabId }) => {
      const data = await apiCall('POST', '/forms/fill', tabId ? { domain: tabId } : {}, tabHeaders(tabId));
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_forms_clear',
    'Delete all saved form autofill data for a specific domain',
    {
      domain: z.string().describe('The domain to clear saved form data for'),
    },
    {
      destructiveHint: true,
      readOnlyHint: false,
    },
    async ({ domain }) => {
      const data = await apiCall('DELETE', `/forms/memory/${encodeURIComponent(domain)}`);
      await logActivity('forms_clear', domain);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}
