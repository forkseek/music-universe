"use client";

import { useState } from "react";

const nodes = [
  { id: "song", label: "一首歌", kind: "歌曲", x: 42, y: 43, detail: "点击地图上的歌曲，查看它与艺术家、专辑和其他歌曲的关系。" },
  { id: "artist", label: "艺术家", kind: "艺术家", x: 25, y: 37, detail: "同一位艺术家的作品会自然聚在一起；每条连接都能查看依据。" },
  { id: "album", label: "专辑", kind: "专辑", x: 30, y: 21, detail: "来自同一张专辑的歌曲，沿着共同的出处彼此相连。" },
  { id: "track", label: "另一首歌", kind: "歌曲", x: 53, y: 20, detail: "从一首歌走到另一首歌，再继续探索你熟悉的音乐。" },
  { id: "genre", label: "流派", kind: "流派", x: 58, y: 54, detail: "有明确流派标签的歌曲，也能在地图上形成新的入口。" },
] as const;

export function HomeExperience({ onStart }: { onStart: () => void }) {
  const [selected, setSelected] = useState<(typeof nodes)[number]["id"]>("song");
  const current = nodes.find((node) => node.id === selected) ?? nodes[0];

  return (
    <section className="mw-hero" aria-labelledby="hero-title">
      <div className="mw-hero-copy">
        <p className="mw-overline"><span className="mw-live-dot" /> A WORLD WITHIN YOUR MUSIC</p>
        <h1 id="hero-title">循着音乐，<br />遇见<span>另一个世界。</span></h1>
        <p className="mw-hero-description">每一首喜欢的歌，都是一个入口。跟随音乐向导，发现歌曲之间的连接，走出一条属于你的旅程。</p>
        <div className="mw-hero-actions">
          <button className="mw-cta mw-cta-primary" type="button" onClick={onStart}>走进音乐世界 <span aria-hidden="true">↗</span></button>
        </div>
        <p className="mw-hero-status">带上你的歌单，或从一场 Demo 开始。</p>
        <div className="mw-hero-proof"><span className="mw-proof-orbit" aria-hidden="true">♫</span><p><strong>一个起点，无数次相遇</strong><span>YOUR MUSIC. YOUR JOURNEY.</span></p></div>
      </div>

      <div className="mw-preview" aria-label="点击金色大厅里的音乐图标，了解音乐世界">
        <div className="mw-preview-top"><span>THE MUSIC HALL</span><span>点击光点，发现连接 <span aria-hidden="true">↘</span></span></div>
        <div className="mw-preview-canvas">
          {nodes.map((node) => <button key={node.id} type="button" style={{ left: `${node.x}%`, top: `${node.y}%` }}
            className={`mw-preview-node mw-preview-node-${node.id} ${selected === node.id ? "is-selected" : ""}`}
            aria-pressed={selected === node.id} onClick={() => setSelected(node.id)}><span className="mw-node-glyph" aria-hidden="true">{node.id === "song" ? "♫" : node.id === "track" ? "♪" : node.id === "artist" ? "✳" : node.id === "album" ? "▣" : "◈"}</span><span><small>{node.kind}</small><strong>{node.label}</strong></span></button>)}
        </div>
        <div className="mw-preview-info"><span className="mw-preview-info-icon" aria-hidden="true">↗</span><div aria-live="polite"><span>当前选中 · {current.kind}</span><strong>{current.label}</strong><p>{current.detail}</p></div></div>
        <div className="mw-preview-footer"><span><i /> 你的音乐向导已就位</span><span>音乐关系交互示意</span></div>
      </div>
    </section>
  );
}
