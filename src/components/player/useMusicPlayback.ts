"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { resolveListeningAudio } from "@/lib/music/providers/radiohand-browser";
import { listeningDemos, localTrack, musicFilePattern, type ListeningTrack, type LyricLine } from "./player-library";

type RepeatMode = "all" | "one" | "off";

export function useMusicPlayback(active: boolean) {
  const audio = useRef<HTMLAudioElement>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const context = useRef<AudioContext | null>(null);
  const source = useRef<MediaElementAudioSourceNode | null>(null);
  const request = useRef<AbortController | null>(null);
  const requestNumber = useRef(0);
  const urls = useRef(new Set<string>());
  const ids = useRef(new Map<string, string>());
  const userSelected = useRef(false);
  const history = useRef<string[]>([]);
  const [tracks, setTracks] = useState<ListeningTrack[]>(listeningDemos);
  const [trackId, setTrackId] = useState(listeningDemos[0].id);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(listeningDemos[0].duration);
  const [volume, setVolumeState] = useState(0.65);
  const [muted, setMuted] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("all");
  const [shuffle, setShuffle] = useState(false);
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [quality, setQuality] = useState("原创试听");
  const [trial, setTrial] = useState(false);
  const track = tracks.find((item) => item.id === trackId) ?? tracks[0] ?? listeningDemos[0];

  const pause = useCallback(() => {
    request.current?.abort(); requestNumber.current++;
    audio.current?.pause(); setBuffering(false);
    if (context.current?.state === "running") void context.current.suspend().catch(() => {});
  }, []);

  const start = useCallback(async (next: ListeningTrack) => {
    const element = audio.current;
    if (!element) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const number = ++requestNumber.current;
    userSelected.current = true;
    setError(""); setNotice(""); setBuffering(true);
    try {
      if (element.dataset.trackId !== next.id || element.error || element.ended) {
        element.pause();
        const resolved = await resolveListeningAudio(next, controller.signal);
        if (controller.signal.aborted || number !== requestNumber.current) return;
        element.src = resolved.url; element.dataset.trackId = next.id; element.load();
        setQuality(resolved.quality); setTrial(resolved.trial);
      }
      // The audio graph is created on the first play gesture and reused for this audio element.
      if (!context.current && typeof AudioContext !== "undefined") {
        try {
          const graph = new AudioContext();
          const input = graph.createMediaElementSource(element);
          const meter = graph.createAnalyser(); meter.fftSize = 1024; meter.smoothingTimeConstant = 0.82;
          input.connect(meter); meter.connect(graph.destination);
          source.current = input; analyser.current = meter; context.current = graph;
        } catch { /* Native audio remains usable when the browser does not provide an analyser. */ }
      }
      if (context.current?.state === "suspended") void context.current.resume().catch(() => {});
      await element.play();
      if (controller.signal.aborted || number !== requestNumber.current) element.pause();
    } catch (cause) {
      if (controller.signal.aborted || number !== requestNumber.current) return;
      const name = cause instanceof DOMException ? cause.name : "";
      if (name !== "AbortError") setError(name === "NotAllowedError" ? "浏览器需要一次播放点击，请再点一下播放。" : cause instanceof Error ? cause.message : "这首歌暂时无法播放，请换一首或重试。");
      setBuffering(false);
    }
  }, []);

  const choose = useCallback((next: ListeningTrack, autoplay = true, markUser = true) => {
    if (markUser) userSelected.current = true;
    request.current?.abort(); requestNumber.current++;
    audio.current?.pause();
    setTrackId(next.id); setPosition(0); setDuration(next.duration); setError(""); setBuffering(false); setTrial(false);
    setQuality(next.source === "qqmusic" ? "待播放" : next.source === "local" ? "本地音乐" : "原创试听");
    if (audio.current) { audio.current.removeAttribute("src"); delete audio.current.dataset.trackId; audio.current.load(); }
    if (autoplay) void start(next);
  }, [start]);

  const addOnline = useCallback((incoming: ListeningTrack[], initialize = false) => {
    const normalized = incoming.map((item) => {
      const key = item.online?.mid ?? item.id;
      const id = ids.current.get(key) ?? item.id; ids.current.set(key, id);
      return { ...item, id };
    });
    setTracks((current) => {
      const online = new Map(current.filter((item) => item.source === "qqmusic").map((item) => [item.id, item]));
      for (const item of normalized) online.set(item.id, { ...online.get(item.id), ...item, lyrics: online.get(item.id)?.lyrics ?? [] });
      return [...online.values()].slice(-80).concat(current.filter((item) => item.source !== "qqmusic"));
    });
    if (initialize && normalized.length && !userSelected.current) choose(normalized[0], false, false);
    return normalized;
  }, [choose]);

  useEffect(() => {
    if (active) return;
    request.current?.abort(); requestNumber.current++;
    audio.current?.pause();
    if (context.current?.state === "running") void context.current.suspend().catch(() => {});
  }, [active]);

  useEffect(() => {
    const element = audio.current;
    if (element) element.volume = 0.65;
    const owned = urls.current;
    return () => {
      request.current?.abort();
      if (element) { element.pause(); element.removeAttribute("src"); element.load(); }
      source.current?.disconnect(); analyser.current?.disconnect();
      if (context.current) void context.current.close().catch(() => {});
      context.current = null; analyser.current = null; source.current = null;
      for (const url of owned) URL.revokeObjectURL(url);
      owned.clear();
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function seek(seconds: number) {
    const element = audio.current;
    const maximum = element && Number.isFinite(element.duration) ? element.duration : duration;
    if (!element || !element.dataset.trackId || maximum <= 0) return;
    const time = Math.max(0, Math.min(seconds, maximum));
    try { element.currentTime = time; setPosition(time); } catch { /* Metadata may still be loading. */ }
  }

  function advance(direction: -1 | 1, ended = false) {
    if (direction === -1 && position > 3) { seek(0); return; }
    if (ended && repeat === "one") { seek(0); void start(track); return; }
    const index = tracks.findIndex((item) => item.id === track.id);
    if (ended && repeat === "off" && !shuffle && index === tracks.length - 1) { pause(); return; }
    let next: ListeningTrack | undefined;
    if (direction === -1 && shuffle) { const previous = history.current.pop(); next = tracks.find((item) => item.id === previous); }
    if (!next && shuffle && direction === 1 && tracks.length > 1) {
      const options = tracks.filter((item) => item.id !== track.id); next = options[Math.floor(Math.random() * options.length)];
    }
    next ??= tracks[(index + direction + tracks.length) % tracks.length];
    if (direction === 1) { history.current.push(track.id); history.current = history.current.slice(-100); }
    if (next) choose(next);
  }

  function setVolume(value: number) {
    const level = Math.max(0, Math.min(1, value)); setVolumeState(level); setMuted(false);
    if (audio.current) { audio.current.volume = level; audio.current.muted = false; }
  }

  function toggleMute() { setMuted(!muted); if (audio.current) audio.current.muted = !muted; }

  function importFiles(files: File[]) {
    const known = new Set(tracks.map((item) => item.fileKey).filter(Boolean));
    const added: ListeningTrack[] = [];
    let skipped = 0;
    for (const file of files.slice(0, 100)) {
      const key = file.name + ":" + file.size + ":" + file.lastModified;
      if (known.has(key) || file.size > 300 * 1024 * 1024 || !file.size || !musicFilePattern.test(file.name)
        || tracks.filter((item) => item.source === "local").length + added.length >= 100) { skipped++; continue; }
      const url = URL.createObjectURL(file); urls.current.add(url); known.add(key); added.push(localTrack(file, url));
    }
    if (added.length) { setTracks((current) => [...current, ...added]); choose(added[0]); }
    setNotice(added.length ? "已添加 " + added.length + " 首本地音乐" + (skipped ? "，已跳过重复或不支持的文件。" : "，文件留在你的设备上。") : "请添加 MP3、M4A、WAV、OGG 等音频文件；单个文件不超过 300 MB。");
  }

  const setLyrics = useCallback((id: string, lyrics: LyricLine[]) => setTracks((current) => current.map((item) => item.id === id ? { ...item, lyrics } : item)), []);

  function metadata(element: HTMLAudioElement) {
    if (!Number.isFinite(element.duration)) return;
    setDuration(element.duration);
    setTracks((current) => current.map((item) => item.id === element.dataset.trackId ? { ...item, duration: element.duration } : item));
  }

  function remove(id: string) {
    if (tracks.length <= 1) return;
    const next = tracks.filter((item) => item.id !== id);
    if (track.id === id) choose(next[0], false);
    setTracks(next);
    const removed = tracks.find((item) => item.id === id);
    if (removed?.source === "local") { URL.revokeObjectURL(removed.url); urls.current.delete(removed.url); }
  }

  function toggleLike() { setLiked((current) => { const next = new Set(current); if (next.has(track.id)) next.delete(track.id); else next.add(track.id); return next; }); }

  return {
    audio, analyser, track, tracks, playing, buffering, position, duration, volume, muted, repeat, shuffle, liked, error, notice, quality, trial,
    start: () => void start(track), toggle: () => { if (audio.current && !audio.current.paused) pause(); else void start(track); },
    pause, choose, addOnline, seek, advance, setVolume, toggleMute, importFiles, setLyrics, remove, toggleLike,
    toggleShuffle: () => setShuffle(!shuffle), cycleRepeat: () => setRepeat(repeat === "all" ? "one" : repeat === "one" ? "off" : "all"),
    report: setNotice, clearError: () => setError(""),
    events: {
      onPlaying: () => { setPlaying(true); setBuffering(false); setError(""); },
      onPause: () => setPlaying(false), onWaiting: () => setBuffering(true), onCanPlay: () => setBuffering(false),
      onTimeUpdate: (element: HTMLAudioElement) => setPosition(element.currentTime), onLoadedMetadata: metadata,
      onEnded: () => { setPlaying(false); advance(1, true); },
      onError: () => { if (!audio.current?.src) return; setPlaying(false); setBuffering(false); setError("音频暂时无法读取，请重新播放，或选择其他曲目。"); },
    },
  };
}
