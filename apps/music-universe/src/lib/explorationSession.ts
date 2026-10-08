import { DEFAULT_ALBUM } from '../data/albums'
import type { Album } from './generateAlbumGalaxy'
import { createJsonStore, jsonRecord } from './json'

const SESSION_KEY = 'music-universe:exploration:v1'
export const DEFAULT_SEED = 'GLASS-2025'
interface Exploration { album: Album; seed: string }

function isExploration(input: unknown): input is Exploration {
  const value = jsonRecord(input), album = jsonRecord(value.album)
  if (typeof value.seed !== 'string' || !value.seed.trim() || value.seed.length > 80) return false
  if (!['id', 'name', 'artist', 'cover'].every(key => typeof album[key] === 'string' && (album[key] as string).trim())) return false
  if (album.year !== undefined && (typeof album.year !== 'number' || !Number.isFinite(album.year))) return false
  if (!Array.isArray(album.tracks) || album.tracks.length < 1 || album.tracks.length > 300) return false
  if (!album.tracks.every(input => {
    const track = jsonRecord(input)
    return typeof track.id === 'string' && !!track.id.trim() && typeof track.title === 'string' && !!track.title.trim()
      && (track.duration === undefined || (typeof track.duration === 'number' && Number.isFinite(track.duration) && track.duration > 0))
  })) return false
  return new Set(album.tracks.map(track => track.id)).size === album.tracks.length
}
const store = createJsonStore(() => sessionStorage, SESSION_KEY, isExploration)

export const readExploration = () => store.read({ album: DEFAULT_ALBUM, seed: DEFAULT_SEED })

export function rememberExploration(value: Exploration) {
  store.write(value)
}
