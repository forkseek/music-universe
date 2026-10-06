export type LibraryScope = "library" | "demo";
export type GraphRelation = "same_artist" | "same_album" | "same_genre" | "user_cooccurrence";

export interface GraphEvidence {
  trackIds: string[];
  values: string[];
  playlistIds?: string[];
}
export interface MusicNode {
  id: string;
  type: "track" | "artist" | "album" | "genre";
  label: string;
  weight: number;
  trackId?: string;
  artistId?: string;
  albumId?: string;
  metadata: { trackIds: string[]; basis: string };
}
export interface MusicEdge {
  id: string;
  source: string;
  target: string;
  relation: GraphRelation;
  weight: number;
  reason: string;
  evidence: GraphEvidence;
}
export interface WorldCluster {
  id: string;
  name: string;
  dimension: "artist" | "genre";
  nodeIds: string[];
  trackIds: string[];
}
export interface MusicWorld {
  id: string;
  name: string;
  scope: LibraryScope;
  createdAt: string;
  totalTracks: number;
  hiddenTracks: number;
  nodes: MusicNode[];
  edges: MusicEdge[];
  clusters: WorldCluster[];
}

export interface WorldTrack {
  id: string;
  title: string;
  artists: string[];
  album?: string;
  genre?: string[];
  releaseDate?: string;
  versionKey: string;
  sourceLinks: { provider: string; url: string }[];
}

export interface JourneyStop {
  position: number;
  trackId: string;
  track: WorldTrack;
  reason: string;
}

export interface MusicJourney {
  id: string;
  worldId: string;
  title: string;
  intent: string;
  mode: "deterministic" | "ai";
  createdAt: string;
  requestedLength: number;
  nodes: JourneyStop[];
}
