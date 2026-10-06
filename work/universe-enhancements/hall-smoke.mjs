import { chromium, expect } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const output = path.resolve('work/universe-enhancements')
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
try {
  await page.goto('http://127.0.0.1:3002/#hall')
  await page.getByTestId('hall-universe-entry').click({ timeout: 45000 })
  await expect(page).toHaveURL(/#universe$/)
  const frame = page.frameLocator('iframe[title="专辑宇宙 3D 场景"]')
  await expect(frame.locator('.galaxy-viewport canvas').first()).toHaveAttribute('data-frame-count', /\d+/, { timeout: 60000 })
  await expect(page.getByTestId('album-universe-room')).toHaveAttribute('aria-busy', 'false', { timeout: 30000 })
  const close = frame.getByRole('button', { name: '开始遨游', exact: true })
  if (await close.isVisible()) await close.click()
  await frame.getByRole('button', { name: '宇宙效果', exact: true }).click()
  await expect(frame.getByRole('button', { name: '微动', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.screenshot({ path: path.join(output, 'hall-current.png') })
  const manifest = JSON.parse(readFileSync('public/universe/build-manifest.json', 'utf8'))
  const root = path.resolve('public/universe')
  for (const file of manifest.files) {
    const absolute = path.resolve(root, file.path)
    if (!absolute.startsWith(root + path.sep)) throw new Error('Manifest path is outside universe')
    expect(createHash('sha256').update(readFileSync(absolute)).digest('hex')).toBe(file.sha256)
  }
  expect(errors).toEqual([])
  const result = { hallEntry: true, correctRoute: true, embeddedSceneReady: true, newControlsAvailable: true, manifestFilesVerified: manifest.files.length, errors }
  writeFileSync(path.join(output, 'deployment.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
} finally { await browser.close() }
