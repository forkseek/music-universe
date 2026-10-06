import { writeFileSync } from 'node:fs'
const base = 'http://127.0.0.1:3002'
const common = { 'X-Music-World': '1', Origin: base }
const session = await fetch(base + '/api/music/session', { headers: common })
if (!session.ok) throw new Error('Session unavailable: ' + session.status)
const cookie = session.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
const headers = { ...common, Cookie: cookie }
const results = []
for (const provider of ['netease', 'qq']) {
  const start = Date.now()
  const search = await fetch(`${base}/api/music/${provider}/search?q=EARFQUAKE&page=1`, { headers })
  const result = await search.json()
  const song = result.songs?.find(song => /EARFQUAKE/i.test(song.name))
  if (!search.ok || !song) { results.push({ provider, searchStatus: search.status, found: false }); continue }
  const response = await fetch(`${base}/api/music/${provider}/lyrics?id=${encodeURIComponent(song.id)}`, { headers })
  const data = await response.json()
  results.push({ provider, title: song.name, status: response.status, identityMatches: data.provider === provider && data.trackId === song.id,
    available: data.available, bytes: typeof data.lyric === 'string' ? Buffer.byteLength(data.lyric) : 0,
    timedLines: typeof data.lyric === 'string' ? [...data.lyric.matchAll(/\[\d{1,3}:\d{2}(?:\.\d{1,3})?\]/g)].length : 0,
    message: data.message, elapsedMs: Date.now() - start })
}
writeFileSync('work/immersive-lyrics/live-provider-results.json', JSON.stringify(results, null, 2))
console.log(JSON.stringify(results, null, 2))
