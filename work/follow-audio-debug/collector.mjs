import http from 'node:http'
import { mkdirSync, writeFileSync } from 'node:fs'
const directory = 'work/follow-audio-debug/review'; mkdirSync(directory, { recursive: true })
const clients = new Map()
const server = http.createServer((request, response) => {
  const origin = request.headers.origin
  if (origin !== 'http://127.0.0.1:5188' && origin !== 'http://localhost:5188') { response.writeHead(403); response.end(); return }
  response.setHeader('Access-Control-Allow-Origin', origin)
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return }
  let body = ''
  request.on('data', chunk => { body += chunk; if (body.length > 16000) request.destroy() })
  request.on('end', () => {
    try {
      const sample = JSON.parse(body), entries = clients.get(sample.client) ?? []
      entries.push(sample); while (entries.length > 180) entries.shift(); clients.set(sample.client, entries)
      writeFileSync(directory + '/live-page.json', JSON.stringify(Object.fromEntries(clients), null, 2))
      response.writeHead(204); response.end()
    } catch { response.writeHead(400); response.end() }
  })
})
server.listen(5199, '127.0.0.1', () => console.log('Temporary read-only page diagnostics listening'))
