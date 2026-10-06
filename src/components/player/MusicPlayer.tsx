"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { cancelQqLogin, listeningConnection, listeningLyrics, logoutQqLogin, pollQqLogin, searchListeningPage, searchListeningTracks, startQqLogin, type ListeningConnection } from "@/lib/music/providers/radiohand-browser";
import { WorldDirectory } from "@/components/home/WorldDirectory";
import type { HallModule } from "@/components/home/hall-modules";
import { MusicAtmosphere } from "./MusicAtmosphere";
import { clockTime, parseLyrics, type ListeningTrack } from "./player-library";
import { useMusicPlayback } from "./useMusicPlayback";

type Panel = "queue" | "search" | "lyrics" | "map" | "source" | null;
type TrackSource = "all" | ListeningTrack["source"];
type QrLogin = { image: string; authorizeUrl?: string; loginId: string; expiresAt: number; status: "pending" | "scanned" | "authorizing" | "cancelled" | "expired" | "success" | "error"; message: string; nickname?: string };
type IconName = "play" | "pause" | "prev" | "next" | "queue" | "lyrics" | "music" | "search" | "close" | "heart" | "shuffle" | "repeat" | "volume" | "mute" | "upload" | "world" | "focus" | "refresh" | "arrow" | "headphones";

const BRIDGE_CONFIG = "APP_ORIGIN=http://127.0.0.1:3002\nRADIOHAND_API_ORIGIN=http://127.0.0.1:3000";

const paths: Record<IconName, string> = {
  play: "M8 5.5 19 12 8 18.5Z", pause: "M7 5h3v14H7z M14 5h3v14h-3z",
  prev: "M6 5v14 M19 5l-10 7 10 7z", next: "M18 5v14 M5 5l10 7-10 7z",
  queue: "M4 6h16 M4 11h16 M4 16h11 M18 16v5 M16 19h5",
  lyrics: "M5 5h14v14H5z M8 9h8 M8 12h8 M8 15h5",
  music: "M9 18V6l10-2v12 M9 18c0 2-2 3-4 3s-3-1-3-2 1-3 4-3c1 0 2 1 3 2Zm10-2c0 2-2 3-4 3s-3-1-3-2 1-3 4-3c1 0 2 1 3 2Z",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 5 5",
  close: "M5 5 19 19 M19 5 5 19", heart: "M12 20s-8-4.8-8-10a4.3 4.3 0 0 1 8-2 4.3 4.3 0 0 1 8 2c0 5.2-8 10-8 10Z",
  shuffle: "M4 7h3c3 0 4 2 6 5s3 5 6 5h2 M18 14l3 3-3 3 M4 17h3c2 0 3-1 4-2 M15 9c1-1 2-2 4-2h2 M18 4l3 3-3 3",
  repeat: "M20 8V5H7a3 3 0 0 0-3 3v1 M4 16v3h13a3 3 0 0 0 3-3v-1 M17 5l3 3 3-3 M7 19l-3-3-3 3",
  volume: "M4 9h4l5-4v14l-5-4H4V9Zm13-1c2 2 2 6 0 8 M20 5c4 4 4 10 0 14",
  mute: "M4 9h4l5-4v14l-5-4H4V9Zm12 0 6 6 M22 9l-6 6",
  upload: "M12 16V3 M7 8l5-5 5 5 M4 16v4h16v-4",
  world: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-9 10h18 M12 2c-3 3-4 7-4 10s1 7 4 10 M12 2c3 3 4 7 4 10s-1 7-4 10",
  focus: "M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5",
  refresh: "M20 10a8 8 0 1 0-2 7 M20 4v6h-6", arrow: "M5 12h14 M13 6l6 6-6 6",
  headphones: "M4 13v-1a8 8 0 0 1 16 0v1 M4 13h4v7H6a2 2 0 0 1-2-2v-5Zm16 0h-4v7h2a2 2 0 0 0 2-2v-5Z",
};

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={paths[name]} fill={name === "play" || name === "pause" ? "currentColor" : "none"} />
  </svg>;
}

function SourceName({ source }: { source: ListeningTrack["source"] }) {
  return <span className={"mw-listening-origin mw-listening-origin-" + source}>
    {source === "qqmusic" ? "QQ 音乐" : source === "local" ? "本地音乐" : "原创试听"}
  </span>;
}

export function MusicPlayer({ active, onChoose }: { active: boolean; onChoose: (stage: HallModule) => void }) {
  const { audio, analyser, ...player } = useMusicPlayback(active);
  const root = useRef<HTMLDivElement>(null);
  const disc = useRef<HTMLButtonElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const lyricInput = useRef<HTMLInputElement>(null);
  const lyricList = useRef<HTMLDivElement>(null);
  const searchRequest = useRef<AbortController | null>(null);
  const initialRequest = useRef<AbortController | null>(null);
  const loadedOnline = useRef(false);
  const loginRequest = useRef<AbortController | null>(null);
  const loginWindow = useRef<Window | null>(null);
  const loginId = useRef<string | null>(null);
  const lyricRequests = useRef(new Set<string>());
  const [panel, setPanel] = useState<Panel>(null);
  const [sourceFilter, setSourceFilter] = useState<TrackSource>("qqmusic");
  const [query, setQuery] = useState("轻音乐");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchResults, setSearchResults] = useState<ListeningTrack[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchPage, setSearchPage] = useState(1);
  const [searchHasMore, setSearchHasMore] = useState(false);
  const [connection, setConnection] = useState<ListeningConnection | null>(null);
  const [qrLogin, setQrLogin] = useState<QrLogin | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [bridgeCopied, setBridgeCopied] = useState(false);
  const [tone, setTone] = useState<"amber" | "blue" | "rose">("amber");
  const [lyricRevision, setLyricRevision] = useState(0);
  const current = player.track;
  const lyricMid = current.online?.mid;
  const setLyrics = player.setLyrics;
  const hue = tone === "amber" ? 35 : tone === "blue" ? 202 : 331;
  const activeLine = current.lyrics.reduce((last, line, index) => player.position >= line.time ? index : last, -1);
  const visibleTracks = player.tracks.filter((item) => sourceFilter === "all" || item.source === sourceFilter);
  const suggestions = player.tracks.filter((item) => item.id !== current.id && item.source === (current.source === "qqmusic" ? "qqmusic" : "original")).slice(0, 3);

  const cancelAuthorization = useCallback(() => {
    loginRequest.current?.abort(); loginRequest.current = null;
    loginWindow.current?.close(); loginWindow.current = null;
    const id = loginId.current; loginId.current = null;
    if (id) void cancelQqLogin(id).catch(() => {});
  }, []);
  const closeQqLogin = useCallback(() => { cancelAuthorization(); setQrLogin(null); setLoginBusy(false); }, [cancelAuthorization]);
  useEffect(() => {
    if (!active) cancelAuthorization();
    return cancelAuthorization;
  }, [active, cancelAuthorization]);

  useEffect(() => {
    if (!active || loadedOnline.current) return;
    loadedOnline.current = true;
    const controller = new AbortController();
    initialRequest.current = controller;
    let completed = false;
    void (async () => {
      try {
        const status = await listeningConnection(controller.signal).catch(() => ({ configured: true, authorized: false, message: "暂时无法检测登录状态，可继续搜索音乐。" }));
        if (controller.signal.aborted) return;
        setConnection(status);
        const results = await searchListeningTracks("轻音乐", controller.signal);
        if (!controller.signal.aborted) { player.addOnline(results, true); completed = true; }
      } catch (cause) {
        if (!controller.signal.aborted) setSearchError(cause instanceof Error ? cause.message : "QQ 音乐搜索暂时不可用。");
      }
    })();
    return () => { controller.abort(); if (!completed) loadedOnline.current = false; };
    // The initial query runs only on the first arrival. Later searches use the explicit action below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    if (!active || !lyricMid || lyricRequests.current.has(lyricMid + ":" + lyricRevision)) return;
    const mid = lyricMid, id = current.id;
    const key = mid + ":" + lyricRevision;
    const requests = lyricRequests.current;
    requests.add(key);
    const controller = new AbortController();
    void listeningLyrics(mid, controller.signal).then((lyrics) => {
      if (!controller.signal.aborted) setLyrics(id, lyrics);
    }).catch(() => { requests.delete(key); });
    return () => { controller.abort(); requests.delete(key); };
  }, [active, current.id, lyricMid, lyricRevision, setLyrics]);

  useEffect(() => {
    if (panel !== "lyrics" || activeLine < 0) return;
    const area = lyricList.current, line = area?.querySelector<HTMLElement>('[data-active="true"]');
    if (area && line) area.scrollTo({ top: line.offsetTop - area.clientHeight * 0.45, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [panel, activeLine, current.id]);

  useEffect(() => {
    if (!active) { searchRequest.current?.abort(); return; }
    const onKey = (event: KeyboardEvent) => {
      if (event.code === "Escape") { if (qrLogin) closeQqLogin(); else { setPanel(null); setImmersive(false); } return; }
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName))) return;
      if (panel === "map") return;
      if (event.code === "Space") { event.preventDefault(); player.toggle(); }
      else if (event.code === "ArrowRight") { event.preventDefault(); player.seek(player.position + 5); }
      else if (event.code === "ArrowLeft") { event.preventDefault(); player.seek(player.position - 5); }
      else if (event.code === "KeyN") player.advance(1);
      else if (event.code === "KeyM") player.toggleMute();
      else if (event.code === "KeyL") setPanel((previous) => previous === "lyrics" ? null : "lyrics");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, panel, player, qrLogin, closeQqLogin]);

  async function runSearch(loadMore = false) {
    const keywords = loadMore ? searchQuery : query.trim();
    setPanel("search");
    if (!keywords) { setSearchError("请输入歌曲或艺术家的名字。"); setSearchResults([]); setSearchQuery(""); setSearchHasMore(false); return; }
    initialRequest.current?.abort();
    searchRequest.current?.abort();
    const controller = new AbortController(); searchRequest.current = controller;
    const nextPage = loadMore ? searchPage + 1 : 1;
    setSearching(true); setSearchError("");
    if (!loadMore) { setSearchQuery(keywords); setSearchResults([]); setSearchHasMore(false); }
    try {
      const result = await searchListeningPage(keywords, controller.signal, nextPage);
      if (controller.signal.aborted) return;
      const results = player.addOnline(result.tracks);
      setSearchQuery(result.query); setSearchPage(result.page); setSearchHasMore(result.hasMore);
      setSearchResults(previous => {
        const combined = loadMore ? [...previous, ...results] : results;
        return [...new Map(combined.map(item => [item.id, item])).values()];
      });
    } catch (cause) { if (!controller.signal.aborted) setSearchError(cause instanceof Error ? cause.message : "搜索暂时不可用。"); }
    finally { if (searchRequest.current === controller) setSearching(false); }
  }

  async function refreshConnection() {
    try { setConnection(await listeningConnection(undefined, true)); }
    catch { setConnection({ configured: false, authorized: false, message: "暂时无法检测 QQ 音乐连接状态。" }); }
  }

  async function openQqLogin() {
    closeQqLogin();
    const popup = connection?.loginMode === "oauth" ? window.open("about:blank", "_blank", "popup=yes,width=720,height=620") : null;
    loginWindow.current = popup;
    if (popup) popup.opener = null;
    const controller = new AbortController(); loginRequest.current = controller;
    setPanel("source"); setLoginBusy(true);
    try {
      const started = await startQqLogin(controller.signal);
      if (controller.signal.aborted) return;
      loginId.current = started.loginId;
      if (started.authorizeUrl) {
        const url = new URL(started.authorizeUrl);
        if (url.protocol !== "https:" || url.hostname !== "graph.qq.com" || url.username || url.password || url.port || url.pathname !== "/oauth2.0/authorize") throw new Error("QQ 官方授权地址无效。");
        if (popup) popup.location.replace(url.href);
      }
      setQrLogin({ image: started.image, authorizeUrl: started.authorizeUrl, loginId: started.loginId, expiresAt: started.expiresAt, status: "pending", message: started.message || "请用手机 QQ 扫描二维码，并在手机上确认登录。" });
    } catch (cause) {
      popup?.close();
      if (!controller.signal.aborted) { closeQqLogin(); player.report(cause instanceof Error ? cause.message : "暂时无法获取 QQ 登录二维码。"); }
    }
    finally { if (loginRequest.current === controller) { loginRequest.current = null; setLoginBusy(false); } }
  }

  async function disconnectQqAccount() {
    setLoginBusy(true);
    try {
      await logoutQqLogin();
      if (player.track.source === "qqmusic") player.pause();
      closeQqLogin();
      setConnection({ configured: false, authorized: false, message: "已退出 QQ 音乐账号。" });
      player.report("已退出 QQ 音乐账号。");
    } catch (cause) { player.report(cause instanceof Error ? cause.message : "退出登录失败，请重试。"); }
    finally { setLoginBusy(false); }
  }

  useEffect(() => {
    if (!active || !qrLogin || qrLogin.status === "success" || qrLogin.status === "expired" || qrLogin.status === "error") return;
    const controller = new AbortController();
    let timer = 0;
    let stopped = false;
    let failures = 0;
    // 自调度轮询：一直轮询到成功 / 过期 / 出错，或二维码弹层被关闭为止。
    // 早先的实现用 effect 依赖驱动，pending 状态下依赖不变、循环只跑一次。
    const tick = async () => {
      if (Date.now() >= qrLogin.expiresAt) { setQrLogin(previous => previous ? { ...previous, status: "expired", message: "二维码已过期，请刷新后重新扫码。" } : null); return; }
      try {
        const result = await pollQqLogin(controller.signal, qrLogin.loginId);
        if (stopped) return;
        failures = 0;
        if (result.status === "success") {
          setConnection({ configured: true, authorized: true, message: result.message, nickname: result.nickname, user: result.user, loginMode: qrLogin.authorizeUrl ? "oauth" : "qr", musicAuthorized: false });
          loginId.current = null; loginWindow.current?.close(); loginWindow.current = null;
          setQrLogin(null);
          player.report(result.message);
          return;
        }
        setQrLogin((previous) => previous ? { ...previous, status: result.status, message: result.message, nickname: result.nickname } : previous);
        if (["expired", "error", "cancelled"].includes(result.status)) return;
      } catch {
        if (stopped) return;
        if (++failures >= 3) { setQrLogin(previous => previous ? { ...previous, status: "error", message: "登录连接暂时中断，请刷新二维码重试。" } : null); return; }
      }
      if (!stopped) timer = window.setTimeout(tick, 2500);
    };
    timer = window.setTimeout(tick, 1500);
    return () => { stopped = true; controller.abort(); window.clearTimeout(timer); };
    // 轮询由二维码本身驱动，状态变化不再重启循环。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, qrLogin?.loginId]);

  async function copyBridgeConfig() {
    try {
      await navigator.clipboard.writeText(BRIDGE_CONFIG);
      setBridgeCopied(true);
      window.setTimeout(() => setBridgeCopied(false), 2000);
    } catch { player.report("复制失败，请手动选中上面的配置。"); }
  }

  function importAudio(event: ChangeEvent<HTMLInputElement>) {
    player.importFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
    setSourceFilter("local"); setPanel("queue");
  }

  async function importLyric(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/\.lrc$/i.test(file.name) || file.size > 512 * 1024) { player.report("请选择不超过 512 KB 的 LRC 歌词文件。"); return; }
    try {
      const lines = parseLyrics(await file.text());
      if (!lines.length) { player.report("这份歌词里没有可识别的时间标签。"); return; }
      player.setLyrics(current.id, lines); player.report("歌词已加载，可以点击歌词跳转播放。");
    } catch { player.report("歌词读取失败，请重试。"); }
  }

  function drop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault(); setDragging(false);
    const files = Array.from(event.dataTransfer.files);
    if (!files.length) return;
    const lyric = files.find((file) => /\.lrc$/i.test(file.name));
    const music = files.filter((file) => !/\.lrc$/i.test(file.name));
    if (music.length) { player.importFiles(music); setSourceFilter("local"); setPanel("queue"); }
    if (lyric && lyric.size <= 512 * 1024) void lyric.text().then((content) => player.setLyrics(current.id, parseLyrics(content))).catch(() => {});
  }

  function togglePanel(next: Exclude<Panel, null>) { setPanel((previous) => previous === next ? null : next); }
  const connectionText = connection?.authorized ? connection.user?.nickname || connection.nickname || "QQ 音乐已登录" : "QQ 音乐登录";

  return <div
    ref={root} className={"mw-listening-room" + (immersive ? " is-immersive" : "") + (dragging ? " is-dragging" : "")}
    data-tone={tone} data-playing={player.playing} onDragEnter={(event) => { if (event.dataTransfer.types.includes("Files")) setDragging(true); }}
    onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
    onDrop={drop}
  >
    <audio ref={audio} preload="none" onPlaying={player.events.onPlaying} onPause={player.events.onPause}
      onWaiting={player.events.onWaiting} onCanPlay={player.events.onCanPlay}
      onTimeUpdate={(event) => player.events.onTimeUpdate(event.currentTarget)}
      onLoadedMetadata={(event) => player.events.onLoadedMetadata(event.currentTarget)}
      onEnded={player.events.onEnded} onError={player.events.onError} aria-hidden="true" />
    <MusicAtmosphere active={active} playing={player.playing} hue={hue} root={root} disc={disc} analyser={analyser} />
    <div className="mw-listening-grain" aria-hidden="true" />
    <input ref={audioInput} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac,.aac,.opus,.aiff,.webm" multiple hidden onChange={importAudio} />
    <input ref={lyricInput} type="file" accept=".lrc,text/plain" hidden onChange={(event) => void importLyric(event)} />
    <div className="mw-listening-top">
      <div className="mw-listening-identity">
        <span className="mw-listening-orbit-icon"><Icon name="music" size={18} /></span>
        <span><small>MUSIC WORLD / LISTENING ROOM</small><strong>让音乐，把世界点亮。</strong></span>
      </div>
      <form className="mw-listening-search" role="search" onSubmit={(event) => { event.preventDefault(); void runSearch(); }}>
        <Icon name="search" size={17} /><input value={query} onChange={(event) => setQuery(event.target.value.slice(0, 80))} maxLength={80} placeholder="搜索 QQ 音乐的歌曲或艺术家" aria-label="搜索 QQ 音乐" />
        <button type="submit" aria-busy={searching} aria-label="搜索歌曲">{searching ? "…" : <Icon name="arrow" size={16} />}</button>
      </form>
      <div className="mw-listening-top-actions">
        <button type="button" className={"mw-listening-connection" + (connection?.authorized ? " is-ready" : "")} onClick={() => togglePanel("source")} aria-label="查看 QQ 音乐连接状态" title={connectionText}>{connection?.user?.avatar ? <span className="mw-listening-user-avatar" style={{ backgroundImage: "url(" + connection.user.avatar + ")" }} /> : <i />}<span className="mw-listening-connection-name">{connectionText}</span></button>
        <button type="button" className="mw-listening-top-button" onClick={() => audioInput.current?.click()}><Icon name="upload" size={16} /><span>本地音乐</span></button>
        <button type="button" className="mw-listening-top-button" onClick={() => togglePanel("map")}><Icon name="world" size={16} /><span>音乐地图</span></button>
        <button type="button" className="mw-listening-top-button icon-only" onClick={() => setImmersive(!immersive)} aria-label={immersive ? "退出沉浸模式" : "进入沉浸模式"} title={immersive ? "退出沉浸模式" : "沉浸模式"}><Icon name="focus" size={17} /></button>
      </div>
    </div>

    <div className="mw-listening-stage">
      <div className="mw-listening-copy">
        <p className="mw-listening-eyebrow"><span className="mw-listening-live" /> {current.source === "qqmusic" ? "ONLINE RADIO / QQ MUSIC" : current.source === "local" ? "YOUR MUSIC / LOCAL FILE" : "MUSIC WORLD / ORIGINAL SESSIONS"}</p>
        <div className="mw-listening-heading">
          <span className="mw-listening-index">{String(Math.max(1, player.tracks.indexOf(current) + 1)).padStart(2, "0")} <i>/</i> {String(player.tracks.length).padStart(2, "0")}</span>
          <h1 title={current.title}>{current.title}</h1>
          <p className="mw-listening-artist">{current.artist}</p>
        </div>
        <p className="mw-listening-description">{current.description}</p>
        <div className="mw-listening-tags"><SourceName source={current.source} /><span>{current.genre}</span><span>{player.quality}{player.trial ? " · 试听" : ""}</span></div>
        {current.source === "qqmusic" && !connection?.authorized && <button type="button" className="mw-listening-auth-note" onClick={() => void openQqLogin()}>扫码登录 QQ 音乐 <Icon name="arrow" size={13} /></button>}
        {player.error && <div className="mw-listening-error" role="alert"><span>{player.error}</span>{current.externalUrl && <a href={current.externalUrl} target="_blank" rel="noopener noreferrer">前往 QQ 音乐 ↗</a>}<button type="button" onClick={player.clearError} aria-label="关闭错误提示"><Icon name="close" size={15} /></button></div>}
        <div className="mw-listening-actions">
          <button type="button" className="mw-listening-main-action" onClick={player.toggle}><Icon name={player.playing ? "pause" : "play"} size={16} />{player.playing ? "暂停播放" : player.buffering ? "正在准备…" : "开始聆听"}<span>↗</span></button>
          <button type="button" className={"mw-listening-like" + (player.liked.has(current.id) ? " is-liked" : "")} onClick={player.toggleLike} aria-label={player.liked.has(current.id) ? "取消喜欢" : "喜欢这首歌"} aria-pressed={player.liked.has(current.id)} title="喜欢这首歌"><Icon name="heart" size={18} /></button>
          {current.externalUrl && <a className="mw-listening-song-link" href={current.externalUrl} target="_blank" rel="noopener noreferrer">在 QQ 音乐中打开 ↗</a>}
        </div>
        <div className="mw-listening-next">
          <div className="mw-listening-section-title"><span>接下来聆听</span><button type="button" onClick={() => togglePanel("queue")}>打开播放队列 <Icon name="arrow" size={15} /></button></div>
          <div className="mw-listening-suggestions">
            {(suggestions.length ? suggestions : player.tracks.filter((item) => item.id !== current.id).slice(0, 3)).map((item) => <button
              type="button" className="mw-listening-suggestion" key={item.id} onClick={() => player.choose(item)}>
              <span className="mw-listening-suggestion-cover" style={{ backgroundImage: "url(" + item.artwork + ")" }} aria-hidden="true"><Icon name="play" size={16} /></span>
              <span className="mw-listening-suggestion-copy"><strong>{item.title}</strong><small>{item.artist}</small></span>
            </button>)}
          </div>
        </div>
      </div>
      <div className="mw-listening-art">
        <div className="mw-listening-halo" aria-hidden="true" />
        <div className="mw-listening-floating-note note-one" aria-hidden="true">♪</div>
        <div className="mw-listening-floating-note note-two" aria-hidden="true">✧</div>
        <button ref={disc} type="button" className="mw-listening-disc" onClick={player.toggle} aria-label={player.playing ? "点击唱片暂停" : "点击唱片开始播放"} title="点击唱片播放或暂停">
          <span className="mw-listening-vinyl-grooves" aria-hidden="true" />
          <span className="mw-listening-vinyl-label" style={{ backgroundImage: "linear-gradient(#36231964, #36231978), url(" + current.artwork + ")" }} aria-hidden="true"><i><Icon name="music" size={25} /></i></span>
          <span className="mw-listening-vinyl-spindle" aria-hidden="true" />
        </button>
        <div className="mw-listening-needle" aria-hidden="true"><span /></div>
        <div className="mw-listening-art-foot"><span>◉&nbsp; {player.playing ? "声波正在唤醒这个世界" : "点击唱片，让音乐开始"}</span><small>MOVE YOUR CURSOR · FOLLOW THE LIGHT</small></div>
      </div>
    </div>

    <div className="mw-listening-deck" role="group" aria-label="音乐播放控制">
      <div className="mw-listening-timeline"><span>{clockTime(player.position)}</span>
        <input type="range" min="0" max={Math.max(player.duration, 1)} step="0.1" value={Math.min(player.position, Math.max(player.duration, 1))}
          onChange={(event) => player.seek(Number(event.target.value))} aria-label="播放进度" style={{ backgroundSize: (player.duration ? Math.min(100, player.position / player.duration * 100) : 0) + "% 100%" }} />
        <span>{clockTime(player.duration)}</span></div>
      <div className="mw-listening-deck-row">
        <div className="mw-listening-now"><span className="mw-listening-now-art" style={{ backgroundImage: "url(" + current.artwork + ")" }} aria-hidden="true" /><span><strong>{current.title}</strong><small>{current.artist}</small></span></div>
        <div className="mw-listening-transport">
          <button type="button" className={"mw-listening-control" + (player.shuffle ? " is-active" : "")} aria-label="随机播放" aria-pressed={player.shuffle} title="随机播放" onClick={player.toggleShuffle}><Icon name="shuffle" size={17} /></button>
          <button type="button" className="mw-listening-control" aria-label="上一首" title="上一首" onClick={() => player.advance(-1)}><Icon name="prev" size={19} /></button>
          <button type="button" className="mw-listening-play" aria-label={player.playing ? "暂停" : "播放"} onClick={player.toggle}>{player.buffering ? <span className="mw-listening-spinner" /> : <Icon name={player.playing ? "pause" : "play"} size={18} />}</button>
          <button type="button" className="mw-listening-control" aria-label="下一首" title="下一首" onClick={() => player.advance(1)}><Icon name="next" size={19} /></button>
          <button type="button" className={"mw-listening-control" + (player.repeat !== "off" ? " is-active" : "")} aria-label={"循环模式：" + (player.repeat === "one" ? "单曲循环" : player.repeat === "all" ? "列表循环" : "不循环")} title={player.repeat === "one" ? "单曲循环" : player.repeat === "all" ? "列表循环" : "不循环"} onClick={player.cycleRepeat}><Icon name="repeat" size={17} />{player.repeat === "one" && <sup>1</sup>}</button>
        </div>
        <div className="mw-listening-tools">
          <button type="button" className="mw-listening-control" aria-label={player.muted ? "取消静音" : "静音"} title={player.muted ? "取消静音" : "静音"} onClick={player.toggleMute}><Icon name={player.muted || player.volume === 0 ? "mute" : "volume"} size={19} /></button>
          <input type="range" min="0" max="1" step="0.01" value={player.muted ? 0 : player.volume} onChange={(event) => player.setVolume(Number(event.target.value))} aria-label="音量" className="mw-listening-volume" style={{ backgroundSize: (player.muted ? 0 : player.volume * 100) + "% 100%" }} />
          <button type="button" className={"mw-listening-control" + (panel === "lyrics" ? " is-active" : "")} aria-label="显示歌词" aria-pressed={panel === "lyrics"} title="歌词" onClick={() => togglePanel("lyrics")}><Icon name="lyrics" size={18} /></button>
          <button type="button" className={"mw-listening-control" + (panel === "queue" ? " is-active" : "")} aria-label="显示播放队列" aria-pressed={panel === "queue"} title="播放队列" onClick={() => togglePanel("queue")}><Icon name="queue" size={19} /></button>
        </div>
      </div>
    </div>
    {player.notice && <p className="mw-listening-toast" role="status">{player.notice}</p>}
    {dragging && <div className="mw-listening-drop" aria-hidden="true"><Icon name="upload" size={32} /><strong>把音乐放进这个世界</strong><span>支持音频文件和 LRC 歌词</span></div>}
    {qrLogin && <div className="mw-listening-qr-backdrop" role="dialog" aria-modal="true" aria-label="扫码连接 QQ 账号">
      <div className="mw-listening-qr-card">
        <div className="mw-listening-qr-head"><span>扫码连接 QQ 账号</span><button type="button" onClick={closeQqLogin} aria-label="关闭扫码登录"><Icon name="close" size={17} /></button></div>
        {qrLogin.status === "success"
          ? <div className="mw-listening-qr-image mw-listening-qr-done"><Icon name="headphones" size={38} /></div>
          : qrLogin.authorizeUrl ? <a className="mw-listening-login" href={qrLogin.authorizeUrl} target="_blank" rel="noopener noreferrer">打开 QQ 官方扫码授权页 ↗</a> : <div className="mw-listening-qr-image" style={{ backgroundImage: "url(" + qrLogin.image + ")" }} role="img" aria-label="QQ 音乐登录二维码" />}
        <p className={"mw-listening-qr-status is-" + qrLogin.status}>{qrLogin.status === "success" ? "登录成功" + (qrLogin.nickname ? "：" + qrLogin.nickname : "") : qrLogin.message}</p>
        <div className="mw-listening-qr-actions">
          {qrLogin.status === "expired" || qrLogin.status === "error"
            ? <button type="button" className="mw-listening-login" disabled={loginBusy} onClick={() => void openQqLogin()}><Icon name="refresh" size={16} />刷新二维码</button>
            : <span>请用手机 QQ「扫一扫」并确认登录</span>}
        </div>
      </div>
    </div>}

    {panel && <div className={"mw-listening-drawer" + (panel === "map" ? " is-map" : "")} role="dialog" aria-label={panel === "search" ? "QQ 音乐搜索结果" : panel === "queue" ? "播放队列" : panel === "lyrics" ? "歌词" : panel === "map" ? "音乐地图" : "音乐连接"}>
      <div className="mw-listening-drawer-head"><span className="mw-listening-eyebrow">EXPLORE MORE / MUSIC WORLD</span><button type="button" onClick={() => setPanel(null)} aria-label="关闭浮层"><Icon name="close" size={19} /></button></div>
      {panel === "search" && <div className="mw-listening-drawer-content" aria-busy={searching}>
        <h2>搜索结果<span>{searchResults.length}</span></h2><p className="mw-listening-drawer-intro">{searchQuery ? "QQ 音乐 · “" + searchQuery + "”" : "输入歌曲名或歌手名，找到想听的音乐。"}</p>
        {searchError && <p className="mw-listening-panel-error" role="alert">{searchError}</p>}
        {searching && <p className="mw-listening-search-status" role="status">正在搜索 QQ 音乐…</p>}
        <div className="mw-listening-queue-list mw-listening-search-results" role="list" aria-label="QQ 音乐歌曲结果">
          {searchResults.map(item => <div key={item.id} className="mw-listening-queue-track" role="listitem" data-song-mid={item.online?.mid}>
            <button type="button" onClick={() => { player.choose(item); setPanel(null); }} aria-label={"播放 " + item.title}><span className="mw-listening-queue-cover" style={{ backgroundImage: "url(" + item.artwork + ")" }}><Icon name="play" size={17} /></span><span className="mw-listening-queue-copy"><strong>{item.title}</strong><small>{item.artist}{item.album ? " · " + item.album : ""}</small></span></button>
            <span className="mw-listening-queue-time">{clockTime(item.duration)}</span><a className="mw-listening-result-link" href={item.externalUrl} target="_blank" rel="noopener noreferrer" aria-label={"在 QQ 音乐查看 " + item.title}><Icon name="arrow" size={15} /></a>
          </div>)}
          {!searching && !searchResults.length && !searchError && <div className="mw-listening-empty"><Icon name="search" size={32} /><strong>没有找到对应的歌曲</strong><span>试试完整歌名、歌手名，或换一个关键词。</span></div>}
        </div>
        {searchHasMore && <button type="button" className="mw-listening-add" disabled={searching} onClick={() => void runSearch(true)}><Icon name="refresh" size={16} />{searching ? "正在加载…" : "加载更多结果"}<span>↗</span></button>}
      </div>}
      {panel === "queue" && <div className="mw-listening-drawer-content">
        <h2>播放队列<span>{visibleTracks.length}</span></h2><p className="mw-listening-drawer-intro">选一首歌，世界就会随它改变。</p>
        <div className="mw-listening-filters" role="group" aria-label="筛选歌曲来源">
          {([["qqmusic", "QQ 音乐"], ["local", "本地"], ["original", "原创试听"], ["all", "全部"]] as const).map(([value, label]) =>
            <button key={value} type="button" className={sourceFilter === value ? "is-selected" : ""} aria-pressed={sourceFilter === value} onClick={() => setSourceFilter(value)}>{label}</button>)}
        </div>
        {searchError && <p className="mw-listening-panel-error" role="alert">{searchError}</p>}
        <div className="mw-listening-queue-list">
          {visibleTracks.map((item, index) => <div key={item.id} className={"mw-listening-queue-track" + (item.id === current.id ? " is-current" : "")}>
            <button type="button" onClick={() => { player.choose(item); setPanel(null); }} aria-label={"播放 " + item.title}><span className="mw-listening-queue-cover" style={{ backgroundImage: "url(" + item.artwork + ")" }}><Icon name="play" size={17} /></span>
              <span className="mw-listening-queue-copy"><strong>{item.title}</strong><small>{item.artist}</small></span></button>
            <span className="mw-listening-queue-time">{item.id === current.id && player.playing ? <span className="mw-listening-equalizer" aria-label="正在播放"><i /><i /><i /></span> : clockTime(item.duration)}</span>
            {item.source === "local" && <button type="button" className="mw-listening-queue-remove" onClick={() => player.remove(item.id)} aria-label={"移除 " + item.title}><Icon name="close" size={14} /></button>}
            <span className="mw-listening-queue-count">{String(index + 1).padStart(2, "0")}</span>
          </div>)}
          {!visibleTracks.length && <div className="mw-listening-empty"><Icon name="headphones" size={34} /><strong>{sourceFilter === "qqmusic" ? "搜索一首想听的歌" : "这里还没有音乐"}</strong><span>{sourceFilter === "qqmusic" ? "在上方搜索 QQ 音乐，探索在线歌曲。" : "可以选择本地音乐，或听一听原创试听。"}</span></div>}
        </div>
        <button type="button" className="mw-listening-add" onClick={() => audioInput.current?.click()}><Icon name="upload" size={17} />添加本地音乐 <span>↗</span></button>
      </div>}
      {panel === "lyrics" && <div className="mw-listening-drawer-content mw-listening-lyrics-pane">
        <h2>此刻歌词</h2><p className="mw-listening-drawer-intro">{current.title} · {current.artist}</p>
        {current.lyrics.length ? <div ref={lyricList} className="mw-listening-lyric-list">{current.lyrics.map((line, index) => <button
          key={index + ":" + line.time} type="button" data-active={index === activeLine} onClick={() => player.seek(line.time)} aria-label={"跳到 " + clockTime(line.time) + " " + line.text}>
          <small>{clockTime(line.time)}</small><span>{line.text}</span>
        </button>)}</div> : <div className="mw-listening-lyric-empty"><span>♪</span><strong>{current.source === "original" ? "这一段旋律，没有歌词。" : "暂时没有同步歌词。"}</strong><p>让声音说话。你也可以为这首歌添加 LRC 歌词。</p></div>}
        <div className="mw-listening-lyric-actions"><button type="button" onClick={() => lyricInput.current?.click()}>导入 LRC 歌词</button>
          {current.online && <button type="button" onClick={() => setLyricRevision(lyricRevision + 1)}><Icon name="refresh" size={15} />重新读取</button>}</div>
      </div>}
      {panel === "source" && <div className="mw-listening-drawer-content mw-listening-source-pane">
        <h2>音乐连接</h2><p className="mw-listening-drawer-intro">搜索、试听、播放状态，在这里一目了然。</p>
        <div className="mw-listening-source-card"><span><Icon name="headphones" size={21} />QQ 音乐</span><strong>{connection?.authorized ? (connection.nickname ? "已连接 · " + connection.nickname : "已连接") : "播放待连接"}</strong><p>{connection?.message ?? "正在检查连接…"}</p></div>
        {connection?.authorized && connection.user && <div className="mw-listening-user-profile" aria-label="QQ 账号信息"><span className="mw-listening-profile-avatar" style={connection.user.avatar ? { backgroundImage: "url(" + connection.user.avatar + ")" } : undefined}>{!connection.user.avatar && <Icon name="headphones" size={23} />}</span><div><strong>{connection.user.nickname}</strong><small>QQ OpenID · {connection.user.id}</small><span>账号已连接{connection.profileAvailable === false ? " · 资料暂时无法刷新" : ""}</span></div></div>}
        <p>QQ 官方登录可获取昵称和头像。QQ 音乐的播放授权与账号权益需要由获授权的音乐服务确认。</p>
        {connection?.authorized
          ? <button type="button" className="mw-listening-logout" disabled={loginBusy} onClick={() => void disconnectQqAccount()}><Icon name="close" size={16} />退出登录 QQ 音乐</button>
          : <button type="button" className="mw-listening-login" disabled={loginBusy || connection?.loginAvailable === false} onClick={() => void openQqLogin()}><Icon name="headphones" size={17} />{loginBusy ? "正在打开授权…" : "QQ 官方扫码登录"}<span className="mw-listening-login-arrow">↗</span></button>}
        {!connection?.authorized && <details className="mw-listening-quickstart">
          <summary>备用：连接本机 radiohand 服务 <span>3 步</span></summary>
          <ol className="mw-listening-quickstart-steps">
            <li><strong>启动 radiohand 桌面端</strong><span>用 QQ 音乐扫码完成授权，服务会监听 127.0.0.1:3000。</span></li>
            <li><strong>在项目根目录新建 .env.local</strong><span>填入下面两行配置。</span>
              <pre><code>{BRIDGE_CONFIG}</code></pre>
              <button type="button" className="mw-listening-quickstart-copy" onClick={() => void copyBridgeConfig()}>{bridgeCopied ? "已复制 ✓" : "复制配置"}</button>
            </li>
            <li><strong>重建并重启网页服务</strong><span>依次执行 npm run build 与 npm start，再回到这里点「重新检测连接」。</span></li>
          </ol>
        </details>}
        <button type="button" className="mw-listening-add" onClick={() => void refreshConnection()}><Icon name="refresh" size={17} />重新检测连接 <span>↗</span></button>
        <div className="mw-listening-tone-picker"><span>氛围色彩</span><div>
          {([["amber", "琥珀"], ["blue", "月蓝"], ["rose", "玫瑰"]] as const).map(([value, label]) => <button key={value} type="button" aria-label={label} aria-pressed={tone === value} className={tone === value ? "is-selected" : ""} data-tone={value} onClick={() => setTone(value)} title={label} />)}
        </div></div>
      </div>}
      {panel === "map" && <div className="mw-listening-drawer-content mw-listening-map-pane"><WorldDirectory active={active && panel === "map"} mode="world" onChoose={(stage) => { setPanel(null); onChoose(stage); }} /></div>}
    </div>}
  </div>;
}
