import fs from 'node:fs'
const root = 'C:/Users/IKUN/Documents/Codex/2026-10-04/referenced-chatgpt-conversation-this-is-an-3/outputs/music-universe'
fs.copyFileSync('work/album-rotation/albumRotationPhysics.ts.txt', `${root}/src/lib/albumRotationPhysics.ts`)
const interaction = `${root}/src/components/SceneInteraction.tsx`
let source = fs.readFileSync(interaction, 'utf8')
source = source.replace("import { ALBUM_TARGET }", "import { advanceAngularBody, createAngularBody, dragAngularBody, releaseAngularBody, stopAngularBody } from '../lib/albumRotationPhysics'\nimport { ALBUM_TARGET }")
const start = source.indexOf('/** Surface gestures')
const end = source.indexOf('export function PlaybackHalo', start)
if (start < 0 || end < 0) throw new Error('Missing surface gesture markers.')
source = source.slice(0, start) + fs.readFileSync('work/album-rotation/useSurfaceGesture.tsx.txt', 'utf8') + '\n\n' + source.slice(end)
fs.writeFileSync(interaction, source)
const renderer = `${root}/src/components/GalaxyScene.tsx`
source = fs.readFileSync(renderer, 'utf8')
source = source.replace('onInspect: () => navigation.focus(ALBUM_TARGET), onToggle: onToggleTarget, inspectOnClick: toolsVisible', 'onInspect: () => navigation.focus(ALBUM_TARGET), onToggle: onToggleTarget, inspectOnClick: toolsVisible, inertial: true, playing, autoSpeed: galaxy.star.rotationSpeed')
const before = "    // A gentle axial drift keeps the full cover continuously legible.\r\n    if (sphere.current) { sphere.current.rotation.y = Math.sin(time.current * galaxy.star.rotationSpeed) * 0.028 + gesture.rotation.current.yaw; sphere.current.rotation.x = gesture.rotation.current.pitch }"
const beforeLF = before.replaceAll('\r\n', '\n')
const after = '    if (sphere.current && gesture.orientation) sphere.current.quaternion.copy(gesture.orientation)'
if (source.includes(before)) source = source.replace(before, after)
else if (source.includes(beforeLF)) source = source.replace(beforeLF, after)
else throw new Error('Missing star rotation assignment.')
fs.writeFileSync(renderer, source)
const material = `${root}/src/lib/spaceMaterials.ts`
source = fs.readFileSync(material, 'utf8')
source = source.replace("// Project the complete square artwork onto the star's spherical front surface.\r\n// The UV is derived from sphere coordinates, so it is part of the star mesh.", '// Artwork remains attached to the rotating sphere on both hemispheres.\n// Rear X is reversed so the exterior artwork is upright rather than mirrored.')
source = source.replace("// Project the complete square artwork onto the star's spherical front surface.\n// The UV is derived from sphere coordinates, so it is part of the star mesh.", '// Artwork remains attached to the rotating sphere on both hemispheres.\n// Rear X is reversed so the exterior artwork is upright rather than mirrored.')
const uvBefore = '        vec2 artworkUv = vPosition.xy * 0.47 + 0.5;\r\n        vec3 cover = texture2D(uCover, clamp(artworkUv,0.01,0.99)).rgb;'
const uvAfter = `        vec2 frontUv = vPosition.xy * 0.47 + 0.5;
        vec2 backUv = vec2(-vPosition.x, vPosition.y) * 0.47 + 0.5;
        vec3 frontCover = texture2D(uCover, clamp(frontUv,0.01,0.99)).rgb;
        vec3 backCover = texture2D(uCover, clamp(backUv,0.01,0.99)).rgb;
        vec3 cover = mix(backCover, frontCover, smoothstep(-0.08, 0.08, vPosition.z));`
if (source.includes(uvBefore)) source = source.replace(uvBefore, uvAfter)
else if (source.includes(uvBefore.replaceAll('\r\n', '\n'))) source = source.replace(uvBefore.replaceAll('\r\n', '\n'), uvAfter)
else throw new Error('Missing artwork shader coordinates.')
fs.writeFileSync(material, source)
console.log('Installed 360-degree star rotation, angular inertia and front/back artwork projection.')
