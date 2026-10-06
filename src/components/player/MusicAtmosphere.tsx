"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";

interface Ripple { x: number; y: number; at: number }
export function MusicAtmosphere({ active, playing, hue, root, disc, analyser }: {
  active: boolean; playing: boolean; hue: number; root: RefObject<HTMLDivElement | null>;
  disc: RefObject<HTMLButtonElement | null>; analyser: RefObject<AnalyserNode | null>;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pointer = useRef({ x: 0.5, y: 0.5 });
  const ripples = useRef<Ripple[]>([]);
  const motion = useRef(false);

  useEffect(() => {
    const element = root.current, media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!element) return;
    motion.current = media.matches;
    const updateMotion = () => { motion.current = media.matches; };
    const move = (event: PointerEvent) => {
      const bounds = element.getBoundingClientRect();
      pointer.current = { x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height };
      element.style.setProperty("--look-x", ((pointer.current.x - 0.5) * 18).toFixed(1) + "px");
      element.style.setProperty("--look-y", ((pointer.current.y - 0.5) * 14).toFixed(1) + "px");
    };
    const down = (event: PointerEvent) => {
      const bounds = element.getBoundingClientRect();
      ripples.current.push({ x: event.clientX - bounds.left, y: event.clientY - bounds.top, at: performance.now() });
      ripples.current = ripples.current.slice(-8);
    };
    element.addEventListener("pointermove", move, { passive: true });
    element.addEventListener("pointerdown", down, { passive: true });
    media.addEventListener("change", updateMotion);
    return () => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerdown", down);
      media.removeEventListener("change", updateMotion);
      element.style.removeProperty("--look-x"); element.style.removeProperty("--look-y");
    };
  }, [root]);

  useEffect(() => {
    if (!active) return;
    const view = canvas.current, element = root.current, record = disc.current;
    if (!view || !element || !record) return;
    const context = view.getContext("2d", { alpha: true });
    if (!context) return;
    const samples = new Uint8Array(512);
    const stars = Array.from({ length: 54 }, (_, index) => ({
      x: ((index * 73 + 13) % 101) / 101, y: ((index * 39 + 19) % 97) / 97,
      radius: 0.65 + (index % 4) * 0.42, phase: index * 1.86,
    }));
    let raf = 0, last = 0, width = 0, height = 0, visible = !document.hidden;
    const resize = () => {
      const bounds = element.getBoundingClientRect();
      width = bounds.width; height = bounds.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      view.width = Math.max(1, Math.round(width * dpr)); view.height = Math.max(1, Math.round(height * dpr));
      view.style.width = width + "px"; view.style.height = height + "px";
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize); observer.observe(element);
    const onVisibility = () => { visible = !document.hidden; };
    document.addEventListener("visibilitychange", onVisibility);
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (!visible || now - last < (motion.current ? 120 : 32)) return;
      last = now;
      context.clearRect(0, 0, width, height);
      const discRect = record.getBoundingClientRect(), roomRect = element.getBoundingClientRect();
      const cx = discRect.left - roomRect.left + discRect.width / 2;
      const cy = discRect.top - roomRect.top + discRect.height / 2;
      const base = Math.max(80, discRect.width * 0.62);
      const audio = analyser.current;
      if (playing && audio && !motion.current) audio.getByteFrequencyData(samples);
      else samples.fill(0);
      let sum = 0;
      for (let i = 2; i < 70; i++) sum += samples[i];
      const energy = Math.min(1, sum / (68 * 150));
      const breathing = motion.current ? 0.2 : 0.22 + Math.sin(now * 0.0008) * 0.07;
      const intensity = playing ? Math.max(0.2, energy) : breathing;
      const glow = context.createRadialGradient(cx, cy, discRect.width * 0.18, cx, cy, base * 2.2);
      glow.addColorStop(0, "hsla(" + hue + ", 95%, 66%, " + (0.12 + intensity * 0.09) + ")");
      glow.addColorStop(0.55, "hsla(" + hue + ", 87%, 54%, 0.035)");
      glow.addColorStop(1, "hsla(" + hue + ", 87%, 54%, 0)");
      context.fillStyle = glow;
      context.beginPath(); context.arc(cx, cy, base * 2.2, 0, Math.PI * 2); context.fill();
      for (let ring = 0; ring < 3; ring++) {
        context.beginPath();
        context.ellipse(cx, cy, base * (1.08 + ring * 0.17), base * (0.82 + ring * 0.17), -0.28 + ring * 0.22, 0, Math.PI * 2);
        context.strokeStyle = "hsla(" + hue + ", 92%, 79%, " + (0.15 - ring * 0.034 + intensity * 0.07) + ")";
        context.lineWidth = ring === 0 ? 1.5 : 1; context.stroke();
      }
      const bars = 96;
      for (let index = 0; index < bars; index++) {
        const angle = index / bars * Math.PI * 2 - Math.PI / 2;
        const band = samples[(index * 3 + 12) % 190] / 255;
        const amplitude = motion.current ? 3 : 4 + band * (playing ? 27 : 4);
        const start = base * 1.13, end = start + amplitude;
        context.beginPath(); context.moveTo(cx + Math.cos(angle) * start, cy + Math.sin(angle) * start);
        context.lineTo(cx + Math.cos(angle) * end, cy + Math.sin(angle) * end);
        context.strokeStyle = "hsla(" + hue + ", 93%, " + (72 + band * 20) + "%, " + (0.24 + band * 0.66) + ")";
        context.lineWidth = band > 0.3 ? 2 : 1; context.stroke();
      }
      for (const star of stars) {
        const shift = motion.current ? 0 : Math.sin(now * 0.00032 + star.phase) * 6;
        const x = star.x * width + shift + (pointer.current.x - 0.5) * (star.radius * 6);
        const y = star.y * height + shift * 0.5 + (pointer.current.y - 0.5) * (star.radius * 5);
        context.beginPath(); context.arc(x, y, star.radius * (1 + intensity * 0.24), 0, Math.PI * 2);
        context.fillStyle = "hsla(" + hue + ", 100%, 80%, " + (0.12 + star.radius * 0.06 + intensity * 0.1) + ")";
        context.fill();
      }
      ripples.current = ripples.current.filter((ripple) => now - ripple.at < 850);
      for (const ripple of ripples.current) {
        const progress = (now - ripple.at) / 850;
        context.beginPath(); context.arc(ripple.x, ripple.y, 8 + progress * 98, 0, Math.PI * 2);
        context.strokeStyle = "hsla(" + hue + ", 95%, 82%, " + ((1 - progress) * 0.45) + ")";
        context.lineWidth = 1.5; context.stroke();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); observer.disconnect(); document.removeEventListener("visibilitychange", onVisibility); context.clearRect(0, 0, width, height); };
  }, [active, playing, hue, root, disc, analyser]);

  return <canvas ref={canvas} className="mw-listening-atmosphere" aria-hidden="true" />;
}
