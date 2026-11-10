// Shared illustrated material + palette. Every scene material goes through toon().
// The look: flat colour fields cut into three bands with brushy, wobbling edges,
// shadows that shift hue instead of going grey (warm light, blue-violet shade), a warm
// rim light, and a faint world-space brush grain so surfaces feel painted, not plastic.
// The band colours are shared uniforms, so world.setMood() can push the whole palette
// from a bright afternoon toward a surreal dusk as the building falls.
import * as THREE from 'three';

let gradient = null;
// Smooth ramp: the bands are cut in the shader, so the gradient only has to say how lit.
export function toonGradient() {
  if (gradient) return gradient;
  const n = 32, data = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    const t = THREE.MathUtils.clamp((x - 0.42) / 0.34, 0, 1);
    data[i] = Math.round(t * t * (3 - 2 * t) * 255);
  }
  gradient = new THREE.DataTexture(data, n, 1, THREE.RedFormat);
  gradient.minFilter = gradient.magFilter = THREE.LinearFilter;
  gradient.needsUpdate = true;
  return gradient;
}

// Shared uniforms (mutated by world.setMood; uTime advanced by main).
export const ILL = {
  uShade: { value: new THREE.Color('#5b62a8') },     // hue the shadows lean toward
  uShadeMix: { value: 0.28 },
  uLightTint: { value: new THREE.Color('#fff3dc') },
  uRim: { value: new THREE.Color('#ffdca8') },
  uRimAmt: { value: 0.3 },
  uBand: { value: new THREE.Vector2(0.62, 1.22) },  // shadow→mid, mid→lit thresholds
  uGlassA: { value: new THREE.Color('#5d86a8') },
  uGlassB: { value: new THREE.Color('#2e3658') },
  uTime: { value: 0 },
  uTexel: { value: 0.07 },                           // world size of one "painted pixel" (m)
};

const VERT_HEAD = 'varying vec3 vIllPos;\nuniform float uTime;\nuniform float uSway;\n';
const VERT_BODY = `
  vec4 illW = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    illW = instanceMatrix * illW;
  #endif
  vIllPos = (modelMatrix * illW).xyz;
`;
// wind: displace in world space, more the higher above the ground (leaves, grass, flowers)
const VERT_SWAY = `
  vec4 swW = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    swW = instanceMatrix * swW;
  #endif
  swW = modelMatrix * swW;
  float swH = max(0., swW.y);
  swW.x += sin(uTime * 1.3 + swW.x * .35 + swW.z * .21) * uSway * swH;
  swW.z += sin(uTime * 1.05 + swW.z * .3 + swW.x * .12 + 1.7) * uSway * .7 * swH;
  vIllPos = swW.xyz;
  mvPosition = viewMatrix * swW;
  gl_Position = projectionMatrix * mvPosition;
`;

const FRAG_HEAD = `
varying vec3 vIllPos;
uniform vec3 uShade; uniform float uShadeMix; uniform vec3 uLightTint;
uniform vec3 uRim; uniform float uRimAmt; uniform vec2 uBand;
uniform vec3 uGlassA; uniform vec3 uGlassB;
uniform float uTime; uniform float uTexel;
float illHash(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float illNoise(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
  return mix(mix(mix(illHash(i), illHash(i + vec3(1,0,0)), f.x), mix(illHash(i + vec3(0,1,0)), illHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(illHash(i + vec3(0,0,1)), illHash(i + vec3(1,0,1)), f.x), mix(illHash(i + vec3(0,1,1)), illHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
// ordered (Bayer) dither, the classic pixel-art way of stepping between two shades
float illBayer2(vec2 a){ a = floor(a); return fract(dot(a, vec2(.5, a.y * .75))); }
float illBayer4(vec2 a){ return illBayer2(.5 * a) * .25 + illBayer2(a); }
`;

const FRAG_BODY = `
{
  vec3 base = diffuseColor.rgb;
  #ifdef ILL_GLASS
    // graphic glass: a slate-blue sweep reflecting the sky, with two diagonal glints
    float gy = fract(vIllPos.y * .07 + vIllPos.x * .015);
    base = mix(uGlassA, uGlassB, smoothstep(.15, .85, gy));
    float glint = step(.93, fract((vIllPos.x + vIllPos.y * .8) * .22)) + step(.975, fract((vIllPos.x + vIllPos.y * .8) * .22 + .05));
    base = mix(base, vec3(.85, .93, 1.), clamp(glint, 0., 1.) * .6);
  #endif
  // pigment drift: big, soft warm/cool shifts across a surface, like uneven gouache
  float nL = illNoise(vIllPos * .09 + 7.3);
  base *= mix(vec3(1.045, .995, .94), vec3(.955, .995, 1.05), nL);
  float bl = max(dot(base, vec3(.299, .587, .114)), .003);
  float lit = dot(outgoingLight, vec3(.299, .587, .114)) / bl;
  // slow cloud shadows drifting over the courtyard
  float cloud = smoothstep(.52, .74, illNoise(vec3(vIllPos.xz * .017 + uTime * vec2(.011, .004), uTime * .003)));
  lit *= 1. - cloud * .26;
  // "painted pixels": up close, the brush noise and the band edges snap to a world-space texel
  // grid and step through an ordered dither, so light falls in crisp pixel-art steps that are
  // glued to the surface (they never swim as the camera moves). Further away they fade into
  // soft painted bands so nothing shimmers.
  float dist = length(vViewPosition);
  float pix = (1. - smoothstep(5., 16., dist)) * .85;
  vec3 wn = normalize((vec4(normal, 0.) * viewMatrix).xyz);
  vec3 an = abs(wn);
  vec2 pl = an.y > max(an.x, an.z) ? vIllPos.xz : (an.x > an.z ? vIllPos.zy : vIllPos.xy);
  vec2 tcell = floor(pl / uTexel);
  vec3 sp = floor(vIllPos / uTexel) * uTexel;
  float bay = illBayer4(tcell);
  // brush dabs: short strokes (~30 cm) laid on the surface in patches of different directions,
  // each a few stepped tones of the same colour, like gouache applied with a flat brush.
  // Fixed to the surface (no shimmer) and faded out in the distance.
  {
    vec2 bp = pl * 3.2;
    float ang = illHash(vec3(floor(bp * 0.4), 3.7)) * 3.14159;
    float ca = cos(ang), sa = sin(ang);
    vec2 q = vec2(ca * bp.x - sa * bp.y, sa * bp.x + ca * bp.y);
    q.x *= 0.32;
    float dab = illNoise(vec3(q, 2.0)) * 0.7 + illNoise(vec3(q * 2.3, 5.0)) * 0.3;
    float strokeFade = 1. - smoothstep(22., 55., dist);
    base *= 1. + (floor(dab * 4.) / 3. - .5) * .085 * strokeFade;
  }
  float n1 = illNoise(mix(vIllPos, sp, pix) * vec3(1.7, 5.5, 1.7));
  float n2 = illNoise(mix(vIllPos, sp, pix) * 9.0 + 3.1);
  float t = lit + (n1 - .5) * .2 + (n2 - .5) * .07;
  float td = t + (bay - .5) * .16;
  float b1 = mix(smoothstep(uBand.x - .08, uBand.x + .08, t), step(uBand.x, td), pix);
  float b2 = mix(smoothstep(uBand.y - .09, uBand.y + .09, t), step(uBand.y, td), pix);
  vec3 shade = mix(base * .64, base * uShade * 1.25, uShadeMix);
  vec3 col = mix(shade, base * .94, b1);
  col = mix(col, base * uLightTint * 1.1, b2);
  // warm rim, mostly on the shadow side so forms separate from what is behind them
  vec3 vd = normalize(vViewPosition);
  float fres = 1. - abs(dot(normal, -vd));
  float rim = smoothstep(.6, .75, fres + (n2 - .5) * .1) * uRimAmt * (1. - b2 * .55);
  col = mix(col, uRim * max(base, vec3(.35)) * 1.5, rim * .5);
  // fine pigment grain, per painted pixel up close
  col *= 1. + (illNoise(mix(vIllPos, sp + .5 * uTexel, pix) * 23.) - .5) * .06;
  #ifdef ILL_GLASS
    col = mix(col, base, .45);
  #endif
  outgoingLight = col + totalEmissiveRadiance;
}
`;

function illustrate(shader, glass, sway) {
  Object.assign(shader.uniforms, ILL);
  shader.uniforms.uSway = { value: sway };
  shader.vertexShader = VERT_HEAD + shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_BODY + (sway ? VERT_SWAY : ''));
  shader.fragmentShader = (glass ? '#define ILL_GLASS\n' : '') + FRAG_HEAD +
    shader.fragmentShader.replace('#include <opaque_fragment>', FRAG_BODY + '#include <opaque_fragment>');
}

// opts.glass: graphic glass; opts.sway: wind amount (metres of drift per metre of height)
export function toon(color, opts = {}) {
  const { glass = false, sway = 0, ...rest } = opts;
  const m = new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...rest });
  m.onBeforeCompile = (s) => illustrate(s, glass, sway);
  m.customProgramCacheKey = () => (glass ? 'ill-glass' : sway ? `ill-sway${sway}` : 'ill');
  return m;
}

// "Weimar wobble" palette. Most of the world sits in warm, mid-saturation naturals
// (butter plaster, terracotta, sage, warm stone); saturation is spent on what matters:
// the workers' safety orange and cobalt, and the scaffold's periwinkle steel.
export const PAL = {
  ink: '#2a2140',
  paper: '#fbf1dc',
  cream: '#f6e6c4',
  plaster: '#f1d48e',
  terracotta: '#c2543a',
  terracottaDark: '#9c3f2e',
  frame: '#3b4a66',
  copper: '#6fa596',
  stone: '#d8c6a6',
  leafDeep: '#2f5d50',
  leaf: '#4f8a5b',
  leafMid: '#86ad5c',
  leafLight: '#c6cf6f',
  olive: '#8f9a48',
  blossom: '#e7a0a8',
  ochre: '#d99a3e',
  bark: '#6b4a3f',
  red: '#d9573b',
  pink: '#e7a0a8',
  yellow: '#e8b23a',
  white: '#fbf3e2',
  violet: '#8a7fc0',
  orange: '#f07a2a',
  cobalt: '#3456a8',
  teal: '#2f7f7a',
  steel: '#7f93d2',
};
