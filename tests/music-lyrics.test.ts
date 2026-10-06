import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LYRIC_LIMITS, readPlatformLyrics } from '@/lib/music/platforms/lyrics';
import type { Platform } from '@/lib/music/platforms/types';

const fixtures = vi.hoisted(() => ({ call: vi.fn(), qq: vi.fn() }));
vi.mock('@/lib/music/platforms/runtime', () => ({ platformCall: fixtures.call }));
vi.mock('@/lib/music/providers/radiohand-qq', () => ({ radiohandLyric: fixtures.qq }));
const globals = globalThis as typeof globalThis & { musicLyrics?: Map<string, { userId: string; bytes: number }> };
const signal = () => new AbortController().signal;
const sample = '[00:01.20]Fixture line one\n[00:03.50]Fixture line two';

beforeEach(() => { fixtures.call.mockReset(); fixtures.qq.mockReset(); globals.musicLyrics?.clear(); });
afterEach(() => { globals.musicLyrics?.clear(); vi.useRealTimers(); });

describe('playing-track lyric adapter', () => {
  it('uses the exact QQ song ID and preserves timestamps and newlines without forwarding extra upstream fields', async () => {
    fixtures.qq.mockResolvedValue({ provider: 'qq', lyric: '\uFEFF' + sample.replace('\n', '\r\n'), cookie: 'PRIVATE_DO_NOT_EXPOSE' });
    const result = await readPlatformLyrics('owner', 'qq', 'qqSong01', signal());
    expect(result).toEqual({ provider: 'qq', trackId: 'qqSong01', lyric: sample, available: true });
    expect(fixtures.qq).toHaveBeenCalledWith('qqSong01', expect.any(AbortSignal));
    expect(fixtures.call).not.toHaveBeenCalled();
  });

  it.each<[Platform, string]>([['netease', '123'], ['kugou', 'a'.repeat(32)], ['qishui', '123456789']])(
    'requests %s lyrics without login cookies or a title search', async (provider, id) => {
      fixtures.call.mockResolvedValue({ provider, trackId: id, lyric: sample });
      const result = await readPlatformLyrics('owner', provider, id, signal());
      expect(result.available).toBe(true);
      expect(fixtures.call).toHaveBeenCalledExactlyOnceWith(provider, 'lyrics', { id }, '', expect.any(AbortSignal));
    },
  );

  it('reports a Kugou mix-song ID without a recording hash as unavailable instead of choosing another song', async () => {
    const result = await readPlatformLyrics('owner', 'kugou', '12345', signal());
    expect(result).toMatchObject({ provider: 'kugou', trackId: '12345', lyric: '', available: false });
    expect(fixtures.call).not.toHaveBeenCalled();
  });

  it.each<[Platform, string]>([['qq', 'http://127.0.0.1/private'], ['qq', 'abc?token=x'], ['netease', 'name'], ['qishui', '-42'], ['kugou', 'a/b'], ['qq', 'x'.repeat(65)]])(
    'rejects a malformed %s ID before any provider call', async (provider, id) => {
      await expect(readPlatformLyrics('owner', provider, id, signal())).rejects.toMatchObject({ code: 'LYRIC_ID_INVALID' });
      expect(fixtures.call).not.toHaveBeenCalled(); expect(fixtures.qq).not.toHaveBeenCalled();
    },
  );

  it('isolates caches by account, source and track and never serves a different identity', async () => {
    fixtures.call.mockResolvedValue({ lyric: sample });
    const first = await readPlatformLyrics('one', 'netease', '1', signal());
    first.lyric = 'caller mutation';
    expect((await readPlatformLyrics('one', 'netease', '1', signal())).lyric).toBe(sample);
    await readPlatformLyrics('two', 'netease', '1', signal());
    await readPlatformLyrics('one', 'netease', '2', signal());
    await readPlatformLyrics('one', 'qishui', '1', signal());
    expect(fixtures.call).toHaveBeenCalledTimes(4);
    fixtures.call.mockResolvedValue({ trackId: 'another-song', lyric: sample });
    expect((await readPlatformLyrics('one', 'netease', '3', signal())).available).toBe(false);
    fixtures.call.mockResolvedValue({ provider: 'qq', lyric: sample });
    expect((await readPlatformLyrics('one', 'netease', '4', signal())).available).toBe(false);
  });

  it('expires successful and empty responses and keeps a bounded cache per user', async () => {
    vi.useFakeTimers();
    fixtures.call.mockResolvedValue({ lyric: sample });
    await readPlatformLyrics('one', 'netease', '1', signal());
    await vi.advanceTimersByTimeAsync(LYRIC_LIMITS.ttlMs + 1);
    await readPlatformLyrics('one', 'netease', '1', signal());
    expect(fixtures.call).toHaveBeenCalledTimes(2);
    fixtures.call.mockResolvedValue({ lyric: '' });
    await readPlatformLyrics('one', 'netease', '2', signal());
    await readPlatformLyrics('one', 'netease', '2', signal());
    expect(fixtures.call).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(LYRIC_LIMITS.unavailableTtlMs + 1);
    await readPlatformLyrics('one', 'netease', '2', signal());
    expect(fixtures.call).toHaveBeenCalledTimes(4);
    for (let id = 3; id <= LYRIC_LIMITS.entriesPerUser + 4; id++) await readPlatformLyrics('one', 'netease', String(id), signal());
    expect([...globals.musicLyrics!.values()].filter(item => item.userId === 'one')).toHaveLength(LYRIC_LIMITS.entriesPerUser);
  });

  it('bounds global cache memory and entry count', async () => {
    fixtures.call.mockResolvedValue({ lyric: sample });
    for (let index = 0; index < LYRIC_LIMITS.maxEntries + 4; index++) await readPlatformLyrics('user-' + index, 'netease', '1', signal());
    expect(globals.musicLyrics?.size).toBe(LYRIC_LIMITS.maxEntries);
    fixtures.call.mockResolvedValue({ lyric: '[00:01]' + 'x'.repeat(LYRIC_LIMITS.maxBytes - 7) });
    for (let index = 0; index < 34; index++) await readPlatformLyrics('large-' + index, 'netease', '1', signal());
    expect([...globals.musicLyrics!.values()].reduce((sum, value) => sum + value.bytes, 0)).toBeLessThanOrEqual(LYRIC_LIMITS.maxCacheBytes);
  });

  it('rejects oversized decoded UTF-8 lyrics and non-string payloads without truncating timestamps', async () => {
    fixtures.call.mockResolvedValue({ lyric: '[00:01]' + '字'.repeat(Math.ceil(LYRIC_LIMITS.maxBytes / 3)) });
    expect((await readPlatformLyrics('one', 'netease', '1', signal())).available).toBe(false);
    fixtures.call.mockResolvedValue({ lyric: { content: sample } });
    expect((await readPlatformLyrics('one', 'netease', '2', signal())).available).toBe(false);
  });

  it('does not cache an aborted or late response after switching tracks', async () => {
    let finish!: (value: unknown) => void;
    fixtures.call.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const controller = new AbortController();
    const pending = readPlatformLyrics('one', 'netease', '1', controller.signal);
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await assertion;
    finish({ lyric: sample });
    await Promise.resolve();
    expect(globals.musicLyrics?.size || 0).toBe(0);
    fixtures.call.mockResolvedValue({ lyric: sample });
    expect((await readPlatformLyrics('one', 'netease', '1', signal())).available).toBe(true);
    expect(fixtures.call).toHaveBeenCalledTimes(2);
  });

  it('returns a safe unavailable result on timeout or upstream errors without blocking music playback', async () => {
    vi.useFakeTimers();
    fixtures.call.mockImplementation(() => new Promise(() => {}));
    const request = readPlatformLyrics('owner', 'netease', '1', signal());
    await vi.advanceTimersByTimeAsync(LYRIC_LIMITS.timeoutMs);
    expect(await request).toMatchObject({ lyric: '', available: false });
    fixtures.call.mockRejectedValue(new Error('PRIVATE_DO_NOT_EXPOSE'));
    const failure = await readPlatformLyrics('owner', 'netease', '2', signal());
    expect(failure.available).toBe(false);
    expect(JSON.stringify(failure)).not.toContain('PRIVATE_DO_NOT_EXPOSE');
  });
});

describe('existing integration worker lyric dispatch', () => {
  it('calls installed lyric functions with the native ID and no account cookie, bounding IPC payloads', async () => {
    const netease = { lyric: vi.fn().mockResolvedValue({ body: { code: 200, lrc: { lyric: sample } } }) };
    const kugou = { handleKugouLyric: vi.fn().mockResolvedValue({ lyric: sample }) };
    const qishui = { handleQishuiLyric: vi.fn().mockResolvedValue({ lyric: sample }) };
    let message!: (value: object) => Promise<void>;
    const send = vi.fn();
    const source = readFileSync(new URL('../integrations/mineradio/worker.cjs', import.meta.url), 'utf8');
    vm.runInNewContext(source, {
      require: (id: string) => id === 'NeteaseCloudMusicApi' ? netease : id.endsWith('/kugou-api.js') ? kugou : id.endsWith('/qishui-api.js') ? qishui
        : id.endsWith('/track-decryptor.js') ? { TrackDecryptor: class {} } : {},
      process: { on: (event: string, handler: typeof message) => { if (event === 'message') message = handler; }, send, exit: vi.fn() },
      Buffer, console: { log() {}, warn() {}, error() {} },
    });
    await message({ id: 'request-1', provider: 'netease', action: 'lyrics', args: { id: '42' }, cookie: 'MUST_NOT_BE_FORWARDED' });
    expect(netease.lyric).toHaveBeenCalledExactlyOnceWith({ id: '42', timestamp: expect.any(Number) });
    expect(send).toHaveBeenLastCalledWith({ id: 'request-1', result: { provider: 'netease', trackId: '42', lyric: sample } });
    await message({ id: 'request-2', provider: 'kugou', action: 'lyrics', args: { id: 'a'.repeat(32) }, cookie: 'MUST_NOT_BE_FORWARDED' });
    expect(kugou.handleKugouLyric).toHaveBeenCalledExactlyOnceWith('a'.repeat(32), '', 0);
    await message({ id: 'request-3', provider: 'qishui', action: 'lyrics', args: { id: '42' }, cookie: 'MUST_NOT_BE_FORWARDED' });
    expect(qishui.handleQishuiLyric).toHaveBeenCalledExactlyOnceWith('42', '');
    qishui.handleQishuiLyric.mockResolvedValue({ lyric: 'x'.repeat(LYRIC_LIMITS.maxBytes + 1) });
    await message({ id: 'request-4', provider: 'qishui', action: 'lyrics', args: { id: '43' } });
    expect(send).toHaveBeenLastCalledWith({ id: 'request-4', result: { provider: 'qishui', trackId: '43', lyric: '' } });
  });
});
