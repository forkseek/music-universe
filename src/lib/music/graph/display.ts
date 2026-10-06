import type { MusicEdge, MusicWorld } from "@/types/world";

/** Keep a connected, readable map projection while retaining every grounded relation in the saved world. */
export function projectDisplayEdges(world: MusicWorld, selectedId?: string): MusicEdge[] {
  const nodeIds = new Set(world.nodes.map((node) => node.id));
  const relationPriority = { same_artist: 3, same_album: 2, user_cooccurrence: 1, same_genre: 0 };
  const ordered = world.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .sort((a, b) => b.weight - a.weight || relationPriority[b.relation] - relationPriority[a.relation]
      || b.evidence.trackIds.length - a.evidence.trackIds.length || a.id.localeCompare(b.id));
  const byPair = new Map<string, MusicEdge>();
  for (const edge of ordered) {
    const key = [edge.source, edge.target].sort().join(":");
    if (!byPair.has(key)) byPair.set(key, edge);
  }
  const candidates = [...byPair.values()];
  const limit = Math.min(candidates.length, Math.max(world.nodes.length - 1, Math.min(60, world.nodes.length * 2)));
  const parent = new Map(world.nodes.map((node) => [node.id, node.id]));
  const root = (id: string): string => {
    let current = id;
    while (parent.get(current) !== current) current = parent.get(current)!;
    return current;
  };
  const chosen: MusicEdge[] = [];
  const used = new Set<string>();
  const add = (edge: MusicEdge) => { if (chosen.length < limit && !used.has(edge.id)) { chosen.push(edge); used.add(edge.id); } };
  // A maximum-weight forest preserves the topology of every connected component.
  for (const edge of candidates) {
    const a = root(edge.source), b = root(edge.target);
    if (a !== b) { parent.set(a, b); add(edge); }
  }
  for (const edge of candidates.filter((edge) => edge.source === selectedId || edge.target === selectedId).slice(0, 10)) add(edge);
  const degree = new Map<string, number>();
  for (const edge of chosen) { degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1); degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1); }
  for (const edge of candidates) {
    if ((degree.get(edge.source) ?? 0) >= 5 || (degree.get(edge.target) ?? 0) >= 5) continue;
    if (!used.has(edge.id) && chosen.length < limit) {
      add(edge);
      degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    }
  }
  for (const edge of candidates) add(edge);
  return chosen;
}
