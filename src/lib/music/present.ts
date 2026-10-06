import type { NormalizedTrack } from "@/types/music";
import type { WorldTrack } from "@/types/world";

export function toWorldTrack(track: NormalizedTrack): WorldTrack {
  const links = new Map<string, { provider: string; url: string }>();
  for (const source of track.sources) if (source.externalUrl && !links.has(source.externalUrl)) {
    links.set(source.externalUrl, { provider: source.provider, url: source.externalUrl });
  }
  return { id: track.id, title: track.title, artists: track.artists.map((artist) => artist.name), album: track.album?.name,
    genre: track.genre, releaseDate: track.releaseDate, versionKey: track.versionKey, sourceLinks: [...links.values()] };
}
