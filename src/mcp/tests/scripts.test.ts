import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api-client.js', () => ({
  apiCall: vi.fn(),
  tabHeaders: vi.fn(),
  logActivity: vi.fn(),
}));

import { apiCall, logActivity } from '../api-client.js';
import { registerScriptTools } from '../tools/scripts.js';
import { createMockServer, getHandler, expectTextContent } from './mcp-test-helper.js';

const mockApiCall = vi.mocked(apiCall);
const mockLogActivity = vi.mocked(logActivity);

describe('MCP script/style tools', () => {
  const { server, tools } = createMockServer();
  registerScriptTools(server);

  beforeEach(() => { vi.clearAllMocks(); });

  describe('zerant_scripts_list', () => {
    const handler = getHandler(tools, 'zerant_scripts_list');

    it('lists scripts', async () => {
      mockApiCall.mockResolvedValueOnce([{ name: 'dark-mode' }]);
      const result = await handler({});
      expectTextContent(result);
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/scripts');
    });
  });

  describe('zerant_script_add', () => {
    const handler = getHandler(tools, 'zerant_script_add');

    it('adds a script', async () => {
      mockApiCall.mockResolvedValueOnce({ name: 'test', active: true });
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({ name: 'test', code: 'console.log(1)' });
      expectTextContent(result, 'Added script "test"');
    });
  });

  describe('zerant_script_remove', () => {
    const handler = getHandler(tools, 'zerant_script_remove');

    it('removes a script', async () => {
      mockApiCall.mockResolvedValueOnce({ removed: 'test' });
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({ name: 'test' });
      expectTextContent(result, 'Removed script: test');
    });
  });

  describe('zerant_script_enable', () => {
    const handler = getHandler(tools, 'zerant_script_enable');

    it('enables a script', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({ name: 'test' });
      expectTextContent(result, 'Enabled script: test');
    });
  });

  describe('zerant_script_disable', () => {
    const handler = getHandler(tools, 'zerant_script_disable');

    it('disables a script', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({ name: 'test' });
      expectTextContent(result, 'Disabled script: test');
    });
  });

  describe('zerant_styles_list', () => {
    const handler = getHandler(tools, 'zerant_styles_list');

    it('lists styles', async () => {
      mockApiCall.mockResolvedValueOnce([{ name: 'theme' }]);
      const result = await handler({});
      expectTextContent(result);
      expect(mockApiCall).toHaveBeenCalledWith('GET', '/styles');
    });
  });

  describe('zerant_style_add', () => {
    const handler = getHandler(tools, 'zerant_style_add');

    it('adds a style', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({ name: 'dark', css: 'body{color:white}' });
      expectTextContent(result, 'Added style: dark');
    });
  });

  describe('zerant_style_remove', () => {
    const handler = getHandler(tools, 'zerant_style_remove');

    it('removes a style', async () => {
      mockApiCall.mockResolvedValueOnce({ removed: 'dark' });
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({ name: 'dark' });
      expectTextContent(result, 'Removed style: dark');
    });
  });

  describe('zerant_style_enable', () => {
    const handler = getHandler(tools, 'zerant_style_enable');

    it('enables a style', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({ name: 'dark' });
      expectTextContent(result, 'Enabled style: dark');
    });
  });

  describe('zerant_style_disable', () => {
    const handler = getHandler(tools, 'zerant_style_disable');

    it('disables a style', async () => {
      mockApiCall.mockResolvedValueOnce({});
      mockLogActivity.mockResolvedValueOnce(undefined);
      const result = await handler({ name: 'dark' });
      expectTextContent(result, 'Disabled style: dark');
    });
  });
});
