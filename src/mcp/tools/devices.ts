import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall, logActivity } from '../api-client.js';
import { coerceShape } from '../coerce.js';

export function registerDeviceTools(server: McpServer): void {
  server.tool(
    'zerant_device_profiles',
    'List all available device emulation profiles (e.g. iPhone, iPad, Pixel).',
    async () => {
      const data = await apiCall('GET', '/device/profiles');
      await logActivity('device_profiles');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_device_status',
    'Get the current device emulation status for the active tab.',
    async () => {
      const data = await apiCall('GET', '/device/status');
      await logActivity('device_status');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_device_emulate',
    'Emulate a device in the active tab. Provide a profile name OR custom dimensions (width + height).',
    coerceShape({
      device: z.string().optional().describe('Device profile name (e.g. "iPhone 15 Pro"). Use zerant_device_profiles to list available profiles.'),
      width: z.number().optional().describe('Custom viewport width in pixels'),
      height: z.number().optional().describe('Custom viewport height in pixels'),
      deviceScaleFactor: z.number().optional().describe('Device scale factor (e.g. 2 for retina)'),
      mobile: z.boolean().optional().describe('Whether to emulate a mobile device'),
      userAgent: z.string().optional().describe('Custom user agent string'),
    }),
    async ({ device, width, height, deviceScaleFactor, mobile, userAgent }) => {
      const body: Record<string, unknown> = {};
      if (device) body.device = device;
      if (width !== undefined) body.width = width;
      if (height !== undefined) body.height = height;
      if (deviceScaleFactor !== undefined) body.deviceScaleFactor = deviceScaleFactor;
      if (mobile !== undefined) body.mobile = mobile;
      if (userAgent !== undefined) body.userAgent = userAgent;
      const data = await apiCall('POST', '/device/emulate', body);
      await logActivity('device_emulate', device || `${width}x${height}`);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    'zerant_device_reset',
    'Reset device emulation on the active tab back to normal desktop mode.',
    async () => {
      const data = await apiCall('POST', '/device/reset');
      await logActivity('device_reset');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );
}
