"use client";

import { useCallback, useEffect, useState } from "react";
import { PortalLink as Link, useSceneTransition } from "@/components/home/SceneTransition";
import { PlaylistFileImport } from "../import/PlaylistFileImport";
import { QQMusicConnector } from "../import/QQMusicConnector";
import type { Library } from "@/lib/music/library";
import type { LibraryScope } from "@/types/world";

export function LibraryWorkspace({ showImport = true, showQQ = true, showDemoAction = true, active = true, onImport }: { showImport?: boolean; showQQ?: boolean; showDemoAction?: boolean; active?: boolean; onImport?: () => void } = {}) {
  const { travel } = useSceneTransition();
  const [library, setLibrary] = useState<Library | null>(null);
  const [scope, setScope] = useState<LibraryScope>("library");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [worldName, setWorldName] = useState("我的音乐世界");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async (target: LibraryScope) => {
    const response = await fetch(`/api/library?scope=${target}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message ?? "音乐库读取失败。");
    setLibrary(data); setScope(target);
  }, []);
  useEffect(() => { if (!active) return; let cancelled = false; fetch("/api/library", { cache: "no-store" }).then(async (response) => {
    const data = await response.json(); if (!response.ok) throw new Error(data.error?.message ?? "音乐库读取失败。");
    if (!cancelled) { setLibrary(data); setScope("library"); }
  }).catch((cause) => { if (!cancelled) setError(cause.message); }); return () => { cancelled = true; }; }, [active]);

  async function action(work: () => Promise<void>) {
    setBusy(true); setError("");
    try { await work(); } catch (cause) { setError(cause instanceof Error ? cause.message : "操作失败。"); }
    finally { setBusy(false); }
  }
  async function post(url: string, body?: object) {
    const response = await fetch(url, { method: "POST", headers: { "X-Music-World": "1", "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message ?? "操作失败。");
    return data;
  }

  return <>
    {showImport && <PlaylistFileImport onSaved={() => void action(() => load("library"))} />}
    <section className="import-panel library-panel" aria-labelledby="library-title">
      <div className="panel-heading"><div><p className="eyebrow muted">MUSIC ARCHIVE</p><h2 id="library-title">{scope === "demo" ? "Demo Music Library" : "我的音乐库"}</h2></div><div className="library-actions"><button className="export-button" disabled={busy} onClick={() => void action(() => load("library"))}>刷新曲库 ↻</button>{showDemoAction && <button className="sample-button" disabled={busy || !library} onClick={() => void action(async () => { await post("/api/imports/demo"); await load("demo"); setWorldName("Demo Music World"); })}>载入 Demo ↗</button>}{onImport && <button className="sample-button" type="button" onClick={onImport}>导入歌单 ＋</button>}</div></div>
      {error && <p className="error-box" role="alert">{error}</p>}
      {!library ? <p>正在读取音乐库…</p> : <>
        <div className="stats">{[["歌曲", library.counts.tracks], ["艺术家", library.counts.artists], ["专辑", library.counts.albums], ["歌单", library.counts.playlists], ["来源", library.counts.sources]].map(([label, count]) => <div key={label}><strong data-testid={`library-${label}`}>{count}</strong><span>{label}</span></div>)}</div>
        <p className="preview-note">{scope === "demo" ? "这是独立的演示库。元数据有公开来源，不会混入你的真实音乐库，也不会模拟收藏或播放记录。" : "保留歌曲、艺术家、专辑、真实声明的歌单和来源。刷新或重启服务后仍可读取；清除浏览器 Cookie 会失去此匿名会话的访问入口。"}</p>
        <div className="library-workbench"><div className="world-form"><span className="eyebrow muted">CREATE A WORLD</span><h3>为这段旅程命名</h3><label htmlFor="world-name">世界名称</label><input id="world-name" maxLength={100} value={worldName} onChange={(event) => setWorldName(event.target.value)} /><button className="primary-button" disabled={busy || !library.counts.tracks || !worldName.trim()} onClick={() => void action(async () => { await travel({ label: worldName.trim(), action: async () => { const result = await post("/api/worlds", { name: worldName.trim(), scope }); return `/world/${result.world.id}`; } }); })}>{busy ? "处理中…" : "生成音乐世界 →"}</button>{!library.counts.tracks && <p className="preview-note">导入第一份歌单后，就可以出发。</p>}</div>
        <div className="saved-worlds"><span className="eyebrow muted">CONTINUE EXPLORING</span><h3>已保存的世界</h3>{library.worlds.length ? library.worlds.map((world) => <Link key={world.id} href={`/world/${world.id}`} className="world-link"><strong>{world.name}</strong><span>{world.totalTracks} 首歌曲 →</span></Link>) : <p className="preview-note">这里等待着你的第一个音乐世界。</p>}</div></div>
        <details className="library-details"><summary>查看歌曲与导入记录</summary><ul>{library.tracks.slice(0, 100).map((track) => <li key={track.id}>{track.title} · {track.artists.map((artist) => artist.name).join(" / ")} · {track.sources.length} 条来源</li>)}</ul>{library.tracks.length > 100 && <p>此处展示前 100 首，其余歌曲完整保存在库中。</p>}<h4>导入记录</h4><ul>{library.imports.map((item) => <li key={item.id}>{item.fileName} · 有效 {item.validRecords}/{item.totalRecords} · {item.status === "failed" ? "未得到有效歌曲" : "已保存"}</li>)}</ul></details>
        <div className="delete-zone">{!confirmDelete ? <button className="danger-button" disabled={busy} onClick={() => setConfirmDelete(true)}>清空当前会话音乐库</button> : <><p>将删除此匿名会话的歌曲、来源、Demo 副本、音乐世界和 Journey 路线；其他会话与内置 Demo 模板保留。</p><button className="danger-button" disabled={busy} onClick={() => void action(async () => { const response = await fetch("/api/library", { method: "DELETE", headers: { "X-Music-World": "1" } }); if (!response.ok) throw new Error("删除失败，请重试。"); setConfirmDelete(false); await load("library"); })}>确认清空我的数据</button><button className="export-button" onClick={() => setConfirmDelete(false)}>取消</button></>}</div>
      </>}
    </section>
    {showQQ && <QQMusicConnector onImported={() => void action(() => load("library"))} />}
  </>;
}
