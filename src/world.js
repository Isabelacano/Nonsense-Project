// Courtyard environment in the "Weimar wobble" style: inflated, slightly lopsided, hand-bent
// forms. Trees are branching noodle trunks carrying leafy canopies (hundreds of leaf cards on
// a dark inner mass, see flora.js): broadleaves, poplars, weeping trees and birches, set out on
// the lawn as a garden with five different corners. Underneath: bushes, ferns, clover, drifts of tiny flowers, mushrooms (a fairy
// ring on the lawn, a stand as tall as the workers in the west passage). Leaves, grass and
// flowers move in a gentle wind in the shader. Warm naturals for the world, saturation saved
// for the workers and the scaffold.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pavingTexture, lawnTexture, skyMaterial } from './textures.js';
import { toon, PAL, ILL } from './toon.js';
import { tubeGeometry, puffGeometry } from './shapes.js';
import { createCampus } from './campus.js';
import { canopy, placed, mushroom, fern, blossom as flowerHead, paint } from './flora.js';
import { CFG } from './config.js';

// Batches many copies of a few shapes into one InstancedMesh per (shape, colour).
class Scatter {
  constructor() { this.groups = new Map(); }
  add(geo, color, matrix, { layer = 0, shadow = false, fog = true, mat = null } = {}) {
    const key = geo.uuid + color + layer + shadow + fog + (mat ? mat.uuid : '');
    if (!this.groups.has(key)) this.groups.set(key, { geo, color, layer, shadow, fog, mat, list: [] });
    this.groups.get(key).list.push(matrix);
  }
  build(scene) {
    for (const g of this.groups.values()) {
      const m = new THREE.InstancedMesh(g.geo, g.mat || toon(g.color, { fog: g.fog }), g.list.length);
      g.list.forEach((mat, i) => m.setMatrixAt(i, mat));
      m.castShadow = g.shadow;
      m.receiveShadow = true;
      m.layers.set(g.layer);
      m.computeBoundingSphere();
      scene.add(m);
    }
  }
}

const _e = new THREE.Euler(), _q = new THREE.Quaternion();
const M = (x, y, z, sx, sy = sx, sz = sx, ry = 0, tx = 0, tz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.setFromEuler(_e.set(tx, ry, tz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Foliage families, each a dark → light ramp. Mostly greens; a blossom and an autumn tree as accents.
const FAMILIES = {
  sage:    ['#3f6b55', '#5b8a62', '#86ad6c', '#b9cf86'],
  teal:    ['#24524f', '#2f7067', '#4f9077', '#8bb894'],
  olive:   ['#5c6a34', '#7d8b3f', '#a5ac52', '#cfc878'],
  autumn:  ['#9a4a2c', '#c0682f', '#d99a3e', '#ecc36a'],
  blossom: ['#a85a6a', '#c97a86', '#e7a0a8', '#f6cfcf'],
};

const bare = (g) => {
  const out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes)) if (k !== 'position' && k !== 'normal') out.deleteAttribute(k);
  return out;
};

export function createWorld() {
  const scene = new THREE.Scene();
  let seed = 11;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const rr = (a, b) => a + rnd() * (b - a);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), skyMaterial());
  sky.layers.set(1);
  scene.add(sky);
  scene.fog = new THREE.Fog('#f3dcc8', 60, 230);

  const hemi = new THREE.HemisphereLight('#cfe6ee', '#d9b08c', 1.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff0d6', 1.95);
  sun.position.set(-38, 52, 46);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const sc = sun.shadow.camera;
  sc.left = -62; sc.right = 62; sc.top = 52; sc.bottom = -52; sc.near = 10; sc.far = 190;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  sun.target.position.set(4, 0, 6);
  scene.add(sun, sun.target);

  const colliders = [];
  const swayers = [];               // courtyard trees, topiaries, lamps: { obj, leaves?, phase, amp }
  const S = new Scatter();
  const puff = puffGeometry(2, { belly: 0.4, lump: 0.08, seed: 3 });
  const puffLow = puffGeometry(1, { belly: 0.4, lump: 0.08, seed: 5 });
  const stick = new THREE.CylinderGeometry(0.5, 1, 1, 7); stick.translate(0, 0.5, 0);
  // flame cypress: a lathe teardrop with a curled tip
  const flamePts = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; flamePts.push(new THREE.Vector2(Math.sin(Math.PI * Math.pow(t, 0.8)) * (1 - t * 0.55) * 0.5 + 0.001, t)); }
  const flame = new THREE.LatheGeometry(flamePts, 10);
  { const p = flame.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) + Math.pow(y, 3) * 0.18); } flame.computeVertexNormals(); }
  const blade = new THREE.ConeGeometry(1, 1, 4); blade.translate(0, 0.5, 0);

  // meadow under everything, so the world beyond the courtyard reads green
  const meadow = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), toon('#7aa85a'));
  meadow.rotation.x = -Math.PI / 2;
  meadow.position.y = -0.03;
  meadow.receiveShadow = true;
  scene.add(meadow);

  // inked setts
  const pav = pavingTexture();
  pav.repeat.set(20, 16);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 110), toon('#ffffff', { map: pav }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 10);
  ground.receiveShadow = true;
  scene.add(ground);

  // lawn beds with soft, sausage-like stone kerbs
  const lawnTex = lawnTexture();
  const kerbMat = toon('#cdbb98');
  const L = CFG.site.lawn;
  const lawns = [[L[0], L[1], L[2], L[3]]];
  for (const [x0, x1, z0, z1] of lawns) {
    const t = lawnTex.clone();
    t.needsUpdate = true;
    t.repeat.set((x1 - x0) / 6, (z1 - z0) / 6);
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.14, z1 - z0), toon('#ffffff', { map: t }));
    m.position.set((x0 + x1) / 2, 0.07, (z0 + z1) / 2);
    m.receiveShadow = true;
    scene.add(m);
    for (const [cx, cz, len, alongX] of [[(x0 + x1) / 2, z0, x1 - x0, 1], [(x0 + x1) / 2, z1, x1 - x0, 1], [x0, (z0 + z1) / 2, z1 - z0, 0], [x1, (z0 + z1) / 2, z1 - z0, 0]]) {
      const kk = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, len, 3, 8), kerbMat);
      if (alongX) kk.rotation.z = Math.PI / 2; else kk.rotation.x = Math.PI / 2;
      kk.position.set(cx, 0.1, cz);
      kk.receiveShadow = true;
      scene.add(kk);
    }
  }
  // the long concrete sitting wall along the lawn's courtyard edge (as in photos of the site)
  const sit = new THREE.Mesh(new THREE.BoxGeometry(L[1] - L[0] - 4, 0.48, 0.9), toon('#cfc6b4'));
  sit.position.set((L[0] + L[1]) / 2 + 1, 0.24, L[2] - 0.5); sit.castShadow = sit.receiveShadow = true;
  scene.add(sit);
  colliders.push({ minX: L[0] + 1, maxX: L[1] - 3, minZ: L[2] - 0.95, maxZ: L[2] - 0.05, top: 0.48, kind: 'bench' });

  // ---------- courtyard trees: branching trunks carrying leafy canopies ----------
  const leafMat = toon('#ffffff', { vertexColors: true, side: THREE.DoubleSide, sway: 0.012 });
  const underMat = toon('#ffffff', { vertexColors: true, side: THREE.DoubleSide, sway: 0.02 });
  const smallMat = toon('#ffffff', { vertexColors: true, side: THREE.DoubleSide });
  const flowerMat = toon('#ffffff', { vertexColors: true, side: THREE.DoubleSide, sway: 0.06 });
  const barkMat = toon(PAL.bark);
  const birchMat = toon('#e6dcc8');
  let canopySeed = 1;
  const clump = (cols, r, opts = {}) => canopy({ rx: r, ry: r * (opts.flat ?? 0.78), rz: r * (opts.deep ?? 1), n: Math.round((opts.density ?? 95) * r * r), size: (opts.size ?? 0.34) * 1.35, ramp: cols, seed: canopySeed++, droop: opts.droop || 0, lump: opts.lump ?? 0.12 });
  const tree = (leafGeos, barkGeos, x, z, amp = 0.012, bmat = barkMat) => {
    const g = new THREE.Group();
    const leaves = new THREE.Mesh(mergeGeometries(leafGeos, false), leafMat);
    leaves.castShadow = true; leaves.receiveShadow = true;
    const bark = new THREE.Mesh(mergeGeometries(barkGeos.map(bare), false), bmat);
    bark.castShadow = true; bark.receiveShadow = true;
    g.add(bark, leaves);
    g.position.set(x, 0, z);
    scene.add(g);
    swayers.push({ obj: g, phase: rnd() * 6.28, amp });
    return g;
  };
  // broadleaf: a trunk that forks into a few boughs, each ending in its own leafy clump,
  // so the crown is an irregular cluster of masses rather than one ball
  const broadleaf = (x, z, s, fam, { boughs = 3 + Math.floor(rnd() * 2), spread = 1.7, h0 = rr(3.6, 4.6) } = {}) => {
    const cols = FAMILIES[fam];
    const h = h0 * s, lean = rr(0.2, 0.7) * s, twist = rnd() * 6.28;
    const top = V(Math.cos(twist) * lean, h, Math.sin(twist) * lean);
    const barks = [tubeGeometry([V(0, 0, 0), V(-Math.cos(twist) * 0.3 * s, h * 0.4, -Math.sin(twist) * 0.3 * s), V(top.x * 0.7, h * 0.75, top.z * 0.7), top], (t) => (0.3 - t * 0.15) * s * (t < 0.08 ? 1.5 - t * 6.25 : 1), 18, 9)];
    const leaves = [];
    for (let b = 0; b < boughs; b++) {
      const a = twist + b / boughs * Math.PI * 2 + rr(-0.5, 0.5);
      const len = rr(0.8, 1.5) * spread * s;
      const end = V(top.x + Math.cos(a) * len, h + rr(0.8, 2.0) * s, top.z + Math.sin(a) * len);
      const mid = top.clone().lerp(end, 0.5); mid.y += rr(0.2, 0.6) * s;
      barks.push(tubeGeometry([top, mid, end], (t) => (0.15 - t * 0.08) * s, 10, 7));
      // a few twigs poking out of the clump
      for (let k = 0; k < 2; k++) {
        const tw = end.clone().add(V(rr(-1, 1) * s, 0, rr(-1, 1) * s)); tw.y += rr(0.3, 0.9) * s;
        barks.push(tubeGeometry([end, end.clone().lerp(tw, 0.5).add(V(0, 0.2 * s, 0)), tw], (t) => (0.06 - t * 0.04) * s, 6, 5));
      }
      const r = rr(1.2, 1.75) * s;
      leaves.push(placed(clump(cols, r), end.x, end.y + r * 0.25, end.z, 1, 1, 1, rnd() * 6));
    }
    const rc = rr(1.4, 1.8) * s;
    leaves.push(placed(clump(cols, rc, { flat: 0.7 }), top.x, h + rc * 0.45, top.z, 1, 1, 1, rnd() * 6));
    tree(leaves, barks, x, z, 0.012);
    colliders.push({ minX: x - 0.4 * s, maxX: x + 0.4 * s, minZ: z - 0.4 * s, maxZ: z + 0.4 * s, top: 99, kind: 'tree' });
  };
  // poplar: tall and narrow, a column of stacked leafy masses
  const poplar = (x, z, s, fam) => {
    const cols = FAMILIES[fam];
    const h = rr(7.5, 9) * s;
    const barks = [tubeGeometry([V(0, 0, 0), V(rr(-0.2, 0.2), h * 0.5, 0), V(rr(-0.3, 0.3), h, rr(-0.2, 0.2))], (t) => (0.22 - t * 0.16) * s, 12, 8)];
    const leaves = [];
    for (let i = 0; i < 5; i++) {
      const t = i / 4, r = (1.05 - Math.abs(t - 0.35) * 0.7) * s * 1.2;
      leaves.push(placed(clump(cols, r, { flat: 1.1, size: 0.3 }), rr(-0.25, 0.25) * s, h * (0.32 + t * 0.6), rr(-0.25, 0.25) * s, 1, 1, 1, rnd() * 6));
    }
    tree(leaves, barks, x, z, 0.02);
    colliders.push({ minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.3, maxZ: z + 0.3, top: 99, kind: 'tree' });
  };
  // weeping tree: an arching trunk with leaves hanging down like a curtain
  const weeping = (x, z, s, fam) => {
    const cols = FAMILIES[fam];
    const h = rr(3.8, 4.6) * s, bend = rr(0.6, 1.2) * s;
    const top = V(bend, h, 0);
    const barks = [tubeGeometry([V(0, 0, 0), V(bend * 0.1, h * 0.5, 0), V(bend * 0.6, h * 0.9, 0), top], (t) => (0.26 - t * 0.15) * s, 14, 8)];
    const leaves = [];
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + rr(-0.3, 0.3), r = rr(1.2, 1.6) * s;
      leaves.push(placed(clump(cols, r, { flat: 1.15, droop: 1.6, size: 0.32 }), top.x + Math.cos(a) * 0.9 * s, h - 0.3 * s, Math.sin(a) * 0.9 * s, 1, 1, 1, rnd() * 6));
    }
    leaves.push(placed(clump(cols, 1.5 * s, { flat: 0.75 }), top.x, h + 0.5 * s, 0));
    tree(leaves, barks, x, z, 0.018);
    colliders.push({ minX: x - 0.35, maxX: x + 0.35, minZ: z - 0.35, maxZ: z + 0.35, top: 99, kind: 'tree' });
  };
  // birch: a pale, slightly crooked trunk with a light, airy crown of small leaves
  const birch = (x, z, s, fam = 'olive') => {
    const cols = FAMILIES[fam];
    const h = rr(5.5, 6.8) * s, w = rr(-0.5, 0.5);
    const barks = [tubeGeometry([V(0, 0, 0), V(w * 0.4, h * 0.35, 0.2), V(-w * 0.3, h * 0.7, -0.1), V(w * 0.2, h, 0)], (t) => (0.16 - t * 0.1) * s, 16, 8)];
    const leaves = [];
    for (let i = 0; i < 4; i++) {
      const r = rr(0.9, 1.3) * s;
      leaves.push(placed(clump(cols, r, { density: 45, size: 0.26, lump: 0.2 }), w * 0.2 + rr(-0.9, 0.9) * s, h * (0.62 + i * 0.1) + rr(-0.3, 0.3), rr(-0.9, 0.9) * s, 1, 1, 1, rnd() * 6));
    }
    const g = tree(leaves, barks, x, z, 0.02, birchMat);
    // the dark marks on birch bark
    const marks = [];
    for (let i = 0; i < 9; i++) {
      const y = rr(0.6, h * 0.8), m = new THREE.BoxGeometry(rr(0.1, 0.2) * s, 0.04, 0.05); m.translate(0, y, 0.15 * s - y / h * 0.08 * s); m.rotateY(rnd() * 6);
      marks.push(m);
    }
    const mm = new THREE.Mesh(mergeGeometries(marks.map(bare), false), toon('#3e3436')); g.add(mm);
    colliders.push({ minX: x - 0.25, maxX: x + 0.25, minZ: z - 0.25, maxZ: z + 0.25, top: 99, kind: 'tree' });
  };
  // Where the trees stand. The lawn is the garden, in five characters: a birch wood in the
  // north-west, a blossom corner in the south-west, an open meadow glade in the middle, a dark
  // weeping grove in the north-east, an autumn corner in the south-east. The paved courtyard
  // itself stays clear for the workers; a few trees only stand along the buildings' feet.
  birch(-34.2, 29.8, 1.0); birch(-31.6, 30.8, 0.85, 'sage'); birch(-33.4, 26.6, 0.9); birch(-29.4, 29.6, 0.78);
  broadleaf(-33.6, 12.2, 0.72, 'blossom', { boughs: 3, spread: 1.2 }); broadleaf(-29.8, 13.0, 0.62, 'blossom', { boughs: 3, spread: 1.1 });
  broadleaf(-34.0, 16.6, 0.68, 'olive', { boughs: 3 });
  weeping(-12.6, 29.6, 0.95, 'teal'); poplar(-10.4, 26.8, 0.9, 'teal'); weeping(-16.2, 30.6, 0.8, 'sage'); broadleaf(-19.6, 30.4, 0.8, 'teal', { boughs: 4 });
  broadleaf(-11.4, 12.4, 0.85, 'autumn'); broadleaf(-14.6, 11.6, 0.65, 'autumn', { boughs: 3 }); poplar(-9.9, 15.6, 0.8, 'olive');
  broadleaf(-24.5, 31.0, 0.75, 'sage');
  // along the buildings' feet
  weeping(8, 30.5, 0.85, 'sage'); poplar(20, 31, 0.9, 'olive'); poplar(38.4, 30.4, 0.95, 'teal');
  broadleaf(60, 30, 1.1, 'teal'); birch(58.4, 24.5, 0.9); birch(59.6, 27.8, 0.8, 'sage'); broadleaf(59, 13, 0.8, 'sage');
  broadleaf(-46, -22, 1.2, 'teal'); poplar(-43, -12, 1.0, 'sage');

  // ---------- understory: bushes, ferns, mushrooms, clover, flowers ----------
  const under = [], smalls = [], blooms = [];
  const bush = (x, z, s = 1, fam = 'sage') => {
    const n = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const r = rr(0.5, 0.85) * s;
      under.push(placed(clump(FAMILIES[fam], r, { flat: 0.72, size: 0.24, density: 95 }), x + rr(-0.8, 0.8) * s, r * 0.42, z + rr(-0.5, 0.5) * s, 1, 1, 1, rnd() * 6));
    }
  };
  const fernAt = (x, z, s = 1, fam = 'teal') => under.push(placed(fern({ color: pick(FAMILIES[fam].slice(1, 3)), seed: canopySeed++ }), x, 0, z, s, s, s, rnd() * 6));
  const clover = (x, z, r = 0.8) => under.push(placed(canopy({ rx: r, ry: 0.06, rz: r * rr(0.6, 1), n: Math.round(55 * r * r), size: 0.12, ramp: FAMILIES.sage, seed: canopySeed++, core: false }), x, 0.05, z, 1, 1, 1, rnd() * 6));
  const MUSH = [['#c2543a', '#f2e4c8', true], ['#d99a3e', '#f2e4c8', false], ['#e6d6b2', '#f6ecd8', false], ['#8a5a44', '#e6d6b2', false], ['#8a7fc0', '#e6dcf2', true]];
  const mush = (x, z, s, kind = null) => {
    const [cap, st, spots] = kind ?? (rnd() < 0.06 ? MUSH[4] : pick(MUSH.slice(0, 4)));
    for (const g of mushroom({ cap, stem: st, spots, flat: rr(0.4, 0.7), lean: rr(-0.25, 0.25), seed: canopySeed++ })) smalls.push(placed(g, x, 0, z, s, s * rr(0.8, 1.3), s, rnd() * 6));
  };
  const mushCluster = (x, z, n = 5, s = 0.14, spread = 0.5) => {
    const kind = rnd() < 0.06 ? MUSH[4] : pick(MUSH.slice(0, 4));
    for (let i = 0; i < n; i++) mush(x + rr(-spread, spread), z + rr(-spread, spread), s * 1.9 * rr(0.5, 1.25), rnd() < 0.8 ? kind : null);
  };
  const STEM = new THREE.CylinderGeometry(0.008, 0.011, 1, 3, 1, true); STEM.translate(0, 0.5, 0);
  const FLOWER_KINDS = ['daisy', 'daisy', 'buttercup', 'pink', 'blue', 'poppy', 'bell'];
  const flowerHeads = Object.fromEntries(FLOWER_KINDS.map(k => [k, flowerHead(k)]));
  // a drift: flowers thick in the middle, thinning out, mostly one kind with a few strays
  const drift = (x, z, n, radius, kind = pick(FLOWER_KINDS)) => {
    n = Math.round(n * 2.6);
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.28, d = Math.pow(rnd(), 1.6) * radius;
      const fx = x + Math.cos(a) * d, fz = z + Math.sin(a) * d * rr(0.6, 1);
      const h = rr(0.16, 0.42) * (kind === 'bell' ? 1.25 : 1);
      const k = rnd() < 0.82 ? kind : pick(FLOWER_KINDS);
      blooms.push(paint(placed(STEM, fx, 0, fz, 1, h, 1), '#557a45'));
      // heads tip towards the sky at different angles, so a drift reads from any side
      const sc = rr(2.4, 3.6), tilt = new THREE.Matrix4().makeRotationX(rr(-0.9, -0.25)).premultiply(new THREE.Matrix4().makeRotationY(rnd() * 6.28));
      for (const g of flowerHeads[k]) blooms.push(placed(g.clone().applyMatrix4(tilt), fx, h, fz, sc, sc, sc, 0));
    }
  };
  const grass = (x0, x1, z0, z1, n) => {
    for (let i = 0; i < n; i++) {
      const gx = rr(x0, x1), gz = rr(z0, z1);
      for (let b = 0; b < 4; b++) {
        S.add(blade, pick(['#557a45', '#7fa555', '#b2c86e']), M(gx + rr(-0.1, 0.1), 0.1, gz + rr(-0.1, 0.1), 0.018, rr(0.1, 0.3), 0.018, 0, rr(-0.35, 0.35), rr(-0.35, 0.35)), { layer: 1 });
      }
    }
  };
  // tall flowers (foxglove / cosmos / allium kinds): long stems and big heads, readable from the
  // gameplay camera
  const TALL = { foxglove: ['#c97a86', 0.9, 1.4], cosmos: ['#e7a0a8', 0.6, 1.0], allium: ['#8a7fc0', 0.7, 1.1], sunflower: ['#e8b23a', 1.0, 1.6], aster: ['#7f93d2', 0.5, 0.8] };
  const tallFlower = (x, z, kind) => {
    const [col, h0, h1] = TALL[kind];
    const h = rr(h0, h1), lean = rr(-0.12, 0.12);
    blooms.push(paint(placed(STEM, x, 0, z, 2.2, h, 2.2), '#4f7a45'));
    if (kind === 'foxglove') for (let i = 0; i < 5; i++) { const g = new THREE.ConeGeometry(0.06, 0.12, 6, 1, true); g.rotateX(Math.PI); blooms.push(paint(placed(g, x + Math.sin(i * 2.4) * 0.05, h * (0.7 + i * 0.07), z + Math.cos(i * 2.4) * 0.05), col)); }
    else if (kind === 'allium') blooms.push(placed(canopy({ rx: 0.11, ry: 0.11, rz: 0.11, n: 26, size: 0.07, ramp: [col, col, '#b4a8e8'], seed: canopySeed++, core: true, coreDetail: 1 }), x + lean, h, z));
    else { const sc = kind === 'sunflower' ? 7 : kind === 'aster' ? 3.2 : 4.4; const tilt = new THREE.Matrix4().makeRotationX(rr(-0.9, -0.4)).premultiply(new THREE.Matrix4().makeRotationY(rnd() * 6.28)); for (const g of flowerHeads[kind === 'sunflower' ? 'buttercup' : kind === 'aster' ? 'blue' : 'pink']) blooms.push(placed(g.clone().applyMatrix4(tilt), x + lean, h, z, sc, sc, sc)); }
  };
  // a blob with a noisy outline; elements are scattered inside, denser towards the middle
  const patch = (cx, cz, rx, rz, mix) => {
    const ph = [rnd() * 6, rnd() * 6], ang = rnd() * 6.28;
    const inside = () => {
      for (let t = 0; t < 20; t++) {
        const a = rnd() * 6.28, r = Math.pow(rnd(), 0.75);
        const edge = 1 + 0.28 * Math.sin(a * 3 + ph[0]) + 0.16 * Math.sin(a * 5 + ph[1]);
        if (r > edge) continue;
        const lx = Math.cos(a) * r * rx, lz = Math.sin(a) * r * rz;
        return [cx + lx * Math.cos(ang) - lz * Math.sin(ang), cz + lx * Math.sin(ang) + lz * Math.cos(ang)];
      }
      return [cx, cz];
    };
    const tallKinds = Object.keys(TALL).sort(() => rnd() - 0.5).slice(0, 2);
    for (let i = 0; i < (mix.tall || 0); i++) { const [x, z] = inside(); tallFlower(x, z, pick(tallKinds)); }
    for (const k of mix.flowers || []) for (let i = 0; i < 4; i++) { const [x, z] = inside(); drift(x, z, 5, 0.5, k); }
    const mk = rnd() < 0.08 ? MUSH[4] : pick(MUSH.slice(0, 4));
    for (let i = 0; i < (mix.mush || 0); i++) { const [x, z] = inside(); mush(x, z, rr(0.12, 0.38) * (rnd() < 0.15 ? 2 : 1), rnd() < 0.7 ? mk : null); }
    for (let i = 0; i < (mix.fern || 0); i++) { const [x, z] = inside(); fernAt(x, z, rr(0.7, 1.1)); }
    for (let i = 0; i < (mix.bush || 0); i++) { const [x, z] = inside(); bush(x, z, rr(0.6, 0.85), pick(['sage', 'olive', 'teal'])); }
    clover(cx + rr(-rx, rx) * 0.5, cz + rr(-rz, rz) * 0.5, Math.min(rx, rz) * 0.8);
  };
  const birchBark = toon('#e6dcc8');
  const fallenLog = (x, z, len, r) => {
    const a = rnd() * 6.28, dx = Math.cos(a) * len / 2, dz = Math.sin(a) * len / 2;
    const log = new THREE.Mesh(tubeGeometry([V(x - dx, r * 0.7, z - dz), V(x, r * 0.85, z), V(x + dx, r * 0.6, z + dz)], (t) => r * (1 - t * 0.25), 10, 10), birchBark);
    log.castShadow = log.receiveShadow = true; scene.add(log);
    for (let i = 0; i < 9; i++) { const t = rr(-0.9, 0.9); mush(x + dx * t + rr(-0.1, 0.1), z + dz * t + rr(-0.1, 0.1), rr(0.14, 0.3), i % 3 ? MUSH[1] : MUSH[3]); }
    for (let i = 0; i < 3; i++) fernAt(x + dx * rr(-1, 1) + rr(-0.6, 0.6), z + dz * rr(-1, 1) + rr(-0.6, 0.6), rr(0.6, 0.9));
    colliders.push({ minX: Math.min(x - dx, x + dx) - r, maxX: Math.max(x - dx, x + dx) + r, minZ: Math.min(z - dz, z + dz) - r, maxZ: Math.max(z - dz, z + dz) + r, top: r * 1.6, kind: 'bench' });
  };
  for (const [x0, x1, z0, z1] of lawns) {
    grass(x0 + 0.3, x1 - 0.3, z0 + 0.3, z1 - 0.3, 1300);
    // the birch wood (NW): ferns, bluebells and toadstools in the shade
    for (const [fx, fz, sc] of [[-34.6, 27.8, 1.2], [-32.4, 28.6, 1.0], [-30.6, 31.0, 1.1], [-34.9, 24.6, 0.9], [-28.6, 27.6, 0.8], [-31.2, 25.6, 0.9]]) fernAt(fx, fz, sc);
    drift(-32.6, 27.2, 26, 1.6, 'bell'); drift(-29.6, 25.0, 12, 0.9, 'blue');
    mushCluster(-33.0, 30.4, 7, 0.17, 0.7); mushCluster(-30.2, 28.4, 4, 0.14); mush(-35.0, 25.8, 0.42, MUSH[0]); mush(-34.6, 26.2, 0.28, MUSH[0]);
    clover(-31.5, 23.4, 1.1);
    // the blossom corner (SW): pinks and poppies under the flowering trees, a low hedge
    drift(-32.2, 13.8, 28, 1.8, 'pink'); drift(-28.0, 11.6, 18, 1.2, 'poppy'); drift(-34.4, 18.8, 12, 0.9, 'buttercup');
    bush(-35.0, 10.8, 0.9, 'sage'); bush(-26.6, 10.8, 0.8, 'olive'); bush(-31.0, 10.6, 0.7, 'teal');
    mushCluster(-34.6, 14.4, 3, 0.12);
    // the meadow glade (middle): open grass, daisies, clover and the fairy ring
    drift(-24.6, 17.4, 40, 2.4, 'daisy'); drift(-19.6, 23.8, 30, 2.0, 'buttercup'); drift(-23.0, 26.0, 16, 1.2, 'blue');
    drift(-17.2, 18.0, 14, 1.0, 'daisy'); for (let i = 0; i < 18; i++) drift(rr(x0 + 1, x1 - 1), rr(z0 + 1, z1 - 1), 3, 0.5);
    clover(-24, 13.6, 1.3); clover(-18.8, 20.8, 1.0); clover(-26.6, 22.6, 0.9);
    // irregular planting patches: each a blob with a noisy outline, its own mix, thick in the
    // middle and thinning out towards the edge (see patch() below)
    patch(-22.4, 21.2, 2.6, 1.7, { tall: 14, flowers: ['daisy', 'pink'], mush: 6, fern: 2 });
    patch(-28.6, 19.6, 1.8, 2.4, { tall: 10, flowers: ['buttercup', 'blue'], mush: 3, bush: 1 });
    patch(-15.8, 21.6, 2.2, 1.5, { tall: 12, flowers: ['poppy', 'daisy'], mush: 4 });
    patch(-19.2, 15.4, 1.6, 1.2, { tall: 6, flowers: ['blue'], mush: 5, fern: 1 });
    patch(-25.6, 27.8, 2.0, 1.4, { tall: 9, flowers: ['pink', 'bell'], mush: 4, bush: 1 });
    // a fallen birch log with mushrooms growing along it, half sunk in the clover
    fallenLog(-24.8, 17.6, 3.4, 0.32);
    // the weeping grove (NE): dark ferns, big pale mushrooms, a pool of violets
    for (const [fx, fz, sc] of [[-11.2, 30.6, 1.3], [-14.0, 28.4, 1.1], [-9.8, 28.4, 1.0], [-17.6, 29.0, 0.9], [-13.0, 25.8, 0.8]]) fernAt(fx, fz, sc, 'teal');
    mush(-14.4, 30.6, 0.55, MUSH[2]); mush(-13.8, 31.0, 0.38, MUSH[2]); mushCluster(-10.6, 25.0, 6, 0.16, 0.6);
    drift(-15.2, 27.0, 20, 1.3, 'bell'); bush(-9.8, 31.0, 1.0, 'teal');
    // the autumn corner (SE): bushes, buttercups, orange caps
    bush(-9.8, 10.8, 1.0, 'autumn'); bush(-13.2, 10.6, 0.8, 'olive'); bush(-16.8, 11.0, 0.75, 'sage');
    drift(-12.4, 14.8, 22, 1.4, 'buttercup'); drift(-16.0, 13.6, 10, 0.8, 'poppy');
    mushCluster(-10.6, 13.2, 6, 0.15, 0.6); clover(-14.2, 16.4, 0.8);
  }
  // the north edge: shade planting along the foot of the Van-de-Velde-Bau and No. 15
  for (let x = -36; x <= -14; x += rr(2.6, 4.2)) { bush(x, 33.2, rr(0.75, 1.0), pick(['sage', 'teal'])); if (rnd() < 0.6) fernAt(x + 1.4, 33.6, rr(0.7, 1.0)); }
  for (let x = 1; x <= 23; x += rr(3, 4.5)) { bush(x, 34.6, rr(0.7, 0.95), pick(['teal', 'olive'])); if (rnd() < 0.5) fernAt(x + 1.6, 34.8, rr(0.7, 0.9)); }
  mushCluster(-27.6, 33.6, 5, 0.12); mushCluster(4.5, 34.9, 4, 0.11); drift(-18, 33.4, 12, 0.9, 'bell'); drift(14, 34.6, 10, 0.8, 'blue');
  // along the white east wing
  for (let z = 11; z <= 31; z += rr(3, 4.5)) { bush(39.4, z, rr(0.75, 1.0), pick(['sage', 'teal'])); if (rnd() < 0.5) fernAt(39.6, z + 1.8, 0.8); }
  drift(39.2, 20, 14, 0.8, 'pink'); mushCluster(39.4, 14.2, 4, 0.1);
  // the wild strip east of the wing: long grass, birches, ferns and a crowd of mushrooms
  grass(56, 61.8, 12, 33, 180);
  fernAt(57.4, 31, 1.2); fernAt(56.8, 22, 1.0); fernAt(61, 26.5, 0.9, 'sage');
  mushCluster(58, 29, 8, 0.16, 0.8); mushCluster(57, 18, 4, 0.12); drift(58.5, 24, 20, 1.4, 'daisy');
  // the west passage: something odd — a stand of mushrooms as tall as the workers
  mush(-38.6, 27.4, 1.05, MUSH[1]); mush(-38.0, 28.6, 0.7, MUSH[1]); mush(-39.0, 26.3, 0.45, MUSH[0]);
  mushCluster(-38.3, 29.6, 6, 0.14); fernAt(-38.8, 24.8, 1.0);
  colliders.push({ minX: -39.2, maxX: -37.9, minZ: 26.8, maxZ: 29.1, top: 99, kind: 'tree' });
  bush(-38.6, 31.4, 0.9, 'teal'); drift(-38.4, 22.5, 12, 0.7, 'bell');
  // round the lamp posts and the sitting wall, little weedy tufts and a flower or two
  for (const [x, z] of [[-7, 9], [8, 9], [25, 9], [8, 27], [34, 14]]) { grass(x - 0.4, x + 0.4, z - 0.4, z + 0.4, 6); drift(x + 0.2, z + 0.3, 3, 0.3); }
  grass(L[0] + 1, L[1] - 3, L[2] - 1.1, L[2] - 0.95, 40);

  const merged = (list, mat, layer = 0, shadow = true) => {
    if (!list.length) return;
    const m = new THREE.Mesh(mergeGeometries(list, false), mat);
    m.castShadow = shadow; m.receiveShadow = true; m.layers.set(layer);
    scene.add(m);
  };
  merged(under, underMat);
  merged(smalls, smallMat);
  merged(blooms, flowerMat, 1, false);

  // ---------- distant layers: puff trees and flame cypresses fading into the haze ----------
  // the far trees reuse a few prebuilt leafy canopies per foliage family (instanced)
  const farCanopies = {};
  const farCanopy = (fam, v) => (farCanopies[fam + v] ||= canopy({ rx: 1.9, ry: 1.5, rz: 1.9, n: 58, size: 0.95, ramp: FAMILIES[fam], seed: 500 + v * 7 + fam.length, lump: 0.16, coreDetail: 1 }));
  const farMat = toon('#ffffff', { vertexColors: true, side: THREE.DoubleSide, sway: 0.006 });
  const farTree = (x, z, s, fam) => {
    const h = rr(3.6, 5) * s;
    S.add(stick, PAL.bark, M(x, 0, z, 0.22 * s, h, 0.22 * s, 0, rr(-0.1, 0.1), rr(-0.1, 0.1)));
    for (let i = 0; i < 2; i++) {
      const r = rr(0.9, 1.25) * s;
      S.add(farCanopy(fam, Math.floor(rnd() * 3)), '#ffffff', M(x + rr(-0.8, 0.8) * s, h + 0.8 * s + i * 1.2 * s, z + rr(-0.8, 0.8) * s, r, r, r, rnd() * 6), { mat: farMat });
    }
  };
  const cypress = (x, z, s, fam) => {
    const cols = FAMILIES[fam];
    S.add(flame, cols[rnd() < 0.5 ? 0 : 1], M(x, 0, z, 2.6 * s, 9 * s, 2.6 * s, rnd() * 6));
  };
  const groveFam = () => pick(['sage', 'sage', 'teal', 'teal', 'olive', 'autumn']);
  for (let i = 0; i < 26; i++) {
    const x = rr(-115, -68), z = rr(-40, 60);
    rnd() < 0.35 ? cypress(x, z, rr(0.9, 1.4), 'teal') : farTree(x, z, rr(1.0, 1.6), groveFam());
  }
  for (let i = 0; i < 20; i++) {
    const x = rr(88, 125), z = rr(-40, 60);
    rnd() < 0.35 ? cypress(x, z, rr(0.9, 1.4), 'teal') : farTree(x, z, rr(1.0, 1.6), groveFam());
  }
  for (let i = 0; i < 70; i++) {
    const x = rr(-110, 120), z = rr(-62, -100);
    const s = rr(1.9, 3.1); // tall enough to rise above the roofline
    rnd() < 0.4 ? cypress(x, z, s * 0.85, pick(['teal', 'sage'])) : farTree(x, z, s, groveFam());
  }
  for (let i = 0; i < 22; i++) farTree(rr(-90, 90), rr(60, 85), rr(1.2, 1.8), groveFam());
  // low ridges far off in two cool layers (wide and flat, so they read as land, not as balls)
  for (let i = 0; i < 7; i++) S.add(puffLow, '#9aa98a', M(-170 + i * 58, -5, -175 - rnd() * 30, 62, 9, 30));
  for (let i = 0; i < 6; i++) S.add(puffLow, '#8fa07c', M(-140 + i * 58, -4, -145 - rnd() * 20, 48, 6, 22));
  S.build(scene);

  // ---------- street furniture ----------
  // shepherd's-crook lamp posts with a hanging lantern globe
  const ironMat = toon('#2f3a3a');
  const glowMat = new THREE.MeshBasicMaterial({ color: '#ffe6a0' });
  const lampGeo = tubeGeometry([V(0, 0, 0), V(0, 2.4, 0), V(0.05, 3.9, 0), V(0.55, 4.6, 0), V(1.05, 4.35, 0), V(1.0, 3.98, 0)],
    (t) => (t < 0.04 ? 0.16 : 0.075 - t * 0.02), 28, 8);
  for (const [x, z, flip] of [[-7, 9, 1], [8, 9, -1], [25, 9, 1], [-37.2, -6, -1], [8, 27, -1], [34, 14, 1]]) {
    const g = new THREE.Group();
    const post = new THREE.Mesh(lampGeo, ironMat); post.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), glowMat);
    head.position.set(1.0, 3.62, 0); head.scale.set(1, 1.15, 1);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.3, 10), ironMat); cap.position.set(1.0, 3.95, 0);
    g.add(post, head, cap);
    g.position.set(x, 0, z); g.rotation.y = flip > 0 ? 0 : Math.PI;
    scene.add(g);
    swayers.push({ obj: g, phase: rnd() * 6.28, amp: 0.006, lamp: true });
    colliders.push({ minX: x - 0.15, maxX: x + 0.15, minZ: z - 0.15, maxZ: z + 0.15, top: 99, kind: 'lamp' });
  }
  // (the benches that stood loose in the middle of the paving are gone; people sit on the lawn wall)

  // the campus buildings round the courtyard (from OpenStreetMap footprints)
  colliders.push(...createCampus(scene).colliders);

  // Atmosphere follows the story: a clear, warm afternoon → a strange violet-orange dusk
  // where shadows turn blue and the rims glow amber.
  const calm = {
    top: new THREE.Color('#8fcfd8'), mid: new THREE.Color('#fbe3c4'), fog: new THREE.Color('#f3dcc8'), sun: new THREE.Color('#fff0d6'),
    shade: new THREE.Color('#5b62a8'), rim: new THREE.Color('#ffdca8'), light: new THREE.Color('#fff3dc'),
    hemiSky: new THREE.Color('#cfe6ee'), hemiGround: new THREE.Color('#d9b08c'),
  };
  const dusty = {
    top: new THREE.Color('#4b3d7a'), mid: new THREE.Color('#f0956a'), fog: new THREE.Color('#e3a58e'), sun: new THREE.Color('#ffbf80'),
    shade: new THREE.Color('#4a6aa8'), rim: new THREE.Color('#ffb27a'), light: new THREE.Color('#ffe0bc'),
    hemiSky: new THREE.Color('#b9a8e0'), hemiGround: new THREE.Color('#d98a70'),
  };
  const world = { scene, sun, hemi, colliders, chaos: 0 };
  world.setMood = (chaos) => {
    const u = sky.material.uniforms;
    u.top.value.copy(calm.top).lerp(dusty.top, chaos);
    u.mid.value.copy(calm.mid).lerp(dusty.mid, chaos);
    u.chaos.value = chaos;
    scene.fog.color.copy(calm.fog).lerp(dusty.fog, chaos);
    scene.fog.near = 60 - chaos * 15;
    scene.fog.far = 230 - chaos * 60;
    sun.color.copy(calm.sun).lerp(dusty.sun, chaos);
    sun.intensity = 1.95 - chaos * 0.2;
    hemi.color.copy(calm.hemiSky).lerp(dusty.hemiSky, chaos);
    hemi.groundColor.copy(calm.hemiGround).lerp(dusty.hemiGround, chaos);
    ILL.uShade.value.copy(calm.shade).lerp(dusty.shade, chaos);
    ILL.uRim.value.copy(calm.rim).lerp(dusty.rim, chaos);
    ILL.uLightTint.value.copy(calm.light).lerp(dusty.light, chaos);
    ILL.uShadeMix.value = 0.28 + chaos * 0.1;
    ILL.uRimAmt.value = 0.35 + chaos * 0.25;
    world.chaos = chaos;
  };
  // Trees breathe: a slow sway from the base plus a soft squash of the foliage.
  // As chaos grows they shiver and lean away from the building.
  // Trees between the camera and what it is looking at step aside (are hidden), so the dense
  // garden never blocks the view of the worker or the scaffold.
  const _seg = new THREE.Vector3();
  const blocks = (s, cam, focus) => {
    const p = s.obj.position;
    const ax = focus.x - cam.x, az = focus.z - cam.z, len2 = ax * ax + az * az || 1;
    const t = THREE.MathUtils.clamp(((p.x - cam.x) * ax + (p.z - cam.z) * az) / len2, 0, 1);
    if (t > 0.88) return false;
    _seg.set(cam.x + ax * t, 0, cam.z + az * t);
    const h = cam.y + (focus.y - cam.y) * t;         // view ray height there
    return h < 9.5 && Math.hypot(p.x - _seg.x, p.z - _seg.z) < 3.2;
  };
  world.update = (dt, t, cam, focus) => {
    const c = world.chaos;
    if (cam && focus) for (const s of swayers) if (!s.lamp) s.obj.visible = !blocks(s, cam, focus);
    for (const s of swayers) {
      const a = s.amp * (1 + c * 1.5);
      s.obj.rotation.z = Math.sin(t * 0.9 + s.phase) * a + (s.lamp ? 0 : c * 0.03);
      s.obj.rotation.x = Math.sin(t * 0.7 + s.phase * 1.3) * a * 0.7 + (s.lamp ? 0 : c * 0.05);
    }
  };
  return world;
}
