export interface AlbumCoverOptions { timeoutMs: number; attempts: number; retryDelayMs: number; ttlMs: number; capacity: number }
export const ALBUM_COVER_OPTIONS: AlbumCoverOptions = { timeoutMs: 30000, attempts: 2, retryDelayMs: 250, ttlMs: 60000, capacity: 2 }

function abortableDelay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted()
    const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(signal.reason) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, ms)
    signal.addEventListener('abort', abort, { once: true })
  })
}

/** Only public same-origin platform artwork is shared. Uploaded blob/data URLs stay scene-owned. */
function shareable(url: string) {
  const base = globalThis.location?.href || 'http://localhost/'
  try {
    const address = new URL(url, base)
    return address.origin === new URL(base).origin && /^\/(mw\/)?api\/(music\/album\/cover(?:\/v2\/netease\/\d{1,20})?|qq\/cover)$/.test(address.pathname)
  } catch { return false }
}

/** A short, bounded decoded-image handoff between album recognition and the actual star texture. */
export class AlbumCoverLoader {
  private images = new Map<string, { image: HTMLImageElement; until: number }>()
  private options: AlbumCoverOptions
  constructor(options: Partial<AlbumCoverOptions> = {}, private createImage: () => HTMLImageElement = () => new Image()) {
    this.options = { ...ALBUM_COVER_OPTIONS, ...options }
  }
  peek(url: string) {
    for (const [key, entry] of this.images) if (entry.until <= Date.now()) this.images.delete(key)
    const hit = this.images.get(url)
    if (!hit) return undefined
    this.images.delete(url); this.images.set(url, hit)
    return hit.image
  }
  async load(url: string, signal: AbortSignal): Promise<HTMLImageElement> {
    signal.throwIfAborted()
    const ready = this.peek(url)
    if (ready) return ready
    for (let attempt = 0; attempt < this.options.attempts; attempt++) {
      try {
        const image = await this.once(url, signal)
        signal.throwIfAborted()
        if (shareable(url)) {
          this.peek(url)
          while (this.images.size >= this.options.capacity) this.images.delete(this.images.keys().next().value!)
          this.images.set(url, { image, until: Date.now() + this.options.ttlMs })
        }
        return image
      } catch (error) {
        signal.throwIfAborted()
        if (attempt + 1 === this.options.attempts) throw error
        await abortableDelay(this.options.retryDelayMs, signal)
      }
    }
    throw new Error('专辑封面暂时无法加载，音乐仍可继续播放。')
  }
  private once(url: string, signal: AbortSignal) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      signal.throwIfAborted()
      const image = this.createImage()
      image.crossOrigin = 'anonymous'
      let finished = false
      const cleanup = () => { clearTimeout(timer); image.onload = image.onerror = null; signal.removeEventListener('abort', abort) }
      const fail = (reason: unknown) => {
        if (finished) return
        finished = true; cleanup(); image.src = ''; reject(reason)
      }
      const abort = () => fail(signal.reason)
      const timer = setTimeout(() => fail(new Error('专辑封面加载超时，请重新获取；音乐仍可继续播放。')), this.options.timeoutMs)
      image.onload = () => {
        if (finished) return
        if (!image.naturalWidth || !image.naturalHeight) { fail(new Error('平台返回了无效的专辑图片。')); return }
        finished = true; cleanup(); resolve(image)
      }
      image.onerror = () => fail(new Error('专辑封面暂时无法加载，音乐仍可继续播放。'))
      signal.addEventListener('abort', abort, { once: true })
      image.src = url
    })
  }
}

export const albumCoverLoader = new AlbumCoverLoader()
