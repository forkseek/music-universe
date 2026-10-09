import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

// Real provider metadata and image bytes, no substituted API/audio responses.
// Run against a deployed site: node scripts/verify-album-covers.mjs
const origin = process.env.MUSIC_TEST_ORIGIN || 'https://music-universe-forkseek.netlify.app';
const output = 'test-results/album-cover-cache.json';
mkdirSync('test-results', { recursive: true });
let cookie = '', sequence = 0;
const worker = fork('integrations/mineradio/worker.cjs', [], { windowsHide: true, execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
const pending = new Map();
worker.on('message', value => {
  const job = pending.get(value.id);
  if (!job) return;
  pending.delete(value.id); clearTimeout(job.timer);
  if (value.error) job.reject(new Error('Platform metadata failed'));
  else job.resolve(value.result);
});
function nativeAlbum(id) {
  return new Promise((resolve, reject) => {
    const requestId = String(++sequence);
    const timer = setTimeout(() => { pending.delete(requestId); worker.send({ cancel: requestId }); reject(new Error('Metadata deadline')); }, 25000);
    pending.set(requestId, { resolve, reject, timer });
    worker.send({ id: requestId, provider: 'netease', action: 'album', args: { albumId: id }, cookie: '' });
  });
}
async function request(path, body) {
  const url = path.startsWith('https://') ? path : origin + path;
  const sameOrigin = new URL(url).origin === new URL(origin).origin;
  const began = performance.now();
  const response = await fetch(url, { method: body === undefined ? 'GET' : 'POST',
    headers: { ...(sameOrigin ? { Origin: origin, 'X-Music-World': '1', ...(cookie ? { Cookie: cookie } : {}) } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(45000) });
  if (sameOrigin && response.headers.getSetCookie().length) cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const bytes = Buffer.from(await response.arrayBuffer());
  const json = response.headers.get('content-type')?.includes('json') ? JSON.parse(bytes.toString()) : null;
  return { response, json, image: { status: response.status, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
    cache: response.headers.get('cache-status'), vary: response.headers.get('netlify-vary'), coverId: response.headers.get('x-album-cover-id'),
    cacheControl: response.headers.get('cache-control'), ms: Math.round(performance.now() - began) } };
}
const report = { origin, checkedAt: new Date().toISOString(), albums: [], passed: false };
function save() { writeFileSync(output, JSON.stringify(report, null, 2)); }
try {
  assert.equal((await request('/api/music/session')).response.status, 200);
  for (const identity of [
    { provider: 'netease', trackId: '66842', albumId: '6548', title: '十年', artist: '陈奕迅', album: '黑白灰' },
    { provider: 'netease', trackId: '1465114419', albumId: '92895788', title: 'cardigan', artist: 'Taylor Swift', album: 'folklore (deluxe version)' },
  ]) {
    const raw = await nativeAlbum(identity.albumId);
    const resolved = await request('/api/music/album', identity);
    assert.equal(resolved.response.status, 200); assert.equal(resolved.json.album.id, identity.albumId);
    const path = resolved.json.album.cover;
    assert.equal(path, `/api/music/album/cover/v2/netease/${identity.albumId}`);
    assert(resolved.json.album.tracks.every(track => track.cover === path));
    const original = await request(raw.cover.replace(/^http:/, 'https:'));
    assert.equal(original.response.status, 200);
    const current = await request(path), warm = await request(path);
    const legacy = await request(`/api/music/album/cover?provider=netease&id=${identity.albumId}`);
    const item = { id: identity.albumId, album: raw.name, trackIndex: resolved.json.trackIndex, path,
      original: original.image, current: current.image, warm: warm.image, legacy: legacy.image, originalBytesMatched: false };
    report.albums.push(item); save();
    for (const result of [current, warm, legacy]) {
      assert.equal(result.response.status, 200);
      assert.equal(result.image.sha256, original.image.sha256, `Wrong image bytes for ${identity.albumId}`);
      assert.equal(result.image.coverId, identity.albumId);
      if (result.image.vary) assert.match(result.image.vary, /query=[^,]*provider[^,]*id/);
    }
    item.originalBytesMatched = true; save(); console.log(JSON.stringify(item));
  }
  assert.notEqual(report.albums[0].original.sha256, report.albums[1].original.sha256);
  const invalid = await request('/api/music/album/cover?provider=invalid&id=6548');
  assert.equal(invalid.response.status, 400); assert.equal(invalid.image.cacheControl, 'no-store');
  const invalidPath = await request('/api/music/album/cover/v2/invalid/6548');
  assert.equal(invalidPath.response.status, 400); assert.equal(invalidPath.image.cacheControl, 'no-store');
  report.invalidIdentity = { legacyStatus: invalid.response.status, pathStatus: invalidPath.response.status, errorsNotCached: true };
  report.passed = true; save(); console.log(JSON.stringify({ passed: true, distinctAlbums: report.albums.length, sourceBytesMatched: true, invalidIdentity: report.invalidIdentity }));
} catch (error) {
  report.error = { name: error.name, message: error.message.replace(/https?:\/\/[^\s]+/g, '[url]') };
  save(); console.error(JSON.stringify(report.error)); process.exitCode = 1;
} finally {
  for (const job of pending.values()) clearTimeout(job.timer);
  worker.kill();
}
