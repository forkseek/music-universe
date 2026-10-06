import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from "d3-force";
import type { MusicWorld } from "@/types/world";
import { projectDisplayEdges } from "./display";

interface LayoutNode extends SimulationNodeDatum { id: string; x: number; y: number }

/** Deterministic, bounded coordinates; the browser can drag nodes afterwards. */
export function layoutWorld(world: MusicWorld): Map<string, { x: number; y: number }> {
  const ordered = [...world.nodes].sort((a, b) => a.type.localeCompare(b.type) || a.label.localeCompare(b.label));
  const nodes: LayoutNode[] = ordered.map((node, index) => {
    const angle = index / Math.max(1, ordered.length) * Math.PI * 2;
    const radius = node.type === "track" ? 290 : 130;
    return { id: node.id, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
  const links = projectDisplayEdges(world).map((edge) => ({ source: edge.source, target: edge.target, weight: edge.weight }));
  const simulation = forceSimulation(nodes)
    .force("links", forceLink<LayoutNode, typeof links[number]>(links).id((node) => node.id).distance((link) => link.weight >= 3 ? 150 : 195).strength(0.15))
    .force("charge", forceManyBody().strength(-220))
    .force("collide", forceCollide().radius(88).iterations(2))
    .force("center", forceCenter(0, 0))
    .force("x", forceX(0).strength(0.07))
    .force("y", forceY(0).strength(0.14))
    .stop();
  // d3-force uses a fixed-seed random source by default; set it explicitly for stable map reloads.
  let seed = 0x1a2b3c4d;
  simulation.randomSource(() => { seed = (Math.imul(1664525, seed) + 1013904223) | 0; return (seed >>> 0) / 2 ** 32; });
  for (let index = 0; index < 180; index++) simulation.tick();
  const xs = nodes.map((node) => node.x), ys = nodes.map((node) => node.y);
  const width = Math.max(...xs) - Math.min(...xs), height = Math.max(...ys) - Math.min(...ys);
  const scale = Math.min(1, 1400 / Math.max(1, width), 900 / Math.max(1, height));
  return new Map(nodes.map((node) => [node.id, { x: node.x * scale, y: node.y * scale }]));
}
