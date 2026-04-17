import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall } from '../api-client.js';

export function registerSystemTools(server: McpServer): void {
  server.tool(
    'zerant_pick_folder',
    'Open a native folder picker dialog. Returns the selected folder path or indicates cancellation.',
    async () => {
      const data = await apiCall('POST', '/dialog/pick-folder');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_injection_override',
    'Temporarily override content script injection security for a domain. Use when a site blocks Zerant scripts.',
    {
      domain: z.string().describe('Domain to allow injection override for (e.g. "example.com")'),
    },
    async ({ domain }) => {
      const data = await apiCall('POST', '/security/injection-override', { domain });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_google_photos_status',
    'Get the current Google Photos integration status and configuration.',
    async () => {
      const data = await apiCall('GET', '/integrations/google-photos/status');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_google_photos_connect',
    'Initiate Google Photos OAuth connection. Returns an auth URL to complete the flow.',
    {
      clientId: z.string().optional().describe('Optional Google OAuth client ID'),
    },
    async ({ clientId }) => {
      const body: Record<string, unknown> = {};
      if (clientId) body.clientId = clientId;
      const data = await apiCall('POST', '/integrations/google-photos/connect', body);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_google_photos_disconnect',
    'Disconnect the Google Photos integration.',
    async () => {
      const data = await apiCall('POST', '/integrations/google-photos/disconnect');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_google_photos_config',
    'Update Google Photos integration configuration.',
    {
      clientId: z.string().optional().describe('Google OAuth client ID to configure'),
    },
    async ({ clientId }) => {
      const body: Record<string, unknown> = {};
      if (clientId) body.clientId = clientId;
      const data = await apiCall('POST', '/integrations/google-photos/config', body);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}
