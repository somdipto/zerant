import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api-client.js', () => ({
  apiCall: vi.fn(),
  tabHeaders: vi.fn(),
  logActivity: vi.fn(),
}));

import { apiCall, logActivity } from '../api-client.js';
import { registerWorkflowTools } from '../tools/workflows.js';
import { createMockServer, getHandler, expectTextContent } from './mcp-test-helper.js';

const mockApiCall = vi.mocked(apiCall);
const mockLogActivity = vi.mocked(logActivity);

describe('MCP workflow tools', () => {
  const { server, tools } = createMockServer();
  registerWorkflowTools(server);

  beforeEach(() => { vi.clearAllMocks(); });

  describe('zerant_workflow_list', () => {
    const handler = getHandler(tools, 'zerant_workflow_list');

    it('lists workflows', async () => {
      mockApiCall.mockResolvedValueOnce([{ id: 'wf1', name: 'Deploy' }]);
      const result = await handler({});
      expectTextContent(result);
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/workflows');
    });
  });

  describe('zerant_workflow_create', () => {
    const handler = getHandler(tools, 'zerant_workflow_create');

    it('creates a workflow', async () => {
      mockApiCall.mockResolvedValueOnce({ id: 'wf2' });
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({ name: 'Test', steps: [{ action: 'navigate' }] });
      expectTextContent(result, 'Workflow created: wf2');
      expectTextContent(result, 'Steps: 1');
    });
  });

  describe('zerant_workflow_delete', () => {
    const handler = getHandler(tools, 'zerant_workflow_delete');

    it('deletes a workflow', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({ id: 'wf1' });
      expectTextContent(result, 'Workflow wf1 deleted');
    });
  });

  describe('zerant_workflow_run', () => {
    const handler = getHandler(tools, 'zerant_workflow_run');

    it('runs a workflow', async () => {
      mockApiCall.mockResolvedValueOnce({ executionId: 'exec-1' });
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({ id: 'wf1' });
      expectTextContent(result, 'Execution ID: exec-1');
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/workflow/run', { workflowId: 'wf1', variables: undefined });
    });
  });

  describe('zerant_workflow_status', () => {
    const handler = getHandler(tools, 'zerant_workflow_status');

    it('gets execution status', async () => {
      mockApiCall.mockResolvedValueOnce({ status: 'running' });
      await handler({ executionId: 'exec-1' });
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/workflow/status/exec-1');
    });
  });

  describe('zerant_workflow_stop', () => {
    const handler = getHandler(tools, 'zerant_workflow_stop');

    it('stops an execution', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({ executionId: 'exec-1' });
      expectTextContent(result, 'execution exec-1 stopped');
    });
  });

  describe('zerant_workflow_running', () => {
    const handler = getHandler(tools, 'zerant_workflow_running');

    it('lists running executions', async () => {
      mockApiCall.mockResolvedValueOnce([]);
      const result = await handler({});
      expectTextContent(result);
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/workflow/running');
    });
  });
});
