import { readFileSync, writeFileSync } from 'node:fs'
const file='C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe/src/components/PlayerBar.tsx'
const original=readFileSync(file,'utf8')
let source=original.replace(/\r\n/g,'\n')
const change=(before,after)=>{if(!source.includes(before))throw new Error('Arc player changed: '+before.slice(0,60));source=source.replace(before,after)}
if(source.includes('player-orbit')) {
  change('Heart, Pause, Play, Repeat, Shuffle, SkipBack, SkipForward','Heart, Loader2, Pause, Play, Repeat, Shuffle, SkipBack, SkipForward, Volume2, VolumeX')
  change("import { useVirtualPlayback } from '../hooks/useVirtualPlayback'", "import '../audio-output.css'")
  change('  const virtual = useVirtualPlayback({ index, duration, playing: playing && !isLive })\n','')
  change('title, album, index, duration, playing, onToggle, onSkip, live',"title, album, duration, onToggle, onSkip, live, loading = false, message = '', error = false, volume = 0.8, muted = false, onVolumeChange, onMute, onOpenMusic")
  change('  live?: LivePlayback\n',"  live?: LivePlayback\n  loading?: boolean; message?: string; error?: boolean; volume?: number; muted?: boolean\n  onVolumeChange?: (value: number) => void; onMute?: () => void; onOpenMusic?: () => void\n")
  change('const currentTime = isLive ? live!.currentTime : virtual.currentTime','const currentTime = isLive ? live!.currentTime : 0')
  change('const isPlaying = isLive ? live!.playing : playing','const isPlaying = isLive && live!.playing')
  change('const seek = (time: number) => { if (isLive) live!.seek(time); else virtual.seek(time) }',`const seek = (time: number) => { if (isLive) live!.seek(time) }\n  const silent = muted || volume === 0\n  const status = message || (loading ? '正在加载音源…' : isLive ? (isPlaying ? '正在播放' : '已暂停') + (liveTrack?.trial ? ' · 试听片段' : '') : '点击播放加载这首歌')`)
  change('<span className="visually-hidden" data-testid="player-title">{shownTitle} · {shownAlbum}</span>',`<span className="visually-hidden" data-testid="player-title">{shownTitle} · {shownAlbum}</span>\n    <p className={\`player-audio-status\${error ? ' is-error' : ''}\`} data-testid="player-status" role="status" title={status}>{status}</p>\n    <div className="player-audio-volume"><button className="player-icon" aria-label={silent ? '开启声音' : '静音'} aria-pressed={silent} onClick={onMute}>{silent ? <VolumeX size={16} /> : <Volume2 size={16} />}</button><input type="range" min="0" max="1" step="0.01" value={silent ? 0 : volume} aria-label="音量" onChange={event => onVolumeChange?.(Number(event.target.value))} /></div>\n    {error && <button className="player-source-action" onClick={onOpenMusic}>选择音乐平台</button>}`)
  change('onChange={(event) => seek(Number(event.target.value))} aria-label="播放进度"', 'disabled={!isLive || !live?.duration} onChange={(event) => seek(Number(event.target.value))} aria-label="播放进度"')
  change('aria-label={isPlaying ? \'暂停\' : \'播放\'} aria-pressed={isPlaying}', 'aria-label={loading ? \'正在加载\' : isPlaying ? \'暂停\' : \'播放\'} aria-busy={loading} aria-pressed={isPlaying}')
  change('{isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}', '{loading ? <Loader2 size={20} className="bridge-spin" /> : isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}')
  source=source.replace(' * 房间不含音频资源，因此未引入真实音频时进度来自虚拟时钟；一旦音乐搜索引入\n * 真实音轨，同一条轨道改为跟随 audio 元素。',' * 轨道跟随同一个真实 audio 元素；音源未加载时播放头停留在起点。')
  if(readFileSync(file,'utf8')!==original) throw new Error('Player was edited while patching.')
  writeFileSync(file,original.includes('\r\n')?source.replace(/\n/g,'\r\n'):source)
}
