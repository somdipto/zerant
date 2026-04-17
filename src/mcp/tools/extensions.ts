import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall, logActivity } from '../api-client.js';
import { coerceShape } from '../coerce.js';

export function registerExtensionTools(server: McpServer): void {
  // ── Chrome extension import ──

  server.tool(
    'zerant_extensions_chrome_list',
    'List Chrome extensions available for import into Zerant.',
    {
      profile: z.string().optional().describe('Chrome profile name (default: "Default")'),
    },
    async ({ profile }) => {
      const params = new URLSearchParams();
      if (profile) params.set('profile', profile);
      const qs = params.toString();
      const data = await apiCall('GET', qs ? `/extensions/chrome/list?${qs}` : '/extensions/chrome/list');
      await logActivity('extensions_chrome_list');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_extensions_chrome_import',
    'Import Chrome extension(s) into Zerant. Provide an extensionId for a single extension or set all=true to import all.',
    coerceShape({
      extensionId: z.string().optional().describe('Chrome extension ID to import'),
      all: z.boolean().optional().describe('Import all Chrome extensions'),
      profile: z.string().optional().describe('Chrome profile name (default: "Default")'),
    }),
    async ({ extensionId, all, profile }) => {
      const body: Record<string, unknown> = {};
      if (extensionId) body.extensionId = extensionId;
      if (all) body.all = true;
      if (profile) body.profile = profile;
      const data = await apiCall('POST', '/extensions/chrome/import', body);
      await logActivity('extensions_chrome_import', extensionId || 'all');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── Gallery ──

  server.tool(
    'zerant_extensions_gallery',
    'Browse the curated extension gallery with install status.',
    {
      category: z.string().optional().describe('Filter by category'),
      featured: z.string().optional().describe('Filter featured extensions'),
    },
    async ({ category, featured }) => {
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (featured) params.set('featured', featured);
      const qs = params.toString();
      const data = await apiCall('GET', qs ? `/extensions/gallery?${qs}` : '/extensions/gallery');
      await logActivity('extensions_gallery');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── Updates ──

  server.tool(
    'zerant_extensions_updates_check',
    'Trigger a manual update check for all installed extensions.',
    async () => {
      const data = await apiCall('GET', '/extensions/updates/check');
      await logActivity('extensions_updates_check');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_extensions_updates_status',
    'Get current extension update status without triggering a check.',
    async () => {
      const data = await apiCall('GET', '/extensions/updates/status');
      await logActivity('extensions_updates_status');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_extensions_updates_apply',
    'Apply available extension updates. Optionally target a specific extension.',
    {
      extensionId: z.string().optional().describe('Extension ID to update (updates all if omitted)'),
    },
    async ({ extensionId }) => {
      const body: Record<string, unknown> = {};
      if (extensionId) body.extensionId = extensionId;
      const data = await apiCall('POST', '/extensions/updates/apply', body);
      await logActivity('extensions_updates_apply', extensionId || 'all');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── Disk usage, conflicts, native messaging ──

  server.tool(
    'zerant_extensions_disk_usage',
    'Get per-extension disk usage statistics.',
    async () => {
      const data = await apiCall('GET', '/extensions/disk-usage');
      await logActivity('extensions_disk_usage');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_extensions_conflicts',
    'Detect conflicts across all installed extensions.',
    async () => {
      const data = await apiCall('GET', '/extensions/conflicts');
      await logActivity('extensions_conflicts');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_extensions_native_messaging',
    'Get native messaging host detection status for extensions.',
    async () => {
      const data = await apiCall('GET', '/extensions/native-messaging/status');
      await logActivity('extensions_native_messaging');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── Existing tools ──

  server.tool(
    'zerant_extensions_list',
    'List all loaded and available browser extensions with conflict info.',
    async () => {
      const data = await apiCall('GET', '/extensions/list');
      await logActivity('extensions_list');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_extension_load',
    'Load a browser extension from a local directory path.',
    {
      path: z.string().describe('Absolute path to the extension directory'),
    },
    async ({ path: extPath }) => {
      const data = await apiCall('POST', '/extensions/load', { path: extPath });
      await logActivity('extension_load', extPath);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_extension_install',
    'Install a browser extension from the Chrome Web Store. Accepts a CWS URL or extension ID.',
    {
      input: z.string().describe('Chrome Web Store URL or extension ID'),
    },
    async ({ input }) => {
      const data = await apiCall('POST', '/extensions/install', { input });
      await logActivity('extension_install', input);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_extension_uninstall',
    'Uninstall a browser extension by its ID. Removes from session and disk.',
    {
      id: z.string().describe('Extension ID (32 lowercase a-p characters)'),
    },
    {
      destructiveHint: true,
      readOnlyHint: false,
      openWorldHint: false,
    },
    async ({ id }) => {
      const data = await apiCall('DELETE', `/extensions/uninstall/${encodeURIComponent(id)}`);
      await logActivity('extension_uninstall', id);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}
