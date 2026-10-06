"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { hallModules, type HallModule } from "./hall-modules";

type Placement = { left: number; top: number; side: string };
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

function placeHint(anchor: DOMRect, obstacles: DOMRect[], width: number, height: number): Placement {
  const viewportWidth = innerWidth;
  const viewportHeight = innerHeight;
  const gap = 18;
  const padding = 16;
  const topLimit = viewportHeight < 500 ? 62 : 88;
  const bottomLimit = Math.max(topLimit, viewportHeight - height - 24);
  const middleX = anchor.x + anchor.width / 2 - width / 2;
  const middleY = anchor.y + anchor.height / 2 - height / 2;
  const candidates = [
    { left: anchor.right + gap, top: middleY, side: "right" },
    { left: anchor.left - gap - width, top: middleY, side: "left" },
    { left: middleX, top: anchor.bottom + gap, side: "below" },
    { left: middleX, top: anchor.top - gap - height, side: "above" },
    { left: padding, top: topLimit, side: "corner" },
    { left: viewportWidth - width - padding, top: topLimit, side: "corner" },
    { left: padding, top: bottomLimit, side: "corner" },
    { left: viewportWidth - width - padding, top: bottomLimit, side: "corner" },
  ];
  const overlap = (box: Placement, other: DOMRect) => Math.max(0, Math.min(box.left + width, other.right) - Math.max(box.left, other.left))
    * Math.max(0, Math.min(box.top + height, other.bottom) - Math.max(box.top, other.top));
  return candidates.map((candidate) => {
    const box = { ...candidate, left: clamp(candidate.left, padding, Math.max(padding, viewportWidth - width - padding)), top: clamp(candidate.top, topLimit, bottomLimit) };
    const score = overlap(box, anchor) * 20 + obstacles.reduce((total, obstacle) => total + overlap(box, obstacle), 0)
      + Math.hypot(box.left - middleX, box.top - middleY) * .15 + (box.side === "corner" ? 60 : 0);
    return { box, score };
  }).sort((a, b) => a.score - b.score)[0].box;
}

export function HallCloudHint({ module, root, onHold, onLeave }: {
  module: HallModule; root: RefObject<HTMLElement | null>; onHold: () => void; onLeave: () => void;
}) {
  const card = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const item = hallModules.find((entry) => entry.id === module)!;
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const anchor = root.current?.querySelector<HTMLElement>('[data-portal="' + module + '"]');
        if (!anchor || !card.current) return;
        const label = anchor.querySelector<HTMLElement>(".mw-hotspot-label");
        const buttonBounds = anchor.getBoundingClientRect();
        const labelBounds = label?.getBoundingClientRect() ?? buttonBounds;
        const left = Math.min(buttonBounds.left, labelBounds.left);
        const top = Math.min(buttonBounds.top, labelBounds.top);
        // Keep the selected icon and its label together when choosing a nearby
        // cloud position, instead of treating its own label as another obstacle.
        const bounds = new DOMRect(left, top, Math.max(buttonBounds.right, labelBounds.right) - left,
          Math.max(buttonBounds.bottom, labelBounds.bottom) - top);
        const obstacles = [...root.current!.querySelectorAll<HTMLElement>("[data-portal], .mw-hotspot-label, .mw-hall-header button, .mw-hall-header a")]
          .filter((element) => element !== anchor && element !== label).map((element) => element.getBoundingClientRect());
        setPlacement(placeHint(bounds, obstacles, card.current.offsetWidth, card.current.offsetHeight));
      });
    };
    const panorama = root.current?.querySelector(".mw-hall-panorama");
    update();
    window.addEventListener("resize", update);
    panorama?.addEventListener("scroll", update, { passive: true });
    return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", update); panorama?.removeEventListener("scroll", update); };
  }, [module, root]);

  return <div ref={card} id="mw-hall-tooltip" role="tooltip" data-hall-control data-for-portal={module}
    className={"mw-cloud-hint " + (placement ? "is-positioned mw-cloud-" + placement.side : "")}
    style={placement ? { left: placement.left, top: placement.top } : { left: 16, top: 88 }}
    onPointerEnter={onHold} onPointerLeave={onLeave}>
    <span className="mw-cloud-mist" aria-hidden="true" />
    <div className="mw-cloud-content"><span className="mw-cloud-eyebrow"><i aria-hidden="true">{item.symbol}</i> 光点里的入口</span>
      <strong>{item.title}</strong><p>{item.detail}</p><small>点击图标进入 <span aria-hidden="true">↗</span></small></div>
  </div>;
}
