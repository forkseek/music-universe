/**
 * 播放历史 —— 「我的旅程」的数据来源。
 *
 * 只记录真实发生过的播放：调用方在音频真正切到一首曲目时调用 rememberPlay。
 * 数据保存在 localStorage，刷新后仍在；不上传任何服务，也不与音乐平台账号关联。
 * 同一首歌重复播放只更新时间并提到最前，因此「旅程」是一份去重的时间线。
 */

import { createJsonStore } from './json'

const KEY = 'music-universe:play-history:v1'
const LIMIT = 60

export interface PlayHistoryEntry {
  /** 稳定主键：曲目 id；调用方需保证同一首歌每次传入相同 key。 */
  key: string
  title: string
  artist: string
  album: string
  cover: string
  /** 播放时刻（毫秒时间戳）。 */
  playedAt: number
  /** 该曲目在当前专辑里的星球 id，便于从旅程一键回到那颗星球。 */
  planetId?: string
}

type Listener = (entries: PlayHistoryEntry[]) => void

const listeners = new Set<Listener>()
let cached: PlayHistoryEntry[] | null = null

function isEntry(value: unknown): value is PlayHistoryEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Record<string, unknown>
  return typeof entry.key === 'string' && !!entry.key
    && typeof entry.title === 'string' && !!entry.title
    && typeof entry.playedAt === 'number' && Number.isFinite(entry.playedAt)
}

function read(): PlayHistoryEntry[] {
  if (cached) return cached
  cached = store.read([]).slice(0, LIMIT)
  return cached
}
const store = createJsonStore(() => localStorage, KEY, (value: unknown): value is PlayHistoryEntry[] => Array.isArray(value) && value.every(isEntry), 512 * 1024)

function commit(next: PlayHistoryEntry[]) {
  cached = next
  store.write(next)
  for (const listener of listeners) listener(next)
}

export function readPlayHistory(): PlayHistoryEntry[] { return read() }

export function rememberPlay(entry: Omit<PlayHistoryEntry, 'playedAt'> & { playedAt?: number }) {
  const key = entry.key?.trim()
  const title = entry.title?.trim()
  if (!key || !title) return
  const rest = read().filter((item) => item.key !== key)
  commit([{ ...entry, key, title, playedAt: entry.playedAt ?? Date.now() }, ...rest].slice(0, LIMIT))
}

export function clearPlayHistory() { commit([]) }

export function subscribePlayHistory(listener: Listener) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
