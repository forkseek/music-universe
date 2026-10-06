"use client";

import { motion, useReducedMotion } from "motion/react";
import type { MusicEdge, MusicNode, WorldTrack } from "@/types/world";
import { GuidePanel } from "@/components/guide/GuidePanel";

const providerNames: Record<string, string> = { qqmusic: "QQ 音乐", netease: "网易云音乐", kugou: "酷狗音乐", qishui: "汽水音乐", spotify: "Spotify" };

export function MusicCard({ node, worldId, worldNodes, journeyId, tracks, edges, intent, onIntentChange, onJourney,
  onGuideRecommend, onGuideDirection, busy, openGuide = false }: { node?: MusicNode; worldId: string; worldNodes: Pick<MusicNode, "id" | "label">[]; journeyId?: string;
  tracks: WorldTrack[]; edges: MusicEdge[]; intent: string; onIntentChange: (value: string) => void; onJourney: () => void;
  onGuideRecommend: (nodeId: string) => void; onGuideDirection: (question: string) => void; busy: boolean; openGuide?: boolean }) {
  const reducedMotion = useReducedMotion();
  if (!node) return <aside className="node-inspector"><p>点击地图节点，查看歌曲及关系依据。</p></aside>;
  const related = tracks.filter((track) => node.metadata.trackIds.includes(track.id));
  const track = node.trackId ? related.find((item) => item.id === node.trackId) : undefined;
  const year = track?.releaseDate?.match(/^\d{4}/u)?.[0];
  const labels = new Map(worldNodes.map((item) => [item.id, item.label]));
  const connectionItem = (edge: MusicEdge) => {
    const otherId = edge.source === node.id ? edge.target : edge.source;
    return <li key={edge.id}><button type="button" onClick={() => onGuideRecommend(otherId)}
      aria-label={`查看连接节点 ${labels.get(otherId) ?? "关联节点"}`}>
      <strong>前往「{labels.get(otherId) ?? "关联节点"}」 ↗</strong><span>{edge.reason}</span>
      <small>{edge.evidence.trackIds.length} 首已导入歌曲支持</small></button></li>;
  };
  return <motion.aside key={node.id} className={`node-inspector ${openGuide ? "is-guide-open" : ""}`} data-testid="music-card"
    initial={reducedMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.2, ease: "easeOut" }}>
    <p className="eyebrow muted">{node.type === "track" ? "歌曲" : node.type === "artist" ? "艺术家" : node.type === "album" ? "专辑" : "流派"} / 关系卡片</p>
    <h2>{node.label}</h2>
    <div className="journey-launch">
      <span className="eyebrow muted">START YOUR JOURNEY</span>
      <label className="journey-intent-label" htmlFor="journey-intent">下一站，想遇见什么？</label>
      <input id="journey-intent" className="journey-intent-input" value={intent} onChange={(event) => onIntentChange(event.target.value)}
        maxLength={120} placeholder="例如：更梦幻一点（选填）" />
      <button className="primary-button journey-create" disabled={busy || !related.length} onClick={onJourney}>{busy ? "正在生成路线…" : "从这里开启 5 站 Journey →"}</button>
      <details className="journey-method"><summary>路线如何生成</summary><p className="intent-hint">每一站从已导入的歌曲中选择。未连接模型时，基础路线按曲库里明确的流派标签匹配已知方向。</p></details>
    </div>
    {track ? <dl className="card-facts"><div><dt>艺术家</dt><dd>{track.artists.join(" / ")}</dd></div><div><dt>专辑</dt><dd>{track.album ?? "未提供"}</dd></div>
      <div><dt>流派</dt><dd>{track.genre?.join("、") || "未提供"}</dd></div><div><dt>年份</dt><dd>{year ?? "未提供"}</dd></div><div><dt>版本</dt><dd>{track.versionKey === "original" ? "未标注" : track.versionKey}</dd></div></dl> : <p>{node.metadata.basis}；关联 {related.length} 首已导入歌曲。</p>}
    {track && <div className="platform-links">{track.sourceLinks.length ? track.sourceLinks.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer">前往{providerNames[link.provider] ?? "来源平台"} ↗</a>) : <p>当前来源未提供可用的歌曲网页链接。</p>}</div>}
    {!track && related.length > 0 && <details className="related-tracks"><summary>关联歌曲（{related.length}）</summary><ul>{related.slice(0, 20).map((item) => <li key={item.id}>{item.title} · {item.artists.join(" / ")}</li>)}</ul>{related.length > 20 && <p>这里展示前 20 首。</p>}</details>}
    <details className="connection-disclosure"><summary>连接依据 <span>{edges.length} 条连接 ＋</span></summary>
    {edges.length ? <><ul className="card-edges">{edges.slice(0, 4).map(connectionItem)}</ul>
      {edges.length > 4 && <details className="more-connections"><summary>查看其余 {edges.length - 4} 条连接</summary>
        <ul className="card-edges">{edges.slice(4, 15).map(connectionItem)}</ul></details>}</> : <p>这个节点目前没有可证明的直接连接。</p>}
    {edges.length > 15 && <p>这里展示前 15 条；完整关系可下载世界 JSON。</p>}
    </details>
    <details className="guide-disclosure" open={openGuide || undefined}><summary>问问音乐向导 <span>＋</span></summary><GuidePanel key={node.id} worldId={worldId} nodeId={node.id} journeyId={journeyId} worldNodes={worldNodes}
      canJourney={related.length > 0} journeyBusy={busy} onRecommend={onGuideRecommend} onDirection={onGuideDirection} />
    </details>
  </motion.aside>;
}
