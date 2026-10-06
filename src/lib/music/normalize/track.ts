import type { ProviderTrack } from "@/lib/music/providers/types";
import type { NormalizedTrack } from "@/types/music";
import { normalizeArtists, splitFeaturing } from "./artist";
import { displayText, matchText } from "./text";

const VERSION_WORDS = /\b(live|remix|mix|remaster(?:ed)?|acoustic|instrumental|demo|edit|version|mono|stereo|karaoke|sped\s*up|slowed|re-?recorded)\b|现场|混音|重制|伴奏|翻唱|录音室|重录/iu;

export function versionKey(title: string, explicit?: string, album?: string): string {
  const markers: string[] = [];
  for (const match of title.matchAll(/[([]([^()[\]]+)[)\]]/gu)) {
    if (VERSION_WORDS.test(match[1])) markers.push(matchText(match[1]));
  }
  const suffix = title.match(/\s+[-–—:]\s*(.+)$/u)?.[1];
  if (suffix && VERSION_WORDS.test(suffix)) markers.push(matchText(suffix));
  // Unbracketed version words must also prevent a shared-ISRC merge.
  if (!markers.length && VERSION_WORDS.test(title)) markers.push(matchText(title));
  if (explicit) markers.push(matchText(explicit));
  if (album && VERSION_WORDS.test(album)) markers.push(`album:${matchText(album)}`);
  return [...new Set(markers)].sort().join("|") || "original";
}

export function normalizeTrack(track: ProviderTrack): NormalizedTrack {
  const feature = splitFeaturing(track.title);
  const title = feature.base;
  const artists = normalizeArtists(track.artists, feature.guests);
  const version = versionKey(title, track.version, track.album);
  const primary = matchText(artists[0].name);
  const guests = artists.slice(1).map((artist) => matchText(artist.name)).sort();
  return {
    id: crypto.randomUUID(), title, artists,
    album: track.album ? { name: displayText(track.album) } : undefined,
    durationMs: track.durationMs,
    genre: track.genre?.map(displayText), releaseDate: track.releaseDate,
    isrc: track.isrc,
    canonicalKey: `v1:${JSON.stringify([matchText(title), primary, guests, version])}`,
    versionKey: version,
    sources: [{ id: crypto.randomUUID(), ...track.source, rawMetadata: structuredClone(track.rawMetadata) }],
  };
}
