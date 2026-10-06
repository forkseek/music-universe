import {readFile,writeFile} from 'node:fs/promises'
const root='C:/path/to/music-universe/'
let text=await readFile(root+'src/components/SceneInteraction.tsx','utf8')
text=text.replace('const { camera, size, gl, invalidate } = useThree()', 'const { camera, size, gl, invalidate, events } = useThree()')
text=text.replace('    const canvas = gl.domElement\n    let dragPointer', '    const canvas = gl.domElement\n    const eventHost = events.connected instanceof HTMLElement ? events.connected : canvas\n    let dragPointer')
text=text.replace('    const down = (event: PointerEvent) => {\n      if', '    const down = (event: PointerEvent) => {\n      if (event.target !== canvas) return\n      if')
const start=text.indexOf('      // R3F connects its event manager')
const end=text.indexOf('\n    }\n    const move',start)
if(start<0||end<0)throw Error('down block not found')
text=text.slice(0,start)+`      // R3F owns mesh input on this same host and runs before the camera listener.
      if (disposed || isSurfaceEvent(event) || event.button !== 0 || touches.size > 1 || navigation.pinching.current) return
      dragPointer = event.pointerId; lastX = event.clientX; lastY = event.clientY; lastAt = performance.now()
      canvas.setPointerCapture(event.pointerId); motion.beginDrag(); canvas.style.cursor = 'grabbing'; invalidate()`+text.slice(end)
text=text.replace("const doubleClick = (event: MouseEvent) => { queueMicrotask(() => { if (!disposed && !isSurfaceEvent(event)) { recenter() } }) }", "const doubleClick = (event: MouseEvent) => { if (!disposed && event.target === canvas && !isSurfaceEvent(event)) recenter() }")
for(const name of ['pointerdown','pointermove','dblclick']) text=text.replaceAll(`canvas.addEventListener('${name}'`, `eventHost.addEventListener('${name}'`).replaceAll(`canvas.removeEventListener('${name}'`, `eventHost.removeEventListener('${name}'`)
text=text.replace('navigation.pinching, gl, pointer, reduced, invalidate]', 'navigation.pinching, gl, events.connected, pointer, reduced, invalidate]')
await writeFile(root+'src/components/SceneInteraction.tsx',text)
let test=await readFile(root+'tests/interactions.mjs','utf8')
test=test.replace('  sameCamera(beforeDrag, afterDrag)', "  console.log(JSON.stringify({dragCameraBefore:{x:beforeDrag.cameraX,y:beforeDrag.cameraY,z:beforeDrag.cameraZ,theta:beforeDrag.cameraTheta},dragCameraAfter:{x:afterDrag.cameraX,y:afterDrag.cameraY,z:afterDrag.cameraZ,theta:afterDrag.cameraTheta}}))\n  sameCamera(beforeDrag, afterDrag)")
await writeFile(root+'tests/interactions.mjs',test)
