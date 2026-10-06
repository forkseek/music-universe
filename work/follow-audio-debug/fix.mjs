import fs from 'node:fs'
import path from 'node:path'
const root = process.argv[2], changes = new Map()
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replaceAll('\r\n', '\n')
function replace(code, before, after, label) {
  if (!code.includes(before)) throw new Error('Source changed: ' + label)
  return code.replace(before, after)
}

let code = read('src/components/GalaxyScene.tsx')
code = replace(code, 'Mesh, Vector3 }', 'Mesh, PerspectiveCamera, Vector3 }', 'persistent camera import')
code = replace(code, 'function RenderQualityController({ quality, playing }: { quality: RenderQuality; playing: boolean }) {\n  const { gl, setDpr, invalidate, size } = useThree()', 'function RenderQualityController({ quality, playing, onDprChange }: { quality: RenderQuality; playing: boolean; onDprChange: (dpr: number) => void }) {\n  const { gl, invalidate, size } = useThree()', 'single DPR owner')
code = replace(code, '    setDpr(dpr)', '    // Canvas owns the requested ratio too, so later React commits cannot restore its default.\n    onDprChange(dpr)', 'controlled DPR update')
code = replace(code, '  }, [ceiling, gl, setDpr, invalidate])', '  }, [ceiling, gl, onDprChange, invalidate])', 'quality deps')
code = replace(code, 'export default function GalaxyScene(props: SceneProps) {', `export default function GalaxyScene(props: SceneProps) {
  // A camera is a live scene object, not a fresh configuration object on each audio tick.
  const [camera] = useState(() => new PerspectiveCamera(36, 1, 0.1, 400))
  const [renderDpr, setRenderDpr] = useState(() => Math.min(window.devicePixelRatio || 1, 1.31))`, 'stable camera lifetime')
code = replace(code, 'camera={{ position: [0, -0.65, 34], fov: 36, near: 0.1, far: Math.max(400, Math.hypot(props.galaxy.bounds.width, props.galaxy.bounds.height, props.galaxy.bounds.depth) * 24) }}', 'camera={camera}', 'remove camera config recreation')
code = replace(code, '      dpr={[1, 1.5]}', '      dpr={renderDpr}', 'controlled Canvas DPR')
code = replace(code, '<RenderQualityController quality={props.quality} playing={moving} />', '<RenderQualityController quality={props.quality} playing={moving} onDprChange={setRenderDpr} />', 'pass quality owner')
changes.set('src/components/GalaxyScene.tsx', code)

code = read('src/hooks/useAudioPlayback.ts')
code = replace(code, "import { readLocalAudioMetadata } from '../lib/audioMetadata'", "import { readLocalAudioMetadata } from '../lib/audioMetadata'\nimport { playbackFailure } from '../lib/playbackFailure'", 'native audio failure helper')
const errorStart = code.indexOf('// MediaError codes:')
const errorEnd = code.indexOf('\nexport function useAudioPlayback()', errorStart)
if (errorStart < 0 || errorEnd < 0) throw new Error('Audio error constants missing')
// A short, silent PCM WAV primes this same media element within the user's gesture.
const fmt = Buffer.alloc(16); fmt.writeUInt16LE(1, 0); fmt.writeUInt16LE(1, 2); fmt.writeUInt32LE(8000, 4); fmt.writeUInt32LE(8000, 8); fmt.writeUInt16LE(1, 12); fmt.writeUInt16LE(8, 14)
const wave = Buffer.alloc(444); wave.write('RIFF'); wave.writeUInt32LE(436, 4); wave.write('WAVEfmt ', 8); wave.writeUInt32LE(16, 16); fmt.copy(wave, 20); wave.write('data', 36); wave.writeUInt32LE(400, 40); wave.fill(128, 44)
code = code.slice(0, errorStart) + `const GESTURE_SILENCE = 'data:audio/wav;base64,${wave.toString('base64')}'\n` + code.slice(errorEnd)
code = replace(code, '  const loadGeneration = useRef(0)', '  const loadGeneration = useRef(0)\n  const priming = useRef(false)\n  const [blocked, setBlocked] = useState(false)', 'audio permission state')
code = replace(code, '    const onTime = () => setCurrentTime(element.currentTime)', '    const onTime = () => { if (!priming.current) setCurrentTime(element.currentTime) }', 'ignore silent priming progress')
code = replace(code, "    const onMeta = () => { setDuration(Number.isFinite(element.duration) ? element.duration : 0); setStatus(current => current === 'error' ? current : element.paused ? 'ready' : 'playing') }", `    const onMeta = () => {
      if (priming.current) return
      setDuration(Number.isFinite(element.duration) ? element.duration : 0)
      // Metadata alone does not mean playback succeeded; only the playing event does.
      setStatus(current => current === 'idle' || current === 'paused' ? 'ready' : current)
    }`, 'real playback state')
code = replace(code, "    const onWaiting = () => setStatus((current) => (current === 'error' ? current : 'loading'))", "    const onWaiting = () => { if (!priming.current) setStatus(current => current === 'error' ? current : 'loading') }", 'ignore priming waiting')
code = replace(code, "    const onPlaying = () => {\n      setStatus('playing')", "    const onPlaying = () => {\n      if (priming.current) return\n      setBlocked(false)\n      setStatus('playing')", 'only real playing events')
code = replace(code, "    const onPause = () => setStatus(current => current === 'error' || current === 'idle' ? current : 'paused')\n    const onEnded = () => setStatus('paused')", "    const onPause = () => { if (!priming.current && element.paused) setStatus(current => current === 'error' || current === 'idle' ? current : 'paused') }\n    const onEnded = () => { if (!priming.current) setStatus('paused') }", 'ignore priming end')
code = replace(code, "    const onError = () => {\n      setStatus('error')\n      setMessage(ERROR_MESSAGES[element.error?.code ?? 0] ?? '音频加载失败，请检查地址后重试。')\n    }", "    const onError = () => {\n      if (priming.current) return\n      const failure = playbackFailure(new DOMException('Audio source failed', 'NotSupportedError'), element.error?.code)\n      setStatus(failure.status); setBlocked(failure.blocked); setMessage(failure.message)\n    }", 'retain native media failure')
code = replace(code, '  /** Point the element at a source and (by default) start playing it. */', `  /** Prepare this media element synchronously, before metadata/API awaits lose activation. */
  const primePlayback = useCallback(() => {
    const element = audioRef.current
    if (!element || trackRef.current || (element.src && !priming.current)) return
    priming.current = true
    element.src = GESTURE_SILENCE
    void element.play().catch(() => { /* The real source reports permission failures separately. */ })
  }, [])

  /** Point the element at a source and (by default) start playing it. */`, 'gesture priming method')
code = replace(code, '    const generation = ++loadGeneration.current\n    releaseObjectUrl()', '    const generation = ++loadGeneration.current\n    priming.current = false\n    setBlocked(false)\n    releaseObjectUrl()', 'real load clears priming')
code = replace(code, "      setStatus('paused')\n      setMessage(error instanceof DOMException && error.name === 'NotAllowedError'\n        ? '音源已准备好，请再点击一次播放。'\n        : '音频暂时无法播放，请点击播放重试。')", "      const failure = playbackFailure(error, element.error?.code)\n      setStatus(failure.status); setBlocked(failure.blocked); setMessage(failure.message)", 'load rejection preserves error')
const playStart = code.indexOf('  const play = useCallback(')
const playEnd = code.indexOf('\n  const pause = useCallback', playStart)
if (playStart < 0 || playEnd < 0) throw new Error('Play method source missing')
code = code.slice(0, playStart) + `  const play = useCallback(async () => {
    const element = audioRef.current
    if (!element || !element.src || priming.current) return false
    setMessage(''); setBlocked(false)
    const generation = loadGeneration.current
    try {
      // Retry the already-resolved source immediately in the user's click handler.
      if (element.error) element.load()
      await element.play()
      return generation === loadGeneration.current
    } catch (error) {
      if (generation !== loadGeneration.current || (error instanceof DOMException && error.name === 'AbortError')) return false
      const failure = playbackFailure(error, element.error?.code)
      setStatus(failure.status); setBlocked(failure.blocked); setMessage(failure.message)
      return false
    }
  }, [])
` + code.slice(playEnd)
code = replace(code, '    loadGeneration.current++\n    const element', '    loadGeneration.current++\n    priming.current = false\n    setBlocked(false)\n    const element', 'stop clears priming')
code = replace(code, '    stop()\n    const generation = loadGeneration.current', '    stop()\n    primePlayback()\n    const generation = loadGeneration.current', 'local metadata keeps user activation')
code = replace(code, '  }, [load, stop])', '  }, [load, stop, primePlayback])', 'local priming deps')
code = replace(code, '    audioRef,\n    getTrack,', '    audioRef,\n    blocked,\n    primePlayback,\n    getTrack,', 'audio engine exports')
changes.set('src/hooks/useAudioPlayback.ts', code)
changes.set('src/lib/playbackFailure.ts', fs.readFileSync(path.join(import.meta.dirname, 'playbackFailure.ts'), 'utf8'))

code = read('src/hooks/useAlbumMusic.ts')
code = replace(code, '    audio.stop()\n    setLoadingId(id)', '    audio.stop()\n    audio.primePlayback()\n    setLoadingId(id)', 'planet platform priming')
changes.set('src/hooks/useAlbumMusic.ts', code)

code = read('src/components/MusicSearch.tsx')
code = replace(code, '  const playSong = async (song: PlatformSong) => {\n    playRequest.current?.abort()', `  const playSong = async (song: PlatformSong) => {
    if (audio.blocked && audio.getTrack()?.id === \x60\x24{song.provider}:\x24{song.id}\x60) { void audio.play(); return }
    audio.primePlayback()
    playRequest.current?.abort()`, 'direct retry without another API await')
code = replace(code, 'onClick={() => upload.current?.click()}', 'onClick={() => { audio.primePlayback(); upload.current?.click() }}', 'prime before native file picker')
changes.set('src/components/MusicSearch.tsx', code)

for (const [file, content] of changes) {
  const destination = path.join(root, file), backup = path.join(import.meta.dirname, 'before', file)
  fs.mkdirSync(path.dirname(backup), { recursive: true })
  if (fs.existsSync(destination)) fs.copyFileSync(destination, backup)
  fs.writeFileSync(destination, content)
  console.log('Updated ' + file)
}
