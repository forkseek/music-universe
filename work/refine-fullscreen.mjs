import fs from 'node:fs/promises'
const app = 'C:/path/to/music-universe'
const backgroundFile = app + '/src/components/ImmersiveBackground.tsx'
let background = await fs.readFile(backgroundFile, 'utf8')
background = background.replace('vec2(6.0,4.0)', 'vec2(19.0,15.0)')
background = background.replace('(p.y + sin(p.x*0.85)*0.35)', '(p.y - p.x*0.26 + sin(p.x*0.85)*0.35)')
background = background.replace('vec3(0.009,0.018,0.036)', 'vec3(0.0012,0.0024,0.005)')
background = background.replace('vec3(0.042,0.068,0.12)*cloud*0.6', 'vec3(0.003,0.007,0.016)*cloud*0.6')
background = background.replace('vec3(0.035,0.058,0.105)*veins*0.74', 'vec3(0.012,0.026,0.065)*veins*0.74')
background = background.replace('vec2(-1.1,0.0)', 'vec2(-2.1,0.0)')
background = background.replace('vec3(0.063,0.034,0.012)', 'vec3(0.009,0.004,0.001)')
await fs.writeFile(backgroundFile, background)
const styleFile = app + '/src/styles.css'
let styles = await fs.readFile(styleFile, 'utf8')
styles += `
/* Keep inspection cards above the planet row on wide screens. */
@media(min-width:1101px) and (min-height:700px){.planet-detail{top:122px;right:228px;width:224px;padding:17px 19px}.detail-top{margin:0 0 12px}.detail-number{font-size:28px}.detail-planet{width:32px;height:32px}.detail-eyebrow{font-size:6px;margin-bottom:8px}.planet-detail strong{font-size:13px}.planet-detail p{margin:8px 0 12px}.detail-navigation{padding-top:10px}}
@media(max-width:620px){.star-caption strong,.star-caption>div>span:last-child{display:none}.star-kind{font-size:5px;letter-spacing:1px}}
`
await fs.writeFile(styleFile, styles)
console.log('Refined deep-blue nebula contrast and inspection overlays.')
