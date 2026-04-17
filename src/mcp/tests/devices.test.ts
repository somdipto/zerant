import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api-client.js', () => ({
  apiCall: vi.fn(),
  tabHeaders: vi.fn(),
  logActivity: vi.fn(),
}));

vi.mock('../coerce.js', async (importOriginal) => importOriginal());

import { apiCall, logActivity } from '../api-client.js';
import { registerDeviceTools } from '../tools/devices.js';
import { createMockServer, getHandler } from './mcp-test-helper.js';

const mockApiCall = vi.mocked(apiCall);
const mockLogActivity = vi.mocked(logActivity);

describe('MCP device tools', () => {
  const { server, tools } = createMockServer();
  registerDeviceTools(server);

  beforeEach(() => { vi.clearAllMocks(); });

  it('zerant_device_profiles lists profiles', async () => {
    mockApiCall.mockResolvedValueOnce({ profiles: [] });
    await getHandler(tools, 'zerant_device_profiles')({});
    expect(mockApiCall).toHaveBeenCalledWith('GET', '/device/profiles');
  });

  it('zerant_device_status returns status', async () => {
    mockApiCall.mockResolvedValueOnce({ emulating: false });
    await getHandler(tools, 'zerant_device_status')({});
    expect(mockApiCall).toHaveBeenCalledWith('GET', '/device/status');
  });

  it('zerant_device_emulate emulates a device', async () => {
    mockApiCall.mockResolvedValueOnce({ emulating: true });
    mockLogActivity.mockResolvedValueOnce(undefined);
    await getHandler(tools, 'zerant_device_emulate')({ device: 'iPhone 15' });
    expect(mockApiCall).toHaveBeenCalledWith('POST', '/device/emulate', expect.objectContaining({ device: 'iPhone 15' }));
  });

  it('zerant_device_reset resets emulation', async () => {
    mockApiCall.mockResolvedValueOnce({ emulating: false });
    mockLogActivity.mockResolvedValueOnce(undefined);
    await getHandler(tools, 'zerant_device_reset')({});
    expect(mockApiCall).toHaveBeenCalledWith('POST', '/device/reset');
  });
});
