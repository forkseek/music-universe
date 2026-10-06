export type FilmTimeline = { fps: number; frameCount: number; width: number; height: number; duration: number; pattern: string; digits: number };

export function parseFilmTimeline(value: unknown): FilmTimeline {
  if (!value || typeof value !== "object") throw new Error("Animation timeline is unavailable.");
  const entry = value as Record<string, unknown>;
  for (const key of ["fps", "frameCount", "width", "height", "duration", "digits"]) {
    if (typeof entry[key] !== "number" || !Number.isFinite(entry[key]) || entry[key] <= 0) throw new Error("Invalid animation timeline.");
  }
  if (entry.fps !== 60 || !Number.isInteger(entry.frameCount) || Number(entry.frameCount) > 6000 || !Number.isInteger(entry.digits) || Number(entry.digits) > 8 || Number(entry.width) > 4096 || Number(entry.height) > 4096 || typeof entry.pattern !== "string" || !entry.pattern.startsWith("/media/music-world-continuous/frames/") || !entry.pattern.includes("{index}")) throw new Error("Invalid animation frames.");
  return { fps: entry.fps as number, frameCount: entry.frameCount as number, width: entry.width as number, height: entry.height as number, duration: entry.duration as number, pattern: entry.pattern, digits: entry.digits as number };
}

/** Keep a small decoded window so wheel input does not repeatedly seek a video. */
export class ContinuousFrames {
  private cache = new Map<number, ImageBitmap>();
  private pending = new Map<number, AbortController>();
  private queue: number[] = [];
  private center = -1;
  private direction = 1;
  private protectedIndex = 0;
  private closed = false;
  private readonly ahead: number;
  private readonly behind: number;
  private readonly concurrency: number;

  constructor(readonly timeline: FilmTimeline, smallScreen: boolean, private readonly onFailure: () => void) {
    this.ahead = smallScreen ? 14 : 28;
    this.behind = smallScreen ? 6 : 10;
    this.concurrency = smallScreen ? 4 : 6;
  }

  get(index: number) { return this.cache.get(index); }

  aim(index: number, direction: number, protectedIndex: number) {
    if (this.closed) return;
    this.protectedIndex = protectedIndex;
    const center = Math.max(0, Math.min(this.timeline.frameCount - 1, index));
    const sign = direction < 0 ? -1 : 1;
    if (this.center === center && this.direction === sign) return;
    this.center = center;
    this.direction = sign;
    const order = [center];
    for (let offset = 1; offset <= this.ahead; offset++) {
      order.push(center + offset * sign);
      if (offset <= this.behind) order.push(center - offset * sign);
    }
    this.queue = order.filter((next) => next >= 0 && next < this.timeline.frameCount && !this.cache.has(next) && !this.pending.has(next));
    for (const [next, controller] of this.pending) if (!this.keep(next)) controller.abort();
    this.prune();
    this.pump();
  }

  private keep(index: number) {
    if (index === this.protectedIndex) return true;
    const distance = (index - this.center) * this.direction;
    return distance >= -this.behind && distance <= this.ahead;
  }

  private prune() {
    for (const [index, bitmap] of this.cache) if (!this.keep(index)) { bitmap.close(); this.cache.delete(index); }
  }

  private pump() {
    if (this.closed) return;
    if (this.center >= 0 && !this.cache.has(this.center) && !this.pending.has(this.center) && !this.queue.includes(this.center)) this.queue.unshift(this.center);
    while (this.pending.size < this.concurrency && this.queue.length) {
      const index = this.queue.shift()!;
      if (this.cache.has(index) || this.pending.has(index)) continue;
      const controller = new AbortController();
      this.pending.set(index, controller);
      void this.load(index, controller);
    }
  }

  private async load(index: number, controller: AbortController) {
    const timeout = window.setTimeout(() => {
      if (!this.closed && this.keep(index)) { this.onFailure(); this.dispose(); }
      controller.abort();
    }, 10000);
    try {
      const url = this.timeline.pattern.replace("{index}", String(index).padStart(this.timeline.digits, "0"));
      const response = await fetch(url, { signal: controller.signal, cache: "force-cache" });
      if (!response.ok) throw new Error("Animation frame is unavailable.");
      const bitmap = await createImageBitmap(await response.blob());
      if (this.closed || controller.signal.aborted || !this.keep(index)) bitmap.close();
      else { this.cache.set(index, bitmap); this.prune(); }
    } catch {
      if (!this.closed && !controller.signal.aborted) { this.onFailure(); this.dispose(); }
    } finally {
      clearTimeout(timeout);
      this.pending.delete(index);
      this.pump();
    }
  }

  dispose() {
    this.closed = true;
    this.queue = [];
    for (const controller of this.pending.values()) controller.abort();
    this.pending.clear();
    for (const bitmap of this.cache.values()) bitmap.close();
    this.cache.clear();
  }
}
