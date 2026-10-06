"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

export type MapNode = Node<{ label: string; kind: "track" | "artist" | "album" | "genre"; active: boolean; step?: number; extra?: boolean }, "music">;
const labels = { track: "歌曲", artist: "艺术家", album: "专辑", genre: "流派" };

export function MusicNodeView({ data }: NodeProps<MapNode>) {
  return <div className={`music-flow-node music-flow-${data.kind} ${data.active ? "is-active" : ""} ${data.step ? "is-route-stop" : ""}`} title={`${labels[data.kind]} · ${data.label}`}>
    <Handle type="target" position={Position.Left} isConnectable={false} />
    <span className="music-flow-type">{data.step ? `第 ${data.step} 站` : labels[data.kind]}</span>
    <strong>{data.label}</strong>
    {data.extra && <small>路线歌曲</small>}
    <Handle type="source" position={Position.Right} isConnectable={false} />
  </div>;
}
