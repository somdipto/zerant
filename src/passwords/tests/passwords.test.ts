import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock better-sqlite3
const mockExec = vi.fn();
const mockPrepare = vi.fn();
const mockPragma = vi.fn();

vi.mock('better-sqlite3', () => {
  // Define class inside factory to avoid hoisting issues
  return {
    default: class {
      exec = mockExec;
      pragma = mockPragma;
      prepare = mockPrepare;
    },
  };
});

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs') as Record<string, unknown>;
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn().mockReturnValue(true),
      mkdirSync: vi.fn(),
    },
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
  };
});

vi.mock('../../utils/paths', () => ({
  zerantDir: vi.fn((...args: string[]) => '/tmp/zerant-test/' + args.join('/')),
}));

vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Use real crypto for PasswordCrypto tests since they're pure functions
import { PasswordCrypto } from '../../security/crypto';
import { PasswordManager } from '../manager';

describe('PasswordManager', () => {
  let pm: PasswordManager;
  const mockRun = vi.fn();
  const mockGet = vi.fn();
  const mockAll = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrepare.mockReturnValue({ run: mockRun, get: mockGet, all: mockAll });
    pm = new PasswordManager();
  });

  describe('constructor', () => {
    it('creates security directory and initializes database', () => {
      expect(mockExec).toHaveBeenCalled();
      expect(mockPragma).toHaveBeenCalledWith('journal_mode = WAL');
    });
  });

  describe('isNewVault()', () => {
    it('returns true when no master_verification exists', () => {
      mockGet.mockReturnValue(undefined);
      expect(pm.isNewVault()).toBe(true);
    });

    it('returns false when master_verification exists', () => {
      mockGet.mockReturnValue({ key: 'master_verification' });
      expect(pm.isNewVault()).toBe(false);
    });
  });

  describe('lock() / isVaultUnlocked', () => {
    it('starts locked', () => {
      expect(pm.isVaultUnlocked).toBe(false);
    });

    it('locks vault and clears key', async () => {
      // Simulate unlocking first (new vault path)
      mockGet.mockReturnValue(undefined); // no master_verification
      await pm.unlock('master123');
      expect(pm.isVaultUnlocked).toBe(true);

      pm.lock();
      expect(pm.isVaultUnlocked).toBe(false);
    });
  });

  describe('unlock()', () => {
    it('initializes new vault with master password', async () => {
      mockGet.mockReturnValue(undefined); // no existing meta
      const result = await pm.unlock('new-master-password');
      expect(result).toBe(true);
      expect(pm.isVaultUnlocked).toBe(true);
      expect(mockRun).toHaveBeenCalled(); // INSERT meta
    });

    it('verifies correct password on existing vault', async () => {
      // Create verification payload
      const password = 'test-password';
      const { key, salt } = PasswordCrypto.deriveKey(password);
      const testPayload = PasswordCrypto.encrypt('VERIFIED', key, salt);

      mockGet.mockReturnValue({ value: testPayload });
      const result = await pm.unlock(password);
      expect(result).toBe(true);
      expect(pm.isVaultUnlocked).toBe(true);
    });

    it('rejects wrong password on existing vault', async () => {
      const { key, salt } = PasswordCrypto.deriveKey('correct-password');
      const testPayload = PasswordCrypto.encrypt('VERIFIED', key, salt);

      mockGet.mockReturnValue({ value: testPayload });
      const result = await pm.unlock('wrong-password');
      expect(result).toBe(false);
      expect(pm.isVaultUnlocked).toBe(false);
    });
  });

  describe('saveItem()', () => {
    it('throws when vault is locked', () => {
      expect(() => pm.saveItem('example.com', 'user', { password: 'pass' })).toThrow('Vault is locked');
    });

    it('saves encrypted item when vault is unlocked', async () => {
      mockGet.mockReturnValue(undefined);
      await pm.unlock('master');

      pm.saveItem('example.com', 'user@test.com', { password: 'secret123' });
      expect(mockRun).toHaveBeenCalled();
      // Domain should be lowercased
      const runCall = mockRun.mock.calls[mockRun.mock.calls.length - 1];
      expect(runCall[0]).toBe('example.com');
      expect(runCall[1]).toBe('user@test.com');
      expect(runCall[2]).toBeInstanceOf(Buffer); // encrypted blob
    });

    it('lowercases domain before saving', async () => {
      mockGet.mockReturnValue(undefined);
      await pm.unlock('master');

      pm.saveItem('Example.COM', 'user', { password: 'pass' });
      const runCall = mockRun.mock.calls[mockRun.mock.calls.length - 1];
      expect(runCall[0]).toBe('example.com');
    });
  });

  describe('getItem()', () => {
    it('throws when vault is locked', () => {
      expect(() => pm.getItem('example.com', 'user')).toThrow('Vault is locked');
    });

    it('returns null when item not found', async () => {
      mockGet.mockReturnValueOnce(undefined); // no meta (new vault)
      await pm.unlock('master');
      mockGet.mockReturnValue(undefined); // no item
      expect(pm.getItem('nonexistent.com', 'nobody')).toBeNull();
    });

    it('decrypts and returns item payload', async () => {
      mockGet.mockReturnValueOnce(undefined); // new vault
      await pm.unlock('master');

      // Save an item first so we can get its encrypted blob
      const payload = { password: 'secret', notes: 'test note' };
      let savedBlob: Buffer | null = null;
      mockRun.mockImplementation((...args: unknown[]) => {
        if (args[2] instanceof Buffer) savedBlob = args[2] as Buffer;
      });
      pm.saveItem('test.com', 'user', payload);

      // Now simulate getting it back
      mockGet.mockReturnValue({ encryptedBlob: savedBlob });
      const result = pm.getItem('test.com', 'user');
      expect(result).toEqual(payload);
    });

    it('returns null on decryption failure', async () => {
      mockGet.mockReturnValueOnce(undefined);
      await pm.unlock('master');
      mockGet.mockReturnValue({ encryptedBlob: Buffer.from('garbage data that is not valid') });
      expect(pm.getItem('test.com', 'user')).toBeNull();
    });
  });

  describe('getIdentitiesForDomain()', () => {
    it('throws when vault is locked', () => {
      expect(() => pm.getIdentitiesForDomain('example.com')).toThrow('Vault is locked');
    });

    it('returns empty array when no items exist', async () => {
      mockGet.mockReturnValueOnce(undefined);
      await pm.unlock('master');
      mockAll.mockReturnValue([]);
      expect(pm.getIdentitiesForDomain('example.com')).toEqual([]);
    });

    it('decrypts and returns all identities for domain', async () => {
      mockGet.mockReturnValueOnce(undefined);
      await pm.unlock('master');

      // Save two items
      const blobs: Buffer[] = [];
      mockRun.mockImplementation((...args: unknown[]) => {
        if (args[2] instanceof Buffer) blobs.push(args[2] as Buffer);
      });
      pm.saveItem('site.com', 'alice', { password: 'pass1' });
      pm.saveItem('site.com', 'bob', { password: 'pass2' });

      mockAll.mockReturnValue([
        { username: 'alice', encryptedBlob: blobs[0] },
        { username: 'bob', encryptedBlob: blobs[1] },
      ]);

      const identities = pm.getIdentitiesForDomain('site.com');
      expect(identities).toHaveLength(2);
      expect(identities[0].username).toBe('alice');
      expect(identities[1].username).toBe('bob');
    });

    it('silently skips corrupt items', async () => {
      mockGet.mockReturnValueOnce(undefined);
      await pm.unlock('master');

      mockAll.mockReturnValue([
        { username: 'broken', encryptedBlob: Buffer.from('not encrypted') },
      ]);

      const identities = pm.getIdentitiesForDomain('site.com');
      expect(identities).toEqual([]);
    });
  });
});

describe('PasswordCrypto (additional coverage)', () => {
  describe('encrypt/decrypt buffer format', () => {
    it('produces buffer with correct segment lengths: salt(16)+iv(12)+tag(16)+ciphertext', () => {
      const { key, salt } = PasswordCrypto.deriveKey('test');
      const encrypted = PasswordCrypto.encrypt('hello', key, salt);
      // Minimum: 16 + 12 + 16 + ciphertext(>=1) = 45+
      expect(encrypted.length).toBeGreaterThanOrEqual(44 + 1);
      // First 16 bytes should be the salt
      expect(encrypted.subarray(0, 16).equals(salt)).toBe(true);
    });
  });

  describe('generatePassword edge cases', () => {
    it('generates password of length 1', () => {
      expect(PasswordCrypto.generatePassword(1).length).toBe(1);
    });

    it('generates long passwords', () => {
      const p = PasswordCrypto.generatePassword(100);
      expect(p.length).toBe(100);
    });
  });
});
