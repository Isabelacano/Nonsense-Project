// The scaffolding lattice: data, rendering and per-bay animation.
// One "bay" fills one lattice cell. Bays are drawn with instanced tubes and boards,
// so hundreds of them stay cheap. All animation here runs on *demon time*.
// Decisions about where to grow live in demon.js.
//
// Character: ordinary scaffolding that behaves wrongly. Periwinkle-steel tubes, round
// knuckle couplers, caramel decks, little rubber feet that patter when a stack slides,
// and a jelly-like ripple that runs through the whole frame whenever it is disturbed
// (the same displacement field moves every part, so joints never come apart).
// Every so often, briefly, eyes open somewhere in the metal — see the "peek" section.
import * as THREE from 'three';
import { CFG } from './config.js';
import { netTexture } from './textures.js';
import { toon, PAL } from './toon.js';

const { S, x0: X0, z0: Z0 } = CFG.grid;
const UP = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const H = S / 2;

class Pool {
  constructor(scene, geo, mat, cap, shadow = true) {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = shadow;
    this.mesh.receiveShadow = true;
    this.mesh.count = 0;
    this.mesh.userData.ink = true;   // the scaffold is outlined, like the characters
    this.free = [];
    this.next = 0;
    this.cap = cap;
    scene.add(this.mesh);
  }
  alloc() {
    const i = this.free.length ? this.free.pop() : (this.next < this.cap ? this.next++ : -1);
    if (i >= 0 && i + 1 > this.mesh.count) this.mesh.count = i + 1;
    return i;
  }
  release(i) { if (i >= 0) { this.mesh.setMatrixAt(i, ZERO); this.free.push(i); this.dirty = true; } }
  set(i, m) { if (i >= 0) { this.mesh.setMatrixAt(i, m); this.dirty = true; } }
  color(i, c) { if (i >= 0 && this.mesh.instanceColor) { this.mesh.setColorAt(i, c); this.colorDirty = true; } }
  tint(c) { for (let i = 0; i < this.cap; i++) this.mesh.setColorAt(i, c); }
  flush() {
    if (this.dirty) { this.mesh.instanceMatrix.needsUpdate = true; this.dirty = false; }
    if (this.colorDirty) { this.mesh.instanceColor.needsUpdate = true; this.colorDirty = false; }
  }
}

export const cellKey = (i, j, k) => `${i},${j},${k}`;
export const cellCenter = (i, j, k, out = new THREE.Vector3()) => out.set(X0 + (i + 0.5) * S, (j + 0.5) * S, Z0 + (k + 0.5) * S);
export const cellOfPoint = (x, y, z) => [Math.floor((x - X0) / S), Math.floor(y / S), Math.floor((z - Z0) / S)];

const fractf = (x) => x - Math.floor(x);
function easeOutBack(t) { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }

// Where eyes may open, in a bay's local frame (outer face is +z).
const PEEK_SPOTS = [
  { at: (r) => new THREE.Vector3(r() < 0.5 ? -H : H, S - 0.04, H), n: 1, size: 0.22, kind: 'knuckle' },  // a coupler opens an eye
  { at: (r) => new THREE.Vector3((r() - 0.5) * 0.8, 0.17, H - 0.05), n: 2, size: 0.16, kind: 'underdeck' }, // peeking under a board
  { at: (r) => new THREE.Vector3((r() - 0.5) * 0.9, 0.76, H + 0.03), n: 2, size: 0.19, kind: 'rails' },     // between the rails
  { at: (r) => new THREE.Vector3((r() - 0.5) * 0.5, 1.1, 0), n: 2, size: 0.2, kind: 'inside' },            // deep in the frame's shadow
  { at: (r) => new THREE.Vector3(r() < 0.5 ? -H : H, 0.5 + r() * 1.1, H), n: 1, size: 0.18, kind: 'standard' }, // on an upright
  { at: (r) => new THREE.Vector3((r() - 0.5) * 0.6, 1.25, H + 0.03), n: 3, size: 0.14, kind: 'cluster' },  // rare: three at once
];

export class Scaffold {
  constructor(scene, fx, audio) {
    this.scene = scene;
    this.fx = fx;
    this.audio = audio;
    this.bays = new Map();
    this.list = [];
    const tubeMat = toon('#ffffff');   // colour per instance: steel, warming when agitated
    const boardMat = toon('#c98a4b');
    const toeMat = toon('#b8503c');
    const knuckleMat = toon('#3a3f58');
    const footMat = toon('#3a3550');
    const netMat = toon('#e8e2c8', { alphaMap: netTexture(), transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false });
    const cap = CFG.maxBays + 40;
    this.tubes = new Pool(scene, new THREE.CylinderGeometry(1, 1, 1, 10, 1, true), tubeMat, cap * 11);
    const plank = new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
    this.boards = new Pool(scene, plank, boardMat, cap * 1);
    this.toes = new Pool(scene, new THREE.BoxGeometry(1, 1, 1), toeMat, cap * 1);
    this.clamps = new Pool(scene, new THREE.IcosahedronGeometry(1, 1), knuckleMat, cap * 4);
    const foot = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    this.feet = new Pool(scene, foot, footMat, Math.ceil(cap * 0.5) * 4);
    this.nets = new Pool(scene, new THREE.PlaneGeometry(1, 1), netMat, cap, false);
    this.nets.mesh.layers.set(1); // netting is drawn, not outlined
    this.colTube = new THREE.Color(PAL.steel);
    this.colHot = new THREE.Color('#e9785a');
    this._c = new THREE.Color();
    this.tubes.tint(this.colTube);
    // eyes: whites, pupils and steel lids, a handful at most
    const EYES = 12;
    this.whites = new Pool(scene, new THREE.SphereGeometry(1, 16, 12), toon('#fbf3e2'), EYES, false);
    this.pupils = new Pool(scene, new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: '#1d1830' }), EYES, false);
    const lid = new THREE.SphereGeometry(1.08, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    this.lids = new Pool(scene, lid, toon(PAL.steel), EYES, false);
    this.peeks = [];
    this.peekCooldown = 4;
    this.lookAt = null;        // worker head position
    this.watchers = [];        // all worker heads (eyes pick one to stare at)
    this.camera = null;        // set by game: eyes are shy when looked at directly
    this.time = 0;
    this.breath = 0;           // global sway amount (stage driven)
    this.leanTarget = null;    // worker position: bays nearby lean in, menacingly
    this.leanAmount = 0;
    this.cutaway = null;       // { from, to } segment: hide bays blocking the camera
    this.ripples = [];         // jelly waves from disturbances: { o, s, age, r }
    this._m = new THREE.Matrix4();
    this._m2 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._qy = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._qe = new THREE.Quaternion(); this._fwd = new THREE.Vector3();
    this._eyeC = new THREE.Vector3();
    this._ec = new THREE.Vector3(); this._el = new THREE.Vector3(); this._es = new THREE.Vector3();
    this.onChange = null;
  }

  get count() { return this.list.length; }
  get(i, j, k) { return this.bays.get(cellKey(i, j, k)); }
  has(i, j, k) { return this.bays.has(cellKey(i, j, k)); }

  // ---------- creation / removal ----------

  add(i, j, k, { from = null, yaw = 0, net = false, seed = false, delay = 0 } = {}) {
    const key = cellKey(i, j, k);
    if (this.bays.has(key) || this.list.length >= (this.softCap ?? 900)) return null;
    const bay = {
      i, j, k, key, yaw, net,
      seed: Math.random() * 100,
      grow: 0, growDur: seed ? 0.6 : 0.42, delay,
      growAxis: from ? from.clone() : new THREE.Vector3(0, -1, 0),
      offset: new THREE.Vector3(), offsetVel: new THREE.Vector3(),
      shake: 0, cut: false, parts: [], dirty: true, born: this.time, isSeed: seed,
    };
    this._buildParts(bay);
    this.bays.set(key, bay);
    this.list.push(bay);
    if (this.onChange) this.onChange('add', bay);
    return bay;
  }

  _buildParts(bay) {
    const h = H, P = bay.parts;
    const tube = (ax, ay, az, bx, by, bz, r = 0.032) => P.push({ pool: this.tubes, slot: this.tubes.alloc(), a: new THREE.Vector3(ax, ay, az), b: new THREE.Vector3(bx, by, bz), r });
    const box = (pool, cx, cy, cz, sx, sy, sz, rx = 0, ry = 0, extra = {}) => {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(cx, cy, cz), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0)), new THREE.Vector3(sx, sy, sz));
      P.push({ pool, slot: pool.alloc(), m, c: new THREE.Vector3(cx, cy, cz), ...extra });
    };
    // Local frame: x,z in [-h, h], y in [0, S]; the "outer" face is +z.
    for (const [cx, cz] of [[-h, -h], [h, -h], [-h, h], [h, h]]) tube(cx, 0, cz, cx, S, cz, 0.05);
    tube(-h, S, -h, h, S, -h, 0.042); tube(-h, S, h, h, S, h, 0.042);
    tube(-h, S, -h, -h, S, h, 0.042); tube(h, S, -h, h, S, h, 0.042);
    tube(-h, 1.0, h, h, 1.0, h, 0.038);       // guard rail
    tube(-h, 0.5, h, h, 0.5, h, 0.034);       // knee rail
    const flip = (bay.i + bay.j + bay.k) % 2 ? 1 : -1;
    tube(-h * flip, 0.05, h, h * flip, S - 0.05, h, 0.04); // diagonal brace on the outer face
    if (bay.j === 0) {
      // rubber feet: they lift and patter when the stack scuttles across the paving
      [[-h, -h], [h, -h], [-h, h], [h, h]].forEach(([cx, cz], n) => box(this.feet, cx, 0, cz + 0.03, 0.17, 0.11, 0.22, 0, 0, { foot: n }));
    } else {
      box(this.boards, 0, 0.05, 0, S - 0.08, 0.08, S - 0.1);
      box(this.toes, 0, 0.17, h - 0.02, S - 0.06, 0.2, 0.035);
    }
    for (const [cx, cz] of [[-h, -h], [h, -h], [-h, h], [h, h]]) box(this.clamps, cx, S - 0.02, cz, 0.095, 0.085, 0.095);
    if (bay.net) box(this.nets, 0, S / 2, h + 0.06, S, S, 1);
  }

  remove(bay, { burst = true } = {}) {
    if (!this.bays.has(bay.key)) return;
    if (burst) this._burst(bay);
    for (const p of bay.parts) p.pool.release(p.slot);
    bay.parts.length = 0;
    this.bays.delete(bay.key);
    const idx = this.list.indexOf(bay);
    if (idx >= 0) this.list.splice(idx, 1);
    if (this.onChange) this.onChange('remove', bay);
  }

  // Move a bay to another cell; it visibly slides from where it was.
  move(bay, i, j, k) {
    const nk = cellKey(i, j, k);
    if (this.bays.has(nk)) return false;
    const before = cellCenter(bay.i, bay.j, bay.k);
    const after = cellCenter(i, j, k);
    if (this.onChange) this.onChange('remove', bay);
    for (const p of bay.parts) p.pool.release(p.slot);
    bay.parts.length = 0;
    this.bays.delete(bay.key);
    bay.i = i; bay.j = j; bay.k = k; bay.key = nk;
    this.bays.set(nk, bay);
    this._buildParts(bay);
    bay.offset.add(before.sub(after));
    if (this.onMove) this.onMove(bay);
    bay.dirty = true;
    if (this.onChange) this.onChange('add', bay);
    return true;
  }

  // Tubes fly off when a bay is dismantled.
  _burst(bay) {
    this._matrixFor(bay, this._m);
    let n = 0;
    for (const p of bay.parts) {
      if (!p.a || n > 6 || Math.random() < 0.35) continue;
      n++;
      const a = p.a.clone().applyMatrix4(this._m), b = p.b.clone().applyMatrix4(this._m);
      const vel = new THREE.Vector3((Math.random() - 0.5) * 6, 3 + Math.random() * 4, 2 + Math.random() * 4);
      this.fx.tube(a, b, vel);
    }
  }

  // ---------- spatial queries ----------

  // Axis-aligned boxes of bays near a point (for collision, standing on decks).
  boxesNear(x, z, r, yMin, yMax, out = []) {
    const [i0, , k0] = cellOfPoint(x - r, 0, z - r);
    const [i1, , k1] = cellOfPoint(x + r, 0, z + r);
    const j0 = Math.max(0, Math.floor(yMin / S)), j1 = Math.floor(yMax / S);
    for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) {
      const b = this.get(i, j, k);
      if (!b || b.delay > 0) continue;
      out.push({
        minX: X0 + i * S, maxX: X0 + (i + 1) * S,
        minZ: Z0 + k * S, maxZ: Z0 + (k + 1) * S,
        minY: j * S, top: (j + 1) * S, bay: b, kind: 'bay',
      });
    }
    return out;
  }

  nearestBay(pos, facing, reach, yMin, yMax) {
    const boxes = this.boxesNear(pos.x, pos.z, reach + S, yMin, yMax);
    let best = null, bestScore = Infinity;
    for (const bx of boxes) {
      const dx = Math.max(bx.minX - pos.x, 0, pos.x - bx.maxX);
      const dz = Math.max(bx.minZ - pos.z, 0, pos.z - bx.maxZ);
      const d = Math.hypot(dx, dz);
      if (d > reach) continue;
      const cx = (bx.minX + bx.maxX) / 2 - pos.x, cz = (bx.minZ + bx.maxZ) / 2 - pos.z;
      const len = Math.hypot(cx, cz) || 1;
      const dot = (cx * facing.x + cz * facing.z) / len;
      const dy = Math.abs(bx.minY - pos.y);
      const score = d - dot * 0.8 + dy * 0.3;
      if (score < bestScore) { bestScore = score; best = bx.bay; }
    }
    return best;
  }

  // ---------- animation ----------

  // Quake bays, strongest near `origin`, and send a jelly ripple through the frame.
  shudder(origin, strength = 1, radius = 14) {
    for (const b of this.list) {
      const c = cellCenter(b.i, b.j, b.k, this._v);
      const d = c.distanceTo(origin);
      if (d < radius) { b.shake = Math.max(b.shake, strength * (1 - d / radius)); b.dirty = true; }
    }
    if (this.ripples.length > 5) this.ripples.shift();
    this.ripples.push({ o: origin.clone(), s: Math.min(1.4, strength), age: 0, r: radius * 1.2 });
  }

  // Shared displacement field: a slow wobble that grows with height and stage, plus the
  // ripples. Every part of every bay goes through this, so the frame bends as one body.
  _wobble(p) {
    const t = this.time;
    let dx = 0, dy = 0, dz = 0;
    if (this.breath > 0) {
      const hgt = Math.max(0, p.y) / 10;
      const a = this.breath * hgt * hgt * 0.35;
      dx += Math.sin(t * 1.4 + p.y * 0.3 + p.x * 0.08) * a;
      dz += Math.sin(t * 1.1 + p.y * 0.25 + p.z * 0.1 + 1.3) * a * 0.7;
    }
    for (const r of this.ripples) {
      const ox = p.x - r.o.x, oz = p.z - r.o.z, oy = p.y - r.o.y;
      const d = Math.sqrt(ox * ox + oy * oy + oz * oz);
      if (d > r.r) continue;
      const w = r.s * Math.exp(-r.age * 2.4) * Math.sin(d * 1.5 - r.age * 10) * (1 - d / r.r) * 0.16;
      const inv = 1 / (Math.hypot(ox, oz) || 1);
      dx += ox * inv * w; dz += oz * inv * w; dy += w * 0.6;
    }
    p.x += dx; p.y += dy; p.z += dz;
    return p;
  }

  _matrixFor(bay, out) {
    const c = cellCenter(bay.i, bay.j, bay.k, this._v);
    const base = this._a.set(c.x, bay.j * S, c.z).add(bay.offset);
    // shiver + sway + lean
    let rx = 0, rz = 0, jx = 0, jy = 0, jz = 0;
    const t = this.time, sd = bay.seed;
    if (bay.shake > 0.002) {
      const a = bay.shake;
      jx = Math.sin(t * 41 + sd) * 0.07 * a; jy = Math.abs(Math.sin(t * 37 + sd * 2)) * 0.09 * a; jz = Math.sin(t * 45 + sd * 3) * 0.07 * a;
      rx = Math.sin(t * 33 + sd) * 0.05 * a; rz = Math.sin(t * 29 + sd * 4) * 0.05 * a;
    }
    // a sliding stack hops along on its feet, leaning into the direction of travel
    const slide = bay.offset.length();
    if (slide > 0.04) {
      jy += Math.abs(Math.sin(t * 18 + sd)) * Math.min(0.12, slide * 0.06);
      rx -= bay.offsetVel.z * 0.012; rz += bay.offsetVel.x * 0.012;
    }
    if (this.breath > 0) {
      const w = this.breath * (0.4 + bay.j * 0.15);
      rx += Math.sin(t * 1.3 + bay.i * 0.35 + bay.k * 0.2) * 0.012 * w;
      rz += Math.sin(t * 1.1 + bay.k * 0.4 + bay.i * 0.1) * 0.012 * w;
    }
    if (this.leanTarget && this.leanAmount > 0) {
      const dx = this.leanTarget.x - c.x, dz = this.leanTarget.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d < 7 && d > 0.1) {
        const k = this.leanAmount * (1 - d / 7) * 0.09;
        rx += (dz / d) * k; rz -= (dx / d) * k;
      }
    }
    // a mocking bow towards someone: lean in, hold, straighten up
    if (bay.bowT !== undefined) {
      const k = Math.sin(Math.min(1, bay.bowT / 1.4) * Math.PI) * bay.bowAmt;
      rx += bay.bowDir.z * k; rz -= bay.bowDir.x * k;
    }
    // flying (the swarm ending): its own tumble on top
    if (bay.fly) { rx += bay.fly.rx; rz += bay.fly.rz; }
    // a pirouette (dodging a wrench) or a quarter turn (fidgeting), with an overshoot
    let yaw = bay.yaw + (bay.fly ? bay.fly.ry : 0);
    if (bay.spinT !== undefined) yaw += easeOutBack(Math.min(1, bay.spinT / 0.55)) * Math.PI * 2 * (bay.spinTurns ?? 1);
    // world-space tilt first, then the bay's own yaw
    this._q.setFromEuler(this._e.set(rx, 0, rz)).multiply(this._qy.setFromAxisAngle(UP, yaw));
    out.compose(base.add(this._b.set(jx, jy, jz)), this._q, this._b.set(1, 1, 1));
    // growth: scale along the axis pointing back at the parent bay, anchored at that face
    if (bay.grow < 1) {
      const s = Math.max(0.001, easeOutBack(Math.min(1, bay.grow)));
      const ax = bay.growAxis;
      const anchor = cellCenter(bay.i, bay.j, bay.k, this._b).addScaledVector(ax, S / 2).add(bay.offset);
      const sv = new THREE.Vector3(1 + (s - 1) * Math.abs(ax.x), 1 + (s - 1) * Math.abs(ax.y), 1 + (s - 1) * Math.abs(ax.z));
      this._m2.makeTranslation(-anchor.x, -anchor.y, -anchor.z);
      const sm = new THREE.Matrix4().makeScale(sv.x, sv.y, sv.z);
      const tm = new THREE.Matrix4().makeTranslation(anchor.x, anchor.y, anchor.z);
      out.premultiply(this._m2).premultiply(sm).premultiply(tm);
    }
    return out;
  }

  _writeBay(bay) {
    const M = this._matrixFor(bay, this._m);
    const tm = new THREE.Matrix4();
    const hidden = bay.cut || bay.delay > 0;
    // agitation warms the steel toward coral, then it cools back
    const hot = THREE.MathUtils.clamp(Math.max(1 - bay.grow, 0) * 1.2 + bay.shake * 0.8, 0, 1);
    if (hot > 0.01 || bay.flushed) {
      const tc = this._c.copy(this.colTube).lerp(this.colHot, hot);
      for (const p of bay.parts) if (p.pool === this.tubes) this.tubes.color(p.slot, tc);
      bay.flushed = hot > 0.01;
    }
    const slide = bay.offset.length() > 0.04;
    for (const p of bay.parts) {
      if (hidden) { p.pool.set(p.slot, ZERO); continue; }
      if (p.a) {
        const a = this._wobble(this._a.copy(p.a).applyMatrix4(M)), b = this._wobble(this._b.copy(p.b).applyMatrix4(M));
        const dir = b.sub(a);
        const len = dir.length();
        if (len < 1e-4) { p.pool.set(p.slot, ZERO); continue; }
        this._q.setFromUnitVectors(UP, dir.divideScalar(len));
        const mid = a.addScaledVector(dir, len / 2);
        tm.compose(mid, this._q, this._v.set(p.r, len, p.r));
        p.pool.set(p.slot, tm);
      } else {
        tm.multiplyMatrices(M, p.m);
        const c = this._w.setFromMatrixPosition(tm);
        const d = this._wobble(this._a.copy(c)).sub(c);
        if (p.foot !== undefined && slide) d.y += Math.max(0, Math.sin(this.time * 18 + p.foot * Math.PI / 2)) * 0.14;
        tm.elements[12] += d.x; tm.elements[13] += d.y; tm.elements[14] += d.z;
        p.pool.set(p.slot, tm);
      }
    }
  }

  update(dt) {
    this.time += dt;
    // dead still: nothing breathes, slides or sprouts (the eyes still watch)
    if (this.frozen) { this._updatePeeks(dt); this.whites.flush(); this.pupils.flush(); this.lids.flush(); return; }
    for (let i = this.ripples.length - 1; i >= 0; i--) { this.ripples[i].age += dt; if (this.ripples[i].age > 2.2) this.ripples.splice(i, 1); }
    const global = this.breath > 0 || this.leanAmount > 0 || this.ripples.length > 0;
    for (const bay of this.list) {
      let dirty = bay.dirty || global;
      if (bay.delay > 0) {
        bay.delay -= dt;
        if (bay.delay <= 0) {
          if (this.canSprout && !this.canSprout(bay)) { bay.delay = 0.4; continue; } // wait until the worker steps out
          bay.delay = 0; dirty = true; this._onSprout(bay);
        }
        else { if (bay.dirty) { this._writeBay(bay); bay.dirty = false; } continue; }
      }
      if (bay.grow < 1) { bay.grow = Math.min(1, bay.grow + dt / bay.growDur); dirty = true; }
      if (bay.shake > 0.002) { bay.shake *= Math.exp(-dt * 3.2); dirty = true; }
      if (bay.spinT !== undefined) { bay.spinT += dt; dirty = true; if (bay.spinT > 0.9) { bay.yaw += Math.PI * 2 * (bay.spinTurns ?? 1); bay.spinT = undefined; bay.spinTurns = undefined; } }
      if (bay.bowT !== undefined) { bay.bowT += dt; dirty = true; if (bay.bowT > 1.4) bay.bowT = undefined; }
      if (bay.fly) {
        // airborne: no spring back into the cell; the director steers bay.fly.vel
        const f = bay.fly;
        f.t += dt;
        bay.offset.addScaledVector(f.vel, dt);
        f.rx += f.spin.x * dt; f.ry += f.spin.y * dt; f.rz += f.spin.z * dt;
        if (bay.cut) bay.cut = false;
        this._writeBay(bay); bay.dirty = false;
        continue;
      }
      if (bay.offset.lengthSq() > 1e-6 || bay.offsetVel.lengthSq() > 1e-6) {
        // springy slide back into its cell
        bay.offsetVel.addScaledVector(bay.offset, -90 * dt);
        bay.offsetVel.multiplyScalar(Math.exp(-dt * 11));
        bay.offset.addScaledVector(bay.offsetVel, dt);
        if (bay.j === 0 && bay.offset.y < -0.02) { bay.offset.y = -0.02; bay.offsetVel.y = Math.abs(bay.offsetVel.y) * 0.3; }
        if (bay.offset.lengthSq() < 1e-5 && bay.offsetVel.lengthSq() < 1e-4) { bay.offset.set(0, 0, 0); bay.offsetVel.set(0, 0, 0); }
        dirty = true;
      }
      if (this.cutaway) {
        const cut = this._blocksView(bay);
        if (cut !== bay.cut) { bay.cut = cut; dirty = true; }
      }
      if (dirty) { this._writeBay(bay); bay.dirty = false; }
    }
    this._updatePeeks(dt);
    this.tubes.flush(); this.boards.flush(); this.toes.flush(); this.clamps.flush(); this.nets.flush(); this.feet.flush();
    this.whites.flush(); this.pupils.flush(); this.lids.flush();
  }

  _onSprout(bay) {
    if (this.onSprout) this.onSprout(bay);
    const c = cellCenter(bay.i, bay.j, bay.k);
    if (bay.isSeed) {
      this.fx.dust(new THREE.Vector3(c.x, 0.3, c.z), 5, 1.6);
      this.audio.clank(c, { heavy: true, vol: 0.55 });
    } else if (Math.random() < 0.5) {
      this.audio.clank(c, { pitch: 0.9 + Math.random() * 0.6, vol: 0.32 });
    }
  }

  // Bays between the camera and the worker are hidden so the player can see.
  _blocksView(bay) {
    // during the escape: open up round everyone who is running, and between them and the camera
    if (this.extraCuts) {
      const c = cellCenter(bay.i, bay.j, bay.k, this._v);
      for (const p of this.extraCuts.points) if (bay.j <= 1 && Math.hypot(c.x - p.x, c.z - p.z) < 2.3) return true;
      for (const seg of this.extraCuts.segs) if (this._onSegment(c, seg.from, seg.to)) return true;
    }
    return this._onSegment(cellCenter(bay.i, bay.j, bay.k, this._v), this.cutaway.from, this.cutaway.to);
  }

  _onSegment(c, from, to) {
    const ab = this._a.copy(to).sub(from);
    const len2 = ab.lengthSq();
    if (len2 < 1e-4) return false;
    const t = THREE.MathUtils.clamp(this._b.copy(c).sub(from).dot(ab) / len2, 0, 1);
    if (t > 0.9) return false;
    const p = this._b.copy(from).addScaledVector(ab, t);
    return p.distanceTo(c) < 1.9 + t * 0.6;
  }

  // ---------- peeks: eyes that open briefly somewhere in the metal ----------
  // Called from gameplay events (a worker starts dismantling, a bay reconnects, a trick).
  // Most calls do nothing: eyes are rare, never more than a couple at once, and shy —
  // they snap shut when the camera looks straight at them or a worker turns to face them.
  peek(origin, { chance = 1, near = 6, mood = 'watch', force = false, avoid = null } = {}) {
    const max = this.maxPeeks ?? 2;
    if (!force && (this.peekCooldown > 0 || Math.random() > chance)) return false;
    if (this.peeks.length >= max) return false;
    const cands = [];
    for (const b of this.list) {
      if (b === avoid || b.delay > 0 || b.cut || b.grow < 1) continue;
      const c = cellCenter(b.i, b.j, b.k, this._v);
      const d = Math.hypot(c.x - origin.x, c.z - origin.z);
      if (d > 1.5 && d < near && !this.peeks.some(p => p.bay === b)) cands.push(b);
    }
    if (!cands.length) return false;
    const bay = cands[Math.floor(Math.random() * cands.length)];
    const r = Math.random;
    const spot = PEEK_SPOTS[r() < 0.08 ? 5 : Math.floor(r() * 5)];
    const at = spot.at(r);
    const eyes = [];
    for (let e = 0; e < spot.n; e++) {
      const w = this.whites.alloc(), p = this.pupils.alloc(), l = this.lids.alloc();
      if (w < 0 || p < 0 || l < 0) { this.whites.release(w); this.pupils.release(p); this.lids.release(l); continue; }
      const off = spot.n === 1 ? 0 : (e - (spot.n - 1) / 2) * spot.size * 2.3;
      eyes.push({ w, p, l, local: at.clone().add(new THREE.Vector3(off, (spot.n === 3 && e === 1) ? spot.size * 1.4 : 0, 0)), r: spot.size * (0.85 + r() * 0.35) });
    }
    if (!eyes.length) return false;
    this.peeks.push({ bay, eyes, t: 0, life: 1.4 + r() * 2.2, open: 0, mood, close: false, target: null, glanceAt: 0.5 + r() * 1.2, wink: mood === 'wink' ? 0.5 : -1 });
    this.peekCooldown = 2.5 + r() * 5;
    return true;
  }

  _updatePeeks(dt) {
    this.peekCooldown = Math.max(0, this.peekCooldown - dt);
    const t = this.time;
    const camDir = this.camera ? this._fwd.set(0, 0, -1).applyQuaternion(this.camera.quaternion) : null;
    for (let n = this.peeks.length - 1; n >= 0; n--) {
      const pk = this.peeks[n];
      pk.t += dt;
      const alive = this.bays.get(pk.bay.key) === pk.bay && !pk.bay.cut;
      if (!alive || pk.t > pk.life) pk.close = true;
      // opening snaps wide with an overshoot, closing is a quick squint
      pk.open = pk.close ? Math.max(0, pk.open - dt * 9) : Math.min(1, pk.open + dt * 5);
      if (pk.close && pk.open <= 0) {
        for (const e of pk.eyes) { this.whites.release(e.w); this.pupils.release(e.p); this.lids.release(e.l); }
        this.peeks.splice(n, 1);
        continue;
      }
      const M = this._matrixFor(pk.bay, this._m);
      const q = this._qe.setFromRotationMatrix(M);
      const fwd = this._b.set(0, 0, 1).applyQuaternion(q);
      // who to stare at: the nearest worker, now and then a glance at the camera (at you)
      let target = this.lookAt;
      if (this.watchers.length) {
        let best = Infinity;
        const c0 = this._a.copy(pk.eyes[0].local).applyMatrix4(M);
        for (const w of this.watchers) { const d = w.distanceToSquared(c0); if (d < best) { best = d; target = w; } }
      }
      const glancing = this.camera && pk.t > pk.glanceAt && pk.t < pk.glanceAt + 0.6;
      if (glancing) target = this.camera.position;
      const ease = pk.open < 1 ? easeOutBack(pk.open) : 1;
      for (let i = 0; i < pk.eyes.length; i++) {
        const e = pk.eyes[i];
        const c = this._wobble(this._eyeC.copy(e.local).applyMatrix4(M));
        // shy: it shuts when a worker walks right up to it…
        if (!pk.close && pk.t > 0.5) for (const w of this.watchers) if (w.distanceToSquared(c) < 4.8) { pk.close = true; pk.life = pk.t; }
        // …or when you look right at it
        if (!pk.close && pk.t > 0.6 && camDir && this.camera) {
          const to = this._el.copy(c).sub(this.camera.position);
          const dist = to.length();
          if (dist < 28 && to.normalize().dot(camDir) > 0.995 && !glancing) { pk.close = true; pk.life = pk.t; }
        }
        let blink = (fractf(t * 0.37 + i * 0.13 + pk.life) < 0.04) ? 0.15 : 1;
        if (pk.wink > 0 && i === 0 && pk.t > pk.wink && pk.t < pk.wink + 0.35) blink = 0.08;
        const r = e.r * ease;
        const sq = Math.max(0.02, r * blink);
        this._m2.compose(c, q, this._es.set(r, sq, r * 0.8));
        this.whites.set(e.w, this._m2);
        const look = target ? this._el.copy(target).sub(c).normalize() : this._el.copy(fwd);
        const fd = look.dot(fwd);
        if (fd < 0.25) look.addScaledVector(fwd, 0.25 - fd).normalize();
        const pr = r * (pk.mood === 'roll' ? 0.38 : 0.46);
        if (pk.mood === 'roll') { look.x += Math.cos(t * 7) * 0.4; look.y += Math.sin(t * 7) * 0.4 + 0.2; look.normalize(); }
        const pc = this._ec.copy(c).addScaledVector(look, r * 0.5).addScaledVector(fwd, r * 0.15);
        this._m2.compose(pc, q, this._es.set(pr, Math.max(0.01, pr * blink), pr * 0.5));
        this.pupils.set(e.p, this._m2);
        // a steel lid sits low over the eye: sly, sleepy, up to no good
        const lidDrop = pk.mood === 'glare' ? 0.35 : 0.15;
        this._m2.compose(this._ec.copy(c).addScaledVector(UP, -r * lidDrop * (1 - blink * 0.1)), q, this._es.set(r * 1.02, r * (0.55 + (1 - blink) * 0.5), r * 0.86));
        this.lids.set(e.l, this._m2);
      }
    }
  }
}
