"use client";

import { hallModules } from "./hall-modules";
import type { PointerEvent } from "react";
import { originFromEvent, type SceneOrigin } from "./SceneTransition";

const universeUrl = "/#universe";
// Keep the destination on the original central radio hotspot without changing
// the shared module definitions used by the other hash routes.
const position = hallModules.find((module) => module.id === "world")!;

export function HallUniversePortal({ onEnter }: { onEnter?: (origin: SceneOrigin) => void }) {
  function tiltCover(event: PointerEvent<HTMLAnchorElement>) {
    if (event.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, (event.clientX - box.left) / box.width * 2 - 1));
    const y = Math.max(-1, Math.min(1, (event.clientY - box.top) / box.height * 2 - 1));
    event.currentTarget.style.setProperty("--cover-tilt-x", `${(-y * 7).toFixed(2)}deg`);
    event.currentTarget.style.setProperty("--cover-tilt-y", `${(x * 9).toFixed(2)}deg`);
  }

  function resetCover(element: HTMLAnchorElement) {
    element.style.removeProperty("--cover-tilt-x");
    element.style.removeProperty("--cover-tilt-y");
  }

  return <a className="mw-hall-hotspot mw-hotspot-below mw-universe-portal" href={universeUrl}
    onClick={(event) => {
      if (!onEnter || event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); onEnter(originFromEvent(event));
    }}
    style={{ left: `${position.x}%`, top: `${position.y}%`, width: `${position.size}%` }}
    onPointerMove={tiltCover} onPointerLeave={(event) => resetCover(event.currentTarget)} onBlur={(event) => resetCover(event.currentTarget)}
    data-hall-control data-portal="universe" data-testid="hall-universe-entry" aria-label="进入专辑宇宙">
    <span className="mw-hotspot-ring" aria-hidden="true" />
    <span className="mw-universe-cover" aria-hidden="true">
      {/* Alpha and overflow let the orbital artwork escape the doorway. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/media/album-universe-dimension-v1.webp" alt="" width={960} height={960} decoding="async" fetchPriority="high" />
    </span>
    <span className="mw-hotspot-label"><strong>专辑宇宙</strong><i aria-hidden="true">↗</i></span>
  </a>;
}
