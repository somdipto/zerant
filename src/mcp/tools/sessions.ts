import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall, logActivity } from '../api-client.js';

export function registerSessionTools(server: McpServer): void {
  server.tool(
    'zerant_session_list',
    'List all isolated browser sessions with tab counts',
    async () => {
      const data = await apiCall('GET', '/sessions/list');
      await logActivity('session_list');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_session_create',
    'Create a new isolated browser session with its own cookies and storage',
    {
      name: z.string().describe('Name for the new session'),
      partition: z.string().optional().describe('Optional partition identifier for session isolation'),
    },
    async ({ name, partition }) => {
      const body: Record<string, unknown> = { name };
      if (partition) body.partition = partition;
      const data = await apiCall('POST', '/sessions/create', body);
      await logActivity('session_create', name);
      return { content: [{ type: 'text', text: `Created session: ${data.name} (partition: ${data.partition})` }] };
    }
  );

  server.tool(
    'zerant_session_switch',
    'Switch the active browser session',
    {
      name: z.string().describe('Name of the session to switch to'),
    },
    async ({ name }) => {
      const data = await apiCall('POST', '/sessions/switch', { name });
      await logActivity('session_switch', name);
      return { content: [{ type: 'text', text: `Switched to session: ${data.active}` }] };
    }
  );

  server.tool(
    'zerant_session_destroy',
    'Destroy an isolated browser session and close all its tabs',
    {
      name: z.string().describe('Name of the session to destroy'),
    },
    {
      destructiveHint: true,
      readOnlyHint: false,
      openWorldHint: false,
    },
    async ({ name }) => {
      await apiCall('POST', '/sessions/destroy', { name });
      await logActivity('session_destroy', name);
      return { content: [{ type: 'text', text: `Destroyed session: ${name}` }] };
    }
  );

  server.tool(
    'zerant_session_fetch',
    'Perform a fetch request within the context of a browser session (same-origin, includes cookies/auth). The request runs inside the active tab using the page\'s session credentials.',
    {
      url: z.string().describe('URL to fetch (must be same-origin as the active tab)'),
      method: z.string().optional().describe('HTTP method (default: GET)'),
      body: z.string().optional().describe('Request body (for POST/PUT/PATCH)'),
      sessionName: z.string().optional().describe('Optional session name to target (uses active session if omitted)'),
    },
    async ({ url, method, body, sessionName }) => {
      const payload: Record<string, unknown> = { url };
      if (method) payload.method = method;
      if (body) payload.body = body;
      const headers = sessionName ? { 'X-Session': sessionName } : undefined;
      const data = await apiCall('POST', '/sessions/fetch', payload, headers);
      await logActivity('session_fetch', `${method || 'GET'} ${url}`);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_session_state_save',
    'Save the current session state (cookies, storage) to a named snapshot',
    {
      name: z.string().describe('Name for the saved state'),
    },
    async ({ name }) => {
      const data = await apiCall('POST', '/sessions/state/save', { name });
      await logActivity('session_state_save', name);
      return { content: [{ type: 'text', text: `Saved session state "${name}" to ${data.path}` }] };
    }
  );

  server.tool(
    'zerant_session_state_load',
    'Load a previously saved session state (cookies, storage)',
    {
      name: z.string().describe('Name of the saved state to load'),
    },
    async ({ name }) => {
      const data = await apiCall('POST', '/sessions/state/load', { name });
      await logActivity('session_state_load', name);
      return { content: [{ type: 'text', text: `Loaded session state "${name}" (cookies restored: ${data.cookiesRestored})` }] };
    }
  );

  server.tool(
    'zerant_session_state_list',
    'List all saved session states',
    async () => {
      const data = await apiCall('GET', '/sessions/state/list');
      await logActivity('session_state_list');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}
