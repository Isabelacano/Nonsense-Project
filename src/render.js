// Painted rendering pipeline:
//   1. colour pass (painterly cel shading with world-space texel dithering, HDR, MSAA)
//   2. normal + depth pass: all solid geometry; alpha marks "ink" objects (workers, scaffold,
//      flying debris) with 1 and painted objects (architecture, ground, furniture) with 0.5
//   3. composite: stable depth-based ambient occlusion and contact shadows for everything,
//      dark coloured outlines only round ink objects, soft same-hue form lines on painted
//      objects that fade with distance, tone curve, split toning, paper texture, vignette.
// Nothing here moves on its own (no line boil, no screen-space hatching), so edges stay put
// when the camera moves. Layer 1 holds things that are drawn but never lined or occluded
// (sky, sprites, dust, flowers, grass, netting, leaf cards).
import * as THREE from 'three';

// Mark a mesh hierarchy as an ink object (gets dark outlines in the composite).
export function markInk(obj) { obj.traverse((o) => { o.userData.ink = true; }); return obj; }

const vert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`;

const frag = `
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tNormal;
uniform vec2 resolution;
uniform float pixelRatio;
uniform float near;
uniform float far;
uniform vec3 inkColor;
uniform vec3 paperColor;
uniform float exposure;
uniform vec3 shadowTone;
uniform vec3 highTone;
uniform vec3 vignetteTone;
varying vec2 vUv;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float linDepth(vec2 uv){
  float z = texture2D(tDepth, uv).x;
  return (near * far) / (far - z * (far - near));
}

void main(){
  vec2 px = pixelRatio / resolution;
  vec4 c0 = texture2D(tNormal, vUv);
  float solid = step(.2, c0.a);
  float d = linDepth(vUv);
  vec3 n0 = c0.xyz * 2. - 1.;

  // --- edges -------------------------------------------------------------------
  // Look at the four neighbours (one pixel away). An outline sits on the far side of a depth
  // step whose near side is an ink object, so lines wrap *round* characters and scaffold.
  float inkLine = 0., formLine = 0., silP = 0.;
  vec2 offs[4]; offs[0] = vec2(px.x, 0.); offs[1] = vec2(-px.x, 0.); offs[2] = vec2(0., px.y); offs[3] = vec2(0., -px.y);
  for (int i = 0; i < 4; i++) {
    vec2 o = offs[i];
    vec4 cn = texture2D(tNormal, vUv + o);
    float dn = linDepth(vUv + o);
    float closer = (d - dn) / max(d, 1.);
    float isInk = step(.75, cn.a);
    float step_ = smoothstep(.035, .09, closer);
    inkLine = max(inkLine, step_ * isInk);
    // creases inside an ink object (an arm in front of a belly, a tube crossing a deck)
    float inside = step(.75, c0.a) * isInk * (1. - step_);
    inkLine = max(inkLine, smoothstep(.65, 1.1, 1. - dot(n0, cn.xyz * 2. - 1.)) * inside * .55);
    // painted objects: a soft line at silhouettes and creases, in their own (darker) colour
    float painted = step(.2, cn.a) * (1. - isInk);
    silP = max(silP, step_ * painted);
    formLine = max(formLine, smoothstep(.55, 1.05, 1. - dot(n0, cn.xyz * 2. - 1.)) * painted * solid * (1. - step(.75, c0.a)));
  }
  float near_ = 1. - smoothstep(14., 45., d);      // painted lines only up close, so detail never moirés
  formLine *= near_ * .55;
  silP *= (1. - smoothstep(25., 90., d)) * .5;
  inkLine *= 1. - smoothstep(60., 160., d) * .7;

  // --- ambient occlusion -------------------------------------------------------
  // A fixed ring of depth samples: neighbours that sit in front of this pixel (within a few
  // metres) darken it. No noise, so it does not crawl; gives contact shadows and soft creases.
  float ao = 0.;
  if (d < far * .8 && solid > .5) {
    float r = clamp(260. / d, 4., 26.) * pixelRatio;
    for (int i = 0; i < 10; i++) {
      float a = float(i) * 2.39996 + .5;
      float rr = r * (.35 + .65 * fract(float(i) * .618));
      vec2 o = vec2(cos(a), sin(a)) * rr / resolution;
      float ds = linDepth(vUv + o);
      float delta = d - ds;
      ao += smoothstep(.05, .55, delta) * (1. - smoothstep(2.2, 5.5, delta));
    }
    ao /= 10.;
  }

  // --- colour ------------------------------------------------------------------
  vec3 col = texture2D(tColor, vUv).rgb;
  // AO as coloured shade (cool, like painted shadow), not as grey
  col = mix(col, col * shadowTone * .95, ao * .75);
  // hue-preserving shoulder (keeps saturated paint saturated instead of washing it out)
  col *= exposure;
  col /= 1. + max(col.r, max(col.g, col.b)) * .22;
  col = pow(max(col, 0.), vec3(1. / 2.2));
  float lum = dot(col, vec3(.299, .587, .114));
  // a touch of gouache body + split toning: blue-violet into the darks, warmth on the lights
  col = mix(vec3(lum), col, 1.06);
  col = mix(col, col * shadowTone * 1.35, (1. - smoothstep(.08, .5, lum)) * .2);
  col += highTone * smoothstep(.55, 1., lum) * .06;

  // lines: ink round characters and scaffold (dark, picking up the local hue), and painted
  // form lines on architecture that are just a darker version of the surface itself
  col = mix(col, col * .62, max(formLine, silP));
  vec3 ink = mix(inkColor, col * .35, .35);
  col = mix(col, ink, clamp(inkLine, 0., 1.) * .9);

  // paper: very fine grain + soft fibre blotches (fixed to the screen like the paper itself)
  vec2 fc = gl_FragCoord.xy / pixelRatio;
  float g = hash(floor(fc)) - .5;
  float fib = noise(fc * .012) * .6 + noise(fc * .05) * .4;
  col *= 1. + g * .03;
  col = mix(col, col * paperColor * 1.08, (fib - .5) * .22);

  // coloured vignette
  vec2 q = vUv - .5;
  col = mix(col, col * vignetteTone * 1.4, clamp(dot(q, q) * 1.2, 0., 1.));
  gl_FragColor = vec4(col, 1.);
}`;

export class IllustratedRenderer {
  constructor(renderer, scene, camera) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    // alpha carries the ink flag; NoBlending + transparent keeps three from forcing alpha to 1
    const nm = (opacity, side = THREE.FrontSide) => new THREE.MeshNormalMaterial({ transparent: true, blending: THREE.NoBlending, opacity, side });
    this.normalInk = nm(1);
    this.normalPaint = nm(0.5);
    this.normalPaint2 = nm(0.5, THREE.DoubleSide);   // leaves, ferns
    this.colorRT = null; this.normalRT = null;
    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, depthTest: false, depthWrite: false, toneMapped: false,
      uniforms: {
        tColor: { value: null }, tDepth: { value: null }, tNormal: { value: null },
        resolution: { value: new THREE.Vector2() }, pixelRatio: { value: 1 },
        near: { value: camera.near }, far: { value: camera.far },
        inkColor: { value: new THREE.Color('#2a2140') }, paperColor: { value: new THREE.Color('#fbf1dc') },
        exposure: { value: 1.0 },
        shadowTone: { value: new THREE.Color('#5b62a8') }, highTone: { value: new THREE.Color('#ffd9a0') },
        vignetteTone: { value: new THREE.Color('#5a4a6a') },
      },
    });
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat));
    this._swapped = [];
  }

  setSize(w, h, dpr) {
    const W = Math.floor(w * dpr), H = Math.floor(h * dpr);
    this.colorRT?.dispose(); this.normalRT?.dispose();
    const depthTexture = new THREE.DepthTexture(W, H);
    depthTexture.type = THREE.UnsignedIntType;
    this.colorRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
    this.normalRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.UnsignedByteType, depthTexture });
    const u = this.mat.uniforms;
    u.tColor.value = this.colorRT.texture;
    u.tDepth.value = depthTexture;
    u.tNormal.value = this.normalRT.texture;
    u.resolution.value.set(W, H);
    u.pixelRatio.value = dpr;
  }

  render() {
    const r = this.renderer, s = this.scene, c = this.camera;
    // colour
    r.setRenderTarget(this.colorRT);
    r.render(s, c);
    // normals + depth (layer 0), every mesh switched to the ink or paint normal material
    const bg = s.background, fog = s.fog;
    s.background = null; s.fog = null;
    const sw = this._swapped;
    s.traverseVisible((o) => {
      if (!o.isMesh || !o.layers.isEnabled(0)) return;
      sw.push(o, o.material);
      o.material = o.userData.ink ? this.normalInk : o.material.side === THREE.DoubleSide ? this.normalPaint2 : this.normalPaint;
    });
    c.layers.disable(1);
    r.setRenderTarget(this.normalRT);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(s, c);
    c.layers.enable(1);
    for (let i = 0; i < sw.length; i += 2) sw[i].material = sw[i + 1];
    sw.length = 0;
    s.background = bg; s.fog = fog;
    // composite to screen
    r.setRenderTarget(null);
    r.render(this.quadScene, this.quadCam);
  }
}
