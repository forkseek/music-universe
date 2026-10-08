import { hashSeed } from './generateAlbumGalaxy'
import type { Track } from './generateAlbumGalaxy'
import { formatDuration } from '../data/albums'

export function tracksToText(tracks: readonly Track[]) {
  return tracks.map((track) => `${track.title}${track.duration === undefined ? '' : ` | ${formatDuration(track.duration)}`}`).join('\n')
}

export function parseTracks(text: string): Track[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length < 1 || lines.length > 40) throw new Error('请填写 1–40 首曲目，每行一首。')
  return lines.map((line, index) => {
    const split = line.lastIndexOf('|')
    const title = (split >= 0 ? line.slice(0, split) : line).trim()
    if (!title) throw new Error(`第 ${index + 1} 首曲目的标题不能为空。`)
    let duration: number | undefined
    if (split >= 0) {
      const value = line.slice(split + 1).trim()
      if (!/^\d{1,3}:[0-5]\d$/.test(value)) throw new Error(`第 ${index + 1} 首的时长请使用 分:秒，例如 3:02。`)
      const [minutes, seconds] = value.split(':').map(Number)
      duration = minutes * 60 + seconds
    }
    return { id: `track-${index}-${hashSeed(title)}`, title, ...(duration !== undefined ? { duration } : {}) }
  })
}

export async function prepareCover(source: string): Promise<string> {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  const loaded = new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => { image.src = ''; reject(new Error('封面加载超时，请检查图片 URL，或上传本地图片。')) }, 15000)
    image.onload = () => { window.clearTimeout(timeout); resolve() }
    image.onerror = () => { window.clearTimeout(timeout); reject(new Error('封面未能加载。请检查图片 URL，或上传本地图片。')) }
  })
  image.src = source
  await loaded
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 768
  const context = canvas.getContext('2d')!
  context.fillStyle = '#111827'
  context.fillRect(0, 0, 768, 768)
  // Contain preserves all of the artwork for non-square uploads.
  const ratio = Math.min(768 / image.naturalWidth, 768 / image.naturalHeight)
  const width = image.naturalWidth * ratio, height = image.naturalHeight * ratio
  context.drawImage(image, (768 - width) / 2, (768 - height) / 2, width, height)
  try { return canvas.toDataURL('image/jpeg', 0.9) }
  catch { throw new Error('这个图片地址不允许跨域读取，请上传本地图片。') }
}

export async function readCoverFile(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type)) throw new Error('请选择 JPG、PNG、WebP 或 AVIF 图片。')
  if (file.size > 15 * 1024 * 1024) throw new Error('图片请小于 15 MB。')
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('无法读取这张图片，请重新选择。'))
    reader.readAsDataURL(file)
  })
  return prepareCover(source)
}
