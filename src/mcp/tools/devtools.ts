import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall, tabHeaders, logActivity } from '../api-client.js';
import { coerceShape } from '../coerce.js';

export function registerDevtoolsTools(server: McpServer): void {
  server.tool(
    'zerant_devtools_console',
    'Get console log entries for the active tab by default, or for a specific background tab when tabId is provided. Supports filtering by level (log, warn, error, info, debug) and searching message text.',
    coerceShape({
      level: z.string().optional().describe('Filter by log level: log, warn, error, info, debug'),
      search: z.string().optional().describe('Search string to filter messages'),
      limit: z.number().optional().describe('Maximum entries to return (default: 100)'),
      tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
    }),
    async ({ level, search, limit, tabId }) => {
      const params = new URLSearchParams();
      if (level) params.set('level', level);
      if (search) params.set('search', search);
      if (limit !== undefined) params.set('limit', String(limit));
      const qs = params.toString();
      const endpoint = qs ? `/devtools/console?${qs}` : '/devtools/console';
      const data = await apiCall('GET', endpoint, undefined, tabHeaders(tabId));
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_devtools_console_errors',
    'Get only console errors for the active tab by default, or for a specific background tab when tabId is provided.',
    coerceShape({
      limit: z.number().optional().describe('Maximum errors to return (default: 50)'),
      tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
    }),
    async ({ limit, tabId }) => {
      const params = new URLSearchParams();
      if (limit !== undefined) params.set('limit', String(limit));
      const qs = params.toString();
      const endpoint = qs ? `/devtools/console/errors?${qs}` : '/devtools/console/errors';
      const data = await apiCall('GET', endpoint, undefined, tabHeaders(tabId));
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_devtools_console_clear',
    'Clear the DevTools console buffer for the active tab by default, or for a specific background tab when tabId is provided.',
    {
      tabId: z.string().optional().describe('Optional tab ID to clear a specific tab instead of the active tab'),
    },
    async ({ tabId }) => {
      const data = await apiCall('POST', '/devtools/console/clear', undefined, tabHeaders(tabId));
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_devtools_network',
    'Get CDP network request entries for the active tab by default, or for a specific background tab when tabId is provided. Includes full headers and POST bodies.',
    coerceShape({
      domain: z.string().optional().describe('Filter by domain (e.g. "api.example.com")'),
      type: z.string().optional().describe('Filter by resource type (e.g. "XHR", "Fetch", "Script")'),
      failed: z.boolean().optional().describe('Filter to only failed requests (true) or successful (false)'),
      limit: z.number().optional().describe('Maximum entries to return (default: 100)'),
      tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
    }),
    async ({ domain, type, failed, limit, tabId }) => {
      const params = new URLSearchParams();
      if (domain) params.set('domain', domain);
      if (type) params.set('type', type);
      if (failed !== undefined) params.set('failed', String(failed));
      if (limit !== undefined) params.set('limit', String(limit));
      const qs = params.toString();
      const endpoint = qs ? `/devtools/network?${qs}` : '/devtools/network';
      const data = await apiCall('GET', endpoint, undefined, tabHeaders(tabId));
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_devtools_network_body',
    'Get the response body for a specific CDP network request from the active tab by default, or from a specific background tab when tabId is provided.',
    {
      requestId: z.string().describe('The request ID from DevTools network entries'),
      tabId: z.string().optional().describe('Optional tab ID to target a specific tab for this request body lookup'),
    },
    async ({ requestId, tabId }) => {
      const data = await apiCall('GET', `/devtools/network/${encodeURIComponent(requestId)}/body`, undefined, tabHeaders(tabId));
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_devtools_network_clear',
    'Clear the DevTools network log buffer for the active tab by default, or for a specific background tab when tabId is provided.',
    {
      tabId: z.string().optional().describe('Optional tab ID to clear a specific tab instead of the active tab'),
    },
    async ({ tabId }) => {
      const data = await apiCall('POST', '/devtools/network/clear', undefined, tabHeaders(tabId));
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_devtools_evaluate',
    'Evaluate a JavaScript expression via CDP Runtime in the active tab by default, or in a specific background tab when tabId is provided. WARNING: This can modify page state.',
    {
      expression: z.string().describe('JavaScript expression to evaluate'),
      tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
    },
    {
      destructiveHint: true,
      readOnlyHint: false,
      openWorldHint: true,
    },
    async ({ expression, tabId }) => {
      const data = await apiCall('POST', '/devtools/evaluate', { expression }, tabHeaders(tabId));
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_devtools_dom_query',
    'Query the DOM by CSS selector via CDP for the active tab by default, or for a specific background tab when tabId is provided.',
    {
      selector: z.string().describe('CSS selector to query'),
      tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
    },
    async ({ selector, tabId }) => {
      const data = await apiCall('POST', '/devtools/dom/query', { selector }, tabHeaders(tabId));
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_devtools_dom_xpath',
    'Query the DOM by XPath expression via CDP for the active tab by default, or for a specific background tab when tabId is provided.',
    {
      expression: z.string().describe('XPath expression to evaluate'),
      tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
    },
    async ({ expression, tabId }) => {
      const data = await apiCall('POST', '/devtools/dom/xpath', { expression }, tabHeaders(tabId));
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_devtools_performance',
    'Get performance metrics for the active tab by default, or for a specific background tab when tabId is provided.',
    {
      tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
    },
    async ({ tabId }) => {
      const data = await apiCall('GET', '/devtools/performance', undefined, tabHeaders(tabId));
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_devtools_storage',
    'Get browser storage data (cookies, localStorage, sessionStorage) for the active tab by default, or for a specific background tab when tabId is provided.',
    {
      tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
    },
    async ({ tabId }) => {
      const data = await apiCall('GET', '/devtools/storage', undefined, tabHeaders(tabId));
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_devtools_screenshot_element',
    'Take a screenshot of a specific DOM element from the active tab by default, or from a specific background tab when tabId is provided.',
    {
      selector: z.string().describe('CSS selector of the element to screenshot'),
      tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
    },
    async ({ selector, tabId }) => {
      const base64 = await apiCall('POST', '/devtools/screenshot/element', { selector }, tabHeaders(tabId));
      await logActivity('screenshot_element', selector);
      return {
        content: [{
          type: 'image',
          data: base64,
          mimeType: 'image/png',
        }],
      };
    }
  );

  server.tool(
    'zerant_devtools_status',
    'Get DevTools status for the active tab by default, or for a specific background tab when tabId is provided. The response also includes the manager primary target for comparison.',
    {
      tabId: z.string().optional().describe('Optional tab ID to target a specific tab instead of the active tab'),
    },
    async ({ tabId }) => {
      const data = await apiCall('GET', '/devtools/status', undefined, tabHeaders(tabId));
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_devtools_cdp',
    'Send a raw Chrome DevTools Protocol (CDP) command to the active tab by default, or to a specific background tab when tabId is provided. WARNING: This is a powerful low-level tool that can modify browser state.',
    {
      method: z.string().describe('CDP method name (e.g. "Page.reload", "DOM.getDocument")'),
      params: z.object({}).passthrough().optional().describe('Optional CDP method parameters'),
      tabId: z.string().optional().describe('Optional tab ID to target a specific tab instead of the active tab'),
    },
    {
      destructiveHint: true,
      readOnlyHint: false,
      openWorldHint: true,
    },
    async ({ method, params, tabId }) => {
      const data = await apiCall('POST', '/devtools/cdp', { method, params }, tabHeaders(tabId));
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_devtools_toggle',
    'Toggle DevTools open/closed for the active tab.',
    async () => {
      const data = await apiCall('POST', '/devtools/toggle');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}
