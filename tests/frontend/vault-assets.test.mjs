import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { clearVaultAssetsCache, getVaultAssets } from '../../frontend/src/lib/vault-assets.mjs';

test('getVaultAssets reads dynamic VAULT_ASSETS_DIR manifest and directory fallback cleanly', () => {
  const prevEnv = process.env.VAULT_ASSETS_DIR;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-assets-test-'));

  try {
    // Without env var: returns static baked manifest array
    delete process.env.VAULT_ASSETS_DIR;
    clearVaultAssetsCache();
    const fallbackAssets = getVaultAssets();
    assert.ok(Array.isArray(fallbackAssets));
    assert.ok(fallbackAssets.length >= 1);

    // Dynamic directory without manifest.json: scans visible files & hides dotfiles
    fs.mkdirSync(path.join(tmpDir, 'book1', 'media'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'book1', 'media', 'theorem.png'), 'png');
    fs.writeFileSync(path.join(tmpDir, 'book1', 'media', '.secret.png'), 'hidden');
    process.env.VAULT_ASSETS_DIR = tmpDir;
    clearVaultAssetsCache();
    const scanned = getVaultAssets();
    assert.ok(scanned.includes('vault/book1/media/theorem.png'));
    assert.ok(!scanned.some((entry) => entry.includes('.secret.png')));

    // Explicit manifest.json takes precedence and invalidates cache when updated
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify(['vault/book1/media/custom.ggb'])
    );
    clearVaultAssetsCache();
    const fromManifest = getVaultAssets();
    assert.ok(fromManifest.includes('vault/book1/media/custom.ggb'));
  } finally {
    if (prevEnv === undefined) {
      delete process.env.VAULT_ASSETS_DIR;
    } else {
      process.env.VAULT_ASSETS_DIR = prevEnv;
    }
    clearVaultAssetsCache();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
