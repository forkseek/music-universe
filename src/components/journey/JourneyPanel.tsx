"use client";

import { PortalLink as Link } from "@/components/home/SceneTransition";
import type { MusicJourney } from "@/types/world";

export interface SavedJourney { id: string; title: string; createdAt: Date | string; mode: "deterministic" | "ai" }

export function JourneyPanel({ journey, saved, onSelectStop }: { journey?: MusicJourney; saved: SavedJourney[]; onSelectStop: (trackId: string) => void }) {
  return <section className="journey-panel" aria-label="旅行路线">
    <div><p className="eyebrow muted">ONE SONG LEADS TO ANOTHER</p><h2>跟着音乐前行</h2><p className="preview-note">{journey?.mode === "ai"
      ? "模型建议路线；地图中的关系仍来自已导入的音乐信息。" : "沿着已导入歌曲之间的真实连接，去往下一站。"}</p></div>
    {journey ? <div className="journey-current"><div className="journey-panel-title"><h3>{journey.title}</h3><span className="demo-badge">{journey.mode === "deterministic" ? "基础路线" : "AI 路线"}</span></div>
      {journey.intent !== "基础探索" && <p className="journey-intent-summary">探索方向：{journey.intent}。{journey.mode === "deterministic"
        ? "本次由基础算法生成；仅在已导入的流派标签能够匹配时调整顺序。" : "本次由模型从已验证的候选歌曲中选择。"}</p>}
      {journey.nodes.length < journey.requestedLength && <p role="status">库中只有 {journey.nodes.length} 首可用歌曲，已展示全部实际站点。</p>}
      <ol className="journey-stops">{journey.nodes.map((stop) => <li key={stop.trackId}><button type="button" onClick={() => onSelectStop(stop.trackId)}><span className="journey-index">{String(stop.position + 1).padStart(2, "0")}</span><span><strong>{stop.track.title}</strong><small>{stop.track.artists.join(" / ")}</small><em>{journey.mode === "ai" ? `模型建议：${stop.reason}` : stop.reason}</em></span><span aria-hidden="true">定位 ↗</span></button></li>)}</ol>
      <Link href={`/journey/${journey.id}`} className="export-button journey-detail-link">打开路线详情 →</Link></div> : <p className="journey-empty">点击地图节点，查看依据并创建第一条路线。</p>}
    {saved.length > 0 && <div className="saved-journeys"><h3>已保存的路线</h3>{saved.map((item) => <Link key={item.id} href={`/journey/${item.id}`}>{item.title} →</Link>)}</div>}
  </section>;
}
