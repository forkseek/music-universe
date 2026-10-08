const base = import.meta.env?.BASE_URL || '/'
export const MUSIC_API_BASE = base === '/universe/' ? '' : '/mw'
export const universeAsset = (path: string) => base + path.replace(/^\//, '')
