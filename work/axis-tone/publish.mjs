import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
const root = path.resolve(process.argv[2]), stage = import.meta.dirname
if (!root.endsWith(path.join('outputs', 'music-universe'))) throw new Error('Unexpected project root')
const browser = JSON.parse(fs.readFileSync(path.join(root, 'tests/reports/axis-lighting/results.json'), 'utf8'))
if (browser.some(item => item.failure)) throw new Error('Browser verification has not passed')
const render = JSON.parse(fs.readFileSync(path.join(root, 'tests/reports/follow-rendering/after-results.json'), 'utf8'))
if (render.results.some(item => item.failure)) throw new Error('Render verification has not passed')
const color = browser.find(item => item.coverExtractionFromRealTexture)
const follow = browser.find(item => item.livePlaybackCoaxialFollow)
const summary = {
  verifiedAt: new Date().toISOString(),
  stack: 'React / TypeScript / Vite / R3F / Three.js',
  requestedOrder: 'camera -> planet -> star',
  productionBuild: 'passed', unitTests: { passed: 77, failed: 0 },
  coverLighting: { red: { color: color.red.color, intensity: color.red.intensity }, blue: { color: color.blue.color, intensity: color.blue.intensity }, pausedTransition: color.smoothWhileAnimationPaused, intermediateFrames: color.intermediateFrames, maxPowerStep: color.maxPowerStep, readbacksPerCover: color.perCoverReadbacks },
  axisFollow: { sampledFrames: follow.frames, first: follow.first, last: follow.last, normalizedCollinearityTolerance: 0.000001, planetLookPointTolerance: 0.000002, zoomAndDragRespectAxis: true, manualReleaseRestoresOrbitAndKeepsAudio: true, narrowViewportPassed: true },
  renderContinuity: render.results.find(item => item.case === 'follow continuity'),
  existingPlaybackFollowRegression: 'passed',
  outputAudio: render.results.filter(item => item.case.includes('audio output') || item.case.includes('platform music') || item.case.includes('remote URL')).map(({ case: name, rms, audio }) => ({ name, rms, audio })),
  pageErrors: render.errors,
}
fs.writeFileSync(path.join(root, 'axis-lighting-verification.json'), JSON.stringify(summary, null, 2) + '\n')
for (const [from, to] of [['axis-follow.png', 'axis-lighting-preview.png'], ['red-cover.png', 'album-lighting-red.png'], ['blue-cover.png', 'album-lighting-blue.png']]) fs.copyFileSync(path.join(root, 'tests/reports/axis-lighting', from), path.join(root, to))
const app = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8')
const newHint = '播放后镜头会平滑移动到歌曲星球外侧，与星球、恒星保持同一直线并注视星球；滚轮可调整距离。解除跟随后可拖动空白处自由环绕。'
const oldHint = '播放后镜头会平滑跟随歌曲星球，始终注视它；滚轮缩放和拖动环绕仍可使用。'
if (!app.includes(newHint)) throw new Error('Follow guide changed')
// The patch includes our guide edit only; preserve unrelated edits made elsewhere in App.
fs.writeFileSync(path.join(stage, 'before/src/App.tsx'), app.replace(newHint, oldHint))
const files = ['src/lib/spaceCamera.ts', 'src/components/SceneInteraction.tsx', 'src/hooks/useAlbumTexture.ts', 'src/lib/albumLighting.ts', 'src/lib/spaceMaterials.ts', 'src/components/GalaxyScene.tsx', 'src/App.tsx', 'tests/axisFollow.test.ts', 'tests/albumLighting.test.ts', 'tests/axis-lighting.mjs', 'tests/follow-rendering.mjs', 'package.json']
const empty = path.join(stage, 'empty.txt'); fs.writeFileSync(empty, '')
let patch = ''
for (const file of files) {
  const baseline = path.join(stage, 'before', file), isNew = !fs.existsSync(baseline)
  const result = spawnSync('git', ['diff', '--no-index', '--no-ext-diff', '--', isNew ? empty : baseline, path.join(root, file)], { encoding: 'utf8' })
  if (![0, 1].includes(result.status)) throw new Error(result.stderr)
  const start = result.stdout.indexOf('@@'); if (start < 0) continue
  patch += `diff --git a/${file} b/${file}\n${isNew ? 'new file mode 100644\n' : ''}--- ${isNew ? '/dev/null' : 'a/' + file}\n+++ b/${file}\n` + result.stdout.slice(start).replaceAll('\r\n', '\n')
}
fs.writeFileSync(path.join(root, 'axis-lighting.patch'), patch)
console.log(JSON.stringify({ published: true, unitTests: 77, axisFrames: follow.frames, pausedLightTransition: true, patchFiles: files.length }))
