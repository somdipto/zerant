import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api-client.js', () => ({
  apiCall: vi.fn(),
  tabHeaders: vi.fn(),
  logActivity: vi.fn(),
}));

vi.mock('../coerce.js', async (importOriginal) => importOriginal());

import { apiCall } from '../api-client.js';
import { registerEventTools } from '../tools/events.js';
import { createMockServer, getHandler } from './mcp-test-helper.js';

const mockApiCall = vi.mocked(apiCall);

describe('MCP event tools', () => {
  const { server, tools } = createMockServer();
  registerEventTools(server);

  beforeEach(() => { vi.clearAllMocks(); });

  it('zerant_events_recent returns recent events', async () => {
    mockApiCall.mockResolvedValueOnce({ events: [] });
    await getHandler(tools, 'zerant_events_recent')({});
    expect(mockApiCall).toHaveBeenCalledWith('GET', '/events/recent');
  });

  it('zerant_events_recent applies limit', async () => {
    mockApiCall.mockResolvedValueOnce({ events: [] });
    await getHandler(tools, 'zerant_events_recent')({ limit: 10 });
    const endpoint = mockApiCall.mock.calls[0][1] as string;
    expect(endpoint).toContain('limit=10');
  });

  it('zerant_live_status returns live status', async () => {
    mockApiCall.mockResolvedValueOnce({ enabled: true });
    await getHandler(tools, 'zerant_live_status')({});
    expect(mockApiCall).toHaveBeenCalledWith('GET', '/live/status');
  });

  it('zerant_live_toggle toggles monitoring', async () => {
    mockApiCall.mockResolvedValueOnce({ enabled: false });
    await getHandler(tools, 'zerant_live_toggle')({ enabled: false });
    expect(mockApiCall).toHaveBeenCalledWith('POST', '/live/toggle', { enabled: false });
  });

  it('zerant_behavior_stats returns stats', async () => {
    mockApiCall.mockResolvedValueOnce({ patterns: 5 });
    await getHandler(tools, 'zerant_behavior_stats')({});
    expect(mockApiCall).toHaveBeenCalledWith('GET', '/behavior/stats');
  });

  it('zerant_behavior_clear clears data', async () => {
    mockApiCall.mockResolvedValueOnce({ ok: true });
    await getHandler(tools, 'zerant_behavior_clear')({});
    expect(mockApiCall).toHaveBeenCalledWith('POST', '/behavior/clear');
  });
});
