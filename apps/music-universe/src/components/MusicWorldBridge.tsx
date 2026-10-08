import { useCallback, useEffect, useState } from 'react'
import { ArrowUpRight, Boxes, Check, Disc3, Loader2, RefreshCw } from 'lucide-react'
import { albumFromLibrary, createWorld, loadDemoLibrary, readLibrary } from '../lib/musicWorldClient'
import type { MusicWorldLibrary } from '../lib/musicWorldClient'
import type { Album } from '../lib/generateAlbumGalaxy'
import { musicWorldHref } from '../lib/musicWorld'

type Status = { state: 'idle' | 'busy' | 'ready' | 'error'; message: string }

/** Reads Music World's library and writes back a music world, without leaving this room. */
export default function MusicWorldBridge({ onAdoptAlbum }: { onAdoptAlbum: (album: Album) => void }) {
  const [library, setLibrary] = useState<MusicWorldLibrary | null>(null)
  const [status, setStatus] = useState<Status>({ state: 'idle', message: '正在连接 Music World…' })

  const run = useCallback(async (label: string, action: () => Promise<string>) => {
    setStatus({ state: 'busy', message: `${label}…` })
    try { setStatus({ state: 'ready', message: await action() }) }
    catch (error) { setStatus({ state: 'error', message: error instanceof Error ? error.message : `${label}失败。` }) }
  }, [])

  const refresh = useCallback(() => run('读取 Music World 曲库', async () => {
    const next = await readLibrary('library')
    setLibrary(next)
    return next.counts.tracks
      ? `已连接：${next.counts.tracks} 首歌曲 · ${next.worlds.length} 个音乐世界。`
      : '已连接，但当前会话曲库为空。可先载入 Demo 曲库。'
  }), [run])

  useEffect(() => { void refresh() }, [refresh])

  const loadDemo = () => run('载入 Demo 曲库', async () => {
    await loadDemoLibrary()
    const next = await readLibrary('demo')
    setLibrary(next)
    return `Demo 曲库已载入：${next.counts.tracks} 首歌曲 · ${next.counts.artists} 位艺术家。`
  })

  const adopt = () => {
    const adopted = library ? albumFromLibrary(library) : null
    if (!adopted) { setStatus({ state: 'error', message: '曲库为空，先载入 Demo 曲库再采用。' }); return }
    onAdoptAlbum(adopted)
    setStatus({ state: 'ready', message: `已采用 ${adopted.tracks.length} 首歌曲作为当前专辑，星系已按新 Seed 点亮。` })
  }

  const buildWorld = () => run('生成音乐世界', async () => {
    const { world } = await createWorld(`Music Universe ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`)
    const next = await readLibrary(library?.scope === 'demo' ? 'demo' : 'library')
    setLibrary(next)
    return `已在 Music World 创建音乐世界「${world?.name ?? '未命名'}」，共 ${next.worlds.length} 个。`
  })

  return <section className="music-world-bridge" aria-label="与 Music World 对接" data-testid="music-world-bridge">
    <div className="bridge-heading">
      <span className="bridge-symbol" aria-hidden="true">{status.state === 'busy' ? <Loader2 size={15} className="bridge-spin" /> : <Boxes size={15} />}</span>
      <div><strong>MUSIC WORLD / 3002</strong><small>曲库与音乐世界连通</small></div>
    </div>
    <p className={`bridge-status is-${status.state}`} role="status" data-testid="bridge-status">{status.message}</p>
    {library && <p className="bridge-counts" data-testid="bridge-counts">
      <span><b>{library.counts.tracks}</b> 歌曲</span>
      <span><b>{library.counts.artists}</b> 艺术家</span>
      <span><b>{library.worlds.length}</b> 音乐世界</span>
      <span><b>{library.scope || 'library'}</b> 作用域</span>
    </p>}
    <div className="bridge-actions">
      <button type="button" onClick={() => void refresh()} data-testid="bridge-refresh"><RefreshCw size={12} /> 读取曲库</button>
      <button type="button" onClick={() => void loadDemo()} data-testid="bridge-demo"><Disc3 size={12} /> 载入 Demo 曲库</button>
      <button type="button" onClick={adopt} data-testid="bridge-adopt"><Check size={12} /> 采用为当前专辑</button>
      <button type="button" onClick={() => void buildWorld()} data-testid="bridge-world"><Boxes size={12} /> 生成音乐世界</button>
      <a href={musicWorldHref('world')} data-testid="bridge-open">打开 3002 音乐电台 <ArrowUpRight size={12} /></a>
    </div>
  </section>
}
