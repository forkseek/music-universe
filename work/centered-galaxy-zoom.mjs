import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const app = 'C:/path/to/music-universe'
function replaceOnce(source, before, after) {
  if (!source.includes(before) || source.indexOf(before) !== source.lastIndexOf(before)) throw new Error(`Unexpected source near ${before.slice(0, 90)}`)
  return source.replace(before, after)
}
async function edit(file, transform) {
  const fullPath = path.join(app, file)
  const source = (await readFile(fullPath, 'utf8')).replaceAll('\r\n', '\n')
  await writeFile(fullPath, transform(source), 'utf8')
  console.log(`Updated ${file}`)
}

await edit('src/hooks/useGalaxyNavigation.ts', source => {
  source = replaceOnce(source, 'overviewFor, snapGalaxyView, zoomGalaxyView', 'overviewFor, zoomGalaxyView')
  source = replaceOnce(source, '// Overview is the pulled-back state where scrolling in over a planet snaps into it.', '// Overview describes the scale only; hovering never changes wheel navigation.')
  source = replaceOnce(source, `  /** Scroll-in over a planet while overviewed: drop to the base framing on that planet. */
  const snap = useCallback((target: string) => {
    overview.current = false
    update(snapGalaxyView(viewRef.current, target))
    onFocusRef.current(target)
  }, [update])
`, '')
  source = replaceOnce(source, `      // Scrolling in over a planet while overviewed snaps into it. The star keeps the
      // plain zoom behaviour, matching the hall room where only albums are entered.
      if (overview.current && pixels < 0 && hover.current && hover.current !== ALBUM_TARGET) { snap(hover.current); return }
      zoomBy(pixels, { x: event.clientX, y: event.clientY })`, `      // Wheel and trackpad zoom retain the current look point, independently of
      // cursor position or hovered planets. Only a real touch pinch supplies an anchor.
      zoomBy(pixels)`)
  source = replaceOnce(source, '  }, [host, zoomBy, snap])', '  }, [host, zoomBy])')
  return replaceOnce(source, 'hover, setHover, snap, focus,', 'hover, setHover, focus,')
})

await edit('src/lib/spaceCamera.ts', source => {
  source = replaceOnce(source, 'const RADIUS_EASE = -Math.log(0.9) * 60', 'const RADIUS_EASE = -Math.log(0.9) * 60\nconst ORBIT_ZOOM_EASE = -Math.log(0.85) * 60')
  source = replaceOnce(source, '    const viewChanged = cleanView.zoom !== this.lastView.zoom', '    const zoomChanged = cleanView.zoom !== this.lastView.zoom\n    const viewChanged = zoomChanged')
  source = replaceOnce(source, '    const desiredRadius = this.framing.distance * cleanView.zoom', '    const desiredRadius = this.framing.distance * cleanView.zoom\n    const zooming = zoomChanged || Math.abs(this.radius - desiredRadius) > EPSILON')
  source = replaceOnce(source, `    this.radius += (desiredRadius - this.radius) * ease(RADIUS_EASE, dt)
    this.center.lerp(this.requestedCenter, ease(RADIUS_EASE, dt))`, `    const zoomEase = ease(ORBIT_ZOOM_EASE, dt)
    this.radius += (desiredRadius - this.radius) * zoomEase
    this.center.lerp(this.requestedCenter, zoomEase)`)
  source = replaceOnce(source, '    } else if (cinematic) {', `    } else if (cinematic && !zooming) {
      // Hold the existing offsets while zoom eases; zeroing them would itself
      // move the picture. Resume the slow drift from this exact pose afterward.`)
  return replaceOnce(source, '    this.drifting = cinematic && !reducedMotion', '    this.drifting = cinematic && !reducedMotion && !zooming')
})

await edit('src/components/SceneInteraction.tsx', source => {
  source = replaceOnce(source, `    // 选曲只更新检视信息：相机中心始终取自 view，缩放锚点因此保持在光标处，
    // 点击行星也不会移动相机（README：选曲只更新曲目详情，保留缩放距离与镜头中心）。`, `    // Wheel zoom keeps the view center fixed; a touch pinch can supply its own
    // midpoint. Song inspection never changes either the camera center or distance.`)
  return replaceOnce(source, "    gl.domElement.dataset.zoom = navigation.viewRef.current.zoom.toFixed(6)", "    gl.domElement.dataset.zoom = navigation.viewRef.current.zoom.toFixed(6)\n    gl.domElement.dataset.viewCenterX = view.center[0].toFixed(6)\n    gl.domElement.dataset.viewCenterY = view.center[1].toFixed(6)")
})

await edit('src/App.tsx', source => replaceOnce(source, '滚轮或双指开合连续缩放。拖动空白处环绕镜头', '滚轮围绕当前星系中心平滑缩放，光标位置不会带动画面偏移；手机双指开合以双指中点缩放。拖动空白处环绕镜头'))

await edit('README.md', source => {
  source = replaceOnce(source, '星系视角下滚轮和双指开合连续缩放，指针或双指中点作为缩放中心；', '星系视角下滚轮与触控板围绕当前镜头中心连续缩放，鼠标位置与悬停星球不触发平移或跳转；手机双指开合以双指中点缩放。缩放期间保持现有镜头朝向并暂缓自动漂移，结束后自然恢复；')
  source = replaceOnce(source, '| 星系视角：滚轮向上 / 向下 | 以指针为中心连续放大 / 缩小，任意距离都可以停下或反向 |', '| 星系视角：滚轮向上 / 向下 | 围绕当前镜头中心连续放大 / 缩小，不跟随光标平移、不吸附星球，任意距离可停下或反向 |')
  return replaceOnce(source, '| 触控板双指开合 | 在场景内连续缩放，处理浏览器发出的 ctrl+wheel |', '| 触控板双指开合 | 围绕当前镜头中心连续缩放，处理浏览器发出的 ctrl+wheel |')
})

await edit('tests/spaceCamera.test.ts', source => source + `
test('zoom holds cinematic orientation and the look point until easing completes', () => {
  const { camera, controller, framing } = fixture()
  let view = initialGalaxyView()
  for (let index = 0; index < 180; index++) controller.update(1 / 60, view, true, false)
  const orientation = camera.quaternion.clone()
  const initialRadius = controller.getState().radius
  for (let index = 0; index < 30; index++) {
    view = zoomGalaxyView(view, -8)
    controller.update(1 / 60, view, true, false)
    assert.equal(controller.getState().drifting, false)
    assert.ok(1 - Math.abs(camera.quaternion.dot(orientation)) < 1e-12)
    const lookPoint = new Vector3(...framing.target).project(camera)
    assert.ok(Math.hypot(lookPoint.x, lookPoint.y) < 1e-12)
  }
  assert.ok(controller.getState().radius < initialRadius)
  for (let index = 0; index < 180; index++) controller.update(1 / 60, view, true, false)
  assert.equal(controller.getState().moving, false)
  assert.equal(controller.getState().drifting, true)
  assert.ok(1 - Math.abs(camera.quaternion.dot(orientation)) > 1e-10)
})

test('orbit zoom damping gives the same pose at 30 and 144 frames per second', () => {
  const low = fixture(), high = fixture()
  const view = zoomGalaxyView(initialGalaxyView(), -120)
  for (let index = 0; index < 30; index++) low.controller.update(1 / 30, view, false, false)
  for (let index = 0; index < 144; index++) high.controller.update(1 / 144, view, false, false)
  assert.ok(low.camera.position.distanceTo(high.camera.position) < 1e-10)
  assert.ok(Math.abs(low.controller.getState().radius - low.framing.distance * view.zoom) < 0.001)
})
`)

await edit('tests/interactions.mjs', source => {
  source = replaceOnce(source, `  const chosen = originalTargets[3]
  await page.mouse.move(chosen.x, chosen.y)`, `  const chosen = originalTargets[3]
  const centeredView = await state()
  const assertCentered = data => {
    assert.equal(data.viewCenterX, centeredView.viewCenterX)
    assert.equal(data.viewCenterY, centeredView.viewCenterY)
    assert.ok(Math.abs(Number(data.cameraX) - Number(centeredView.cameraX)) < .0001)
    assert.ok(Math.abs(Number(data.cameraY) - Number(centeredView.cameraY)) < .0001)
  }
  await page.mouse.move(180, 220)
  await wheel(160); await wheel(160); await settle()
  const overviewPlanet = await point(chosen.id)
  await page.mouse.move(overviewPlanet.x, overviewPlanet.y)
  await expect(page.locator('canvas')).toHaveAttribute('data-hover-target', chosen.id)
  await wheel(-120); await settle()
  assertCentered(await state())
  assert.equal((await state()).focusTarget, '@album-star')
  checks.push('Zooming in over an overviewed song remains incremental and never snaps or changes the selected song')
  await resetView()
  await page.mouse.move(chosen.x, chosen.y)`)
  source = replaceOnce(source, '  assert.ok(Math.hypot(notch.x - chosen.x, notch.y - chosen.y) < 3)', '  assertCentered(await state())')
  source = replaceOnce(source, 'One wheel notch enlarges incrementally around the pointer without selecting, centering or jumping to a planet', 'One wheel notch enlarges around the fixed view center without panning, selecting or jumping to a planet')
  source = replaceOnce(source, `  const afterBurst = await point(chosen.id)
  assert.ok(Math.hypot(afterBurst.x - burstAnchor.x, afterBurst.y - burstAnchor.y) < 8)`, '  assertCentered(await state())')
  source = replaceOnce(source, 'Rapid wheel bursts consume every delta and accept a reversal during easing without cursor-anchor drift', 'Rapid wheel bursts consume every delta and accept a reversal during easing while preserving the fixed view center')
  return replaceOnce(source, `  await page.screenshot({ path: path.join(output, 'music-universe-direct-focus.png') })
  const beforeDrag`, `  await page.screenshot({ path: path.join(output, 'music-universe-direct-focus.png') })
  await resetView()
  const beforeDrag`)
})
