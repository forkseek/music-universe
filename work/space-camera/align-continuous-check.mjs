import { readFile, writeFile } from 'node:fs/promises'
const file='C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe/tests/interactions.mjs'
let text=await readFile(file,'utf8')
text=text.replace("  const originalTargets = JSON.parse((await state()).projectedTargets)", "  // Camera drift is frozen by pause; start precision zoom checks from the recentered baseline.\n  await resetView()\n  const originalTargets = JSON.parse((await state()).projectedTargets)")
await writeFile(file,text)
