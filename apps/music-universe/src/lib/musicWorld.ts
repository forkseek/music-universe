const configured = import.meta.env?.VITE_MUSIC_WORLD_URL || (import.meta.env?.BASE_URL === '/universe/' ? '/' : 'http://127.0.0.1:3002/')

export function musicWorldHref(room: 'hall' | 'world' | 'library' | 'journey' = 'hall') {
  try {
    const url = new URL(configured, typeof window === 'undefined' ? 'http://127.0.0.1:3002/' : window.location.href)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported URL')
    url.hash = room
    return url.href
  } catch {
    return `http://127.0.0.1:3002/#${room}`
  }
}

export const MUSIC_HALL_URL = musicWorldHref()

export function navigateToMusicWorld(room: 'hall' | 'world' | 'library' | 'journey') {
  if (window.parent !== window) window.parent.postMessage({ type: 'music-universe:navigate', room }, window.location.origin)
  else window.location.assign(musicWorldHref(room))
}
