// Procedural, stylised reconstruction of the Hauptgebäude (main building) of the
// Bauhaus-Universität Weimar (Henry van de Velde, 1904-11).
//
// Footprint and massing come from OpenStreetMap (way 110288877 and its building:parts,
// © OpenStreetMap contributors, ODbL), converted to game metres: x runs along the front,
// z points out into the courtyard (facade plane z = 0). The building is one long, shallow
// bar (about 93 m × 16 m), not an L:
//   x -36 … -15.2  south-west section: 2 storeys + gambrel (mansard) roof with small dormers
//   x -15.2 … 13.6 studio section: 3 storeys, half-hipped roof, four pilasters rising to the
//                  roof and between them exactly three wide atelier windows that run up the
//                  top storey, bend back in a quarter curve and continue up the roof as glass
//   x 13.6 … 36.5  north-east section: 2 storeys with big windows + gambrel roof with two
//                  large glazed dormers
//   behind: a round stair projection (x -4.9 … 4) and a glass-vaulted hall (x 25 … 36.6)
// The copper lantern sits on the ridge at the centre of the studio section (OSM: dome part).
// Details checked against photos (Wikimedia Commons): butter-yellow render, red clay tiles,
// dark blue-grey steel frames, iron ring balconies, recessed entrance under a curved balcony.
// Approximate: window counts per section, storey heights, roof pitches, the rear facade.
//
// The building is cut into columns. Every column owns destructible modules:
//   f0, f1, f2  storeys (f2 is the steep lower mansard on the two-storey sections)
//   rL          atelier roof / upper roof slope (has health)
//   rU, rB      ridge and rear roof (fall with the core)
//   core        interior + back wall (sinks in a dust cloud when the column fails)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon } from './toon.js';

export const FLOORS = [0, 4.6, 9.0, 13.0];
const EAVE = 13.0, ROOF_LOW = 17.6, RIDGE = 22.6;     // studio section
const S_EAVE = 9.0, S_BREAK = 13.0, S_RIDGE = 16.6;  // gambrel sections
let CW = 4;                                            // width of the column being built
const roofZ = (y, depth = 16) => 0.45 - (y - EAVE) * ((depth / 2 + 0.45) / (RIDGE - EAVE));

// The columns, section by section (x positions from the OSM footprint).
export const SECTIONS = [
  { type: 'side', x0: -36, x1: -15.2, cols: 5, small: true },
  { type: 'studio', x0: -15.2, x1: 13.6, cols: 6 },
  { type: 'side', x0: 13.6, x1: 36.5, cols: 5, small: false },
  // (OSM also lists a flat block and a pyramid-roofed pavilion beyond x 36.5; they are left out
  // of the scene on purpose, so the building ends with the north-east gable.)
];
export const MAIN_X0 = -36, MAIN_X1 = 36.5;

// Colours read from photos of the real building: butter-yellow render, light stone plinth,
// dark blue-grey steel window frames, red clay tile roof, verdigris copper lantern.
const C = {
  plaster: new THREE.Color('#f1d48e'),
  plaster2: new THREE.Color('#e7c47c'),
  stone: new THREE.Color('#e6d6b2'),
  stoneDark: new THREE.Color('#cdb98f'),
  tile: new THREE.Color('#c2543a'),
  tile2: new THREE.Color('#b74d33'),
  tile3: new THREE.Color('#c95f42'),
  tileDark: new THREE.Color('#8f3a2a'),
  frame: new THREE.Color('#3b4a66'),
  iron: new THREE.Color('#2f3445'),
  gutter: new THREE.Color('#596070'),
  wood: new THREE.Color('#4f3a3a'),
  interior: new THREE.Color('#4a3b3a'),
  slab: new THREE.Color('#a89580'),
  brick: new THREE.Color('#a9533b'),
  copper: new THREE.Color('#6fa596'),
  copperDark: new THREE.Color('#4e7f72'),
  zinc: new THREE.Color('#8d96a0'),
};
// mostly one clay red, every few courses a slightly darker or lighter one, like a real tiled roof
const TILES = [C.tile, C.tile, C.tile, C.tile2, C.tile, C.tile3];

// Collects coloured boxes/shapes and merges them into one vertex-coloured geometry.
class Geo {
  constructor() { this.parts = []; }
  _push(g, color, jitter = 0.02) {
    const g2 = g.index ? g.toNonIndexed() : g;
    g2.deleteAttribute('uv');
    const n = g2.attributes.position.count;
    const col = new Float32Array(n * 3);
    const c = color.clone();
    // hand-painted unevenness: each block drifts a little in hue and value
    if (jitter) c.offsetHSL((Math.random() - 0.5) * jitter * 0.5, (Math.random() - 0.5) * jitter, (Math.random() - 0.5) * jitter * 1.6);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g2.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts.push(g2);
  }
  box(x0, y0, z0, x1, y1, z1, color, jitter) {
    if (Math.abs(x1 - x0) < 1e-3 || Math.abs(y1 - y0) < 1e-3 || Math.abs(z1 - z0) < 1e-3) return;
    const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this._push(g, color, jitter);
  }
  // Slab between two points in the y/z plane (roof planes, glass strips), spanning x0..x1.
  slab(x0, x1, ya, za, yb, zb, thick, color, jitter) {
    if (x1 - x0 < 1e-3) return;
    const len = Math.hypot(yb - ya, zb - za);
    const g = new THREE.BoxGeometry(x1 - x0, len, thick);
    const ang = Math.atan2(zb - za, yb - ya); // tilt from vertical
    g.rotateX(ang);
    g.translate((x0 + x1) / 2, (ya + yb) / 2, (za + zb) / 2);
    this._push(g, color, jitter);
  }
  rotBox(cx, cy, cz, sx, sy, sz, rz, color) {
    const g = new THREE.BoxGeometry(sx, sy, sz);
    g.rotateZ(rz);
    g.translate(cx, cy, cz);
    this._push(g, color);
  }
  // A shape drawn in the (z, y) side plane, extruded along x from x0 to x0 + w.
  side(shape, x0, w, color, jitter = 0) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false, curveSegments: 12 });
    g.rotateY(-Math.PI / 2);
    g.translate(x0 + w, 0, 0);
    this._push(g, color, jitter);
  }
  add(g, color, jitter = 0) { this._push(g, color, jitter); }
  build() {
    if (!this.parts.length) return null;
    const g = mergeGeometries(this.parts, false);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}

// Overlapping clay tile courses between (ya, za) and (yb, zb): each course is a slab whose
// lower edge kicks out a little, so the roof reads as rows of tiles with inked steps.
function tiles(o, x0, x1, ya, za, yb, zb, { course = 0.55, chunk = 1.2 } = {}) {
  const len = Math.hypot(yb - ya, zb - za);
  const n = Math.max(1, Math.round(len / course));
  const dy = (yb - ya) / n, dz = (zb - za) / n;
  const nl = Math.hypot(dy, dz), ny = -dz / nl, nz = dy / nl; // outward normal
  for (let i = 0; i < n; i++) {
    const y0 = ya + dy * i, z0 = za + dz * i;
    const kick = 0.06;
    const pieces = Math.max(1, Math.round((x1 - x0) / chunk));
    for (let p = 0; p < pieces; p++) {
      const xa = x0 + (x1 - x0) * p / pieces, xb = x0 + (x1 - x0) * (p + 1) / pieces;
      o.slab(xa, xb, y0 + ny * kick, z0 + nz * kick, y0 + dy * 1.12, z0 + dz * 1.12, 0.12, TILES[(i * 7 + p * 3) % TILES.length], 0.02);
    }
  }
}

function windowOpening(o, glass, ox0, ox1, oy0, oy1, opts = {}) {
  const fr = opts.frame || C.frame;
  const gz = opts.glassZ ?? -0.3;
  glass.box(ox0, oy0, gz - 0.02, ox1, oy1, gz, C.frame, 0);
  const t = opts.t || 0.08;
  o.box(ox0, oy0, gz, ox0 + t, oy1, gz + 0.07, fr, 0);
  o.box(ox1 - t, oy0, gz, ox1, oy1, gz + 0.07, fr, 0);
  o.box(ox0, oy1 - t, gz, ox1, oy1, gz + 0.07, fr, 0);
  o.box(ox0, oy0, gz, ox1, oy0 + t, gz + 0.07, fr, 0);
  const cols = opts.cols || 2, rows = opts.rows || 1;
  for (let i = 1; i < cols; i++) {
    const x = ox0 + (ox1 - ox0) * i / cols;
    const w = opts.heavy && i % 2 === 0 ? 0.07 : 0.035; // alternate heavy mullions, like the steel sashes
    o.box(x - w, oy0, gz, x + w, oy1, gz + 0.06, fr, 0);
  }
  for (let r = 1; r < rows; r++) {
    const y = oy0 + (oy1 - oy0) * r / rows;
    o.box(ox0, y - 0.03, gz, ox1, y + 0.03, gz + 0.05, fr, 0);
  }
}

// Wall between y0 and y1 with a rectangular opening.
function wallWithHole(o, y0, y1, ox0, ox1, oy0, oy1, color = C.plaster, depth = 0.55) {
  o.box(0, y0, -depth, ox0, y1, 0, color);
  o.box(ox1, y0, -depth, CW, y1, 0, color);
  o.box(ox0, y0, -depth, ox1, oy0, 0, color);
  o.box(ox0, oy1, -depth, ox1, y1, 0, color);
}

// Wrought-iron balcony: a thin slab and a railing of interlocking rings (as on the real facade).
function balcony(o, x0, x1, y, depth = 0.75, curved = false) {
  if (curved) {
    const r = (x1 - x0) / 2, cx = (x0 + x1) / 2;
    const g = new THREE.CylinderGeometry(r, r * 0.96, 0.32, 24, 1, false, -Math.PI / 2, Math.PI);
    g.scale(1, 1, depth / r);
    g.translate(cx, y - 0.16, 0);
    o.add(g, C.stone);
    for (let i = 0; i <= 12; i++) {
      const a = -Math.PI / 2 + Math.PI * i / 12;
      const rg = new THREE.TorusGeometry(0.2, 0.025, 5, 14);
      rg.rotateY(-a);
      rg.translate(cx + Math.sin(a) * r * 0.95, y + 0.42, Math.cos(a) * depth * 0.95);
      o.add(rg, C.iron);
    }
    const rr = new THREE.TorusGeometry(1, 0.03, 5, 28, Math.PI);
    rr.rotateX(-Math.PI / 2); rr.rotateY(Math.PI);
    rr.scale(r * 0.95, 1, depth * 0.95);
    rr.translate(cx, y + 0.66, 0);
    o.add(rr, C.iron);
    return;
  }
  o.box(x0, y - 0.18, 0, x1, y, depth, C.stone, 0.01);
  const n = Math.round((x1 - x0) / 0.38);
  for (let i = 0; i < n; i++) {
    const rg = new THREE.TorusGeometry(0.17, 0.024, 5, 14);
    rg.translate(x0 + (i + 0.5) * (x1 - x0) / n, y + 0.4, depth - 0.04);
    o.add(rg, C.iron);
  }
  o.box(x0, y + 0.62, depth - 0.07, x1, y + 0.67, depth - 0.01, C.iron, 0);
  o.box(x0, y + 0.12, depth - 0.07, x1, y + 0.16, depth - 0.01, C.iron, 0);
}

// ---------- gambrel sections (south-west and north-east) ----------
// x: 0..CW along the facade, y up, z outward (wall face at z = 0, interior z < 0).

function buildSideFloor(f, flags) {
  const o = new Geo(), glass = new Geo();
  const y0 = FLOORS[f], y1 = FLOORS[f + 1];
  const big = !flags.small;
  const ww = big ? Math.min(2.9, CW - 1.5) : 1.55;
  const ox0 = (CW - ww) / 2, ox1 = ox0 + ww;
  const oy0 = y0 + (f === 0 ? 1.1 : 0.8), oy1 = y1 - 0.65;
  wallWithHole(o, y0, y1, ox0, ox1, oy0, oy1, C.plaster);
  windowOpening(o, glass, ox0, ox1, oy0, oy1, big ? { cols: 4, rows: 4, heavy: true } : { cols: 2, rows: 3 });
  o.box(ox0 - 0.12, oy0 - 0.12, -0.3, ox1 + 0.12, oy0, 0.12, C.stone); // sill
  if (f === 0) o.box(0, 0, -0.55, CW, 0.9, 0.1, C.stone, 0.02);       // stone plinth
  if (f === 1) {
    o.box(0, y1 - 0.4, 0, CW, y1, 0.32, C.plaster2);                    // eave band
    o.box(-0.02, y1 - 0.12, 0.1, CW + 0.02, y1 + 0.12, 0.62, C.gutter, 0); // gutter
  }
  if (flags.edgeL) o.box(-0.05, y0, -0.55, 0.4, y1, 0.18, C.plaster2);
  if (flags.edgeR) o.box(CW - 0.4, y0, -0.55, CW + 0.05, y1, 0.18, C.plaster2);
  return { o, glass };
}

// steep lower part of the gambrel, with a small dormer (SW) or a big glazed atelier dormer (NE)
function buildMansard(depth, flags) {
  const o = new Geo(), glass = new Geo();
  tiles(o, -0.02, CW + 0.02, S_EAVE, 0.5, S_BREAK, -1.5);
  if (flags.dormer === 'small') {
    const y0 = 9.9, y1 = 11.4, zf = -0.05, back = -2.0, wx0 = CW / 2 - 0.6, wx1 = CW / 2 + 0.6;
    o.box(wx0 - 0.15, y0, back, wx1 + 0.15, y1, zf, C.plaster2);
    windowOpening(o, glass, wx0, wx1, y0 + 0.15, y1 - 0.12, { cols: 2, rows: 2, glassZ: zf + 0.02, t: 0.06 });
    const roof = new THREE.Shape();
    roof.moveTo(zf + 0.3, y1 - 0.05); roof.lineTo(zf + 0.3, y1 + 0.06); roof.lineTo(back, y1 + 0.7); roof.lineTo(back, y1 - 0.05);
    o.side(roof, wx0 - 0.3, wx1 - wx0 + 0.6, C.tile, 0.03);
  } else if (flags.dormer === 'box') {
    // the north-east section's big atelier dormers: a glass front with a sloping glass top
    const x0 = 0.45, x1 = CW - 0.45, y0 = 9.35, y1 = 12.4, zf = 0.05, back = -2.6;
    windowOpening(o, glass, x0, x1, y0, y1, { cols: 5, rows: 3, glassZ: zf, heavy: true });
    glass.slab(x0, x1, y1, zf, S_BREAK + 0.5, back, 0.03, C.frame, 0);
    for (let m = 0; m <= 5; m++) { const x = x0 + (x1 - x0) * m / 5; o.slab(x - 0.04, x + 0.04, y1, zf + 0.04, S_BREAK + 0.5, back + 0.04, 0.07, C.frame, 0); }
    o.slab(x0 - 0.1, x1 + 0.1, S_BREAK + 0.45, back + 0.2, S_BREAK + 0.6, back - 0.4, 0.12, C.gutter, 0);
    for (const x of [x0 - 0.14, x1]) {
      const sh = new THREE.Shape();
      sh.moveTo(zf, y0); sh.lineTo(zf, y1); sh.lineTo(back, S_BREAK + 0.5); sh.lineTo(back, y0); sh.lineTo(zf, y0);
      o.side(sh, x, 0.14, C.tileDark, 0.02);
    }
  }
  return { o, glass };
}

// gentle upper slope of the gambrel, up to the ridge
function buildSideUpper(depth) {
  const o = new Geo();
  tiles(o, -0.02, CW + 0.02, S_BREAK - 0.05, -1.45, S_RIDGE, -depth / 2, { course: 0.6 });
  return { o };
}

function buildSideRidge(depth, flags) {
  const o = new Geo();
  o.box(-0.02, S_RIDGE - 0.1, -depth / 2 - 0.25, CW + 0.02, S_RIDGE + 0.16, -depth / 2 + 0.25, C.tileDark, 0);
  if (flags.chimney) o.box(CW / 2 - 0.45, S_RIDGE - 2.5, -depth / 2 - 1.4, CW / 2 + 0.45, S_RIDGE + 1.3, -depth / 2 - 0.5, C.brick);
  if (flags.gableR) gable(o, CW, depth, 'side');
  if (flags.gableL) gable(o, 0, depth, 'side');
  return { o };
}

function buildSideRear(depth) {
  const o = new Geo();
  tiles(o, -0.02, CW + 0.02, S_RIDGE, -depth / 2, S_BREAK - 0.05, -depth + 1.45, { course: 0.75, chunk: 2 });
  tiles(o, -0.02, CW + 0.02, S_BREAK, -depth + 1.5, S_EAVE, -depth - 0.5, { course: 0.75, chunk: 2 });
  return { o };
}

// plaster gable end walls under the roof profile ('side' gambrel or 'studio' half-hip)
function gable(o, x, depth, kind) {
  const sh = new THREE.Shape();
  if (kind === 'side') {
    sh.moveTo(0.5, S_EAVE); sh.lineTo(-1.5, S_BREAK); sh.lineTo(-depth / 2, S_RIDGE); sh.lineTo(-depth + 1.5, S_BREAK); sh.lineTo(-depth - 0.5, S_EAVE); sh.lineTo(0.5, S_EAVE);
  } else {
    // half-hipped ("Krüppelwalm"): the gable stops short of the ridge under a small hip
    const yc = RIDGE - 2.6;
    const zc = (y) => roofZ(y, depth);
    sh.moveTo(0.45, EAVE); sh.lineTo(zc(yc), yc); sh.lineTo(-depth - zc(yc), yc); sh.lineTo(-depth - 0.45, EAVE); sh.lineTo(0.45, EAVE);
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.35, bevelEnabled: false });
  g.rotateY(-Math.PI / 2);
  g.translate(x + (x > 0 ? 0.35 : 0), 0, 0);
  o.add(g, C.plaster2, 0.02);
  if (kind === 'studio') {
    // the little hip: a tiled triangle leaning back from the clipped gable to the ridge
    const yc = RIDGE - 2.6, inward = x > 0 ? -1.6 : 1.6;
    const zA = roofZ(yc, depth), zB = -depth - zA;
    const p = new Float32Array([x, yc, zA, x, yc, zB, x + inward, RIDGE, -depth / 2]);
    const tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.BufferAttribute(p, 3));
    tri.computeVertexNormals();
    const both = mergeGeometries([tri, flipped(tri)], false);
    o.add(both, C.tile2, 0);
  }
}
function flipped(g) {
  const p = g.attributes.position.array.slice();
  const out = new THREE.BufferGeometry();
  const q = new Float32Array([p[0], p[1], p[2], p[6], p[7], p[8], p[3], p[4], p[5]]);
  out.setAttribute('position', new THREE.BufferAttribute(q, 3));
  out.computeVertexNormals();
  return out;
}

// ---------- studio section ----------
// Six columns make three bays: each bay is a left half (L) and right half (R) column, so the
// atelier glass runs unbroken across the joint. Pilasters stand at the bay boundaries.
const PIL = 1.15;
function studioSpan(flags) {
  const pl = flags.half === 'L' ? (flags.first ? PIL : PIL / 2) : 0;
  const pr = flags.half === 'R' ? (flags.last ? PIL : PIL / 2) : 0;
  return { a: pl, b: CW - pr, pl, pr };
}

function buildStudioFloor(f, flags) {
  const o = new Geo(), glass = new Geo();
  const y0 = FLOORS[f], y1 = FLOORS[f + 1];
  const { a, b, pl, pr } = studioSpan(flags);
  if (pl) o.box(0, y0, -0.55, pl, y1, 0.5, C.plaster2);
  if (pr) o.box(CW - pr, y0, -0.55, CW, y1, 0.5, C.plaster2);
  if (pl && f < 2) o.box(pl + 0.02, y0, 0.0, pl + 0.14, y1, 0.12, C.gutter, 0);  // downpipes beside the pilasters
  if (flags.entrance && f === 0) {
    // The main entrance: one porch across the middle studio bay, centred on the joint between
    // its two columns (x = CW for the left half, x = 0 for the right half). A shallow plaster
    // recess, a stone door surround, a wooden double door with glazed upper panels and a fanlight.
    const L = flags.half === 'L', J = L ? CW : 0, sgn = L ? -1 : 1;   // the joint, and which way is "outwards"
    const x = (d) => J + sgn * d;                                       // distance from the centre line
    const lo = (p, q) => [Math.min(p, q), Math.max(p, q)];
    const R = -0.95;                                                    // depth of the recess
    const span = lo(x(0), L ? a : b);
    o.box(span[0], 0, R - 0.15, span[1], y1, R, C.plaster);            // back wall of the recess
    o.box(span[0], 3.95, R, span[1], y1, 0, C.plaster);                 // wall above the porch opening
    const side = lo(x(2.15), x(2.4));
    o.box(side[0], 0, R, side[1], 3.95, 0, C.plaster2);                 // the porch's side wall
    const out = lo(x(2.4), L ? a : b);
    if (out[1] - out[0] > 0.01) o.box(out[0], 0, -0.55, out[1], 3.95, 0, C.plaster);
    // stone surround: jamb, lintel, a keystone at the centre
    const jamb = lo(x(1.12), x(1.42));
    o.box(jamb[0], 0, R - 0.02, jamb[1], 3.35, R + 0.16, C.stone);
    const lint = lo(x(0), x(1.42));
    o.box(lint[0], 3.05, R - 0.02, lint[1], 3.35, R + 0.18, C.stone);
    const key = lo(x(0), x(0.22));
    o.box(key[0], 3.0, R + 0.1, key[1], 3.5, R + 0.24, C.stoneDark, 0);
    // a wooden door leaf, with raised panels and a glazed top
    const leaf = lo(x(0.02), x(1.1));
    o.box(leaf[0], 0, R - 0.08, leaf[1], 2.7, R - 0.02, C.wood, 0);
    const pan = lo(x(0.22), x(0.92));
    o.box(pan[0], 0.25, R - 0.02, pan[1], 1.15, R + 0.03, new THREE.Color('#6b4b44'), 0);
    windowOpening(o, glass, pan[0], pan[1], 1.45, 2.5, { cols: 1, rows: 2, glassZ: R - 0.03, frame: C.wood, t: 0.07 });
    const knob = new THREE.SphereGeometry(0.05, 8, 6); knob.translate(x(0.16), 1.3, R + 0.02);
    o.add(knob, C.copper, 0);
    // fanlight over the doors
    windowOpening(o, glass, lint[0] + (L ? 0.3 : 0), lint[1] - (L ? 0 : 0.3), 2.72, 3.02, { cols: 2, rows: 1, glassZ: R - 0.03, frame: C.wood, t: 0.05 });
    o.box(span[0], 0, R - 0.15, span[1], 0.1, 0, C.stone, 0);          // threshold
    return { o, glass };
  }
  if (f === 2) {
    // top storey: a plaster band, then the atelier glass starts and runs on up into the roof
    o.box(a, y0, -0.55, b, y0 + 0.6, 0, C.plaster);
    windowOpening(o, glass, a, b, y0 + 0.6, y1 + 0.02, { cols: 4, rows: 3, glassZ: -0.12, heavy: true });
    o.box(a, y0 + 0.5, -0.12, b, y0 + 0.62, 0.1, C.frame, 0);
    return { o, glass };
  }
  const oy0 = y0 + (f === 0 ? 0.95 : 0.55), oy1 = y1 - 0.55;
  o.box(a, y0, -0.55, b, oy0, 0, f === 0 ? C.stone : C.plaster);
  o.box(a, oy1, -0.55, b, y1, 0, C.plaster);
  windowOpening(o, glass, a + (pl ? 0.15 : 0), b - (pr ? 0.15 : 0), oy0, oy1, { cols: 3, rows: f === 0 ? 3 : 4, glassZ: -0.25, heavy: true });
  if (f === 0) o.box(0, 0, -0.55, CW, 0.9, 0.12, C.stone, 0.02);
  if (f === 1 && flags.balcony) balcony(o, a + (pl ? 0.1 : -0.02), b - (pr ? 0.1 : -0.02), oy0 + 0.02, 0.62);
  if (f === 1 && flags.entrance && flags.half === 'L') balcony(o, CW - 2.4, CW + 2.4, y0 - 0.02, 1.2, true); // curved balcony, centred over the porch
  return { o, glass };
}

// The signature atelier window: the top-storey glazing keeps going, bends back in a quarter
// curve and runs up the roof slope as sloping glass, framed by tiled cheeks at the pilasters.
function buildAtelierRoof(depth, flags) {
  const o = new Geo(), glass = new Geo();
  const { a, b, pl, pr } = studioSpan(flags);
  const prof = [[EAVE, 0]];
  const R = 1.6, yc = EAVE + 0.5, bend = 0.9;
  prof.push([yc, 0]);
  for (let i = 1; i <= 7; i++) {
    const t = bend * i / 7;
    prof.push([yc + R * Math.sin(t), -(R - R * Math.cos(t))]);
  }
  const [ye, ze] = prof[prof.length - 1];
  const run = 2.5, yt = ye + Math.cos(bend) * run, zt = ze - Math.sin(bend) * run;
  prof.push([yt, zt]);
  for (let i = 0; i < prof.length - 1; i++) {
    const [ya, za] = prof[i], [yb, zb] = prof[i + 1];
    glass.slab(a, b, ya, za - 0.12, yb, zb - 0.12, 0.03, C.frame, 0);
    o.slab(a, b, ya, za - 0.07, ya + (yb - ya) * 0.06, za + (zb - za) * 0.06 - 0.07, 0.07, C.frame, 0);
    // few, strong bars following the curve ("sprossenfrei": no fine glazing bars)
    for (let m = 0; m <= 4; m++) {
      const x = a + (b - a) * m / 4;
      if ((m === 0 && !pl) || (m === 4 && !pr)) continue;
      const w = m % 2 ? 0.035 : 0.06;
      o.slab(x - w, x + w, ya, za - 0.06, yb, zb - 0.06, 0.07, C.frame, 0);
    }
  }
  // cap over the top of the glazing
  o.slab(a - (pl ? 0.1 : 0), b + (pr ? 0.1 : 0), yt - 0.05, zt + 0.25, yt + 0.25, zt - 0.6, 0.14, C.gutter, 0);
  // tiled cheeks beside the pilasters, between the glass profile and the roof plane
  const cheek = (x0) => {
    const sh = new THREE.Shape();
    sh.moveTo(0.02, EAVE);
    for (const [y, z] of prof) sh.lineTo(z + 0.02, y);
    sh.lineTo(roofZ(yt + 0.2, depth), yt + 0.2);
    sh.lineTo(roofZ(EAVE, depth) - 0.4, EAVE);
    o.side(sh, x0, 0.14, C.tileDark, 0.02);
  };
  if (pl) cheek(a - 0.14);
  if (pr) cheek(b);
  // pilasters rising past the eave (the "Pfeiler reaching to the roof"), capped
  if (pl) { o.box(0, EAVE, -0.55, pl, EAVE + 1.0, 0.5, C.plaster2); o.box(-0.03, EAVE + 1.0, -0.65, pl + 0.05, EAVE + 1.18, 0.6, C.stone, 0); }
  if (pr) { o.box(CW - pr, EAVE, -0.55, CW, EAVE + 1.0, 0.5, C.plaster2); o.box(CW - pr - 0.05, EAVE + 1.0, -0.65, CW + 0.03, EAVE + 1.18, 0.6, C.stone, 0); }
  const zP = roofZ(EAVE + 1.18, depth);
  if (pl) tiles(o, -0.02, a - 0.12, EAVE + 1.18, zP, ROOF_LOW, roofZ(ROOF_LOW, depth), { chunk: 0.6 });
  if (pr) tiles(o, b + 0.12, CW + 0.02, EAVE + 1.18, zP, ROOF_LOW, roofZ(ROOF_LOW, depth), { chunk: 0.6 });
  if (yt < ROOF_LOW) tiles(o, a - (pl ? 0.15 : 0), b + (pr ? 0.15 : 0), yt + 0.1, roofZ(yt + 0.1, depth), ROOF_LOW, roofZ(ROOF_LOW, depth));
  return { o, glass };
}

function buildStudioUpper(depth, flags) {
  const o = new Geo();
  tiles(o, -0.02, CW + 0.02, ROOF_LOW - 0.05, roofZ(ROOF_LOW - 0.05, depth), RIDGE, -depth / 2);
  o.box(-0.02, RIDGE - 0.1, -depth / 2 - 0.25, CW + 0.02, RIDGE + 0.18, -depth / 2 + 0.25, C.tileDark, 0); // ridge tiles
  if (flags.first) gable(o, 0, depth, 'studio');
  if (flags.last) gable(o, CW, depth, 'studio');
  if (flags.lantern) {
    // octagonal copper roof lantern with louvres and a little dome, on the ridge at the
    // centre of the studio section (the joint between this column and the next)
    const z = -depth / 2, base = RIDGE - 0.6, x = CW;
    const body = new THREE.CylinderGeometry(1.15, 1.25, 2.4, 8); body.rotateY(Math.PI / 8); body.translate(x, base + 1.2, z);
    o.add(body, C.copper, 0.03);
    for (let i = 0; i < 8; i++) {
      const lv = new THREE.BoxGeometry(0.55, 1.3, 0.06);
      lv.translate(0, 0, 1.14); lv.rotateY(i * Math.PI / 4); lv.translate(x, base + 1.35, z);
      o.add(lv, C.copperDark, 0);
    }
    const cornice = new THREE.CylinderGeometry(1.45, 1.3, 0.3, 8); cornice.rotateY(Math.PI / 8); cornice.translate(x, base + 2.5, z);
    o.add(cornice, C.copperDark, 0);
    const dome = new THREE.SphereGeometry(1.15, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2); dome.scale(1, 0.6, 1); dome.translate(x, base + 2.62, z);
    o.add(dome, C.copper, 0.03);
    const fin = new THREE.SphereGeometry(0.14, 8, 6); fin.translate(x, base + 3.38, z);
    o.add(fin, C.copperDark, 0);
  }
  return { o };
}

function buildStudioRear(depth) {
  const o = new Geo();
  tiles(o, -0.02, CW + 0.02, RIDGE, -depth / 2, EAVE - 0.2, -depth - 0.45, { course: 0.75, chunk: 2 });
  return { o };
}

function buildCore(depth, flags, sec) {
  const o = new Geo();
  const top = sec.type === 'studio' ? FLOORS[3] : S_EAVE;
  o.box(0.02, 0, -depth + 0.05, CW - 0.02, top - 0.05, -0.58, C.interior, 0.03);
  o.box(0.02, top, -depth + 1.6, CW - 0.02, (sec.type === 'studio' ? ROOF_LOW : S_BREAK) - 0.6, -2.6, C.interior, 0.02);
  for (let f = 1; f < (sec.type === 'studio' ? 4 : 3); f++) o.box(0, FLOORS[f] - 0.3, -depth + 0.05, CW, FLOORS[f], -0.56, C.slab, 0.05);
  // back wall skin with simple windows
  o.box(0, 0, -depth, CW, top, -depth + 0.06, C.plaster2);
  for (let f = 0; f < (sec.type === 'studio' ? 3 : 2); f++) o.box(CW / 2 - 0.8, FLOORS[f] + 1.2, -depth - 0.02, CW / 2 + 0.8, FLOORS[f + 1] - 0.8, -depth + 0.01, C.frame, 0);
  if (flags.stair) {
    // the round stair projection at the back of the studio section (centred on the joint)
    const st = new THREE.CylinderGeometry(4.45, 4.45, FLOORS[3] - 0.3, 24, 1, false, Math.PI / 2, Math.PI);
    st.translate(CW, (FLOORS[3] - 0.3) / 2, -depth);
    o.add(st, C.plaster2, 0.02);
    const cap = new THREE.ConeGeometry(4.7, 2.2, 24, 1, false, Math.PI / 2, Math.PI);
    cap.translate(CW, FLOORS[3] + 0.8, -depth);
    o.add(cap, C.tile, 0.02);
    for (let f = 0; f < 3; f++) for (let k = 0; k < 5; k++) {
      const ang = Math.PI / 2 + Math.PI * (k + 0.5) / 5;
      const w = new THREE.BoxGeometry(0.9, 2.2, 0.1);
      w.translate(0, 0, 4.47); w.rotateY(ang); w.translate(CW, FLOORS[f] + 2.2, -depth);
      o.add(w, C.frame, 0);
    }
  }
  if (flags.hall) {
    // glass-vaulted hall behind the north-east section
    const hx0 = flags.hall[0], hx1 = flags.hall[1];
    o.box(hx0, 0, -depth - 10, hx1, 6, -depth, C.plaster2);
    const vault = new THREE.CylinderGeometry(5, 5, hx1 - hx0, 20, 1, true, -Math.PI / 2, Math.PI);
    vault.rotateZ(Math.PI / 2); vault.scale(1, 0.45, 1); vault.translate((hx0 + hx1) / 2, 6, -depth - 5);
    o.add(vault, C.frame, 0);
  }
  return { o };
}

// a placeholder so every module has geometry, tucked inside the building
function tinyBox() {
  const o = new Geo();
  o.box(0.2, 0.2, -2, 0.3, 0.3, -1.9, C.interior, 0);
  return o.build();
}

// ---------- building ----------

export class Building {
  constructor(scene, fx, audio) {
    this.scene = scene;
    this.fx = fx;
    this.audio = audio;
    this.columns = [];
    this.modules = [];
    this.colliders = [];          // rubble the worker can bump into / climb onto
    this.falling = [];
    this.sinking = [];
    this.timers = [];
    this.onImpact = null;          // (worldPos, size) => void
    this.matOpaque = toon('#ffffff', { vertexColors: true });
    this.matGlass = toon('#5d86a8', { glass: true });
    this.matCrack = new THREE.MeshBasicMaterial({ color: '#2a2140', polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this._build();
    this.totalWeight = this.modules.reduce((s, m) => s + m.weight, 0);
  }

  _build() {
    for (const sec of SECTIONS) {
      const w = (sec.x1 - sec.x0) / sec.cols;
      for (let c = 0; c < sec.cols; c++) {
        const x0 = sec.x0 + c * w;
        const flags = { first: c === 0, last: c === sec.cols - 1, edgeL: c === 0, edgeR: c === sec.cols - 1, half: c % 2 ? 'R' : 'L' };
        if (sec.type === 'side') {
          Object.assign(flags, { small: sec.small, dormer: sec.small ? 'small' : (c === 1 || c === 3 ? 'box' : null), chimney: c === 2,
            gableL: sec.small && c === 0, gableR: !sec.small && c === sec.cols - 1 });
          if (!sec.small && c === 3) flags.hall = [25 - x0, 36.6 - x0];
        } else if (sec.type === 'studio') {
          const bay = Math.floor(c / 2);
          Object.assign(flags, { balcony: bay !== 1, entrance: c === 2 || c === 3, lantern: c === 2, stair: c === 2 });
        }
        this._column(sec, c, x0, w, flags);
      }
    }
    this._staticParts();
  }

  _column(sec, idx, x0, w, flags) {
    const depth = sec.depth || 16;
    const origin = new THREE.Vector3(x0, 0, sec.z0 || 0);
    const col = { sec, side: 'main', idx: this.columns.length, origin, rotY: 0, depth, w, x0, x1: x0 + w, z0: origin.z, flags, modules: {}, failed: false, coreGone: false, adj: 0 };
    col.toWorld = (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).add(origin);
    CW = w;
    const add = (key, built, opts = {}) => {
      const g = new THREE.Group();
      g.position.copy(origin);
      g.rotation.order = 'YXZ'; // so tilts happen in the facade's own frame
      const og = built.o.build() || tinyBox();
      const mesh = new THREE.Mesh(og, this.matOpaque);
      mesh.castShadow = true; mesh.receiveShadow = true;
      g.add(mesh);
      let glassMesh = null;
      if (built.glass) {
        const gg = built.glass.build();
        if (gg) { glassMesh = new THREE.Mesh(gg, this.matGlass); glassMesh.receiveShadow = true; g.add(glassMesh); }
      }
      this.scene.add(g);
      const bb = og.boundingBox.clone();
      const m = {
        key, col, group: g, mesh, glassMesh, bbox: bb,
        health: 1, hasHealth: !!opts.health, state: 'intact', crackLevel: 0, cracks: [],
        weight: opts.weight || 1, adj: 0, shake: 0, lean: 0, y0: opts.y0 ?? bb.min.y, y1: opts.y1 ?? bb.max.y,
        kind: opts.kind || 'facade',
      };
      col.modules[key] = m;
      this.modules.push(m);
      return m;
    };
    const fl = (f) => ({ health: true, y0: FLOORS[f], y1: FLOORS[f + 1] });
    if (sec.type === 'studio') {
      for (let f = 0; f < 3; f++) add('f' + f, buildStudioFloor(f, flags), fl(f));
      add('rL', buildAtelierRoof(depth, flags), { health: true, y0: EAVE, y1: ROOF_LOW, kind: 'roof' });
      add('rU', buildStudioUpper(depth, flags), { kind: 'roof' });
      add('rB', buildStudioRear(depth), { kind: 'roof' });
    } else if (sec.type === 'side') {
      for (let f = 0; f < 2; f++) add('f' + f, buildSideFloor(f, flags), fl(f));
      add('f2', buildMansard(depth, flags), { health: true, y0: S_EAVE, y1: S_BREAK, kind: 'roof' });
      add('rL', buildSideUpper(depth), { health: true, y0: S_BREAK, y1: S_RIDGE, kind: 'roof' });
      add('rU', buildSideRidge(depth, flags), { kind: 'roof' });
      add('rB', buildSideRear(depth), { kind: 'roof' });
    }
    add('core', buildCore(depth, flags, sec), { weight: 3, kind: 'core' });
    this.columns.push(col);
  }

  _staticParts() {
    const o = new Geo();
    // south-west end wall (gambrel gable above is part of the first column's ridge module)
    o.box(MAIN_X0 - 0.55, 0, -16, MAIN_X0, S_EAVE, 0, C.plaster2);
    o.box(MAIN_X0 - 0.7, 0, -16.1, MAIN_X0, 0.9, 0.12, C.stone);
    for (let f = 0; f < 2; f++) for (const z of [-4, -12]) o.box(MAIN_X0 - 0.62, FLOORS[f] + 1.2, z - 0.7, MAIN_X0 - 0.5, FLOORS[f + 1] - 0.8, z + 0.7, C.frame, 0);
    // north-east end wall of the gambrel section (the gambrel gable above is part of its last column)
    o.box(MAIN_X1, 0, -16, MAIN_X1 + 0.55, S_EAVE, 0, C.plaster2);
    o.box(MAIN_X1, 0, -16.1, MAIN_X1 + 0.7, 0.9, 0.12, C.stone);
    for (let f = 0; f < 2; f++) for (const z of [-4, -12]) o.box(MAIN_X1 + 0.5, FLOORS[f] + 1.2, z - 0.7, MAIN_X1 + 0.62, FLOORS[f + 1] - 0.8, z + 0.7, C.frame, 0);
    // entrance steps, centred on the porch (the joint in the middle of the studio section)
    const porch = this.columns.find(c => c.flags.entrance && c.flags.half === 'L');
    const ex0 = porch.x1 - 2.3, ex1 = porch.x1 + 2.3;
    for (let s = 0; s < 3; s++) o.box(ex0 + s * 0.15, 0, -1.5, ex1 - s * 0.15, 0.17 * (s + 1), 1.4 - s * 0.45, C.stone, 0.01);
    const mesh = new THREE.Mesh(o.build(), this.matOpaque);
    mesh.castShadow = true; mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.staticMesh = mesh;
    this.colliders.push({ minX: ex0, maxX: ex1, minZ: 0, maxZ: 1.4, top: 0.51, kind: 'steps' });
  }

  // ---------- queries ----------

  columnAt(x) { return this.columns.find(c => x >= c.x0 && x < c.x1) || null; }

  // Which facade module does a scaffold cell (world box) lean against?
  moduleForCell(cx, cy, cz, S) {
    if (!(cz > 0 && cz < 0.3 + S + 0.01)) return null;
    const col = this.columnAt(cx);
    if (!col) return null;
    for (const key of ['f0', 'f1', 'f2', 'rL']) {
      const m = col.modules[key];
      if (cy >= m.y0 - 0.01 && cy < m.y1) return m.state === 'fallen' ? null : m;
    }
    return null;
  }

  // Is a point inside the footprint of a column that has not collapsed yet?
  solidAt(x, z) {
    const c = this.columnAt(x);
    if (!c) return false;
    return z < c.z0 + 0.05 && z > c.z0 - c.depth - (c.flags.stair ? 4.5 : 0) && !c.coreGone;
  }

  // Is a point inside a column that has fully collapsed (so scaffolding may grow there)?
  isRuinAt(x, z) {
    const c = this.columnAt(x);
    return !!(c && c.coreGone && z < c.z0 && z > c.z0 - c.depth);
  }

  // ---------- the final state ----------
  // Columns that have not started to come down yet.
  standing() { return this.columns.filter(c => !c.failed); }

  // Completely destroyed: every column has collapsed into rubble, nothing is still falling or
  // sinking, and the two end walls (static geometry, otherwise indestructible) have gone too.
  allDown() {
    return this.columns.every(c => c.coreGone) && this.falling.length === 0 && this.sinking.length === 0 && !!this.staticGone;
  }

  // The end walls and the entrance steps sink into the ruins (the last thing standing).
  collapseStatic() {
    if (this.staticSink || this.staticGone) return;
    this.staticSink = { t: 0, vy: 0 };
    for (const x of [MAIN_X0, MAIN_X1]) { this.fx.dust(new THREE.Vector3(x, 3, -8), 14, 5); this.audio.creak(new THREE.Vector3(x, 4, -8), 1.2, 0.5); }
  }

  // How much of the building is left: fallen modules count nothing, damaged ones only as much as
  // they have left (so cracks, broken windows and leaning walls show up as lost integrity, not
  // just whole pieces falling down).
  integrity() {
    let w = 0;
    for (const m of this.modules) if (m.state !== 'fallen') w += m.weight * (m.hasHealth ? 0.35 + 0.65 * m.health : 1);
    return w / this.totalWeight;
  }

  // ---------- damage ----------

  damage(m, amount, { source = null, quiet = false } = {}) {
    if (!m || !m.hasHealth || m.state === 'fallen' || m.state === 'falling' || m.col.protected) return;   // protected: left for the walking scaffold
    const before = m.health;
    m.health = Math.max(0, m.health - amount);
    m.shake = Math.min(1, m.shake + amount * 3);
    const c = this._center(m);
    if (before >= 0.8 && m.health < 0.8) this._crack(m, 1);
    if (before >= 0.55 && m.health < 0.55) {
      this._crack(m, 2);
      if (m.glassMesh && m.glassMesh.visible) {
        m.glassMesh.visible = false;
        this.fx.shards(c, m.col.rotY);
        this.audio.glass(c);
      }
    }
    if (before >= 0.3 && m.health < 0.3) {
      this._crack(m, 3);
      m.lean = 0.012 + Math.random() * 0.018;
      this.fx.chunks(c, 4, m.kind === 'roof' ? 'slate' : 'plaster', m.col.rotY);
      if (!quiet) this.audio.crumble(c, 0.6, 0.8);
    }
    if (!quiet && amount > 0.08) this.fx.dust(c.clone().add(this._normal(m).multiplyScalar(0.5)), 3, 1.2);
    if (m.health <= 0) this.topple(m);
  }

  _normal(m) { return new THREE.Vector3(0, 0, 1).applyAxisAngle(THREE.Object3D.DEFAULT_UP, m.col.rotY); }

  _center(m) {
    const c = new THREE.Vector3();
    m.bbox.getCenter(c);
    return m.group.localToWorld(c);
  }

  // Jagged crack lines drawn just in front of the wall face.
  _crack(m, level) {
    if (m.crackLevel >= level || m.kind !== 'facade') return;
    m.crackLevel = level;
    const parts = [];
    const n = level === 1 ? 2 : 3;
    for (let k = 0; k < n; k++) {
      const W = m.col.w;
      let x = 0.3 + Math.random() * (W - 0.6), y = m.y0 + Math.random() * (m.y1 - m.y0);
      let a = Math.random() * Math.PI * 2;
      const steps = 6 + Math.floor(Math.random() * 6);
      for (let s = 0; s < steps; s++) {
        a += (Math.random() - 0.5) * 1.4;
        const len = 0.2 + Math.random() * 0.35;
        const nx = x + Math.cos(a) * len, ny = y + Math.sin(a) * len;
        const g = new THREE.PlaneGeometry(len, 0.035 + Math.random() * 0.05 * level);
        g.rotateZ(a);
        g.translate((x + nx) / 2, (y + ny) / 2, 0.012);
        parts.push(g);
        x = THREE.MathUtils.clamp(nx, 0.05, W - 0.05); y = THREE.MathUtils.clamp(ny, m.y0 + 0.05, m.y1 - 0.05);
      }
    }
    const mesh = new THREE.Mesh(mergeGeometries(parts), this.matCrack);
    m.group.add(mesh);
    m.cracks.push(mesh);
  }

  // A facade or mansard module detaches and falls into the courtyard.
  topple(m, delay = 0) {
    if (m.state === 'falling' || m.state === 'fallen' || m.state === 'pending') return;
    if (delay > 0) {
      m.state = 'pending';
      this.timers.push({ t: delay, fn: () => { m.state = 'intact'; this.topple(m); } });
      return;
    }
    m.state = 'falling';
    m.health = 0;
    const center = this._center(m);
    const pivot = new THREE.Object3D();
    pivot.position.copy(center);
    this.scene.add(pivot);
    pivot.attach(m.group);
    const n = this._normal(m);
    const axis = new THREE.Vector3(1, 0, 0).applyAxisAngle(THREE.Object3D.DEFAULT_UP, m.col.rotY);
    const body = {
      m, pivot, n, axis,
      vel: n.clone().multiplyScalar(1.2 + Math.random() * 1.6).add(new THREE.Vector3(0, 0.5, 0)),
      spin: 0.9 + Math.random() * 1.2, angle: 0, landed: false, settle: 0,
      half: new THREE.Vector3(), corners: [],
    };
    const bb = m.bbox;
    for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) body.corners.push(new THREE.Vector3(x, y, z));
    this.falling.push(body);
    if (m.glassMesh && m.glassMesh.visible) { m.glassMesh.visible = false; this.fx.shards(center, m.col.rotY); this.audio.glass(center); }
    this.fx.dust(center, 6, 2.2);
    this.audio.crumble(center, 1.2, 1.2);
    // whatever rested on this module loses its support
    const col = m.col, order = ['f0', 'f1', 'f2', 'rL'];
    const idx = order.indexOf(m.key);
    if (idx >= 0) {
      for (let k = idx + 1; k < order.length; k++) this.topple(col.modules[order[k]], 0.25 + (k - idx) * 0.18);
      const fallenFloors = ['f0', 'f1', 'f2'].filter(key => col.modules[key].state !== 'intact').length;
      if (fallenFloors >= 2 || m.key === 'f0') this.collapseCore(col, 1.4);
    }
  }

  // Interior, back wall and roof drop vertically into their own footprint.
  collapseCore(col, delay = 0) {
    if (col.failed) return;
    col.failed = true;
    this.timers.push({ t: delay, fn: () => {
      for (const key of ['f0', 'f1', 'f2', 'rL']) this.topple(col.modules[key], Math.random() * 0.4);
      const parts = ['core', 'rU', 'rB'].map(k => col.modules[k]).filter(m => m.state === 'intact');
      parts.forEach(m => { m.state = 'falling'; });
      const center = col.toWorld(col.w / 2, 2, -col.depth / 2);
      this.sinking.push({ col, parts, t: 0, vy: 0, center });
      this.audio.creak(center, 1.4, 0.6);
    } });
    // neighbours feel it
    for (const other of this.columns) {
      if (other.side === col.side && Math.abs(other.idx - col.idx) === 1) {
        for (const key of ['f0', 'f1', 'f2', 'rL']) this.damage(other.modules[key], 0.05 + Math.random() * 0.1, { quiet: true });
      }
    }
  }

  // Start a structural failure in a column (used by the Reversal stage).
  failColumn(col) {
    const keys = ['f0', 'f1', 'f2', 'rL'].filter(k => col.modules[k].state === 'intact');
    if (!keys.length) { this.collapseCore(col, 0.2); return; }
    const k = keys[Math.floor(Math.random() * keys.length)];
    this.damage(col.modules[k], 2);
  }

  // ---------- simulation ----------

  update(dt, demonDt) {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) { this.timers.splice(i, 1); tm.fn(); }
    }
    // stressed modules tremble and lean
    for (const m of this.modules) {
      if (m.state !== 'intact' && m.state !== 'pending') continue;
      if (m.shake > 0.001 || m.lean > 0) {
        m.shake *= Math.exp(-dt * 4);
        const s = m.shake * 0.05;
        m.group.position.set(
          m.col.origin.x + (Math.random() - 0.5) * s,
          (Math.random() - 0.5) * s,
          m.col.origin.z + (Math.random() - 0.5) * s,
        );
        m.group.rotation.x = m.lean * Math.min(1, (1 - m.health) * 2);
      }
    }
    this._updateFalling(dt);
    this._updateSinking(dt);
    if (this.staticSink) {
      const s = this.staticSink;
      s.t += dt;
      if (s.t > 0.5) { s.vy += 9 * dt; this.staticMesh.position.y -= s.vy * dt; }
      else this.staticMesh.position.x = (Math.random() - 0.5) * 0.1;
      if (Math.random() < dt * 8) this.fx.dust(new THREE.Vector3(Math.random() < 0.5 ? MAIN_X0 : MAIN_X1, 0.6, -Math.random() * 16), 2, 3);
      if (this.staticMesh.position.y < -S_EAVE - 2) {
        this.staticMesh.visible = false;
        this.staticSink = null; this.staticGone = true;
        this.colliders = this.colliders.filter(c => c.kind !== 'steps');
        for (const x of [MAIN_X0, MAIN_X1]) this.audio.impact(new THREE.Vector3(x, 1, -8), 1.6);
      }
    }
  }

  _updateFalling(dt) {
    const tmp = new THREE.Vector3(), q = new THREE.Quaternion();
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const b = this.falling[i];
      if (!b.landed) {
        b.vel.y -= 16 * dt;
        b.pivot.position.addScaledVector(b.vel, dt);
        b.angle += b.spin * dt;
        b.spin += 1.4 * dt;
        q.setFromAxisAngle(b.axis, b.angle);
        b.pivot.quaternion.copy(q);
        b.pivot.updateMatrixWorld(true);
        let minY = Infinity;
        for (const c of b.corners) {
          tmp.copy(c).applyMatrix4(b.m.group.matrixWorld);
          minY = Math.min(minY, tmp.y);
        }
        if (minY <= 0) {
          b.pivot.position.y -= minY;
          b.landed = true;
          b.from = b.pivot.quaternion.clone();
          // rest lying flat, face up or face down depending on how far it rotated
          const target = b.angle % (Math.PI * 2) > Math.PI ? -Math.PI / 2 + Math.PI * 2 : Math.PI / 2;
          b.to = new THREE.Quaternion().setFromAxisAngle(b.axis, target + (Math.random() - 0.5) * 0.2);
          b.fromPos = b.pivot.position.clone();
          const size = b.m.weight * (b.m.bbox.max.y - b.m.bbox.min.y) / 4;
          const p = b.pivot.position.clone(); p.y = 0.3;
          this.fx.dust(p, 14, 3.5);
          this.fx.chunks(p, 10, b.m.kind === 'roof' ? 'slate' : 'plaster', b.m.col.rotY);
          this.fx.ring(p, 5);
          this.audio.impact(p, Math.max(0.6, size));
          if (this.onImpact) this.onImpact(p, size);
        }
      } else {
        b.settle = Math.min(1, b.settle + dt * 2.2);
        const e = 1 - Math.pow(1 - b.settle, 3);
        b.pivot.quaternion.slerpQuaternions(b.from, b.to, e);
        b.pivot.updateMatrixWorld(true);
        let minY = Infinity;
        for (const c of b.corners) { tmp.copy(c).applyMatrix4(b.m.group.matrixWorld); minY = Math.min(minY, tmp.y); }
        b.pivot.position.y -= minY - 0.0;
        b.pivot.position.addScaledVector(b.n, dt * (1 - e) * 1.5);
        if (b.settle >= 1) {
          this.falling.splice(i, 1);
          b.m.state = 'fallen';
          b.pivot.updateMatrixWorld(true);
          const box = new THREE.Box3().setFromObject(b.m.group);
          if (box.min.z > 0.2 || box.max.x < 33.8) {
            this.colliders.push({ minX: box.min.x + 0.2, maxX: box.max.x - 0.2, minZ: Math.max(0.3, box.min.z + 0.2), maxZ: box.max.z - 0.2, top: Math.min(box.max.y, 1.4), kind: 'rubble' });
          }
        }
      }
    }
  }

  _updateSinking(dt) {
    for (let i = this.sinking.length - 1; i >= 0; i--) {
      const s = this.sinking[i];
      s.t += dt;
      if (s.t < 0.8) {
        for (const m of s.parts) {
          m.group.position.x = m.col.origin.x + (Math.random() - 0.5) * 0.12;
          m.group.position.z = m.col.origin.z + (Math.random() - 0.5) * 0.12;
        }
        continue;
      }
      s.vy += 9 * dt;
      for (const m of s.parts) {
        m.group.position.y -= s.vy * dt;
        m.group.rotation.x = Math.min(0.08, m.group.rotation.x + dt * 0.04);
      }
      if (Math.random() < dt * 14) {
        const p = s.col.toWorld(Math.random() * s.col.w, 0.5, -Math.random() * s.col.depth);
        this.fx.dust(p, 2, 3);
      }
      if (Math.random() < dt * 6) this.audio.crumble(s.center, 1.4, 0.6);
      if (s.parts.length === 0 || s.parts[0].group.position.y < -FLOORS[3] - 9) {
        for (const m of s.parts) { m.state = 'fallen'; m.group.visible = false; }
        this._rubbleHeap(s.col);
        s.col.coreGone = true;
        this.sinking.splice(i, 1);
        this.audio.impact(s.center, 2);
        if (this.onImpact) this.onImpact(s.center, 2.5);
      } else if (s.t > 0.8 && !s.hit) {
        s.hit = true;
        this.fx.dust(s.col.toWorld(s.col.w / 2, 1, 1), 18, 5);
      }
    }
  }

  _rubbleHeap(col) {
    const o = new Geo();
    const cols = [C.plaster, C.plaster2, C.tile, C.stone, C.interior, C.slab];
    for (let i = 0; i < 26; i++) {
      const lx = Math.random() * col.w, lz = -0.8 - Math.random() * (col.depth - 1.5);
      const s = 0.4 + Math.random() * 1.6;
      const h = Math.random() * 1.6;
      const g = new THREE.BoxGeometry(s, s * 0.6, s * (0.6 + Math.random()));
      g.rotateX(Math.random() * 3); g.rotateY(Math.random() * 3); g.rotateZ(Math.random() * 3);
      g.translate(lx, h, lz);
      o._push(g, cols[Math.floor(Math.random() * cols.length)], 0.05);
    }
    const mesh = new THREE.Mesh(o.build(), this.matOpaque);
    mesh.position.copy(col.origin);
    mesh.rotation.y = col.rotY;
    mesh.castShadow = mesh.receiveShadow = true;
    this.scene.add(mesh);
  }
}
