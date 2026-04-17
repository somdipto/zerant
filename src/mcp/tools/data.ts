import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall, logActivity } from '../api-client.js';

export function registerDataTools(server: McpServer): void {
  // ── Chrome Import ──

  server.tool(
    'zerant_chrome_import_status',
    'Get Chrome import status (whether Chrome is detected, last import info).',
    async () => {
      const data = await apiCall('GET', '/import/chrome/status');
      await logActivity('chrome_import_status');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_chrome_import_profiles',
    'List available Chrome profiles for import.',
    async () => {
      const data = await apiCall('GET', '/import/chrome/profiles');
      await logActivity('chrome_import_profiles');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_chrome_import_bookmarks',
    'Import bookmarks from Chrome into Zerant.',
    async () => {
      const data = await apiCall('POST', '/import/chrome/bookmarks');
      await logActivity('chrome_import_bookmarks');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_chrome_import_history',
    'Import browsing history from Chrome into Zerant.',
    async () => {
      const data = await apiCall('POST', '/import/chrome/history');
      await logActivity('chrome_import_history');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_chrome_import_cookies',
    'Import cookies from Chrome into Zerant.',
    async () => {
      const data = await apiCall('POST', '/import/chrome/cookies');
      await logActivity('chrome_import_cookies');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_chrome_sync_start',
    'Start continuous Chrome sync. Optionally specify a Chrome profile.',
    {
      profile: z.string().optional().describe('Chrome profile name to sync from'),
    },
    async ({ profile }) => {
      const body: Record<string, unknown> = {};
      if (profile) body.profile = profile;
      const data = await apiCall('POST', '/import/chrome/sync/start', body);
      await logActivity('chrome_sync_start', profile || 'default');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_chrome_sync_stop',
    'Stop continuous Chrome sync.',
    async () => {
      const data = await apiCall('POST', '/import/chrome/sync/stop');
      await logActivity('chrome_sync_stop');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_chrome_sync_status',
    'Check whether Chrome sync is currently active.',
    async () => {
      const data = await apiCall('GET', '/import/chrome/sync/status');
      await logActivity('chrome_sync_status');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── Existing tools ──

  server.tool(
    'zerant_data_export',
    'Export all user data (config, chat history, behavior stats) as JSON.',
    async () => {
      const data = await apiCall('GET', '/data/export');
      await logActivity('data_export');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_data_import',
    'Import user data from a previously exported JSON blob. This overwrites existing data.',
    {
      data: z.object({}).passthrough().describe('The data object from a previous export'),
    },
    {
      destructiveHint: true,
      readOnlyHint: false,
    },
    async ({ data }) => {
      const result = await apiCall('POST', '/data/import', data);
      await logActivity('data_import');
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'zerant_data_wipe',
    'Wipe all user data. This is irreversible — all bookmarks, history, config, and other data will be deleted.',
    {},
    {
      destructiveHint: true,
      readOnlyHint: false,
    },
    async () => {
      const data = await apiCall('POST', '/data/wipe');
      await logActivity('data_wipe', 'all data');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_downloads_list',
    'List all downloads (completed, failed, and cancelled).',
    async () => {
      const data = await apiCall('GET', '/downloads');
      await logActivity('downloads_list');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_downloads_active',
    'List currently active (in-progress) downloads.',
    async () => {
      const data = await apiCall('GET', '/downloads/active');
      await logActivity('downloads_active');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_config_get',
    'Get the current Zerant browser configuration.',
    async () => {
      const data = await apiCall('GET', '/config');
      await logActivity('config_get');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_config_update',
    'Update Zerant browser configuration settings. Pass an object with the settings to change.',
    {
      settings: z.object({}).passthrough().describe('Configuration settings to update'),
    },
    async ({ settings }) => {
      const data = await apiCall('PATCH', '/config', settings);
      await logActivity('config_update');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_get_cookies',
    'Get browser cookies, optionally filtered by URL.',
    {
      url: z.string().optional().describe('URL to filter cookies for'),
    },
    async ({ url }) => {
      const params = new URLSearchParams();
      if (url) params.set('url', url);
      const qs = params.toString();
      const endpoint = qs ? `/cookies?${qs}` : '/cookies';
      const data = await apiCall('GET', endpoint);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_clear_cookies',
    'Clear browser cookies, optionally filtered by domain.',
    {
      domain: z.string().optional().describe('Domain to clear cookies for (clears all if omitted)'),
    },
    async ({ domain }) => {
      const body: Record<string, unknown> = {};
      if (domain) body.domain = domain;
      const data = await apiCall('POST', '/cookies/clear', body);
      await logActivity('clear_cookies', domain ? `domain: ${domain}` : 'all cookies');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_browser_status',
    'Get the overall browser status including ready state, active tab info, viewport dimensions, and version.',
    async () => {
      const data = await apiCall('GET', '/status');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_active_tab_context',
    'Get rich context about the active tab including URL, title, loading state, viewport, page text excerpt, and list of all open tabs.',
    async () => {
      const data = await apiCall('GET', '/active-tab/context');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}
