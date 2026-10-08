import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Check, ImagePlus, Link, RotateCcw, Upload, X } from 'lucide-react'
import type { Album } from '../lib/generateAlbumGalaxy'
import { DEFAULT_ALBUM } from '../data/albums'
import { parseTracks, prepareCover, readCoverFile, tracksToText } from '../lib/albumEditor'

export default function AlbumEditor({ album, onSave, onClose }: { album: Album; onSave: (album: Album) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const upload = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(album.name)
  const [artist, setArtist] = useState(album.artist)
  const [cover, setCover] = useState(album.cover)
  const [url, setUrl] = useState('')
  const [trackText, setTrackText] = useState(tracksToText(album.tracks))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [coverApplied, setCoverApplied] = useState(false)
  const trackCount = trackText.split('\n').filter((line) => line.trim()).length
  useEffect(() => { dialog.current?.showModal() }, [])
  const updateCover = async (getCover: () => Promise<string>) => {
    setBusy(true); setError(''); setCoverApplied(false)
    try { setCover(await getCover()); setCoverApplied(true) }
    catch (err) { setError(err instanceof Error ? err.message : '封面加载失败。') }
    finally { setBusy(false) }
  }
  const loadUrl = () => {
    try {
      const parsed = new URL(url)
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error()
    } catch { setError('请输入完整的 http 或 https 图片 URL。'); return }
    void updateCover(() => prepareCover(url))
  }
  return <dialog ref={dialog} className="editor-dialog" onCancel={onClose} onClick={(event) => { if (event.target === dialog.current) onClose() }}>
    <form className="editor-panel" onSubmit={(event) => {
      event.preventDefault(); setError('')
      try {
        if (!name.trim() || !artist.trim()) throw new Error('请填写专辑名和歌手名。')
        const tracks = parseTracks(trackText)
        onSave({ ...album, id: 'custom-album', name: name.trim(), artist: artist.trim(), cover, tracks })
        onClose()
      } catch (err) { setError(err instanceof Error ? err.message : '请检查填写的信息。') }
    }}>
      <div className="editor-head"><div><span className="eyebrow">ALBUM STUDIO</span><h2>构建你的星系</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="关闭专辑编辑"><X size={20} /></button></div>
      <p className="editor-intro">封面成为恒星，每首歌都有自己的星球。</p>
      <div className="cover-editor"><img src={cover} alt="专辑封面预览" /><div><span className="field-title">恒星的核心</span><p>上传你喜欢的专辑封面</p><button type="button" className="secondary-button" disabled={busy} onClick={() => upload.current?.click()}><Upload size={15} /> 上传封面</button><span className="field-help">JPG / PNG / WebP / AVIF · 最大 15 MB</span></div></div>
      <input ref={upload} type="file" accept="image/jpeg,image/png,image/webp,image/avif" aria-label="上传专辑封面" className="visually-hidden" onChange={(event) => {
        const file = event.target.files?.[0]
        if (file) void updateCover(() => readCoverFile(file))
        event.target.value = ''
      }} />
      <label className="field-title" htmlFor="cover-url"><Link size={13} /> 或使用图片 URL</label>
      <div className="url-field"><input id="cover-url" value={url} onChange={(event) => { setUrl(event.target.value); setCoverApplied(false) }} placeholder="https://…/album-cover.jpg" /><button type="button" disabled={busy || !url.trim()} aria-label="载入封面 URL" onClick={loadUrl}>{coverApplied ? <Check size={17} /> : <ArrowUpRight size={17} />}</button></div>
      {busy && <span className="field-help" role="status">正在读取封面…</span>}
      {coverApplied && <span className="cover-success" role="status"><Check size={12} /> 封面已载入预览，保存后应用到恒星</span>}
      <div className="editor-fields"><label><span className="field-title">专辑名称</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required /></label><label><span className="field-title">歌手 / 艺术家</span><input value={artist} onChange={(event) => setArtist(event.target.value)} maxLength={100} required /></label></div>
      <label className="tracks-field"><span className="field-title">曲目列表 <span className={trackCount > 40 ? 'count-error' : 'track-count'}>{trackCount} / 40</span></span><textarea value={trackText} onChange={(event) => setTrackText(event.target.value)} aria-label="曲目列表" spellCheck={false} rows={12} /><span className="field-help">每行一首，按行序排列。可选时长：歌曲名 | 3:02</span></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="editor-actions"><button type="button" className="text-button" disabled={busy} onClick={() => { setName(DEFAULT_ALBUM.name); setArtist(DEFAULT_ALBUM.artist); setCover(DEFAULT_ALBUM.cover); setTrackText(tracksToText(DEFAULT_ALBUM.tracks)); setUrl(''); setError(''); setCoverApplied(false) }}><RotateCcw size={14} /> 恢复示例</button><button type="submit" className="primary-button" disabled={busy}><ImagePlus size={16} /> 保存并生成</button></div>
    </form>
  </dialog>
}
