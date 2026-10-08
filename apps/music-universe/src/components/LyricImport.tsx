import { useRef } from 'react'
import { Upload } from 'lucide-react'
import type { TrackLyrics } from '../hooks/useTrackLyrics'

export function LyricImport({ lyrics }: { lyrics: TrackLyrics }) {
  const input = useRef<HTMLInputElement>(null)
  return <div className="lyric-import" data-no-drag>
    <button type="button" disabled={!lyrics.canImport} onClick={() => input.current?.click()} aria-label="为当前播放歌曲导入 LRC"><Upload size={12} />导入 LRC</button>
    <input ref={input} type="file" accept=".lrc,text/plain" aria-label="导入当前歌曲的 LRC 歌词" className="visually-hidden" disabled={!lyrics.canImport} onChange={event => {
      const file = event.target.files?.[0]
      if (file) void lyrics.importFile(file)
      event.target.value = ''
    }} />
    <span role={lyrics.importError ? 'alert' : 'status'}>{lyrics.importError || (lyrics.canImport ? lyrics.message || (lyrics.status === 'ready' ? '歌词已同步' : '') : '播放后可导入歌词')}</span>
  </div>
}
