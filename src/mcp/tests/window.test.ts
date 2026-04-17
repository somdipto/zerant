import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../api-client.js', () => ({
  apiCall: vi.fn(),
  getMcpSource: vi.fn(() => 'wingman'),
  truncateToWords: vi.fn((text: string) => text),
  logActivity: vi.fn(),
}));

import { apiCall, getMcpSource, logActivity } from '../api-client.js';
import { registerWindowTools } from '../tools/window.js';
import { createMockServer, getHandler } from './mcp-test-helper.js';

const mockApiCall = vi.mocked(apiCall);
const mockGetMcpSource = vi.mocked(getMcpSource);
const mockLogActivity = vi.mocked(logActivity);

describe('MCP window tools', () => {
  const { server, tools } = createMockServer();
  registerWindowTools(server);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockGetMcpSource.mockReturnValue('wingman');
    mockLogActivity.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('zerant_research', () => {
    const handler = getHandler(tools, 'zerant_research');

    /** Helper: run handler and advance all fake timers while the promise is pending. */
    async function runHandler(args: Record<string, unknown>) {
      const promise = handler(args);
      // Drain all setTimeout calls (humanDelay uses setTimeout)
      await vi.runAllTimersAsync();
      return promise;
    }

    it('opens the research tab using getMcpSource() rather than a hardcoded source', async () => {
      mockGetMcpSource.mockReturnValue('codex');

      mockApiCall
        .mockResolvedValueOnce(undefined)                          // /tasks/check-approval
        .mockResolvedValueOnce({ id: 'task-1' })                   // POST /tasks
        .mockResolvedValueOnce(undefined)                          // POST /tasks/task-1/status running
        .mockResolvedValueOnce({ tab: { id: 'research-tab-1' } }) // POST /tabs/open
        .mockResolvedValueOnce(undefined)                          // POST /navigate (search)
        .mockResolvedValueOnce({ text: '' })                       // GET /page-content
        .mockResolvedValueOnce({ links: [] })                      // GET /links
        .mockResolvedValueOnce(undefined)                          // POST /tabs/close
        .mockResolvedValueOnce(undefined);                         // POST /tasks/task-1/status done

      const result = await runHandler({ query: 'vitest coverage', maxPages: 1, searchEngine: 'duckduckgo' });

      // The research tab must be opened with the source from getMcpSource()
      const openTabCall = mockApiCall.mock.calls.find(
        ([method, path]) => method === 'POST' && path === '/tabs/open',
      );
      expect(openTabCall).toBeDefined();
      expect(openTabCall![2]).toEqual(expect.objectContaining({ source: 'codex' }));

      expect(result.content[0].type).toBe('text');
    });

    it('returns a research summary when no result pages are found', async () => {
      mockApiCall
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ id: 'task-2' })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ tab: { id: 'research-tab-2' } })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ text: '' })
        .mockResolvedValueOnce({ links: [] })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      const result = await runHandler({ query: 'test query', maxPages: 1, searchEngine: 'google' });

      expect(result.content[0].text).toContain('Research: "test query"');
      expect(result.content[0].text).toContain('Found 0 sources');
    });

    it('returns error text and partial findings on failure', async () => {
      mockApiCall
        .mockResolvedValueOnce(undefined)                 // check-approval
        .mockResolvedValueOnce({ id: 'task-3' })          // create task
        .mockResolvedValueOnce(undefined)                 // set running
        .mockRejectedValueOnce(new Error('network fail')) // /tabs/open throws
        .mockResolvedValueOnce(undefined);                // task status failed

      const result = await runHandler({ query: 'broken query', maxPages: 1, searchEngine: 'duckduckgo' });

      expect(result.content[0].text).toContain('Research failed');
      expect(result.content[0].text).toContain('network fail');
    });
  });
});
