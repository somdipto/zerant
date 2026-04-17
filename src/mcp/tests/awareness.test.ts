import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api-client.js', () => ({
  apiCall: vi.fn(),
  tabHeaders: vi.fn(),
  logActivity: vi.fn(),
}));

vi.mock('../coerce.js', async (importOriginal) => importOriginal());

import { apiCall } from '../api-client.js';
import { registerAwarenessTools } from '../tools/awareness.js';
import { createMockServer, getHandler, expectTextContent } from './mcp-test-helper.js';

const mockApiCall = vi.mocked(apiCall);

describe('MCP awareness tools', () => {
  const { server, tools } = createMockServer();
  registerAwarenessTools(server);

  beforeEach(() => { vi.clearAllMocks(); });

  it('zerant_awareness_digest returns digest', async () => {
    mockApiCall.mockResolvedValueOnce({ summary: 'User reading docs' });
    const result = await getHandler(tools, 'zerant_awareness_digest')({});
    expectTextContent(result);
    expect(mockApiCall).toHaveBeenCalledWith('GET', '/awareness/digest');
  });

  it('zerant_awareness_digest applies minutes filter', async () => {
    mockApiCall.mockResolvedValueOnce({});
    await getHandler(tools, 'zerant_awareness_digest')({ minutes: 15 });
    const endpoint = mockApiCall.mock.calls[0][1] as string;
    expect(endpoint).toContain('minutes=15');
  });

  it('zerant_awareness_focus returns focus', async () => {
    mockApiCall.mockResolvedValueOnce({ focus: 'coding' });
    const result = await getHandler(tools, 'zerant_awareness_focus')({});
    expectTextContent(result);
    expect(mockApiCall).toHaveBeenCalledWith('GET', '/awareness/focus');
  });
});
