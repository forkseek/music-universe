"use client";

import { useEffect, useRef, useState } from "react";

export const OPENING_SEEN_KEY = "music-world:opening-seen:v1";

export function OpeningFilm({ onComplete }: { onComplete: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const skip = useRef<HTMLButtonElement>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    skip.current?.focus();
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      void video.current?.play().catch(() => setPlaying(false));
    }
  }, []);

  async function togglePlayback() {
    const film = video.current;
    if (!film) return;
    if (!film.paused) { film.pause(); return; }
    try { await film.play(); } catch { setPlaying(false); }
  }

  function toggleSound() {
    const next = !muted;
    if (video.current) video.current.muted = next;
    setMuted(next);
  }

  return <div className="mw-opening" role="dialog" aria-modal="true" aria-label="Music World 开场动画" onKeyDown={(event) => {
    if (event.key === "Escape") onComplete();
    if (event.key === "Tab") {
      const controls = event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <video ref={video} className="mw-opening-video" src="/media/music-world-opening.mp4" poster="/media/scene-arrival.webp"
      width={1344} height={768} muted={muted} playsInline preload="auto" aria-label="小机器人走进金色音乐大厅，探索发光的音乐关系网"
      onCanPlay={() => setReady(true)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
      onTimeUpdate={(event) => { const film = event.currentTarget; setProgress(film.duration ? film.currentTime / film.duration : 0); }}
      onEnded={onComplete} onError={() => { setFailed(true); setPlaying(false); }}>
      当前浏览器无法播放开场动画，可使用“进入音乐世界”继续。
    </video>
    <div className="mw-opening-shade" aria-hidden="true" />
    <div className="mw-opening-top"><span className="mw-film-brand">music<span>world</span><small>跟着音乐，走进你的世界</small></span><button ref={skip} type="button" className="mw-film-button" onClick={onComplete}>跳过动画 <span aria-hidden="true">↗</span></button></div>
    {!playing && <div className="mw-film-center">
      {failed ? <><p role="status">开场暂时无法播放，你可以直接进入。</p><button type="button" className="mw-film-play" onClick={onComplete}>进入音乐世界 →</button></>
        : <button type="button" className="mw-film-play" onClick={() => void togglePlayback()}>{ready ? "▶ 播放开场" : "▶ 开始播放"}</button>}
    </div>}
    <div className="mw-opening-bottom"><div className="mw-film-caption"><span>序章 / MUSIC COMES ALIVE</span><strong>每一首歌，都通向新的相遇。</strong></div><div className="mw-film-controls">
      <button type="button" className="mw-film-button" disabled={failed} aria-label={playing ? "暂停开场" : "播放开场"} onClick={() => void togglePlayback()}>{playing ? "暂停" : "播放"}</button>
      <button type="button" className="mw-film-button" disabled={failed} aria-pressed={!muted} onClick={toggleSound}>{muted ? "开启声音" : "关闭声音"}</button>
    </div><progress className="mw-film-progress" value={progress} max={1} aria-label="开场播放进度" /></div>
  </div>;
}
