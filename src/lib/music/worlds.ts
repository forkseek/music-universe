import "server-only";
import { and, eq } from "drizzle-orm";
import { getDatabase } from "@/db/connection";
import { musicWorlds, musicNodes, musicEdges } from "@/db/schema";
import type { GraphRelation, LibraryScope, MusicWorld } from "@/types/world";
import { readLibrary, hash } from "./library";
import { buildMusicWorld } from "./graph/buildGraph";
import { RequestError } from "@/lib/server/errors";

export function readWorld(userId: string, worldId: string, context = getDatabase()): MusicWorld {
  const { db } = context;
  const world = db.select().from(musicWorlds).where(and(eq(musicWorlds.userId, userId), eq(musicWorlds.id, worldId))).get();
  if (!world) throw new RequestError(404, "未找到这个音乐世界。", "NOT_FOUND");
  const nodes = db.select().from(musicNodes).where(and(eq(musicNodes.userId, userId), eq(musicNodes.worldId, worldId))).all();
  const edges = db.select().from(musicEdges).where(and(eq(musicEdges.userId, userId), eq(musicEdges.worldId, worldId))).all();
  return { id: world.id, name: world.name, scope: world.scope, createdAt: world.createdAt.toISOString(), totalTracks: world.totalTracks, hiddenTracks: world.hiddenTracks, clusters: world.clusters,
    nodes: nodes.map((node) => ({ id: node.id, type: node.type, label: node.label, weight: node.weight, trackId: node.trackId ?? undefined, artistId: node.artistId ?? undefined, albumId: node.albumId ?? undefined, metadata: node.metadata })),
    edges: edges.map((edge) => ({ id: edge.id, source: edge.sourceNodeId, target: edge.targetNodeId, relation: edge.relation as GraphRelation, weight: edge.weight, reason: edge.reason ?? "", evidence: edge.evidence })),
  };
}

export function createWorld(userId: string, name: string, scope: LibraryScope, context = getDatabase()): { world: MusicWorld; reused: boolean } {
  return context.sqlite.transaction(() => {
    const library = readLibrary(userId, scope, context);
    if (!library.tracks.length) throw new RequestError(422, "音乐库为空，请先导入歌曲。", "EMPTY_LIBRARY");
    const fingerprint = hash(JSON.stringify(["graph-v1", scope, library.tracks, library.playlists]));
    const previous = context.db.select({ id: musicWorlds.id }).from(musicWorlds).where(and(eq(musicWorlds.userId, userId), eq(musicWorlds.libraryFingerprint, fingerprint), eq(musicWorlds.name, name))).get();
    if (previous) return { world: readWorld(userId, previous.id, context), reused: true };
    if (library.worlds.length >= 50) throw new RequestError(409, "当前库最多保存 50 个世界，请先清理音乐库。", "WORLD_LIMIT");
    const world = buildMusicWorld(library.tracks, library.playlists, name, scope);
    context.db.insert(musicWorlds).values({ id: world.id, userId, name, scope, libraryFingerprint: fingerprint, totalTracks: world.totalTracks, hiddenTracks: world.hiddenTracks, clusters: world.clusters, createdAt: new Date(world.createdAt) }).run();
    for (const node of world.nodes) context.db.insert(musicNodes).values({ id: node.id, userId, worldId: world.id, type: node.type, label: node.label, weight: node.weight,
      trackId: node.trackId, artistId: node.artistId, albumId: node.albumId, metadata: node.metadata }).run();
    for (const edge of world.edges) context.db.insert(musicEdges).values({ id: edge.id, userId, worldId: world.id, sourceNodeId: edge.source, targetNodeId: edge.target,
      relation: edge.relation, weight: edge.weight, reason: edge.reason, evidence: edge.evidence }).run();
    return { world: readWorld(userId, world.id, context), reused: false };
  }).immediate();
}
