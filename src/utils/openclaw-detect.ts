import { WEBHOOK_PORT } from './constants';
import { createLogger } from './logger';

const log = createLogger('OpenClawDetect');

export interface OpenClawStatus {
  ok: boolean;
  hooksToken?: string;
}

/**
 * Detects if OpenClaw is running on localhost and retrieves the hooks token.
 * Used during Zerant setup to auto-configure webhook.secret.
 */
export async function detectOpenClaw(): Promise<OpenClawStatus> {
  try {
    const url = `http://127.0.0.1:${WEBHOOK_PORT}/v1/status`;
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) {
      log.warn(`OpenClaw status check failed: ${response.status}`);
      return { ok: false };
    }

    const data = await response.json() as { gateway?: { hooks?: { token?: string } } };
    const token = data?.gateway?.hooks?.token;

    if (token && typeof token === 'string' && token.length > 0) {
      log.info(`✅ OpenClaw detected on localhost:${WEBHOOK_PORT} — hooks token retrieved`);
      return { ok: true, hooksToken: token };
    } else {
      log.warn('OpenClaw responded but hooks.token not found in /v1/status');
      return { ok: false };
    }
  } catch (err) {
    // Silent fail — OpenClaw not running or network error
    log.debug('OpenClaw not detected:', err instanceof Error ? err.message : String(err));
    return { ok: false };
  }
}
