import { AdditiveBlending, Color, ShaderMaterial, Texture, Vector3 } from 'three'
import { PLANET_STYLES } from './generateAlbumGalaxy'
import type { GalaxyPlanet } from './generateAlbumGalaxy'

const sphereVertex = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vPosition;
  void main() {
    vUv = uv;
    vPosition = position;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-viewPosition.xyz);
    gl_Position = projectionMatrix * viewPosition;
  }
`

const noise = `
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise3(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x),
                   mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x),
                   mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float n=0.0, amp=0.5;
    for (int i=0; i<4; i++) { n+=amp*noise3(p); p=p*2.02+vec3(1.7); amp*=0.5; }
    return n;
  }
`

export function createPlanetMaterial(planet: GalaxyPlanet) {
  return new ShaderMaterial({
    vertexShader: sphereVertex,
    uniforms: {
      uColor: { value: new Color(planet.color) },
      uSecondary: { value: new Color(planet.secondaryColor) },
      uStyle: { value: PLANET_STYLES.indexOf(planet.style) },
      uSeed: { value: (planet.surfaceSeed % 10000) / 100 },
      uEmission: { value: planet.emissiveIntensity },
    },
    fragmentShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vView;
      varying vec3 vPosition;
      uniform vec3 uColor;
      uniform vec3 uSecondary;
      uniform int uStyle;
      uniform float uSeed;
      uniform float uEmission;
      ${noise}
      void main() {
        vec3 p = vPosition * 4.0 + uSeed;
        float n = fbm(p);
        vec3 normal = normalize(vNormal);
        vec3 light = normalize(vec3(-0.7, 0.9, 1.2));
        float diffuse = max(dot(normal, light), 0.0);
        float fresnel = pow(1.0-max(dot(normal, normalize(vView)),0.0), 3.5);
        float pattern = n;
        float shine = 0.0;
        float glow = uEmission;
        if (uStyle == 0) {
          pattern = smoothstep(0.15, 0.8, n + sin(vPosition.y*9.0+n*8.0)*0.15);
          shine = pow(max(dot(reflect(-light, normal), vView), 0.0), 70.0) * 1.6;
          glow += fresnel * 0.7;
        } else if (uStyle == 1) {
          float cracks = 1.0-smoothstep(0.01, 0.085, abs(fbm(p*2.4)-0.47));
          pattern = cracks;
          glow += cracks * 1.8;
        } else if (uStyle == 2) {
          pattern = smoothstep(0.35, 0.65, fbm(p*3.0));
          shine = pow(max(dot(reflect(-light, normal), vView),0.0),40.0)*0.8;
        } else if (uStyle == 3 || uStyle == 7) {
          pattern = sin(vPosition.y*24.0 + n*9.0)*0.3+0.55;
          pattern += fbm(p*3.0)*0.18;
        } else if (uStyle == 4) {
          pattern = smoothstep(0.38, 0.52, n);
          pattern += fbm(p*6.0)*0.15;
        } else if (uStyle == 5) {
          pattern = sin(vPosition.y*80.0+n*3.0)*0.07 + n*0.5;
          shine = pow(max(dot(reflect(-light, normal),vView),0.0),18.0)*1.5;
        } else if (uStyle == 6) {
          vec2 grid = vUv*vec2(28.0,16.0);
          vec2 cell = fract(grid);
          float edges = step(0.06, cell.x)*step(0.06,cell.y);
          pattern = hash(vec3(floor(grid),uSeed));
          diffuse *= edges;
          shine = pow(max(dot(reflect(-light,normal),vView),0.0),24.0)*2.0*pattern;
        } else if (uStyle == 8) {
          pattern = smoothstep(0.25,0.8,n);
          shine = pow(max(dot(reflect(-light,normal),vView),0.0),32.0);
          glow += fresnel*0.35;
        } else {
          pattern = n*0.35;
          glow = fresnel*0.6;
        }
        vec3 base = mix(uSecondary, uColor, clamp(pattern,0.0,1.0));
        vec3 col = base * (0.22+diffuse*1.4) + uColor*(fresnel*0.16+glow*0.35) + vec3(shine);
        gl_FragColor = vec4(col,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
}

export function createAtmosphere(color: string, intensity = 0.7) {
  return new ShaderMaterial({
    vertexShader: sphereVertex,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uColor: { value: new Color(color) }, uIntensity: { value: intensity } },
    fragmentShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      uniform vec3 uColor;
      uniform float uIntensity;
      void main() {
        float rim = pow(1.0-max(dot(normalize(vNormal),normalize(vView)),0.0), 3.2);
        gl_FragColor = vec4(uColor * 1.8, rim * uIntensity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
}

// Artwork remains attached to the rotating sphere on both hemispheres.
// Rear X is reversed so the exterior artwork is upright rather than mirrored.
export function createAlbumSurface(cover: Texture) {
  return new ShaderMaterial({
    vertexShader: sphereVertex,
    uniforms: { uCover: { value: cover }, uLight: { value: new Vector3(-0.4, 0.6, 1).normalize() } },
    fragmentShader: `
      varying vec3 vPosition;
      varying vec3 vNormal;
      varying vec3 vView;
      uniform sampler2D uCover;
      uniform vec3 uLight;
      void main() {
        vec2 frontUv = vPosition.xy * 0.47 + 0.5;
        vec2 backUv = vec2(-vPosition.x, vPosition.y) * 0.47 + 0.5;
        vec3 frontCover = texture2D(uCover, clamp(frontUv,0.01,0.99)).rgb;
        vec3 backCover = texture2D(uCover, clamp(backUv,0.01,0.99)).rgb;
        vec3 cover = mix(backCover, frontCover, smoothstep(-0.08, 0.08, vPosition.z));
        float light = max(dot(normalize(vNormal),uLight),0.0);
        float rim = pow(1.0-max(dot(normalize(vNormal),normalize(vView)),0.0),4.0);
        float limb = 0.55+0.45*sqrt(max(dot(normalize(vNormal),normalize(vView)),0.0));
        vec3 color = cover*(0.48+light*0.55)*limb + vec3(0.73,0.42,0.13)*rim*0.45;
        gl_FragColor = vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
}

export function createRadialTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const context = canvas.getContext('2d')!
  const gradient = context.createRadialGradient(64,64,0,64,64,64)
  gradient.addColorStop(0, 'rgba(255,255,255,0.8)')
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.35)')
  gradient.addColorStop(0.65, 'rgba(255,255,255,0.07)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = gradient
  context.fillRect(0,0,128,128)
  return canvas
}
