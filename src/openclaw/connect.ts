import * as crypto from 'crypto';
import fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { ensureDir, zerantDir } from '../utils/paths';

const OPENCLAW_CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');

// ═══ Config Integrity Monitor ═══
// Watch openclaw.json for unexpected modifications (prompt injection defense).
// Zerant NEVER writes to this file — any change is either the user or a compromised agent.
let configWatcher: fs.FSWatcher | null = null;
let lastKnownConfigHash: string | null = null;

function hashFileSync(filePath: string): string | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch { return null; }
}

export function startConfigIntegrityMonitor(onTamper: (detail: string) => void): void {
  if (configWatcher) return;
  if (!fs.existsSync(OPENCLAW_CONFIG_PATH)) return;

  lastKnownConfigHash = hashFileSync(OPENCLAW_CONFIG_PATH);

  configWatcher = fs.watch(OPENCLAW_CONFIG_PATH, () => {
    const newHash = hashFileSync(OPENCLAW_CONFIG_PATH);
    if (newHash && newHash !== lastKnownConfigHash) {
      lastKnownConfigHash = newHash;
      // Only alert on suspicious patterns — normal config changes are fine
      try {
        const content = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf-8'));
        const suspicious: string[] = [];
        // CORS wildcard = classic prompt injection target
        const raw = JSON.stringify(content);
        if (raw.includes('"*"') && (raw.includes('cors') || raw.includes('CORS') || raw.includes('allowedOrigins'))) {
          suspicious.push('CORS set to wildcard (*)');
        }
        // Auth token replaced with something trivially short
        if (content.auth?.token && content.auth.token.length < 10) {
          suspicious.push(`Auth token suspiciously short: "${content.auth.token}"`);
        }
        // Gateway token replaced
        if (content.token && typeof content.token === 'string' && content.token.length < 10) {
          suspicious.push(`Gateway token suspiciously short: "${content.token}"`);
        }
        // Only fire if something actually looks wrong
        if (suspicious.length > 0) {
          onTamper(`⚠️ SUSPICIOUS openclaw.json modification: ${suspicious.join(', ')}`);
        }
      } catch {
        // Parse failure after modification = also suspicious
        onTamper('openclaw.json was modified but could not be parsed — possible corruption');
      }
    }
  });
}

export function stopConfigIntegrityMonitor(): void {
  configWatcher?.close();
  configWatcher = null;
}
const OPENCLAW_IDENTITY_PATH = zerantDir('openclaw', 'identity', 'device.json');
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const OPENCLAW_SCOPES = ['operator.read', 'operator.write'] as const;

type OpenClawScope = typeof OPENCLAW_SCOPES[number];

interface StoredDeviceIdentity {
  version: 1;
  deviceId: string;
  publicKeyPem: string;
  privateKeyPem: string;
  createdAtMs: number;
}

interface DeviceIdentity {
  deviceId: string;
  publicKeyPem: string;
  privateKeyPem: string;
}

export interface OpenClawConnectParams {
  minProtocol: number;
  maxProtocol: number;
  client: {
    id: 'webchat';
    version: string;
    platform: string;
    deviceFamily: string;
    mode: 'webchat';
    instanceId: string;
  };
  role: 'operator';
  scopes: OpenClawScope[];
  auth: {
    token: string;
  };
  device: {
    id: string;
    publicKey: string;
    signature: string;
    signedAt: number;
    nonce: string;
  };
}

function base64UrlEncode(value: Buffer): string {
  return value.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function derivePublicKeyRaw(publicKeyPem: string): Buffer {
  const spki = crypto.createPublicKey(publicKeyPem).export({
    type: 'spki',
    format: 'der',
  });

  if (
    Buffer.isBuffer(spki)
    && spki.length === ED25519_SPKI_PREFIX.length + 32
    && spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)
  ) {
    return spki.subarray(ED25519_SPKI_PREFIX.length);
  }

  return Buffer.from(spki);
}

function fingerprintPublicKey(publicKeyPem: string): string {
  return crypto.createHash('sha256').update(derivePublicKeyRaw(publicKeyPem)).digest('hex');
}

function generateIdentity(): DeviceIdentity {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

  return {
    deviceId: fingerprintPublicKey(publicKeyPem),
    publicKeyPem,
    privateKeyPem,
  };
}

async function writeIdentity(filePath: string, identity: DeviceIdentity): Promise<void> {
  ensureDir(path.dirname(filePath));
  const stored: StoredDeviceIdentity = {
    version: 1,
    deviceId: identity.deviceId,
    publicKeyPem: identity.publicKeyPem,
    privateKeyPem: identity.privateKeyPem,
    createdAtMs: Date.now(),
  };
  await fs.promises.writeFile(filePath, `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 });
}

async function loadOrCreateDeviceIdentity(filePath = OPENCLAW_IDENTITY_PATH): Promise<DeviceIdentity> {
  try {
    if (fs.existsSync(filePath)) {
      const raw = await fs.promises.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<StoredDeviceIdentity>;
      if (
        parsed?.version === 1
        && typeof parsed.deviceId === 'string'
        && typeof parsed.publicKeyPem === 'string'
        && typeof parsed.privateKeyPem === 'string'
      ) {
        const derivedId = fingerprintPublicKey(parsed.publicKeyPem);
        if (derivedId !== parsed.deviceId) {
          const nextIdentity = {
            deviceId: derivedId,
            publicKeyPem: parsed.publicKeyPem,
            privateKeyPem: parsed.privateKeyPem,
          };
          await writeIdentity(filePath, nextIdentity);
          return nextIdentity;
        }

        return {
          deviceId: parsed.deviceId,
          publicKeyPem: parsed.publicKeyPem,
          privateKeyPem: parsed.privateKeyPem,
        };
      }
    }
  } catch {
    // Regenerate a fresh identity if the stored file is unreadable or malformed.
  }

  const identity = generateIdentity();
  await writeIdentity(filePath, identity);
  return identity;
}

export function readOpenClawGatewayToken(): string | null {
  if (!fs.existsSync(OPENCLAW_CONFIG_PATH)) {
    return null;
  }

  const data = JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf-8')) as {
    token?: string;
    gateway?: { auth?: { token?: string } };
  };

  return data.token || data.gateway?.auth?.token || null;
}

function buildDeviceAuthPayloadV3(params: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: readonly string[];
  signedAtMs: number;
  token: string;
  nonce: string;
  platform: string;
  deviceFamily: string;
}): string {
  return [
    'v3',
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    params.scopes.join(','),
    String(params.signedAtMs),
    params.token,
    params.nonce,
    params.platform.trim().toLowerCase(),
    params.deviceFamily.trim().toLowerCase(),
  ].join('|');
}

export async function buildOpenClawConnectParams(nonce: string): Promise<OpenClawConnectParams> {
  const trimmedNonce = nonce.trim();
  if (!trimmedNonce) {
    throw new Error('nonce is required');
  }

  const token = readOpenClawGatewayToken();
  if (!token) {
    throw new Error('No token field in openclaw.json');
  }

  const identity = await loadOrCreateDeviceIdentity();
  const signedAt = Date.now();
  const platform = process.platform;
  const deviceFamily = 'desktop';
  const payload = buildDeviceAuthPayloadV3({
    deviceId: identity.deviceId,
    clientId: 'webchat',
    clientMode: 'webchat',
    role: 'operator',
    scopes: OPENCLAW_SCOPES,
    signedAtMs: signedAt,
    token,
    nonce: trimmedNonce,
    platform,
    deviceFamily,
  });
  const signature = base64UrlEncode(
    crypto.sign(null, Buffer.from(payload, 'utf8'), crypto.createPrivateKey(identity.privateKeyPem)),
  );

  return {
    minProtocol: 3,
    maxProtocol: 3,
    client: {
      id: 'webchat',
      version: '1.0',
      platform,
      deviceFamily,
      mode: 'webchat',
      instanceId: identity.deviceId,
    },
    role: 'operator',
    scopes: [...OPENCLAW_SCOPES],
    auth: { token },
    device: {
      id: identity.deviceId,
      publicKey: base64UrlEncode(derivePublicKeyRaw(identity.publicKeyPem)),
      signature,
      signedAt,
      nonce: trimmedNonce,
    },
  };
}
