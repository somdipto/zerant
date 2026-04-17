import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall, tabHeaders, truncateToWords, logActivity } from '../api-client.js';

export function registerContentTools(server: McpServer): void {
  server.tool(
    'zerant_read_page',
    'Read page content as markdown text (max 2000 words). Supports targeting a background tab by ID.',
    {
      tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
    },
    async ({ tabId }) => {
      const data = await apiCall('GET', '/page-content', undefined, tabHeaders(tabId));
      const title = data.title || 'Untitled';
      const url = data.url || '';
      const description = data.description || '';
      const bodyText = truncateToWords(data.text || '', 2000);

      let markdown = `# ${title}\n\n`;
      markdown += `**URL:** ${url}\n\n`;
      if (description) {
        markdown += `> ${description}\n\n`;
      }
      markdown += bodyText;

      await logActivity('read_page', `${title} (${url})`);
      return { content: [{ type: 'text', text: markdown }] };
    }
  );

  server.tool(
    'zerant_screenshot',
    'Take a screenshot of a browser tab. Supports targeting a background tab by ID.',
    {
      tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
    },
    async ({ tabId }) => {
      const base64 = await apiCall('GET', '/screenshot', undefined, tabHeaders(tabId));
      await logActivity('screenshot');
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
    'zerant_get_page_html',
    'Get the raw HTML source of the current page. Supports targeting a background tab by ID.',
    {
      tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
    },
    async ({ tabId }) => {
      const data = await apiCall('GET', '/page-html', undefined, tabHeaders(tabId));
      return { content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_extract_content',
    'Extract structured content from the current page using Zerant\'s content extraction engine. Supports targeting a background tab by ID.',
    {
      tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
    },
    async ({ tabId }) => {
      const data = await apiCall('POST', '/content/extract', undefined, tabHeaders(tabId));
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_extract_url',
    'Extract and parse content from a URL using headless rendering. Returns structured content.',
    {
      url: z.string().describe('The URL to extract content from'),
    },
    async ({ url }) => {
      const data = await apiCall('POST', '/content/extract/url', { url });
      await logActivity('extract_url', url);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_get_links',
    'Get all links on the page with their text and URLs. Supports targeting a background tab by ID.',
    {
      tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
    },
    async ({ tabId }) => {
      const data = await apiCall('GET', '/links', undefined, tabHeaders(tabId));
      const links: Array<{ text: string; href: string; visible: boolean }> = data.links || [];

      let text = `Found ${links.length} links:\n\n`;
      for (const link of links) {
        const visibility = link.visible ? '' : ' [hidden]';
        text += `- [${link.text || '(no text)'}](${link.href})${visibility}\n`;
      }

      await logActivity('get_links', `${links.length} links found`);
      return { content: [{ type: 'text', text }] };
    }
  );

  server.tool(
    'zerant_get_forms',
    'Get all forms on the page with their fields and attributes. Supports targeting a background tab by ID.',
    {
      tabId: z.string().optional().describe('Optional tab ID to target a background tab instead of the active tab'),
    },
    async ({ tabId }) => {
      const data = await apiCall('GET', '/forms', undefined, tabHeaders(tabId));
      await logActivity('get_forms');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_execute_js',
    'Execute JavaScript code in the active browser tab. Returns the result.',
    {
      code: z.string().describe('JavaScript code to execute'),
    },
    {
      destructiveHint: true,
      readOnlyHint: false,
      openWorldHint: true,
    },
    async ({ code }) => {
      try {
        const result = await apiCall('POST', '/execute-js/confirm', { code });
        await logActivity('execute_js', code.substring(0, 80));
        return { content: [{ type: 'text', text: JSON.stringify(result.result ?? result, null, 2) }] };
      } catch (err) {
        if (err instanceof Error && err.message?.includes('rejected')) {
          return { content: [{ type: 'text', text: 'User rejected JavaScript execution.' }], isError: true };
        }
        throw err;
      }
    }
  );
}
