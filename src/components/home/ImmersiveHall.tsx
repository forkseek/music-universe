"use client";

import { useEffect, useRef, type PointerEvent } from "react";
import { CursorLightField, type LightSignal } from "./CursorLightField";
import { HallLivingScene } from "./HallLivingScene";
import { HallUniversePortal } from "./HallUniversePortal";
import type { SceneOrigin } from "./SceneTransition";

/** The hall has one destination; the room and its light remain decorative. */
export function ImmersiveHall({ active, onEnterUniverse }: { active: boolean; onEnterUniverse?: (origin: SceneOrigin) => void }) {
  const root = useRef<HTMLElement>(null);
  const panorama = useRef<HTMLDivElement>(null);
  const plane = useRef<HTMLDivElement>(null);
  const light = useRef<LightSignal>({ x: 0, y: 0, stamp: 0, strength: 0, burst: 0 });
  const look = useRef({ x: 0, y: 0, currentX: 0, currentY: 0 });

  useEffect(() => {
    if (!active) return;
    const viewport = panorama.current;
    const centerPanorama = () => {
      if (viewport) viewport.scrollLeft = Math.max(0, viewport.scrollWidth * .429 - viewport.clientWidth / 2);
    };
    centerPanorama();
    const resize = new ResizeObserver(centerPanorama);
    if (viewport) resize.observe(viewport);
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let last = performance.now();
    const render = (now: number) => {
      const delta = Math.min(.05, (now - last) / 1000);
      last = now;
      if (!document.hidden && !motion.matches) {
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

  function move(event: PointerEvent<HTMLElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    light.current = { ...light.current, x, y, stamp: performance.now(), strength: .2 };
    root.current?.style.setProperty("--cursor-x", `${x}px`);
    root.current?.style.setProperty("--cursor-y", `${y}px`);
    if (event.pointerType === "mouse") { look.current.x = (x / box.width - .5) * -12; look.current.y = (y / box.height - .5) * -8; }
  }

  return <section ref={root} className="mw-interactive-hall mw-hall-ready" hidden={!active} aria-label="专辑宇宙大厅"
    onPointerMove={move} onPointerLeave={() => { look.current.x = 0; look.current.y = 0; }}>
    <div className="mw-hall-room" aria-hidden="true" />
    <div ref={panorama} className="mw-hall-panorama"><div className="mw-hall-plane"><div ref={plane} className="mw-hall-plane-motion">
      <div className="mw-hall-final" aria-hidden="true" />
      <HallLivingScene key={active ? "active" : "away"} active={active} />
      <nav className="mw-hall-portals" aria-label="专辑宇宙入口"><HallUniversePortal onEnter={onEnterUniverse} /></nav>
    </div></div></div>
    <CursorLightField active={active} signal={light} />
    <div className="mw-hall-vignette" aria-hidden="true" />
    <header className="mw-hall-header"><span className="mw-hall-brand">music<span>world</span><small>从一张专辑，走进音乐宇宙</small></span><span className="mw-hall-edition">MUSIC UNIVERSE / 001</span></header>
    <div className="mw-hall-caption"><span>ALBUM SOLAR SYSTEM</span><h1>让专辑，成为一个宇宙。</h1><p>点击发光的星球，进入专辑宇宙。</p></div>
  </section>;
}
