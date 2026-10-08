import type { Album } from './generateAlbumGalaxy'
import { fetchTrackRatings } from './musicWorldClient'
import type { RatingQuery } from './musicWorldClient'

/** 单次请求的曲目上限，与 Music World /api/ratings 的限制保持一致。 */
const BATCH_SIZE = 50
/**
 * 上游是逐首串行解析的（见 Music World 的 ratings.ts 节流），冷缓存时每首约 0.6 秒：
 * 10 首的默认专辑首屏解析就要 6 秒以上，6 秒的超时会把「还没算完」误判成「没有评分」，
 * 于是整个会话都停在派生评分上。这里放宽到 30 秒，冷启动也能等到真实评分。
 */
const REQUEST_TIMEOUT_MS = 30000

/**
 * 为专辑补齐来自大众数据源的真实评分。
 *
 * 全部失败路径（网络、上游、未匹配）都返回传入的专辑本身，调用方据此判断「无变化」：
 * 既不覆盖已有评分，也不会让页面报错——缺失的评分仍由 planetMetrics 按 seed 派生。
 */
export async function enrichAlbumRatings(album: Album, signal?: AbortSignal): Promise<Album> {
  if (!album.tracks.length) return album
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
  try {
    const ratings: Record<string, number> = {}
    for (let start = 0; start < album.tracks.length; start += BATCH_SIZE) {
      const queries: RatingQuery[] = album.tracks.slice(start, start + BATCH_SIZE).map((track) => ({
        key: track.id,
        title: track.title,
        artist: track.artist ?? album.artist,
        durationMs: track.duration ? track.duration * 1000 : undefined,
      }))
      const response = await fetchTrackRatings(queries, combined)
      Object.assign(ratings, response.ratings ?? {})
    }
    const changed = album.tracks.some((track) => typeof ratings[track.id] === 'number' && ratings[track.id] !== track.rating)
    if (!changed) return album
    return {
      ...album,
      tracks: album.tracks.map((track) => {
        const rating = ratings[track.id]
        if (typeof rating !== 'number' || rating === track.rating) return track
        return { ...track, rating, ratingSource: 'netease' as const }
      }),
    }
  } catch {
    return album
  } finally {
    clearTimeout(timeout)
  }
}
