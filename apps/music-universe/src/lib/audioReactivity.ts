/** Small, bounded FFT envelopes. Values are visual energy, not loudness measurements. */
export interface AudioBands {
  low: number
  high: number
  available: boolean
}

export interface FrequencyBands {
  low: number
  high: number
}

export interface AudioReactivityConfig {
  fftSize: number
  lowHz: readonly [number, number]
  highHz: readonly [number, number]
  lowNoiseFloor: number
  highNoiseFloor: number
  attackSeconds: number
  releaseSeconds: number
  settleEpsilon: number
}

export const AUDIO_REACTIVITY_DEFAULTS: Readonly<AudioReactivityConfig> = Object.freeze({
  fftSize: 1024,
  lowHz: [20, 220] as const,
  highHz: [4000, 12000] as const,
  lowNoiseFloor: 0.12,
  // The wide treble band dilutes a narrow cymbal/harmonic peak across many bins.
  highNoiseFloor: 0.06,
  attackSeconds: 0.08,
  releaseSeconds: 1.2,
  settleEpsilon: 0.001,
})

/** Suggested tuning limits. FFT sizes are restricted to powers of two. */
export const AUDIO_REACTIVITY_RANGES = Object.freeze({
  strength: [0, 1] as const,
  fftSize: [512, 4096] as const,
  lowHz: [20, 500] as const,
  highHz: [1500, 16000] as const,
  noiseFloor: [0, 0.5] as const,
  attackSeconds: [0.03, 0.3] as const,
  releaseSeconds: [0.4, 3] as const,
})

const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export function resolveAudioReactivityConfig(input: Partial<AudioReactivityConfig> = {}): AudioReactivityConfig {
  const defaults = AUDIO_REACTIVITY_DEFAULTS
  const band = (value: readonly [number, number] | undefined, fallback: readonly [number, number], min: number, max: number): readonly [number, number] => {
    const lower = clamp(finite(value?.[0] ?? fallback[0], fallback[0]), min, max - 1)
    return [lower, clamp(finite(value?.[1] ?? fallback[1], fallback[1]), lower + 1, max)]
  }
  return {
    fftSize: 2 ** Math.round(Math.log2(clamp(finite(input.fftSize ?? defaults.fftSize, defaults.fftSize), 512, 4096))),
    lowHz: band(input.lowHz, defaults.lowHz, 20, 500),
    highHz: band(input.highHz, defaults.highHz, 1500, 16000),
    lowNoiseFloor: clamp(finite(input.lowNoiseFloor ?? defaults.lowNoiseFloor, defaults.lowNoiseFloor), 0, 0.5),
    highNoiseFloor: clamp(finite(input.highNoiseFloor ?? defaults.highNoiseFloor, defaults.highNoiseFloor), 0, 0.5),
    attackSeconds: clamp(finite(input.attackSeconds ?? defaults.attackSeconds, defaults.attackSeconds), 0.03, 0.3),
    releaseSeconds: clamp(finite(input.releaseSeconds ?? defaults.releaseSeconds, defaults.releaseSeconds), 0.4, 3),
    settleEpsilon: clamp(finite(input.settleEpsilon ?? defaults.settleEpsilon, defaults.settleEpsilon), 0.0001, 0.01),
  }
}

/** RMS of byte-frequency bins, ignoring DC and inaccessible/non-finite samples. */
export function frequencyBandEnergy(spectrum: ArrayLike<number>, sampleRate: number, fftSize: number, band: readonly [number, number]): number {
  if (!spectrum.length || !Number.isFinite(sampleRate) || sampleRate <= 0 || !Number.isFinite(fftSize) || fftSize <= 0) return 0
  const hzPerBin = sampleRate / fftSize
  const first = Math.max(1, Math.ceil(band[0] / hzPerBin))
  const last = Math.min(spectrum.length - 1, Math.floor(band[1] / hzPerBin))
  if (!Number.isFinite(first) || !Number.isFinite(last) || first > last) return 0
  let power = 0
  for (let index = first; index <= last; index++) {
    const normalized = clamp(finite(spectrum[index], 0), 0, 255) / 255
    power += normalized * normalized
  }
  return Math.sqrt(power / (last - first + 1))
}

export function readFrequencyBands(spectrum: ArrayLike<number>, sampleRate: number, config: AudioReactivityConfig = AUDIO_REACTIVITY_DEFAULTS): FrequencyBands {
  return {
    low: frequencyBandEnergy(spectrum, sampleRate, config.fftSize, config.lowHz),
    high: frequencyBandEnergy(spectrum, sampleRate, config.fftSize, config.highHz),
  }
}

export interface AudioEnvelopeOptions {
  strength: number
  /** Native media volume scales the effect after gating captured spectral energy. */
  volume?: number
  playing: boolean
  reducedMotion: boolean
  available: boolean
}

/**
 * Mutates one reusable ref: exponential attack/release are independent of FPS.
 * Missing capture, pause and disabled effects all ease back to the neutral state.
 */
export function updateAudioBands(current: AudioBands, target: FrequencyBands | null, delta: number, options: AudioEnvelopeOptions, config: AudioReactivityConfig = AUDIO_REACTIVITY_DEFAULTS): boolean {
  const strength = clamp(finite(options.strength, 0), 0, 1)
  const volume = clamp(finite(options.volume ?? 1, 0), 0, 1)
  const available = options.available && options.playing && !options.reducedMotion && strength > 0 && volume > 0 && target !== null
  const seconds = clamp(finite(delta, 0), 0, 5)
  const beforeLow = current.low
  const beforeHigh = current.high
  const beforeAvailable = current.available
  const envelope = (previous: number, input: number, noiseFloor: number) => {
    const cleanPrevious = clamp(finite(previous, 0), 0, 1)
    const energy = available ? Math.pow(clamp((finite(input, 0) - noiseFloor) / (1 - noiseFloor), 0, 1), 1.35) * strength * volume : 0
    const duration = energy > cleanPrevious ? config.attackSeconds : config.releaseSeconds
    const next = cleanPrevious + (energy - cleanPrevious) * (1 - Math.exp(-seconds / duration))
    return Math.abs(next - energy) < config.settleEpsilon ? energy : next
  }
  current.low = envelope(current.low, target?.low ?? 0, config.lowNoiseFloor)
  current.high = envelope(current.high, target?.high ?? 0, config.highNoiseFloor)
  current.available = available
  return beforeAvailable !== available || beforeLow !== current.low || beforeHigh !== current.high
}

export type MediaAnalysisStatus = 'disabled' | 'gesture-required' | 'waiting' | 'ready' | 'unsupported' | 'unavailable'
export interface MediaAnalysisSnapshot { status: MediaAnalysisStatus; message: string }

type CapturableAudio = HTMLAudioElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream }
type AnalysisWindow = Window & { webkitAudioContext?: typeof AudioContext }
type Observer = { enabled: boolean; notify: (snapshot: MediaAnalysisSnapshot) => void }

export interface MediaAnalysisHandle {
  setEnabled(enabled: boolean): void
  setConfig(config: AudioReactivityConfig): void
  read(): FrequencyBands | null
  release(): void
}

const sessions = new WeakMap<HTMLAudioElement, MediaAnalysisSession>()

/**
 * A captured secondary stream never takes ownership of HTMLAudioElement output.
 * Do not replace this with createMediaElementSource: a later CORS-inaccessible
 * song could otherwise permanently silence the shared native player.
 */
class MediaAnalysisSession {
  private observers = new Set<Observer>()
  private context: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private gain: GainNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private stream: MediaStream | null = null
  private track: MediaStreamTrack | null = null
  private bytes: Uint8Array<ArrayBuffer> | null = null
  private bands: FrequencyBands = { low: 0, high: 0 }
  private streamKey = ''
  private blockedKey: string | null = null
  private unlocked = false
  private active = false
  private disposed = false
  private listening = false
  private snapshot: MediaAnalysisSnapshot = { status: 'disabled', message: '' }

  constructor(private element: CapturableAudio, private config: AudioReactivityConfig) {}

  retain(enabled: boolean, notify: Observer['notify']): MediaAnalysisHandle {
    const observer = { enabled, notify }
    this.observers.add(observer)
    this.syncEnabled()
    notify(this.snapshot)
    let released = false
    return {
      setEnabled: value => { if (!released) { observer.enabled = value; this.syncEnabled() } },
      setConfig: value => { if (!released) this.configure(value) },
      read: () => released ? null : this.read(),
      release: () => {
        if (released) return
        released = true
        this.observers.delete(observer)
        if (this.observers.size) this.syncEnabled()
        // StrictMode setup/cleanup/setup retains the same session and graph.
        queueMicrotask(() => {
          if (!this.observers.size) {
            this.dispose()
            if (sessions.get(this.element) === this) sessions.delete(this.element)
          }
        })
      },
    }
  }

  private emit(status: MediaAnalysisStatus, message = '') {
    if (this.disposed || (this.snapshot.status === status && this.snapshot.message === message)) return
    this.snapshot = { status, message }
    for (const observer of this.observers) observer.notify(this.snapshot)
  }

  private captureMethod() { return this.element.captureStream ?? this.element.mozCaptureStream }

  configure(config: AudioReactivityConfig) {
    this.config = config
    if (this.analyser && this.analyser.fftSize !== config.fftSize) {
      this.analyser.fftSize = config.fftSize
      this.bytes = new Uint8Array(this.analyser.frequencyBinCount)
    }
  }

  private syncEnabled() {
    const enabled = [...this.observers].some(observer => observer.enabled)
    if (enabled === this.active) return
    this.active = enabled
    if (!enabled) {
      this.listen(false)
      this.clearStream()
      this.suspend()
      this.emit('disabled')
      return
    }
    if (!this.captureMethod() || typeof window === 'undefined' || !(window.AudioContext || (window as AnalysisWindow).webkitAudioContext)) {
      this.emit('unsupported', '此浏览器暂不支持音频视觉分析，音乐仍可正常播放。')
      return
    }
    this.listen(true)
    if (this.context && this.unlocked) this.onPlaying()
    else this.emit('gesture-required', '点击播放后启用音频视觉联动。')
  }

  /** Only this explicit playback/button entry point can create or unlock a context. */
  resume(force = false): boolean {
    if (this.disposed || (!this.active && !force) || !this.observers.size || !this.captureMethod() || typeof window === 'undefined') return false
    const Constructor = window.AudioContext || (window as AnalysisWindow).webkitAudioContext
    if (!Constructor) return false
    if (!this.context) {
      // Prevent async platform resolution from inventing a user gesture.
      if (typeof navigator !== 'undefined' && navigator.userActivation && !navigator.userActivation.isActive) {
        this.emit('gesture-required', '点击播放后启用音频视觉联动。')
        return false
      }
      let creating: AudioContext | null = null
      try {
        const context = creating = new Constructor({ latencyHint: 'playback' })
        const analyser = context.createAnalyser()
        const gain = context.createGain()
        analyser.fftSize = this.config.fftSize
        analyser.minDecibels = -85
        analyser.maxDecibels = -15
        analyser.smoothingTimeConstant = 0
        gain.gain.value = 0
        analyser.connect(gain)
        gain.connect(context.destination)
        this.context = context
        this.analyser = analyser
        this.gain = gain
        this.bytes = new Uint8Array(analyser.frequencyBinCount)
        context.addEventListener('statechange', this.onContextState)
      } catch {
        try { void creating?.close().catch(() => {}) } catch { /* Partially created analysis is discarded. */ }
        this.emit('unavailable', '音频视觉分析暂不可用，音乐仍可正常播放。')
        return false
      }
    }
    const context = this.context
    if (context.state === 'closed') return false
    try {
      void context.resume().then(() => {
        if (this.disposed || context !== this.context) return
        this.unlocked = context.state === 'running'
        if (this.active) this.refreshStream()
        else this.suspend()
        this.updateStatus()
      }).catch(() => this.emit('gesture-required', '点击播放后启用音频视觉联动。'))
      if (context.state === 'running') this.unlocked = true
      if (this.active) this.refreshStream()
      return true
    } catch {
      this.emit('unavailable', '音频视觉分析暂不可用，音乐仍可正常播放。')
      return false
    }
  }

  private listen(enabled: boolean) {
    if (enabled === this.listening) return
    this.listening = enabled
    const method = enabled ? 'addEventListener' : 'removeEventListener'
    this.element[method]('playing', this.onPlaying)
    this.element[method]('loadedmetadata', this.onMetadata)
    this.element[method]('pause', this.onPause)
    this.element[method]('ended', this.onPause)
    this.element[method]('emptied', this.onEmptied)
    this.element[method]('error', this.onEmptied)
  }

  private onPlaying = () => {
    if (!this.active || this.disposed) return
    if (!this.context || !this.unlocked) { this.emit('gesture-required', '点击播放后启用音频视觉联动。'); return }
    if (this.element.paused || this.element.ended) { this.updateStatus(); return }
    // A previously gesture-unlocked secondary context may resume on playback.
    try { void this.context.resume().then(() => { if (this.active) { this.refreshStream(); this.updateStatus() } }).catch(() => this.emit('gesture-required', '点击播放后启用音频视觉联动。')) } catch { this.emit('unavailable') }
    this.refreshStream()
  }

  private onMetadata = () => {
    // A fresh capture during loadedmetadata can still bind the previous decoded
    // source in Chromium. Reconnect once the new source actually fires playing.
    if (this.stream && this.streamKey !== (this.element.src || this.element.currentSrc)) this.clearStream()
    this.updateStatus()
  }
  private onPause = () => { this.suspend(); this.updateStatus() }
  private onEmptied = () => { this.clearStream(); this.blockedKey = null; this.emit(this.active ? 'waiting' : 'disabled') }
  private onContextState = () => this.updateStatus()
  private onStreamTracks = () => this.bindTrack()
  private onTrackState = () => { this.bindTrack(); this.updateStatus() }

  private suspend() {
    if (this.context?.state === 'running') {
      try { void this.context.suspend().catch(() => { /* Native media never routes through this context. */ }) } catch { /* Neutral fallback. */ }
    }
  }

  private refreshStream() {
    if (!this.active || !this.context || this.disposed) return
    const key = this.element.src || this.element.currentSrc
    if (!key && !this.element.srcObject) { this.emit('waiting'); return }
    if (this.blockedKey === key) { this.emit('unavailable', '当前音源无法用于视觉分析，音乐仍可正常播放。'); return }
    if (this.stream && (key !== this.streamKey || (this.stream.getAudioTracks().length > 0 && this.stream.getAudioTracks().every(track => track.readyState === 'ended')))) this.clearStream()
    if (!this.stream) {
      try {
        const method = this.captureMethod()
        if (!method) { this.emit('unsupported'); return }
        this.stream = method.call(this.element)
        this.streamKey = key
        this.stream.addEventListener('addtrack', this.onStreamTracks)
        this.stream.addEventListener('removetrack', this.onStreamTracks)
      } catch {
        this.blockedKey = key
        this.emit('unavailable', '当前音源无法用于视觉分析，音乐仍可正常播放。')
        return
      }
    }
    this.bindTrack()
  }

  private bindTrack() {
    const next = this.stream?.getAudioTracks().find(track => track.readyState === 'live') ?? null
    if (next !== this.track) {
      this.clearTrack()
      if (next && this.context && this.analyser) {
        try {
          // Restrict the analysis node to the active audio track, never video.
          this.source = this.context.createMediaStreamSource(new MediaStream([next]))
          this.source.connect(this.analyser)
          this.track = next
          for (const event of ['mute', 'unmute', 'ended']) next.addEventListener(event, this.onTrackState)
        } catch {
          this.blockedKey = this.streamKey
          this.emit('unavailable', '当前音源无法用于视觉分析，音乐仍可正常播放。')
          return
        }
      }
    }
    this.updateStatus()
  }

  private updateStatus() {
    if (!this.active) { this.emit('disabled'); return }
    if (!this.context || !this.unlocked) { this.emit('gesture-required', '点击播放后启用音频视觉联动。'); return }
    if (this.blockedKey !== null && this.blockedKey === (this.element.src || this.element.currentSrc)) { this.emit('unavailable', '当前音源无法用于视觉分析，音乐仍可正常播放。'); return }
    if (this.element.paused || this.element.ended || !this.track || this.element.readyState < 2) { this.emit('waiting'); return }
    if (this.track.muted) { this.emit('unavailable', '当前音源无法用于视觉分析，音乐仍可正常播放。'); return }
    this.emit(this.context.state === 'running' ? 'ready' : 'waiting')
  }

  private read(): FrequencyBands | null {
    if (!this.active || this.disposed || this.context?.state !== 'running' || !this.analyser || !this.bytes || !this.track || this.track.muted || this.track.readyState !== 'live' || this.element.paused || this.element.ended || this.element.readyState < 2 || this.element.muted || this.element.volume === 0) return null
    try {
      this.analyser.getByteFrequencyData(this.bytes)
      // captureStream ignores media volume. Gate its spectrum first; apply the
      // audible volume after the gate so lowering volume never erases a band.
      this.bands.low = frequencyBandEnergy(this.bytes, this.context.sampleRate, this.config.fftSize, this.config.lowHz)
      this.bands.high = frequencyBandEnergy(this.bytes, this.context.sampleRate, this.config.fftSize, this.config.highHz)
      return this.bands
    } catch { return null }
  }

  private clearTrack() {
    if (this.track) for (const event of ['mute', 'unmute', 'ended']) this.track.removeEventListener(event, this.onTrackState)
    this.source?.disconnect()
    this.source = null
    this.track = null
  }

  private clearStream() {
    this.clearTrack()
    if (this.stream) {
      this.stream.removeEventListener('addtrack', this.onStreamTracks)
      this.stream.removeEventListener('removetrack', this.onStreamTracks)
      // These are captured tracks only; stopping them cannot pause the element.
      for (const track of this.stream.getTracks()) track.stop()
    }
    this.stream = null
    this.streamKey = ''
  }

  private dispose() {
    if (this.disposed) return
    this.disposed = true
    this.listen(false)
    this.clearStream()
    this.analyser?.disconnect()
    this.gain?.disconnect()
    if (this.context) {
      this.context.removeEventListener('statechange', this.onContextState)
      try { void this.context.close().catch(() => {}) } catch { /* An already closed context is harmless. */ }
    }
    this.context = null
    this.analyser = null
    this.gain = null
    this.bytes = null
  }
}

/** One session per real media element, also across React StrictMode remounts. */
export function retainMediaAnalysis(element: HTMLAudioElement, enabled: boolean, notify: (snapshot: MediaAnalysisSnapshot) => void, config: AudioReactivityConfig = resolveAudioReactivityConfig()): MediaAnalysisHandle {
  let session = sessions.get(element)
  if (!session) { session = new MediaAnalysisSession(element, config); sessions.set(element, session) }
  else session.configure(config)
  return session.retain(enabled, notify)
}

/** Call synchronously from playback or the effect-strength button's user gesture. */
export function resumeMediaAnalysis(element: HTMLAudioElement | null, options?: { force?: boolean }): boolean {
  return element ? sessions.get(element)?.resume(options?.force) ?? false : false
}
