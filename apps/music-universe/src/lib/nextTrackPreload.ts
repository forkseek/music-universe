export interface NextTrackPreloadOptions { aheadSeconds: number; maxBytes: number; bufferTimeoutMs: number; ttlMs: number }
export const NEXT_TRACK_PRELOAD: Readonly<NextTrackPreloadOptions> = Object.freeze({ aheadSeconds: 20, maxBytes: 16 * 1024 * 1024, bufferTimeoutMs: 7000, ttlMs: 60000 })

interface Source<T> { url: string; info: T; objectUrl?: boolean; releasePreload?: () => void }
interface Slot<T> { key: string; controller: AbortController; expires: number; source?: Source<T>; blob?: Blob; objectUrl?: string; warmAudio?: HTMLAudioElement; task: Promise<void> }

/** One in-memory next track. No second audible player, disk cache or retained object URLs. */
export class NextTrackPreloader<T> {
  private slot?: Slot<T>
  constructor(private options = NEXT_TRACK_PRELOAD, private request: typeof fetch = (...args) => fetch(...args), private now = Date.now) {}

  prepare(key: string, resolve: (signal: AbortSignal) => Promise<Source<T>>): Promise<void> {
    if (this.slot?.key === key && this.slot.expires > this.now()) return this.slot.task
    this.clear()
    const slot: Slot<T> = { key, controller: new AbortController(), expires: this.now() + this.options.ttlMs, task: Promise.resolve() }
    this.slot = slot
    slot.task = (async () => {
      try {
        const source = await resolve(slot.controller.signal)
        if (this.slot !== slot || slot.controller.signal.aborted) return
        slot.source = source
        slot.expires = this.now() + this.options.ttlMs
        // Reuse downloaded bytes even though the music proxy correctly sends Cache-Control: no-store.
        const blob = await this.buffer(source.url, slot.controller.signal)
        if (this.slot === slot && !slot.controller.signal.aborted && blob) {
          slot.blob = blob
          // Decode metadata ahead of time without ever playing this detached, muted element.
          if (typeof Audio !== 'undefined') {
            slot.objectUrl = URL.createObjectURL(blob)
            const warm = slot.warmAudio = new Audio()
            warm.muted = true; warm.preload = 'auto'; warm.src = slot.objectUrl; warm.load()
          }
        }
      } catch { /* Preparation failure must never pause the current song or hide its lyrics. */ }
    })()
    return slot.task
  }

  take(key: string): Source<T> | undefined {
    const slot = this.slot
    this.slot = undefined
    slot?.controller.abort()
    if (!slot || slot.key !== key || slot.expires <= this.now() || !slot.source) {
      if (slot) this.dispose(slot, true)
      return
    }
    // Transfer the URL to the existing player's cleanup; release its silent warm-up after load.
    return slot.blob ? { ...slot.source, url: slot.objectUrl || URL.createObjectURL(slot.blob), objectUrl: true,
      releasePreload: () => this.dispose(slot, false) } : slot.source
  }

  clear() { if (this.slot) this.dispose(this.slot, true); this.slot = undefined }

  private dispose(slot: Slot<T>, revoke: boolean) {
    slot.controller.abort()
    if (slot.warmAudio) { slot.warmAudio.removeAttribute('src'); slot.warmAudio.load(); slot.warmAudio = undefined }
    if (revoke && slot.objectUrl) URL.revokeObjectURL(slot.objectUrl)
    slot.blob = undefined; slot.objectUrl = undefined
  }

  private async buffer(url: string, parent: AbortSignal): Promise<Blob | undefined> {
    const signal = AbortSignal.any([parent, AbortSignal.timeout(this.options.bufferTimeoutMs)])
    const response = await this.request(url, { credentials: 'same-origin', cache: 'no-store', signal })
    const type = response.headers.get('content-type') || ''
    if (!response.ok || !response.body || !/^(audio\/|video\/mp4|application\/octet-stream)/i.test(type)
      || Number(response.headers.get('content-length')) > this.options.maxBytes) {
      await response.body?.cancel(); return
    }
    const reader = response.body.getReader(), chunks: ArrayBuffer[] = []
    let size = 0
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > this.options.maxBytes) { await reader.cancel(); return }
        chunks.push(value.slice().buffer)
      }
      signal.throwIfAborted()
      return size ? new Blob(chunks, { type }) : undefined
    } finally { reader.releaseLock() }
  }
}
