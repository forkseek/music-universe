import type { Album, Track } from './generateAlbumGalaxy'
import type { PlatformSong } from './musicPlatforms'

const normalize = (value: string) => value.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '')
const titleKey = (value: string) => normalize(value.replace(/\s*[([{]\s*(?:feat\.?|ft\.?|featuring)\b[^)\]}]*[)\]}]/gi, '').replace(/\s+(?:feat\.|ft\.|featuring)\s+.*$/i, ''))

/** Never substitute a similarly named song, cover or karaoke version. */
export function matchAlbumSongs(album: Album, track: Track, songs: PlatformSong[]) {
  const artist = track.artist || album.artist
  const expectedArtists = artist.split(/\s*\/\s*|\s+&\s+|\s*;\s*/).map(normalize).filter(Boolean)
  return songs.filter(song => {
    if (titleKey(song.name) !== titleKey(track.title)) return false
    const artists = song.artist.split(/\s*\/\s*|\s+&\s+|\s*;\s*/).map(normalize)
    return expectedArtists.every(name => artists.includes(name))
  }).sort((a, b) => {
    const score = (song: PlatformSong) => (normalize(song.album) === normalize(album.name) ? 20 : 0)
      + (track.duration && song.duration ? Math.max(0, 5 - Math.abs(song.duration / 1000 - track.duration) / 10) : 0)
    return score(b) - score(a)
  })
}
