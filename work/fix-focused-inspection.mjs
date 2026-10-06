import fs from 'node:fs/promises'
const app = 'C:/path/to/music-universe'
const navFile = app + '/src/hooks/useGalaxyNavigation.ts'
let nav = await fs.readFile(navFile,'utf8')
nav = nav.replace('    if (current.transitioning) return\n    update({ ...current, mode:', '    if (current.transitioning || (current.mode === \'focus\' && current.target === target && current.zoom === 1)) {\n      if (current.target === target) onFocusRef.current(target)\n      return\n    }\n    update({ ...current, mode:')
await fs.writeFile(navFile,nav)
const browserFile = app + '/tests/browser.mjs'
let browser = await fs.readFile(browserFile,'utf8')
browser = browser.replace("  await page.getByRole('button', { name: '下一颗歌曲星球', exact: true }).click()", "  await expect.poll(() => page.locator('canvas').getAttribute('data-camera-moving'), { timeout: 10000 }).toBe('false')\n  await page.getByRole('button', { name: '下一颗歌曲星球', exact: true }).click()")
browser = browser.replace("  await page.getByRole('button', { name: '上一颗歌曲星球', exact: true }).click()", "  await expect.poll(() => page.locator('canvas').getAttribute('data-camera-moving'), { timeout: 10000 }).toBe('false')\n  await page.getByRole('button', { name: '上一颗歌曲星球', exact: true }).click()")
await fs.writeFile(browserFile,browser)
console.log('Re-selecting the arriving planet restores its details without restarting camera travel.')
