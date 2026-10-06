import fs from 'node:fs'
const report = JSON.parse(fs.readFileSync('work/follow-audio-debug/review/before-results.json', 'utf8'))
const frames = report.results[0].debug.frames
const positions = frames.map(f => ({ at: f.at, camera: f.camera.map(Number), center: JSON.parse(f.center || '[]'), zoom: Number(f.zoom) }))
const changes = positions.slice(1).map((p, i) => ({ dt: p.at - positions[i].at, step: Math.hypot(...p.camera.map((v, j) => v - positions[i].camera[j])), centerStep: Math.hypot(...p.center.map((v, j) => v - positions[i].center[j])), zoom: p.zoom }))
console.log(JSON.stringify({ frames: frames.length, largestSteps: changes.sort((a,b)=>b.step-a.step).slice(0,4), resized: report.results[0].debug.bufferChanges }, null, 2))
if (fs.existsSync('work/follow-audio-debug/review/live-page.json')) {
  const clients = JSON.parse(fs.readFileSync('work/follow-audio-debug/review/live-page.json', 'utf8'))
  console.log(JSON.stringify(Object.entries(clients).map(([id, samples]) => ({ id, count: samples.length, active: samples.at(-1).active, latest: samples.at(-1).audio, events: samples.at(-1).events, sizes: [...new Set(samples.map(s => `${s.frame.width}x${s.frame.height}`))] })), null, 2))
}
