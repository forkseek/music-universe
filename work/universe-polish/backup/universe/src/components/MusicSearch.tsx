import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { ArrowUpRight, Check, ChevronDown, Disc3, Link, Loader2, LogOut, Music2, Pause, Play, RefreshCw, Search, Upload, UserRound, X } from 'lucide-react'
import { formatDuration } from '../data/albums'
import { musicWorldMedia } from '../lib/musicWorldClient'
import { cancelMusicLogin, connectMusic, disconnectMusic, musicPlatforms, pollMusicLogin, readConnection, resolveMusic, searchMusic } from '../lib/musicPlatforms'
import type { Connection, Login, MusicPlatform, PlatformSong } from '../lib/musicPlatforms'
import type { AudioPlayback } from '../hooks/useAudioPlayback'
import '../music-platforms.css'

const waiting = (login: Login | null) => !!login && ['pending', 'scanned', 'authorizing'].includes(login.status)
const messageOf = (error: unknown) => error instanceof Error ? error.message : '暂时无法连接音乐平台，请重试。'

export default function MusicSearch({ audio, onClose }: { audio: AudioPlayback; onClose: () => void }) {
  const upload = useRef<HTMLInputElement>(null)
  const [provider, setProvider] = useState<MusicPlatform>(() => { try { const p = localStorage.getItem('music-universe:platform'); if (p && Object.hasOwn(musicPlatforms, p)) return p as MusicPlatform } catch { /* Storage is optional. */ } return 'qq' })
  const [keywords, setKeywords] = useState('')
  const [songs, setSongs] = useState<PlatformSong[]>([])
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [connection, setConnection] = useState<Connection | null>(null)
  const [accountError, setAccountError] = useState('')
  const [login, setLogin] = useState<Login | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [busyMid, setBusyMid] = useState('')
  const [url, setUrl] = useState('')
  const [notice, setNotice] = useState('')
  const alive = useRef(true)
  const closeRef = useRef(onClose)
  const selected = useRef(provider)
  const loginRef = useRef<Login | null>(null)
  const searchRequest = useRef<AbortController | null>(null)
  const playRequest = useRef<AbortController | null>(null)
  const statusRequest = useRef<AbortController | null>(null)
  const loginGeneration = useRef(0)
  const label = musicPlatforms[provider]
  useEffect(() => { closeRef.current = onClose }, [onClose])

  const refreshStatus = useCallback(async () => {
    statusRequest.current?.abort()
    const request = new AbortController(); statusRequest.current = request
    setAccountError('')
    try { const state = await readConnection(provider, request.signal); if (!request.signal.aborted) setConnection(state) }
    catch (error) { if (!request.signal.aborted) setAccountError(messageOf(error)) }
  }, [provider])

  useEffect(() => { setConnection(null); void refreshStatus(); return () => statusRequest.current?.abort() }, [refreshStatus])
  useEffect(() => {
    alive.current = true
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); closeRef.current() } }
    window.addEventListener('keydown', keydown, true)
    return () => {
      alive.current = false; loginGeneration.current++
      searchRequest.current?.abort(); playRequest.current?.abort(); statusRequest.current?.abort()
      const active = loginRef.current
      if (active && waiting(active)) void cancelMusicLogin(active.provider, active.loginId).catch(() => {})
      window.removeEventListener('keydown', keydown, true)
    }
  }, [])

  const updateLogin = (value: Login | null) => { loginRef.current = value; setLogin(value) }
  const cancel = () => {
    loginGeneration.current++
    const active = loginRef.current
    updateLogin(null); setConnecting(false)
    if (active) void cancelMusicLogin(active.provider, active.loginId).catch(() => {})
  }
  const switchPlatform = (next: MusicPlatform) => {
    if (next === provider) return
    cancel(); searchRequest.current?.abort(); playRequest.current?.abort()
    selected.current = next; setProvider(next); setSongs([]); setQuery(''); setPage(1); setHasMore(false)
    setSearching(false); setBusyMid(''); setSearchError(''); setNotice(''); setAccountError('')
    try { localStorage.setItem('music-universe:platform', next) } catch { /* Selection persistence is optional. */ }
  }
  const startLogin = async () => {
    const generation = ++loginGeneration.current
    setConnecting(true); setAccountError(''); updateLogin(null)
    try {
      const result = await connectMusic(provider)
      if (!alive.current || selected.current !== provider || loginGeneration.current !== generation) { await cancelMusicLogin(provider, result.loginId); return }
      updateLogin(result)
    } catch (error) { if (alive.current && loginGeneration.current === generation) setAccountError(messageOf(error)) }
    finally { if (alive.current && loginGeneration.current === generation) setConnecting(false) }
  }

  const loginId = login?.loginId
  useEffect(() => {
    if (!loginId) return
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      try {
        const result = await pollMusicLogin(provider, loginId, controller.signal)
        if (controller.signal.aborted) return
        loginRef.current = result; setLogin(result); setAccountError('')
        if (result.status === 'success') { void refreshStatus(); return }
        if (!waiting(result)) return
      } catch (error) {
        if (controller.signal.aborted) return
        setAccountError(messageOf(error))
        if ((loginRef.current?.expiresAt ?? 0) <= Date.now()) return
      }
      timer = setTimeout(poll, 2500)
    }
    timer = setTimeout(poll, 800)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [loginId, provider, refreshStatus])

  const runSearch = async (targetPage = 1) => {
    const value = (targetPage === 1 ? keywords : query).trim()
    if (!value) { setSearchError('请输入歌曲名或歌手名。'); return }
    searchRequest.current?.abort()
    const controller = new AbortController(); searchRequest.current = controller
    setSearching(true); setSearchError(''); setNotice('')
    if (targetPage === 1) { setSongs([]); setHasMore(false) }
    try {
      const result = await searchMusic(provider, value, targetPage, controller.signal)
      if (controller.signal.aborted) return
      setSongs(current => {
        const combined = targetPage === 1 ? result.songs : [...current, ...result.songs]
        return [...new Map(combined.map(song => [song.id, song])).values()]
      })
      setQuery(result.query); setPage(result.page); setHasMore(result.hasMore)
      if (!result.songs.length && targetPage === 1) setSearchError(`没有找到与「${value}」匹配的歌曲。`)
    } catch (error) { if (!controller.signal.aborted) setSearchError(messageOf(error)) }
    finally { if (!controller.signal.aborted) setSearching(false) }
  }
  const playSong = async (song: PlatformSong) => {
    if (audio.blocked && audio.getTrack()?.id === `${song.provider}:${song.id}`) { void audio.play(); return }
    audio.primePlayback()
    playRequest.current?.abort()
    const controller = new AbortController(); playRequest.current = controller
    setBusyMid(song.id); setNotice('')
    try {
      const result = await resolveMusic(song, controller.signal)
      if (controller.signal.aborted) return
      if (!result.playable || !result.url) { setNotice(result.message || '这首歌暂时无法按当前账号权益播放。'); return }
      await audio.load(musicWorldMedia(result.url), { id: `${song.provider}:${song.id}`, title: song.name, artist: song.artist, album: song.album || '', cover: musicWorldMedia(song.cover), provider: song.provider, platformTrackId: song.id, albumId: song.albumId, durationMs: song.duration || undefined, trial: result.trial })
      if (!controller.signal.aborted) setNotice(`${song.name} · ${label}${result.trial ? ' · 试听片段' : ''}`)
    } catch (error) { if (!controller.signal.aborted) setNotice(messageOf(error)) }
    finally { if (!controller.signal.aborted) setBusyMid('') }
  }
  const logout = async () => {
    playRequest.current?.abort(); setBusyMid('')
    if (audio.track?.id.startsWith(provider + ':')) audio.pause()
    cancel(); setConnecting(true)
    try { await disconnectMusic(provider); updateLogin(null); await refreshStatus() }
    catch (error) { setAccountError(messageOf(error)) }
    finally { setConnecting(false) }
  }
  const playUrl = () => {
    playRequest.current?.abort(); setBusyMid('')
    try {
      const parsed = new URL(url.trim())
      if (!['http:', 'https:', 'blob:'].includes(parsed.protocol)) throw new Error('protocol')
      let name = parsed.pathname.split('/').filter(Boolean).pop() || '在线音频'
      try { name = decodeURIComponent(name) } catch { /* Use the path as displayed. */ }
      void audio.load(parsed.href, { id: `url-${parsed.href}`, title: name, artist: parsed.hostname, album: '在线音频', cover: '' })
    } catch { setNotice('请输入有效的 http / https 音频地址。') }
  }
  const live = audio.track
  const liveDuration = audio.duration
  const progress = liveDuration > 0 ? Math.min(100, audio.currentTime / liveDuration * 100) : 0

  return <aside className="music-search-drawer" data-testid="music-search-drawer" aria-label="音乐搜索">
    <div className="music-search-shell">
      <div className="music-search-head">
        <div><span className="eyebrow">YOUR MUSIC · YOUR UNIVERSE</span><h2>让音乐进入宇宙</h2></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="关闭音乐搜索"><X size={19} /></button>
      </div>
      <p className="music-search-intro">连接你的音乐平台，搜索一首歌，让声音陪你遨游。</p>
      <div className="music-platform-tabs" role="group" aria-label="音乐平台">
        {(Object.keys(musicPlatforms) as MusicPlatform[]).map(p => <button key={p} type="button" aria-pressed={provider === p} data-platform={p} onClick={() => switchPlatform(p)}>{musicPlatforms[p]}</button>)}
      </div>
      <div className="music-platform-account" data-testid="music-platform-account">
        <span className="music-platform-avatar">{connection?.user?.avatar ? <img src={connection.user.avatar} alt="账号头像" referrerPolicy="no-referrer" /> : <UserRound size={18} />}</span>
        <div className="music-search-copy"><strong>{connection?.authorized ? connection.user?.nickname || label : label}</strong><span role="status" data-testid="music-search-status">{connection?.message || (accountError ? '暂时无法连接' : '正在连接…')}</span></div>
        <button type="button" className="icon-button" aria-label="刷新账号状态" onClick={() => void refreshStatus()}><RefreshCw size={14} /></button>
        {connection?.authorized
          ? <button type="button" className="music-search-button" onClick={() => void logout()} disabled={connecting}><LogOut size={13} /> 退出</button>
          : <button type="button" className="music-search-button" data-testid="music-platform-login" disabled={connecting || waiting(login) || connection?.loginAvailable === false || !connection} onClick={() => void startLogin()}>{connecting ? <Loader2 size={13} className="bridge-spin" /> : <UserRound size={13} />} 连接账号</button>}
      </div>
      {login && <div className="music-platform-login" data-testid="music-platform-login-state">
        {login.image && waiting(login) && <img className="music-platform-qr" src={login.image} alt={`${label}登录二维码`} />}
        <p role="status">{waiting(login) ? <Loader2 size={14} className="bridge-spin" /> : login.status === 'success' ? <Check size={14} /> : null}{login.message}</p>
        {waiting(login) ? <button className="music-search-button" onClick={cancel}>取消登录</button> : login.status !== 'success' && <button className="music-search-button" onClick={() => void startLogin()} disabled={connecting}>重新连接</button>}
      </div>}
      {accountError && <p className="music-search-error" role="alert">{accountError}</p>}

      <form className="music-search-form" onSubmit={event => { event.preventDefault(); void runSearch() }}>
        <label htmlFor="music-search-input">搜索 {label}</label>
        <div className="music-search-field"><Search size={15} />
          <input id="music-search-input" data-testid="music-search-input" value={keywords} maxLength={80} placeholder="歌曲名、歌手…" autoFocus onChange={event => setKeywords(event.target.value)} />
          <button type="submit" className="primary-button" data-testid="music-search-submit" disabled={searching}>{searching ? <Loader2 size={15} className="bridge-spin" /> : <Search size={15} />} 搜索</button>
        </div>
      </form>
      {searchError && <p className="music-search-error" role="alert" data-testid="music-search-error">{searchError}</p>}
      {!!songs.length && <div className="music-search-meta"><span>{label} ·「{query}」· {songs.length} 首{hasMore ? '+' : ''}</span></div>}
      {!!songs.length && <ul className="music-search-results" data-testid="music-search-results">
        {songs.map(song => <li key={song.id} className="music-search-item" data-testid="music-search-result">
          <span className="music-search-cover" aria-hidden="true">{song.cover ? <img src={musicWorldMedia(song.cover)} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <Music2 size={15} />}</span>
          <div className="music-search-copy"><strong>{song.name}</strong><span>{song.artist}{song.album ? ` · ${song.album}` : ''}</span><small>{song.duration ? formatDuration(Math.round(song.duration / 1000)) : '—'}{song.fee ? ' · 依账号权益播放' : ''}</small></div>
          <button type="button" className="music-search-play" data-testid="music-search-play" disabled={busyMid === song.id} onClick={() => void playSong(song)}>{busyMid === song.id ? <Loader2 size={13} className="bridge-spin" /> : <Play size={13} />} 播放</button>
        </li>)}
      </ul>}
      {hasMore && <button type="button" className="music-search-button music-search-more" disabled={searching} onClick={() => void runSearch(page + 1)}><ChevronDown size={14} /> 加载更多结果</button>}
      {notice && <p className="music-search-notice" role="status" data-testid="music-search-notice">{notice}</p>}
      {audio.message && <p className="music-search-notice is-error" role="alert" data-testid="music-search-audio-error">{audio.message}</p>}

      <details className="music-platform-local"><summary>本地文件与音频地址</summary>
        <div className="music-search-import"><div><span className="music-search-label"><Upload size={13} /> 引入本地音频</span><p>选择设备上的 MP3、WAV、M4A 或 OGG 文件。</p><button type="button" className="music-search-button" onClick={() => { audio.primePlayback(); upload.current?.click() }}><Upload size={14} /> 选择音频文件</button><input ref={upload} type="file" accept="audio/*" className="visually-hidden" data-testid="music-search-file" aria-label="选择本地音频文件" onChange={event => { const file = event.target.files?.[0]; if (file) { playRequest.current?.abort(); setBusyMid(''); void audio.loadFile(file) } event.target.value = '' }} /></div>
        <div><span className="music-search-label"><Link size={13} /> 引入音频地址</span><div className="music-search-url"><input value={url} onChange={event => setUrl(event.target.value)} placeholder="https://…/song.mp3" aria-label="音频地址" /><button type="button" className="music-search-url-go" aria-label="引入音频地址" onClick={playUrl}><ArrowUpRight size={16} /></button></div></div></div>
      </details>
      <div className="music-search-now" data-testid="music-search-now">
        <span className="music-search-cover" aria-hidden="true">{live?.cover ? <img src={live.cover} alt="" /> : <Disc3 size={15} />}</span>
        <div className="music-search-copy"><strong data-testid="music-search-now-title">{live?.title ?? '等待一首歌'}</strong><span>{live ? `${live.artist} · ${live.album}` : '搜索音乐，让宇宙拥有声音。'}</span></div>
        <div className="music-search-transport"><button type="button" className="player-toggle" data-testid="music-search-now-toggle" aria-label={audio.playing ? '暂停' : '播放'} aria-pressed={audio.playing} disabled={!live} onClick={() => audio.toggle()}>{audio.playing ? <Pause size={15} /> : <Play size={15} />}</button></div>
        <div className="music-search-scrub"><time>{formatDuration(Math.floor(audio.currentTime))}</time><input type="range" min="0" max={liveDuration || 1} step="0.1" value={Math.min(audio.currentTime, liveDuration || 1)} disabled={!live} aria-label="音频进度" onChange={event => audio.seek(Number(event.target.value))} style={{ '--progress': `${progress}%` } as CSSProperties} /><time>{liveDuration > 0 ? formatDuration(Math.floor(liveDuration)) : '—'}</time></div>
      </div>
    </div>
  </aside>
}
