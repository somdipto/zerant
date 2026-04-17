import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall } from '../api-client.js';

export function registerAuthTools(server: McpServer): void {
  server.tool(
    'zerant_auth_states',
    'Get all detected authentication states across visited domains. Shows login status for each domain the browser has tracked.',
    async () => {
      const data = await apiCall('GET', '/auth/states');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_auth_state',
    'Get the detected authentication state for a specific domain.',
    {
      domain: z.string().describe('Domain to check auth state for (e.g. "github.com")'),
    },
    async ({ domain }) => {
      const data = await apiCall('GET', `/auth/state/${encodeURIComponent(domain)}`);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_auth_check',
    'Check the authentication state of the current page. Analyzes the active tab to detect login forms, logged-in indicators, and auth cookies.',
    async () => {
      const data = await apiCall('POST', '/auth/check');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_auth_is_login_page',
    'Check if the current page is a login page. Uses heuristics to detect login forms and authentication UI.',
    async () => {
      const data = await apiCall('GET', '/auth/is-login-page');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_auth_update',
    'Manually update the authentication state for a domain.',
    {
      domain: z.string().describe('Domain to update auth state for (e.g. "github.com")'),
      status: z.string().describe('New auth status (e.g. "logged_in", "logged_out")'),
      username: z.string().optional().describe('Optional username for the authenticated session'),
    },
    async ({ domain, status, username }) => {
      const body: Record<string, unknown> = { domain, status };
      if (username) body.username = username;
      const data = await apiCall('POST', '/auth/update', body);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_auth_delete',
    'Delete the stored authentication state for a domain. This is irreversible.',
    {
      domain: z.string().describe('Domain to delete auth state for (e.g. "github.com")'),
    },
    {
      destructiveHint: true,
      readOnlyHint: false,
      openWorldHint: false,
    },
    async ({ domain }) => {
      const data = await apiCall('DELETE', `/auth/state/${encodeURIComponent(domain)}`);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}
