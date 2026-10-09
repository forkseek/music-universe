import { MUSIC_API_BASE } from './deployment'
import { jsonRecord } from './json'

export class MusicRequestError extends Error {
  constructor(message: string, public status: number, public code: string) { super(message) }
}

export interface MusicRequestOptions { method?: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal; timeoutMs?: number; retryRead?: boolean }

async function once<T>(path: string, init?: MusicRequestOptions): Promise<T> {
  const method = init?.method || 'GET'
  init?.signal?.throwIfAborted()
  const deadline = new AbortController()
  const abort = () => deadline.abort(init?.signal?.reason)
  init?.signal?.addEventListener('abort', abort, { once: true })
  let timedOut = false
  const timer = setTimeout(() => { timedOut = true; deadline.abort() }, init?.timeoutMs ?? 30000)
  try {
    const response = await fetch(MUSIC_API_BASE + path, {
      method, credentials: 'same-origin', cache: 'no-store',
      headers: { 'X-Music-World': '1', ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
      body: method === 'POST' ? JSON.stringify(init?.body ?? {}) : undefined,
      signal: deadline.signal,
    })
    // A stopped gateway can return HTML. Report a service error instead of a JSON syntax error.
    const result: unknown = await response.json().catch(() => null)
    const error = jsonRecord(jsonRecord(result).error)
    if (!response.ok || !result) throw new MusicRequestError(typeof error.message === 'string' ? error.message : '音乐服务暂时无法连接，请稍后重试。', response.status, typeof error.code === 'string' ? error.code : 'SERVICE_UNAVAILABLE')
    return result as T
  } catch (error) {
    init?.signal?.throwIfAborted()
    if (timedOut) throw new MusicRequestError('音乐服务响应超时，请重试。', 504, 'SERVICE_TIMEOUT')
    throw error
  } finally {
    clearTimeout(timer); init?.signal?.removeEventListener('abort', abort)
  }
}

export async function musicWorldRequest<T>(path: string, init?: MusicRequestOptions): Promise<T> {
  try { return await once<T>(path, init) }
  catch (error) {
    init?.signal?.throwIfAborted()
    // Only callers declaring a read operation may retry one transient failure.
    // Login, logout, playback resolution and authorization writes remain single-shot.
    const transient = error instanceof TypeError || (error instanceof MusicRequestError && [502, 503, 504].includes(error.status))
    if (!init?.retryRead || !transient) throw error
    await new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); init.signal?.removeEventListener('abort', abort); reject(init.signal?.reason) }
      const timer = setTimeout(() => { init.signal?.removeEventListener('abort', abort); resolve() }, 350)
      init.signal?.addEventListener('abort', abort, { once: true })
    })
    return once<T>(path, init)
  }
}
