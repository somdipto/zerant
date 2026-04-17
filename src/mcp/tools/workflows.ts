import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall, logActivity } from '../api-client.js';
import { coerceShape } from '../coerce.js';

export function registerWorkflowTools(server: McpServer): void {
  server.tool(
    'zerant_workflow_list',
    'List all saved workflows.',
    async () => {
      const data = await apiCall('GET', '/workflows');
      const workflows = data.workflows || [];
      await logActivity('workflow_list', `${workflows.length} workflows`);
      return { content: [{ type: 'text', text: JSON.stringify(workflows, null, 2) }] };
    }
  );

  server.tool(
    'zerant_workflow_create',
    'Create a new automation workflow with named steps.',
    coerceShape({
      name: z.string().describe('Workflow name'),
      steps: z.array(z.object({
        type: z.string().describe('Step type (e.g. navigate, click, type, extract, wait, script)'),
        params: z.record(z.string(), z.any()).optional().describe('Step parameters'),
        description: z.string().optional().describe('Human-readable step description'),
      })).describe('Workflow steps to execute in order'),
      description: z.string().optional().describe('Optional workflow description'),
      variables: z.record(z.string(), z.any()).optional().describe('Optional default variable values'),
    }),
    async ({ name, steps, description, variables }) => {
      const body: Record<string, unknown> = { name, steps };
      if (description) body.description = description;
      if (variables) body.variables = variables;
      const result = await apiCall('POST', '/workflows', body);
      await logActivity('workflow_create', `"${name}" (${steps.length} steps)`);
      return { content: [{ type: 'text', text: `Workflow created: ${result.id}\nName: ${name}\nSteps: ${steps.length}` }] };
    }
  );

  server.tool(
    'zerant_workflow_delete',
    'Delete a saved workflow by ID.',
    {
      id: z.string().describe('The workflow ID to delete'),
    },
    {
      destructiveHint: true,
      readOnlyHint: false,
      openWorldHint: false,
    },
    async ({ id }) => {
      await apiCall('DELETE', `/workflows/${encodeURIComponent(id)}`);
      await logActivity('workflow_delete', id);
      return { content: [{ type: 'text', text: `Workflow ${id} deleted.` }] };
    }
  );

  server.tool(
    'zerant_workflow_run',
    'Run a saved workflow by ID. Returns an execution ID for tracking.',
    {
      id: z.string().describe('The workflow ID to run'),
      variables: z.record(z.string(), z.any()).optional().describe('Optional runtime variables to pass to the workflow'),
    },
    async ({ id, variables }) => {
      const body: Record<string, unknown> = { workflowId: id };
      if (variables) body.variables = variables;
      const result = await apiCall('POST', '/workflow/run', body);
      await logActivity('workflow_run', `workflow ${id}, execution ${result.executionId}`);
      return { content: [{ type: 'text', text: `Workflow started.\nExecution ID: ${result.executionId}` }] };
    }
  );

  server.tool(
    'zerant_workflow_status',
    'Check the status of a running or completed workflow execution.',
    {
      executionId: z.string().describe('The execution ID returned from workflow run'),
    },
    async ({ executionId }) => {
      const status = await apiCall('GET', `/workflow/status/${encodeURIComponent(executionId)}`);
      return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };
    }
  );

  server.tool(
    'zerant_workflow_stop',
    'Stop a running workflow execution.',
    {
      executionId: z.string().describe('The execution ID to stop'),
    },
    {
      destructiveHint: true,
      readOnlyHint: false,
      openWorldHint: false,
    },
    async ({ executionId }) => {
      await apiCall('POST', '/workflow/stop', { executionId });
      await logActivity('workflow_stop', executionId);
      return { content: [{ type: 'text', text: `Workflow execution ${executionId} stopped.` }] };
    }
  );

  server.tool(
    'zerant_workflow_running',
    'List all currently running workflow executions.',
    async () => {
      const data = await apiCall('GET', '/workflow/running');
      const executions = data.executions || [];
      return { content: [{ type: 'text', text: JSON.stringify(executions, null, 2) }] };
    }
  );
}
