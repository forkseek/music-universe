import assert from 'node:assert/strict';
import { fork, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { chromium } from '@playwright/test';

// Entirely isolated fixtures. This proves runtime mechanics, not third-party account rights.
const root = process.cwd(), standalone = path.join(root, '.next/standalone');
assert.ok(existsSync(path.join(standalone, 'server.js')), 'Run the production build first.');
const results = path.join(root, 'test-results');
mkdirSync(results, { recursive: true });
const temporary = mkdtempSync(path.join(results, 'cloud-runtime-'));
const fixture = path.join(temporary, 'fixture');
mkdirSync(fixture);
const children = [];
let database, postgres, browser;
const reservePort = async () => {
  const socket = createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve)); return port;
};
try {
  // Exercise the real traced worker before substituting deterministic platform responses.
  const worker = fork(path.join(standalone, 'integrations/mineradio/worker.cjs'), [], { cwd: standalone,
    execArgv: [], stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Packaged worker timed out')), 12000);
      worker.once('error', reject);
      worker.once('message', message => { clearTimeout(timer); if (message.error) reject(new Error('Packaged worker failed')); else resolve(message.result); });
      worker.send({ id: 'fixture', provider: 'netease', action: 'status', args: {}, cookie: '' });
    });
  } finally { worker.kill(); }
  console.log('Packaged platform worker dependencies loaded.');

  cpSync(path.join(root, 'public'), path.join(standalone, 'public'), { recursive: true });
  cpSync(path.join(root, '.next/static'), path.join(standalone, '.next/static'), { recursive: true });
  // 26 MB, 70-second PCM fixture exceeds the host's per-response limit.
  const sampleRate = 96000, frames = sampleRate * 70, wave = Buffer.alloc(44 + frames * 4);
  wave.write('RIFF'); wave.writeUInt32LE(wave.length - 8, 4); wave.write('WAVEfmt ', 8);
  wave.writeUInt32LE(16, 16); wave.writeUInt16LE(1, 20); wave.writeUInt16LE(2, 22);
  wave.writeUInt32LE(sampleRate, 24); wave.writeUInt32LE(sampleRate * 4, 28); wave.writeUInt16LE(4, 32); wave.writeUInt16LE(16, 34);
  wave.write('data', 36); wave.writeUInt32LE(wave.length - 44, 40);
  for (let i = 0; i < frames; i++) { const value = Math.round(Math.sin(i * Math.PI * 2 * 220 / sampleRate) * 3000); wave.writeInt16LE(value, 44 + i * 4); wave.writeInt16LE(value, 46 + i * 4); }
  const wavePath = path.join(fixture, 'tone.wav'); writeFileSync(wavePath, wave);
  const hook = path.join(fixture, 'fetch-hook.mjs');
  writeFileSync(hook, `import { readFileSync } from 'node:fs';
const nativeFetch = globalThis.fetch, wave = readFileSync(${JSON.stringify(wavePath)});
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input instanceof Request ? input.url : input));
  if (url.hostname !== 'm801.music.126.net' || url.pathname !== '/cloud-runtime-fixture.wav') return nativeFetch(input, init);
  const range = new Headers(init?.headers).get('range'), match = range && /^bytes=(\\d+)-(\\d*)$/.exec(range);
  const start = match ? Number(match[1]) : 0, end = match?.[2] ? Math.min(wave.length - 1, Number(match[2])) : wave.length - 1;
  const headers = { 'Content-Type': 'audio/wav', 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' };
  if (match) headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + wave.length;
  return new Response(new Uint8Array(wave.subarray(start, end + 1)), { status: match ? 206 : 200, headers });
};`);
  writeFileSync(path.join(fixture, 'worker.cjs'), `process.on('message', m => {
    const result = m.action === 'qr' ? { key: 'fixture-qr-key', image: 'data:image/png;base64,fixture' }
      : m.action === 'poll' ? { code: 803, cookie: 'MUSIC_U=fixture-private-cookie' }
      : m.action === 'status' ? { loggedIn: true, userId: '123456', nickname: 'Fixture Listener' }
      : m.action === 'search' ? { songs: [{ id: '123', name: 'Fixture Tone', artist: 'Fixture', duration: 70000 }] }
      : { playable: true, url: 'https://m801.music.126.net/cloud-runtime-fixture.wav' };
    process.send({ id: m.id, result });
  }); process.on('disconnect', () => process.exit(0));`);
  database = await PGlite.create(path.join(temporary, 'postgres'));
  postgres = new PGLiteSocketServer({ db: database, host: '127.0.0.1', port: 0, maxConnections: 6 });
  await postgres.start();
  const databaseUrl = `postgresql://postgres:postgres@${postgres.getServerConn()}/postgres`;
  const secret = randomBytes(32).toString('base64url');
  async function start() {
    const port = await reservePort(), origin = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, ['--import', pathToFileURL(hook).href, path.join(standalone, 'server.js')], {
      cwd: standalone, windowsHide: true, stdio: 'pipe', env: { ...process.env, NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: String(port),
        DATABASE_URL: databaseUrl, MUSIC_CREDENTIAL_SECRET: secret, MUSIC_DESKTOP_LOGIN: '0', MUSIC_AUDIO_RESPONSE_BYTES: String(4 * 1024 * 1024),
        MUSIC_INTEGRATION_ROOT: fixture, MUSIC_MIGRATIONS_ROOT: path.join(root, 'src/db/postgres-migrations'), APP_ORIGIN: origin, NEXT_TELEMETRY_DISABLED: '1' },
    });
    children.push(child); child.stdout.resume(); child.stderr.resume();
    for (let i = 0; i < 50; i++) {
      if (child.exitCode !== null) throw new Error('Test server exited early.');
      try { if ((await fetch(origin + '/api/health', { signal: AbortSignal.timeout(1000) })).ok) return { child, origin }; } catch { /* Starting. */ }
      await delay(200);
    }
    throw new Error('Test server health did not become ready.');
  }
  const a = await start(), b = await start();
  let cookie;
  async function api(server, route, body, status = 200, suppliedCookie = cookie) {
    const response = await fetch(server.origin + route, { method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(12000),
      headers: { 'X-Music-World': '1', Origin: server.origin, ...(suppliedCookie ? { Cookie: suppliedCookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!cookie) cookie = response.headers.get('set-cookie')?.split(';')[0];
    assert.equal(response.status, status, route + ' status'); return response.json();
  }
  await api(a, '/api/music/session'); assert.ok(cookie);
  const qr = await api(a, '/api/music/netease/login', {});
  assert.equal((await api(b, '/api/music/netease/poll?id=' + qr.loginId)).status, 'success');
  const found = await api(a, '/api/music/netease/search?q=Fixture');
  const playback = await api(b, '/api/music/netease/play', { playbackId: found.songs[0].playbackId });
  assert.equal(playback.playable, true);
  const first = await fetch(a.origin + playback.url, { headers: { Cookie: cookie, Range: 'bytes=0-' } });
  assert.equal(first.status, 206); assert.equal((await first.arrayBuffer()).byteLength, 4 * 1024 * 1024);
  assert.match(first.headers.get('content-range'), /^bytes 0-4194303\/26880044$/);
  const tooLarge = await fetch(a.origin + playback.url, { headers: { Cookie: cookie } });
  assert.equal(tooLarge.status, 413); await tooLarge.arrayBuffer();
  const seek = await fetch(a.origin + playback.url, { headers: { Cookie: cookie, Range: 'bytes=20000000-20001000' } });
  assert.equal(seek.status, 206); assert.equal((await seek.arrayBuffer()).byteLength, 1001);
  console.log('Two independent production instances share QR, catalogue and ranged audio state.');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const equal = cookie.indexOf('=');
  await context.addCookies([{ name: cookie.slice(0, equal), value: cookie.slice(equal + 1), domain: '127.0.0.1', path: '/' }]);
  const page = await context.newPage(), responseLengths = [], requestedRanges = [];
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/music/audio') requestedRanges.push(request.headers().range || 'none'); });
  page.on('response', response => {
    if (new URL(response.url()).pathname === '/api/music/audio') responseLengths.push(Number(response.headers()['content-length']));
  });
  await page.goto(b.origin + '/#hall');
  const native = await page.evaluate(async source => {
    const audio = new Audio(); audio.muted = true; audio.defaultPlaybackRate = 16;
    audio.onloadedmetadata = () => { audio.playbackRate = 16; }; audio.src = source;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { audio.pause(); reject(new Error('Native segmented playback timed out: ' + JSON.stringify({time:audio.currentTime,duration:audio.duration,rate:audio.playbackRate,ready:audio.readyState,network:audio.networkState,buffered:Array.from({length:audio.buffered.length},(_,i)=>[audio.buffered.start(i),audio.buffered.end(i)])}))); }, 20000);
      audio.onended = () => { clearTimeout(timer); resolve(); };
      audio.onerror = () => { clearTimeout(timer); reject(new Error('Native audio error ' + audio.error?.code)); };
      audio.play().catch(reject);
    });
    return { ended: audio.ended, duration: audio.duration, time: audio.currentTime };
  }, playback.url).catch(error => { console.log(JSON.stringify({responseLengths,requestedRanges})); throw error; });
  assert.equal(native.ended, true); assert.ok(native.time >= 69.9);
  assert.ok(responseLengths.length >= 2); assert.ok(responseLengths.every(length => length > 0 && length <= 4 * 1024 * 1024));
  await browser.close(); browser = undefined;
  await api(b, '/api/music/netease/logout', {});
  const revoked = await fetch(a.origin + playback.url, { headers: { Cookie: cookie, Range: 'bytes=0-2' } });
  assert.equal(revoked.status, 404); await revoked.arrayBuffer();
  const proof = { checkedAt: new Date().toISOString(), independentProductionProcesses: 2, realPackagedWorkerLoaded: true,
    qrLoginAcrossProcesses: true, searchToPlayAcrossProcesses: true, encryptedSharedState: true, logoutRevokesAcrossProcesses: true,
    nativeBrowserPlaybackEnded: native.ended, audioFixtureBytes: wave.length, audioFixtureDuration: native.duration, nativeRangeRequests: responseLengths.length,
    eachAudioResponseAtMost4MiB: true, seeking: true, oversizedUnsegmentedRequestRejected: true,
    dataSource: 'Generated tone and explicit platform fixtures; isolated PGlite PostgreSQL wire server. Not real platform authorization.' };
  writeFileSync(path.join(results, 'cloud-runtime-proof.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 2));
  if (process.argv.includes('--browser')) {
    const { verifyDeploymentBrowser } = await import('./verify-deployment-browser.mjs');
    await verifyDeploymentBrowser(a.origin);
  }
} catch (error) { console.error(error); process.exitCode = 1; }
finally {
  await browser?.close();
  await Promise.all(children.map(async child => { if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; } }));
  if (postgres) await Promise.race([postgres.stop(), delay(2000)]);
  await database?.close();
  const resolved = path.resolve(temporary);
  if (path.dirname(resolved) === path.resolve(results) && path.basename(resolved).startsWith('cloud-runtime-')) rmSync(resolved, { recursive: true, force: true });
}
