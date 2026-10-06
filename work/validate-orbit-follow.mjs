import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = 'C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe'
async function edit(file, before, after) {
  const target = path.join(root, file)
  const source = (await readFile(target, 'utf8')).replaceAll('\r\n', '\n')
  if (!source.includes(before)) throw new Error(`Missing insertion point in ${file}`)
  await writeFile(target, source.replace(before, after), 'utf8')
  console.log(`Updated ${file}`)
}

await edit('src/components/SceneInteraction.tsx',
  "    gl.domElement.dataset.simulationTime = time.current.toFixed(6)",
  "    gl.domElement.dataset.simulationTime = time.current.toFixed(6)\n    gl.domElement.dataset.worldSpinZ = world.current?.rotation.z.toFixed(6) ?? '0'")

await edit('tests/camera.mjs',
  "  const driftBefore = await state()\n  await expect.poll",
  "  const driftBefore = await state()\n  assert.equal(driftBefore.cameraAutoFollowing, 'true')\n  assert.ok(Number(driftBefore.cameraFollowSpeed) > 0 && Number(driftBefore.cameraFollowSpeed) <= .0075)\n  await expect.poll")

await edit('tests/camera.mjs',
  "  const zoomPose = await state()\n  for (const pixels",
  "  const zoomPose = await state()\n  const heldPhase = zoomPose.cameraFollowPhase\n  for (const pixels")

await edit('tests/camera.mjs',
  "    assert.equal(zooming.cameraDrifting, 'false')\n    assert.equal(zooming.playing, 'true')",
  "    assert.equal(zooming.cameraDrifting, 'false')\n    assert.equal(zooming.cameraAutoFollowing, 'false')\n    assert.equal(zooming.cameraFollowPhase, heldPhase)\n    assert.equal(zooming.playing, 'true')")

await edit('tests/camera.mjs',
  `  assert.ok(Number((await state()).simulationTime) > Number(zoomBefore.simulationTime))
  await settle()
  await expect(page.locator('canvas')).toHaveAttribute('data-camera-drifting', 'true')
  checks.push('Wheel zoom holds the center and camera orientation during playback, keeps scene animation running and resumes cinematic drift after settling')`,
  `  const zoomAfter = await state()
  const simulationDelta = Number(zoomAfter.simulationTime) - Number(zoomBefore.simulationTime)
  assert.ok(simulationDelta > 0)
  const spinDelta = Number(zoomAfter.worldSpinZ) - Number(zoomBefore.worldSpinZ)
  assert.ok(Math.abs(spinDelta - simulationDelta * .05) < .00001, 'Wheel input must not reset or rescale the accumulated galaxy spin')
  await settle()
  await expect.poll(async () => (await state()).cameraAutoFollowing, { timeout: 20000 }).toBe('true')
  checks.push('Wheel zoom holds the center and orientation, preserves accumulated galaxy spin, and resumes slow automatic following after the idle delay')
  await page.keyboard.press('h')
  await expect(page.locator('.universe-hud')).not.toHaveAttribute('inert', '')
  await expect(page.locator('canvas')).toHaveAttribute('data-camera-auto-following', 'false')
  const toolsPose = await state()
  await page.waitForTimeout(350)
  const toolsStill = await state()
  assert.equal(toolsStill.playing, 'true')
  assert.equal(toolsStill.cameraFollowPhase, toolsPose.cameraFollowPhase)
  assert.ok(angleDifference(toolsPose, toolsStill) < 1e-9)
  await page.keyboard.press('h')
  await expect(page.locator('.universe-hud')).toHaveAttribute('inert', '')
  await expect.poll(async () => (await state()).cameraAutoFollowing, { timeout: 15000 }).toBe('true')
  const resumed = await state()
  assert.ok(Number(resumed.cameraFollowPhase) >= Number(toolsStill.cameraFollowPhase))
  assert.ok(Number(resumed.cameraFollowPhase) - Number(toolsStill.cameraFollowPhase) < .015)
  checks.push('Automatic following is confined to immersive playback; opening tools freezes the exact pose and returning resumes without catching up or jumping')`)
