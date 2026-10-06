import { describe, expect, it } from "vitest";
import { importPlaylistFiles } from "@/lib/music/import/library";
import { buildMusicWorld } from "@/lib/music/graph/buildGraph";

function library(rows: unknown[]) { return importPlaylistFiles([{ name: "data.json", bytes: new TextEncoder().encode(JSON.stringify(rows)) }]).tracks; }
describe("bounded evidence-based graph", () => {
  it("projects 100 real records into 15–30 nodes without dropping library identities", () => {
    const tracks = library(Array.from({ length: 100 }, (_, i) => ({ title: `Song ${i}`, artist: `Artist ${Math.floor(i / 5)}`, album: `Album ${Math.floor(i / 5)}`, genre: `Genre ${i % 4}` })));
    const world = buildMusicWorld(tracks, [], "100 songs", "library");
    expect(world.totalTracks).toBe(100); expect(tracks).toHaveLength(100);
    expect(world.nodes.length).toBeGreaterThanOrEqual(15); expect(world.nodes.length).toBeLessThanOrEqual(30);
    expect(world.hiddenTracks).toBe(82);
    const trackIds = new Set(tracks.map((t) => t.id));
    expect(world.nodes.every((n) => n.metadata.trackIds.every((id) => trackIds.has(id)))).toBe(true);
    const nodeIds = new Set(world.nodes.map((node) => node.id));
    expect(nodeIds.size).toBe(world.nodes.length);
    expect(world.edges.every((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target) && edge.evidence.trackIds.every((id) => trackIds.has(id)))).toBe(true);
    expect(new Set(world.edges.map((edge) => `${edge.source}:${edge.target}:${edge.relation}`)).size).toBe(world.edges.length);
    expect(world.clusters.every((cluster) => cluster.nodeIds.every((id) => nodeIds.has(id)))).toBe(true);
  });
  it("creates all four relationship types only with explicit support", () => {
    const tracks = library([{ title: "A", artist: "Same Artist", album: "Same Album", genre: "rock", liked: true }, { title: "B", artist: "Same Artist", album: "Same Album", genre: "rock" }, { title: "C", artist: "Other Artist" }]);
    const world = buildMusicWorld(tracks, [{ id: "real-playlist", name: "Imported playlist", trackIds: tracks.slice(0, 2).map((t) => t.id) }], "Evidence", "library");
    const a = world.nodes.find((n) => n.trackId === tracks[0].id)!, b = world.nodes.find((n) => n.trackId === tracks[1].id)!, c = world.nodes.find((n) => n.trackId === tracks[2].id)!;
    const pair = world.edges.filter((edge) => [a.id, b.id].includes(edge.source) && [a.id, b.id].includes(edge.target));
    expect(new Set(pair.map((e) => e.relation))).toEqual(new Set(["same_artist", "same_album", "same_genre", "user_cooccurrence"]));
    expect(world.edges.filter((edge) => edge.source === c.id || edge.target === c.id)).toHaveLength(0);
    expect(a.weight).toBe(6); expect(b.weight).toBe(1);
  });
  it("does not manufacture enough nodes to fill a small library", () => {
    const tracks = library([{ title: "A", artist: "B" }]);
    const world = buildMusicWorld(tracks, [], "One", "library");
    expect(world.nodes).toHaveLength(1); expect(world.edges).toHaveLength(0); expect(world.hiddenTracks).toBe(0);
  });
});
