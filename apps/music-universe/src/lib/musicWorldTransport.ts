import { MUSIC_API_BASE } from './deployment'
import { jsonRecord } from './json'

export class MusicRequestError extends Error {
  constructor(message: string, public status: number, public code: string) { super(message) }
}

export async function musicWorldRequest<T>(path: string, init?: { method?: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal }): Promise<T> {
  const method = init?.method || 'GET'
  const response = await fetch(MUSIC_API_BASE + path, {
    method, credentials: 'same-origin', cache: 'no-store', signal: init?.signal,
    headers: { 'X-Music-World': '1', ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
    body: method === 'POST' ? JSON.stringify(init?.body ?? {}) : undefined,
  })
  // A stopped gateway can return HTML. Report a service error instead of a JSON syntax error.
  const result: unknown = await response.json().catch(() => null)
  const error = jsonRecord(jsonRecord(result).error)
  if (!response.ok || !result) throw new MusicRequestError(typeof error.message === 'string' ? error.message : '音乐服务暂时无法连接，请稍后重试。', response.status, typeof error.code === 'string' ? error.code : 'SERVICE_UNAVAILABLE')
  return result as T
}
