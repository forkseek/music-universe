import { MarkerType, type Edge } from "@xyflow/react";
import type { MusicJourney, MusicWorld } from "@/types/world";

export function journeyNodeId(world: MusicWorld, trackId: string) {
  return world.nodes.find((node) => node.trackId === trackId)?.id ?? `route:${trackId}`;
}

/** A dashed path is travel order, not a claimed music relationship. */
export function journeyEdges(world: MusicWorld, journey?: MusicJourney): Edge[] {
  if (!journey) return [];
  return journey.nodes.slice(1).map((stop, index) => ({
    id: `journey-${journey.id}-${index}`, source: journeyNodeId(world, journey.nodes[index].trackId), target: journeyNodeId(world, stop.trackId),
    type: "smoothstep", animated: true, className: "journey-edge", zIndex: 10,
    style: { stroke: "#f3a56d", strokeWidth: 3, strokeDasharray: "7 5" }, markerEnd: { type: MarkerType.ArrowClosed, color: "#f3a56d" },
  }));
}
