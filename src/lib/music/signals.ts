import type { NormalizedTrack, UserTrackSignal } from "@/types/music";

/** Unknown facts stay undefined. An imported file is not evidence of liking. */
export function deriveTrackSignal(track: NormalizedTrack): UserTrackSignal {
  const sources = track.sources.filter((source) => source.provider !== "demo");
  const explicit = (field: "liked" | "recentlyPlayed") => {
    const values = sources.map((source) => source.rawMetadata[field]).filter((value) => value !== undefined);
    return values.length && values.every((value) => value === values[0]) ? values[0] : undefined;
  };
  const liked = explicit("liked");
  const recentlyPlayed = explicit("recentlyPlayed");
  const playlistCount = new Set(sources.filter((s) => s.playlistExternalId).map((s) => JSON.stringify([s.provider, s.playlistExternalId]))).size;
  const sourceCount = new Set(sources.map((source) => source.provider)).size;
  const likedPlatforms = new Set(sources.filter((s) => s.rawMetadata.liked === true && ["qqmusic", "netease"].includes(s.provider)).map((s) => s.provider)).size;
  return { trackId: track.id, liked, recentlyPlayed, playlistCount, sourceCount,
    preferenceScore: (liked === true ? 5 : 0) + Math.max(0, playlistCount - 1) * 2 + (recentlyPlayed === true ? 3 : 0) + (likedPlatforms > 1 ? 3 : 0) };
}
