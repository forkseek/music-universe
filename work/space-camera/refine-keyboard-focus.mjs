import {readFile,writeFile} from 'node:fs/promises'
const root='C:/path/to/music-universe/'
let text=await readFile(root+'src/App.tsx','utf8')
text=text.replace('  const selected = galaxy.planets.find', "  useEffect(() => {\n    // Closing tools returns keyboard input to the scene rather than its now-inert button.\n    if (!hudVisible) sceneHost.current?.querySelector('canvas')?.focus({ preventScroll: true })\n  }, [hudVisible])\n  const selected = galaxy.planets.find")
await writeFile(root+'src/App.tsx',text)
let test=await readFile(root+'tests/interactions.mjs','utf8')
test=test.replace(/  console\.log\(JSON\.stringify\(\{dragCameraBefore:[^\n]+\n/, '')
await writeFile(root+'tests/interactions.mjs',test)
