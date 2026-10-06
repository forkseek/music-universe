'use strict';
// Private IPC only. Never forward upstream errors (which can include cookies).
const netease = require('NeteaseCloudMusicApi');
const kugou = require('./vendor/kugou-api.js');
const qishui = require('./vendor/qishui-api.js');
const { TrackDecryptor } = require('./vendor/qishui-audio-decryptor/track-decryptor.js');
const QRCode = require('qrcode');
const decode = new TrackDecryptor();
console.log = console.warn = console.error = () => {};

function lyricResult(provider, id, value) {
  const lyric = typeof value === 'string' && value.length <= 512 * 1024 && Buffer.byteLength(value, 'utf8') <= 512 * 1024 ? value : '';
  return { provider, trackId: String(id), lyric };
}

async function invoke(provider, action, args, cookie) {
  if (action === 'decode' && provider === 'qishui') {
    const result = decode.decrypt({ encryptedBuffer: Buffer.from(args.buffer), spadeA: args.auth });
    return { buffer: result.buffer, contentType: result.extension === '.flac' ? 'audio/flac' : 'audio/mp4' };
  }
  if (provider === 'netease') {
    const options = { cookie: cookie || '', timestamp: Date.now() };
    if (action === 'lyrics') {
      const response = await netease.lyric({ id: args.id, timestamp: Date.now() });
      if (response.body.code !== 200) throw new Error('lyrics');
      return lyricResult(provider, args.id, response.body.lrc?.lyric);
    }
    if (action === 'search') {
      let response = await netease.cloudsearch({ ...options, keywords: args.query, limit: args.limit, offset: args.offset, type: 1 });
      if (response.body.code !== 200) response = await netease.search({ ...options, keywords: args.query, limit: args.limit, offset: args.offset, type: 1 });
      if (response.body.code !== 200) throw new Error('search');
      return { songs: (response.body.result?.songs || []).map(s => ({
        id: String(s.id), name: s.name, artist: (s.ar || s.artists || []).map(a => a.name).join(' / '),
        album: (s.al || s.album)?.name || '', albumId: String((s.al || s.album)?.id || ''), cover: (s.al || s.album)?.picUrl || '',
        duration: s.dt || s.duration || 0, fee: s.fee || 0,
      })), total: response.body.result?.songCount };
    }
    if (action === 'album') {
      let albumId = args.albumId;
      if (!albumId) {
        const detail = await netease.song_detail({ ...options, ids: String(args.trackId) });
        albumId = detail.body.songs?.[0]?.al?.id;
      }
      if (!/^\d+$/.test(String(albumId))) throw new Error('album');
      const response = await netease.album({ ...options, id: String(albumId) });
      const album = response.body.album;
      if (response.body.code !== 200 || !album || !Array.isArray(response.body.songs)) throw new Error('album');
      return { id: String(album.id), name: album.name, artist: (album.artists || [album.artist]).filter(Boolean).map(a => a.name).join(' / '),
        cover: album.picUrl, year: album.publishTime ? new Date(album.publishTime).getUTCFullYear() : undefined,
        total: album.size || response.body.songs.length,
        tracks: response.body.songs.map(s => ({ id: String(s.id), albumId: String(album.id), album: album.name, cover: album.picUrl,
          name: s.name, artist: (s.ar || s.artists || []).map(a => a.name).join(' / '), duration: s.dt || s.duration || 0,
          fee: s.fee || 0, discNumber: Number(String(s.cd || 1).replace(/\D/g, '')) || 1, trackNumber: s.no || s.tn || 0 })) };
    }
    if (action === 'status') {
      if (!cookie) return { loggedIn: false };
      let value = await netease.user_account(options);
      let profile = value.body.profile;
      if (!profile) {
        value = await netease.login_status(options);
        profile = value.body.data?.profile || value.body.profile;
      }
      return { loggedIn: !!profile?.userId, userId: String(profile?.userId || ''), nickname: profile?.nickname || '', avatar: profile?.avatarUrl || '' };
    }
    if (action === 'resolve') {
      const response = await netease.song_url_v1({ ...options, id: args.id, level: 'standard' });
      const item = response.body.data?.[0];
      return { playable: !!item?.url, url: item?.url || '', trial: !!item?.freeTrialInfo,
        quality: item?.level || 'standard', message: item?.url ? '' : '该歌曲暂不可播放，请登录并确认账号权益。' };
    }
    if (action === 'qr') {
      const response = await netease.login_qr_key(options);
      const key = response.body.data?.unikey;
      if (!key) throw new Error('qr');
      const result = await netease.login_qr_create({ key, qrimg: true, timestamp: Date.now() });
      const data = result.body.data;
      return { key, image: data.qrimg || await QRCode.toDataURL(data.qrurl, { width: 280, margin: 2 }) };
    }
    if (action === 'poll') {
      let response = await netease.login_qr_check({ key: args.key, noCookie: true, timestamp: Date.now() });
      if (response.body.code === 803 && !response.body.cookie) response = await netease.login_qr_check({ key: args.key, timestamp: Date.now() });
      return { code: response.body.code, cookie: response.body.cookie || '' };
    }
  }
  if (provider === 'kugou') {
    if (action === 'lyrics') {
      const response = await kugou.handleKugouLyric(args.id, '', 0);
      return lyricResult(provider, args.id, response.lyric);
    }
    if (action === 'search') return { songs: await kugou.handleKugouSearch(args.query, args.limit, cookie, args.offset) };
    if (action === 'status') return cookie ? kugou.getKugouLoginInfo(cookie) : { loggedIn: false };
    if (action === 'resolve') return kugou.handleKugouSongUrl({ ...args, quality: 'standard' }, cookie);
  }
  if (provider === 'qishui') {
    if (action === 'lyrics') {
      const response = await qishui.handleQishuiLyric(args.id, '');
      return lyricResult(provider, args.id, response.lyric);
    }
    if (action === 'search') return qishui.handleQishuiSearch(args.query, args.limit, cookie, args.offset);
    if (action === 'status') return cookie ? qishui.handleQishuiStatus(cookie) : { loggedIn: false };
    if (action === 'resolve') return qishui.handleQishuiSongUrl({ ...args, quality: 'standard' }, cookie);
  }
  throw new Error('unsupported');
}
process.on('message', async ({ id, provider, action, args = {}, cookie = '' }) => {
  try { process.send?.({ id, result: await invoke(provider, action, args, cookie) }); }
  catch { process.send?.({ id, error: 'PLATFORM_UNAVAILABLE' }); }
});
process.on('disconnect', () => process.exit(0));
