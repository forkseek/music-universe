import { useEffect } from 'react'
import { navigateToMusicWorld } from '../lib/musicWorld'

export function notifyUniverseReady() {
  if (window.parent !== window) window.parent.postMessage({ type: 'music-universe:ready' }, window.location.origin)
}

export function useHallEmbedding() {
  useEffect(() => {
    if (window.parent === window) return
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null
      if (!anchor) return
      const url = new URL((anchor as HTMLAnchorElement).href)
      const room = url.hash.slice(1)
      if (url.origin !== location.origin || url.pathname !== '/' || !['hall', 'world', 'library', 'journey'].includes(room)) return
      event.preventDefault()
      navigateToMusicWorld(room as 'hall' | 'world' | 'library' | 'journey')
    }
    document.addEventListener('click', click, true)
    return () => document.removeEventListener('click', click, true)
  }, [])
}
