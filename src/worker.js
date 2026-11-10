// Construction workers: procedurally built cartoon characters with thick rubber-hose limbs,
// hand-drawn faces and spring-driven, overshooting poses. One shared body and one class serve
// the player's worker and every colleague who turns up later; they differ by VARIANT (clothes,
// facial hair, accessories), by personality (timing, intensity) and by their input.
// createWorkerModel() is the only place that knows about the mesh — replace it with a
// rigged GLTF later and keep the same joint names.
import * as THREE from 'three';
import { CFG } from './config.js';
import { toon, PAL } from './toon.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Noodle, tubeGeometry } from './shapes.js';
import { markInk } from './render.js';

const W = CFG.worker;
const INK = '#2a2140';

// One shared body for the whole crew: short, stocky and pear-shaped, with thick fleshy arms,
// stumpy legs in big boots, mitten fists, a big round head and curly hair. Everybody is built
// from these proportions; only clothing colours, facial hair, glasses, small accessories and a
// few percent of overall size differ, so they read as one crew from the same cartoon.
const BASE = {
  tw: 0.55, th: 0.8,          // torso half-width and height (pear)
  l1: 0.22, l2: 0.2,          // short sturdy legs
  a1: 0.3, a2: 0.3,           // short, thick arms
  head: 0.5, jaw: 0.3,        // big round head; jaw = how much the lower face widens
  nose: 0.3, arm: 0.12, fore: 0.14, leg: 0.16, fist: 0.16,
};

// The crew, in order of arrival. Bernd (the player) gets the most exaggerated face:
// a wide jaw, a huge nose, curled-horn moustache tips and a toothy smirk.
export const VARIANTS = [
  { name: 'Bernd', hat: '#e8b23a', vest: '#f07a2a', shirt: '#3456a8', trousers: '#2f3f6e', skin: '#f0b38d', hair: '#5a3226', facial: 'horns', jaw: 0.64, nose: 0.42, head: 0.55, grin: true, scale: 1.03, voice: 1.0 },
  { name: 'Kurt', hat: '#f1ece0', vest: '#e8b23a', shirt: '#b8503c', trousers: '#4d5a3a', skin: '#e3a27e', hair: '#3a2a2a', facial: 'walrus', scale: 0.97, voice: 0.78 },
  { name: 'Uschi', hat: '#d9573b', vest: '#f07a2a', shirt: '#2f7f7a', trousers: '#3b4a66', skin: '#c98a68', hair: '#2e1d1a', facial: 'none', glasses: true, bun: true, scale: 0.95, voice: 1.4 },
  { name: 'Jens', hat: '#f07a2a', vest: '#e8b23a', shirt: '#7d6fb0', trousers: '#3456a8', skin: '#e8a882', hair: '#b8772e', facial: 'beard', scale: 1.05, voice: 0.66 },
  { name: 'Heike', hat: '#3456a8', vest: '#e8b23a', shirt: '#b8503c', trousers: '#4a3b4f', skin: '#f3c4a0', hair: '#c45a2a', facial: 'none', earrings: true, scale: 0.96, voice: 1.3 },
  { name: 'Ralf', hat: '#e8b23a', vest: '#f07a2a', shirt: '#55613a', trousers: '#2f3f6e', skin: '#d8956f', hair: '#8a8a8a', facial: 'stubble', pencil: true, scale: 1.02, voice: 0.85 },
  { name: 'Timo', hat: '#2f7f7a', vest: '#f07a2a', shirt: '#e8b23a', trousers: '#6b3552', skin: '#f3c4a0', hair: '#c9894a', facial: 'none', freckles: true, scale: 0.94, voice: 1.6 },
  { name: 'Dörte', hat: '#f1ece0', vest: '#f07a2a', shirt: '#3456a8', trousers: '#55613a', skin: '#e9b08a', hair: '#6e4a2e', facial: 'none', glasses: true, scale: 0.97, voice: 1.2 },
  { name: 'Olaf', hat: '#d9573b', vest: '#e8b23a', shirt: '#2f3f6e', trousers: '#4a3b4f', skin: '#f0b38d', hair: '#e0c070', facial: 'walrus', cigarette: true, scale: 1.04, voice: 0.72 },
  { name: 'Mehmet', hat: '#e8b23a', vest: '#f07a2a', shirt: '#8a4a5a', trousers: '#3b4a66', skin: '#c08a60', hair: '#1e1a1a', facial: 'beard', scale: 1.0, voice: 0.92 },
];

// ---------- the hand-drawn face ----------
// Features are painted onto a canvas that wraps the front of the head: ink-dot eyes,
// thick brows, a mouth that can grin, gape, grit its teeth or go flat.
function drawFace(g, f, v, blink) {
  const S = 256;
  g.clearRect(0, 0, S, S);
  g.lineCap = 'round'; g.lineJoin = 'round';
  // canvas rows map to heights on the head: brows ~ +0.45r, eyes ~ +0.15r, mouth ~ -0.5r
  const cx = 128, ey = v.grin ? 104 : 112, sep = v.glasses ? 39 : (v.grin ? 46 : 38);
  const lx = f.lookX * 6, ly = -f.lookY * 5;
  // cheeks
  const blush = 0.18 + f.red * 0.6;
  g.fillStyle = `rgba(226, 92, 92, ${blush})`;
  for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * 58, 170, 17, 10, 0, 0, Math.PI * 2); g.fill(); }
  if (v.freckles) {
    g.fillStyle = 'rgba(150, 80, 50, .6)';
    for (const s of [-1, 1]) for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(cx + s * (46 + (i % 3) * 9), 160 + Math.floor(i / 3) * 9 + (i % 2) * 3, 2.6, 0, 7); g.fill(); }
  }
  // eyes
  const open = blink ? 0 : f.eye;
  for (const s of [-1, 1]) {
    const x = cx + s * sep;
    if (open < 0.12) {
      // closed: a soft curve (smug if smiling, pinched if angry)
      g.strokeStyle = INK; g.lineWidth = 6;
      g.beginPath();
      if (f.smile > 0.4) g.arc(x, ey + 6, 11, Math.PI * 1.15, Math.PI * 1.85);
      else g.moveTo(x - 11, ey), g.quadraticCurveTo(x, ey + 6, x + 11, ey);
      g.stroke();
    } else if (open > 1.25) {
      // shock: huge white eyes with pin-prick pupils
      const r = 18 + (open - 1.25) * 18;
      g.fillStyle = '#fffaf0'; g.strokeStyle = INK; g.lineWidth = 5;
      g.beginPath(); g.ellipse(x, ey, r, r * 1.15, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = INK; g.beginPath(); g.arc(x + lx * 0.6, ey + ly * 0.6, 4.5, 0, 7); g.fill();
    } else {
      // big white eyes with an ink rim and a fat pupil that looks around
      const big = v.grin ? 1.18 : 1;
      const h = 26 * big * Math.max(0.3, open), w = 19 * big;
      g.fillStyle = '#fffaf0'; g.strokeStyle = INK; g.lineWidth = 5;
      g.beginPath(); g.ellipse(x, ey, w, h, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      g.save(); g.beginPath(); g.ellipse(x, ey, w - 2, h - 2, 0, 0, Math.PI * 2); g.clip();
      const pw = 9.5 * big, ph = Math.min(h - 3, 13 * big);
      g.fillStyle = INK;
      g.beginPath(); g.ellipse(x + lx * 1.4 - s * 1.5, ey + ly * 1.3 + 2, pw, ph, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(x + lx * 1.4 - s * 1.5 - 3, ey + ly * 1.3 - ph * 0.4, 3, 0, 7); g.fill();
      g.restore();
      // heavy lid for deadpan / sly / angry
      const lid = Math.max(f.lid, f.brow < -0.3 ? 0.35 : 0);
      if (lid > 0.05) {
        g.fillStyle = v.skin;
        const top = ey - h - 2, cut = top + (h * 2 + 4) * lid;
        g.beginPath();
        if (f.brow < -0.3) { g.moveTo(x - w - 3, top - 4); g.lineTo(x + w + 3, top - 4); g.lineTo(x + w + 3, cut + s * 7); g.lineTo(x - w - 3, cut - s * 7); }
        else { g.rect(x - w - 3, top - 4, w * 2 + 6, cut - top + 4); }
        g.closePath(); g.fill();
        g.strokeStyle = INK; g.lineWidth = 4.5;
        g.beginPath();
        if (f.brow < -0.3) { g.moveTo(x - w, cut - s * 7); g.lineTo(x + w, cut + s * 7); } else { g.moveTo(x - w, cut); g.lineTo(x + w, cut); }
        g.stroke();
      }
    }
    if (f.tears > 0.2) {
      g.fillStyle = 'rgba(120, 180, 230, .9)';
      g.beginPath(); g.ellipse(x + s * 6, ey + 26 + (performance.now() / 40 % 20), 4, 7, 0, 0, 7); g.fill();
    }
  }
  if (v.glasses) {
    g.strokeStyle = INK; g.lineWidth = 4;
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * sep, ey, 24, 22, 0, 0, Math.PI * 2); g.stroke(); }
    g.beginPath(); g.moveTo(cx - sep + 20, ey - 2); g.quadraticCurveTo(cx, ey - 9, cx + sep - 20, ey - 2); g.stroke();
  }
  // brows: thick, rounded, very mobile
  g.strokeStyle = v.hair; g.lineWidth = v.grin ? 21 : 15;
  for (const s of [-1, 1]) {
    const x = cx + s * sep, by = ey - (v.grin ? 46 : 40) - Math.max(0, f.eye - 1) * 14 - f.brow * 7;
    const inner = f.brow * 13, outer = -f.brow * 5;
    g.beginPath(); g.moveTo(x - s * 18, by - inner); g.quadraticCurveTo(x, by - 8 - (inner + outer) * 0.5, x + s * 19, by - outer + 2); g.stroke();
  }
  // mouth
  const my = v.facial === 'horns' ? 226 : v.facial === 'walrus' ? 230 : v.facial === 'beard' ? 208 : 212;
  const wob = f.wobble ? Math.sin(performance.now() / 45) * 3 : 0;
  g.strokeStyle = INK; g.lineWidth = 8;
  if (v.facial === 'stubble') {
    g.fillStyle = 'rgba(60, 50, 50, .35)';
    for (let i = 0; i < 70; i++) { const a = Math.random() * Math.PI, r = 40 + Math.random() * 34; g.beginPath(); g.arc(cx + Math.cos(a) * r * 1.1, 176 + Math.sin(a) * r * 0.9, 1.6, 0, 7); g.fill(); }
  }
  if (v.grin && f.smile > 0.5 && f.mouthO < 0.28 && f.teeth < 0.5 && f.lid < 0.45) {
    // the foreman's toothy smirk: a wide, lopsided D full of teeth
    const w = 36 + f.smile * 6;
    g.fillStyle = '#fffaf0';
    g.beginPath(); g.moveTo(cx - w, my - 8); g.quadraticCurveTo(cx + 4, my - 2, cx + w + 4, my - 12);
    g.quadraticCurveTo(cx + w * 0.6, my + 24, cx - 2, my + 20); g.quadraticCurveTo(cx - w * 0.8, my + 16, cx - w, my - 8);
    g.closePath(); g.fill(); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.moveTo(cx - w + 6, my + 3); g.quadraticCurveTo(cx, my + 8, cx + w - 2, my - 1);
    for (let i = -3; i <= 3; i++) { g.moveTo(cx + i * 10, my - 6); g.lineTo(cx + i * 10 + 1, my + 16 - Math.abs(i) * 2); }
    g.stroke();
    return;
  }
  if (f.teeth > 0.5) {
    g.fillStyle = '#fffaf0';
    g.beginPath(); g.roundRect(cx - 26, my - 10, 52, 20, 8); g.fill(); g.stroke();
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(cx - 24, my); g.lineTo(cx + 24, my);
    for (let i = -2; i <= 2; i++) { g.moveTo(cx + i * 9, my - 9); g.lineTo(cx + i * 9, my + 9); }
    g.stroke();
  } else if (f.mouthO > 0.28) {
    const w = 18 + f.mouthO * 8 + Math.max(0, f.smile) * 8, h = 6 + f.mouthO * 22;
    g.fillStyle = '#5a1f2e';
    g.beginPath();
    if (f.smile > 0.3) { g.moveTo(cx - w, my - 4); g.quadraticCurveTo(cx, my - 2, cx + w, my - 4); g.quadraticCurveTo(cx + w * 0.8, my + h * 1.2, cx, my + h * 1.1); g.quadraticCurveTo(cx - w * 0.8, my + h * 1.2, cx - w, my - 4); }
    else g.ellipse(cx + wob, my + h * 0.3, w * 0.75, h, 0, 0, Math.PI * 2);
    g.fill(); g.stroke();
    g.fillStyle = '#e07a86';
    g.beginPath(); g.ellipse(cx + wob, my + h * 0.85, w * 0.42, h * 0.3, 0, 0, Math.PI * 2); g.fill();
  } else if (f.lid > 0.45 && Math.abs(f.smile) < 0.3) {
    g.beginPath(); g.moveTo(cx - 16, my + 2); g.lineTo(cx + 14, my); g.stroke(); // deadpan
  } else {
    const k = f.smile * 16;
    g.beginPath(); g.moveTo(cx - 22, my - k * 0.25);
    g.bezierCurveTo(cx - 10, my + k + wob, cx + 10, my + k - wob, cx + 22, my - k * 0.25);
    g.stroke();
  }
}

// ---------- the model ----------
// Widen the lower half of a head-centred geometry into a jaw (applied identically to the head
// and the face canvas so the painted mouth stays on the jaw).
function jawShape(g, r, jaw) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = THREE.MathUtils.clamp((0.25 * r - y) / (1.2 * r), 0, 1);
    p.setX(i, p.getX(i) * (1 + jaw * t * 1.25));
    p.setZ(i, p.getZ(i) * (1 + jaw * t * 0.3));
    p.setY(i, y * (1 - jaw * t * 0.12));
  }
  g.computeVertexNormals();
  return g;
}

// merges small head/body accessories into one vertex-coloured mesh per worker
class Bits {
  constructor() { this.parts = []; }
  add(g, color, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    const g2 = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(m);
    for (const k of Object.keys(g2.attributes)) if (k !== 'position' && k !== 'normal') g2.deleteAttribute(k);
    const c = new THREE.Color(color), n = g2.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g2.setAttribute('color', new THREE.BufferAttribute(a, 3));
    this.parts.push(g2);
  }
  mesh() {
    const m = new THREE.Mesh(mergeGeometries(this.parts, false), toon('#ffffff', { vertexColors: true }));
    m.castShadow = true;
    return m;
  }
}

export function createWorkerModel(variant = VARIANTS[0]) {
  const v = { ...BASE, hat: '#e8b23a', vest: '#f07a2a', ...variant };
  const M = {
    skin: toon(v.skin), shirt: toon(v.shirt), vest: toon(v.vest), strip: toon('#fbf3e2'),
    trousers: toon(v.trousers), boot: toon('#4a3530'), sole: toon('#2a2430'), hat: toon(v.hat),
    belt: toon('#6b4a35'), steel: toon('#a9b3c9'), glove: toon('#d9a35a'),
  };
  const add = (parent, geo, material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const sph = (r, w = 18, h = 14) => new THREE.SphereGeometry(r, w, h);
  const unit = new THREE.SphereGeometry(1, 10, 8);
  const curl = new THREE.IcosahedronGeometry(1, 1);   // hair curls: 80 triangles each is plenty
  const J = {};
  const joint = (name, parent, x, y, z) => { const o = new THREE.Group(); o.position.set(x, y, z); parent.add(o); J[name] = o; return o; };
  const noseC = new THREE.Color(v.skin).offsetHSL(0.0, 0.08, -0.05).lerp(new THREE.Color('#e88a7a'), v.grin ? 0.45 : 0.2);
  const hairC = v.hair;

  const root = new THREE.Group();
  const hipY = v.l1 + v.l2 + 0.12;
  const hips = joint('hips', root, 0, hipY, 0);
  J.hipY = hipY;
  add(hips, sph(v.tw * 0.74), M.trousers, 0, 0.03, 0).scale.set(1.08, 0.62, 0.9);

  // legs: joints only — the visible leg is a thick noodle drawn through them every frame
  for (const side of [1, -1]) {
    const n = side > 0 ? 'L' : 'R';
    const leg = joint('leg' + n, hips, side * v.tw * 0.4, -0.02, 0);
    const knee = joint('knee' + n, leg, 0, -v.l1, 0);
    const foot = joint('foot' + n, knee, 0, -v.l2, 0);
    add(foot, sph(0.17, 16, 10), M.boot, 0, -0.03, 0.09).scale.set(1.05, 0.62, 1.55);  // clown-sized toe caps
    add(foot, new THREE.BoxGeometry(0.31, 0.05, 0.54), M.sole, 0, -0.1, 0.09);
  }

  // torso: a lathe-turned pear, with the hi-vis vest over it
  const prof = [[0, 0], [0.86, 0.04], [1, 0.25], [0.95, 0.5], [0.76, 0.74], [0.46, 0.92], [0, 1]];
  const lathePts = (k = 1) => prof.map(([r, y]) => new THREE.Vector2(Math.max(0.001, r * v.tw * k), y * v.th));
  const spine = joint('spine', hips, 0, 0.02, 0);
  J.torso = add(spine, new THREE.LatheGeometry(lathePts(), 28), M.shirt);
  J.torso.scale.set(1, 1, 0.92);
  // workwear (hidden for civilians: students, the administrator, the ghost)
  J.workwear = [];
  J.workwear.push(add(spine, new THREE.LatheGeometry(lathePts(1.035).slice(0, 6), 28, 0.5, Math.PI * 2 - 1.0), M.vest));
  J.workwear[0].scale.set(1, 1, 0.92);
  for (const y of [0.26, 0.48]) {
    const tg = new THREE.TorusGeometry(v.tw * 1.05, 0.03, 6, 30, Math.PI * 2 - 1.05);
    tg.rotateX(Math.PI / 2); tg.rotateY(-Math.PI / 2 - 0.52);
    const m = add(spine, tg, M.strip, 0, y * v.th, 0); m.scale.set(1, 1, 0.92); J.workwear.push(m);
  }
  const belt = new THREE.TorusGeometry(v.tw * 0.92, 0.055, 8, 30);
  belt.rotateX(Math.PI / 2);
  const beltM = add(spine, belt, M.belt, 0, 0.06 * v.th, 0); beltM.scale.set(1, 1, 0.92); J.workwear.push(beltM);
  // droppable tools on the belt
  const hammer = new THREE.Group();
  add(hammer, new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8), M.belt);
  add(hammer, new THREE.BoxGeometry(0.22, 0.09, 0.09), M.steel, 0.04, 0.19, 0);
  hammer.position.set(v.tw * 0.97, 0.0, 0.06); hammer.rotation.z = 0.25;
  spine.add(hammer); J.hammer = hammer;
  const tape = new THREE.Group();
  add(tape, new THREE.CylinderGeometry(0.09, 0.09, 0.08, 14), toon(PAL.yellow)).rotation.x = Math.PI / 2;
  tape.position.set(-v.tw * 0.9, 0.02, 0.17);
  spine.add(tape); J.tape = tape;

  // arms: joints + a flared short sleeve + big mitten fists; the arm itself is a thick noodle
  const shY = v.th * 0.7, shX = v.tw * 0.95 + 0.08;
  for (const side of [1, -1]) {
    const n = side > 0 ? 'L' : 'R';
    const sh = joint('shoulder' + n, spine, side * shX, shY, 0);
    add(sh, sph(0.16), M.shirt).scale.set(1, 0.95, 1);
    const sleeve = new THREE.CylinderGeometry(0.155, 0.185, 0.2, 14, 1, true); sleeve.translate(0, -0.1, 0);
    add(sh, sleeve, M.shirt);
    const el = joint('elbow' + n, sh, 0, -v.a1, 0);
    const hand = joint('hand' + n, el, 0, -v.a2, 0);
    add(hand, sph(v.fist), M.glove).scale.set(1.05, 1.0, 0.85);
    add(hand, sph(v.fist * 0.42), M.glove, side * -v.fist * 0.75, v.fist * 0.35, v.fist * 0.3);
  }
  const wrench = new THREE.Group();
  add(wrench, new THREE.BoxGeometry(0.07, 0.6, 0.035), M.steel, 0, -0.26, 0);
  add(wrench, new THREE.TorusGeometry(0.09, 0.03, 6, 12, Math.PI * 1.5), M.steel, 0, -0.58, 0);
  wrench.rotation.x = -Math.PI / 2;
  wrench.visible = false;
  J.handR.add(wrench);
  J.wrench = wrench;

  // the head: big, round, widening into a jaw
  const hr = v.head;
  const head = joint('head', spine, 0, v.th * 0.9 + hr * 0.72, 0.03);
  add(head, jawShape(sph(hr, 28, 22), hr, v.jaw), M.skin).scale.set(1.04, 0.95, 0.97);
  const faceCanvas = document.createElement('canvas'); faceCanvas.width = faceCanvas.height = 256;
  const faceTex = new THREE.CanvasTexture(faceCanvas);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  faceTex.anisotropy = 4;
  const faceGeo = jawShape(new THREE.SphereGeometry(hr * 1.012, 34, 30, Math.PI / 2 - 1.05, 2.1, 0.4, 2.0), hr, v.jaw);
  const face = add(head, faceGeo, toon('#ffffff', { map: faceTex, transparent: true, alphaTest: 0.4, polygonOffset: true, polygonOffsetFactor: -2 }));
  face.scale.set(1.04, 0.95, 0.97);
  face.castShadow = false;
  J.faceCanvas = faceCanvas; J.faceTex = faceTex;

  const B = new Bits();
  const jz = 1 + v.jaw * 0.12;
  // nose: the big 3D accent of the face
  // the nose sits low and pushes forward, so the eyes stay visible above it
  B.add(unit, noseC, 0, -hr * 0.24, hr * (0.98 + v.nose * 0.25) * jz, hr * v.nose * 1.1, hr * v.nose * 0.88, hr * v.nose);
  for (const side of [1, -1]) B.add(unit, v.skin, side * hr * 1.03, -hr * 0.02, 0, hr * 0.1, hr * 0.2, hr * 0.15);
  // facial hair
  if (v.facial === 'horns') {
    // a thick moustache whose tips curl up like little horns
    for (const side of [1, -1]) {
      const pts = [new THREE.Vector3(0, -hr * 0.36, hr * 0.97 * jz), new THREE.Vector3(side * hr * 0.32, -hr * 0.44, hr * 0.9 * jz),
        new THREE.Vector3(side * hr * 0.6, -hr * 0.3, hr * 0.7), new THREE.Vector3(side * hr * 0.66, -hr * 0.06, hr * 0.55)];
      B.add(tubeGeometry(pts, (t) => hr * (0.13 - t * 0.1), 14, 8), hairC);
    }
  } else if (v.facial === 'walrus') {
    for (const side of [1, -1]) B.add(unit, hairC, side * hr * 0.26, -hr * 0.4, hr * 0.88 * jz, hr * 0.36, hr * 0.16, hr * 0.2, 0, 0, side * -0.4);
  } else if (v.facial === 'beard') {
    B.add(unit, hairC, 0, -hr * 0.6, hr * 0.35, hr * (0.95 + v.jaw), hr * 0.72, hr * 0.8);
    for (const side of [1, -1]) B.add(unit, hairC, side * hr * 0.22, -hr * 0.34, hr * 0.9 * jz, hr * 0.3, hr * 0.12, hr * 0.18);
  }
  // curly hair: a crowd of little balls round the back and sides, plus sideburns
  const rr = (a, b) => a + Math.random() * (b - a);
  for (let i = 0; i < 48; i++) {
    const a = rr(-Math.PI * 0.7, Math.PI * 0.7) + Math.PI;
    const r = hr * rr(0.18, 0.27);
    B.add(curl, hairC, Math.sin(a) * hr * 1.0, rr(-0.1, 0.62) * hr, Math.cos(a) * hr * 0.98, r, r, r);
  }
  for (const side of [1, -1]) for (let i = 0; i < 3; i++) B.add(curl, hairC, side * hr * (0.95 + v.jaw * 0.15), -hr * (0.05 + i * 0.13), hr * 0.25, hr * 0.13, hr * 0.13, hr * 0.13);
  if (v.bun) B.add(unit, hairC, 0, hr * 0.55, -hr * 0.85, hr * 0.32, hr * 0.32, hr * 0.32);
  if (v.earrings) for (const side of [1, -1]) B.add(new THREE.TorusGeometry(1, 0.25, 6, 12), '#e8b23a', side * hr * 1.05, -hr * 0.28, 0.02, hr * 0.08, hr * 0.08, hr * 0.08, 0, Math.PI / 2, 0);
  if (v.pencil) B.add(new THREE.CylinderGeometry(1, 1, 1, 6), '#e8b23a', hr * 1.02, hr * 0.12, -hr * 0.05, hr * 0.04, hr * 0.6, hr * 0.04, 0.3, 0, 1.2);
  if (v.cigarette) B.add(new THREE.CylinderGeometry(1, 1, 1, 6), '#fbf3e2', hr * 0.3, -hr * 0.5, hr * 0.98, hr * 0.035, hr * 0.32, hr * 0.035, Math.PI / 2 - 0.2, 0.5, 0);
  const bits = B.mesh();
  head.add(bits);

  // hard hat, worn a bit crooked; it lags behind the head on a spring (and can fly off)
  const hat = new THREE.Group();
  const hs = hr * 1.02;
  add(hat, new THREE.SphereGeometry(hs * 1.06, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.hat).scale.set(1.02, 0.9, 1.05);
  add(hat, new THREE.CylinderGeometry(hs * 1.13, hs * 1.17, 0.045, 28), M.hat, 0, 0.0, hs * 0.1);
  add(hat, new THREE.BoxGeometry(0.09, 0.08, hs * 2.05), M.hat, 0, hs * 0.93, 0);
  hat.position.set(0, hr * 0.74, -hr * 0.08);
  hat.rotation.set(-0.14, 0, 0.1);
  head.add(hat);
  J.hat = hat;
  J.hatBase = hat.position.y;

  const anchor = new THREE.Object3D();
  anchor.position.set(0, hr * 1.7, 0);
  head.add(anchor);
  J.anchor = anchor;

  // rubber-hose limbs, thick and fleshy: bare forearms (skin) under the short sleeves
  const armR = (t) => v.arm + (v.fore - v.arm) * Math.sin(Math.PI * Math.min(1, t * 1.25)) - t * 0.02;
  const legR = (t) => v.leg + Math.pow(t, 3) * 0.05;   // flared trouser legs
  J.noodles = [];
  for (const side of ['L', 'R']) {
    const arm = new Noodle(14, 9, armR), leg = new Noodle(12, 10, legR);
    const am = new THREE.Mesh(arm.geo, M.skin), lm = new THREE.Mesh(leg.geo, M.trousers);
    am.castShadow = lm.castShadow = true;
    am.frustumCulled = lm.frustumCulled = false;
    root.add(am, lm);
    J.noodles.push({ n: arm, chain: ['shoulder' + side, 'elbow' + side, 'hand' + side] }, { n: leg, chain: ['leg' + side, 'knee' + side, 'foot' + side] });
  }
  // civilians: no hard hat, no hi-vis, no tools; extras by kind
  if (v.civilian) {
    for (const m of J.workwear) m.visible = false;
    J.hat.visible = false; J.hammer.visible = false; J.tape.visible = false;
    if (v.tie) { const tie = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.42, 4), toon(v.tie)); tie.rotation.x = Math.PI; tie.position.set(0, v.th * 0.66, v.tw * 0.9); spine.add(tie); }
    if (v.bowtie) { for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.13, 4), toon('#2a2140')); b.rotation.z = s * Math.PI / 2; b.position.set(s * 0.065, v.th * 0.88, v.tw * 0.62); spine.add(b); } }
    if (v.backpack) { const bp = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.25, 4, 8), toon(v.backpack)); bp.position.set(0, v.th * 0.5, -v.tw * 0.95); spine.add(bp); }
    if (v.clipboard) { const cb = new THREE.Group(); cb.add(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.025), toon('#a8693f'))); const paper = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.01), toon('#fbf3e2')); paper.position.z = 0.015; cb.add(paper); cb.position.set(0, -0.12, 0.1); J.handL.add(cb); }
  }
  // a phone, for filming the disaster (shown by the 'record' reaction)
  const phone = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.02), toon('#2a2430'));
  phone.position.set(0, 0.05, 0.12); phone.visible = false; J.handR.add(phone); J.phone = phone;
  bakeJoints(root, new Set([M.skin]));
  return { root, J, materials: M, variant: v };
}

// Performance for big crowds: merge each joint's static parts (one material each, no texture)
// into a single vertex-coloured mesh, so a worker costs ~20 draw calls instead of ~60.
// Skin stays separate (it reddens when angry), as do the face canvas, the rubber-hose limbs,
// the phone and every droppable tool group (they are their own groups anyway).
function bakeJoints(root, keepMaterials) {
  const mat = toon('#ffffff', { vertexColors: true });
  const groups = [];
  root.traverse(o => { if (o.isGroup && o !== root) groups.push(o); });
  for (const group of groups) {
    const kids = group.children.filter(m => m.isMesh && m.visible && !keepMaterials.has(m.material) && m.material.isMeshToonMaterial && !m.material.map && !m.material.vertexColors);
    if (kids.length < 2) continue;
    const geos = kids.map(m => {
      m.updateMatrix();
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.applyMatrix4(m.matrix);
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
      const c = m.material.color, n = g.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return g;
    });
    const merged = new THREE.Mesh(mergeGeometries(geos, false), mat);
    merged.castShadow = true;
    for (const k of kids) group.remove(k);
    group.add(merged);
  }
}

// ---------- poses ----------
const JOINTS = ['hips', 'spine', 'head', 'legL', 'legR', 'kneeL', 'kneeR', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR'];
const FACE0 = { brow: 0, eye: 1, mouthO: 0, smile: 0.3, red: 0, lid: 0, teeth: 0, tears: 0, lookX: 0, lookY: 0, wobble: 0 };

function blankPose() {
  const p = { hipsY: 0 };
  for (const j of JOINTS) p[j] = [0, 0, 0];
  p.face = { ...FACE0 };
  return p;
}

function mixPose(a, b, w) {
  if (w <= 0) return a;
  for (const j of JOINTS) for (let i = 0; i < 3; i++) a[j][i] += (b[j][i] - a[j][i]) * w;
  a.hipsY += (b.hipsY - a.hipsY) * w;
  for (const k in a.face) a.face[k] += (b.face[k] - a.face[k]) * w;
  return a;
}

const ph = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
const arms = (p, l, r) => { p.shoulderL = l; p.shoulderR = r; };

// Reactions: duration, whether they hold the worker in place, and a pose over time.
// The springs in _animate turn every jump between targets into an overshooting, cartoon move,
// so poses are written as beats: anticipation → action → hold → follow-through.
const REACTIONS = {
  confident: { dur: 1.6, pose(p, t) {
    // rolls up an imaginary sleeve, then a thumbs up
    p.spine[0] = -0.18; p.hipsY = 0.03;
    if (t < 0.7) { arms(p, [-1.2, 0, 0.3], [-1.1, 0.4, -0.5]); p.elbowL[0] = -1.6; p.elbowR[0] = -1.8 + Math.sin(t * 30) * 0.3; }
    else { arms(p, [0.2, 0, 0.6], [-1.6, 0, -0.4]); p.elbowL[0] = -1.5; p.elbowR[0] = -1.4; p.head[2] = 0.15; p.face.lid = 0.25; }
    p.face.smile = 1; p.face.brow = -0.1; } },
  surprise: { dur: 1.0, pose(p, t) {
    const a = ph(t, 0, 0.08);
    p.hipsY = -0.12 * (1 - a) + 0.05 * a;
    arms(p, [-2.7 * a, 0, 1.1 * a], [-2.7 * a, 0, -1.1 * a]); p.elbowL[0] = p.elbowR[0] = -0.3;
    p.spine[0] = -0.3 * a; p.head[0] = -0.25 * a;
    p.legL[0] = -0.4 * a; p.kneeL[0] = 1.0 * a;
    p.face.eye = 1.9; p.face.mouthO = 0.9; p.face.brow = 0.7; p.face.smile = 0; } },
  // frozen in disbelief: stiff as a board for a beat, then a slow turn to the viewer
  disbelief: { dur: 2.4, lock: true, pose(p, t) {
    p.spine[0] = -0.08; arms(p, [-0.15, 0, 0.12], [-0.15, 0, -0.12]);
    p.elbowL[0] = p.elbowR[0] = -0.15;
    p.face.eye = t < 1.2 ? 1.6 : 1.15; p.face.mouthO = t < 1.2 ? 0.55 : 0.35; p.face.brow = 0.6; p.face.smile = -0.2;
    if (t > 1.6) p.head[2] = Math.sin((t - 1.6) * 3) * 0.08; } },
  confused: { dur: 1.7, pose(p, t) {
    p.head[1] = Math.sin(t * 5) * 0.6; p.head[2] = 0.25;
    arms(p, [-2.7, 0, -0.5 * 0], [-2.7, 0, -0.5]); p.shoulderL = [0, 0, 0.35];
    p.elbowR[0] = -1.9 + Math.sin(t * 22) * 0.25; p.elbowL[0] = -0.4;
    p.hipsY = -0.03; p.spine[2] = 0.12;
    p.face.brow = 0.5; p.face.mouthO = 0.3; p.face.smile = -0.3; p.face.lookY = 0.8; p.face.lookX = 0.6; } },
  angry: { dur: 1.8, pose(p, t) {
    // leans in, fists pumping, stamping
    const s = Math.sin(t * 15);
    p.legL[0] = s > 0 ? -0.9 * s : 0; p.kneeL[0] = s > 0 ? 1.2 * s : 0;
    p.legR[0] = s < 0 ? 0.9 * s : 0; p.kneeR[0] = s < 0 ? -1.2 * s : 0;
    arms(p, [-1.2 + Math.sin(t * 24) * 0.4, 0, 0.5], [-1.2 - Math.sin(t * 24) * 0.4, 0, -0.5]);
    p.elbowL[0] = p.elbowR[0] = -1.9;
    p.spine[0] = 0.4; p.head[0] = -0.3;
    p.face.brow = -1; p.face.red = 1; p.face.teeth = 1; p.face.smile = -1; } },
  // tugs at a stubborn component: plants the feet, heaves, slips, heaves again
  tug: { dur: 1.6, lock: true, pose(p, t) {
    const jerk = Math.max(0, Math.sin(t * 14)) * (t < 1.1 ? 1 : 0);
    p.hipsY = -0.18; p.spine[0] = -0.5 - jerk * 0.25; p.head[0] = 0.2;
    p.legL[0] = -0.7; p.kneeL[0] = 0.9; p.legR[0] = 0.5; p.kneeR[0] = 0.2;
    arms(p, [-1.5 + jerk * 0.3, 0, 0.15], [-1.5 + jerk * 0.3, 0, -0.15]); p.elbowL[0] = p.elbowR[0] = -0.2;
    if (t > 1.1) { p.spine[0] = -0.9; p.hipsY = -0.35; arms(p, [-2.2, 0, 0.5], [-2.2, 0, -0.5]); p.face.eye = 1.6; p.face.mouthO = 0.8; }
    else { p.face.teeth = 1; p.face.brow = -0.7; p.face.red = 0.4 + jerk * 0.6; p.face.eye = 0.6; } } },
  // the big one: dip, fling both arms at the sky, hold, flop
  exasperated: { dur: 2.0, pose(p, t) {
    if (t < 0.22) { p.hipsY = -0.14; p.spine[0] = 0.35; arms(p, [0.5, 0, 0.2], [0.5, 0, -0.2]); p.face.eye = 0.4; p.face.brow = -0.5; }
    else if (t < 1.25) {
      p.hipsY = 0.06; p.spine[0] = -0.35; p.head[0] = -0.45;
      arms(p, [-2.9, 0, 0.7], [-2.9, 0, -0.7]); p.elbowL[0] = p.elbowR[0] = -0.25;
      p.face.mouthO = 1; p.face.eye = 1.3; p.face.brow = 0.6; p.face.smile = -0.4;
    } else {
      p.hipsY = -0.06; p.spine[0] = 0.4; p.head[0] = 0.4;
      arms(p, [0.15, 0, 0.08], [0.15, 0, -0.08]); p.elbowL[0] = p.elbowR[0] = 0;
      p.face.lid = 0.6; p.face.smile = -0.5; p.face.brow = 0.5;
    } } },
  facepalm: { dur: 1.9, pose(p, t) {
    arms(p, [-2.0, 0.3, -0.2], [0.1, 0, -0.1]); p.shoulderL = [-2.3, -0.4, 0.75]; p.elbowL[0] = -2.3;
    p.head[0] = 0.35; p.head[1] = t > 0.6 ? Math.sin(t * 9) * 0.25 : 0; p.spine[0] = 0.2;
    p.face.eye = 0.05; p.face.smile = -0.6; p.face.brow = 0.5; } },
  despair: { dur: 2.0, pose(p, t) {
    arms(p, [-3.0, 0, 0.35 + Math.sin(t * 6) * 0.15], [-3.0, 0, -0.35 - Math.sin(t * 6) * 0.15]);
    p.elbowL[0] = p.elbowR[0] = -0.5; p.head[0] = -0.5; p.spine[0] = -0.2; p.spine[2] = Math.sin(t * 3) * 0.12;
    p.hipsY = -0.12; p.kneeL[0] = p.kneeR[0] = 0.4; p.legL[0] = p.legR[0] = -0.2;
    p.face.brow = 0.9; p.face.mouthO = 0.9; p.face.smile = -1; p.face.eye = 1.1; p.face.tears = 1; p.face.wobble = 1; } },
  stumble: { dur: 0.9, lock: true, pose(p, t) {
    p.spine[0] = 0.8; p.head[0] = -0.3;
    p.shoulderL = [-Math.PI + t * 25, 0, 0.6]; p.shoulderR = [-t * 25, 0, -0.6];
    p.legR[0] = 0.7; p.kneeR[0] = 0.6; p.legL[0] = -0.3;
    p.face.eye = 1.7; p.face.mouthO = 1; p.face.brow = 0.4; } },
  bonk: { dur: 0.9, pose(p, t) { p.head[2] = Math.sin(t * 18) * 0.3; p.shoulderR = [-2.8, 0, -0.3]; p.elbowR[0] = -2.0; p.face.eye = 0.05; p.face.mouthO = 0.5; p.hipsY = -0.1; p.kneeL[0] = p.kneeR[0] = 0.35; } },
  dodge: { dur: 0.8, pose(p) {
    arms(p, [-2.9, 0, 0.3], [-2.9, 0, -0.3]); p.elbowL[0] = p.elbowR[0] = -1.8;
    p.spine[0] = -0.35; p.legL[0] = -0.8; p.kneeL[0] = 1.1; p.face.eye = 1.9; p.face.mouthO = 1; p.face.brow = 0.8; } },
  meltdown: { dur: 2.4, pose(p, t) {
    p.hipsY = -0.5; p.legL[0] = p.legR[0] = -1.3; p.kneeL[0] = p.kneeR[0] = 2.2;
    p.spine[0] = 0.6;
    const pound = Math.abs(Math.sin(t * 9));
    arms(p, [-1.6 + pound * 1.3, 0, 0.2], [-1.6 + (1 - pound) * 1.3, 0, -0.2]);
    p.elbowL[0] = p.elbowR[0] = -0.4;
    p.face.brow = -1; p.face.red = 1; p.face.mouthO = 0.9; p.face.smile = -1; p.face.eye = 0.05; } },
  wipe: { dur: 1.1, pose(p, t) { p.shoulderR = [-2.4, 0, -0.9 + Math.sin(t * 6) * 0.4]; p.elbowR[0] = -2.1; p.head[0] = -0.15; p.face.brow = 0.5; p.face.smile = -0.3; p.face.lid = 0.3; } },
  // cups a hand to the mouth and waves the other arm: calling for backup
  call: { dur: 2.2, pose(p, t) {
    p.shoulderR = [-1.9, 0.6, -0.1]; p.elbowR[0] = -2.4;
    p.shoulderL = [-2.9, 0, 0.5 + Math.sin(t * 10) * 0.45]; p.elbowL[0] = -0.3;
    p.spine[0] = -0.15; p.head[0] = -0.2; p.hipsY = 0.04 + Math.abs(Math.sin(t * 10)) * 0.04;
    p.face.mouthO = 0.9; p.face.eye = 1.2; p.face.brow = 0.3; } },
  // jabs a finger at a colleague
  argue: { dur: 2.0, pose(p, t) {
    const jab = Math.max(0, Math.sin(t * 11));
    p.shoulderR = [-1.55 - jab * 0.1, 0, -0.1]; p.elbowR[0] = -0.2 - (1 - jab) * 0.6;
    p.shoulderL = [0.2, 0, 0.7]; p.elbowL[0] = -1.8;           // hand on hip
    p.spine[0] = 0.3 + jab * 0.1; p.head[0] = -0.2 + jab * 0.12;
    p.face.brow = -0.8; p.face.mouthO = 0.35 + jab * 0.5; p.face.red = 0.6; p.face.smile = -0.6; } },
  point: { dur: 1.4, pose(p) {
    p.shoulderR = [-1.6, 0, -0.05]; p.elbowR[0] = -0.05; p.shoulderL = [0.15, 0, 0.6]; p.elbowL[0] = -1.7;
    p.spine[0] = -0.15; p.face.smile = 0.8; p.face.lid = 0.3; p.face.brow = -0.2; } },
  // holding the phone up to film it
  record: { dur: 4.5, pose(p, t) {
    p.shoulderR = [-2.0, 0.3, -0.25]; p.elbowR[0] = -1.1; p.shoulderL = [-1.0, 0, 0.3]; p.elbowL[0] = -1.4;
    p.head[0] = 0.05; p.face.lid = 0.25; p.face.smile = 0.5 + Math.sin(t * 2) * 0.3; } },
  lean: { dur: 3.5, pose(p, t) { p.spine[0] = 0.45; p.head[0] = -0.2; p.shoulderL = [-0.9, 0, 0.4]; p.shoulderR = [-0.9, 0, -0.4]; p.elbowL[0] = p.elbowR[0] = -1.2; p.face.eye = 1.3; p.face.mouthO = 0.3; } },
  // the punchline: shoulders up, palms up, a deadpan face
  shrug: { dur: 1.8, lock: true, pose(p, t) {
    const up = t < 1.2 ? 1 : 0.2;
    p.hipsY = 0.02 * up;
    arms(p, [-0.5 * up, 0, 0.55 * up], [-0.5 * up, 0, -0.55 * up]);
    p.elbowL = [-1.5 * up, 0, 0]; p.elbowR = [-1.5 * up, 0, 0];
    p.head[2] = 0.22 * up; p.head[0] = -0.05;
    p.face.lid = 0.6; p.face.smile = 0; p.face.brow = 0.3 * up; p.face.eye = 1; } },
  // fed up: the tool goes up over the head and is slammed down onto the ground (crew.js lets go
  // of the tool at the bottom of the swing)
  throwdown: { dur: 0.95, lock: true, pose(p, t) {
    const up = t < 0.38 ? ph(t, 0, 0.38) : Math.max(0, 1 - (t - 0.38) / 0.12);
    p.shoulderR = [-2.9 * up - 0.2 * (1 - up), 0, -0.3]; p.elbowR[0] = -0.9 * up - 0.1;
    p.shoulderL = [-0.4, 0, 0.4]; p.elbowL[0] = -0.8;
    p.spine[0] = -0.25 * up + 0.45 * (1 - up) * (t > 0.38 ? 1 : 0); p.head[0] = 0.2 * (1 - up);
    p.hipsY = -0.08 * (1 - up);
    p.face.brow = -0.7; p.face.mouthO = t > 0.38 ? 0.8 : 0.2; p.face.teeth = t < 0.38 ? 1 : 0; p.face.red = 0.4; } },
  // "I'm done": hands up and out, palms forward, waving it all off — can be done while walking
  giveup: { dur: 1.7, move: true, pose(p, t) {
    const wv = Math.sin(t * 9) * 0.18;
    p.shoulderL = [-1.5, 0, 0.9 + wv]; p.shoulderR = [-1.5, 0, -0.9 - wv]; p.elbowL[0] = p.elbowR[0] = -1.6;
    p.head[1] = Math.sin(t * 6) * 0.35; p.head[0] = 0.1;
    p.face.lid = 0.55; p.face.brow = 0.4; p.face.smile = -0.3; p.face.mouthO = 0.3; } },
  // slow shake of the head, while walking
  headshake: { dur: 1.5, move: true, pose(p, t) {
    p.head[1] = Math.sin(t * 7) * 0.45; p.head[0] = 0.15;
    p.face.lid = 0.5; p.face.brow = 0.3; p.face.smile = -0.5; } },
  // ducking under something flying overhead, hands on the hard hat
  duck: { dur: 1.3, lock: true, pose(p, t) {
    const a = ph(t, 0, 0.12);
    p.hipsY = -0.42 * a; p.legL[0] = p.legR[0] = -1.0 * a; p.kneeL[0] = p.kneeR[0] = 1.8 * a;
    p.spine[0] = 0.55 * a; arms(p, [-2.6, 0, 0.75], [-2.6, 0, -0.75]); p.elbowL[0] = p.elbowR[0] = -2.3;
    p.face.eye = 0.05; p.face.mouthO = 0.6; p.face.brow = 0.8; } },
  // jaw drop, head back, looking up; one arm points at the sky
  lookup: { dur: 2.4, move: true, pose(p, t) {
    p.head[0] = -0.55; p.spine[0] = -0.2;
    p.shoulderR = [-2.75, 0, -0.15]; p.elbowR[0] = -0.1; p.shoulderL = [-0.2, 0, 0.3]; p.elbowL[0] = -0.3;
    p.face.eye = 1.6; p.face.mouthO = 0.85; p.face.brow = 0.8; p.face.lookY = 1; } },
  // caught: head down, hands clasped behind the back, a sheepish look up
  guilty: { dur: 2.0, pose(p, t) {
    p.head[0] = 0.35; p.spine[0] = 0.12; arms(p, [0.45, 0, 0.25], [0.45, 0, -0.25]); p.elbowL[0] = p.elbowR[0] = -0.6;
    p.legL[0] = Math.sin(t * 4) * 0.1;
    p.face.lid = 0.3; p.face.brow = 0.7; p.face.smile = -0.2; p.face.lookY = t > 1 ? 0.7 : -0.6; } },
  // a step back, arms up defensively: "whoa"
  recoil: { dur: 1.0, pose(p, t) {
    const a = ph(t, 0, 0.1);
    p.spine[0] = -0.35 * a; p.head[0] = 0.15 * a; arms(p, [-1.5 * a, 0, 0.6], [-1.5 * a, 0, -0.6]); p.elbowL[0] = p.elbowR[0] = -1.7 * a;
    p.legR[0] = 0.5 * a; p.kneeR[0] = 0.3 * a; p.hipsY = -0.05 * a;
    p.face.eye = 1.8; p.face.mouthO = 0.8; p.face.brow = 0.9; } },
};

// reactions after which the worker turns to the viewer for a comic beat
const FACE_CAMERA = new Set(['confident', 'surprise', 'confused', 'angry', 'despair', 'meltdown', 'wipe', 'exasperated', 'facepalm', 'disbelief']);
const IDLE_FIDGETS = {
  confident: ['tapfoot', 'lookaround', 'stretch'],
  stressed: ['lookaround', 'tapfoot', 'wipebrow', 'sigh'],
  confused: ['scratch', 'lookaround', 'sigh'],
  furious: ['fume', 'tapfoot', 'fume'],
};

export class Worker {
  constructor(scene, fx, audio, variant = VARIANTS[0]) {
    const { root, J, materials, variant: full } = createWorkerModel(variant);
    this.root = root; this.J = J; this.mats = materials; this.variant = full;
    // personality: how springy, how big and how quick this worker's body language is
    const r = () => Math.random();
    this.temper = { k: 0.7 + r() * 0.7, amp: 0.85 + r() * 0.45, freq: 0.88 + r() * 0.3, fidget: 1.6 + r() * 3 };
    this.name = variant.name;
    this.fx = fx;
    // every worker has their own voice pitch
    this.audio = Object.create(audio);
    this.audio.say = (k, p, o = {}) => audio.say(k, p, { ...o, pitch: (o.pitch || 1) * variant.voice });
    this.scene = scene;
    markInk(root);     // characters are drawn with outlines
    scene.add(root);
    this.pos = new THREE.Vector3(-19, 0, 6);
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.grounded = true;
    this.heading = Math.PI;               // facing the building (−z)
    this.facing = new THREE.Vector3(0, 0, -1);
    this.radius = W.radius; this.height = W.height;
    this.mode = 'idle';
    this.phase = 0;
    this.stress = 0;
    this.reaction = null;
    this.action = null;
    this.onMetal = false;
    this.idleT = 0;
    this.fidget = null;
    this.pose = blankPose();
    this.cur = blankPose();
    this.curV = blankPose();      // spring velocities
    for (const k in this.curV.face) this.curV.face[k] = 0;
    this.face = { ...FACE0 };
    this.faceKey = '';
    this.blinkT = 2 + Math.random() * 3;
    this.talkT = 0;
    this.baseSkin = materials.skin.color.clone();
    this.redSkin = new THREE.Color('#e06a5a');
    this.lastStepSign = 1;
    this.squash = 0; this.squashV = 0;
    this.lod = 0; this.lodFrame = 0; this.lodPhase = Math.floor(Math.random() * 6);
    this.hatY = 0; this.hatYV = 0;
    this.collide = null;                  // set by game: (x, z, y, boundsOnly) => { blocked, ground, ceiling, onMetal, hit }
    this.onBump = null;
    this.onLand = null;
    this.onSay = null;                    // (worker, text, opts) => speech bubble
    this._tmp = new THREE.Vector3();
    this._pts = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  }

  get head() { return this.J.anchor; }
  get busy() { return !!(this.action || (this.reaction && REACTIONS[this.reaction.kind].lock)); }

  mood() {
    const s = this.stress;
    return s < 0.25 ? 'confident' : s < 0.5 ? 'stressed' : s < 0.75 ? 'confused' : 'furious';
  }

  addStress(v) { this.stress = THREE.MathUtils.clamp(this.stress + v, 0, 1); }

  // a short line of dialogue: bubble + a burst of mouth movement + a voice blip
  speak(text, { dur = 2.4, priority = false } = {}) {
    this.talkT = Math.min(dur, 0.35 + text.length * 0.045);
    if (this.onSay) this.onSay(this, text, { dur, priority });     // a bubble only; no talking sound
  }

  react(kind, { fx = true, voice = true } = {}) {
    const def = REACTIONS[kind];
    if (!def) return;
    if (this.reaction && REACTIONS[this.reaction.kind].lock && kind !== 'stumble') return;
    this.reaction = { kind, t: 0, w: 0 };
    this.fidget = null;
    const a = this.audio, p = this.pos, h = this.head;
    if (kind === 'surprise' || kind === 'dodge') {
      if (this.grounded) { this.vy = kind === 'dodge' ? 5.5 : 4.4; this.grounded = false; this.squashV += 3; }
      if (kind === 'dodge') this.vel.addScaledVector(this.facing, -4);
      if (fx) this.fx.symbol(h, '!', { size: 0.9 });
      if (voice) a.say(kind === 'dodge' ? 'yelp' : 'surprise', p, { force: true });
    } else if (kind === 'confused') {
      if (fx) this.fx.symbol(h, '?', { size: 0.9, life: 1.7 });
      if (voice) a.say(Math.random() < 0.5 ? 'huh' : 'what', p, { force: true });
    } else if (kind === 'angry' || kind === 'argue') {
      if (fx) { this.fx.symbol(h, 'grawlix', { size: 0.6, life: 1.6 }); if (kind === 'angry') this.fx.symbol(h, 'vein', { size: 0.4, life: 1.5, offset: new THREE.Vector3(0.3, 0.2, 0) }); }
      if (voice) a.say('angry', p, { force: true });
    } else if (kind === 'despair' || kind === 'exasperated') {
      if (fx) { this.fx.symbol(h, '!?', { size: 0.9, life: 1.8 }); this.fx.sweat(h, 5); }
      if (voice) a.say(Math.random() < 0.5 ? 'despair' : 'no', p, { force: true });
    } else if (kind === 'stumble') {
      if (fx) { this.fx.stars(h); this.fx.word(p.clone().add(new THREE.Vector3(0, 2.2, 0)), 'BONK!', { size: 0.9, color: '#e8b23a' }); }
      if (voice) a.say('oof', p, { force: true });
    } else if (kind === 'bonk') {
      if (fx) this.fx.stars(h, 1);
      if (voice) a.say('oof', p, { force: true });
    } else if (kind === 'meltdown') {
      if (fx) { this.fx.symbol(h, 'grawlix', { size: 0.7, life: 2.2 }); this.fx.steam(h); }
      if (voice) a.say('grr', p, { force: true });
    } else if (kind === 'confident' || kind === 'point') {
      if (voice) a.say('confident', p, { force: true });
    } else if (kind === 'wipe' || kind === 'facepalm') {
      if (fx) this.fx.sweat(h, 3);
    } else if (kind === 'tug') {
      if (voice) a.say('effort', p, { force: true });
    } else if (kind === 'call') {
      if (voice) a.say('what', p, { force: true });
    } else if (kind === 'duck') {
      if (voice) a.say('yelp', p, { force: true });
    } else if (kind === 'recoil' || kind === 'lookup') {
      if (fx && kind === 'recoil') this.fx.symbol(h, '!', { size: 0.8 });
      if (voice) a.say('whoa', p, { force: true });
    } else if (kind === 'throwdown') {
      if (voice) a.say(Math.random() < 0.5 ? 'groan' : 'grr', p, { force: true });
    } else if (kind === 'giveup' || kind === 'headshake') {
      if (voice) a.say('sigh', p);
    }
  }

  startDismantle(onDone) {
    if (this.action) return false;
    this.action = { type: 'dismantle', t: 0, dur: W.dismantleTime, onDone, done: false };
    this.J.wrench.visible = true;
    this.audio.say('effort', this.pos);
    this.reaction = null;
    return true;
  }

  // Let go of one thing (tool, or the hard hat) into the world; returns it or null.
  dropOne(list = ['wrench', 'hammer', 'tape']) {
    for (const k of list) {
      const o = this.J[k];
      if (!o || o.parent === this.scene) continue;
      o.visible = true;
      this.scene.attach(o);
      return o;
    }
    return null;
  }

  // For characters who don't walk (students at windows, the ghost): animate in place.
  updateStatic(dt, input = {}) {
    if (this.reaction) {
      const r = this.reaction, def = REACTIONS[r.kind];
      r.t += dt;
      const out = r.fade || r.t > def.dur - 0.2;
      r.w = out ? Math.max(0, r.w - dt * 5) : Math.min(1, r.w + dt * 12);
      if (r.t >= def.dur || (out && r.w <= 0)) this.reaction = null;
    }
    this.J.phone.visible = !!(this.reaction && this.reaction.kind === 'record');
    this.talkT = Math.max(0, this.talkT - dt);
    this._animate(dt, 0, { move: new THREE.Vector3(), ...input });
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.heading;
    this._limbs();
  }

  // Detach the tools into the world so they can tumble to the ground (the ending).
  dropTools() {
    const out = [];
    for (const k of ['wrench', 'hammer', 'tape']) {
      const o = this.J[k];
      if (!o || !o.parent) continue;
      o.visible = true;
      this.scene.attach(o);
      out.push(o);
    }
    return out;
  }

  // ---------- simulation ----------

  update(dt, input) {
    const move = input.move;               // camera-relative unit-ish vector (x, z)
    const moving = move.lengthSq() > 0.01;
    const sneak = input.sneak, run = input.run && !sneak;
    this.mode = sneak ? 'sneak' : !moving ? 'idle' : run ? 'run' : 'walk';
    this.stroll = !!input.stroll;
    this.tired = !!input.tired;
    const locked = this.busy;
    const speed = (sneak ? W.sneak : run ? W.run : W.walk) * (input.speed || 1);
    const target = new THREE.Vector3();
    if (moving && !locked) target.set(move.x, 0, move.z).normalize().multiplyScalar(speed);
    if (moving && this.reaction && !REACTIONS[this.reaction.kind].lock && !REACTIONS[this.reaction.kind].move && this.reaction.t > 0.25) this.reaction.fade = true;
    const k = 1 - Math.exp(-dt * (this.grounded ? W.accel : W.accel * 0.35));
    this.vel.x += (target.x - this.vel.x) * k;
    this.vel.z += (target.z - this.vel.z) * k;

    // horizontal movement with axis-separated collision
    const nx = this.pos.x + this.vel.x * dt;
    let hit = null;
    // if something grew around us, let the worker walk out instead of getting stuck
    const stuck = this.collide(this.pos.x, this.pos.z, this.pos.y).blocked;
    const rx = this.collide(nx, this.pos.z, this.pos.y, stuck);
    if (!rx.blocked) this.pos.x = nx; else { hit = rx.hit; this.vel.x *= -0.1; }
    const nz = this.pos.z + this.vel.z * dt;
    const rz = this.collide(this.pos.x, nz, this.pos.y, stuck);
    if (!rz.blocked) this.pos.z = nz; else { hit = hit || rz.hit; this.vel.z *= -0.1; }
    this.lastHit = hit;
    if (hit && this.onBump) this.onBump(hit, this.mode === 'run' && moving);

    // vertical
    const here = this.collide(this.pos.x, this.pos.z, this.pos.y);
    const ground = here.ground;
    if (this.grounded && input.jump && !locked) {
      this.vy = W.jumpV; this.grounded = false;
      this.squashV += 4.5;                  // launch stretch
      this.audio.say('hup', this.pos);
      if (this.onJump) this.onJump(this);
    }
    if (!this.grounded || this.pos.y > ground + 0.01) {
      this.vy -= W.gravity * dt;
      const ny = this.pos.y + this.vy * dt;
      if (this.vy > 0 && here.ceiling !== undefined && ny + this.height > here.ceiling) {
        this.vy = -1;                           // head meets a deck: clonk
        this.audio.clank(this.pos, { vol: 0.5 });
        this.react('bonk');
        this.hatYV += 4;
        if (this.onBump) this.onBump(null, false, true);
      } else this.pos.y = ny;
      this.grounded = false;
      if (this.pos.y <= ground) {
        const impact = -this.vy;
        this.pos.y = ground; this.vy = 0; this.grounded = true;
        if (impact > 6) { this.fx.dust(this.pos.clone().setY(ground + 0.1), 3, 0.8); this.audio.step(this.pos, here.onMetal, 0.3); }
        if (impact > 2) { this.squashV -= Math.min(6, impact * 0.65); this.hatYV += Math.min(3, impact * 0.3); }
        if (this.onLand) this.onLand(impact);
      }
    } else if (ground > this.pos.y - 0.01) {
      this.pos.y = ground; this.grounded = true; this.vy = 0;
    }
    this.onMetal = here.onMetal;

    // heading
    const hv = Math.hypot(this.vel.x, this.vel.z);
    let want = null, turn = W.turn;
    if (hv > 0.3 && !this.action) want = Math.atan2(this.vel.x, this.vel.z);
    else if (input.faceTo && !moving) { want = Math.atan2(input.faceTo.x - this.pos.x, input.faceTo.z - this.pos.z); turn = W.turn * 0.5; }
    else if (!moving && this.reaction && FACE_CAMERA.has(this.reaction.kind) && input.camPos && (this.reaction.kind !== 'disbelief' || this.reaction.t > 1.3)) {
      // comic beat: turn to the viewer
      want = Math.atan2(input.camPos.x - this.pos.x, input.camPos.z - this.pos.z);
      turn = this.reaction.kind === 'disbelief' ? W.turn * 0.18 : W.turn * 0.6;
    }
    if (want !== null) {
      let d = want - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * (1 - Math.exp(-dt * turn));
    }
    this.facing.set(Math.sin(this.heading), 0, Math.cos(this.heading));

    // action
    if (this.action) {
      const a = this.action;
      a.t += dt;
      if (Math.floor(a.t * 7) !== Math.floor((a.t - dt) * 7)) this.audio.clank(this.pos.clone().addScaledVector(this.facing, 1), { pitch: 1.4, vol: 0.25 });
      if (!a.done && a.t >= a.dur) { a.done = true; a.onDone && a.onDone(); }
      if (a.t >= a.dur + 0.15) { this.action = null; this.J.wrench.visible = false; }
    }
    // reaction
    if (this.reaction) {
      const r = this.reaction, def = REACTIONS[r.kind];
      r.t += dt;
      const out = r.fade || r.t > def.dur - 0.2;
      r.w = out ? Math.max(0, r.w - dt * 5) : Math.min(1, r.w + dt * 12);
      if (r.kind === 'angry' && Math.floor(r.t * 15 / Math.PI) !== Math.floor((r.t - dt) * 15 / Math.PI)) {
        this.fx.dust(this.pos.clone().setY(this.pos.y + 0.1), 2, 0.6);
        this.audio.step(this.pos, this.onMetal, 0.35);
        this.fx.shake(0.04);
        this.squashV -= 1.5;
      }
      if (r.kind === 'meltdown' && Math.floor(r.t * 9 / Math.PI) !== Math.floor((r.t - dt) * 9 / Math.PI)) {
        this.fx.dust(this.pos.clone().addScaledVector(this.facing, 0.5).setY(this.pos.y + 0.1), 1, 0.5);
        this.audio.step(this.pos, this.onMetal, 0.3);
      }
      if (r.t >= def.dur || (out && r.w <= 0)) this.reaction = null;
    }
    // idle: mood beats and fidgets, picked at random so nobody idles like a metronome
    if (this.mode === 'idle' && !this.reaction && !this.action && !input.noFidget) {
      this.idleT += dt;
      const md = this.mood();
      if (!this.fidget && this.idleT > this.temper.fidget + Math.random() * 2.5) {
        this.idleT = 0;
        if (md === 'stressed' && Math.random() < 0.35) this.react('wipe');
        else if (md === 'confused' && Math.random() < 0.4) this.react('confused', { voice: Math.random() < 0.4 });
        else if (md === 'furious' && Math.random() < 0.35) { this.fx.steam(this.head); if (Math.random() < 0.4) this.audio.say('grr', this.pos); this.react(Math.random() < 0.5 ? 'facepalm' : 'angry', { voice: false }); }
        else { const list = IDLE_FIDGETS[md]; this.fidget = { kind: list[Math.floor(Math.random() * list.length)], t: 0, dur: 1.6 + Math.random() * 1.6 }; }
      }
    } else { this.idleT = 0; if (this.mode !== 'idle') this.fidget = null; }
    if (this.fidget) { this.fidget.t += dt; if (this.fidget.t > this.fidget.dur) this.fidget = null; }
    this.stress = Math.max(0, this.stress - dt * 0.004);
    this.talkT = Math.max(0, this.talkT - dt);

    this._animate(dt, hv, input);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.heading;
    // far away (lod 1-2): rebuild the rubber-hose limbs only every other / third frame
    if (!this.lod || (this.lodFrame + this.lodPhase) % (this.lod + 1) === 0) this._limbs();
  }

  _animate(dt, hv, input) {
    const p = blankPose();
    const md = this.mood();
    const st = this.stress;
    const moving = hv > 0.25;
    const t = performance.now() / 1000;
    const freq = (this.mode === 'run' ? 1.7 : this.mode === 'sneak' ? 2.4 : 2.1) * this.temper.freq;
    if (moving) this.phase += dt * (hv * freq + 1.2);
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    if (moving && this.grounded) {
      if (Math.sign(s) !== this.lastStepSign) {
        this.lastStepSign = Math.sign(s);
        this.squashV -= this.mode === 'run' ? 1.6 : this.mode === 'sneak' ? 0.3 : 0.9; // bouncy footfalls
        this.audio.step(this.pos, this.onMetal, this.mode === 'run' ? 0.18 : this.mode === 'sneak' ? 0.04 : 0.1);
        if (this.mode === 'run' && Math.random() < 0.3) this.fx.dust(this.pos.clone().setY(this.pos.y + 0.05), 1, 0.4);
      }
      if (this.mode === 'sneak') {
        // exaggerated cartoon tiptoe: high knees, hands up like paws, eyes darting
        p.hipsY = -0.14 + Math.abs(s) * 0.07;
        p.spine[0] = 0.38;
        p.legL[0] = -1.1 * Math.max(0, s) + 0.2; p.kneeL[0] = 1.5 * Math.max(0, s) + 0.3;
        p.legR[0] = -1.1 * Math.max(0, -s) + 0.2; p.kneeR[0] = 1.5 * Math.max(0, -s) + 0.3;
        arms(p, [-1.3, 0, 0.3], [-1.3, 0, -0.3]); p.elbowL[0] = p.elbowR[0] = -1.6;
        p.head = [-0.25, Math.sin(this.phase * 0.5) * 0.5, 0];
        p.face.eye = 1.3; p.face.smile = -0.2; p.face.brow = 0.4; p.face.lookX = Math.sin(this.phase * 0.5);
      } else if (this.tired) {
        // exhausted: a slumped, shuffling trudge, arms hanging, head down, dragging the feet
        p.hipsY = -0.06 + Math.abs(c) * 0.02;
        p.legL[0] = -0.32 * s; p.legR[0] = 0.32 * s;
        p.kneeL[0] = Math.max(0, -c) * 0.35 + 0.18; p.kneeR[0] = Math.max(0, c) * 0.35 + 0.18;
        p.spine = [0.42, 0, Math.sin(this.phase) * 0.1];
        arms(p, [0.12 + 0.12 * s, 0, 0.06], [0.12 - 0.12 * s, 0, -0.06]); p.elbowL[0] = p.elbowR[0] = -0.15;
        p.head = [0.42, 0, Math.sin(this.phase) * 0.12];
        p.face.lid = 0.7; p.face.brow = 0.5; p.face.smile = -0.4; p.face.mouthO = 0.2;
      } else if (this.stroll) {
        // the walk home: hands in pockets, unhurried, nothing matters any more
        p.hipsY = Math.abs(c) * 0.03;
        p.legL[0] = -0.45 * s; p.legR[0] = 0.45 * s;
        p.kneeL[0] = Math.max(0, -c) * 0.5 + 0.1; p.kneeR[0] = Math.max(0, c) * 0.5 + 0.1;
        arms(p, [0.25, 0, 0.12], [0.25, 0, -0.12]); p.elbowL[0] = p.elbowR[0] = -0.9;
        p.spine = [-0.05, 0, Math.sin(this.phase) * 0.06]; p.head = [-0.08, 0, Math.sin(this.phase) * 0.08];
        p.face.lid = 0.55; p.face.smile = 0.15;
      } else {
        const run = this.mode === 'run';
        const strut = md === 'confident' && !run, trudge = md === 'stressed' || md === 'confused', frantic = md === 'furious';
        const A = run ? 1.0 : strut ? 0.7 : 0.55;
        p.hipsY = Math.abs(c) * (run ? 0.12 : strut ? 0.08 : 0.05) - (run ? 0.06 : trudge ? 0.04 : 0);
        p.spine = [run ? 0.32 : strut ? -0.12 : trudge ? 0.22 : 0.06, 0, Math.sin(this.phase) * (strut ? 0.12 : 0.06)];
        p.legL[0] = -A * s; p.legR[0] = A * s;
        p.kneeL[0] = Math.max(0, -c) * (run ? 1.7 : strut ? 1.1 : 0.7) * Math.max(0, s + 0.3) + 0.1;
        p.kneeR[0] = Math.max(0, c) * (run ? 1.7 : strut ? 1.1 : 0.7) * Math.max(0, -s + 0.3) + 0.1;
        if (frantic && run) {
          // windmilling arms
          arms(p, [-this.phase * 2 % (Math.PI * 2), 0, 0.5], [-(this.phase * 2 + Math.PI) % (Math.PI * 2), 0, -0.5]);
        } else {
          const aa = A * (strut ? 1.5 : 1.3);
          arms(p, [aa * s, 0, 0.16 + (run ? 0.18 : 0)], [-aa * s, 0, -0.16 - (run ? 0.18 : 0)]);
        }
        p.elbowL[0] = p.elbowR[0] = run ? -1.5 : strut ? -0.6 : -0.35;
        p.head[0] = run ? -0.18 : trudge ? 0.2 : strut ? -0.1 : 0;
        p.head[2] = strut ? Math.sin(this.phase) * 0.1 : 0;
        if (strut) { p.face.smile = 0.9; p.face.lid = 0.2; }
        else if (frantic) { p.face.brow = -0.8; p.face.red = 0.6; p.face.teeth = 1; }
        else if (trudge) { p.face.brow = 0.4; p.face.smile = -0.4; p.face.lid = 0.25; }
        if (run && st > 0.5) { p.face.mouthO = 0.7; p.face.eye = 1.4; p.face.teeth = 0; }
      }
    } else {
      const breathe = Math.sin(t * (2 + st * 4)) * (0.02 + st * 0.03);
      p.spine[0] = breathe;
      p.hipsY = breathe * 0.3;
      if (md === 'confident') {
        arms(p, [0.3, 0, 0.75], [0.3, 0, -0.75]); p.elbowL = [-1.7, 0, 0]; p.elbowR = [-1.7, 0, 0]; // fists on hips
        p.spine[0] = -0.12 + breathe; p.head[0] = Math.sin(t * 1.3) * 0.05; p.face.smile = 0.8; p.face.lid = 0.15;
      } else if (md === 'stressed') {
        p.shoulderL[2] = 0.15; p.shoulderR[2] = -0.15; p.elbowL[0] = p.elbowR[0] = -0.3;
        p.head[1] = Math.sin(t * 0.9) * 0.6; p.face.brow = 0.35; p.face.smile = -0.15; p.face.lookX = Math.sin(t * 0.9);
      } else if (md === 'confused') {
        arms(p, [0, 0, 0.25], [0, 0, -0.25]); p.elbowL[0] = p.elbowR[0] = -0.5;
        p.head = [0, Math.sin(t * 1.7) * 0.8, Math.sin(t * 0.8) * 0.2];
        p.face.brow = 0.5; p.face.smile = -0.4; p.face.eye = 1.2;
      } else {
        arms(p, [-0.2, 0, 0.35 + breathe * 3], [-0.2, 0, -0.35 - breathe * 3]); p.elbowL[0] = p.elbowR[0] = -1.4;
        p.spine[0] = 0.25 + breathe * 2; p.head[0] = -0.1;
        p.face.brow = -0.9; p.face.red = 0.8; p.face.teeth = 1; p.face.smile = -1;
      }
      if (this.fidget) {
        const f = this.fidget, ft = f.t;
        if (f.kind === 'tapfoot') { p.legR[0] = -0.15; p.kneeR[0] = 0.15 + Math.max(0, Math.sin(ft * 14)) * 0.35; p.face.lid = Math.max(p.face.lid, 0.3); }
        else if (f.kind === 'lookaround') { p.head[1] = ft < f.dur / 2 ? 0.9 : -0.9; p.face.lookX = ft < f.dur / 2 ? 1 : -1; }
        else if (f.kind === 'stretch') { arms(p, [-2.9, 0, 0.3], [-2.9, 0, -0.3]); p.spine[0] = -0.3; p.face.eye = 0.05; p.face.mouthO = 0.6; }
        else if (f.kind === 'wipebrow') { p.shoulderR = [-2.5, 0, -0.6]; p.elbowR[0] = -2.2; p.face.brow = 0.5; }
        else if (f.kind === 'sigh') { p.spine[0] = 0.3 * Math.sin(Math.min(1, ft / f.dur) * Math.PI); p.face.lid = 0.6; arms(p, [0.1, 0, 0.05], [0.1, 0, -0.05]); }
        else if (f.kind === 'scratch') { p.shoulderL = [-2.6, 0, 0.6]; p.elbowL[0] = -2.0 + Math.sin(ft * 22) * 0.3; p.head[2] = -0.2; p.face.lookY = 0.8; }
        else if (f.kind === 'fume') { p.spine[0] = 0.4; arms(p, [-0.6, 0, 0.5], [-0.6, 0, -0.5]); p.elbowL[0] = p.elbowR[0] = -1.9 + Math.sin(ft * 30) * 0.15; p.face.teeth = 1; p.face.red = 1; }
      }
    }
    if (!this.grounded) {
      p.legL[0] = -0.7; p.kneeL[0] = 1.0; p.legR[0] = 0.3; p.kneeR[0] = 0.5;
      arms(p, [-2.5, 0, 0.7], [-2.5, 0, -0.7]);
      p.face.mouthO = Math.max(p.face.mouthO, 0.5); p.face.eye = Math.max(p.face.eye, 1.3);
    }
    if (this.action) {
      // dismantling: plant, wrench, yank with the whole body
      const at = this.action.t;
      const yank = Math.sin(at * 20);
      const ap = blankPose();
      ap.spine[0] = -0.25 - yank * 0.18; ap.hipsY = -0.16;
      ap.legL[0] = -0.6; ap.kneeL[0] = 0.7; ap.legR[0] = 0.4; ap.kneeR[0] = 0.35;
      arms(ap, [-1.5 - yank * 0.4, 0, 0.2], [-1.5 - yank * 0.4, 0, -0.2]);
      ap.elbowL[0] = ap.elbowR[0] = -0.4;
      ap.face.brow = -0.5; ap.face.teeth = 1; ap.face.red = 0.3 + st * 0.6; ap.face.eye = 0.7;
      mixPose(p, ap, 1);
    }
    if (this.reaction) {
      const rp = blankPose();
      REACTIONS[this.reaction.kind].pose(rp, this.reaction.t);
      const amp = this.temper.amp;   // the same reaction, bigger or smaller depending on who it is
      for (const j of JOINTS) for (let i = 0; i < 3; i++) rp[j][i] *= amp;
      mixPose(p, rp, this.reaction.w);
    }
    if (input.lookAt) {
      // eyes slide toward something interesting (the scaffold, a colleague)
      const d = this._tmp.copy(input.lookAt).sub(this.pos);
      const ang = Math.atan2(d.x, d.z) - this.heading;
      p.face.lookX = THREE.MathUtils.clamp(-Math.sin(ang) * 1.5, -1, 1);
    }
    if (input.lookBack) {
      // running while looking back over the shoulder at the disaster
      const sd = input.lookBack;
      p.head[1] = sd * 1.7; p.spine[1] = sd * 0.55; p.head[0] = -0.1;
      p.face.eye = 1.7; p.face.mouthO = Math.max(p.face.mouthO, 0.6); p.face.brow = 0.8;
    }
    if (this.talkT > 0) { p.face.mouthO = Math.max(p.face.mouthO, 0.25 + Math.abs(Math.sin(t * 17)) * 0.55); p.face.teeth = 0; }

    // underdamped springs: every pose change overshoots a little, then settles
    const K = 240 * this.temper.k, D = 2 * Math.sqrt(K) * 0.42;
    const steps = dt > 1 / 45 ? 2 : 1, h = dt / steps;
    const cur = this.cur, vel = this.curV;
    for (let n = 0; n < steps; n++) {
      for (const j of JOINTS) for (let i = 0; i < 3; i++) {
        vel[j][i] += ((p[j][i] - cur[j][i]) * K - vel[j][i] * D) * h;
        cur[j][i] += vel[j][i] * h;
      }
      vel.hipsY += ((p.hipsY - cur.hipsY) * K - vel.hipsY * D) * h;
      cur.hipsY += vel.hipsY * h;
    }
    const fk = 1 - Math.exp(-dt * 14);
    for (const key in cur.face) cur.face[key] += (p.face[key] - cur.face[key]) * fk;
    const J = this.J;
    J.hips.position.y = J.hipY + cur.hipsY;
    for (const j of JOINTS) J[j].rotation.set(cur[j][0], cur[j][1], cur[j][2]);
    // squash & stretch on a spring
    this.squashV += (-this.squash * 220 - this.squashV * 15) * dt;
    this.squash += this.squashV * dt;
    const air = this.grounded ? 0 : THREE.MathUtils.clamp(Math.abs(this.vy) * 0.02, 0, 0.16);
    const sy = THREE.MathUtils.clamp(1 + this.squash + air, 0.7, 1.3);
    const sc = this.variant.scale || 1;
    this.root.scale.set(sc / Math.sqrt(sy), sc * sy, sc / Math.sqrt(sy));
    // the hat lags behind: pops up on impacts and wobbles back down
    this.hatYV += (-this.hatY * 160 - this.hatYV * 9) * dt;
    this.hatY += this.hatYV * dt;
    if (J.hat.parent !== this.scene) {   // unless it has already flown off
      J.hat.position.y = J.hatBase + Math.max(-0.02, this.hatY * 0.08);
      J.hat.rotation.z = 0.1 + this.hatYV * 0.02;
    }
    if (J.ponytail) J.ponytail.rotation.x = 0.6 + cur.spine[0] * -0.8 + Math.sin(this.phase) * 0.2;
    // the face
    this.blinkT -= dt;
    const blink = this.blinkT < 0.12;
    if (this.blinkT < 0) this.blinkT = 1.8 + Math.random() * 3.5;
    const f = cur.face;
    const q = (x) => Math.round(x * 10);
    const key = `${q(f.brow)},${q(f.eye)},${q(f.mouthO)},${q(f.smile)},${q(f.red)},${q(f.lid)},${q(f.teeth)},${q(f.tears)},${q(f.lookX)},${q(f.lookY)},${blink}`;
    const faceTurn = !this.lod || (this.lodFrame + this.lodPhase) % (this.lod * 3) === 0;
    if (faceTurn && (key !== this.faceKey || f.tears > 0.2 || f.wobble > 0.2)) {
      this.faceKey = key;
      drawFace(J.faceCanvas.getContext('2d'), { ...f, teeth: f.teeth, wobble: f.wobble > 0.3 }, this.variant, blink);
      J.faceTex.needsUpdate = true;
    }
    this.mats.skin.color.copy(this.baseSkin).lerp(this.redSkin, THREE.MathUtils.clamp(f.red, 0, 1) * 0.5);
  }

  // Draw the rubber-hose limbs through the posed joints.
  _limbs() {
    const J = this.J;
    this.root.updateMatrixWorld(true);
    for (const { n, chain } of J.noodles) {
      for (let i = 0; i < 3; i++) {
        const o = J[chain[i]];
        o.getWorldPosition(this._pts[i]);
        this.root.worldToLocal(this._pts[i]);
      }
      n.update(this._pts);
    }
  }
}
