import { useSyncExternalStore } from 'react'

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
let mediaWindow: Window | undefined
let media: MediaQueryList | undefined

function getMedia() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
  if (!media || mediaWindow !== window) {
    mediaWindow = window
    media = window.matchMedia(REDUCED_MOTION_QUERY)
  }
  return media
}

export function readReducedMotion() { return getMedia()?.matches ?? false }

export function subscribeReducedMotion(onChange: () => void) {
  const query = getMedia()
  if (!query) return () => {}
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }
  // Older Safari still uses MediaQueryList's listener methods.
  query.addListener(onChange)
  return () => query.removeListener(onChange)
}

/** Responds to system changes without remounting the scene or its input owners. */
export function useReducedMotion() {
  return useSyncExternalStore(subscribeReducedMotion, readReducedMotion, () => false)
}
