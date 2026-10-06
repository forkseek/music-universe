"use client";

import { useEffect, useRef, useState } from "react";

// 音乐大厅的整体背景音乐。
//
// 它挂载在 StagedHome（#hall 界面的外壳）这一层，而不是大厅内部的某个局部
// 组件，所以大厅里的滚动 / 呼吸动画 / 场景切换都不会打断它；离开 #hall
// （进入 #world、#library 等模块）时自动淡出并暂停，避免和播放器里的音乐打架。
//
// 音频本身是处理过的「无缝闭环」版本：曲尾与曲头先做了等功率交叉淡化，
// 循环点因此落在原始波形的相邻采样上，loop 播放时听不到断点或爆音。
const TRACK = "/audio/hall-ambient-loop.wav";
const VOLUME = 0.22; // 目标音量，比原始曲目更轻、更柔和
const FADE_IN_MS = 2600; // 进入大厅时缓慢淡入，不突兀
const FADE_OUT_MS = 1200; // 离开大厅时柔和淡出

// 用持久化的 holder 记录 rAF id，让新的渐变能取消上一次未完成的渐变。
type FadeHolder = { id: number | null };
function rampVolume(audio: HTMLAudioElement, target: number, duration: number, holder: FadeHolder, onDone?: () => void) {
  if (holder.id !== null) cancelAnimationFrame(holder.id);
  const from = audio.volume;
  const startedAt = performance.now();
  const tick = (now: number) => {
    const progress = duration > 0 ? Math.min(1, (now - startedAt) / duration) : 1;
    // 余弦(ease-out)曲线，音量推进更接近自然衰减，听感更温柔。
    audio.volume = from + (target - from) * (0.5 - Math.cos(Math.PI * progress) / 2);
    if (progress < 1) {
      holder.id = requestAnimationFrame(tick);
      return;
    }
    holder.id = null;
    onDone?.();
  };
  holder.id = requestAnimationFrame(tick);
}

export function HallBackgroundMusic({ active }: { active: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const fade = useRef<FadeHolder>({ id: null });
  const [muted, setMuted] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = muted;
  }, [muted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const holder = fade.current;

    if (!active) {
      // 离开大厅：柔和淡出，结束后暂停，避免与播放器里的音乐重叠。
      rampVolume(audio, 0, FADE_OUT_MS, holder, () => audio.pause());
      return () => {
        if (holder.id !== null) {
          cancelAnimationFrame(holder.id);
          holder.id = null;
        }
      };
    }

    let cancelled = false;
    const releases: Array<() => void> = [];
    const release = () => {
      for (const off of releases.splice(0)) off();
    };
    const start = () => {
      if (cancelled) return;
      // 从 0 音量起播，拿到播放权限后再缓缓推到目标音量。
      audio.volume = 0;
      void audio.play()
        .then(() => {
          if (cancelled) return;
          setBlocked(false);
          release();
          rampVolume(audio, VOLUME, FADE_IN_MS, holder);
        })
        .catch(() => {
          if (!cancelled) setBlocked(true);
        });
    };
    const resume = () => start();
    // 浏览器自动播放策略要求先有用户手势：首次进入若被拦截，就在大厅里的
    // 第一次交互（点击 / 按键 / 滚轮 / 触摸）时补播。
    for (const name of ["pointerdown", "keydown", "wheel", "touchstart"] as const) {
      window.addEventListener(name, resume);
      releases.push(() => window.removeEventListener(name, resume));
    }
    start();
    return () => {
      cancelled = true;
      release();
    };
  }, [active]);

  return (
    <div className="mw-hall-bgm" data-active={active}>
      <audio ref={audioRef} src={TRACK} loop preload="none" />
      {blocked && active ? <span className="mw-hall-bgm-hint">点击任意位置开启背景音乐</span> : null}
      <button
        type="button"
        className={muted ? "mw-hall-bgm-toggle is-muted" : "mw-hall-bgm-toggle"}
        aria-pressed={muted}
        aria-label={muted ? "开启音乐大厅背景音乐" : "关闭音乐大厅背景音乐"}
        onClick={() => setMuted((value) => !value)}
      >
        <span aria-hidden="true">♪</span>
      </button>
    </div>
  );
}
