import { useEffect, useMemo, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { SRGBColorSpace, Texture } from 'three'

/** One scene owns one cover. No global loader cache retains uploaded data URLs. */
export function useAlbumTexture(url: string, onReady: () => void) {
  const { invalidate } = useThree()
  const [failed, setFailed] = useState(false)
  const texture = useMemo(() => {
    const value = new Texture()
    value.colorSpace = SRGBColorSpace
    return value
  }, [url])
  useEffect(() => {
    let active = true
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      if (!active) return
      texture.image = image
      texture.needsUpdate = true
      invalidate()
      onReady()
    }
    image.onerror = () => { if (active) setFailed(true) }
    image.src = url
    return () => {
      active = false
      image.onload = image.onerror = null
      image.src = ''
      texture.dispose()
      texture.image = null
    }
  }, [url, texture, invalidate, onReady])
  if (failed) throw new Error('专辑封面未能加载，请重新选择图片。')
  return texture
}
