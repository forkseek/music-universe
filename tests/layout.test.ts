import { describe, expect, it } from "vitest";
import { buildMusicWorld } from "@/lib/music/graph/buildGraph";
import { layoutWorld } from "@/lib/music/graph/layout";
import { projectDisplayEdges } from "@/lib/music/graph/display";
import { importPlaylistFiles } from "@/lib/music/import/library";

describe("readable map projection", () => {
  it("keeps 30 nodes in a usable initial footprint with stable coordinates", () => {
    const rows = Array.from({ length: 60 }, (_, index) => ({ title: `Song ${index}`, artist: `Artist ${Math.floor(index / 3)}`, album: `Album ${Math.floor(index / 3)}`, genre: `Genre ${index % 5}` }));
    const tracks = importPlaylistFiles([{ name: "layout.json", bytes: new TextEncoder().encode(JSON.stringify(rows)) }]).tracks;
    const world = buildMusicWorld(tracks, [], "Layout", "library");
    const positions = layoutWorld(world);
    expect(positions.size).toBe(world.nodes.length);
    const xs = [...positions.values()].map((point) => point.x), ys = [...positions.values()].map((point) => point.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1500);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(950);
    expect(layoutWorld(world)).toEqual(positions);
  });
  it("shows a connected, bounded representative graph for a dense 65-song playlist", () => {
    const rows = Array.from({ length: 65 }, (_, index) => ({ title: `Dense Song ${index}`, artist: "Same Artist",
      album: "Same Album", playlistExternalId: "playlist-1", playlistName: "One Playlist" }));
    const tracks = importPlaylistFiles([{ name: "dense.json", bytes: new TextEncoder().encode(JSON.stringify(rows)) }]).tracks;
    const world = buildMusicWorld(tracks, [{ id: "playlist-1", name: "One Playlist", trackIds: tracks.map((track) => track.id) }], "Dense", "library");
    expect(world.edges.length).toBeGreaterThan(100);
    const selectedId = world.nodes.find((node) => node.type === "track")!.id;
    const displayed = projectDisplayEdges(world, selectedId);
    expect(displayed.length).toBeLessThanOrEqual(world.nodes.length * 2);
    expect(new Set(displayed.map((edge) => [edge.source, edge.target].sort().join(":"))).size).toBe(displayed.length);
    expect(displayed.filter((edge) => edge.source === selectedId || edge.target === selectedId).length).toBeGreaterThanOrEqual(5);
    const reached = new Set([world.nodes[0].id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const edge of displayed) {
        if (reached.has(edge.source) && !reached.has(edge.target)) { reached.add(edge.target); changed = true; }
        if (reached.has(edge.target) && !reached.has(edge.source)) { reached.add(edge.source); changed = true; }
      }
    }
    expect(reached.size).toBe(world.nodes.length);
  });
});
