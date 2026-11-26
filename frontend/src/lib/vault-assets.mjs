import fs from 'node:fs';
import path from 'node:path';
import staticVaultAssets from './vault-assets.json' with { type: 'json' };

/** @type {{ dir: string; manifestExists: boolean; mtimeMs: number; assets: string[] } | null} */
let cache = null;

export function clearVaultAssetsCache() {
  cache = null;
}

/**
 * Recursively list visible non-symlink asset paths relative to baseDir as "vault/..." entries.
 * @param {string} baseDir
 * @param {string} [currentDir]
 * @param {string[]} [acc]
 * @returns {string[]}
 */
function scanVaultDirectory(baseDir, currentDir = baseDir, acc = []) {
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
    const full = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      scanVaultDirectory(baseDir, full, acc);
    } else if (entry.isFile() && full !== path.join(baseDir, 'manifest.json')) {
      const rel = path.relative(baseDir, full).split(path.sep).join('/');
      acc.push(`vault/${rel}`);
    }
  }
  return acc;
}

/** @returns {string[]} */
export function getVaultAssets() {
  const dir = (process.env.VAULT_ASSETS_DIR || '').trim();
  if (!dir) return staticVaultAssets;

  try {
    const manifestPath = path.join(dir, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      const stat = fs.statSync(manifestPath);
      if (cache && cache.dir === dir && cache.manifestExists && cache.mtimeMs === stat.mtimeMs) {
        return cache.assets;
      }
      const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const dynamicList = Array.isArray(parsed)
        ? parsed.filter((entry) => typeof entry === 'string' && entry.length > 0)
        : [];
      const merged = [...new Set([...staticVaultAssets, ...dynamicList])].sort();
      cache = { dir, manifestExists: true, mtimeMs: stat.mtimeMs, assets: merged };
      return merged;
    }

    if (fs.existsSync(dir)) {
      const stat = fs.statSync(dir);
      if (cache && cache.dir === dir && !cache.manifestExists && cache.mtimeMs === stat.mtimeMs) {
        return cache.assets;
      }
      const scanned = scanVaultDirectory(dir);
      const merged = [...new Set([...staticVaultAssets, ...scanned])].sort();
      cache = { dir, manifestExists: false, mtimeMs: stat.mtimeMs, assets: merged };
      return merged;
    }
  } catch {
    // Fall back safely to baked static manifest when external dir is temporarily inaccessible.
  }

  return staticVaultAssets;
}
