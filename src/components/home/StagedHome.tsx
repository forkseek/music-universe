"use client";

import { useEffect, useRef, useState } from "react";
import type { listProviderStatuses } from "@/lib/music/providers/registry";
import { PlaylistFileImport } from "@/components/import/PlaylistFileImport";
import { QQMusicConnector } from "@/components/import/QQMusicConnector";
import { LibraryWorkspace } from "@/components/library/LibraryWorkspace";
import { SceneBackdrop, type SceneBackdropName } from "./SceneBackdrop";
import { ImmersiveHall } from "./ImmersiveHall";
import { hallModules, hallStageFromHash, type HallStage } from "./hall-modules";
import { originFromEvent, useSceneTransition, type SceneOrigin } from "./SceneTransition";
import { WorldDirectory } from "./WorldDirectory";
import { MusicPlayer } from "@/components/player/MusicPlayer";
import { AlbumUniverseRoom } from "./AlbumUniverseRoom";

const backgrounds: Record<HallStage, SceneBackdropName> = { hall: "intro", universe: "world", import: "import", library: "library", demo: "demo", qq: "qq", world: "world", journey: "journey", guide: "world" };

export function StagedHome({ providers }: { providers: Awaited<ReturnType<typeof listProviderStatuses>> }) {
  const { travel, travelling } = useSceneTransition();
  const [stage, setStage] = useState<HallStage>("hall");
  const [busy, setBusy] = useState(false);
  const stageRef = useRef<HallStage>("hall");
  const openingDemo = useRef(false);
  const screen = useRef<HTMLDivElement>(null);
  const currentModule = hallModules.find((item) => item.id === stage);
  const qq = providers.find((provider) => provider.id === "qqmusic");

  useEffect(() => {
    const frame = requestAnimationFrame(() => { const initial = hallStageFromHash(); stageRef.current = initial; setStage(initial); });
    const followHistory = () => {
      const next = hallStageFromHash();
      if (next === stageRef.current) return;
      void travel({ label: next === "universe" ? "专辑宇宙" : hallModules.find((item) => item.id === next)?.title ?? "音乐大厅", visualOnly: next === "universe" || stageRef.current === "universe", action: () => { stageRef.current = next; setStage(next); } });
    };
    window.addEventListener("popstate", followHistory);
    window.addEventListener("hashchange", followHistory);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("popstate", followHistory); window.removeEventListener("hashchange", followHistory); };
  }, [travel]);

  useEffect(() => { if (screen.current) screen.current.scrollTop = 0; }, [stage]);

  function enter(next: HallStage, origin?: SceneOrigin) {
    if (next === stageRef.current) return;
    void travel({ label: next === "universe" ? "专辑宇宙" : hallModules.find((item) => item.id === next)?.title ?? "音乐大厅", visualOnly: next === "universe" || stageRef.current === "universe", origin, action: () => {
      stageRef.current = next;
      setStage(next);
      window.history.pushState(null, "", `#${next}`);
    } });
  }

  async function readResponse(response: Response) {
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message ?? "暂时无法打开音乐世界，请重试。");
    return result;
  }

  async function openDemo(origin: SceneOrigin) {
    if (openingDemo.current) return;
    openingDemo.current = true;
    setBusy(true);
    try {
      await travel({ label: "Demo 音乐世界", origin, action: async () => {
        const library = await readResponse(await fetch("/api/library?scope=demo", { cache: "no-store", signal: AbortSignal.timeout(15000) }));
        if (library.worlds.length) return `/world/${library.worlds[0].id}`;
        await readResponse(await fetch("/api/imports/demo", { method: "POST", headers: { "X-Music-World": "1" }, signal: AbortSignal.timeout(15000) }));
        const result = await readResponse(await fetch("/api/worlds", { method: "POST", headers: { "Content-Type": "application/json", "X-Music-World": "1" }, body: JSON.stringify({ name: "Demo Music World", scope: "demo" }), signal: AbortSignal.timeout(15000) }));
        return `/world/${result.world.id}`;
      } });
    } finally { setBusy(false); openingDemo.current = false; }
  }

  return <><SceneBackdrop scene={backgrounds[stage]} /><main className={`mw-portal-app ${stage === "hall" ? "is-in-hall" : stage === "universe" ? "is-in-universe" : "is-in-module"}`} tabIndex={-1} data-scene-focus data-module={stage}>
    <ImmersiveHall active={stage === "hall"} onEnterUniverse={(origin) => enter("universe", origin)} />
    {stage === "universe" && <AlbumUniverseRoom onNavigate={(room) => enter(room)} />}
    <div className="mw-module-shell" hidden={stage === "hall" || stage === "universe"}>
      <header className="mw-module-header"><button className="mw-module-brand" type="button" onClick={(event) => enter("hall", originFromEvent(event))}>music<span>world</span></button><span className="mw-module-current"><i aria-hidden="true">{currentModule?.symbol}</i>{currentModule?.icon} <span aria-hidden="true">/</span> <strong>{currentModule?.title}</strong></span><button className="mw-return-hall" type="button" onClick={(event) => enter("hall", originFromEvent(event))}>回到音乐大厅 <span aria-hidden="true">↶</span></button></header>
      <div className="mw-module-scroll" ref={screen}>
        <section className="mw-module-room" hidden={stage !== "import"} aria-label="话筒 · 导入歌单"><div className="mw-module-intro"><p className="mw-overline">MICROPHONE / BRING YOUR MUSIC</p><h1>把喜欢的歌，<span>带进这个世界。</span></h1><p>先预览整理结果，再保存到音乐库。</p></div><div className="mw-stage-workspace"><PlaylistFileImport onSaved={() => enter("library")} /></div></section>
        <section className="mw-module-room" hidden={stage !== "library"} aria-label="唱片 · 我的曲库"><div className="mw-module-intro"><p className="mw-overline">VINYL / YOUR MUSIC COLLECTION</p><h1>让收藏，<span>慢慢成为世界。</span></h1><p>从这些歌出发，生成并保存你的音乐世界。</p></div><div className="mw-stage-workspace"><LibraryWorkspace showImport={false} showQQ={false} showDemoAction={false} active={stage === "library"} onImport={() => enter("import")} /></div></section>
        <section className="mw-demo-scene mw-module-demo" hidden={stage !== "demo"} aria-labelledby="demo-title"><div className="mw-demo-art" role="img" aria-label="音乐向导站在金色光环里"><span>YOUR FIRST JOURNEY</span><div><small>向导邀请函 / 001</small><strong>下一站，音乐世界。</strong></div></div><div className="mw-demo-copy"><p className="mw-overline">GUITAR / YOUR FIRST DISCOVERY</p><h1 id="demo-title">跟着光，<br /><span>先去看看。</span></h1><p>从 60 首歌、20 位艺术家之间出发。点开一个熟悉的名字，沿着音乐的连接，开启你的五站 Journey。</p><div className="mw-demo-facts"><span><strong>60</strong> 首歌曲</span><span><strong>20</strong> 位艺术家</span><span><strong>5</strong> 站旅程</span></div><button className="mw-cta mw-cta-primary" type="button" disabled={busy || travelling} onClick={(event) => void openDemo(originFromEvent(event))}>{busy ? "正在打开音乐世界…" : "打开 Demo 世界"} <span aria-hidden="true">↗</span></button><small>这是一份独立的演示曲库，与你的个人收藏分开保存。</small></div></section>
        <section className="mw-module-room" hidden={stage !== "qq"} aria-label="耳机 · 连接音乐"><div className="mw-module-intro"><p className="mw-overline">HEADPHONES / CONNECT YOUR MUSIC</p><h1>熟悉的音乐，<span>新的相遇。</span></h1><p>{qq?.available ? "通过当前可用的官方连接，把你的音乐带到这里。" : "查看当前环境的官方连接状态，也可以带来歌单文件。"}</p></div><div className="mw-stage-workspace"><QQMusicConnector onImported={() => enter("library")} /></div><button className="mw-inline-next" type="button" onClick={() => enter("import")}>改用歌单文件导入 →</button></section>
        <section className="mw-module-room mw-player-room" hidden={stage !== "world"} aria-label="互动音乐播放界面"><MusicPlayer active={stage === "world"} onChoose={(next) => enter(next)} /></section>
        {(["journey", "guide"] as const).map((mode) => <section className="mw-module-room" key={mode} hidden={stage !== mode} aria-label={hallModules.find((item) => item.id === mode)?.title}><WorldDirectory active={stage === mode} mode={mode} onChoose={(next) => enter(next)} /></section>)}
      </div>
      <footer className="mw-module-footer"><span>{currentModule?.title} / MUSIC WORLD</span><span>每一首歌，都是一个入口。</span></footer>
    </div>
  </main></>;
}
