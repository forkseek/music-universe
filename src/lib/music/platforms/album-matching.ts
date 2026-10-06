import type { PlayingIdentity } from "./types";

export const metadataKey = (value: string) => value.normalize("NFKD").toLowerCase().replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]/gu, "");
// Featured artists may decorate a title. Live/remix/deluxe qualifiers remain significant.
export const songTitleKey = (value: string) => metadataKey(value.replace(/\s*[([{]\s*(?:feat\.?|ft\.?|featuring)\b[^)\]}]*[)\]}]/gi, "").replace(/\s+(?:feat\.|ft\.|featuring)\s+.*$/i, ""));
export function sameArtist(expected: string, actual: string) {
  const split = (v: string) => v.split(/\s*\/\s*|\s+&\s+|\s*;\s*/).map(metadataKey).filter(Boolean);
  const names = split(actual);
  return split(expected).length > 0 && split(expected).every(name => names.includes(name));
}
export interface MatchableSong { id: string; name: string; artist: string; album?: string; duration?: number; discNumber?: number; trackNumber?: number }
export function matchesRecording(identity: PlayingIdentity, song: MatchableSong) {
  return songTitleKey(identity.title) === songTitleKey(song.name) && sameArtist(identity.artist, song.artist)
    && (!identity.album || !song.album || metadataKey(identity.album) === metadataKey(song.album));
}
/** Stable API order is the fallback, never alphabetic order. Discs precede track numbers. */
export function orderedAlbumTracks<T extends { discNumber?: number; trackNumber?: number }>(tracks: T[]): T[] {
  return tracks.map((track, index) => ({ track, index })).sort((a, b) =>
    (a.track.discNumber || 1) - (b.track.discNumber || 1)
    || (a.track.trackNumber || a.index + 1) - (b.track.trackNumber || b.index + 1)
    || a.index - b.index).map(item => item.track);
}
/** A repeated title is not sufficient evidence to pick a track. */
export function locateAlbumTrack(identity: PlayingIdentity, songs: MatchableSong[], sameProvider: boolean): { index: number; matchedBy: "id" | "metadata" } | null {
  const positions = songs.map((song, index) => ({ song, index }));
  const exact = sameProvider && identity.trackId ? positions.filter(item => item.song.id === identity.trackId) : [];
  let matches = exact.length ? exact : positions.filter(item => matchesRecording(identity, item.song));
  if (identity.discNumber) matches = matches.filter(item => item.song.discNumber === identity.discNumber);
  if (identity.trackNumber) matches = matches.filter(item => item.song.trackNumber === identity.trackNumber);
  if (matches.length > 1 && identity.durationMs) {
    const close = matches.filter(item => item.song.duration && Math.abs(item.song.duration - identity.durationMs!) < 3500);
    if (close.length === 1) matches = close;
  }
  return matches.length === 1 ? { index: matches[0].index, matchedBy: exact.length ? "id" : "metadata" } : null;
}
