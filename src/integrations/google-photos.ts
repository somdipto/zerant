import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { API_PORT } from '../utils/constants';
import { zerantDir } from '../utils/paths';
import type { ConfigManager } from '../config/manager';
import { createLogger } from '../utils/logger';

const log = createLogger('GooglePhotos');
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_PHOTOS_UPLOAD_URL = 'https://photoslibrary.googleapis.com/v1/uploads';
const GOOGLE_PHOTOS_BATCH_CREATE_URL = 'https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate';
const GOOGLE_PHOTOS_SCOPE = 'https://www.googleapis.com/auth/photoslibrary.appendonly';

// ─── Types ───

interface GooglePhotosAuth {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope: string;
  tokenType: string;
  updatedAt: string;
  lastUploadAt?: string;
}

interface GooglePhotosConfig {
  clientId: string;
}

interface PendingAuth {
  state: string;
  verifier: string;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
}

export interface GooglePhotosStatus {
  enabled: boolean;
  clientIdConfigured: boolean;
  connected: boolean;
  expiresAt: number | null;
  lastUploadAt: string | null;
}

export interface GooglePhotosUploadResult {
  mediaItemId: string;
  productUrl?: string;
}

function base64UrlEncode(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function parseJsonFile<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

// ─── Manager ───

/**
 * GooglePhotosManager — Handles Google Photos OAuth and screenshot uploads.
 */
export class GooglePhotosManager {
  // === 1. Private state ===
  private configManager: ConfigManager;
  private configPath: string;
  private authPath: string;
  private pendingAuth: PendingAuth | null = null;

  // === 2. Constructor ===
  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
    const baseDir = zerantDir();
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    this.configPath = path.join(baseDir, 'google-photos.json');
    this.authPath = path.join(baseDir, 'google-photos-auth.json');
  }

  // === 4. Public methods ===

  /** Get the current connection and configuration status. */
  getStatus(): GooglePhotosStatus {
    const config = this.configManager.getConfig();
    const auth = this.loadAuth();
    return {
      enabled: !!config.screenshots.googlePhotos,
      clientIdConfigured: !!this.getClientId(),
      connected: !!auth,
      expiresAt: auth?.expiresAt ?? null,
      lastUploadAt: auth?.lastUploadAt ?? null,
    };
  }

  /** Get the configured Google OAuth client ID. */
  getClientId(): string {
    return parseJsonFile<GooglePhotosConfig>(this.configPath)?.clientId?.trim() ?? '';
  }

  /** Set or clear the Google OAuth client ID. */
  setClientId(clientId: string): GooglePhotosStatus {
    const trimmed = clientId.trim();
    if (!trimmed) {
      if (fs.existsSync(this.configPath)) {
        fs.unlinkSync(this.configPath);
      }
      this.pendingAuth = null;
      return this.getStatus();
    }

    fs.writeFileSync(this.configPath, JSON.stringify({ clientId: trimmed }, null, 2), { mode: 0o600 });
    return {
      ...this.getStatus(),
      clientIdConfigured: true,
    };
  }

  /** Start the OAuth PKCE flow and return the authorization URL for the browser. */
  beginAuth(): string {
    const clientId = this.getClientId();
    if (!clientId) {
      throw new Error('Google Photos client ID is required');
    }

    const state = base64UrlEncode(crypto.randomBytes(24));
    const verifier = base64UrlEncode(crypto.randomBytes(32));
    const challenge = base64UrlEncode(crypto.createHash('sha256').update(verifier).digest());
    this.pendingAuth = { state, verifier };

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: this.getRedirectUri(),
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      scope: GOOGLE_PHOTOS_SCOPE,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });

    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  /** Complete the OAuth flow by exchanging the authorization code for tokens. */
  async completeAuth(opts: { code?: string; state?: string; error?: string }): Promise<void> {
    if (opts.error) {
      throw new Error(`Google OAuth failed: ${opts.error}`);
    }
    if (!opts.code || !opts.state) {
      throw new Error('Google OAuth callback missing code or state');
    }
    if (!this.pendingAuth || this.pendingAuth.state !== opts.state) {
      throw new Error('Google OAuth state mismatch');
    }

    const clientId = this.getClientId();
    if (!clientId) {
      throw new Error('Google Photos client ID is required');
    }

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        code: opts.code,
        code_verifier: this.pendingAuth.verifier,
        grant_type: 'authorization_code',
        redirect_uri: this.getRedirectUri(),
      }),
    });

    const payload = await this.readJsonResponse<TokenResponse>(response);
    this.pendingAuth = null;
    this.saveAuth({
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresAt: Date.now() + (payload.expires_in * 1000),
      scope: payload.scope ?? GOOGLE_PHOTOS_SCOPE,
      tokenType: payload.token_type ?? 'Bearer',
      updatedAt: new Date().toISOString(),
    });
  }

  /** Disconnect from Google Photos by deleting stored auth tokens. */
  disconnect(): GooglePhotosStatus {
    this.pendingAuth = null;
    if (fs.existsSync(this.authPath)) {
      fs.unlinkSync(this.authPath);
    }
    return this.getStatus();
  }

  /** Upload a screenshot file to Google Photos, returning null if not configured. */
  async uploadScreenshot(filePath: string): Promise<GooglePhotosUploadResult | null> {
    const config = this.configManager.getConfig();
    if (!config.screenshots.googlePhotos) {
      return null;
    }

    const accessToken = await this.getValidAccessToken();
    if (!accessToken) {
      log.warn('Google Photos upload skipped: not connected');
      return null;
    }

    const fileBuffer = fs.readFileSync(filePath);
    const filename = path.basename(filePath);

    const uploadResponse = await fetch(GOOGLE_PHOTOS_UPLOAD_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/octet-stream',
        'X-Goog-Upload-Content-Type': 'image/png',
        'X-Goog-Upload-File-Name': filename,
        'X-Goog-Upload-Protocol': 'raw',
      },
      body: fileBuffer,
    });

    const uploadToken = await this.readTextResponse(uploadResponse);
    const createResponse = await fetch(GOOGLE_PHOTOS_BATCH_CREATE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        newMediaItems: [
          {
            description: 'Uploaded from Zerant Browser',
            simpleMediaItem: {
              uploadToken,
              fileName: filename,
            },
          },
        ],
      }),
    });

    const created = await this.readJsonResponse<{
      newMediaItemResults?: Array<{
        mediaItem?: { id?: string; productUrl?: string };
        status?: { message?: string };
      }>;
    }>(createResponse);

    const result = created.newMediaItemResults?.[0];
    if (!result?.mediaItem?.id) {
      throw new Error(result?.status?.message || 'Google Photos batchCreate returned no media item');
    }

    const auth = this.loadAuth();
    if (auth) {
      auth.lastUploadAt = new Date().toISOString();
      auth.updatedAt = auth.lastUploadAt;
      this.saveAuth(auth);
    }

    log.info(`Uploaded screenshot to Google Photos: ${filename}`);
    return {
      mediaItemId: result.mediaItem.id,
      productUrl: result.mediaItem.productUrl,
    };
  }

  // === 7. Private helpers ===

  private getRedirectUri(): string {
    return `http://127.0.0.1:${API_PORT}/google-photos/oauth/callback`;
  }

  private loadAuth(): GooglePhotosAuth | null {
    return parseJsonFile<GooglePhotosAuth>(this.authPath);
  }

  private saveAuth(auth: GooglePhotosAuth): void {
    fs.writeFileSync(this.authPath, JSON.stringify(auth, null, 2), { mode: 0o600 });
  }

  private async getValidAccessToken(): Promise<string | null> {
    const auth = this.loadAuth();
    if (!auth) {
      return null;
    }

    if (auth.expiresAt > Date.now() + 60_000) {
      return auth.accessToken;
    }

    if (!auth.refreshToken) {
      return null;
    }

    const clientId = this.getClientId();
    if (!clientId) {
      return null;
    }

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'refresh_token',
        refresh_token: auth.refreshToken,
      }),
    });

    const payload = await this.readJsonResponse<TokenResponse>(response);
    const nextAuth: GooglePhotosAuth = {
      ...auth,
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token ?? auth.refreshToken,
      expiresAt: Date.now() + (payload.expires_in * 1000),
      scope: payload.scope ?? auth.scope,
      tokenType: payload.token_type ?? auth.tokenType,
      updatedAt: new Date().toISOString(),
    };
    this.saveAuth(nextAuth);
    return nextAuth.accessToken;
  }

  private async readJsonResponse<T>(response: Response): Promise<T> {
    const text = await response.text();
    if (!response.ok) {
      throw new Error(this.formatHttpError(response.status, text));
    }
    return JSON.parse(text) as T;
  }

  private async readTextResponse(response: Response): Promise<string> {
    const text = await response.text();
    if (!response.ok) {
      throw new Error(this.formatHttpError(response.status, text));
    }
    return text;
  }

  private formatHttpError(status: number, body: string): string {
    try {
      const json = JSON.parse(body) as {
        error?: string | { message?: string };
        error_description?: string;
      };
      if (typeof json.error === 'string' && json.error_description) {
        return `HTTP ${status}: ${json.error_description}`;
      }
      if (json.error && typeof json.error === 'object' && json.error.message) {
        return `HTTP ${status}: ${json.error.message}`;
      }
    } catch {
      // Non-JSON error payload.
    }
    return `HTTP ${status}: ${body}`;
  }
}
