import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall, logActivity } from '../api-client.js';

export function registerWorkspaceTools(server: McpServer): void {
  server.tool(
    'zerant_workspace_list',
    'List all workspaces and the currently active workspace',
    async () => {
      const data = await apiCall('GET', '/workspaces');
      await logActivity('workspace_list');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_workspace_create',
    'Create a new workspace for organizing tabs',
    {
      name: z.string().describe('Name for the new workspace'),
      icon: z.string().optional().describe('Optional icon for the workspace'),
      color: z.string().optional().describe('Optional color for the workspace'),
    },
    async ({ name, icon, color }) => {
      const body: Record<string, unknown> = { name };
      if (icon) body.icon = icon;
      if (color) body.color = color;
      const data = await apiCall('POST', '/workspaces', body);
      await logActivity('workspace_create', name);
      return { content: [{ type: 'text', text: `Created workspace: ${JSON.stringify(data.workspace)}` }] };
    }
  );

  server.tool(
    'zerant_workspace_activate',
    'Switch to a workspace by its ID',
    {
      id: z.string().describe('Workspace ID to activate'),
    },
    async ({ id }) => {
      const data = await apiCall('POST', `/workspaces/${id}/activate`);
      await logActivity('workspace_activate', id);
      return { content: [{ type: 'text', text: `Activated workspace: ${JSON.stringify(data.workspace)}` }] };
    }
  );

  server.tool(
    'zerant_workspace_delete',
    'Delete a workspace by its ID. This removes the workspace and ungroups its tabs.',
    {
      id: z.string().describe('Workspace ID to delete'),
    },
    {
      destructiveHint: true,
      readOnlyHint: false,
      openWorldHint: false,
    },
    async ({ id }) => {
      await apiCall('DELETE', `/workspaces/${id}`);
      await logActivity('workspace_delete', id);
      return { content: [{ type: 'text', text: `Deleted workspace: ${id}` }] };
    }
  );

  server.tool(
    'zerant_workspace_update',
    'Update a workspace name, icon, or color',
    {
      id: z.string().describe('Workspace ID to update'),
      name: z.string().optional().describe('New name for the workspace'),
      icon: z.string().optional().describe('New icon for the workspace'),
      color: z.string().optional().describe('New color for the workspace'),
    },
    async ({ id, name, icon, color }) => {
      const body: Record<string, unknown> = {};
      if (name) body.name = name;
      if (icon) body.icon = icon;
      if (color) body.color = color;
      const data = await apiCall('PUT', `/workspaces/${id}`, body);
      await logActivity('workspace_update', id);
      return { content: [{ type: 'text', text: `Updated workspace: ${JSON.stringify(data.workspace)}` }] };
    }
  );

  server.tool(
    'zerant_workspace_move_tab',
    'Move a tab into a workspace',
    {
      id: z.string().describe('Workspace ID to move the tab into'),
      tabId: z.string().describe('Tab ID to move'),
    },
    async ({ id, tabId }) => {
      await apiCall('POST', `/workspaces/${id}/tabs`, { tabId });
      await logActivity('workspace_move_tab', `tab ${tabId} → workspace ${id}`);
      return { content: [{ type: 'text', text: `Moved tab ${tabId} to workspace ${id}` }] };
    }
  );
}
