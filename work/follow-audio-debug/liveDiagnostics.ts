// Temporary development-only diagnostics. Removed after identifying the fault.
if (import.meta.env.DEV && location.port === '5188') {
  const client = crypto.randomUUID()
  const events: { event: string; at: number; error?: number }[] = []
  const installed = new WeakSet<HTMLAudioElement>()
  const timer = window.setInterval(() => {
    const audio = document.querySelector('audio'), canvas = document.querySelector('canvas')
    if (!audio || !canvas) return
    if (!installed.has(audio)) {
      installed.add(audio)
      for (const event of ['playing', 'pause', 'waiting', 'error', 'volumechange']) audio.addEventListener(event, () => {
        events.push({ event, at: Date.now(), error: audio.error?.code }); if (events.length > 20) events.shift()
      })
    }
    const source = audio.currentSrc || audio.src
    // Never include cookie values, query strings, audio tickets or account credentials.
    const sample = { client, at: Date.now(), headless: navigator.userAgent.includes('Headless'),
      audio: { paused: audio.paused, volume: audio.volume, muted: audio.muted, time: audio.currentTime, ready: audio.readyState, error: audio.error?.code,
        sourceType: !source ? 'none' : source.startsWith('blob:') ? 'file' : 'url', sourcePath: source && !source.startsWith('blob:') ? new URL(source, location.href).pathname : '' },
      active: navigator.userActivation.hasBeenActive, events,
      frame: { width: canvas.width, height: canvas.height, dpr: canvas.dataset.renderDpr, follow: canvas.dataset.cameraFollowTarget,
        camera: [canvas.dataset.cameraX, canvas.dataset.cameraY, canvas.dataset.cameraZ], center: canvas.dataset.cameraLookCenter } }
    void fetch('http://127.0.0.1:5199/', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(sample) }).catch(() => {})
  }, 750)
  import.meta.hot?.dispose(() => clearInterval(timer))
}
