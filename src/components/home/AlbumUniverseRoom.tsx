"use client";

import { useEffect, useRef, useState } from "react";
import type { HallStage } from "./hall-modules";

const rooms = ["hall", "world", "library", "journey"] as const;

/** The existing Three.js application is built into public/universe on this origin. */
export function AlbumUniverseRoom({ onNavigate }: { onNavigate: (room: HallStage) => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const navigate = useRef(onNavigate);
  const [ready, setReady] = useState(false), [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => { navigate.current = onNavigate; }, [onNavigate]);
  useEffect(() => {
    const timer = window.setTimeout(() => setFailed(true), 45000);
    const message = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      const data: unknown = event.data;
      if (!data || typeof data !== "object") return;
      const value = data as { type?: unknown; room?: unknown };
      if (value.type === "music-universe:ready") { clearTimeout(timer); setReady(true); setFailed(false); }
      if (value.type === "music-universe:navigate" && rooms.some(room => room === value.room)) navigate.current(value.room as HallStage);
    };
    window.addEventListener("message", message);
    return () => { clearTimeout(timer); window.removeEventListener("message", message); };
  }, [attempt]);
  const reload = () => { setReady(false); setFailed(false); setAttempt(value => value + 1); };
  return <section className={`mw-universe-room${ready ? " is-ready" : ""}`} aria-label="专辑宇宙" aria-busy={!ready} data-testid="album-universe-room">
    <iframe key={attempt} ref={frame} src="/universe/index.html" title="专辑宇宙 3D 场景" allow="autoplay; fullscreen" allowFullScreen onError={() => setFailed(true)} />
    <div className="mw-universe-loading" role="status" aria-label={failed ? "专辑宇宙加载失败" : "正在加载专辑宇宙"} aria-hidden={ready} inert={ready}>
      <div className="mw-universe-loading-orbit" aria-hidden="true"><i /><i /><i /><b /></div>
      {failed && <div className="mw-universe-recovery"><button type="button" aria-label="重新加载专辑宇宙" onClick={reload}>↻</button><button type="button" aria-label="返回大厅" onClick={() => navigate.current("hall")}>↶</button></div>}
    </div>
  </section>;
}
