/** LRC timestamps and HTMLAudioElement.currentTime both use seconds. */
export interface LyricLine { time: number; text: string }
export const LYRIC_LIMITS = { bytes: 512 * 1024, lines: 2000, textLength: 500, cacheEntries: 24, cacheMs: 10 * 60_000 } as const

export function parseLrc(input: string): LyricLine[] {
  if (input.length > LYRIC_LIMITS.bytes || new TextEncoder().encode(input).byteLength > LYRIC_LIMITS.bytes) throw new Error('歌词文件不能超过 512 KB。')
  const source = input.replace(/^\uFEFF/, '').replace(/\r/g, '')
  const offsets = [...source.matchAll(/\[offset\s*:\s*([+-]?\d+)\s*\]/gi)]
  const offset = Number(offsets.at(-1)?.[1] ?? 0) / 1000
  const grouped = new Map<number, string[]>()
  let count = 0
  for (const row of source.split('\n')) {
    const stamps = [...row.matchAll(/\[(\d{1,3}):([0-5]\d)(?:[.:](\d{1,3}))?\]/g)]
    if (!stamps.length) continue
    const text = row.replace(/\[[^\]]*\]/g, '').replace(/<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g, '').trim().slice(0, LYRIC_LIMITS.textLength)
    for (const stamp of stamps) {
      if (++count > LYRIC_LIMITS.lines) throw new Error('歌词时间行不能超过 2000 行。')
      const time = Math.max(0, Number(stamp[1]) * 60 + Number(stamp[2]) + Number(`0.${stamp[3] ?? '0'}`) + offset)
      const texts = grouped.get(time) ?? []
      if (text && !texts.includes(text) && texts.length < 2) texts.push(text)
      grouped.set(time, texts)
    }
  }
  return [...grouped].map(([time, texts]) => ({ time, text: texts.join('\n') })).sort((a, b) => a.time - b.time)
}

/** Binary lookup also works when seeking backwards, pausing or changing playbackRate. */
export function lyricIndexAt(lines: readonly LyricLine[], time: number): number {
  if (!Number.isFinite(time)) return -1
  let low = 0, high = lines.length - 1, found = -1
  while (low <= high) {
    const middle = (low + high) >>> 1
    if (lines[middle].time <= time) { found = middle; low = middle + 1 } else high = middle - 1
  }
  return found
}
