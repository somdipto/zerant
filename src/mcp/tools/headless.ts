import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall, logActivity } from '../api-client.js';

export function registerHeadlessTools(server: McpServer): void {
  server.tool(
    'zerant_headless_open',
    'Open a URL in the headless browser. Loads the page in a hidden browser window for background scraping or testing.',
    {
      url: z.string().describe('The URL to open in the headless browser'),
    },
    async ({ url }) => {
      const data = await apiCall('POST', '/headless/open', { url });
      await logActivity('headless_open', url);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_headless_content',
    'Get the page content from the headless browser. Returns the HTML or text content of the currently loaded headless page.',
    async () => {
      const data = await apiCall('GET', '/headless/content');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_headless_status',
    'Get the status of the headless browser. Shows whether a page is loaded and its current URL.',
    async () => {
      const data = await apiCall('GET', '/headless/status');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_headless_close',
    'Close the headless browser and release its resources.',
    async () => {
      const data = await apiCall('POST', '/headless/close');
      await logActivity('headless_close');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_headless_show',
    'Make the headless browser window visible.',
    async () => {
      const data = await apiCall('POST', '/headless/show');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_headless_hide',
    'Hide the headless browser window.',
    async () => {
      const data = await apiCall('POST', '/headless/hide');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}
