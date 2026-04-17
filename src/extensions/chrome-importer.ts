import path from 'path';
import fs from 'fs';
import os from 'os';
import { zerantDir } from '../utils/paths';
import { createLogger } from '../utils/logger';
import { assertChromeExtensionId, assertSinglePathSegment, resolvePathWithinRoot } from '../utils/security';

const log = createLogger('ChromeImporter');

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChromeExtensionInfo {
  id: string;
  name: string;
  version: string;
  chromePath: string;
}

export interface ImportResult {
  id: string;
  name: string;
  success: boolean;
  skipped?: boolean;
  error?: string;
}

export interface BulkImportResult {
  imported: number;
  skipped: number;
  failed: number;
  details: ImportResult[];
}

interface ZerantMeta {
  source: 'chrome-import';
  importedAt: string;
  cwsId: string;
  importedVersion: string;
}

// ─── Chrome Extension Importer ───────────────────────────────────────────────

/**
 * ChromeExtensionImporter — Detects Chrome's extension directory
 * and imports extensions into ~/.zerant/extensions/.
 *
 * Chrome stores extensions in:
 *   macOS:   ~/Library/Application Support/Google/Chrome/{Profile}/Extensions/
 *   Windows: %LOCALAPPDATA%\Google\Chrome\User Data\{Profile}\Extensions\
 *   Linux:   ~/.config/google-chrome/{Profile}/Extensions/
 *
 * Each extension folder contains version subfolders (e.g. "1.57.0_0").
 * We find the latest version and copy from there.
 */
export class ChromeExtensionImporter {
  private profile: string;
  private zerantExtensionsDir: string;

  constructor(profile: string = 'Default') {
    this.profile = assertSinglePathSegment(profile, 'Chrome profile');
    this.zerantExtensionsDir = zerantDir('extensions');
  }

  /**
   * Get the Chrome extensions directory path for the current platform.
   * Returns null if Chrome is not installed.
   */
  getChromeExtensionsDir(): string | null {
    const platform = process.platform;
    let chromeDir: string;

    if (platform === 'darwin') {
      chromeDir = path.join(
        os.homedir(),
        'Library', 'Application Support', 'Google', 'Chrome',
        this.profile, 'Extensions'
      );
    } else if (platform === 'win32') {
      const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
      chromeDir = path.join(
        localAppData,
        'Google', 'Chrome', 'User Data',
        this.profile, 'Extensions'
      );
    } else {
      // Linux
      chromeDir = path.join(
        os.homedir(),
        '.config', 'google-chrome',
        this.profile, 'Extensions'
      );
    }

    if (!fs.existsSync(chromeDir)) {
      return null;
    }

    return chromeDir;
  }

  /**
   * List all Chrome extensions that can be imported.
   * Filters out internal Chrome extensions (names starting with __MSG_ or missing).
   */
  listChromeExtensions(): ChromeExtensionInfo[] {
    const chromeDir = this.getChromeExtensionsDir();
    if (!chromeDir) {
      return [];
    }

    const results: ChromeExtensionInfo[] = [];

    try {
      const extDirs = fs.readdirSync(chromeDir, { withFileTypes: true })
        .filter(d => d.isDirectory());

      for (const dir of extDirs) {
        // Extension IDs are 32 lowercase a-p characters
        if (!/^[a-p]{32}$/.test(dir.name)) {
          continue;
        }

        const extId = assertChromeExtensionId(dir.name);
        const extPath = resolvePathWithinRoot(chromeDir, extId);
        const versionDir = this.findLatestVersionDir(extPath);
        if (!versionDir) {
          continue;
        }

        const manifestPath = resolvePathWithinRoot(versionDir, 'manifest.json');
        if (!fs.existsSync(manifestPath)) {
          continue;
        }

        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          const name = manifest.name;

          // Filter out Chrome internal extensions
          if (!name || typeof name !== 'string' || name.startsWith('__MSG_')) {
            continue;
          }

          results.push({
            id: extId,
            name,
            version: manifest.version || '0.0.0',
            chromePath: versionDir,
          });
        } catch {
          // Skip extensions with unreadable manifests
          continue;
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log.warn(`⚠️ Could not read Chrome extensions directory: ${message}`);
    }

    return results;
  }

  /**
   * Import a single Chrome extension into ~/.zerant/extensions/.
   * Skips if already imported. Writes .zerant-meta.json with CWS ID.
   */
  importExtension(extensionId: string): ImportResult {
    // Validate extension ID format
    if (!/^[a-p]{32}$/.test(extensionId)) {
      return { id: extensionId, name: extensionId, success: false, error: 'Invalid extension ID format' };
    }

    const safeExtensionId = assertChromeExtensionId(extensionId);

    // Find the extension in Chrome
    const extensions = this.listChromeExtensions();
    const ext = extensions.find(e => e.id === safeExtensionId);
    if (!ext) {
      return { id: safeExtensionId, name: safeExtensionId, success: false, error: 'Extension not found in Chrome profile' };
    }

    return this.importExtensionFromInfo(ext);
  }

  /**
   * Import all Chrome extensions into ~/.zerant/extensions/.
   * Skips already-imported extensions.
   */
  importAll(): BulkImportResult {
    const extensions = this.listChromeExtensions();
    const result: BulkImportResult = {
      imported: 0,
      skipped: 0,
      failed: 0,
      details: [],
    };

    for (const ext of extensions) {
      const importResult = this.importExtensionFromInfo(ext);
      result.details.push(importResult);

      if (importResult.skipped) {
        result.skipped++;
      } else if (importResult.success) {
        result.imported++;
      } else {
        result.failed++;
      }
    }

    return result;
  }

  /**
   * Check if an extension is already imported in Zerant.
   */
  isAlreadyImported(extensionId: string): boolean {
    const safeExtensionId = assertChromeExtensionId(extensionId);
    const destPath = resolvePathWithinRoot(this.zerantExtensionsDir, safeExtensionId);
    return fs.existsSync(destPath) && fs.existsSync(resolvePathWithinRoot(destPath, 'manifest.json'));
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  /**
   * Import a single extension from its ChromeExtensionInfo.
   */
  private importExtensionFromInfo(ext: ChromeExtensionInfo): ImportResult {
    const chromeDir = this.getChromeExtensionsDir();
    if (!chromeDir) {
      return { id: ext.id, name: ext.name, success: false, error: 'Chrome extensions directory not found' };
    }

    // Check if already imported
    if (this.isAlreadyImported(ext.id)) {
      return { id: ext.id, name: ext.name, success: true, skipped: true };
    }

    const safeExtensionId = assertChromeExtensionId(ext.id);
    const versionName = assertSinglePathSegment(path.basename(ext.chromePath), 'extension version');
    const safeChromePath = resolvePathWithinRoot(chromeDir, safeExtensionId, versionName);
    const destPath = resolvePathWithinRoot(this.zerantExtensionsDir, safeExtensionId);

    try {
      // Ensure Zerant extensions directory exists
      if (!fs.existsSync(this.zerantExtensionsDir)) {
        fs.mkdirSync(this.zerantExtensionsDir, { recursive: true });
      }

      // Copy the Chrome extension version folder to Zerant
      fs.cpSync(safeChromePath, destPath, { recursive: true });

      // Verify manifest.json exists after copy
      const manifestPath = resolvePathWithinRoot(destPath, 'manifest.json');
      if (!fs.existsSync(manifestPath)) {
        // Clean up failed copy
        fs.rmSync(destPath, { recursive: true, force: true });
        return { id: ext.id, name: ext.name, success: false, error: 'manifest.json missing after copy' };
      }

      // Check for key field in manifest
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        if (!manifest.key) {
          log.warn(`⚠️ Chrome import: ${ext.name} (${ext.id}) manifest lacks "key" field — Electron may assign a different ID`);
        }
      } catch {
        // Non-fatal: manifest already verified during listing
      }

      // Write .zerant-meta.json with import metadata
      const meta: ZerantMeta = {
        source: 'chrome-import',
        importedAt: new Date().toISOString(),
        cwsId: ext.id,
        importedVersion: ext.version,
      };
      fs.writeFileSync(
        resolvePathWithinRoot(destPath, '.zerant-meta.json'),
        JSON.stringify(meta, null, 2),
        'utf-8'
      );

      log.info(`🧩 Chrome import: ${ext.name} (${ext.id}) v${ext.version} → ${destPath}`);
      return { id: ext.id, name: ext.name, success: true };

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // Clean up partial copy on failure
      if (fs.existsSync(destPath)) {
        try { fs.rmSync(destPath, { recursive: true, force: true }); } catch { /* ignore cleanup errors */ }
      }
      return { id: ext.id, name: ext.name, success: false, error: message };
    }
  }

  /**
   * Find the latest version subdirectory in a Chrome extension folder.
   * Chrome stores versions as folders like "1.57.0_0", "1.58.1_0".
   * We sort them and return the last one.
   */
  private findLatestVersionDir(extPath: string): string | null {
    try {
      const dirs = fs.readdirSync(extPath, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)
        .sort();

      if (dirs.length === 0) return null;

      // Take the last (highest version) directory
      const latest = assertSinglePathSegment(dirs[dirs.length - 1], 'extension version');
      return resolvePathWithinRoot(extPath, latest);
    } catch {
      return null;
    }
  }
}
