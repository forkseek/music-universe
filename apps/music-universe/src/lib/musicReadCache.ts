/** Browser-only, bounded read cache. It never holds audio URLs or login credentials. */
export class MusicReadCache {
  private entries = new Map<string, { value: unknown; until: number }>()
  private revision = 0
  constructor(private capacity = 32) {}
  clear() { this.revision++; this.entries.clear() }
  async read<T>(key: string, ttlMs: number, fetchValue: () => Promise<T>, signal?: AbortSignal, force = false, cacheable: (value: T) => boolean = () => true): Promise<T> {
    signal?.throwIfAborted()
    const hit = this.entries.get(key)
    if (!force && hit && hit.until > Date.now()) {
      this.entries.delete(key); this.entries.set(key, hit)
      return hit.value as T
    }
    const revision = this.revision
    const value = await fetchValue()
    signal?.throwIfAborted()
    // A response started before logout/login must never repopulate the new account's cache.
    if (revision === this.revision && cacheable(value)) {
      for (const [entryKey, entry] of this.entries) if (entry.until <= Date.now()) this.entries.delete(entryKey)
      while (this.entries.size >= this.capacity) this.entries.delete(this.entries.keys().next().value!)
      this.entries.set(key, { value, until: Date.now() + ttlMs })
    }
    return value
  }
}
