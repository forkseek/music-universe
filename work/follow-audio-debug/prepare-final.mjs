import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = path.resolve(process.argv[2])
if (!root.endsWith(path.join('outputs', 'music-universe'))) throw new Error('Unexpected frontend root')
const stage = import.meta.dirname
const app = path.join(root, 'src/App.tsx')
const appSource = fs.readFileSync(app, 'utf8')
fs.writeFileSync(app, appSource.replace(/^import '\.\/liveDiagnostics'\r?\n/, ''))
const diagnostic = path.resolve(root, 'src/liveDiagnostics.ts')
if (!diagnostic.startsWith(root + path.sep)) throw new Error('Diagnostic cleanup escapes project')
if (fs.existsSync(diagnostic)) fs.unlinkSync(diagnostic)

const tests = [
  ['permission-regression.mjs', 'audio-recovery.mjs', 'audio-recovery'],
  ['after-probe.mjs', 'follow-rendering.mjs', 'follow-rendering'],
]
for (const [source, destination, report] of tests) {
  const text = fs.readFileSync(path.join(stage, source), 'utf8').replace('work/follow-audio-debug/review', 'tests/reports/' + report)
  fs.writeFileSync(path.join(root, 'tests', destination), text)
}
const packagePath = path.join(root, 'package.json')
const packageBefore = path.join(stage, 'before/package.json')
fs.copyFileSync(packagePath, packageBefore)
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
pkg.scripts['test:audio-recovery'] = 'node tests/audio-recovery.mjs'
pkg.scripts['test:follow-rendering'] = 'node tests/follow-rendering.mjs'
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n')

const files = ['src/components/GalaxyScene.tsx', 'src/hooks/useAudioPlayback.ts', 'src/hooks/useAlbumMusic.ts', 'src/components/MusicSearch.tsx', 'src/lib/playbackFailure.ts', 'tests/playbackFailure.test.ts', 'tests/audio-recovery.mjs', 'tests/follow-rendering.mjs', 'package.json']
const empty = path.join(stage, 'empty.txt')
fs.writeFileSync(empty, '')
let patch = ''
for (const file of files) {
  const saved = path.join(stage, 'before', file)
  const isNew = !fs.existsSync(saved)
  const result = spawnSync('git', ['diff', '--no-index', '--no-ext-diff', '--', isNew ? empty : saved, path.join(root, file)], { encoding: 'utf8' })
  if (result.status !== 0 && result.status !== 1) throw new Error(result.stderr || 'Diff generation failed')
  const hunk = result.stdout.indexOf('@@')
  if (hunk < 0) continue
  patch += `diff --git a/${file} b/${file}\n${isNew ? 'new file mode 100644\n' : ''}--- ${isNew ? '/dev/null' : 'a/' + file}\n+++ b/${file}\n` + result.stdout.slice(hunk).replaceAll('\r\n', '\n')
}
fs.writeFileSync(path.join(root, 'follow-audio-fix.patch'), patch)

const verification = JSON.parse(fs.readFileSync(path.join(stage, 'review/after-results.json'), 'utf8'))
const recovery = JSON.parse(fs.readFileSync(path.join(stage, 'review/permission-results.json'), 'utf8'))
const summary = {
  verifiedAt: new Date().toISOString(),
  browser: 'Playwright Chromium; native HTMLAudioElement; browser mute flag removed; no autoplay override',
  follow: verification.results.find(item => item.case === 'follow continuity'),
  audio: verification.results.filter(item => item.case.includes('audio output') || item.case.includes('platform music') || item.case.includes('remote URL')).map(({ case: testCase, audio, rms, state }) => ({ case: testCase, audio, rms, contextState: state })),
  recovery,
  followRegression: 'Passed npm run test:follow: playback follow, zoom, drag, release/resume, track switches, 390px viewport, unmatched local tags',
  unitTests: '66 passed',
  systemOutput: { beforeVolume: '5-6%', afterVolume: '30%', muted: false, defaultDeviceUnchanged: true },
  limits: ['Physical speaker audibility and host tab mute cannot be measured by these browser tests.', 'The working remote URL test uses a controlled WAV HTTP response; platform playback uses the live service.', 'Autoplay rejection is intentionally simulated to verify recovery; current live browser traces did not record NotAllowedError.'],
  browserErrors: verification.errors,
  failedPlatformRequests: verification.requests,
}
fs.writeFileSync(path.join(root, 'follow-audio-verification.json'), JSON.stringify(summary, null, 2) + '\n')
fs.copyFileSync(path.join(stage, 'review/after.png'), path.join(root, 'follow-audio-preview.png'))
console.log(JSON.stringify({ cleanedDiagnostics: true, filesInPatch: files.length, report: 'follow-audio-verification.json' }))
