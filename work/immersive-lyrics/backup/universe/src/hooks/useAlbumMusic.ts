import { useEffect, useRef, useState } from 'react'
import type { Album } from '../lib/generateAlbumGalaxy'
import { matchAlbumSongs } from '../lib/albumMusic'
import { musicPlatforms, readConnection, resolveMusic, searchMusic } from '../lib/musicPlatforms'
import type { MusicPlatform } from '../lib/musicPlatforms'
import { musicWorldMedia } from '../lib/musicWorldClient'
import type { AudioPlayback } from './useAudioPlayback'

function preferredPlatform(): MusicPlatform {
  try { const value = localStorage.getItem('music-universe:platform'); if (value && Object.hasOwn(musicPlatforms, value)) return value as MusicPlatform } catch { /* Selection persistence is optional. */ }
  return 'qq'
}

export function useAlbumMusic(album: Album, audio: AudioPlayback) {
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)
  const request = useRef<AbortController | null>(null)
  const loadAudio = useRef(audio.load)
  useEffect(() => { loadAudio.current = audio.load }, [audio.load])
  useEffect(() => {
    request.current?.abort(); setLoadingId(null); setMessage(''); setError(false)
    return () => request.current?.abort()
  }, [album.id])

  const playTrack = async (id: string) => {
    const track = album.tracks.find(item => item.id === id)
    if (!track) return
    request.current?.abort()
    const controller = new AbortController(); request.current = controller
    audio.stop()
    audio.primePlayback()
    setLoadingId(id); setMessage(`正在加载「${track.title}」…`); setError(false)
    const primary = preferredPlatform()
    const platforms = [...new Set<MusicPlatform>([...(track.source ? [track.source.provider] : []), primary, 'netease'])]
    const errors: string[] = []
    try {
      for (const provider of platforms) {
        if (controller.signal.aborted) return
        try {
          if (provider === 'qq' || provider === 'qishui') {
            const connection = await readConnection(provider, controller.signal)
            if (!connection.authorized) { errors.push(`请连接 ${musicPlatforms[provider]} 账号。`); continue }
          }
          if (track.source?.provider === provider && track.source.playbackId) {
            try {
              const song = { provider, id: track.source.trackId, playbackId: track.source.playbackId, name: track.title, artist: track.artist || album.artist, album: album.name, albumId: track.source.albumId, cover: album.cover, duration: (track.duration || 0) * 1000, fee: 0 }
              const source = await resolveMusic(song, controller.signal)
              if (controller.signal.aborted) return
              if (source.playable && source.url) {
                const started = await loadAudio.current(musicWorldMedia(source.url), { id: `${provider}:${song.id}`, planetId: id, title: track.title, artist: song.artist, album: album.name, cover: album.cover, provider,
                  platformTrackId: song.id, albumId: song.albumId, durationMs: song.duration || undefined, discNumber: track.discNumber, trackNumber: track.trackNumber, trial: source.trial })
                if (!controller.signal.aborted) setMessage(started ? '' : '音源已加载，请再点一次播放。')
                return
              }
            } catch { if (controller.signal.aborted) return } // Expired references fall back to fresh catalogue search.
          }
          const query = `${track.title} ${track.artist || album.artist}`.slice(0, 80)
          const result = await searchMusic(provider, query, 1, controller.signal)
          const matches = matchAlbumSongs(album, track, result.songs)
          for (const song of matches.slice(0, 2)) {
            const source = await resolveMusic(song, controller.signal)
            if (controller.signal.aborted) return
            if (!source.playable || !source.url) { errors.push(source.message || '当前账号暂不可播放这首歌。'); continue }
            const started = await loadAudio.current(musicWorldMedia(source.url), {
              id: `${provider}:${song.id}`, planetId: id, title: track.title, artist: song.artist,
              album: song.album || album.name, cover: musicWorldMedia(song.cover || album.cover), provider, trial: source.trial,
              platformTrackId: song.id, albumId: song.albumId, durationMs: song.duration || undefined,
            })
            if (controller.signal.aborted) return
            setMessage(started ? '' : '音源已加载，请再点一次播放。')
            return
          }
        } catch (failure) { if (!controller.signal.aborted) errors.push(failure instanceof Error ? failure.message : '平台暂不可用。') }
      }
      if (!controller.signal.aborted) {
        setError(true)
        setMessage(`未能加载「${track.title}」。${errors[0] || '平台未找到对应歌手的可播放版本。'}请在音乐搜索中连接账号或选择音源。`)
      }
    } finally { if (!controller.signal.aborted) setLoadingId(null) }
  }
  const cancel = () => { request.current?.abort(); setLoadingId(null); setMessage(''); setError(false) }
  return { playTrack, loadingId, loading: !!loadingId, message, error, cancel }
}
