import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AUDIO_REACTIVITY_DEFAULTS,
  frequencyBandEnergy,
  readFrequencyBands,
  resolveAudioReactivityConfig,
  retainMediaAnalysis,
  resumeMediaAnalysis,
  updateAudioBands,
} from '../src/lib/audioReactivity'
import type { AudioBands, AudioEnvelopeOptions, MediaAnalysisSnapshot } from '../src/lib/audioReactivity'

const running: AudioEnvelopeOptions = { strength: 1, playing: true, reducedMotion: false, available: true }
const fresh = (): AudioBands => ({ low: 0, high: 0, available: false })

function spectrumFor(band: readonly [number, number], value = 255) {
  const bytes = new Uint8Array(512)
  const hzPerBin = 48000 / 1024
  bytes.fill(value, Math.ceil(band[0] / hzPerBin), Math.floor(band[1] / hzPerBin) + 1)
  return bytes
}

test('separates bass and treble without leaking DC into the bass band', () => {
  const low = spectrumFor(AUDIO_REACTIVITY_DEFAULTS.lowHz)
  assert.deepEqual(readFrequencyBands(low, 48000), { low: 1, high: 0 })
  const high = spectrumFor(AUDIO_REACTIVITY_DEFAULTS.highHz)
  assert.deepEqual(readFrequencyBands(high, 48000), { low: 0, high: 1 })
  const dc = new Uint8Array(512)
  dc[0] = 255
  assert.deepEqual(readFrequencyBands(dc, 48000), { low: 0, high: 0 })
})

test('bounds bins at Nyquist and treats invalid FFT input as neutral', () => {
  assert.equal(frequencyBandEnergy([], 48000, 1024, [20, 220]), 0)
  assert.equal(frequencyBandEnergy([255, 255], NaN, 1024, [20, 220]), 0)
  assert.equal(frequencyBandEnergy([255, NaN, Infinity], 100, 4, [20, 100]), 0)
  const result = readFrequencyBands(spectrumFor(AUDIO_REACTIVITY_DEFAULTS.highHz), 16000)
  assert.ok(Number.isFinite(result.high) && result.high >= 0 && result.high <= 1)
})

test('noise floors suppress weak bins and strength bounds both envelopes', () => {
  const bands = fresh()
  updateAudioBands(bands, { low: 0.11, high: 0.05 }, 1, running)
  assert.deepEqual(bands, { low: 0, high: 0, available: true })
  updateAudioBands(bands, { low: 1, high: 1 }, 1, { ...running, strength: 0.35 })
  assert.equal(bands.low, 0.35)
  assert.equal(bands.high, 0.35)
})

test('narrow treble peaks survive the noise gate and native volume scales them afterwards', () => {
  // Actual 6000Hz FFT bins observed from the unchanged 48kHz browser WAV fixture.
  const spectrum = new Uint8Array(512)
  spectrum.set([132, 190, 206, 190, 132], 126)
  const target = readFrequencyBands(spectrum, 48000)
  assert.equal(target.low, 0)
  assert.ok(target.high > 0.11 && target.high < 0.12)
  const normal = fresh(), quiet = fresh()
  updateAudioBands(normal, target, 1, { ...running, strength: 0.35, volume: 0.8 })
  updateAudioBands(quiet, target, 1, { ...running, strength: 0.35, volume: 0.2 })
  assert.ok(normal.high > 0.003 && normal.high < 0.02)
  assert.ok(quiet.high > 0)
  assert.ok(Math.abs(quiet.high / normal.high - 0.25) < 1e-12)
  assert.equal(normal.low, 0)
})

test('attack is independent of a 30, 60 or 120 FPS sampling cadence', () => {
  const output = [30, 60, 120].map(fps => {
    const value = fresh()
    for (let frame = 0; frame < fps / 10; frame++) updateAudioBands(value, { low: 0.9, high: 0.7 }, 1 / fps, running)
    return value
  })
  assert.ok(Math.abs(output[0].low - output[1].low) < 1e-12)
  assert.ok(Math.abs(output[1].high - output[2].high) < 1e-12)
})

test('pause eases down instead of snapping and eventually settles at exactly zero', () => {
  const value: AudioBands = { low: 0.8, high: 0.5, available: true }
  const paused = { ...running, playing: false }
  assert.equal(updateAudioBands(value, { low: 1, high: 1 }, 1 / 60, paused), true)
  assert.ok(value.low > 0.7 && value.low < 0.8)
  assert.ok(value.high > 0.4 && value.high < 0.5)
  assert.equal(value.available, false)
  for (let frame = 0; frame < 600; frame++) updateAudioBands(value, null, 1 / 60, paused)
  assert.deepEqual(value, fresh())
  assert.equal(updateAudioBands(value, null, 1 / 60, paused), false)
})

test('unavailable capture, reduced motion and an off switch converge to neutral', () => {
  for (const options of [{ ...running, available: false }, { ...running, reducedMotion: true }, { ...running, strength: 0 }]) {
    const value: AudioBands = { low: 0.6, high: 0.9, available: true }
    updateAudioBands(value, { low: 1, high: 1 }, 0.1, options)
    assert.ok(value.low > 0 && value.low < 0.6)
    assert.equal(value.available, false)
    updateAudioBands(value, null, 5, options)
    updateAudioBands(value, null, 5, options)
    assert.deepEqual(value, fresh())
  }
})

test('malformed configuration and non-finite envelopes cannot poison rendering', () => {
  const config = resolveAudioReactivityConfig({ fftSize: NaN, lowHz: [NaN, -1], highHz: [20000, Infinity], attackSeconds: -1, releaseSeconds: NaN, lowNoiseFloor: Infinity })
  assert.equal(config.fftSize, 1024)
  assert.deepEqual(config.lowHz, [20, 21])
  assert.deepEqual(config.highHz, [15999, 16000])
  assert.equal(config.attackSeconds, 0.03)
  assert.equal(config.releaseSeconds, 1.2)
  const value: AudioBands = { low: NaN, high: Infinity, available: false }
  updateAudioBands(value, { low: NaN, high: Infinity }, NaN, running, config)
  assert.equal(value.low, 0)
  assert.equal(value.high, 0)
})

class FakeTrack extends EventTarget {
  kind = 'audio'
  readyState: 'live' | 'ended' = 'live'
  muted = false
  stop() { this.readyState = 'ended' }
}
class FakeStream extends EventTarget {
  constructor(public tracks: FakeTrack[] = []) { super() }
  getAudioTracks() { return this.tracks }
  getTracks() { return this.tracks }
}
class FakeNode {
  connections: unknown[] = []
  disconnected = false
  connect(node: unknown) { this.connections.push(node) }
  disconnect() { this.disconnected = true; this.connections.length = 0 }
}
class FakeAnalyser extends FakeNode {
  fftSize = 1024
  frequencyBinCount = 512
  smoothingTimeConstant = 0
  minDecibels = 0
  maxDecibels = 0
  reads = 0
  input = spectrumFor([20, 220])
  getByteFrequencyData(bytes: Uint8Array) { this.reads++; bytes.set(this.input) }
}
class FakeContext extends EventTarget {
  static created: FakeContext[] = []
  state: 'running' | 'suspended' | 'closed' = 'suspended'
  sampleRate = 48000
  destination = {}
  analyser = new FakeAnalyser()
  gain = Object.assign(new FakeNode(), { gain: { value: 1 } })
  sources: FakeNode[] = []
  constructor() { super(); FakeContext.created.push(this) }
  createAnalyser() { return this.analyser }
  createGain() { return this.gain }
  createMediaStreamSource() { const source = new FakeNode(); this.sources.push(source); return source }
  createMediaElementSource() { throw new Error('Native playback must never be rerouted') }
  async resume() { this.state = 'running'; this.dispatchEvent(new Event('statechange')) }
  async suspend() { this.state = 'suspended'; this.dispatchEvent(new Event('statechange')) }
  async close() { this.state = 'closed'; this.dispatchEvent(new Event('statechange')) }
}
class FakeAudio extends EventTarget {
  src = 'blob:local-song-one'
  currentSrc = this.src
  srcObject = null
  paused = false
  ended = false
  muted = false
  volume = 0.8
  readyState = 4
  currentTime = 0
  captured: FakeStream[] = []
  captureThrows = false
  captureStream() {
    if (this.captureThrows) throw new DOMException('protected media', 'SecurityError')
    const stream = new FakeStream([new FakeTrack()])
    this.captured.push(stream)
    return stream
  }
}

async function fakeBrowser(action: (audio: FakeAudio, activation: { isActive: boolean }) => Promise<void>) {
  const previous = ['window', 'MediaStream', 'navigator'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const)
  const activation = { isActive: true }
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { AudioContext: FakeContext } })
  Object.defineProperty(globalThis, 'MediaStream', { configurable: true, value: FakeStream })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userActivation: activation } })
  FakeContext.created = []
  try { await action(new FakeAudio(), activation) }
  finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
}
const asAudio = (audio: FakeAudio) => audio as unknown as HTMLAudioElement

test('captures a muted secondary graph, reuses it across toggles, and preserves native playback', async () => {
  await fakeBrowser(async audio => {
    const handle = retainMediaAnalysis(asAudio(audio), true, () => {})
    assert.equal(FakeContext.created.length, 0)
    assert.equal(resumeMediaAnalysis(asAudio(audio)), true)
    await Promise.resolve()
    const context = FakeContext.created[0]
    assert.equal(FakeContext.created.length, 1)
    assert.equal(context.gain.gain.value, 0)
    assert.equal(context.analyser.connections[0], context.gain)
    assert.equal(context.gain.connections[0], context.destination)
    assert.deepEqual(handle.read(), { low: 1, high: 0 })
    handle.setEnabled(false)
    assert.equal(context.state, 'suspended')
    assert.equal(handle.read(), null)
    handle.setEnabled(true)
    await Promise.resolve()
    assert.equal(FakeContext.created.length, 1)
    assert.equal(context.state, 'running')
    assert.equal(audio.paused, false)
    assert.equal(audio.volume, 0.8)
    assert.equal(audio.muted, false)
    assert.equal(audio.src, 'blob:local-song-one')
    handle.release()
    await Promise.resolve()
    assert.equal(context.state, 'closed')
  })
})

test('pause/resume and seeking sample the new spectrum without replacing the active capture', async () => {
  await fakeBrowser(async audio => {
    const handle = retainMediaAnalysis(asAudio(audio), true, () => {})
    resumeMediaAnalysis(asAudio(audio))
    await Promise.resolve()
    const context = FakeContext.created[0]
    assert.deepEqual(handle.read(), { low: 1, high: 0 })
    audio.paused = true
    audio.dispatchEvent(new Event('pause'))
    assert.equal(context.state, 'suspended')
    assert.equal(handle.read(), null)
    context.analyser.input = spectrumFor([4000, 12000])
    audio.currentTime = 14
    audio.dispatchEvent(new Event('seeked'))
    audio.paused = false
    audio.dispatchEvent(new Event('playing'))
    await Promise.resolve()
    assert.equal(context.state, 'running')
    assert.deepEqual(handle.read(), { low: 0, high: 1 })
    assert.equal(audio.captured.length, 1)
    handle.release()
    await Promise.resolve()
  })
})

test('StrictMode cleanup/setup reuses one context and source before real cleanup closes them', async () => {
  await fakeBrowser(async audio => {
    const first = retainMediaAnalysis(asAudio(audio), true, () => {})
    resumeMediaAnalysis(asAudio(audio))
    await Promise.resolve()
    const context = FakeContext.created[0]
    first.release()
    const next = retainMediaAnalysis(asAudio(audio), true, () => {})
    await Promise.resolve()
    assert.equal(context.state, 'running')
    assert.equal(FakeContext.created.length, 1)
    assert.equal(audio.captured.length, 1)
    next.release()
    await Promise.resolve()
    assert.equal(context.state, 'closed')
    assert.equal(audio.captured[0].tracks[0].readyState, 'ended')
    assert.equal(resumeMediaAnalysis(asAudio(audio)), false)
  })
})

test('source changes reconnect to new tracks; protected tracks and errors stay neutral', async () => {
  await fakeBrowser(async audio => {
    const states: MediaAnalysisSnapshot[] = []
    const handle = retainMediaAnalysis(asAudio(audio), true, value => states.push(value))
    resumeMediaAnalysis(asAudio(audio))
    await Promise.resolve()
    const context = FakeContext.created[0]
    const firstSource = context.sources[0]
    audio.src = 'https://another-origin.test/song-two.mp3'
    audio.dispatchEvent(new Event('loadedmetadata'))
    assert.equal(firstSource.disconnected, true)
    assert.equal(audio.captured.length, 1)
    audio.dispatchEvent(new Event('playing'))
    await Promise.resolve()
    assert.equal(audio.captured.length, 2)
    const track = audio.captured[1].tracks[0]
    track.muted = true
    track.dispatchEvent(new Event('mute'))
    assert.equal(states.at(-1)?.status, 'unavailable')
    assert.equal(handle.read(), null)
    assert.equal(audio.paused, false)
    track.muted = false
    track.dispatchEvent(new Event('unmute'))
    assert.equal(states.at(-1)?.status, 'ready')
    assert.notEqual(handle.read(), null)
    audio.captureThrows = true
    audio.src = 'https://protected-origin.test/song-three.mp3'
    audio.dispatchEvent(new Event('loadedmetadata'))
    audio.dispatchEvent(new Event('playing'))
    await Promise.resolve()
    assert.equal(handle.read(), null)
    assert.equal(states.at(-1)?.status, 'unavailable')
    assert.equal(audio.paused, false)
    handle.release()
    await Promise.resolve()
  })
})

test('async resolution cannot unlock an AudioContext without a real gesture', async () => {
  await fakeBrowser(async (audio, activation) => {
    const handle = retainMediaAnalysis(asAudio(audio), true, () => {})
    activation.isActive = false
    assert.equal(resumeMediaAnalysis(asAudio(audio)), false)
    audio.dispatchEvent(new Event('playing'))
    assert.equal(FakeContext.created.length, 0)
    activation.isActive = true
    assert.equal(resumeMediaAnalysis(asAudio(audio)), true)
    await Promise.resolve()
    assert.equal(FakeContext.created.length, 1)
    handle.release()
    await Promise.resolve()
  })
})

test('unsupported capture creates no context and does not touch native audio', async () => {
  await fakeBrowser(async audio => {
    Object.defineProperty(audio, 'captureStream', { value: undefined })
    const states: MediaAnalysisSnapshot[] = []
    const handle = retainMediaAnalysis(asAudio(audio), true, value => states.push(value))
    assert.equal(states.at(-1)?.status, 'unsupported')
    assert.equal(resumeMediaAnalysis(asAudio(audio)), false)
    assert.equal(handle.read(), null)
    assert.equal(FakeContext.created.length, 0)
    assert.equal(audio.paused, false)
    handle.release()
    await Promise.resolve()
  })
})
