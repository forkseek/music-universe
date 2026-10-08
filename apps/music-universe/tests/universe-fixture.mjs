// Test-only tones and metadata; no real account or third-party catalog is replaced.
export function toneWav(frequency, seconds = 45) {
  const rate = 48000, pcm = Buffer.alloc(rate * seconds * 2)
  for (let i = 0; i < pcm.length / 2; i++) {
    const hz = typeof frequency === 'function' ? frequency(i / rate) : frequency
    pcm.writeInt16LE(Math.round(6000 * Math.sin(i * 2 * Math.PI * hz / rate)), i * 2)
  }
  const header = Buffer.alloc(44)
  header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22)
  header.writeUInt32LE(rate, 24); header.writeUInt32LE(rate * 2, 28); header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

export async function installUniverseFixture(page, address) {
  const origin = new URL(address).origin
  const cover = origin + (address.includes('3002') ? '/universe' : '') + '/covers/dont-tap-the-glass.jpg'
  const songs = ['Bass signal', 'Treble light', 'Orbiting sky', 'Quiet stars'].map((name, i) => ({ provider: 'netease', id: String(101 + i), playbackId: String(101 + i), name, artist: 'Isolated Fixture', album: 'Test Universe', albumId: '900', cover, duration: 45000, fee: 0, discNumber: 1, trackNumber: i + 1 }))
  const rawAlbum = { provider: 'netease', id: '900', name: 'Test Universe', artist: 'Isolated Fixture', cover, tracks: songs }
  const tracks = songs.map((song, i) => ({ id: `netease:album:900:1:${i + 1}:${i}:${song.id}`, title: song.name, artist: song.artist, duration: 45, rating: 80, discNumber: 1, trackNumber: i + 1, source: { provider: 'netease', trackId: song.id, albumId: '900', playbackId: song.id } }))
  const initial = { seed: 'enhancement-test', album: { id: 'netease:album:900', name: rawAlbum.name, artist: rawAlbum.artist, cover, tracks } }
  const bass = toneWav(time => time >= 12 && time < 24 ? 6000 : 128), treble = toneWav(6000)
  await page.addInitScript(value => { sessionStorage.setItem('music-universe:exploration:v1', JSON.stringify(value)); localStorage.setItem('music-universe:platform', 'netease') }, initial)
  await page.route('**/fixture-audio/*', route => {
    const wav = route.request().url().includes('102.wav') ? treble : bass
    const range = route.request().headers().range?.match(/bytes=(\d+)-(\d*)/)
    const start = range ? Number(range[1]) : 0, end = range?.[2] ? Number(range[2]) : wav.length - 1
    return route.fulfill({ status: range ? 206 : 200, contentType: 'audio/wav', headers: {
      'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1),
      ...(range ? { 'Content-Range': `bytes ${start}-${end}/${wav.length}` } : {}),
    }, body: wav.subarray(start, end + 1) })
  })
  await page.route('**/api/music/**', route => {
    const request = route.request(), url = new URL(request.url()), action = url.pathname.split('/').at(-1)
    const send = value => route.fulfill({ json: value }).catch(() => {})
    if (action === 'session') return send({ id: 'isolated-test' })
    if (action === 'status') return send({ provider: 'netease', authorized: true, loginAvailable: false, message: '' })
    if (action === 'search') return send({ songs: [], page: 1, hasMore: false, provider: 'netease' })
    if (action === 'album') { const id = request.postDataJSON().trackId; return send({ album: rawAlbum, trackId: id, trackIndex: songs.findIndex(song => song.id === id), matchedBy: 'id' }) }
    if (action === 'play') return send({ playable: true, url: `${origin}/fixture-audio/${request.postDataJSON().playbackId}.wav` })
    if (action === 'lyrics') { const id = url.searchParams.get('id'); return send({ provider: 'netease', trackId: id, available: true, lyric: `[00:00]${id} signals fade behind us\n[00:02]${id} drifting through the night\n[00:05]${id} orbiting your light\n[00:12]${id} stars answer in silence\n[00:24]${id} into the universe` }) }
    return send({})
  })
  return { tracks, songs }
}
