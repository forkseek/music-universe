"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PortalLink as Link, useSceneTransition } from "@/components/home/SceneTransition";
import { Background, Controls, ReactFlow, ReactFlowProvider, useNodesState, useReactFlow, type Edge } from "@xyflow/react";
import type { MusicJourney, MusicNode as WorldNode, MusicWorld as WorldData, WorldTrack } from "@/types/world";
import { layoutWorld } from "@/lib/music/graph/layout";
import { projectDisplayEdges } from "@/lib/music/graph/display";
import { MusicNodeView, type MapNode } from "./MusicNode";
import { MusicCard } from "./MusicCard";
import { JourneyPanel, type SavedJourney } from "@/components/journey/JourneyPanel";
import { journeyEdges, journeyNodeId } from "@/components/journey/JourneyPath";

const nodeTypes = { music: MusicNodeView };
const nodeKindLabels = { track: "歌曲", artist: "艺术家", album: "专辑", genre: "流派" };
type FocusRequest = { id: string; serial: number };

function MapCanvas({ world, journey, selectedId, setSelectedId, focus }: { world: WorldData; journey?: MusicJourney; selectedId: string; setSelectedId: (id: string) => void; focus?: FocusRequest }) {
  const flow = useReactFlow<MapNode, Edge>();
  const layout = useMemo(() => layoutWorld(world), [world]);
  const [hover, setHover] = useState("");
  const initialNodes = useMemo<MapNode[]>(() => world.nodes.map((node) => ({ id: node.id, type: "music", position: layout.get(node.id) ?? { x: 0, y: 0 },
    draggable: true, data: { label: node.label, kind: node.type, active: selectedId === node.id } })), [world, layout, selectedId]);
  const [nodes, setNodes, onNodesChange] = useNodesState<MapNode>(initialNodes);
  const focusedSerial = useRef(0);
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  const fittedWorldKey = useRef<string | undefined>(undefined);
  const fittedJourneyKey = useRef<string | undefined>(undefined);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const observer = new ResizeObserver(([entry]) => {
      setMapSize({ width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) });
    });
    observer.observe(map);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setNodes((previous) => {
      const previousPositions = new Map(previous.map((node) => [node.id, node.position]));
      const next = world.nodes.map<MapNode>((node) => {
        const step = node.trackId ? journey?.nodes.findIndex((stop) => stop.trackId === node.trackId) ?? -1 : -1;
        return { id: node.id, type: "music", position: previousPositions.get(node.id) ?? layout.get(node.id) ?? { x: 0, y: 0 },
          draggable: true, data: { label: node.label, kind: node.type, active: selectedId === node.id, step: step < 0 ? undefined : step + 1 } };
      });
      const positions = new Map(next.map((node) => [node.id, node.position]));
      for (const [index, stop] of (journey?.nodes ?? []).entries()) {
        const id = journeyNodeId(world, stop.trackId);
        if (positions.has(id)) continue;
        const anchorId = index > 0 ? journeyNodeId(world, journey!.nodes[index - 1].trackId) : world.nodes[0]?.id;
        const anchor = positions.get(anchorId) ?? { x: 0, y: 0 };
        const angle = (index * 2.4) + 0.7;
        const position = previousPositions.get(id) ?? { x: anchor.x + Math.cos(angle) * 250, y: anchor.y + Math.sin(angle) * 250 };
        positions.set(id, position);
        next.push({ id, type: "music", position, draggable: true, data: { label: stop.track.title, kind: "track", active: selectedId === id, step: index + 1, extra: true } });
      }
      return next;
    });
  }, [journey, layout, selectedId, setNodes, world]);

  useEffect(() => {
    if (!focus || focusedSerial.current === focus.serial) return;
    const target = nodes.find((node) => node.id === focus.id);
    if (!target) return;
    focusedSerial.current = focus.serial;
    void flow.setCenter(target.position.x + 76, target.position.y + 36, { zoom: 1.15, duration: 550 });
  }, [flow, focus, nodes]);

  useEffect(() => {
    if (journey || !mapSize.width || !mapSize.height) return;
    const fitKey = `${world.id}:${mapSize.width}:${mapSize.height}`;
    if (fittedWorldKey.current === fitKey) return;
    const timer = setTimeout(() => {
      if (mapSize.width < 600 || world.nodes.length > 12) {
        const target = nodes.find((node) => node.id === selectedId) ?? nodes[0];
        if (target) void flow.setCenter(target.position.x + 76, target.position.y + 36,
          { zoom: mapSize.width < 600 ? 0.82 : 0.76, duration: 0 })
          .then((centered) => { if (centered) fittedWorldKey.current = fitKey; });
        return;
      }
      void flow.fitView({ nodes: world.nodes.map((node) => ({ id: node.id })), padding: 0.18, maxZoom: 0.85, duration: 0 })
        .then((fitted) => { if (fitted) fittedWorldKey.current = fitKey; });
    }, 100);
    return () => clearTimeout(timer);
  }, [flow, journey, mapSize, nodes, selectedId, world]);

  useEffect(() => {
    if (!journey || !mapSize.width || !mapSize.height) return;
    const fitKey = `${journey.id}:${mapSize.width}:${mapSize.height}`;
    if (fittedJourneyKey.current === fitKey) return;
    const routeIds = journey.nodes.map((stop) => journeyNodeId(world, stop.trackId));
    if (!routeIds.every((id) => nodes.some((node) => node.id === id))) return;
    const timer = setTimeout(() => {
      void flow.fitView({ nodes: routeIds.map((id) => ({ id })), padding: 0.3, maxZoom: 0.9, duration: 450 })
        .then((fitted) => { if (fitted) fittedJourneyKey.current = fitKey; });
    }, 100);
    return () => clearTimeout(timer);
  }, [flow, journey, mapSize, nodes, world]);

  const edges = useMemo<Edge[]>(() => [...projectDisplayEdges(world, selectedId).map((edge) => {
    const active = edge.source === selectedId || edge.target === selectedId;
    const compact = mapSize.width < 600;
    return { id: edge.id, source: edge.source, target: edge.target, type: "straight", zIndex: 1,
      style: { stroke: active ? "#f2c879" : "#b69b72", strokeWidth: active ? 2 : 1,
        opacity: active ? compact ? 0.65 : 0.85 : compact ? 0.12 : 0.27 } };
  }), ...journeyEdges(world, journey)], [world, journey, selectedId, mapSize.width]);

  return <div className="music-map" data-testid="music-map" ref={mapRef}>
    <ReactFlow<MapNode, Edge> nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange}
      onNodeClick={(_, node) => setSelectedId(node.id)} onNodeMouseEnter={(_, node) => setHover(node.data.label)} onNodeMouseLeave={() => setHover("")}
      minZoom={0.18} maxZoom={2.2} panOnDrag zoomOnScroll zoomOnPinch
      nodesConnectable={false} elementsSelectable proOptions={{ hideAttribution: false }}>
      <Background color="#6a563930" gap={28} />
      <Controls showInteractive={false} />
    </ReactFlow>
    <div className="map-hint" aria-live="polite">{hover ? `悬停：${hover}` : mapSize.width < 600
      ? "当前节点居中 · 双指缩放 · 拖动地图 · 上方快速定位"
      : world.nodes.length > 12 ? "当前节点居中 · 滚轮缩放 · 左下角适配全图" : "滚轮缩放 · 拖动地图 · 左下角适配全图"}</div>
  </div>;
}

function WorldContent({ world, tracks, savedJourneys, initialJourney, entryView = "map" }: { world: WorldData; tracks: WorldTrack[]; savedJourneys: SavedJourney[]; initialJourney?: MusicJourney; entryView?: "map" | "journey" | "guide" }) {
  const { travel } = useSceneTransition();
  const first = useMemo(() => [...world.nodes].sort((a, b) => world.edges.filter((edge) => edge.source === b.id || edge.target === b.id).length - world.edges.filter((edge) => edge.source === a.id || edge.target === a.id).length)[0], [world]);
  const [selectedId, setSelectedId] = useState(first?.id ?? "");
  const [journey, setJourney] = useState(initialJourney);
  const [view, setView] = useState<"map" | "journey">(initialJourney || entryView === "journey" ? "journey" : "map");
  const [saved, setSaved] = useState(savedJourneys);
  const [intent, setIntent] = useState(initialJourney?.intent === "基础探索" ? "" : initialJourney?.intent ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [focus, setFocus] = useState<FocusRequest>();
  const focusSerial = useRef(0);
  const creating = useRef(false);
  const selectedStop = journey?.nodes.find((stop) => `route:${stop.trackId}` === selectedId);
  const selected: WorldNode | undefined = world.nodes.find((node) => node.id === selectedId)
    ?? (selectedStop
      ? { id: selectedId, type: "track", label: selectedStop.track.title,
        trackId: selectedId.slice(6), weight: 1, metadata: { trackIds: [selectedId.slice(6)], basis: "已保存路线中的真实歌曲" } } : undefined);
  const attachedEdges = world.edges.filter((edge) => edge.source === selectedId || edge.target === selectedId);

  function focusNode(id: string) {
    focusSerial.current += 1;
    setSelectedId(id); setFocus({ id, serial: focusSerial.current });
  }
  async function create(direction = intent) {
    if (!selected || creating.current) return;
    creating.current = true;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/journeys", { method: "POST", headers: { "Content-Type": "application/json", "X-Music-World": "1" },
        body: JSON.stringify({ worldId: world.id, ...(selected.id.startsWith("route:") ? { startTrackId: selected.trackId } : { startNodeId: selected.id }),
          length: 5, ...(direction.trim() ? { intent: direction.trim() } : {}) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "路线生成失败。");
      const created = result as MusicJourney;
      await travel({ label: "五站 Journey", action: () => {
        setJourney(created);
        setSaved((previous) => [{ id: created.id, title: created.title, mode: created.mode, createdAt: created.createdAt }, ...previous]);
        focusNode(journeyNodeId(world, created.nodes[0].trackId));
        setView("journey");
      } });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "路线生成失败。"); }
    finally { creating.current = false; setBusy(false); }
  }
  function focusStop(trackId: string) {
    focusNode(journeyNodeId(world, trackId));
  }
  function changeView(next: "map" | "journey") {
    if (next !== view) void travel({ label: next === "map" ? "关系地图" : "Journey", action: () => setView(next) });
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(world, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `music-world-${world.id}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="world-stage-content">
    <div className="world-command-bar">
    <div className="world-stage-tabs" aria-label="音乐世界的探索层">
      <button type="button" aria-pressed={view === "map"} className={view === "map" ? "is-active" : ""} onClick={() => changeView("map")}><span>01</span> 关系地图 <small>点击节点，找到起点</small></button>
      <button type="button" aria-pressed={view === "journey"} className={view === "journey" ? "is-active" : ""} onClick={() => changeView("journey")}><span>02</span> Journey <small>沿着路线继续探索</small></button>
    </div>
    <div className="stats world-stats"><div><strong>{world.totalTracks}</strong><span>音乐库歌曲</span></div><div><strong data-testid="world-node-count">{world.nodes.length}</strong><span>主要节点</span></div><div><strong>{world.edges.length}</strong><span>有依据的连接</span></div><div><strong>{world.hiddenTracks}</strong><span>未单独展开</span></div></div>
    </div>
    <div className="map-toolbar"><span>探索 {projectDisplayEdges(world, selectedId).length} 条代表性连接 <i aria-hidden="true">·</i> 橙色虚线指引 Journey</span>
      <div className="map-tools"><label htmlFor="node-picker">快速定位</label><select id="node-picker" aria-label="快速定位节点" value={world.nodes.some((node) => node.id === selectedId) ? selectedId : ""}
        onChange={(event) => { if (event.target.value) focusNode(event.target.value); }}>
        <option value="" disabled>选择主要节点</option>{world.nodes.map((node) => <option key={node.id} value={node.id}>{nodeKindLabels[node.type]} · {node.label}</option>)}
      </select><button className="export-button" onClick={download}>下载世界 JSON ↓</button></div></div>
    <div className={`world-experience ${view === "journey" ? "world-journey-view" : ""}`}><MapCanvas world={world} journey={journey} selectedId={selectedId} setSelectedId={setSelectedId} focus={focus} />
      {view === "map" ? <MusicCard node={selected} worldId={world.id} worldNodes={world.nodes} journeyId={journey?.id} tracks={tracks} edges={attachedEdges}
        intent={intent} onIntentChange={setIntent} onJourney={() => void create()} onGuideRecommend={focusNode}
        onGuideDirection={(question) => { setIntent(question); void create(question); }} busy={busy} openGuide={entryView === "guide"} />
        : <div className="world-journey-side">{!journey && <div className="world-journey-prompt"><strong>下一站，从地图开始。</strong><p>先返回地图，选中一首歌或一个节点，再生成 Journey。</p><button type="button" className="primary-button" onClick={() => changeView("map")}>返回地图选择起点 →</button></div>}<JourneyPanel journey={journey} saved={saved} onSelectStop={focusStop} /></div>}</div>
    {error && <p className="error-box" role="alert">{error}</p>}
    {initialJourney && <p className="preview-note"><Link href={`/world/${world.id}`}>← 返回世界</Link> · 本路线已保存，刷新后仍可继续探索。</p>}
  </div>;
}

export function MusicWorld({ world, tracks, savedJourneys, initialJourney, entryView }: { world: WorldData; tracks: WorldTrack[]; savedJourneys: SavedJourney[]; initialJourney?: MusicJourney; entryView?: "map" | "journey" | "guide" }) {
  return <ReactFlowProvider><WorldContent world={world} tracks={tracks} savedJourneys={savedJourneys} initialJourney={initialJourney} entryView={entryView} /></ReactFlowProvider>;
}
