import fs from 'node:fs'
const root = 'C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe'
const path = `${root}/src/components/SceneInteraction.tsx`
let source = fs.readFileSync(path, 'utf8')
source = source.replace("import type { GalaxyNavigation }", "import { ALBUM_TARGET } from '../lib/galaxyNavigation'\nimport type { GalaxyNavigation }")
source = source.replace('CameraDirector({ galaxy, navigation, world, onReady }', 'CameraDirector({ galaxy, navigation, onReady }')
fs.writeFileSync(path, source)
const browserPath = `${root}/tests/browser.mjs`
let checks = fs.readFileSync(browserPath, 'utf8')
checks = checks.replace("toHaveAttribute('data-view-mode', 'focus')", "toHaveAttribute('data-view-mode', 'continuous')")
checks = checks.replace("checks.push('Direct 3D picking focuses a planet, surface dragging rotates it, and overview restores track order')", "checks.push('Direct 3D picking selects a planet without changing camera scale, surface dragging rotates it, and reset restores track order')")
fs.writeFileSync(browserPath, checks)
console.log('Camera types and browser expectations updated for continuous view.')
