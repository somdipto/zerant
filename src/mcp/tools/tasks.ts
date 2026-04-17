import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall, logActivity } from '../api-client.js';
import { coerceShape } from '../coerce.js';

export function registerTaskTools(server: McpServer): void {
  server.tool(
    'zerant_create_task',
    'Create an AI task with multiple steps that can be tracked and approved by Robin',
    coerceShape({
      description: z.string().describe('What the task is about'),
      steps: z.array(z.object({
        description: z.string().describe('Step description'),
        actionType: z.string().describe('Action type: navigate, read_page, click, type, etc.'),
        params: z.record(z.string(), z.string()).optional().describe('Action parameters as key-value pairs'),
      })).describe('Steps to execute'),
    }),
    async ({ description, steps }) => {
      const formattedSteps = steps.map((s: { description: string; actionType: string; params?: Record<string, string> }) => ({
        description: s.description,
        action: { type: s.actionType, params: s.params || {} },
        riskLevel: 'low' as const,
        requiresApproval: false,
      }));

      const task = await apiCall('POST', '/tasks', {
        description,
        createdBy: 'claude',
        assignedTo: 'claude',
        steps: formattedSteps,
      });

      await logActivity('task_created', `"${description}" (${steps.length} steps)`);
      return {
        content: [{
          type: 'text',
          text: `Task created: ${task.id}\nDescription: ${description}\nSteps: ${steps.length}\nStatus: ${task.status}`,
        }],
      };
    }
  );

  server.tool(
    'zerant_emergency_stop',
    'Emergency stop: pause ALL running agent tasks immediately',
    async () => {
      const result = await apiCall('POST', '/emergency-stop');
      await logActivity('emergency_stop', `${result.stopped} tasks stopped`);
      return {
        content: [{
          type: 'text',
          text: `Emergency stop: ${result.stopped} tasks paused.`,
        }],
      };
    }
  );

  server.tool(
    'zerant_task_list',
    'List all agent tasks. Returns task IDs, descriptions, and statuses.',
    async () => {
      const tasks = await apiCall('GET', '/tasks');
      await logActivity('task_list', `${Array.isArray(tasks) ? tasks.length : 0} tasks`);
      return { content: [{ type: 'text', text: JSON.stringify(tasks, null, 2) }] };
    }
  );

  server.tool(
    'zerant_task_get',
    'Get detailed information about a specific task including its steps and status.',
    {
      id: z.string().describe('The task ID to retrieve'),
    },
    async ({ id }) => {
      const task = await apiCall('GET', `/tasks/${encodeURIComponent(id)}`);
      return { content: [{ type: 'text', text: JSON.stringify(task, null, 2) }] };
    }
  );

  server.tool(
    'zerant_task_approve',
    'Approve a task step that is waiting for user approval.',
    {
      id: z.string().describe('The task ID'),
      stepId: z.string().describe('The step ID to approve'),
    },
    async ({ id, stepId }) => {
      await apiCall('POST', `/tasks/${encodeURIComponent(id)}/approve`, { stepId });
      await logActivity('task_approve', `task ${id}, step ${stepId}`);
      return { content: [{ type: 'text', text: `Step ${stepId} of task ${id} approved.` }] };
    }
  );

  server.tool(
    'zerant_task_reject',
    'Reject a task step that is waiting for user approval.',
    {
      id: z.string().describe('The task ID'),
      stepId: z.string().describe('The step ID to reject'),
    },
    async ({ id, stepId }) => {
      await apiCall('POST', `/tasks/${encodeURIComponent(id)}/reject`, { stepId });
      await logActivity('task_reject', `task ${id}, step ${stepId}`);
      return { content: [{ type: 'text', text: `Step ${stepId} of task ${id} rejected.` }] };
    }
  );

  server.tool(
    'zerant_tab_lock',
    'Acquire a lock on a browser tab for exclusive agent access. Use for multi-agent coordination to prevent conflicting actions on the same tab.',
    coerceShape({
      tabId: z.string().describe('The tab ID to lock'),
      agent: z.string().optional().describe('Agent identifier claiming the lock'),
      timeout: z.number().optional().describe('Lock timeout in milliseconds'),
    }),
    async ({ tabId, agent, timeout }) => {
      const body: Record<string, unknown> = { tabId };
      if (agent) body.agent = agent;
      if (timeout !== undefined) body.timeout = timeout;
      const data = await apiCall('POST', '/tab-locks/acquire', body);
      await logActivity('tab_lock', `locked tab ${tabId}${agent ? ` for ${agent}` : ''}`);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_tab_unlock',
    'Release a lock on a browser tab, allowing other agents to access it.',
    {
      tabId: z.string().describe('The tab ID to unlock'),
    },
    async ({ tabId }) => {
      const data = await apiCall('POST', '/tab-locks/release', { tabId });
      await logActivity('tab_unlock', `released tab ${tabId}`);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_tab_locks_list',
    'List all active tab locks. Shows which tabs are locked and by which agents.',
    async () => {
      const data = await apiCall('GET', '/tab-locks');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_task_check_approval',
    'Check whether a specific action type needs user approval before execution.',
    {
      actionType: z.string().optional().describe('The action type to check (e.g. "navigate", "click")'),
      targetUrl: z.string().optional().describe('Optional target URL for context-dependent approval checks'),
    },
    async ({ actionType, targetUrl }) => {
      const params = new URLSearchParams();
      if (actionType) params.set('actionType', actionType);
      if (targetUrl) params.set('targetUrl', targetUrl);
      const qs = params.toString();
      const data = await apiCall('GET', qs ? `/tasks/check-approval?${qs}` : '/tasks/check-approval');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_autonomy_get',
    'Get the current autonomy settings that control how much freedom the agent has.',
    async () => {
      const data = await apiCall('GET', '/autonomy');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_autonomy_update',
    'Update autonomy settings that control agent freedom level.',
    {
      settings: z.object({}).passthrough().describe('Autonomy settings to update'),
    },
    async ({ settings }) => {
      const data = await apiCall('PATCH', '/autonomy', settings);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_agent_activity_log',
    'Get recent activity log entries for agent actions specifically.',
    coerceShape({
      limit: z.number().optional().describe('Maximum entries to return (default: 50)'),
    }),
    async ({ limit }) => {
      const params = new URLSearchParams();
      if (limit !== undefined) params.set('limit', String(limit));
      const qs = params.toString();
      const data = await apiCall('GET', qs ? `/activity-log/agent?${qs}` : '/activity-log/agent');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_tab_lock_status',
    'Get the lock status for a specific tab.',
    {
      tabId: z.string().describe('The tab ID to check lock status for'),
    },
    async ({ tabId }) => {
      const data = await apiCall('GET', `/tab-locks/${encodeURIComponent(tabId)}`);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}
