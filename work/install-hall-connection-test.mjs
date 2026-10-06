import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
const universe = 'C:/path/to/music-universe'
let test = readFileSync('work/hall-connection-check.mjs', 'utf8')
test = test.replace("const universe = 'http://127.0.0.1:5188/'", "const universe = new URL(process.env.TEST_URL || 'http://127.0.0.1:5188/').href")
test = test.replace("const hall = 'http://127.0.0.1:3002/'", "const hall = new URL(process.env.MUSIC_WORLD_TEST_URL || 'http://127.0.0.1:3002/').href")
test = test.replace("const output = 'C:/path/to/universe-workspace'", "const output = path.resolve('..')")
test = test.replace('const candidate = chromium.executablePath()', 'const candidate = process.env.BROWSER_EXECUTABLE || chromium.executablePath()')
test = test.replace('  for (const width of [390, 360]) {', `  await page.getByRole('button', { name: '编辑专辑', exact: true }).click()
  await page.getByRole('button', { name: '恢复示例', exact: true }).click()
  await page.getByRole('button', { name: '保存并生成', exact: true }).click()
  await page.getByRole('textbox', { name: '星系 Seed', exact: true }).fill('GLASS-2025')
  await page.getByRole('button', { name: '重新生成', exact: true }).click()
  await sceneReady()
  for (const width of [390, 360]) {`)
writeFileSync(path.join(universe, 'tests/hall-connection.mjs'), test)
const file = path.join(universe, 'package.json')
const pkg = JSON.parse(readFileSync(file, 'utf8'))
pkg.scripts['test:hall'] = 'node tests/hall-connection.mjs'
writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n')
const readmePath = path.join(universe, 'README.md')
let readme = readFileSync(readmePath, 'utf8')
readme = readme.replace('│   │   └── AlbumEditor.tsx            # 专辑工坊', '│   │   ├── AlbumEditor.tsx            # 专辑工坊\n│   │   └── HallConnection.tsx         # 大厅旅伴、光点入口与云朵提示')
readme = readme.replace('│   │   └── albumEditor.ts             # 曲目解析和封面处理', '│   │   ├── albumEditor.ts             # 曲目解析和封面处理\n│   │   ├── musicWorld.ts              # 大厅地址与房间入口\n│   │   └── explorationSession.ts      # 标签页内专辑与 Seed 恢复')
readme = readme.replace('│   └── browser.mjs                   # 真实浏览器交互、截图和错误检查', '│   ├── browser.mjs                   # 真实浏览器交互、截图和错误检查\n│   └── hall-connection.mjs           # 双向导航、状态恢复、云朵提示和窄屏')
readme += '\n大厅与星系都启动后，可运行 `npm run test:hall` 检查双向入口、三个房间入口、往返状态恢复、云朵提示、暂停、手机版与控制台错误。可通过 `MUSIC_WORLD_TEST_URL` 指定大厅测试地址。报告与截图位于项目上一级。\n'
writeFileSync(readmePath, readme)
console.log('Hall integration check installed in the Music Universe project.')
