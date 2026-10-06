import fs from 'node:fs'
const root = 'C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe'
const physicsPath = `${root}/src/lib/albumRotationPhysics.ts`
let source = fs.readFileSync(physicsPath, 'utf8')
source = source.replace('  angles: { yaw: number; pitch: number }', '  angles: { yaw: number; pitch: number }\n  elapsed: number')
source = source.replace('angles: { yaw: 0, pitch: 0 }, deltaRotation:', 'angles: { yaw: 0, pitch: 0 }, elapsed: 0, deltaRotation:')
source = source.replace('  const delta = seconds\n', '  const delta = seconds\n  body.elapsed += delta\n')
fs.writeFileSync(physicsPath, source)
const interactionPath = `${root}/src/components/SceneInteraction.tsx`
source = fs.readFileSync(interactionPath, 'utf8')
source = source.replace('    gl.domElement.dataset.starAngularSpeed = body.velocity.length().toFixed(6)', '    gl.domElement.dataset.starAngularSpeed = body.velocity.length().toFixed(6)\n    gl.domElement.dataset.starSimulationTime = body.elapsed.toFixed(6)')
fs.writeFileSync(interactionPath, source)
const browserPath = `${root}/tests/rotation.mjs`
source = fs.readFileSync(browserPath, 'utf8')
source = source.replace('  assert.ok(difference(quaternion(released), quaternion(drifting)) > .01)', `  const elapsed = Number(drifting.starSimulationTime) - Number(released.starSimulationTime)
  const expectedInertia = Number(released.starAngularSpeed) * (1 - Math.exp(-3.2 * elapsed)) / 3.2
  const automaticOnly = Math.sin(.025 * elapsed / 2)
  assert.ok(elapsed > 0)
  assert.ok(difference(quaternion(released), quaternion(drifting)) > automaticOnly + Math.sin(expectedInertia / 2) * .3, 'Released rotation must exceed automatic drift, using the actual simulated time and release speed')`)
fs.writeFileSync(browserPath, source)
console.log('Inertia acceptance measures actual simulated time rather than assuming browser rendering speed.')
