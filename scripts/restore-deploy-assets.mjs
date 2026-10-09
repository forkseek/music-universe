import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// Source-ZIP releases can restore large, unchanged media from our public repository.
// Ordinary checkouts contain these files and require no manifest or network access.
const manifestPath = process.argv[2] || '.deploy-asset-manifest.json';
if (existsSync(manifestPath)) {
  const root = process.cwd();
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''));
  assert.equal(manifest.repository, 'forkseek/music-universe');
  assert.match(manifest.commit, /^[a-f0-9]{40}$/);
  assert(Array.isArray(manifest.assets) && manifest.assets.length > 0 && manifest.assets.length <= 10000);
  const assets = manifest.assets.map(asset => {
    assert(typeof asset.path === 'string' && /^public\/(?:audio|media)\//.test(asset.path));
    assert(!asset.path.includes('\\') && asset.path.split('/').every(part => part && part !== '.' && part !== '..'));
    assert.match(asset.sha256, /^[a-f0-9]{64}$/);
    const target = path.resolve(root, asset.path);
    assert(target.startsWith(root + path.sep));
    return { ...asset, target };
  });
  async function valid(asset) {
    if (!existsSync(asset.target)) return false;
    assert(lstatSync(asset.target).isFile(), 'Media must be a regular file');
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(asset.target)) hash.update(chunk);
    return hash.digest('hex') === asset.sha256;
  }
  const missing = [];
  for (const asset of assets) if (!await valid(asset)) missing.push(asset);
  if (missing.length) {
    const workRoot = path.join(root, 'work', 'netlify-assets'); mkdirSync(workRoot, { recursive: true });
    const temporary = mkdtempSync(path.join(workRoot, 'restore-'));
    assert(path.resolve(temporary).startsWith(path.resolve(workRoot) + path.sep));
    try {
      const archive = path.join(temporary, 'source.tar.gz');
      const response = await fetch(`https://codeload.github.com/${manifest.repository}/tar.gz/${manifest.commit}`, { signal: AbortSignal.timeout(300000), redirect: 'error' });
      assert(response.ok && response.body, `Source archive unavailable: ${response.status}`);
      let bytes = 0;
      async function* bounded(source) {
        for await (const chunk of source) { bytes += chunk.length; assert(bytes <= 512 * 1024 * 1024, 'Source archive too large'); yield chunk; }
      }
      await pipeline(Readable.from(bounded(response.body)), createWriteStream(archive));
      const prefix = `music-universe-${manifest.commit}/`;
      execFileSync('tar', ['-xzf', archive, '--strip-components=1', '-C', root, '--', ...missing.map(asset => prefix + asset.path)], { stdio: 'ignore', timeout: 120000 });
      console.log(`Restored ${missing.length} pinned media assets from source commit ${manifest.commit.slice(0, 8)}.`);
    } finally {
      const checked = path.resolve(temporary);
      assert(checked.startsWith(path.resolve(workRoot) + path.sep));
      rmSync(checked, { recursive: true, force: true });
    }
  }
  for (const asset of assets) assert(await valid(asset), `Media checksum mismatch: ${asset.path}`);
  console.log(`Verified ${assets.length} media asset SHA-256 checksums.`);
}
