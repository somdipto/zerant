import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api-client.js', () => ({
  apiCall: vi.fn(),
  tabHeaders: vi.fn(),
  logActivity: vi.fn(),
}));

vi.mock('../coerce.js', async (importOriginal) => importOriginal());

import { apiCall, logActivity } from '../api-client.js';
import { registerTaskTools } from '../tools/tasks.js';
import { createMockServer, getHandler, expectTextContent } from './mcp-test-helper.js';

const mockApiCall = vi.mocked(apiCall);
const mockLogActivity = vi.mocked(logActivity);

describe('MCP task tools', () => {
  const { server, tools } = createMockServer();
  registerTaskTools(server);

  beforeEach(() => { vi.clearAllMocks(); });

  describe('zerant_create_task', () => {
    const handler = getHandler(tools, 'zerant_create_task');

    it('creates a task with steps', async () => {
      mockApiCall.mockResolvedValueOnce({ id: 'task-1', status: 'pending' });
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({
        description: 'Test task',
        steps: [{ description: 'Go to page', actionType: 'navigate', params: { url: 'https://a.com' } }],
      });
      expectTextContent(result, 'Task created: task-1');
      expectTextContent(result, 'Steps: 1');
    });
  });

  describe('zerant_emergency_stop', () => {
    const handler = getHandler(tools, 'zerant_emergency_stop');

    it('stops all tasks', async () => {
      mockApiCall.mockResolvedValueOnce({ stopped: 3 });
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({});
      expectTextContent(result, '3 tasks paused');
    });
  });

  describe('zerant_task_list', () => {
    const handler = getHandler(tools, 'zerant_task_list');

    it('lists tasks', async () => {
      mockApiCall.mockResolvedValueOnce([{ id: 't1', status: 'done' }]);
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({});
      expectTextContent(result);
    });
  });

  describe('zerant_task_get', () => {
    const handler = getHandler(tools, 'zerant_task_get');

    it('gets task details', async () => {
      mockApiCall.mockResolvedValueOnce({ id: 't1', steps: [] });
      const result = await handler({ id: 't1' });
      expectTextContent(result);
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/tasks/t1');
    });
  });

  describe('zerant_task_approve', () => {
    const handler = getHandler(tools, 'zerant_task_approve');

    it('approves a step', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({ id: 't1', stepId: 's1' });
      expectTextContent(result, 'Step s1 of task t1 approved');
    });
  });

  describe('zerant_task_reject', () => {
    const handler = getHandler(tools, 'zerant_task_reject');

    it('rejects a step', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({ id: 't1', stepId: 's1' });
      expectTextContent(result, 'Step s1 of task t1 rejected');
    });
  });

  describe('zerant_tab_lock', () => {
    const handler = getHandler(tools, 'zerant_tab_lock');

    it('acquires a tab lock', async () => {
      mockApiCall.mockResolvedValueOnce({ locked: true });
      mockLogActivity.mockResolvedValueOnce(undefined);
      await handler({ tabId: 't1', agent: 'claude' });
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/tab-locks/acquire', { tabId: 't1', agent: 'claude' });
    });
  });

  describe('zerant_tab_unlock', () => {
    const handler = getHandler(tools, 'zerant_tab_unlock');

    it('releases a tab lock', async () => {
      mockApiCall.mockResolvedValueOnce({ released: true });
      mockLogActivity.mockResolvedValueOnce(undefined);
      await handler({ tabId: 't1' });
      expect(mockApiCall).toHaveBeenCalledWith('POST', '/tab-locks/release', { tabId: 't1' });
    });
  });

  describe('zerant_task_check_approval', () => {
    const handler = getHandler(tools, 'zerant_task_check_approval');

    it('checks approval with filters', async () => {
      mockApiCall.mockResolvedValueOnce({ required: true });
      await handler({ actionType: 'navigate', targetUrl: 'https://x.com' });
      const endpoint = mockApiCall.mock.calls[0][1] as string;
      expect(endpoint).toContain('actionType=navigate');
      expect(endpoint).toContain('targetUrl=');
    });
  });

  describe('zerant_autonomy_get', () => {
    const handler = getHandler(tools, 'zerant_autonomy_get');

    it('gets autonomy settings', async () => {
      mockApiCall.mockResolvedValueOnce({ level: 'supervised' });
      const result = await handler({});
      expectTextContent(result);
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/autonomy');
    });
  });

  describe('zerant_autonomy_update', () => {
    const handler = getHandler(tools, 'zerant_autonomy_update');

    it('updates autonomy settings', async () => {
      mockApiCall.mockResolvedValueOnce({ level: 'autonomous' });
      await handler({ settings: { level: 'autonomous' } });
      expect(mockApiCall).toHaveBeenCalledWith('PATCH', '/autonomy', { level: 'autonomous' });
    });
  });

  describe('zerant_agent_activity_log', () => {
    const handler = getHandler(tools, 'zerant_agent_activity_log');

    it('gets agent activity with limit', async () => {
      mockApiCall.mockResolvedValueOnce({ entries: [] });
      await handler({ limit: 10 });
      const endpoint = mockApiCall.mock.calls[0][1] as string;
      expect(endpoint).toContain('limit=10');
    });
  });

  describe('zerant_tab_lock_status', () => {
    const handler = getHandler(tools, 'zerant_tab_lock_status');

    it('checks tab lock status', async () => {
      mockApiCall.mockResolvedValueOnce({ locked: false });
      await handler({ tabId: 't1' });
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/tab-locks/t1');
    });
  });
});
