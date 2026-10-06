export interface LyricLine {
  time: number;
  text: string;
}

export interface ListeningTrack {
  id: string;
  title: string;
  artist: string;
  description: string;
  genre: string;
  url: string;
  artwork: string;
  duration: number;
  source: "original" | "local" | "qqmusic";
  lyrics: LyricLine[];
  fileKey?: string;
  online?: { mid: string; mediaMid: string; songId: string; albumMid: string; fee: number };
  externalUrl?: string;
}

// These are original, locally generated instrumentals, independent of the metadata Demo library.
export const listeningDemos: ListeningTrack[] = [
  { id: "cloud-letter", title: "云层来信", artist: "Music World Lab", description: "把喧嚣留在远处，让一封云端的信慢慢落进耳朵。", genre: "AMBIENT", url: "/audio/cloud-letter.wav", artwork: "/media/scene-light.webp", duration: 80, source: "original", lyrics: [] },
  { id: "little-orbit", title: "微光漫游", artist: "Music World Lab", description: "沿着温柔的鼓点，去寻找下一束光。", genre: "LO-FI", url: "/audio/little-orbit.wav", artwork: "/media/scene-run.webp", duration: 80, source: "original", lyrics: [] },
  { id: "night-signal", title: "夜航信号", artist: "Music World Lab", description: "夜色降落，星星与旋律开始交换秘密。", genre: "DOWNTEMPO", url: "/audio/night-signal.wav", artwork: "/media/scene-awaken.webp", duration: 80, source: "original", lyrics: [] },
];

export function clockTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  return String(Math.floor(whole / 60)) + ":" + String(whole % 60).padStart(2, "0");
}

export function parseLyrics(text: string): LyricLine[] {
  const result: LyricLine[] = [];
  const offset = Number(text.match(/\[offset:([+-]?\d{1,7})\]/i)?.[1] ?? 0) / 1000;
  for (const line of text.split(/\r?\n/).slice(0, 10000)) {
    const timestamps = [...line.matchAll(/\[(\d{1,3}):([0-5]\d)(?:[.:](\d{1,3}))?\]/g)];
    const content = line.replace(/\[[^\]]*\]/g, "").trim().slice(0, 500);
    if (!content) continue;
    for (const stamp of timestamps) {
      const fraction = stamp[3] ? Number("0." + stamp[3]) : 0;
      result.push({ time: Math.max(0, Number(stamp[1]) * 60 + Number(stamp[2]) + fraction + offset), text: content });
      if (result.length >= 2000) return result.sort((a, b) => a.time - b.time);
    }
  }
  return result.sort((a, b) => a.time - b.time);
}

export const musicFilePattern = /\.(mp3|m4a|wav|ogg|flac|aac|opus|aiff|aif|webm)$/i;

export function localTrack(file: File, url: string): ListeningTrack {
  const basename = file.name.replace(/\.[^.]+$/, "").slice(0, 160);
  const split = basename.indexOf(" - ");
  return {
    id: crypto.randomUUID(),
    title: split > 0 ? basename.slice(split + 3).trim() : basename,
    artist: split > 0 ? basename.slice(0, split).trim() : "我的本地音乐",
    description: "一首属于你的音乐，现在也属于这个世界。",
    genre: "YOUR MUSIC",
    url,
    artwork: "/media/scene-hall-2k.webp",
    duration: 0,
    source: "local",
    lyrics: [],
    fileKey: file.name + ":" + file.size + ":" + file.lastModified,
  };
}
