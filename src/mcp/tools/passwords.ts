import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall } from '../api-client.js';
import { coerceShape } from '../coerce.js';

export function registerPasswordTools(server: McpServer): void {
  server.tool(
    'zerant_password_status',
    'Check the password manager vault status (locked/unlocked, new vault)',
    async () => {
      const data = await apiCall('GET', '/passwords/status');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_password_unlock',
    'Unlock the password vault with the master password',
    {
      masterPassword: z.string().describe('The master password to unlock the vault'),
    },
    {
      destructiveHint: true,
      readOnlyHint: false,
    },
    async ({ masterPassword }) => {
      const data = await apiCall('POST', '/passwords/unlock', { password: masterPassword });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_password_lock',
    'Lock the password vault',
    async () => {
      const data = await apiCall('POST', '/passwords/lock');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_password_generate',
    'Generate a random secure password string. Returns a JSON object with a "password" field containing the generated password.',
    coerceShape({
      length: z.number().optional().describe('Password length (default: 24)'),
    }),
    async ({ length }) => {
      const query = length ? `?length=${length}` : '';
      const data = await apiCall('GET', `/passwords/generate${query}`);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_password_suggest',
    'Suggest saved password identities for a given URL/domain',
    {
      url: z.string().describe('The URL or domain to look up saved passwords for'),
    },
    async ({ url }) => {
      const data = await apiCall('GET', `/passwords/suggest?domain=${encodeURIComponent(url)}`);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_password_save',
    'Save a new password entry to the vault',
    {
      url: z.string().describe('The URL or domain to associate with this password'),
      username: z.string().describe('The username or email'),
      password: z.string().describe('The password to save'),
    },
    {
      destructiveHint: true,
      readOnlyHint: false,
    },
    async ({ url, username, password }) => {
      const data = await apiCall('POST', '/passwords/save', { domain: url, username, payload: password });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}
