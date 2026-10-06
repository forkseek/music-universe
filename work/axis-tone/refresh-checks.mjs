import fs from 'node:fs'
import path from 'node:path'
const root = process.argv[2]
fs.copyFileSync(path.join(import.meta.dirname, 'axis-lighting.mjs'), path.join(root, 'tests/axis-lighting.mjs'))
const file = path.join(root, 'tests/follow-rendering.mjs')
let text = fs.readFileSync(file, 'utf8')
const before = '  expect(maxCameraStep).toBeLessThan(4); expect(maxCenterStep).toBeLessThan(.5)'
if (!text.includes(before)) throw new Error('Rendering check changed')
text = text.replace(before, `  const maxRelativeCameraStep = Math.max(...local.debug.frames.slice(1).map((frame, index) => {
    const previous = local.debug.frames[index], center = JSON.parse(frame.center)
    const radius = Math.hypot(...frame.camera.map((value, axis) => Number(value) - center[axis]))
    return Math.hypot(...frame.camera.map((value, axis) => Number(value) - Number(previous.camera[axis]))) / radius
  }))
  // Coaxial follow sweeps with the actual planet. Compare displacement with orbit-view radius.
  expect(maxRelativeCameraStep).toBeLessThan(.06); expect(maxCenterStep).toBeLessThan(.5)`)
fs.writeFileSync(file, text)
console.log('Browser checks reflect explicit follow release and radial camera motion')
