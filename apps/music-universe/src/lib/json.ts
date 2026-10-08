export type JsonGuard<T> = (value: unknown) => value is T

/** Cache validated JSON, bound parsing work, and skip identical storage writes. */
export function createJsonStore<T>(storage: () => Storage, key: string, validate: JsonGuard<T>, maxChars = 8 * 1024 * 1024) {
  let previousRaw: string | null | undefined, previousValue: T | undefined
  return {
    read(fallback: T): T {
      try {
        const raw = storage().getItem(key)
        if (raw === previousRaw) return previousValue ?? fallback
        previousRaw = raw; previousValue = undefined
        if (!raw || raw.length > maxChars) return fallback
        const value: unknown = JSON.parse(raw)
        if (validate(value)) previousValue = value
      } catch { /* Corrupt or unavailable storage must not stop rendering. */ }
      return previousValue ?? fallback
    },
    write(value: T): boolean {
      if (!validate(value)) return false
      try {
        const raw = JSON.stringify(value)
        if (raw.length > maxChars) return false
        if (raw !== previousRaw || storage().getItem(key) !== raw) storage().setItem(key, raw)
        previousRaw = raw; previousValue = value
        return true
      } catch { return false }
    },
  }
}

export function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
