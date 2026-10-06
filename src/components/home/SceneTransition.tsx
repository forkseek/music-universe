"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export type SceneOrigin = { x: number; y: number };
type TravelRequest = {
  label: string;
  origin?: SceneOrigin;
  href?: string;
  action?: () => void | string | Promise<void | string>;
};
type FogState = { phase: "cover" | "hold" | "reveal"; label: string; origin: SceneOrigin };
const TravelContext = createContext<{ travel: (request: TravelRequest) => Promise<boolean>; travelling: boolean } | null>(null);
const pause = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
const painted = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

export function originFromEvent(event: { clientX: number; clientY: number; currentTarget: Element }): SceneOrigin {
  if (event.clientX || event.clientY) return { x: event.clientX, y: event.clientY };
  const box = event.currentTarget.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

export function SceneTransitionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [fog, setFog] = useState<FogState | null>(null);
  const [error, setError] = useState("");
  const locked = useRef(false);
  const arrival = useRef<{ path: string; resolve: (arrived: boolean) => void } | null>(null);

  useEffect(() => {
    if (arrival.current?.path === pathname) { arrival.current.resolve(true); arrival.current = null; }
  }, [pathname]);

  const travel = useCallback(async (request: TravelRequest) => {
    if (locked.current) return false;
    locked.current = true;
    setError("");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const origin = request.origin ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const scene: FogState = { phase: "cover", label: request.label, origin };
    setFog(scene);
    await pause(reduced ? 30 : 620);
    setFog({ ...scene, phase: "hold" });
    let completed = true;
    try {
      const actionDestination = await request.action?.();
      const href = request.href ?? actionDestination;
      if (typeof href === "string") {
        const destination = new URL(href, window.location.href);
        if (destination.origin !== window.location.origin) throw new Error("这个入口暂时无法打开。");
        if (destination.pathname === pathname) { router.push(href, { scroll: false }); await painted(); }
        else {
          const arrived = await new Promise<boolean>((resolve) => {
            const timeout = window.setTimeout(() => { arrival.current = null; resolve(false); }, 15000);
            arrival.current = { path: destination.pathname, resolve: (value) => { clearTimeout(timeout); resolve(value); } };
            router.push(href, { scroll: false });
          });
          if (!arrived) throw new Error("页面打开较慢，请重新选择入口。");
        }
      }
      await painted();
    } catch (cause) {
      completed = false;
      setError(cause instanceof Error ? cause.message : "暂时无法进入，请重试。");
    }
    setFog({ ...scene, phase: "reveal" });
    await pause(reduced ? 50 : 760);
    setFog(null);
    locked.current = false;
    requestAnimationFrame(() => document.querySelector<HTMLElement>("main[data-scene-focus]")?.focus({ preventScroll: true }));
    return completed;
  }, [router, pathname]);

  const value = useMemo(() => ({ travel, travelling: fog !== null }), [travel, fog]);
  return <TravelContext.Provider value={value}>
    <div className={`mw-scene-content ${fog ? "is-travelling" : ""}`} inert={fog !== null} aria-busy={fog !== null}>{children}</div>
    {fog && <div className={`mw-fog-transition mw-fog-${fog.phase}`} style={{ "--fog-x": `${fog.origin.x}px`, "--fog-y": `${fog.origin.y}px` } as CSSProperties} role="status" aria-live="polite" aria-label={`正在进入${fog.label}`}>
      <div className="mw-fog-veil" aria-hidden="true" />
      <div className="mw-fog-bloom" aria-hidden="true" />
      <div className="mw-fog-clouds" aria-hidden="true">{Array.from({ length: 8 }, (_, index) => <i key={index} style={{ "--cloud-i": index } as CSSProperties} />)}</div>
      <div className="mw-fog-destination"><span>NEXT DISCOVERY</span><strong>{fog.label}</strong><i aria-hidden="true" /></div>
    </div>}
    {error && !fog && <div role="alert" className="mw-travel-error"><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="关闭提示">×</button></div>}
  </TravelContext.Provider>;
}

export function useSceneTransition() {
  const context = useContext(TravelContext);
  if (!context) throw new Error("SceneTransitionProvider is required.");
  return context;
}

export function PortalLink({ href, children, className, label }: { href: string; children: ReactNode; className?: string; label?: string }) {
  const { travel } = useSceneTransition();
  return <Link href={href} className={className} onClick={(event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    void travel({ href, label: label ?? "音乐世界", origin: originFromEvent(event) });
  }}>{children}</Link>;
}
