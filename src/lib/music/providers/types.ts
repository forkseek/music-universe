import type { FileSourceProviderId, MusicProviderId, RawTrackMetadata } from "@/types/music";
import type { ImportFile, ParsedFile } from "@/lib/music/import/types";

export type { MusicProviderId } from "@/types/music";

export interface ProviderTrack {
  title: string;
  artists: string[];
  album?: string;
  durationMs?: number;
  genre?: string[];
  releaseDate?: string;
  isrc?: string;
  version?: string;
  source: {
    provider: MusicProviderId;
    importedVia: "file" | "demo" | "official";
    externalId?: string;
    externalUrl?: string;
    playlistExternalId?: string;
    playlistName?: string;
    fileName?: string;
    row?: number;
  };
  rawMetadata: RawTrackMetadata;
}

export interface ProviderPlaylist {
  externalId: string;
  provider: MusicProviderId;
  name: string;
  trackCount?: number;
}

export interface MusicProviderCapabilities {
  auth: boolean;
  playlists: boolean;
  recentTracks: boolean;
  likedTracks: boolean;
  playback: boolean;
  fileImport: boolean;
}

export type ProviderUnavailableReason =
  | "FEATURE_DISABLED"
  | "CLIENT_ENVIRONMENT_REQUIRED"
  | "OFFICIAL_SDK_NOT_AVAILABLE"
  | "OFFICIAL_AUTH_REQUIRED"
  | "OFFICIAL_AUTH_CHECK_FAILED"
  | "OFFICIAL_INTEGRATION_PENDING"
  | "DEMO_LIBRARY_PENDING";

export type ProviderAvailability =
  | { available: true }
  | { available: false; reason: ProviderUnavailableReason; message: string };

export interface MusicProvider {
  id: MusicProviderId;
  name: string;
  official: boolean;
  isAvailable(): Promise<boolean>;
  getAvailability(): Promise<ProviderAvailability>;
  getCapabilities(): MusicProviderCapabilities;
  connect?(): Promise<void>;
  listPlaylists?(): Promise<ProviderPlaylist[]>;
  getPlaylistTracks?(playlistId: string): Promise<ProviderTrack[]>;
  getRecentTracks?(): Promise<ProviderTrack[]>;
  parseFile?(file: ImportFile, declaredSource?: FileSourceProviderId): ParsedFile;
}

export const NO_CAPABILITIES: MusicProviderCapabilities = {
  auth: false, playlists: false, recentTracks: false,
  likedTracks: false, playback: false, fileImport: false,
};
