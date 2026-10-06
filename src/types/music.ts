export type MusicProviderId = "qqmusic" | "netease" | "kugou" | "qishui" | "spotify" | "file" | "demo";
export type FileSourceProviderId = Exclude<MusicProviderId, "demo">;

/** Only these explicitly selected, bounded fields survive an import. */
export interface RawTrackMetadata {
  title: string;
  artists: string[];
  album?: string;
  isrc?: string;
  version?: string;
  durationMs?: number;
  genre?: string[];
  releaseDate?: string;
  liked?: boolean;
  recentlyPlayed?: boolean;
}

export interface TrackSource {
  id: string; // Internal UUID, never a provider ID.
  provider: MusicProviderId;
  importedVia: "file" | "demo" | "official";
  externalId?: string;
  externalUrl?: string; // Validated public song page, never an audio URL.
  playlistExternalId?: string;
  playlistName?: string;
  fileName?: string;
  row?: number;
  rawMetadata: RawTrackMetadata;
}

export interface NormalizedTrack {
  id: string;
  title: string;
  artists: { id?: string; name: string }[];
  album?: { id?: string; name: string };
  durationMs?: number;
  genre?: string[];
  releaseDate?: string;
  isrc?: string;
  canonicalKey: string; // Candidate lookup key; deliberately NOT unique.
  versionKey: string;
  sources: TrackSource[];
}

export interface UserTrackSignal {
  trackId: string;
  liked?: boolean;
  recentlyPlayed?: boolean;
  playlistCount: number;
  sourceCount: number;
  preferenceScore: number;
}
