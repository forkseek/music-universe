import type { NormalizedTrack } from "@/types/music";
import type { GraphEvidence, GraphRelation, MusicEdge, MusicNode, MusicWorld, LibraryScope, WorldCluster } from "@/types/world";
import { deriveTrackSignal } from "../signals";
import { matchText } from "../normalize/text";

export interface GraphPlaylist { id: string; name: string; trackIds: string[] }
interface Group { key: string; label: string; type: "artist" | "album" | "genre"; entityId?: string; trackIds: string[] }

/** Pure, bounded projection. No invented facts, similarity, mood or influence edges. */
export function buildMusicWorld(tracks: NormalizedTrack[], playlists: GraphPlaylist[], name: string, scope: LibraryScope): MusicWorld {
  const nodes: MusicNode[] = [];
  const byId = new Map(tracks.map((track) => [track.id, track]));
  const signals = new Map(tracks.map((track) => [track.id, deriveTrackSignal(track)]));
  const groups = new Map<string, Group>();
  const addGroup = (type: Group["type"], label: string, trackId: string, entityId?: string, discriminator = "") => {
    const key = JSON.stringify([type, entityId ?? matchText(label), discriminator]);
    const group = groups.get(key) ?? { key, type, label, entityId, trackIds: [] };
    if (!group.trackIds.includes(trackId)) group.trackIds.push(trackId);
    groups.set(key, group);
  };
  for (const track of tracks) {
    for (const artist of track.artists) addGroup("artist", artist.name, track.id, artist.id);
    if (track.album) addGroup("album", track.album.name, track.id, track.album.id, track.album.id ? "" : matchText(track.artists[0].name));
    for (const genre of track.genre ?? []) addGroup("genre", genre, track.id);
  }
  const ranked = [...tracks].sort((a, b) => (signals.get(b.id)!.preferenceScore - signals.get(a.id)!.preferenceScore) || a.canonicalKey.localeCompare(b.canonicalKey) || a.id.localeCompare(b.id));
  // Reserve room for explainable aggregate nodes and keep at least 5 song nodes.
  const songBudget = Math.min(18, tracks.length);
  const selected: NormalizedTrack[] = [];
  const chosen = new Set<string>();
  const artistCounts = new Map<string, number>();
  // One high-ranked song per artist first; then fill remaining places by score.
  for (const track of ranked) {
    const artist = matchText(track.artists[0].name);
    if (selected.length < songBudget && !artistCounts.has(artist)) { selected.push(track); chosen.add(track.id); artistCounts.set(artist, 1); }
  }
  for (const track of ranked) if (selected.length < songBudget && !chosen.has(track.id)) { selected.push(track); chosen.add(track.id); }
  for (const track of selected) nodes.push({ id: crypto.randomUUID(), type: "track", label: track.title, trackId: track.id,
    weight: 1 + signals.get(track.id)!.preferenceScore,
    metadata: { trackIds: [track.id], basis: "真实库中歌曲；权重来自显式导入信号" } });

  const rankedGroups = [...groups.values()].filter((group) => group.trackIds.length >= 2).sort((a, b) => b.trackIds.length - a.trackIds.length || a.type.localeCompare(b.type) || matchText(a.label).localeCompare(matchText(b.label)));
  const selectedGroups: Group[] = [];
  // Include all supported entity kinds when the library actually supplies them.
  for (const type of ["artist", "album", "genre"] as const) {
    selectedGroups.push(...rankedGroups.filter((group) => group.type === type).slice(0, type === "artist" ? 4 : 3));
  }
  for (const group of rankedGroups) if (selectedGroups.length < 12 && !selectedGroups.includes(group)) selectedGroups.push(group);
  for (const group of selectedGroups.slice(0, 30 - nodes.length)) nodes.push({ id: crypto.randomUUID(), type: group.type, label: group.label,
    artistId: group.type === "artist" ? group.entityId : undefined, albumId: group.type === "album" ? group.entityId : undefined,
    weight: 1 + Math.log2(group.trackIds.length + 1), metadata: { trackIds: group.trackIds, basis: `来自 ${group.trackIds.length} 首歌曲的显式${group.type === "artist" ? "艺术家" : group.type === "album" ? "专辑" : "流派"}信息` } });

  const edges: MusicEdge[] = [];
  const addEdge = (a: MusicNode, b: MusicNode, relation: GraphRelation, reason: string, evidence: GraphEvidence, weight: number) => {
    edges.push({ id: crypto.randomUUID(), source: a.id, target: b.id, relation, reason, evidence, weight });
  };
  const intersect = (a: string[], b: string[]) => [...new Set(a.filter((item) => b.includes(item)))];
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    if (a.type === "track" && b.type === "track") {
      const first = byId.get(a.trackId!)!, second = byId.get(b.trackId!)!;
      const artists = intersect(first.artists.map((v) => matchText(v.name)), second.artists.map((v) => matchText(v.name)));
      if (artists.length) addEdge(a, b, "same_artist", `共同艺术家：${artists.join("、")}`, { trackIds: [first.id, second.id], values: artists }, 3);
      const sameAlbum = first.album && second.album && (first.album.id && second.album.id ? first.album.id === second.album.id : matchText(first.album.name) === matchText(second.album.name) && artists.length > 0);
      if (sameAlbum) addEdge(a, b, "same_album", `共同专辑：${first.album!.name}`, { trackIds: [first.id, second.id], values: [first.album!.name] }, 3);
      const genres = intersect((first.genre ?? []).map(matchText), (second.genre ?? []).map(matchText));
      if (genres.length) addEdge(a, b, "same_genre", `共同流派（来源标签）：${genres.join("、")}`, { trackIds: [first.id, second.id], values: genres }, 1);
      const shared = playlists.filter((p) => p.trackIds.includes(first.id) && p.trackIds.includes(second.id));
      if (shared.length) addEdge(a, b, "user_cooccurrence", `共同歌单：${shared.map((p) => p.name).join("、")}`, { trackIds: [first.id, second.id], values: shared.map((p) => p.name), playlistIds: shared.map((p) => p.id) }, 2);
    } else {
      const overlap = intersect(a.metadata.trackIds, b.metadata.trackIds);
      if (!overlap.length) continue;
      const group = b.type === "track" ? a : b;
      const relation = group.type === "artist" ? "same_artist" : group.type === "album" ? "same_album" : "same_genre";
      addEdge(a, b, relation, `共享 ${overlap.length} 首歌曲的${group.type === "artist" ? "艺术家" : group.type === "album" ? "专辑" : "流派"}归属：${group.label}`, { trackIds: overlap, values: [group.label] }, 1);
    }
  }
  const clusters: WorldCluster[] = rankedGroups.filter((g) => g.type !== "album").slice(0, 30).map((group) => ({
    id: crypto.randomUUID(), name: group.label, dimension: group.type as "artist" | "genre", trackIds: group.trackIds,
    nodeIds: nodes.filter((node) => node.metadata.trackIds.some((id) => group.trackIds.includes(id))).map((node) => node.id),
  })).filter((cluster) => cluster.nodeIds.length > 0);
  return { id: crypto.randomUUID(), name, scope, createdAt: new Date().toISOString(), totalTracks: tracks.length,
    hiddenTracks: tracks.length - selected.length, nodes, edges, clusters };
}
