"use client";

import { useEffect, useRef, useState } from "react";
import { checkQQMusicSDKAvailability, createQQMusicBrowserProvider, getQQMusicBrowserSDK, qqMusicAvailability } from "@/lib/music/providers/qqmusic";
import type { MusicProvider, ProviderAvailability, ProviderPlaylist, ProviderTrack } from "@/lib/music/providers/types";
import type { QQMusicImportPayload } from "@/lib/music/providers/qqmusic-payload";

const enabled = process.env.NEXT_PUBLIC_ENABLE_QQMUSIC === "true";

function importSong(track: ProviderTrack): QQMusicImportPayload["tracks"][number] {
  const externalId = track.source.externalId;
  if (!externalId) throw new Error("QQ 音乐歌曲缺少官方 ID，无法导入。");
  return { title: track.title, artists: track.artists, album: track.album, durationMs: track.durationMs,
    externalId, externalUrl: track.source.externalUrl };
}

export function QQMusicConnector({ onImported }: { onImported: () => void }) {
  const provider = useRef<MusicProvider | null>(null);
  const [status, setStatus] = useState<ProviderAvailability>(() => qqMusicAvailability(enabled));
  const [playlists, setPlaylists] = useState<ProviderPlaylist[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  async function refresh() {
    const sdk = getQQMusicBrowserSDK();
    provider.current = sdk ? createQQMusicBrowserProvider(sdk, enabled) : null;
    const next = await checkQQMusicSDKAvailability(sdk, enabled);
    setStatus(next);
    if (!next.available) { setPlaylists([]); setSelectedId(""); }
  }
  useEffect(() => {
    const sdk = getQQMusicBrowserSDK();
    provider.current = sdk ? createQQMusicBrowserProvider(sdk, enabled) : null;
    let mounted = true;
    void checkQQMusicSDKAvailability(sdk, enabled).then((next) => { if (mounted) setStatus(next); });
    return () => { mounted = false; };
  }, []);

  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(""); setResult("");
    try { await work(); }
    catch {
      const next = await checkQQMusicSDKAvailability(getQQMusicBrowserSDK(), enabled);
      setStatus(next);
      if (!next.available) { setPlaylists([]); setSelectedId(""); }
      setError(next.available ? "QQ 音乐操作未完成，可能是歌单响应或连接出现问题；请重试或改用歌单文件。"
        : `${next.message} 可改用歌单文件。`);
    }
    finally { setBusy(false); }
  }

  async function post(payload: QQMusicImportPayload) {
    const response = await fetch("/api/imports/qqmusic", { method: "POST", headers: {
      "Content-Type": "application/json", "X-Music-World": "1",
    }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message ?? "QQ 音乐导入失败，请重试。");
    setResult(data.reused ? "这批音乐已导入过，未重复增加记录。"
      : `已保存 ${data.addedTracks} 首新歌曲、${data.addedSources} 条来源。`);
    onImported();
  }

  return <section id="qq-connector" className="qq-connector import-panel" aria-label="QQ 音乐官方连接">
    <div className="panel-heading"><div><p className="eyebrow muted">官方来源 / 按环境开放</p><h2>QQ 音乐官方连接</h2></div>
      <span className={`demo-badge ${status.available ? "qq-ready" : ""}`}>{status.available ? "当前面板报告已授权" : "当前不可用"}</span></div>
    <p className="preview-note">仅在腾讯连连官方 H5 面板、功能开关开启且授权成功时读取歌单元数据；普通浏览器可继续使用文件或 Demo。</p>
    <p role="status">{status.available ? "当前浏览器的 SDK 返回已授权，可读取个人歌单和最近播放。" : status.message}</p>
    {enabled && <div className="qq-actions"><button type="button" className="export-button" disabled={busy} onClick={() => void run(refresh)}>重新检测环境</button>
      {!status.available && status.reason === "OFFICIAL_AUTH_REQUIRED"
        && <button type="button" className="primary-button" disabled={busy} onClick={() => void run(async () => { await provider.current!.connect!(); })}>前往官方授权 ↗</button>}
      {status.available && <><button type="button" className="export-button" disabled={busy}
        onClick={() => void run(async () => { const list = await provider.current!.listPlaylists!(); setPlaylists(list); setSelectedId(list[0]?.externalId ?? ""); })}>读取我的歌单</button>
        <button type="button" className="export-button" disabled={busy} onClick={() => void run(async () => {
          const songs = await provider.current!.getRecentTracks!();
          if (!songs.length) { setResult("当前没有可导入的最近播放歌曲。"); return; }
          await post({ kind: "recent", tracks: songs.map(importSong) });
        })}>导入最近播放</button></>}
    </div>}
    {status.available && playlists.length > 0 && <div className="qq-playlist-picker"><label htmlFor="qq-playlist">选择个人歌单</label>
      <select id="qq-playlist" value={selectedId} onChange={(event) => setSelectedId(event.target.value)} disabled={busy}>
        {playlists.map((item) => <option key={item.externalId} value={item.externalId}>{item.name} · {item.trackCount ?? "?"} 首</option>)}</select>
      <button className="primary-button" type="button" disabled={busy || !selectedId} onClick={() => void run(async () => {
        const playlist = playlists.find((item) => item.externalId === selectedId);
        if (!playlist) throw new Error("请重新选择歌单。");
        const songs = await provider.current!.getPlaylistTracks!(playlist.externalId);
        if (!songs.length) { setResult("这个歌单为空，无需导入。"); return; }
        await post({ kind: "playlist", playlist: { externalId: playlist.externalId, name: playlist.name }, tracks: songs.map(importSong) });
      })}>{busy ? "正在读取并保存…" : "导入所选歌单"}</button></div>}
    {error && <p className="error-box" role="alert">{error}</p>}
    {result && <p className="preview-note" role="status">{result}</p>}
  </section>;
}
