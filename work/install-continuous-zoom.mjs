import fs from 'node:fs'
const root = 'C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe'
for (const [stage, dest] of [['galaxyNavigation.ts', 'src/lib/galaxyNavigation.ts'], ['useGalaxyNavigation.ts', 'src/hooks/useGalaxyNavigation.ts']]) {
  fs.copyFileSync(`work/continuous-zoom/${stage}.txt`, `${root}/${dest}`)
}
function change(file, edit) {
  const path = `${root}/${file}`
  fs.writeFileSync(path, edit(fs.readFileSync(path, 'utf8')))
}
change('src/components/SceneInteraction.tsx', source => {
  source = source.replace("import { ALBUM_TARGET, markWheelTarget, OVERVIEW_ENTER } from '../lib/galaxyNavigation'\n", '')
    .replace("import { ALBUM_TARGET, markWheelTarget, OVERVIEW_ENTER } from '../lib/galaxyNavigation'\r\n", '')
  const start = source.indexOf('export function CameraDirector(')
  const end = source.indexOf('/** Surface gestures', start)
  if (start < 0 || end < 0) throw new Error('Camera replacement markers missing.')
  source = source.slice(0, start) + fs.readFileSync('work/continuous-zoom/CameraDirector.tsx.txt', 'utf8') + '\n\n' + source.slice(end)
  source = source.replace("  const active = () => navigation.viewRef.current.mode === 'focus' && navigation.viewRef.current.target === target\r\n", '')
    .replace("  const active = () => navigation.viewRef.current.mode === 'focus' && navigation.viewRef.current.target === target\n", '')
    .replace(/    onWheel: .*\r?\n/, '')
    .replace(/      if \(navigation\.viewRef\.current\.mode === 'focus'\) navigation\.holdGesture\(\)\r?\n/, '')
    .replace(/      if \(!active\(\)\) return\r?\n/, '')
  source = source.replace('      state.dragging = true', '      state.tapAt = navigation.pinching.current ? 0 : state.tapAt\n      state.dragging = true')
  source = source.replace("    gl.domElement.dataset.sceneMode = toolsVisible ? 'studio' : 'immersive'", "    gl.domElement.dataset.sceneObjectCount = String(galaxy.planets.length + 1)\n    gl.domElement.dataset.flightVisible = 'true'\n    gl.domElement.dataset.sceneMode = toolsVisible ? 'studio' : 'immersive'")
  return source
})
change('src/components/GalaxyScene.tsx', source => {
  source = source.replace("if (!playing || !world.current || navigation.viewRef.current.mode === 'focus') return", 'if (!playing || !world.current) return')
    .replace('const limit = planetCount > 20 ? 0.3 : 1', 'const limit = (planetCount > 20 ? 0.3 : 1) * Math.min(1, navigation.viewRef.current.zoom ** 2)')
    .replaceAll("navigation.viewRef.current.mode === 'focus' ? 'grab' : 'pointer'", "'grab'")
    .replace("(selected || hovered) && navigation.view.mode === 'overview'", '(selected || hovered) && toolsVisible')
  source = source.replace("  const overview = navigation.view.mode === 'overview'\r\n", '').replace("  const overview = navigation.view.mode === 'overview'\n", '')
    .replace(/  const visiblePlanets = .*\r?\n/, '')
    .replace("className={`scene-label-layer ${overview ? '' : 'focus-label-layer'}`}", 'className="scene-label-layer"')
    .replace("{(overview || navigation.view.target === ALBUM_TARGET) && <div", '{<div')
    .replaceAll('{overview && <div', '{<div')
    .replace('{visiblePlanets.map(', '{galaxy.planets.map(')
    .replace(/  const browsing = .*\r?\n/, '')
    .replace(/ visible=\{browsing \|\| navigation.view.target === ALBUM_TARGET\}/g, '')
    .replace(/ visible=\{browsing \|\| navigation.view.target === planet.id\}/g, '')
    .replace(/ visible=\{browsing\}/g, '')
    .replace('SceneLabels({ galaxy, album, selectedId, onSelect, labels, navigation }', 'SceneLabels({ galaxy, album, selectedId, onSelect, labels }')
    .replace('key="orbit-direct-interaction-v3"', 'key="continuous-zoom-v4"')
  return source
})
change('src/App.tsx', source => source
  .replace(/    const view = navigation.viewRef.current\r?\n    if \(view.transitioning && view.target !== target\) return\r?\n/, '')
  .replace(' || navigation.view.transitioning', '').replace(' || navigation.view.transitioning', '')
  .replace("{navigation.view.mode === 'overview' ? '星系总览' : '星球近景'}。指向星球向上滚动靠近，向下滚动拉远；拖动近景星球旋转", '连续缩放星系。指向任意位置滚动或双指开合，平滑放大缩小；拖动星球旋转')
  .replaceAll('滚轮靠近 / 拉远', '滚轮连续缩放')
  .replaceAll('指向星球向上滚动靠近，向下滚动拉远', '滚轮连续放大缩小，可随时反向')
  .replaceAll('拖动近景星球', '拖动星球')
)
console.log('Installed continuous camera scale, cursor anchoring and uninterrupted scene visibility.')
