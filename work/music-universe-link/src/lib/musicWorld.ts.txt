const configured = import.meta.env.VITE_MUSIC_WORLD_URL || 'http://127.0.0.1:3002/'

export function musicWorldHref(room: 'hall' | 'world' | 'library' | 'journey' = 'hall') {
  try {
    const url = new URL(configured)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported URL')
    url.hash = room
    return url.href
  } catch {
    return `http://127.0.0.1:3002/#${room}`
  }
}

export const MUSIC_HALL_URL = musicWorldHref()
