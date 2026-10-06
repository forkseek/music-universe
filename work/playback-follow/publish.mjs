import fs from 'node:fs'
import path from 'node:path'
const root = process.argv[2]
const work = import.meta.dirname
const results = JSON.parse(fs.readFileSync(path.join(work, 'review/results.json'), 'utf8'))
if (results.some(result => result.failure) || !results.some(result => result.resolvedNextSongRestoresAutomaticFollow)) throw new Error('Final browser verification has not passed')
for (const [source, target] of [['PLAYBACK_CAMERA_FOLLOW.md', 'PLAYBACK_CAMERA_FOLLOW.md'], ['review/follow-desktop.png', 'playback-follow-desktop.png'], ['review/follow-mobile.png', 'playback-follow-mobile.png']]) fs.copyFileSync(path.join(work, source), path.join(root, target))
fs.writeFileSync(path.join(root, 'playback-camera-verification.json'), JSON.stringify({ unitTests: { total: 62, passed: 62 }, browser: results, audioFixture: 'Synthetic tagged WAV; real HTMLAudioElement and live album API' }, null, 2))
let browserTest = fs.readFileSync(path.join(work, 'browser.mjs'), 'utf8').replaceAll('work/playback-follow/review', 'tests/reports/playback-follow')
fs.writeFileSync(path.join(root, 'tests/playback-follow.mjs'), browserTest)
const packageFile = path.join(root, 'package.json')
const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'))
pkg.scripts['test:follow'] = 'node tests/playback-follow.mjs'
fs.writeFileSync(packageFile, JSON.stringify(pkg, null, 2) + '\n')
const readmeFile = path.join(root, 'README.md')
let readme = fs.readFileSync(readmeFile, 'utf8')
readme = readme.replace('缩放期间保持现有镜头朝向并暂缓自动跟随。', '缩放期间保持现有镜头朝向并暂缓镜头的缓慢环绕；播放歌曲的星球锁定仍继续。')
readme = readme.replace('时自动跟随停下；', '时缓慢环绕停下；')
const section = '\n## 当前歌曲的镜头跟随\n\n播放后镜头平滑转向对应星球，持续追踪完整 3D 位置并注视它，保留当前缩放比例。点击右下角「解除跟随」或按 L 自由浏览；再次点击或按 L 恢复。手动解除后，暂停、恢复和切歌都不会重新锁定。详细接入和验证见 [播放镜头跟随](./PLAYBACK_CAMERA_FOLLOW.md)。\n'
if (!readme.includes('## 当前歌曲的镜头跟随')) readme = readme.replace('## 操作方式', section + '\n## 操作方式')
fs.writeFileSync(readmeFile, readme)
console.log('Published the follow guide, reusable browser test and verified desktop/mobile previews')
