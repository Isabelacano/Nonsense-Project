// Foliage built from leaves instead of balls: canopies are a dark inner mass with hundreds of
// small leaf cards sprouting from its surface (normals bent outwards from the canopy centre,
// so the clump shades as one soft volume while the silhouette stays ragged and leafy).
// Plus the small stuff: mushrooms, ferns, clover, tiny flowers. Everything returns plain
// geometries with a `color` attribute, ready to merge or instance.
import * as THREE from 'three';
import { puffGeometry } from './shapes.js';

const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();

// a single leaf: a pointed oval in the xy plane, base at the origin, tip at +y
function leafShape(len = 1, wid = 0.45) {
  const pts = [[0, 0], [wid * 0.5, len * 0.28], [wid * 0.42, len * 0.62], [0, len], [-wid * 0.42, len * 0.62], [-wid * 0.5, len * 0.28]];
  const pos = [0, len * 0.45, 0.02 * len];   // a slightly raised midrib, so the leaf is not flat
  const P = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    P.push(pos[0], pos[1], pos[2], a[0], a[1], 0, b[0], b[1], 0);
  }
  return new Float32Array(P);
}
const LEAF = leafShape();
const LEAF_N = LEAF.length / 3;

function colorOf(c) { return c.isColor ? c : new THREE.Color(c); }

// The canopy: an ellipsoid (rx, ry, rz) covered in `n` leaves of size `size`. `ramp` is a list of
// colours from shadow to light; leaves high up and facing the sun get the lighter ones.
export function canopy({ rx = 2, ry = 1.6, rz = 2, n = 260, size = 0.42, ramp, seed = 1, core = true, coreDetail = 2, droop = 0, lump = 0.12 }) {
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const cols = ramp.map(colorOf);
  const sun = new THREE.Vector3(-0.5, 0.75, 0.45).normalize();
  const P = [], N = [], C = [];
  const pushColored = (geoPos, geoNrm, col, jitter) => {
    for (let i = 0; i < geoPos.length; i += 3) {
      P.push(geoPos[i], geoPos[i + 1], geoPos[i + 2]);
      N.push(geoNrm[i], geoNrm[i + 1], geoNrm[i + 2]);
      C.push(col.r * jitter, col.g * jitter, col.b * jitter);
    }
  };
  if (core) {
    // the inner mass, a little smaller than the leaf shell, in the darkest colour
    const g = puffGeometry(coreDetail, { belly: 0.55, lump, seed });
    g.scale(rx * 0.78, ry * 0.76, rz * 0.78);
    const gp = g.index ? g.toNonIndexed() : g;
    pushColored(gp.attributes.position.array, gp.attributes.normal.array, cols[Math.min(1, cols.length - 1)], 0.8);
  }
  const lp = new Float32Array(LEAF.length), ln = new Float32Array(LEAF.length);
  for (let i = 0; i < n; i++) {
    // a point on the ellipsoid (more on the top half), pushed out a little
    const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2;
    let y = u < -0.4 ? u * 0.75 : u;
    const r = Math.sqrt(1 - y * y);
    _n.set(Math.cos(th) * r, y, Math.sin(th) * r);
    const bump = 1 + (rnd() - 0.5) * 0.25 + Math.sin(th * 3 + seed) * lump;
    _v.set(_n.x * rx * bump, _n.y * ry * bump, _n.z * rz * bump);
    if (droop) _v.y -= droop * (1 - Math.abs(_n.y)) * rnd();
    // orient like shingles: the leaf lies on the canopy surface, facing out, its tip running
    // down and round the surface (with some scatter), lifted a little away from it
    const out = _n.clone();
    const down = new THREE.Vector3((rnd() - 0.5) * 1.6, -1 - droop, (rnd() - 0.5) * 1.6);
    const tip = down.addScaledVector(out, -down.dot(out));
    if (tip.lengthSq() < 1e-4) tip.set(1, 0, 0);
    tip.normalize().addScaledVector(out, 0.35 + rnd() * 0.3).normalize();
    const face = out.clone().addScaledVector(tip, -out.dot(tip)).normalize();
    const side = new THREE.Vector3().crossVectors(tip, face);
    const sz = size * (0.7 + rnd() * 0.6);
    _m.makeBasis(side, tip, face).scale(_s.set(sz, sz, sz)).setPosition(_v);
    _s.set(1, 1, 1);
    for (let k = 0; k < LEAF.length; k += 3) {
      const p = new THREE.Vector3(LEAF[k], LEAF[k + 1], LEAF[k + 2]).applyMatrix4(_m);
      lp[k] = p.x; lp[k + 1] = p.y; lp[k + 2] = p.z;
      // canopy normal: from the centre through the leaf (soft, volumetric shading)
      const nn = p.clone().divide(_s.set(rx, ry, rz)).normalize();
      ln[k] = nn.x; ln[k + 1] = nn.y; ln[k + 2] = nn.z;
    }
    // colour: height + facing the sun → lighter, plus a little per-leaf variation
    const lightness = THREE.MathUtils.clamp(0.5 + _n.y * 0.35 + _n.dot(sun) * 0.3 + (rnd() - 0.5) * 0.35, 0, 0.999);
    const ci = Math.min(cols.length - 1, 1 + Math.floor(lightness * (cols.length - 1)));
    pushColored(lp, ln, cols[ci], 0.92 + rnd() * 0.16);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  return g;
}

// stamp a coloured copy of `g` (with position/normal/color) at a transform
export function placed(g, x, y, z, sx = 1, sy = sx, sz = sx, ry = 0) {
  const out = g.clone();
  out.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(sx, sy, sz)));
  return out;
}

function paint(g, color) {
  const out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes)) if (k !== 'position' && k !== 'normal') out.deleteAttribute(k);
  const c = colorOf(color), n = out.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  out.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return out;
}

// a mushroom, base at the origin, about 1 unit tall
export function mushroom({ cap = '#c2543a', stem = '#f2e4c8', spots = true, flat = 0.55, lean = 0, seed = 1 }) {
  const parts = [];
  const prof = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; prof.push(new THREE.Vector2(0.11 + Math.sin(t * Math.PI) * 0.03 - t * 0.02 + (t < 0.15 ? 0.05 * (1 - t / 0.15) : 0), t * 0.72)); }
  const st = new THREE.LatheGeometry(prof, 10);
  st.applyMatrix4(new THREE.Matrix4().makeShear(0, 0, lean, 0, 0, 0));
  parts.push(paint(st, stem));
  const capG = new THREE.SphereGeometry(0.42, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  capG.scale(1, flat * 1.4, 1); capG.translate(lean * 0.72, 0.66, 0);
  parts.push(paint(capG, cap));
  const gill = new THREE.CircleGeometry(0.41, 18); gill.rotateX(Math.PI / 2); gill.translate(lean * 0.72, 0.665, 0);
  parts.push(paint(gill, new THREE.Color(stem).multiplyScalar(0.85)));
  if (spots) {
    let s = seed * 7 + 3;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 7; i++) {
      const a = rnd() * Math.PI * 2, r = 0.08 + rnd() * 0.24;
      const y = 0.66 + Math.sqrt(Math.max(0, 1 - (r / 0.42) ** 2)) * 0.42 * flat * 1.4;
      const d = new THREE.SphereGeometry(0.035 + rnd() * 0.03, 6, 4); d.scale(1, 0.35, 1);
      d.translate(lean * 0.72 + Math.cos(a) * r, y, Math.sin(a) * r);
      parts.push(paint(d, '#fbf3e2'));
    }
  }
  return parts;
}

// a fern: a fan of arching fronds, each a strip of little leaflets
export function fern({ color = '#4f8a5b', fronds = 7, len = 0.9, seed = 1 }) {
  let s = seed * 31 + 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const P = [], N = [];
  for (let f = 0; f < fronds; f++) {
    const a = f / fronds * Math.PI * 2 + rnd() * 0.5;
    const l = len * (0.75 + rnd() * 0.4);
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    for (let k = 0; k < 9; k++) {
      const t = k / 9, t2 = (k + 1) / 9;
      const pA = dir.clone().multiplyScalar(t * l).add(new THREE.Vector3(0, Math.sin(t * Math.PI * 0.8) * l * 0.55, 0));
      const pB = dir.clone().multiplyScalar(t2 * l).add(new THREE.Vector3(0, Math.sin(t2 * Math.PI * 0.8) * l * 0.55, 0));
      const w = (1 - t) * 0.13 * l + 0.02;
      for (const sd of [-1, 1]) {
        const tipP = pA.clone().lerp(pB, 0.5).addScaledVector(side, sd * w * 1.6).add(new THREE.Vector3(0, -w * 0.4, 0));
        P.push(pA.x, pA.y, pA.z, pB.x, pB.y, pB.z, tipP.x, tipP.y, tipP.z);
        N.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  return paint(g, color);
}

// tiny flowers, ~5 cm across: a flat star of petals with a raised centre (cheap: ~20 triangles)
function star(n, r0, r1) {
  const sh = new THREE.Shape();
  for (let i = 0; i < n * 2; i++) {
    const a = i / (n * 2) * Math.PI * 2, r = i % 2 ? r1 : r0;
    i ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2);
  return g;
}
export function blossom(kind = 'daisy') {
  const parts = [];
  if (kind === 'bell') {
    const g = new THREE.ConeGeometry(0.02, 0.035, 6, 1, true); g.rotateX(Math.PI); g.translate(0, -0.012, 0);
    parts.push(paint(g, '#8a7fc0'));
    return parts;
  }
  const look = { daisy: ['#fbf3e2', '#e8b23a', 7, 0.032], poppy: ['#d9573b', '#2a2140', 5, 0.03], buttercup: ['#e8b23a', '#d99a3e', 5, 0.022],
    pink: ['#e7a0a8', '#fbf3e2', 6, 0.026], blue: ['#7f93d2', '#fbf3e2', 5, 0.022] }[kind] || ['#fbf3e2', '#e8b23a', 7, 0.03];
  const st = star(look[2], look[3], look[3] * 0.45);
  parts.push(paint(st, look[0]));
  const c = new THREE.CircleGeometry(look[3] * 0.38, 6); c.rotateX(-Math.PI / 2); c.translate(0, 0.004, 0);
  parts.push(paint(c, look[1]));
  return parts;
}

export { paint };
