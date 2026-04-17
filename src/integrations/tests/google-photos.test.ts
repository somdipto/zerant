import fs from 'fs';
import os from 'os';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof fs>('fs');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn().mockReturnValue(false),
      mkdirSync: vi.fn(),
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
      unlinkSync: vi.fn(),
    },
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
});

import { GooglePhotosManager } from '../google-photos';

const configPath = path.join(os.homedir(), '.zerant', 'google-photos.json');
const authPath = path.join(os.homedir(), '.zerant', 'google-photos-auth.json');

describe('GooglePhotosManager', () => {
  const configManager = {
    getConfig: vi.fn().mockReturnValue({
      screenshots: {
        googlePhotos: true,
      },
    }),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(false);
    globalThis.fetch = vi.fn() as any;
  });

  it('stores a client id and reports status', () => {
    const manager = new GooglePhotosManager(configManager);
    const status = manager.setClientId('desktop-client-id.apps.googleusercontent.com');

    expect(fs.writeFileSync).toHaveBeenCalledWith(
      configPath,
      expect.stringContaining('desktop-client-id.apps.googleusercontent.com'),
      { mode: 0o600 },
    );
    expect(status.clientIdConfigured).toBe(true);
    expect(status.connected).toBe(false);
  });

  it('builds an auth url with PKCE for desktop OAuth', () => {
    vi.mocked(fs.existsSync).mockImplementation((filePath) => filePath === configPath);
    vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
      if (filePath === configPath) {
        return JSON.stringify({ clientId: 'desktop-client-id.apps.googleusercontent.com' }) as any;
      }
      return '' as any;
    });

    const manager = new GooglePhotosManager(configManager);
    const authUrl = manager.beginAuth();
    const url = new URL(authUrl);

    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('desktop-client-id.apps.googleusercontent.com');
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/photoslibrary.appendonly');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('redirect_uri')).toContain('/google-photos/oauth/callback');
  });

  it('uploads a screenshot after refreshing auth state', async () => {
    vi.mocked(fs.existsSync).mockImplementation((filePath) => filePath === configPath || filePath === authPath);
    vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
      if (filePath === configPath) {
        return JSON.stringify({ clientId: 'desktop-client-id.apps.googleusercontent.com' }) as any;
      }
      if (filePath === authPath) {
        return JSON.stringify({
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          expiresAt: Date.now() + 120_000,
          scope: 'https://www.googleapis.com/auth/photoslibrary.appendonly',
          tokenType: 'Bearer',
          updatedAt: '2026-03-08T00:00:00.000Z',
        }) as any;
      }
      if (filePath === '/tmp/test.png') {
        return Buffer.from('png-binary') as any;
      }
      return '' as any;
    });

    vi.mocked(globalThis.fetch as any)
      .mockResolvedValueOnce(new Response('upload-token', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        newMediaItemResults: [
          {
            mediaItem: {
              id: 'media-1',
              productUrl: 'https://photos.google.com/lr/photo/abc',
            },
          },
        ],
      }), { status: 200 }));

    const manager = new GooglePhotosManager(configManager);
    const result = await manager.uploadScreenshot('/tmp/test.png');

    expect(globalThis.fetch).toHaveBeenNthCalledWith(1, 'https://photoslibrary.googleapis.com/v1/uploads', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer access-token',
        'X-Goog-Upload-File-Name': 'test.png',
      }),
      body: Buffer.from('png-binary'),
    }));
    expect(result).toEqual({
      mediaItemId: 'media-1',
      productUrl: 'https://photos.google.com/lr/photo/abc',
    });
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      authPath,
      expect.stringContaining('"lastUploadAt"'),
      { mode: 0o600 },
    );
  });
});
