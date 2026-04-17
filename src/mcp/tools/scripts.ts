import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall, logActivity } from '../api-client.js';

export function registerScriptTools(server: McpServer): void {
  server.tool(
    'zerant_scripts_list',
    'List all persistent injected scripts with their enabled state and preview',
    async () => {
      const data = await apiCall('GET', '/scripts');
      await logActivity('scripts_list');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_script_add',
    'Add a persistent JavaScript script that will be injected into pages',
    {
      name: z.string().describe('Name for the script'),
      code: z.string().describe('JavaScript code to inject'),
    },
    async ({ name, code }) => {
      const data = await apiCall('POST', '/scripts/add', { name, code });
      await logActivity('script_add', name);
      return { content: [{ type: 'text', text: `Added script "${data.name}" (active: ${data.active})` }] };
    }
  );

  server.tool(
    'zerant_script_remove',
    'Remove a persistent injected script by name',
    {
      name: z.string().describe('Name of the script to remove'),
    },
    {
      destructiveHint: true,
      readOnlyHint: false,
      openWorldHint: false,
    },
    async ({ name }) => {
      const data = await apiCall('DELETE', '/scripts/remove', { name });
      await logActivity('script_remove', name);
      return { content: [{ type: 'text', text: `Removed script: ${data.removed}` }] };
    }
  );

  server.tool(
    'zerant_script_enable',
    'Enable a persistent injected script by name',
    {
      name: z.string().describe('Name of the script to enable'),
    },
    async ({ name }) => {
      await apiCall('POST', '/scripts/enable', { name });
      await logActivity('script_enable', name);
      return { content: [{ type: 'text', text: `Enabled script: ${name}` }] };
    }
  );

  server.tool(
    'zerant_script_disable',
    'Disable a persistent injected script by name',
    {
      name: z.string().describe('Name of the script to disable'),
    },
    async ({ name }) => {
      await apiCall('POST', '/scripts/disable', { name });
      await logActivity('script_disable', name);
      return { content: [{ type: 'text', text: `Disabled script: ${name}` }] };
    }
  );

  server.tool(
    'zerant_styles_list',
    'List all persistent injected CSS styles with their enabled state and preview',
    async () => {
      const data = await apiCall('GET', '/styles');
      await logActivity('styles_list');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_style_add',
    'Add a persistent CSS style that will be injected into pages',
    {
      name: z.string().describe('Name for the style'),
      css: z.string().describe('CSS code to inject'),
    },
    async ({ name, css }) => {
      await apiCall('POST', '/styles/add', { name, css });
      await logActivity('style_add', name);
      return { content: [{ type: 'text', text: `Added style: ${name}` }] };
    }
  );

  server.tool(
    'zerant_style_remove',
    'Remove a persistent injected CSS style by name',
    {
      name: z.string().describe('Name of the style to remove'),
    },
    {
      destructiveHint: true,
      readOnlyHint: false,
      openWorldHint: false,
    },
    async ({ name }) => {
      const data = await apiCall('DELETE', '/styles/remove', { name });
      await logActivity('style_remove', name);
      return { content: [{ type: 'text', text: `Removed style: ${data.removed}` }] };
    }
  );

  server.tool(
    'zerant_style_enable',
    'Enable a persistent injected CSS style by name',
    {
      name: z.string().describe('Name of the style to enable'),
    },
    async ({ name }) => {
      await apiCall('POST', '/styles/enable', { name });
      await logActivity('style_enable', name);
      return { content: [{ type: 'text', text: `Enabled style: ${name}` }] };
    }
  );

  server.tool(
    'zerant_style_disable',
    'Disable a persistent injected CSS style by name',
    {
      name: z.string().describe('Name of the style to disable'),
    },
    async ({ name }) => {
      await apiCall('POST', '/styles/disable', { name });
      await logActivity('style_disable', name);
      return { content: [{ type: 'text', text: `Disabled style: ${name}` }] };
    }
  );
}
