import { readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';
const root = 'C:/path/to/music-universe';
const staged = new URL('./', import.meta.url);
const patch = async (file, changes) => {
  const destination = path.join(root, file);
  let content = await readFile(destination, 'utf8');
  for (const [from, to] of changes) {
    if (!content.includes(from)) throw new Error('Expected source missing in ' + file + ': ' + from.slice(0, 70));
    content = content.replace(from, to);
  }
  await writeFile(destination, content, 'utf8');
};
await patch('src/lib/musicPlatforms.ts', [
  ["export const musicPlatforms", "import type { AlbumResolution, PlayingIdentity } from './automaticAlbum'\n\nexport const musicPlatforms"],
  ['album: string; cover: string;', 'album: string; albumId?: string; cover: string;'],
  ['export const readConnection', "export const fetchPlayingAlbum = (identity: PlayingIdentity, signal?: AbortSignal) => connected<AlbumResolution>('album', 'POST', identity, signal)\nexport const readConnection"],
]);
await patch('src/lib/generateAlbumGalaxy.ts', [
  ["export interface Track {", "export interface TrackSource { provider: import('./musicPlatforms').MusicPlatform; trackId: string; albumId: string; playbackId?: string }\nexport interface Track {\n  source?: TrackSource\n  discNumber?: number\n  trackNumber?: number"],
  ['export interface Album {', 'export interface Album {\n  source?: Pick<TrackSource, \'provider\' | \'albumId\'>'],
  ["tracks.length > 40", "tracks.length > 300"],
  ['曲目数量需要在 1–40 首之间。', '曲目数量需要在 1–300 首之间。'],
]);
await patch('src/lib/explorationSession.ts', [['album.tracks.length > 40', 'album.tracks.length > 300']]);
await patch('src/hooks/useAudioPlayback.ts', [
  ["import { useCallback, useEffect, useRef, useState } from 'react'", "import { useCallback, useEffect, useRef, useState } from 'react'\nimport type { MusicPlatform } from '../lib/musicPlatforms'\nimport { readLocalAudioMetadata } from '../lib/audioMetadata'"],
  ['  provider?: string', '  provider?: MusicPlatform\n  platformTrackId?: string\n  albumId?: string\n  durationMs?: number\n  discNumber?: number\n  trackNumber?: number'],
  ['  const audioRef = useRef<HTMLAudioElement>(null)', '  const audioRef = useRef<HTMLAudioElement>(null)\n  const trackRef = useRef<AudioTrackInfo | null>(null)\n  const playingListeners = useRef(new Set<(track: AudioTrackInfo) => void>())'],
  ["const onPlaying = () => setStatus('playing')", "const onPlaying = () => {\n      setStatus('playing')\n      const current = trackRef.current\n      if (current) for (const listener of playingListeners.current) listener(current)\n    }"],
  ['    setTrack(info)', '    trackRef.current = info\n    setTrack(info)'],
  ["    setTrack(null)\n    setStatus('idle')", "    trackRef.current = null\n    setTrack(null)\n    setStatus('idle')"],
  ["  /** Import a file the user picked from disk through an object URL. */", "  const getTrack = useCallback(() => trackRef.current, [])\n  const subscribePlaying = useCallback((listener: (track: AudioTrackInfo) => void) => {\n    playingListeners.current.add(listener)\n    return () => { playingListeners.current.delete(listener) }\n  }, [])\n  const updateTrack = useCallback((expectedId: string, patch: Partial<AudioTrackInfo>) => {\n    if (trackRef.current?.id !== expectedId) return\n    const next = { ...trackRef.current, ...patch, id: expectedId }\n    trackRef.current = next\n    setTrack(next)\n  }, [])\n\n  /** Read ID3/MP4/FLAC tags locally; only metadata enters the album resolver. */"],
  ['const loadFile = useCallback((file: File) => {', 'const loadFile = useCallback(async (file: File) => {'],
  ["    const name = file.name.replace(/\\.[^.]+$/, '') || file.name\n    void load(URL.createObjectURL(file), { id: `file-${file.name}`, title: name, artist: '本地音频', album: type || '本地文件', cover: '' }, { objectUrl: true })", "    stop()\n    const generation = loadGeneration.current\n    setStatus('loading')\n    const metadata = await readLocalAudioMetadata(file).catch(() => null)\n    if (generation !== loadGeneration.current) return\n    const name = file.name.replace(/\\.[^.]+$/, '') || file.name\n    void load(URL.createObjectURL(file), { id: `file-${file.name}`, title: metadata?.title || name, artist: metadata?.artist || '本地音频',\n      album: metadata?.album || '', cover: '', durationMs: metadata?.durationMs, discNumber: metadata?.discNumber, trackNumber: metadata?.trackNumber }, { objectUrl: true })"],
  ['  }, [load])', '  }, [load, stop])'],
  ['    audioRef,\n    track,', '    audioRef,\n    getTrack,\n    subscribePlaying,\n    updateTrack,\n    track,'],
]);
await patch('src/components/MusicSearch.tsx', [
  ["album: song.album || label, cover: musicWorldMedia(song.cover)", "album: song.album || '', cover: musicWorldMedia(song.cover), provider: song.provider, platformTrackId: song.id, albumId: song.albumId, durationMs: song.duration || undefined, trial: result.trial"],
]);
await patch('src/hooks/useAlbumMusic.ts', [
  ["const platforms = [...new Set<MusicPlatform>([primary, 'netease'])]", "const platforms = [...new Set<MusicPlatform>([...(track.source ? [track.source.provider] : []), primary, 'netease'])]"],
  ["          const query = `${track.title} ${track.artist || album.artist}`.slice(0, 80)", "          if (track.source?.provider === provider && track.source.playbackId) {\n            try {\n              const song = { provider, id: track.source.trackId, playbackId: track.source.playbackId, name: track.title, artist: track.artist || album.artist, album: album.name, albumId: track.source.albumId, cover: album.cover, duration: (track.duration || 0) * 1000, fee: 0 }\n              const source = await resolveMusic(song, controller.signal)\n              if (controller.signal.aborted) return\n              if (source.playable && source.url) {\n                const started = await loadAudio.current(musicWorldMedia(source.url), { id: `${provider}:${song.id}`, planetId: id, title: track.title, artist: song.artist, album: album.name, cover: album.cover, provider,\n                  platformTrackId: song.id, albumId: song.albumId, durationMs: song.duration || undefined, discNumber: track.discNumber, trackNumber: track.trackNumber, trial: source.trial })\n                if (!controller.signal.aborted) setMessage(started ? '' : '音源已加载，请再点一次播放。')\n                return\n              }\n            } catch { if (controller.signal.aborted) return } // Expired references fall back to fresh catalogue search.\n          }\n          const query = `${track.title} ${track.artist || album.artist}`.slice(0, 80)"],
  ['const matches = matchAlbumSongs(album, track, result.songs)', 'const matches = matchAlbumSongs(album, track, result.songs)'],
  ['album: song.album || album.name, cover: musicWorldMedia(song.cover || album.cover), provider, trial: source.trial,', 'album: song.album || album.name, cover: musicWorldMedia(song.cover || album.cover), provider, trial: source.trial,\n              platformTrackId: song.id, albumId: song.albumId, durationMs: song.duration || undefined,'],
]);
await patch('src/App.tsx', [
  ["import { useAlbumMusic } from './hooks/useAlbumMusic'", "import { useAlbumMusic } from './hooks/useAlbumMusic'\nimport { usePlaybackAlbum } from './hooks/usePlaybackAlbum'\nimport './album-sync.css'"],
  ["  const openTools = () =>", "  const albumSync = usePlaybackAlbum(audio, (value) => {\n    // Automatic adoption preserves audio, seed and camera zoom. Manual editing uses replaceAlbum.\n    if (album.id !== value.album.id || album.cover !== value.album.cover || album.tracks.map(t => t.id).join('|') !== value.album.tracks.map(t => t.id).join('|')) {\n      setAlbum(value.album)\n      setGeneration(current => current + 1)\n    }\n    navigation.followRef.current = null\n    navigation.focus(value.planetId)\n    setSelectedId(value.planetId); setPulseTarget(value.planetId); setPlaying(true)\n  })\n  const openTools = () =>"],
  ['ref={shell}>', 'ref={shell} data-album-id={album.id} data-album-cover={album.cover} data-playing-planet={audio.track?.planetId || \'\'} data-playing-index={albumSync.trackIndex ?? \'\'}>'],
  ['generation={generation} quality={quality}', "generation={generation} quality={album.tracks.length > 40 && quality === 'auto' ? 'low' : quality}"],
  ['    <div className="player-dock"', '    {albumSync.message && <p className="album-sync-status" data-testid="album-sync-status" data-state={albumSync.status} role="status"><span>{albumSync.message}</span>{albumSync.status === \'error\' && <button type="button" onClick={albumSync.retry}>重新获取</button>}</p>}\n    <div className="player-dock"'],
]);
await patch('src/components/GalaxyScene.tsx', [['near: 0.1, far: 400', 'near: 0.1, far: Math.max(400, Math.hypot(props.galaxy.bounds.width, props.galaxy.bounds.height, props.galaxy.bounds.depth) * 24)']]);
for (const [source, destination] of [['automaticAlbum.ts', 'src/lib/automaticAlbum.ts'], ['usePlaybackAlbum.ts', 'src/hooks/usePlaybackAlbum.ts'], ['audioMetadata.ts', 'src/lib/audioMetadata.ts'], ['album-sync.css', 'src/album-sync.css']]) await copyFile(new URL(source, staged), path.join(root, destination));
console.log('Installed automatic album sync, preserving the existing scene and arc player.');
