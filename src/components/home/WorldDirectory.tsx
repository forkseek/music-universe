"use client";

import { useEffect, useState } from "react";
import type { Library } from "@/lib/music/library";
import type { HallModule } from "./hall-modules";
import { PortalLink } from "./SceneTransition";

type WorldEntry = Library["worlds"][number] & { scope: "library" | "demo" };
export function WorldDirectory({ active, mode, onChoose }: { active: boolean; mode: "world" | "journey" | "guide"; onChoose: (module: HallModule) => void }) {
  const [worlds, setWorlds] = useState<WorldEntry[] | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    async function read(scope: "library" | "demo") {
      const response = await fetch(`/api/library?scope=${scope}`, { cache: "no-store", signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? "暂时无法读取音乐世界。");
      return (result as Library).worlds.map((world) => ({ ...world, scope }));
    }
    async function load() {
      // Establish the anonymous session before requesting the second library.
      const personal = await read("library");
      const demo = await read("demo");
      if (!controller.signal.aborted) { setWorlds([...personal, ...demo]); setError(""); }
    }
    void load().catch((cause) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "读取失败，请重试。"); });
    return () => controller.abort();
  }, [active, revision]);

  const title = mode === "guide" ? "向导在哪个世界等你？" : mode === "journey" ? "继续你的音乐旅程。" : "选择一座音乐世界。";
  const description = mode === "guide" ? "先选择一个世界，再向向导询问歌曲关系与探索方向。" : mode === "journey" ? "进入世界中的 Journey，打开保存的路线，或从一个新节点出发。" : "每个世界都由你的歌曲生成。点击进入，探索其中的真实连接。";
  const view = mode === "journey" ? "journey" : mode === "guide" ? "guide" : "map";
  return <section className="mw-world-directory" aria-labelledby={`directory-${mode}`}>
    <div className="mw-directory-heading"><div><p className="mw-overline">{mode === "journey" ? "YOUR SAVED JOURNEYS" : mode === "guide" ? "YOUR MUSIC COMPANION" : "WORLDS WAITING FOR YOU"}</p><h2 id={`directory-${mode}`}>{title}</h2><p>{description}</p></div><button type="button" className="export-button" onClick={() => setRevision((value) => value + 1)}>刷新 ↻</button></div>
    {error && <p className="error-box" role="alert">{error}</p>}
    {!worlds && !error && <p className="mw-directory-loading" role="status">正在点亮你的音乐世界…</p>}
    {worlds && worlds.length > 0 ? <div className="mw-directory-grid">{worlds.map((world, index) => <PortalLink key={world.id} href={`/world/${world.id}?view=${view}`} className="mw-directory-world" label={mode === "guide" ? "音乐向导" : mode === "journey" ? "Journey" : world.name}><span className="mw-directory-world-top">{String(index + 1).padStart(2, "0")} / {world.scope === "demo" ? "DEMO WORLD" : "YOUR WORLD"}<i aria-hidden="true">↗</i></span><span className="mw-directory-orbit" aria-hidden="true">{mode === "guide" ? "✧" : mode === "journey" ? "♡" : "♫"}</span><strong>{world.name}</strong><small>{world.totalTracks} 首歌曲 · {mode === "guide" ? "问问音乐向导" : mode === "journey" ? "查看 Journey" : "进入关系地图"}</small></PortalLink>)}</div> : worlds && <div className="mw-directory-empty"><span aria-hidden="true">✧</span><h3>从第一首歌开始。</h3><p>先带来一份歌单，或用 Demo 点亮你的第一座音乐世界。</p><div><button type="button" className="primary-button" onClick={() => onChoose("demo")}>先体验 Demo ↗</button><button type="button" className="export-button" onClick={() => onChoose("import")}>导入我的歌单 →</button></div></div>}
  </section>;
}
