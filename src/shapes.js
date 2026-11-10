// Shape helpers for the "inflated, hand-wobbled" shape language: tapered tubes along
// smooth curves (noodle limbs, curly trunks, crooked lamp posts) and puffy blobs with
// flattened bellies (cloud-like foliage). Tubes can be rebuilt in place every frame.
import * as THREE from 'three';

const _p = new THREE.Vector3(), _t = new THREE.Vector3(), _n = new THREE.Vector3(), _b = new THREE.Vector3();
const _prevN = new THREE.Vector3(), _v = new THREE.Vector3(), _q = new THREE.Quaternion();

// A tube whose vertices can be rewritten. radius(t) gives the radius along the curve (t in 0..1).
export class Noodle {
  constructor(segments = 14, radial = 8, radius = () => 0.05) {
    this.seg = segments; this.rad = radial; this.radius = radius;
    const verts = (segments + 1) * (radial + 1) + 2 * (radial + 2);
    this.pos = new Float32Array(verts * 3);
    this.nrm = new Float32Array(verts * 3);
    const idx = [];
    const ring = (s) => s * (radial + 1);
    for (let s = 0; s < segments; s++) for (let r = 0; r < radial; r++) {
      const a = ring(s) + r, b = ring(s + 1) + r, c = ring(s + 1) + r + 1, d = ring(s) + r + 1;
      idx.push(a, d, b, b, d, c);
    }
    // round-ish caps: a fan at each end
    this.capBase = (segments + 1) * (radial + 1);
    for (let e = 0; e < 2; e++) {
      const base = this.capBase + e * (radial + 2), centre = base + radial + 1;
      for (let r = 0; r < radial; r++) e ? idx.push(base + r, base + r + 1, centre) : idx.push(base + r + 1, base + r, centre);
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(idx);
    this.curve = new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)], false, 'catmullrom', 0.5);
  }

  // Rebuild along the given points (array of Vector3, copied into the curve).
  update(points) {
    const c = this.curve;
    while (c.points.length < points.length) c.points.push(new THREE.Vector3());
    c.points.length = points.length;
    points.forEach((p, i) => c.points[i].copy(p));
    const S = this.seg, R = this.rad, P = this.pos, N = this.nrm;
    _prevN.set(0, 0, 0);
    for (let s = 0; s <= S; s++) {
      const t = s / S;
      c.getPointAt(t, _p);
      c.getTangentAt(t, _t).normalize();
      // parallel-transport frame so the tube never twists
      if (s === 0) {
        _n.set(0, 0, 1);
        if (Math.abs(_t.dot(_n)) > 0.9) _n.set(1, 0, 0);
        _n.sub(_v.copy(_t).multiplyScalar(_t.dot(_n))).normalize();
      } else {
        _n.copy(_prevN).sub(_v.copy(_t).multiplyScalar(_t.dot(_prevN))).normalize();
      }
      _prevN.copy(_n);
      _b.crossVectors(_t, _n);
      const r = this.radius(t);
      for (let k = 0; k <= R; k++) {
        const a = (k / R) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const i = (s * (R + 1) + k) * 3;
        const nx = _n.x * ca + _b.x * sa, ny = _n.y * ca + _b.y * sa, nz = _n.z * ca + _b.z * sa;
        N[i] = nx; N[i + 1] = ny; N[i + 2] = nz;
        P[i] = _p.x + nx * r; P[i + 1] = _p.y + ny * r; P[i + 2] = _p.z + nz * r;
      }
      if (s === 0 || s === S) {
        const e = s === 0 ? 0 : 1, base = this.capBase + e * (R + 2);
        for (let k = 0; k <= R; k++) {
          const src = (s * (R + 1) + k) * 3, dst = (base + k) * 3;
          P[dst] = P[src]; P[dst + 1] = P[src + 1]; P[dst + 2] = P[src + 2];
          N[dst] = (e ? _t.x : -_t.x); N[dst + 1] = (e ? _t.y : -_t.y); N[dst + 2] = (e ? _t.z : -_t.z);
        }
        const cdst = (base + R + 1) * 3, bulge = r * 0.6 * (e ? 1 : -1);
        P[cdst] = _p.x + _t.x * bulge; P[cdst + 1] = _p.y + _t.y * bulge; P[cdst + 2] = _p.z + _t.z * bulge;
        N[cdst] = e ? _t.x : -_t.x; N[cdst + 1] = e ? _t.y : -_t.y; N[cdst + 2] = e ? _t.z : -_t.z;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;
    this.geo.computeBoundingSphere();
    return this.geo;
  }
}

// One-off static tube (trunks, lamp posts). Returns a fresh BufferGeometry.
export function tubeGeometry(points, radius, segments = 16, radial = 8) {
  const n = new Noodle(segments, radial, radius);
  n.update(points);
  const g = n.geo;
  g.attributes.position.setUsage(THREE.StaticDrawUsage);
  return g;
}

// Puffy blob: a sphere with a flattened, tucked-in belly and a slightly lumpy skin.
export function puffGeometry(detail = 3, { belly = 0.35, lump = 0.06, seed = 1 } = {}) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  let s = seed;
  const ph = [1, 2, 3].map(() => ((s = (s * 16807) % 2147483647) / 2147483647) * 6.28);
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i);
    const l = 1 + lump * (Math.sin(_v.x * 3.1 + ph[0]) * Math.sin(_v.y * 2.7 + ph[1]) + Math.sin(_v.z * 3.7 + ph[2]) * 0.6);
    _v.multiplyScalar(l);
    if (_v.y < 0) _v.y *= belly;
    p.setXYZ(i, _v.x, _v.y, _v.z);
  }
  g.computeVertexNormals();
  return g;
}

// Bend a geometry along +y: x offset grows with height^2 (for leaning, cartoon trunks).
export function bendY(g, amount, height) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / height;
    p.setX(i, p.getX(i) + amount * y * y);
  }
  g.computeVertexNormals();
  return g;
}

export const rotY = (v, a) => v.applyQuaternion(_q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, a));
