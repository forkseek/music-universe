"use client";

import { useEffect, useRef, type RefObject } from "react";

export type LightSignal = { x: number; y: number; stamp: number; strength: number; burst: number };
type Spark = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number };

export function CursorLightField({ active, signal }: { active: boolean; signal: RefObject<LightSignal> }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const surface = canvas.current;
    if (!active || !surface || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const context = surface.getContext("2d");
    if (!context) return;
    let width = 0;
    let height = 0;
    let frame = 0;
    let lastTime = performance.now();
    let stamp = 0;
    let burst = signal.current.burst;
    const particles: Spark[] = [];
    const trail: { x: number; y: number; life: number }[] = [];

    const resize = () => {
      const box = surface.getBoundingClientRect();
      width = box.width;
      height = box.height;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      surface.width = Math.round(width * ratio);
      surface.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(surface);
    resize();

    const emit = (count: number, power: number) => {
      for (let index = 0; index < count; index++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (18 + Math.random() * 65) * power;
        const life = .35 + Math.random() * .7;
        particles.push({ x: signal.current.x, y: signal.current.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, max: life, size: .8 + Math.random() * 1.5 });
      }
      if (particles.length > 100) particles.splice(0, particles.length - 100);
    };
    const draw = (time: number) => {
      if (document.hidden) { frame = 0; return; }
      const delta = Math.min(.05, (time - lastTime) / 1000);
      lastTime = time;
      context.clearRect(0, 0, width, height);
      const light = signal.current;
      if (light.stamp !== stamp) {
        stamp = light.stamp;
        trail.push({ x: light.x, y: light.y, life: .42 });
        if (trail.length > 20) trail.shift();
        emit(2 + Math.round(light.strength * 3), .65);
      }
      if (light.burst !== burst) { burst = light.burst; emit(32, 1.8); }
      const freshness = Math.max(0, 1 - (time - light.stamp) / 800);
      if (freshness && light.stamp) {
        const glow = context.createRadialGradient(light.x, light.y, 0, light.x, light.y, 110);
        glow.addColorStop(0, `rgba(255,242,188,${freshness * .17})`);
        glow.addColorStop(.45, `rgba(255,208,113,${freshness * .06})`);
        glow.addColorStop(1, "rgba(255,208,113,0)");
        context.fillStyle = glow;
        context.fillRect(light.x - 110, light.y - 110, 220, 220);
      }
      for (let index = trail.length - 1; index >= 0; index--) {
        trail[index].life -= delta;
        if (trail[index].life <= 0) { trail.splice(index, 1); continue; }
        const previous = trail[index - 1];
        if (!previous || Math.hypot(previous.x - trail[index].x, previous.y - trail[index].y) > 150) continue;
        context.beginPath();
        context.moveTo(previous.x, previous.y);
        context.lineTo(trail[index].x, trail[index].y);
        context.strokeStyle = `rgba(255,236,173,${trail[index].life * 1.1})`;
        context.lineWidth = 1.2;
        context.stroke();
      }
      for (let index = particles.length - 1; index >= 0; index--) {
        const spark = particles[index];
        spark.life -= delta;
        if (spark.life <= 0) { particles.splice(index, 1); continue; }
        spark.x += spark.vx * delta;
        spark.y += spark.vy * delta;
        spark.vy -= 5 * delta;
        const alpha = spark.life / spark.max;
        context.fillStyle = `rgba(255,239,183,${alpha * .85})`;
        context.beginPath();
        context.arc(spark.x, spark.y, spark.size * alpha, 0, Math.PI * 2);
        context.fill();
        if (spark.size > 2) {
          context.strokeStyle = `rgba(255,232,156,${alpha * .4})`;
          context.lineWidth = .7;
          context.beginPath();
          context.moveTo(spark.x - 4 * alpha, spark.y);
          context.lineTo(spark.x + 4 * alpha, spark.y);
          context.moveTo(spark.x, spark.y - 4 * alpha);
          context.lineTo(spark.x, spark.y + 4 * alpha);
          context.stroke();
        }
      }
      frame = requestAnimationFrame(draw);
    };
    const resume = () => { if (!document.hidden && !frame) { lastTime = performance.now(); frame = requestAnimationFrame(draw); } };
    document.addEventListener("visibilitychange", resume);
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); document.removeEventListener("visibilitychange", resume); context.clearRect(0, 0, width, height); };
  }, [active, signal]);

  return <canvas ref={canvas} className="mw-cursor-light-field" aria-hidden="true" />;
}
