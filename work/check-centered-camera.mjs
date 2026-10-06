import { readFile, writeFile } from 'node:fs/promises'

const file = 'C:/path/to/music-universe/tests/camera.mjs'
let source = (await readFile(file, 'utf8')).replaceAll('\r\n', '\n')
const before = `  assert.equal((await state()).cameraMoving, 'false')
  await pause()
  const frozen = await state()`
if (!source.includes(before)) throw new Error('Camera check insertion point changed')
source = source.replace(before, `  assert.equal((await state()).cameraMoving, 'false')
  const zoomBefore = await state()
  await page.mouse.move(180, 220)
  await page.mouse.wheel(0, -120)
  await expect(page.locator('canvas')).toHaveAttribute('data-camera-moving', 'true')
  await expect(page.locator('canvas')).toHaveAttribute('data-camera-drifting', 'false')
  const zoomPose = await state()
  for (const pixels of [-16, 16, -16]) {
    await page.mouse.wheel(0, pixels)
    await page.waitForTimeout(120)
    const zooming = await state()
    assert.equal(zooming.cameraDrifting, 'false')
    assert.equal(zooming.playing, 'true')
    assert.equal(zooming.viewCenterX, zoomBefore.viewCenterX)
    assert.equal(zooming.viewCenterY, zoomBefore.viewCenterY)
    assert.ok(angleDifference(zoomPose, zooming) < 1e-9)
  }
  assert.ok(Number((await state()).simulationTime) > Number(zoomBefore.simulationTime))
  await settle()
  await expect(page.locator('canvas')).toHaveAttribute('data-camera-drifting', 'true')
  checks.push('Wheel zoom holds the center and camera orientation during playback, keeps scene animation running and resumes cinematic drift after settling')
  await pause()
  await reset()
  const frozen = await state()`)
await writeFile(file, source, 'utf8')
console.log('Updated the active-playback zoom regression check')
