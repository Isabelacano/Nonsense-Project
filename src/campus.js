// The buildings round the courtyard (see CFG.site; footprints from OpenStreetMap,
// © OpenStreetMap contributors, ODbL): the Van-de-Velde-Bau (the L-shaped former
// Kunstgewerbeschule opposite the main building, deliberately lower so it would not take the
// studios' light) and its mirrored, white counterpart on the east side (replacing the separate
// M18 / Marienstraße 16 blocks, as requested), Geschwister-Scholl-Straße 15 (Campus.Office) kept
// as a separate building between them, the Liszt-Haus, and the Kubus and Belvederer Allee 1
// behind the main building.
// Massing, roof form and colour follow the OSM tags; facades are simplified and stylised.
// These buildings never collapse, so they are static and solid.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CFG } from './config.js';
import { toon } from './toon.js';

class Geo {
  constructor() { this.parts = []; }
  push(g, color, jitter = 0.025) {
    const g2 = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(g2.attributes)) if (k !== 'position' && k !== 'normal') g2.deleteAttribute(k);
    const c = new THREE.Color(color);
    if (jitter) c.offsetHSL((Math.random() - 0.5) * jitter * 0.5, 0, (Math.random() - 0.5) * jitter * 1.6);
    const n = g2.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g2.setAttribute('color', new THREE.BufferAttribute(a, 3));
    this.parts.push(g2);
  }
  box(x0, y0, z0, x1, y1, z1, color, jitter) {
    const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.push(g, color, jitter);
  }
  // hipped or mansard roof over a rectangle: a four-sided frustum
  hip(x0, x1, z0, z1, y, h, inset, color) {
    // bottom corners overhang the walls a little; the top is inset (a point if inset >= half width)
    const ov = 0.4;
    const b = [[x0 - ov, z0 - ov], [x1 + ov, z0 - ov], [x1 + ov, z1 + ov], [x0 - ov, z1 + ov]];
    const ix = Math.min(inset, (x1 - x0) / 2 - 0.01), iz = Math.min(inset, (z1 - z0) / 2 - 0.01);
    const t = [[x0 + ix, z0 + iz], [x1 - ix, z0 + iz], [x1 - ix, z1 - iz], [x0 + ix, z1 - iz]];
    const P = [];
    const tri = (a, c, d) => P.push(...a, ...c, ...d);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const B0 = [b[i][0], y, b[i][1]], B1 = [b[j][0], y, b[j][1]], T0 = [t[i][0], y + h, t[i][1]], T1 = [t[j][0], y + h, t[j][1]];
      tri(B0, T0, B1); tri(B1, T0, T1);  // outward winding (corners run clockwise seen from above)
    }
    const T = t.map(([x, z]) => [x, y + h, z]);
    tri(T[0], T[3], T[2]); tri(T[0], T[2], T[1]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.computeVertexNormals();
    this.push(g, color, 0.02);
  }
  // a gabled / mansard profile in the x-y plane, extruded along z
  profileZ(points, z0, z1, color) {
    const sh = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: z1 - z0, bevelEnabled: false });
    g.translate(0, 0, z0);
    this.push(g, color, 0.02);
  }
  build() { const g = mergeGeometries(this.parts, false); g.computeBoundingSphere(); return g; }
}


// Offset a polygon (array of [x, z]) inwards by d (negative: outwards), mitring the corners,
// so convex corners become hips and concave corners valleys when the insets are lofted.
function inset(poly, d) {
  let area = 0;
  for (let i = 0; i < poly.length; i++) { const [x0, z0] = poly[i], [x1, z1] = poly[(i + 1) % poly.length]; area += x0 * z1 - x1 * z0; }
  const sgn = area > 0 ? 1 : -1;
  const nrm = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz); return [-dz / l * sgn, dx / l * sgn]; };
  return poly.map((p, i) => {
    const prev = poly[(i - 1 + poly.length) % poly.length], next = poly[(i + 1) % poly.length];
    const n1 = nrm(prev, p), n2 = nrm(p, next);
    let mx = n1[0] + n2[0], mz = n1[1] + n2[1];
    const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
    const k = d / Math.max(0.25, mx * n1[0] + mz * n1[1]);
    return [p[0] + mx * k, p[1] + mz * k];
  });
}

// One ring of roof between two outlines at two heights; every face turned outwards/upwards.
function loft(o, A, ya, B, yb, color) {
  const P = [];
  const v = new THREE.Vector3(), w = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < A.length; i++) {
    const j = (i + 1) % A.length;
    const a0 = [A[i][0], ya, A[i][1]], a1 = [A[j][0], ya, A[j][1]], b0 = [B[i][0], yb, B[i][1]], b1 = [B[j][0], yb, B[j][1]];
    v.set(a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]); w.set(b0[0] - a0[0], b0[1] - a0[1], b0[2] - a0[2]);
    n.crossVectors(v, w);
    if (n.y > 0) P.push(...a0, ...a1, ...b0, ...a1, ...b1, ...b0);
    else P.push(...a0, ...b0, ...a1, ...a1, ...b0, ...b1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.computeVertexNormals();
  o.push(g, color, 0.015);
}

// rows of windows on one face of a block; face: 'n' (+z), 's' (-z), 'e' (+x), 'w' (-x)
function windows(o, glass, [x0, x1, z0, z1], face, rows, { w = 1.3, h = 1.8, gap = 3.2, y0 = 1.2, frame = '#3b4a66', inset = 0 } = {}) {
  const along = face === 'n' || face === 's' ? [x0, x1] : [z0, z1];
  const len = along[1] - along[0], n = Math.max(1, Math.floor((len - 1.5) / gap));
  for (let r = 0; r < rows.length; r++) for (let i = 0; i < n; i++) {
    const c = along[0] + (len - (n - 1) * gap) / 2 + i * gap, y = rows[r] + y0 * 0;
    const ww = w, hh = h;
    if (face === 'n') { glass.box(c - ww / 2, y, z1 + 0.01 - inset, c + ww / 2, y + hh, z1 + 0.06 - inset, frame, 0); o.box(c - ww / 2 - 0.1, y - 0.12, z1, c + ww / 2 + 0.1, y, z1 + 0.15, '#e6d6b2', 0); }
    if (face === 's') glass.box(c - ww / 2, y, z0 - 0.06, c + ww / 2, y + hh, z0 - 0.01, frame, 0);
    if (face === 'e') { glass.box(x1 + 0.01, y, c - ww / 2, x1 + 0.06, y + hh, c + ww / 2, frame, 0); o.box(x1, y - 0.12, c - ww / 2 - 0.1, x1 + 0.15, y, c + ww / 2 + 0.1, '#e6d6b2', 0); }
    if (face === 'w') { glass.box(x0 - 0.06, y, c - ww / 2, x0 - 0.01, y + hh, c + ww / 2, frame, 0); o.box(x0 - 0.15, y - 0.12, c - ww / 2 - 0.1, x0, y, c + ww / 2 + 0.1, '#e6d6b2', 0); }
  }
}

export function createCampus(scene) {
  const site = CFG.site;
  const o = new Geo(), glass = new Geo();
  const colliders = [];
  const solid = (r, top = 99) => colliders.push({ minX: r[0], maxX: r[1], minZ: r[2], maxZ: r[3], top, kind: 'building' });

  // --- The two L-shaped wings round the courtyard ---
  // The Van-de-Velde-Bau (west) is one continuous L: the arm along the lawn and the arm facing
  // the main building, meeting at the chamfered corner from the OSM outline. The east side is
  // its mirror image across the courtyard axis (x = 0.25, the main building's centre line): a
  // white perpendicular wing where M18 stands, joined at the same kind of corner to an arm facing
  // the main building. That arm stops short of No. 15, which stays a separate building.
  // Both: lower than the main building, big studio windows between pilasters, a steep mansard
  // lofted over the whole L so the arms meet in one clean valley.
  const lHouse = (L, { wall, pilaster, plinth: plinthC = '#d8c6a6', A, B, mirror }) => {
    const wallH = 6.2;
    const shape = new THREE.Shape(L.map(([x, z]) => new THREE.Vector2(x, -z)));
    const walls = new THREE.ExtrudeGeometry(shape, { depth: wallH, bevelEnabled: false });
    walls.rotateX(-Math.PI / 2);
    o.push(walls, wall, 0.012);
    const plinth = new THREE.ExtrudeGeometry(new THREE.Shape(inset(L, -0.12).map(([x, z]) => new THREE.Vector2(x, -z))), { depth: 0.8, bevelEnabled: false });
    plinth.rotateX(-Math.PI / 2);
    o.push(plinth, plinthC, 0);
    // mansard: rings of tile courses climbing through inset copies of the outline
    const tiers = [[-0.45, wallH], [0.7, wallH + 1.0], [1.5, wallH + 1.9], [2.3, wallH + 2.8], [2.9, wallH + 3.4], [4.0, wallH + 3.8], [5.0, wallH + 4.15], [5.8, wallH + 4.35]];
    const roofCols = ['#8a4a3a', '#7f4436', '#8a4a3a', '#93503e', '#7a4234', '#83483a', '#7a4234'];
    for (let t = 0; t < tiers.length - 1; t++) loft(o, inset(L, tiers[t][0]), tiers[t][1], inset(L, tiers[t + 1][0]), tiers[t + 1][1], roofCols[t]);
    const top = new THREE.ShapeGeometry(new THREE.Shape(inset(L, tiers[tiers.length - 1][0]).map(([x, z]) => new THREE.Vector2(x, -z))));
    top.rotateX(-Math.PI / 2); top.translate(0, tiers[tiers.length - 1][1], 0);
    o.push(top, '#74402f', 0);
    // studio windows facing the courtyard and the main building, with the pilaster rhythm
    const inner = mirror ? 'w' : 'e', ax = mirror ? A[0] : A[1], out = mirror ? -1 : 1;
    windows(o, glass, B, 's', [1.0], { w: 2.8, h: 4.2, gap: 4.4 });
    windows(o, glass, A, inner, [1.0], { w: 2.8, h: 4.2, gap: 4.4 });
    for (let x = B[0] + 2.2; x < B[1]; x += 4.4) o.box(x - 0.35, 0, B[2] - 0.35, x + 0.35, wallH + 0.2, B[2], pilaster);
    for (let z = A[2] + 2.2; z < A[3]; z += 4.4) o.box(Math.min(ax, ax + out * 0.35), 0, z - 0.35, Math.max(ax, ax + out * 0.35), wallH + 0.2, z + 0.35, pilaster);
    // the corner: a chamfered entrance bay with a door, where the two arms meet
    const ci = L.findIndex((p, n) => n > 0 && Math.abs(p[0] - L[n - 1][0]) > 0.5 && Math.abs(p[1] - L[n - 1][1]) > 0.5);
    const c0 = L[ci - 1], c1 = L[ci];
    const mx = (c0[0] + c1[0]) / 2, mz = (c0[1] + c1[1]) / 2, ang = Math.atan2(c1[0] - c0[0], c1[1] - c0[1]);
    const nx = Math.cos(ang) * (mirror ? -1 : 1), nz = -Math.sin(ang) * (mirror ? -1 : 1);
    const door = new THREE.BoxGeometry(1.6, 3.0, 0.12); door.rotateY(ang + Math.PI / 2); door.translate(mx - nz * 0.05, 1.5, mz + nx * 0.05);
    glass.push(door, '#3b4a66', 0);
    const canopy = new THREE.BoxGeometry(2.6, 0.18, 1.2); canopy.rotateY(ang + Math.PI / 2); canopy.translate(mx + (mirror ? -0.4 : 0.4), 3.3, mz - 0.4);
    o.push(canopy, pilaster, 0);
    // dormers in the mansard along both arms
    for (let x = B[0] + 3.2; x < B[1] - 2; x += 4.4) { o.box(x - 0.8, wallH + 0.7, B[2] + 0.9, x + 0.8, wallH + 2.3, B[2] + 2.2, wall); glass.box(x - 0.6, wallH + 0.9, B[2] + 0.85, x + 0.6, wallH + 2.1, B[2] + 0.9, '#3b4a66', 0); }
    for (let z = A[2] + 3.2; z < A[3] - 3; z += 4.4) {
      const d0 = ax - out * 2.2, d1 = ax - out * 0.9;
      o.box(Math.min(d0, d1), wallH + 0.7, z - 0.8, Math.max(d0, d1), wallH + 2.3, z + 0.8, wall);
      glass.box(Math.min(d1, d1 + out * 0.05), wallH + 0.9, z - 0.6, Math.max(d1, d1 + out * 0.05), wallH + 2.1, z + 0.6, '#3b4a66', 0);
    }
  };
  {
    // west: the Van-de-Velde-Bau (simplified from OSM way 110288867)
    const L = [[-54.8, 9.0], [-39.9, 9.0], [-39.9, 32.9], [-37.3, 35.7], [-11.6, 35.7], [-11.6, 51.2], [-59.7, 51.2], [-59.7, 34.2], [-54.8, 34.2]];
    lHouse(L, { wall: '#ecd29a', pilaster: '#e3c58a', A: [-54.8, -39.9, 9.0, 32.9], B: [-37.3, -11.6, 35.7, 51.2], mirror: false });
    solid(site.vdvA); solid(site.vdvB);
    // east: the mirror image (x' = 0.5 - x), its front arm trimmed at x = 27 to keep No. 15 separate
    const M = L.map(([x, z]) => [Math.max(27, 0.5 - x), z]).reverse();
    lHouse(M, { wall: '#f2efe8', pilaster: '#e4e0d8', plinth: '#d6cfc2', A: [40.4, 55.3, 9.0, 32.9], B: [27, 37.8, 35.7, 51.2], mirror: true });
    solid(site.eastA); solid(site.eastB);
  }
  // --- Geschwister-Scholl-Straße 15: three storeys, flat roof, light grey ---
  {
    const R = site.no15;
    o.box(R[0], 0, R[2], R[1], 11, R[3], '#d9d6cf');
    o.box(R[0] - 0.15, 11, R[2] - 0.15, R[1] + 0.15, 11.5, R[3] + 0.15, '#b9b5ad', 0);
    for (const y of [1.2, 4.8, 8.3]) glass.box(R[0] + 1, y, R[2] - 0.06, R[1] - 1, y + 2.0, R[2] - 0.01, '#4a5a72', 0); // ribbon windows
    solid(R);
  }
  // --- Liszt-Haus: two storeys, pyramid roof, on the main building's line ---
  {
    const R = site.liszt;
    o.box(R[0], 0, R[2], R[1], 7.5, R[3], '#e9cf98');
    o.hip(R[0], R[1], R[2], R[3], 7.5, 5.0, 5.6, '#a24c38');
    windows(o, glass, R, 'n', [1.2, 4.6], { w: 1.2, h: 1.8, gap: 2.6 });
    solid(R);
  }
  // --- behind the main building: the glass Kubus and Belvederer Allee 1 (seen over the roofs) ---
  o.box(1.5, 0, -48, 20.8, 15, -35.5, '#9fb6c8', 0);
  for (let y = 3; y < 15; y += 3.6) o.box(1.4, y, -48.1, 20.9, y + 0.25, -35.4, '#7f93a8', 0);
  o.box(24, 0, -55, 44.8, 11, -34, '#e2d2b4');
  o.box(23.8, 11, -55.2, 45, 11.4, -33.8, '#c9b48f', 0);

  const mesh = new THREE.Mesh(o.build(), toon('#ffffff', { vertexColors: true }));
  mesh.castShadow = mesh.receiveShadow = true;
  const gmesh = new THREE.Mesh(glass.build(), toon('#5d86a8', { glass: true }));
  gmesh.receiveShadow = true;
  scene.add(mesh, gmesh);
  return { colliders };
}
