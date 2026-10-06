"use client";

import { useEffect, useState } from "react";

const universeUrl = process.env.NEXT_PUBLIC_MUSIC_UNIVERSE_ROOM_URL || "http://127.0.0.1:5173/?from=hall";

/** An ordinary link crosses rooms without changing the hall's seven existing modules. */
export function HallUniversePortal({ ready }: { ready: boolean }) {
  const [returning, setReturning] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setReturning(new URLSearchParams(window.location.search).get("from") === "universe"));
    return () => cancelAnimationFrame(frame);
  }, []);
  return <>
    {returning && <div className="mw-room-return-wash" aria-hidden="true" />}
    <a className="mw-universe-portal" href={universeUrl} hidden={!ready} data-hall-control data-testid="hall-universe-entry" aria-label="进入专辑宇宙">
      {/* This same small orbit symbol marks the return doorway in the universe. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/identity/universe-gateway.svg" alt="" width={64} height={64} />
      <span><small>ANOTHER ROOM / 002</small><strong>专辑宇宙 <i aria-hidden="true">↗</i></strong><em>让唱片，成为星球。</em></span>
    </a>
  </>;
}
