import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const universe = 'C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe'
if (!existsSync(path.join(universe, 'src/App.tsx'))) throw new Error('Existing universe project is required')
function replace(file, original, next) {
  const source = readFileSync(file, 'utf8')
  if (!source.includes(original)) throw new Error(`Expected source missing in ${file}: ${original.slice(0, 100)}`)
  writeFileSync(file, source.replace(original, next))
}
for (const file of ['src/lib/musicWorld.ts', 'src/lib/explorationSession.ts', 'src/components/HallConnection.tsx', 'src/hall-connection.css']) {
  cpSync(path.join(root, 'work/music-universe-link', file), path.join(universe, file))
}
mkdirSync(path.join(universe, 'public/media'), { recursive: true })
cpSync(path.join(root, 'public/media/scene-hall-2k.webp'), path.join(universe, 'public/media/music-world-hall.webp'))
const app = path.join(universe, 'src/App.tsx')
replace(app, "import { useMemo, useRef, useState }", "import { useEffect, useMemo, useRef, useState }")
replace(app, "import { DEFAULT_ALBUM, formatDuration }", "import { formatDuration }")
replace(app, "const DEFAULT_SEED = 'GLASS-2025'", "import HallConnection from './components/HallConnection'\nimport { MUSIC_HALL_URL } from './lib/musicWorld'\nimport { readExploration, rememberExploration } from './lib/explorationSession'\nimport './hall-connection.css'")
replace(app, "  const [album, setAlbum] = useState<Album>(DEFAULT_ALBUM)\n  const [seed, setSeed] = useState(DEFAULT_SEED)\n  const [seedInput, setSeedInput] = useState(DEFAULT_SEED)", "  const [initial] = useState(readExploration)\n  const [album, setAlbum] = useState<Album>(initial.album)\n  const [seed, setSeed] = useState(initial.seed)\n  const [seedInput, setSeedInput] = useState(initial.seed)\n  useEffect(() => { rememberExploration({ album, seed }) }, [album, seed])")
replace(app, '<nav aria-label="主导航"><a', '<nav aria-label="主导航"><a className="hall-nav-link" href={MUSIC_HALL_URL}><ChevronLeft size={14} /> 音乐大厅</a><a')
replace(app, '<div className="header-note"><span className="live-dot" /> 音乐，让宇宙有迹可循 <span className="avatar">MU</span></div>', '<div className="header-note"><a className="world-attribution" href={MUSIC_HALL_URL}><span><b>musicworld</b> / ROOM 002</span><span className="avatar">MW</span></a></div>')
replace(app, 'A LITTLE SPACE FOR YOUR SOUND.', 'FROM THE MUSIC HALL, INTO THE STARS.')
replace(app, '      <div className="generation-note"', '      <HallConnection />\n      <div className="generation-note"')
const scene = path.join(universe, 'src/components/GalaxyScene.tsx')
replace(scene, "import { GALAXY_TEMPLATE, mulberry32 }", "import { MUSIC_HALL_URL } from '../lib/musicWorld'\nimport { GALAXY_TEMPLATE, mulberry32 }")
const robotStart = readFileSync(scene, 'utf8').indexOf('    <mesh position={[0.05, 0.17, 0]}')
const robotEnd = readFileSync(scene, 'utf8').indexOf('    <mesh position={[-0.59, 0, 0]}')
if (robotStart < 0 || robotEnd < robotStart) throw new Error('Robot pilot source missing')
const source = readFileSync(scene, 'utf8')
const pilot = `    {/* The same cream-and-orange, smiling companion from the Music World hall. */}
    <group position={[-0.03, 0.14, 0.09]} scale={1.35} name="music-world-companion">
      <mesh scale={[0.13, 0.15, 0.1]}><sphereGeometry args={[1, 24, 16]} /><meshStandardMaterial color="#fff0d6" metalness={0.18} roughness={0.4} /></mesh>
      <mesh position={[0, 0.16, 0]} scale={[0.2, 0.18, 0.14]}><sphereGeometry args={[1, 32, 24]} /><meshStandardMaterial color="#fff0d6" metalness={0.2} roughness={0.35} /></mesh>
      <mesh position={[0, 0.145, 0.088]} scale={[0.167, 0.115, 0.075]}><sphereGeometry args={[1, 32, 20]} /><meshStandardMaterial color="#10151a" metalness={0.55} roughness={0.18} /></mesh>
      {[-0.069, 0.069].map((x) => <mesh key={x} position={[x, 0.13, 0.16]}><torusGeometry args={[0.031, 0.009, 8, 18, Math.PI]} /><meshBasicMaterial color={[2.5, 1.4, 0.32]} toneMapped={false} /></mesh>)}
      {[-1, 1].flatMap((side) => [0, 1, 2].map((i) => <mesh key={side + ':' + i} position={[side * (0.103 + i * 0.013), 0.102, 0.151]} rotation={[0, 0, -0.3]}><capsuleGeometry args={[0.003, 0.012, 2, 6]} /><meshBasicMaterial color={[1.7, 0.16, 0.07]} toneMapped={false} /></mesh>))}
      {[-0.19, 0.19].map((x) => <mesh key={x} position={[x, 0.15, 0]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.065, 0.065, 0.045, 20]} /><meshStandardMaterial color="#dd8e38" metalness={0.3} roughness={0.35} /></mesh>)}
      <mesh position={[0.025, 0.298, 0]} scale={[0.105, 0.021, 0.09]}><sphereGeometry args={[1, 20, 12]} /><meshStandardMaterial color="#e9943d" roughness={0.4} /></mesh>
      <mesh position={[0.033, 0.37, 0]} rotation={[0, 0, -0.2]}><cylinderGeometry args={[0.011, 0.014, 0.12, 10]} /><meshStandardMaterial color="#333035" metalness={0.6} /></mesh>
      <mesh position={[0.045, 0.44, 0]}><sphereGeometry args={[0.043, 16, 12]} /><meshBasicMaterial color={[2.2, 1.3, 0.32]} toneMapped={false} /></mesh>
      <mesh position={[0, 0.015, 0.1]} rotation={[0, 0, -0.55]}><boxGeometry args={[0.26, 0.028, 0.014]} /><meshStandardMaterial color="#805334" roughness={0.7} /></mesh>
    </group>
`
writeFileSync(scene, source.slice(0, robotStart) + pilot + source.slice(robotEnd))
replace(scene, 'color="#cfdae4" metalness={0.7}', 'color="#eadcc7" metalness={0.5}')
replace(scene, "function FlightPath({ galaxy, time }", `function HallGate() {
  return <group position={[-13.65, -5.1, 0]} name="music-hall-gate">
    <mesh><torusGeometry args={[0.64, 0.025, 10, 72]} /><meshBasicMaterial color={[1.55, 1.05, 0.45]} toneMapped={false} /></mesh>
    <mesh rotation={[0, 0, 0.4]}><torusGeometry args={[0.78, 0.011, 8, 72, Math.PI * 1.6]} /><meshBasicMaterial color="#edc389" transparent opacity={0.65} /></mesh>
    <mesh position={[0, 0, -0.05]}><circleGeometry args={[0.61, 48]} /><meshBasicMaterial color="#d9a14e" transparent opacity={0.07} depthWrite={false} /></mesh>
    <mesh position={[0, 0.81, 0]}><sphereGeometry args={[0.035, 12, 8]} /><meshBasicMaterial color={[2.1, 1.3, 0.4]} toneMapped={false} /></mesh>
  </group>
}

function FlightPath({ galaxy, time }`)
replace(scene, "    { key: 'flight', position: new Vector3(-10.3, -5.5, 0) },", "    { key: 'flight', position: new Vector3(-9.5, -5.5, 0) },\n    { key: 'hall-gate', position: new Vector3(-13.65, -6.3, 0) },")
replace(scene, '<span>VOYAGER–01 <i /> 自由巡航</span>', '<span>HALL VOYAGER <i /> 来自音乐大厅的旅伴</span>')
replace(scene, '    {galaxy.planets.map((planet) => <div key={planet.id}', '    <div ref={labelRef(\'hall-gate\')} className="hall-gate-caption"><a href={MUSIC_HALL_URL} aria-label="通过光环返回音乐大厅">音乐大厅 ↗</a></div>\n    {galaxy.planets.map((planet) => <div key={planet.id}')
replace(scene, '    <FlightPath galaxy={galaxy} time={time} />', '    <HallGate />\n    <FlightPath galaxy={galaxy} time={time} />')
writeFileSync(path.join(universe, '.env.example'), '# 音乐大厅地址，生产部署时替换为实际 Music World 地址。\nVITE_MUSIC_WORLD_URL=http://127.0.0.1:3002/\n')
const readme = path.join(universe, 'README.md')
writeFileSync(readme, readFileSync(readme, 'utf8') + `
## 与 Music World 音乐大厅相连

星系沿用大厅的奶油白与橙色机器人、琥珀色笑眼、灯泡天线、金色入口光环与云朵提示。飞船驾驶员为相同角色的程序化 3D 造型，页面旅伴头像使用大厅已有图片。

顶部和轨道旁可返回音乐大厅；下方光点可进入音乐电台、我的曲库、我的旅程。大厅顶部提供「专辑星系」入口。往返页面时，当前标签页通过 sessionStorage 保留专辑、封面、曲目与 Seed，存储不可用时编辑和生成仍可使用。

默认大厅地址为 http://127.0.0.1:3002/。部署时复制 .env.example 为 .env.local 并配置 VITE_MUSIC_WORLD_URL；大厅侧使用 NEXT_PUBLIC_MUSIC_UNIVERSE_URL 指向星系地址，变更后重新构建。两边通过常规页面跳转关联，数据源仍由各自应用管理。
`)
console.log('Music Universe linked to Music World; original galaxy generator preserved.')
