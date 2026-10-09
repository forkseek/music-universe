import { useEffect, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { SRGBColorSpace, Texture } from 'three'
import { sampleAlbumTone } from '../lib/albumLighting'
import type { AlbumTone } from '../lib/albumLighting'
import { albumCoverLoader } from '../lib/albumCover'

function coverTexture(url: string, image?: HTMLImageElement) {
  const value = new Texture(image)
  value.colorSpace = SRGBColorSpace
  value.userData.coverUrl = image ? url : ''
  if (image) value.needsUpdate = true
  return value
}

/** Keep the previous texture bound until the replacement image and GPU texture are ready. */
export function useAlbumTexture(url: string, onReady: () => void, onTone?: (tone: AlbumTone | null) => void, onError?: (error: Error | null) => void, retryKey = 0) {
  const { invalidate, gl } = useThree()
  const [texture, setTexture] = useState(() => coverTexture(url, albumCoverLoader.peek(url)))
  const current = useRef(texture)
  const callbacks = useRef({ onReady, onTone, onError })
  useEffect(() => { callbacks.current = { onReady, onTone, onError } }, [onReady, onTone, onError])
  useEffect(() => {
    const controller = new AbortController()
    callbacks.current.onError?.(null)
    const apply = (image: HTMLImageElement) => {
      if (controller.signal.aborted) return
      if (current.current.userData.coverUrl !== url || current.current.image !== image) {
        const next = coverTexture(url, image)
        gl.initTexture(next)
        current.current = next
        setTexture(next)
      }
      callbacks.current.onTone?.(sampleAlbumTone(image))
      invalidate()
      callbacks.current.onReady()
    }
    const prepared = albumCoverLoader.peek(url)
    if (prepared) apply(prepared)
    else void albumCoverLoader.load(url, controller.signal).then(apply).catch(error => {
      if (controller.signal.aborted) return
      // A failed image must not unmount the renderer, camera or previous cover.
      callbacks.current.onError?.(error instanceof Error ? error : new Error('专辑封面未能加载，请重新选择图片。'))
      invalidate()
      callbacks.current.onReady()
    })
    return () => controller.abort()
  }, [url, gl, invalidate, retryKey])
  // The decoded image may be shared, but this scene owns and disposes each GPU texture.
  useEffect(() => () => texture.dispose(), [texture])
  return texture
}
