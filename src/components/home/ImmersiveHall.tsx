"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { CursorLightField, type LightSignal } from "./CursorLightField";
import { ContinuousFrames, parseFilmTimeline, type FilmTimeline } from "./ContinuousFrames";
import { hallModules, type HallModule } from "./hall-modules";
import { HallCloudHint } from "./HallCloudHint";
import { HallLivingScene } from "./HallLivingScene";
import { HallUniversePortal } from "./HallUniversePortal";
import { originFromEvent, type SceneOrigin } from "./SceneTransition";

type HallPhase = "loading" | "arrival" | "ready";
// One complete journey takes 6,600px of wheel travel.
const SCROLL_DISTANCE = 6600;
const WHEEL_LIMIT = 180;
const DAMPING_SECONDS = .105;
const MAX_SPEED = 1.8;
const MAX_LEAD_SECONDS = .65;
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));

export function ImmersiveHall({ active, onEnter }: { active: boolean; onEnter: (module: HallModule, origin: SceneOrigin) => void }) {
  const root = useRef<HTMLElement>(null);
  const panorama = useRef<HTMLDivElement>(null);
  const plane = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const timeline = useRef<FilmTimeline | null>(null);
  const initialized = useRef(false);
  const phaseRef = useRef<HallPhase>("loading");
  const target = useRef(0);
  const position = useRef(0);
  const drawn = useRef(0);
  const direction = useRef(1);
  const automatic = useRef(false);
  const reduced = useRef(false);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const light = useRef<LightSignal>({ x: 0, y: 0, stamp: 0, strength: 0, burst: 0 });
  const look = useRef({ x: 0, y: 0, currentX: 0, currentY: 0 });
  const [phase, setPhase] = useState<HallPhase>("loading");
  const [progress, setProgress] = useState(0);
  const [painted, setPainted] = useState(false);
  const [useVideo, setUseVideo] = useState(false);
  const [failed, setFailed] = useState(false);
  const [auto, setAuto] = useState(false);
  const [hovered, setHovered] = useState<HallModule | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissedHint = useRef<HallModule | null>(null);
  const holdHint = useCallback(() => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = null;
  }, []);
  const clearHint = useCallback(() => { holdHint(); setHovered(null); }, [holdHint]);
  const leaveHint = useCallback(() => {
    holdHint();
    hintTimer.current = setTimeout(() => {
      if (root.current?.querySelector("[data-portal]:focus-visible")) return;
      setHovered(null);
    }, 180);
  }, [holdHint]);
  useEffect(() => () => { if (hintTimer.current) clearTimeout(hintTimer.current); }, []);
  useEffect(() => {
    if (!active) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      dismissedHint.current = hovered;
      clearHint();
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [active, hovered, clearHint]);

  const arrive = useCallback(() => {
    if (phaseRef.current === "ready") return;
    phaseRef.current = "ready";
    target.current = 1;
    position.current = 1;
    automatic.current = false;
    video.current?.pause();
    setProgress(1);
    setAuto(false);
    setPhase("ready");
    root.current?.style.setProperty("--intro-opacity", "1");
  }, []);

  const resume = useCallback(() => {
    if (phaseRef.current === "arrival") return;
    phaseRef.current = "arrival";
    clearHint();
    setPainted(false);
    setPhase("arrival");
  }, [clearHint]);

  const drive = useCallback((change: number, origin: SceneOrigin) => {
    if (phaseRef.current === "loading" || !change) return;
    if (phaseRef.current === "ready") return;
    if (automatic.current && video.current && useVideo && Number.isFinite(video.current.duration)) {
      position.current = clamp(video.current.currentTime / Math.max(.1, video.current.duration - 1 / 60));
    }
    automatic.current = false;
    video.current?.pause();
    setAuto(false);
    const sign = change < 0 ? -1 : 1;
    if (sign !== direction.current) target.current = position.current;
    direction.current = sign;
    const duration = timeline.current?.duration ?? 15.4;
    const lead = MAX_LEAD_SECONDS / duration;
    target.current = clamp(clamp(target.current + change, position.current - lead, position.current + lead));
    const box = root.current?.getBoundingClientRect();
    if (box) {
      light.current = { x: origin.x - box.left, y: origin.y - box.top, stamp: performance.now(), strength: Math.min(.7, Math.abs(change) * 30), burst: light.current.burst };
      root.current?.style.setProperty("--cursor-x", `${light.current.x}px`);
      root.current?.style.setProperty("--cursor-y", `${light.current.y}px`);
    }
  }, [useVideo]);

  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => {
      reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      // Returning from a room keeps the final frame available for the next choice.
      if (initialized.current || reduced.current) {
        initialized.current = true;
        arrive();
        return;
      }
      initialized.current = true;
      target.current = 0;
      position.current = 0;
      direction.current = 1;
      automatic.current = false;
      pointer.current = null;
      setProgress(0);
      setAuto(false);
      setHovered(null);
      root.current?.style.setProperty("--intro-opacity", "1");
      resume();
    });
    return () => cancelAnimationFrame(frame);
  }, [active, arrive, resume]);

  useEffect(() => {
    const surface = root.current;
    if (!active || !surface) return;
    const wheel = (event: WheelEvent) => {
      if (phaseRef.current === "loading" || event.defaultPrevented || event.ctrlKey || event.metaKey) return;
      if (event.target instanceof Element && event.target.closest('input, select, textarea, [contenteditable="true"]')) return;
      if (!event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      if (event.cancelable) event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? surface.clientHeight : 1;
      const pixels = clamp(event.deltaY * unit, -WHEEL_LIMIT, WHEEL_LIMIT);
      drive(pixels / SCROLL_DISTANCE, { x: event.clientX, y: event.clientY });
    };
    surface.addEventListener("wheel", wheel, { passive: false });
    return () => surface.removeEventListener("wheel", wheel);
  }, [active, drive]);

  useEffect(() => {
    if (!active) { automatic.current = false; video.current?.pause(); pointer.current = null; return; }
    const viewport = panorama.current;
    const centerPanorama = () => {
      if (viewport) viewport.scrollLeft = Math.max(0, viewport.scrollWidth * .425 - viewport.clientWidth / 2);
    };
    centerPanorama();
    const resize = new ResizeObserver(centerPanorama);
    if (viewport) resize.observe(viewport);
    let frame = 0;
    let last = performance.now();
    const render = (now: number) => {
      const delta = Math.min(.05, (now - last) / 1000);
      last = now;
      if (!document.hidden && !reduced.current) {
        const focus = look.current;
        const gain = 1 - Math.exp(-delta / .14);
        focus.currentX += (focus.x - focus.currentX) * gain;
        focus.currentY += (focus.y - focus.currentY) * gain;
        plane.current?.style.setProperty("--look-x", `${focus.currentX.toFixed(2)}px`);
        plane.current?.style.setProperty("--look-y", `${focus.currentY.toFixed(2)}px`);
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => { cancelAnimationFrame(frame); resize.disconnect(); };
  }, [active]);

  useEffect(() => {
    if (!active || phase !== "arrival") return;
    const mediaElement = video.current;
    const controller = new AbortController();
    let closed = false;
    let frame = 0;
    let buffer: ContinuousFrames | null = null;
    let context: CanvasRenderingContext2D | null = null;
    let last = performance.now();
    let reported = 0;
    let hasPainted = false;

    const fallback = () => { if (!closed) setUseVideo(true); };
    const initialize = async () => {
      if (useVideo) return;
      try {
        if (typeof createImageBitmap !== "function") { fallback(); return; }
        const response = await fetch("/media/music-world-continuous/timeline.json", { cache: "force-cache", signal: controller.signal });
        if (!response.ok) throw new Error("Animation timeline is unavailable.");
        const info = parseFilmTimeline(await response.json());
        if (closed) return;
        const surface = canvas.current;
        context = surface?.getContext("2d", { alpha: false }) ?? null;
        if (!surface || !context) { fallback(); return; }
        surface.width = info.width;
        surface.height = info.height;
        timeline.current = info;
        drawn.current = -1;
        buffer = new ContinuousFrames(info, window.matchMedia("(max-width: 760px)").matches, fallback);
        buffer.aim(Math.round(position.current * (info.frameCount - 1)), direction.current, drawn.current);
      } catch { if (!controller.signal.aborted) fallback(); }
    };
    void initialize();

    const render = (now: number) => {
      const delta = Math.min(.04, (now - last) / 1000);
      last = now;
      if (document.hidden) { frame = requestAnimationFrame(render); return; }
      const duration = timeline.current?.duration ?? 15.4;
      if (automatic.current) target.current = clamp(target.current + delta / duration);
      const distance = target.current - position.current;
      const eased = reduced.current ? distance : distance * (1 - Math.exp(-delta / DAMPING_SECONDS));
      const advance = clamp(eased, -MAX_SPEED * delta / duration, MAX_SPEED * delta / duration);
      const next = clamp(Math.abs(distance) < .35 / (timeline.current?.frameCount ?? 925) ? target.current : position.current + advance);

      if (useVideo) {
        const film = video.current;
        if (film && film.readyState >= 2 && Number.isFinite(film.duration) && !film.seeking) {
          const end = Math.max(.1, film.duration - 1 / 60);
          const desired = Math.round(next * end * 60) / 60;
          if (Math.abs(film.currentTime - desired) > .009) film.currentTime = desired;
          position.current = next;
          if (now - reported > 90) { reported = now; setProgress(clamp(film.currentTime / end)); }
          if (target.current >= 1 && film.currentTime >= end - .018) { arrive(); return; }
        }
      } else if (buffer && context) {
        const info = buffer.timeline;
        const index = Math.round(next * (info.frameCount - 1));
        buffer.aim(index, target.current - position.current || direction.current, drawn.current);
        const bitmap = buffer.get(index);
        if (bitmap) {
          if (drawn.current !== index) { context.drawImage(bitmap, 0, 0); drawn.current = index; }
          position.current = next;
          if (!hasPainted) { hasPainted = true; setPainted(true); }
          if (now - reported > 90 || index === info.frameCount - 1) { reported = now; setProgress(index / (info.frameCount - 1)); }
          if (target.current >= 1 && index === info.frameCount - 1) { arrive(); return; }
        }
      }
      root.current?.style.setProperty("--intro-opacity", String(clamp(1 - position.current / .2)));
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => { closed = true; controller.abort(); cancelAnimationFrame(frame); buffer?.dispose(); mediaElement?.pause(); };
  }, [active, phase, useVideo, arrive]);

  function move(event: PointerEvent<HTMLElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    const previous = pointer.current;
    const distance = previous ? Math.min(60, Math.hypot(event.clientX - previous.x, event.clientY - previous.y)) : 0;
    light.current = { ...light.current, x, y, stamp: performance.now(), strength: Math.min(.5, distance / 80) };
    root.current?.style.setProperty("--cursor-x", `${x}px`);
    root.current?.style.setProperty("--cursor-y", `${y}px`);
    if (!reduced.current && event.pointerType === "mouse") { look.current.x = (x / box.width - .5) * -12; look.current.y = (y / box.height - .5) * -8; }
    if ((event.target as Element).closest("[data-hall-control]")) { pointer.current = null; return; }
    pointer.current = { x: event.clientX, y: event.clientY };
    if (phaseRef.current === "arrival" && previous && event.pointerType !== "mouse" && event.buttons) drive((previous.y - event.clientY) / Math.max(2400, box.height * 3), { x: event.clientX, y: event.clientY });
  }

  function stopTouch(event: PointerEvent<HTMLElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    pointer.current = null;
  }

  function tour() {
    automatic.current = !automatic.current;
    target.current = position.current;
    direction.current = 1;
    setAuto(automatic.current);
  }

  const ready = phase === "ready";
  return <section ref={root} className={`mw-interactive-hall mw-continuous-hall mw-hall-${phase} ${useVideo ? "uses-video" : ""}`} hidden={!active} aria-label="Music World 滚轮连续音乐场景"
    onPointerMove={move} onPointerDown={(event) => {
      if (phaseRef.current === "arrival" && event.pointerType !== "mouse" && !(event.target as Element).closest("[data-hall-control]")) { pointer.current = { x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId); }
    }} onPointerUp={stopTouch} onPointerCancel={stopTouch}
    onPointerLeave={() => { pointer.current = null; look.current.x = 0; look.current.y = 0; leaveHint(); }}>
    <div className="mw-hall-room" aria-hidden="true" />
    <div ref={panorama} className="mw-hall-panorama"><div className="mw-hall-plane"><div ref={plane} className="mw-hall-plane-motion">
      <div className="mw-hall-final" style={{ backgroundImage: `url('/media/${ready || progress > .9 ? "scene-hall.webp" : "scene-awaken.webp"}')` }} aria-hidden="true" />
      <canvas ref={canvas} className={`mw-hall-canvas ${painted ? "is-painted" : ""}`} width={1344} height={768} aria-label="向下滚动连续观看三段动画，向上滚动回退" />
      <video ref={video} className={`mw-hall-film ${useVideo ? "is-active" : ""}`} src="/media/music-world-continuous.mp4" poster="/media/scene-awaken.webp" width={1344} height={768} muted playsInline preload={active && useVideo ? "auto" : "none"} aria-hidden={!useVideo || ready}
        onEnded={arrive} onError={() => { setFailed(true); arrive(); }}>当前浏览器无法播放这段连续动画。</video>
      <HallLivingScene key={phase + (active ? "-active" : "-away")} active={active && ready} />
      <nav className="mw-hall-portals" aria-label="音乐大厅的功能图标" inert={!ready} aria-hidden={!ready}>
        {hallModules.map((item) => <button key={item.id} type="button" data-hall-control data-portal={item.id} className={`mw-hall-hotspot mw-hotspot-${item.label} ${hovered === item.id ? "is-hovered" : ""}`}
          style={{ left: `${item.x}%`, top: `${item.y}%`, width: `${item.size}%` } as CSSProperties}
          aria-label={`${item.icon}：${item.title}`} aria-describedby={hovered === item.id && ready ? "mw-hall-tooltip" : undefined}
          onPointerEnter={(event) => { if ((event.pointerType === "mouse" || event.pointerType === "pen") && dismissedHint.current !== item.id) { holdHint(); setHovered(item.id); } }}
          onPointerLeave={() => { if (dismissedHint.current === item.id) dismissedHint.current = null; leaveHint(); }} onFocus={() => { dismissedHint.current = null; holdHint(); setHovered(item.id); }} onBlur={leaveHint}
          onClick={(event) => { clearHint(); onEnter(item.id, originFromEvent(event)); }}><span className="mw-hotspot-ring" aria-hidden="true" /><span className="mw-hotspot-label"><strong>{item.title}</strong><i aria-hidden="true">↗</i></span></button>)}
      </nav>
    </div></div></div>
    <CursorLightField active={active} signal={light} />
    <div className="mw-hall-vignette" aria-hidden="true" />
    {active && ready && hovered && <HallCloudHint key={hovered} module={hovered} root={root} onHold={holdHint} onLeave={leaveHint} />}
    <header className="mw-hall-header" data-hall-control><span className="mw-hall-brand">music<span>world</span><small>每一首歌，都是一个入口</small></span><span className="mw-hall-edition">{ready ? "THE MUSIC HALL / 001" : "ONE CONTINUOUS MUSIC JOURNEY"}</span><div className="mw-hall-actions">{ready && <a className="mw-hall-universe-link" href={process.env.NEXT_PUBLIC_MUSIC_UNIVERSE_URL || "http://127.0.0.1:5188/"} aria-label="进入专辑星系"><span className="mw-universe-orbit" aria-hidden="true">✦</span>专辑星系 <span aria-hidden="true">↗</span></a>}</div></header>
    <div className="mw-hall-caption" aria-hidden={!ready && progress > .2}><span>{ready ? "CHOOSE A LIGHT. FOLLOW YOUR MUSIC." : "SCROLL SLOWLY. FOLLOW THE MUSIC."}</span><h1>{ready ? "每个光点，都是一段旅程。" : "滚动指尖，跟着音乐去远方。"}</h1><p>{ready ? "悬停图标查看说明，点击进入。" : failed ? "动画暂时无法载入，仍可进入音乐大厅。" : <><span className="mw-desktop-hint">向下滚动前进，向上滚动回退。三段画面连续相连。</span><span className="mw-touch-hint">上滑前进，下滑回退。沿着音乐，慢慢出发。</span></>}</p></div>
    <HallUniversePortal ready={ready} />
    {!ready ? <div className="mw-hall-scrubber" data-hall-control><button type="button" onClick={tour}>{auto ? "暂停漫游" : "自动漫游"} <span aria-hidden="true">{auto ? "Ⅱ" : "▷"}</span></button></div>
      : <div className="mw-hall-hint"><span className="mw-desktop-hint">点击图标进入</span><span className="mw-touch-hint">左右滑动探索 · 轻点发光图标</span><span>YOUR MUSIC. YOUR JOURNEY.</span></div>}
  </section>;
}
