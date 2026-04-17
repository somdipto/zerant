import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';

// Mock electron before importing
vi.mock('electron', () => ({
  clipboard: {
    availableFormats: vi.fn().mockReturnValue([]),
    readText: vi.fn().mockReturnValue(''),
    readHTML: vi.fn().mockReturnValue(''),
    readImage: vi.fn().mockReturnValue({ isEmpty: () => true, toPNG: () => Buffer.alloc(0), getSize: () => ({ width: 0, height: 0 }) }),
    writeText: vi.fn(),
    writeImage: vi.fn(),
  },
  nativeImage: {
    createFromBuffer: vi.fn().mockReturnValue({ isEmpty: () => true }),
  },
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs') as Record<string, unknown>;
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn().mockReturnValue(true),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
    },
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

vi.mock('../../utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import fs from 'fs';
import { clipboard, nativeImage } from 'electron';
import { ClipboardManager } from '../manager';

describe('ClipboardManager', () => {
  let cm: ClipboardManager;

  beforeEach(() => {
    vi.clearAllMocks();
    cm = new ClipboardManager();
  });

  describe('read()', () => {
    it('returns empty result when clipboard has no content', () => {
      vi.mocked(clipboard.availableFormats).mockReturnValue([]);
      const result = cm.read();
      expect(result.hasText).toBe(false);
      expect(result.hasImage).toBe(false);
      expect(result.hasHTML).toBe(false);
      expect(result.formats).toEqual([]);
    });

    it('reads text when available', () => {
      vi.mocked(clipboard.availableFormats).mockReturnValue(['text/plain']);
      vi.mocked(clipboard.readText).mockReturnValue('hello clipboard');
      const result = cm.read();
      expect(result.hasText).toBe(true);
      expect(result.text).toBe('hello clipboard');
    });

    it('reads HTML when available', () => {
      vi.mocked(clipboard.availableFormats).mockReturnValue(['text/html']);
      vi.mocked(clipboard.readHTML).mockReturnValue('<b>bold</b>');
      const result = cm.read();
      expect(result.hasHTML).toBe(true);
      expect(result.html).toBe('<b>bold</b>');
    });

    it('reads image when available and under size limit', () => {
      const pngBuffer = Buffer.alloc(1024);
      const mockImg = {
        isEmpty: () => false,
        toPNG: () => pngBuffer,
        getSize: () => ({ width: 100, height: 50 }),
      };
      vi.mocked(clipboard.availableFormats).mockReturnValue(['image/png']);
      vi.mocked(clipboard.readImage).mockReturnValue(mockImg as any);

      const result = cm.read();
      expect(result.hasImage).toBe(true);
      expect(result.image!.width).toBe(100);
      expect(result.image!.height).toBe(50);
      expect(result.image!.base64).toContain('data:image/png;base64,');
      expect(result.image!.sizeBytes).toBe(1024);
    });

    it('returns empty base64 when image exceeds 10MB', () => {
      const bigBuffer = Buffer.alloc(11 * 1024 * 1024);
      const mockImg = {
        isEmpty: () => false,
        toPNG: () => bigBuffer,
        getSize: () => ({ width: 4000, height: 3000 }),
      };
      vi.mocked(clipboard.availableFormats).mockReturnValue(['image/png']);
      vi.mocked(clipboard.readImage).mockReturnValue(mockImg as any);

      const result = cm.read();
      expect(result.image!.base64).toBe('');
      expect(result.image!.sizeBytes).toBe(bigBuffer.length);
    });

    it('detects text/uri-list as text format', () => {
      vi.mocked(clipboard.availableFormats).mockReturnValue(['text/uri-list']);
      vi.mocked(clipboard.readText).mockReturnValue('https://example.com');
      const result = cm.read();
      expect(result.hasText).toBe(true);
    });
  });

  describe('writeText()', () => {
    it('writes text to clipboard', () => {
      cm.writeText('test text');
      expect(clipboard.writeText).toHaveBeenCalledWith('test text');
    });
  });

  describe('writeImage()', () => {
    it('writes valid base64 image to clipboard', () => {
      const mockImg = { isEmpty: () => false };
      vi.mocked(nativeImage.createFromBuffer).mockReturnValue(mockImg as any);

      cm.writeImage('data:image/png;base64,iVBORw0KGgo=');
      expect(nativeImage.createFromBuffer).toHaveBeenCalled();
      expect(clipboard.writeImage).toHaveBeenCalledWith(mockImg);
    });

    it('strips data URI prefix before decoding', () => {
      const mockImg = { isEmpty: () => false };
      vi.mocked(nativeImage.createFromBuffer).mockReturnValue(mockImg as any);

      cm.writeImage('data:image/jpeg;base64,/9j/4AAQ=');
      const bufferArg = vi.mocked(nativeImage.createFromBuffer).mock.calls[0][0];
      // The raw base64 after stripping prefix should be decoded
      expect(bufferArg).toBeInstanceOf(Buffer);
    });

    it('throws on invalid image data', () => {
      const mockImg = { isEmpty: () => true };
      vi.mocked(nativeImage.createFromBuffer).mockReturnValue(mockImg as any);

      expect(() => cm.writeImage('not-an-image')).toThrow('Invalid image data');
    });
  });

  describe('saveAs()', () => {
    it('saves text to file', () => {
      vi.mocked(clipboard.readText).mockReturnValue('saved text');
      const result = cm.saveAs({ filename: 'note.txt', format: 'txt' });
      expect(result.path).toContain('note.txt');
      expect(result.size).toBeGreaterThan(0);
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('saves PNG image to file', () => {
      const pngBuffer = Buffer.alloc(512);
      const mockImg = { isEmpty: () => false, toPNG: () => pngBuffer, toJPEG: () => pngBuffer };
      vi.mocked(clipboard.readImage).mockReturnValue(mockImg as any);

      const result = cm.saveAs({ filename: 'screenshot.png', format: 'png' });
      expect(result.path).toContain('screenshot.png');
      expect(result.size).toBe(512);
    });

    it('saves JPEG with quality parameter', () => {
      const jpgBuffer = Buffer.alloc(256);
      const mockImg = { isEmpty: () => false, toPNG: () => jpgBuffer, toJPEG: vi.fn().mockReturnValue(jpgBuffer) };
      vi.mocked(clipboard.readImage).mockReturnValue(mockImg as any);

      cm.saveAs({ filename: 'photo.jpg', format: 'jpg', quality: 75 });
      expect(mockImg.toJPEG).toHaveBeenCalledWith(75);
    });

    it('sanitizes filenames with path traversal via basename', () => {
      // path.basename strips directory components, so '../../../etc/passwd' becomes 'passwd'
      // This is the security mechanism — it saves to the fixed directory as just 'passwd'
      vi.mocked(clipboard.readText).mockReturnValue('text');
      const result = cm.saveAs({ filename: '../../../etc/passwd', format: 'txt' });
      expect(result.path).toContain('passwd');
      expect(result.path).not.toContain('..');
    });

    it('rejects hidden filenames starting with dot', () => {
      expect(() => cm.saveAs({ filename: '.hidden' })).toThrow('Invalid filename');
    });

    it('rejects empty filename', () => {
      expect(() => cm.saveAs({ filename: '' })).toThrow('Invalid filename');
    });

    it('creates save directory if it does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(clipboard.readText).mockReturnValue('text');

      cm.saveAs({ filename: 'test.txt', format: 'txt' });
      expect(fs.mkdirSync).toHaveBeenCalledWith(
        expect.stringContaining(path.join('Pictures', 'Zerant', 'clipboard')),
        { recursive: true }
      );
    });

    it('throws when saving text but clipboard has no text', () => {
      vi.mocked(clipboard.readText).mockReturnValue('');
      expect(() => cm.saveAs({ filename: 'empty.txt', format: 'txt' })).toThrow('No text on clipboard');
    });

    it('throws when saving image but clipboard has no image', () => {
      const emptyImg = { isEmpty: () => true, toPNG: () => Buffer.alloc(0) };
      vi.mocked(clipboard.readImage).mockReturnValue(emptyImg as any);
      expect(() => cm.saveAs({ filename: 'empty.png', format: 'png' })).toThrow('No image on clipboard');
    });

    it('auto-detects format from extension', () => {
      vi.mocked(clipboard.readText).mockReturnValue('auto text');
      const result = cm.saveAs({ filename: 'notes.txt' });
      expect(result.path).toContain('notes.txt');
    });
  });
});
