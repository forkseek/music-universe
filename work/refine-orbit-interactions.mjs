import fs from 'node:fs/promises'
const app = 'C:/path/to/music-universe'
const scene = app + '/src/components/SceneInteraction.tsx'
let source = await fs.readFile(scene,'utf8')
source = source.replace("import type { Group, Mesh }", "import type { Group }")
source = source.replace("  const { camera, size, gl, invalidate } = useThree()\n  const smooth", "  const { camera, size, gl, invalidate } = useThree()\n  const framing = useMemo(() => getGalaxyFraming(size.width, size.height, galaxy.planets.length), [size.width, size.height, galaxy.planets.length])\n  const reduced = useMemo(() => matchMedia('(prefers-reduced-motion: reduce)').matches, [])\n  const smooth")
source = source.replace('    const framing = getGalaxyFraming(size.width, size.height, galaxy.planets.length)\n', '')
source = source.replace("    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches\n", '')
source = source.replace('  const edge = useMemo(() => new Vector3(), [])', '  const edge = useMemo(() => new Vector3(), [])\n  const right = useMemo(() => new Vector3(1, 0, 0), [])')
source = source.replace('add(new Vector3(node.radius, 0, 0))', 'addScaledVector(right, node.radius)')
await fs.writeFile(scene,source)
console.log('Camera framing and gesture resources are cached.')
