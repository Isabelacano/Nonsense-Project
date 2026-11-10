// Procedural canvas textures: no image assets are needed to run the prototype.
import * as THREE from 'three';

const INK = '#2a2140';
const RED = '#d9573b';
const PAPER = '#fbf1dc';

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function rand(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Hand-drawn setts: warm sandstone in a soft grey-plum grout, with wobbly ink contours.
export function pavingTexture() {
  const [c, g] = canvas(1024);
  const r = rand(7);
  g.fillStyle = '#a08a80';
  g.fillRect(0, 0, 1024, 1024);
  const n = 12, s = 1024 / n;
  g.lineJoin = 'round';
  for (let y = 0; y < n; y++) {
    const off = (y % 2) * s * 0.5;
    for (let x = -1; x < n; x++) {
      const v = r();
      g.fillStyle = v < 0.12 ? '#cbb596' : v < 0.16 ? '#c9a79a' : v < 0.82 ? '#d9c6a7' : '#e5d5b8';
      const px = x * s + off + 4, py = y * s + 4, w = s - 8, h = s - 8;
      // rounded, slightly irregular sett
      g.beginPath();
      g.roundRect(px + (r() - 0.5) * 3, py + (r() - 0.5) * 3, w + (r() - 0.5) * 4, h + (r() - 0.5) * 4, 9 + r() * 6);
      g.fill();
      g.strokeStyle = 'rgba(42,33,64,0.42)';
      g.lineWidth = 2.2;
      g.stroke();
      // a lighter highlight crescent on the upper-left, then a few pencil marks
      g.strokeStyle = 'rgba(255,240,225,0.4)';
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(px + 10, py + h * 0.55); g.quadraticCurveTo(px + 8, py + 8, px + w * 0.5, py + 7); g.stroke();
      g.strokeStyle = 'rgba(42,33,64,0.2)';
      g.lineWidth = 1.2;
      for (let m = 0; m < 2; m++) {
        const mx = px + r() * w, my = py + r() * h;
        g.beginPath(); g.moveTo(mx, my); g.lineTo(mx + 6 + r() * 8, my + 2 - r() * 4); g.stroke();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Lawn: sage base with dark green and straw brush strokes.
export function lawnTexture() {
  const [c, g] = canvas(512);
  const r = rand(3);
  g.fillStyle = '#79a957';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(190,205,120,0.25)' : 'rgba(60,100,70,0.2)';
    g.beginPath(); g.arc(r() * 512, r() * 512, 10 + r() * 30, 0, Math.PI * 2); g.fill();
  }
  g.lineCap = 'round';
  for (let i = 0; i < 800; i++) {
    const x = r() * 512, y = r() * 512, h = 5 + r() * 8;
    g.strokeStyle = r() < 0.55 ? 'rgba(50,85,55,0.4)' : 'rgba(215,225,140,0.55)';
    g.lineWidth = 1.3;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 1.5, y - h * 0.6, x + (r() - 0.5) * 4, y - h); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Debris netting that hangs on some scaffold faces.
export function netTexture() {
  const [c, g] = canvas(64);
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.lineWidth = 2;
  for (let i = 0; i <= 64; i += 8) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(64, i); g.stroke();
  }
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 6);
  return t;
}

export function dustTexture() {
  const [c, g] = canvas(128);
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grd.addColorStop(0, 'rgba(255,255,255,0.95)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.beginPath();
  // Lumpy cartoon cloud silhouette.
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 5) {
    g.moveTo(64, 64);
    g.arc(64 + Math.cos(a) * 22, 64 + Math.sin(a) * 22, 38, 0, Math.PI * 2);
  }
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const fontStack = '"Bagel Fat One","Arial Rounded MT Bold","Arial Black",sans-serif';

// Sound-effect lettering: chunky rounded letters, ink outline, paper halo, a slight wobble.
export function wordTexture(text, { fill = RED, ink = INK, size = 120, halo = PAPER } = {}) {
  const [m, mg] = canvas(8);
  mg.font = `${size}px ${fontStack}`;
  const w = Math.ceil(mg.measureText(text).width + size * 0.6);
  const h = Math.ceil(size * 1.5);
  const [c, g] = canvas(w, h);
  g.font = `${size}px ${fontStack}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  // letters hop up and down and lean a little, like hand-cut paper
  const glyphs = [...text];
  const widths = glyphs.map(ch => g.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0);
  const draw = (pass) => {
    let x = w / 2 - total / 2;
    glyphs.forEach((ch, i) => {
      g.save();
      g.translate(x + widths[i] / 2, h / 2 + Math.sin(i * 1.9) * size * 0.06);
      g.rotate(Math.sin(i * 2.7) * 0.08);
      pass(ch);
      g.restore();
      x += widths[i];
    });
  };
  g.fillStyle = ink; draw((ch) => g.fillText(ch, size * 0.05, size * 0.09)); // offset shadow
  g.strokeStyle = halo; g.lineWidth = size * 0.26; draw((ch) => g.strokeText(ch, 0, 0));
  g.strokeStyle = ink; g.lineWidth = size * 0.11; draw((ch) => g.strokeText(ch, 0, 0));
  g.fillStyle = fill; draw((ch) => g.fillText(ch, 0, 0));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.aspect = w / h;
  return t;
}

export function symbolTexture(kind) {
  const [c, g] = canvas(256);
  g.lineJoin = 'round'; g.lineCap = 'round';
  const outline = (fn, fill) => {
    g.strokeStyle = PAPER; g.lineWidth = 34; fn(); g.stroke();
    g.strokeStyle = INK; g.lineWidth = 14; fn(); g.stroke();
    if (fill) { g.fillStyle = fill; fn(); g.fill(); }
  };
  if (kind === 'drop') {
    const path = () => {
      g.beginPath();
      g.moveTo(128, 30);
      g.bezierCurveTo(170, 100, 200, 140, 200, 170);
      g.arc(128, 170, 72, 0, Math.PI, false);
      g.bezierCurveTo(56, 140, 86, 100, 128, 30);
      g.closePath();
    };
    outline(path, '#9fd0ff');
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath(); g.ellipse(104, 160, 14, 26, -0.4, 0, Math.PI * 2); g.fill();
  } else if (kind === 'vein') {
    // Classic anime/comic anger mark: four bulging arcs.
    g.strokeStyle = RED; g.lineWidth = 26;
    for (let q = 0; q < 4; q++) {
      g.save();
      g.translate(128, 128);
      g.rotate(q * Math.PI / 2);
      g.beginPath();
      g.arc(52, 52, 40, Math.PI, Math.PI * 1.5);
      g.stroke();
      g.restore();
    }
  } else if (kind === 'star') {
    const path = () => {
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 46 : 110, a = -Math.PI / 2 + i * Math.PI / 5;
        g.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r);
      }
      g.closePath();
    };
    outline(path, '#ffd23a');
  } else if (kind === 'steam') {
    const path = () => {
      g.beginPath();
      g.arc(100, 150, 50, 0, Math.PI * 2);
      g.moveTo(206, 120); g.arc(160, 120, 46, 0, Math.PI * 2);
      g.moveTo(175, 70); g.arc(130, 70, 45, 0, Math.PI * 2);
    };
    outline(path, '#f4f1ea');
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.userData.aspect = 1;
  return t;
}

// Painted sky: soft aqua zenith to a cream-peach horizon in a few flat bands, posterised
// two-tone clouds with ink contours, and a ringed sun over the roofline. `chaos` bends it.
export function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color('#8fcfd8') },
      mid: { value: new THREE.Color('#fbe3c4') },
      bottom: { value: new THREE.Color('#f0d0b4') },
      cloud: { value: new THREE.Color('#fff8ec') },
      cloudShade: { value: new THREE.Color('#e9cdd6') },
      ink: { value: new THREE.Color('#6a5a78') },
      sunCol: { value: new THREE.Color('#ffe08a') },
      sunDir: { value: new THREE.Vector3(0.32, 0.36, -1).normalize() },
      chaos: { value: 0 },
    },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform vec3 cloud; uniform vec3 cloudShade; uniform vec3 ink;
      uniform vec3 sunCol; uniform vec3 sunDir; uniform float chaos; varying vec3 vP;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
      float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 5; i++){ v += a * noise(p); p *= 2.03; a *= .5; } return v; }
      void main(){
        float h = vP.y;
        // stepped gradient: a few flat bands instead of a smooth airbrush ramp
        float g = smoothstep(0.0, 0.62, h);
        float gs = floor(g * 7. + noise(vP.xz * 3.) * .35) / 7.;
        vec3 c = h > 0. ? mix(mid, top, mix(g, gs, .55)) : mix(mid, bottom, smoothstep(0.0, -0.2, h));
        // ringed sun: a flat disc with concentric halo bands
        float d = acos(clamp(dot(vP, sunDir), -1., 1.));
        float rings = step(.5, fract(d * 26.)) * (1. - smoothstep(.12, .32, d)) * .12;
        c = mix(c, mix(sunCol, vec3(1.), .4), rings);
        c = mix(c, sunCol, 1. - smoothstep(.075, .08, d));
        c = mix(c, ink, (smoothstep(.074, .08, d) - smoothstep(.08, .086, d)) * .8);
        if (h > 0.02) {
          vec2 p = vP.xz / (h + 0.25) * 1.6;
          p.x += chaos * sin(p.y * 1.7) * .4;   // the sky starts to melt as things fall apart
          float n = fbm(p + vec2(3.1, 1.7));
          float band = smoothstep(0.02, 0.18, h) * (1. - smoothstep(0.55, 0.8, h));
          float th = 0.53 - band * 0.05;
          float body = smoothstep(th, th + 0.012, n);
          float shade = smoothstep(th + 0.07, th + 0.055, n) * body;
          vec3 cc = mix(cloud, cloudShade, shade);
          c = mix(c, cc, body * band);
          float line = (smoothstep(th - 0.006, th, n) - smoothstep(th + 0.002, th + 0.008, n)) * band;
          c = mix(c, ink, line * 0.4);
        }
        gl_FragColor = vec4(c, 1.);
        #include <colorspace_fragment>
      }`,
  });
}
