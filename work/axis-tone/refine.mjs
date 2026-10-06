import fs from 'node:fs'
import path from 'node:path'
const root = process.argv[2]
function edit(file, replacements) {
  let code = fs.readFileSync(path.join(root, file), 'utf8')
  for (const [before, after] of replacements) { if (!code.includes(before)) throw new Error('Source changed: ' + file); code = code.replace(before, after) }
  fs.writeFileSync(path.join(root, file), code)
}
fs.copyFileSync(path.join(import.meta.dirname, 'albumLighting.ts'), path.join(root, 'src/lib/albumLighting.ts'))
edit('src/components/GalaxyScene.tsx', [
  ['const intensity = galaxy.star.scale * DEFAULT_ALBUM_LIGHTING_CONFIG.pointPowerPerRadius * lighting.intensityScale', 'const intensity = lighting.intensity'],
  ['intensity={radius * 14 * lighting.intensityScale}', 'intensity={lighting.intensity}'],
  ['function AlbumLightTransition({ lighting }: { lighting: AlbumLightState })', 'function AlbumLightTransition({ lighting, radius }: { lighting: AlbumLightState; radius: number })'],
  ['    const moving = advanceAlbumLight(lighting, delta)', '    lighting.radius = radius\n    const moving = advanceAlbumLight(lighting, delta)'],
  ['createAlbumLightState())', 'createAlbumLightState({}, props.galaxy.star.scale))'],
  ['<AlbumLightTransition lighting={lighting} />', '<AlbumLightTransition lighting={lighting} radius={props.galaxy.star.scale} />'],
  ['createAlbumLightState, DEFAULT_ALBUM_LIGHTING_CONFIG, mapAlbumToneToLight', 'createAlbumLightState, mapAlbumToneToLight'],
])
edit('src/lib/spaceCamera.ts', [['this.axisElapsed = Math.min(this.followConfig.axisAcquireSeconds, this.axisElapsed + dt)', 'this.axisElapsed = reducedMotion ? this.followConfig.axisAcquireSeconds : Math.min(this.followConfig.axisAcquireSeconds, this.axisElapsed + dt)']])
console.log('Light power transitions also cover star-radius changes')
