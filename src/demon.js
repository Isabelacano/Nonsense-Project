// The demon = the scaffolding's behaviour. It has no body, face or voice:
// it only decides where frames appear, move, drop and press against the building.
// Everything here runs on demon time (dt already multiplied by the tempo).
import * as THREE from 'three';
import { CFG } from './config.js';
import { cellCenter, cellOfPoint } from './scaffold.js';

const { S, x0: X0, z0: Z0 } = CFG.grid;
const DIRS = [
  [0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0],
];
// direction weights per stage: up, +x, -x, +z, -z, down
const DIR_W = [
  [3, 3, 3, 0, 0, 0.3],
  [3, 3, 3, 0.2, 0.2, 0.3],
  [2.2, 2.4, 2.4, 1.6, 1.0, 0.5],
  [1.8, 2, 2, 2.4, 1.2, 0.8],
  [2.2, 2, 2, 2, 1.6, 0.8],
  [2.2, 2, 2, 2, 1.6, 0.8],
];

// wear per event, by stage: a bay sprouting against the facade, a stack moving along it, a
// dismantled bay replicating (subtle at first, substantial later)
const WEAR = { sprout: [0.004, 0.008, 0.016, 0.03, 0.05], move: [0.002, 0.005, 0.012, 0.022, 0.04], dismantle: [0.01, 0.025, 0.05, 0.08, 0.1] };
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class Demon {
  constructor(scaffold, building, fx, audio) {
    this.sc = scaffold;
    this.b = building;
    this.fx = fx;
    this.audio = audio;
    this.stage = 0;
    this.acc = 0;
    this.trickT = 4;
    this.damageT = 0;
    this.collapseT = 1.5;
    this.worker = null;            // set by game: { pos, vel, facing, radius, height }
    this.onTrick = null;           // (name, worldPos) => void
    this.v = new THREE.Vector3();
    scaffold.onSprout = (bay) => this._sprouted(bay);
    scaffold.onMove = (bay) => { if (this.facadeAdjacent(bay.i, bay.j, bay.k)) this.wear(cellCenter(bay.i, bay.j, bay.k), WEAR.move[Math.min(this.stage, 4)]); };
    scaffold.canSprout = (bay) => !this._hitsWorker(bay.i, bay.j, bay.k);
  }

  // ---------- wear: the scaffold slowly eats the building ----------
  // Everything the scaffold does against the facade wears it down a little: a bay sprouting against
  // it, a stack shuffling along it, a dismantled bay replicating, and (all the time) the frames
  // pressing on it (_pressWalls). Early on the damage is capped (cracks, at most a broken window),
  // later whole modules give way, and in an ending nothing is capped any more.
  wear(pos, amount) {
    if (!amount) return;
    const col = this.b.columnAt(pos.x);
    if (!col || col.failed) return;
    const key = pos.y < 4.6 ? 'f0' : pos.y < 9 ? 'f1' : pos.y < 13 ? 'f2' : 'rL';
    this.wearModule(col.modules[key], amount);
  }
  wearModule(m, amount, quiet = null) {
    if (!m || m.state !== 'intact' || m.col.failed) return;
    const key = m.key;
    const st = this.stage, ending = !!this.director?.ending;
    // how far it may go in this stage (the ground floors hold out longest)
    const floor = ending ? 0 : st <= 1 ? 0.62 : st === 2 ? 0.4 : (key === 'f0' || key === 'f1') ? 0.12 : 0;
    const a = Math.min(amount, m.health - floor);
    if (a > 0) this.b.damage(m, a, { quiet: quiet ?? a < 0.08 });
  }

  // ---------- placement rules ----------

  facadeAdjacent(i, j, k) {
    const cx = X0 + (i + 0.5) * S;
    if (k === 0 && cx > -36 && cx < 36.5) return true;  // along the main front
    if (i === 1 && k < 0) return true;                   // against the south-west end wall
    return false;
  }

  inBounds(i, j, k) {
    const g = CFG.grid;
    // in the giant ending the towers may rise far past the roofline
    const top = this.giant ? 44 : Math.min(g.jMax, CFG.maxLevel[this.stage]);
    return i >= g.iMin && i <= g.iMax && j >= 0 && j <= top && k >= g.kMin && k <= g.kMax;
  }

  // Does the cell overlap solid, still-standing architecture?
  blockedByBuilding(i, k) {
    const xmin = X0 + i * S, xmax = xmin + S, zmin = Z0 + k * S, zmax = zmin + S;
    const cx = (xmin + xmax) / 2, cz = (zmin + zmax) / 2;
    if (k < 0) {
      if (xmax <= -36.3) return false;            // open passage beside the south-west end wall
      return this.b.solidAt(cx, cz) || this.b.solidAt(xmin + 0.1, cz) || this.b.solidAt(xmax - 0.1, cz);
    }
    // the neighbouring buildings never collapse
    for (const r of Object.values(CFG.site)) {
      if (r === CFG.site.lawn) continue;
      if (xmax > r[0] && xmin < r[1] && zmax > r[2] && zmin < r[3]) return true;
    }
    return false;
  }

  _hitsWorker(i, j, k) {
    if (this.crew && this.crew.length > 1) return this.crew.some(w => w.root.visible && this._hits(w, i, j, k));
    return this._hits(this.worker, i, j, k);
  }

  _hits(w, i, j, k) {
    if (!w) return false;
    const y0 = j * S, y1 = y0 + S;
    if (w.pos.y + w.height < y0 || w.pos.y > y1 - 0.05) return false;
    const xmin = X0 + i * S, zmin = Z0 + k * S;
    const dx = Math.max(xmin - w.pos.x, 0, w.pos.x - (xmin + S));
    const dz = Math.max(zmin - w.pos.z, 0, w.pos.z - (zmin + S));
    return Math.hypot(dx, dz) < w.radius + 0.2;
  }

  canPlace(i, j, k, { free = false } = {}) {
    if (!this.inBounds(i, j, k) || this.sc.has(i, j, k)) return false;
    if (this.blockedByBuilding(i, k)) return false;
    if (this._hitsWorker(i, j, k)) return false;
    if (free) return true;
    const st = this.stage;
    if (st < 3 && j > 0 && !this.sc.has(i, j - 1, k)) return false;       // still obeys gravity... for now
    if (st <= 1 && !this.facadeAdjacent(i, j, k)) return false;          // stays on the facade at first
    if (st === 2 && k > 3 && !this.facadeAdjacent(i, j, k) && !this._nearWorker(i, k, 7)) return false;
    return true;
  }

  _nearWorker(i, k, r) {
    if (!this.worker) return false;
    const c = cellCenter(i, 0, k, this.v);
    return Math.hypot(c.x - this.worker.pos.x, c.z - this.worker.pos.z) < r;
  }

  yawFor(i, j, k) {
    const cz = Z0 + (k + 0.5) * S;
    if (i === 36 && cz < 20) return -Math.PI / 2;
    if (i <= 2 && k < 0) return -Math.PI / 2;
    if (k === 0) return 0;
    return pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
  }

  place(i, j, k, opts = {}) {
    const bay = this.sc.add(i, j, k, {
      yaw: this.yawFor(i, j, k),
      net: opts.net ?? (this.facadeAdjacent(i, j, k) ? Math.random() < 0.35 : Math.random() < 0.15),
      ...opts,
    });
    return bay;
  }

  // ---------- setup ----------

  seedInitial() {
    const { i0: base0, i1: base1, j1 } = CFG.initialScaffold;
    // the starting section shifts a little from run to run
    const i0 = this.mind?.startI ?? base0, i1 = i0 + (base1 - base0) - (Math.random() < 0.4 ? 1 : 0);
    for (let i = i0; i <= i1; i++) for (let j = 0; j <= j1; j++) {
      const b = this.sc.add(i, j, 0, { yaw: 0, net: j >= 2 && j <= 4 });
      b.grow = 1;
    }
  }

  // ---------- growth ----------

  _score(c, origin) {
    const st = this.stage;
    const center = cellCenter(c.i, c.j, c.k, this.v);
    let s = Math.random() * 1.2;
    if (this.giant) s += c.j * 0.25 + (c.dir === 0 ? 2.5 : 0);   // reach for the sky
    const fac = this.facadeAdjacent(c.i, c.j, c.k);
    if (fac) s += [1.5, 1.5, 1.0, 0.4, 0.3, 0.3][st];
    if (c.k > 0) s += [0, 0, 0.3, 1.0, 1.2, 1.2][st];
    if (c.dir === 0) s += [0.6, 0.6, 0.4, 0.3, 0.5, 0.5][st];
    // entrance, central studio windows, corners: the places a building is most "itself"
    if (Math.abs(center.x) < 3.5 && c.k <= 1 && c.j <= 2) s += [0, 0.8, 1.4, 1.0, 0.6, 0.6][st];
    if (Math.abs(center.x) < 10 && c.j >= 6 && c.k === 0) s += [0, 0.6, 1.0, 0.8, 0.6, 0.6][st];
    if (center.x > 28 || center.x < -32) s += [0, 0.5, 0.8, 0.6, 0.4, 0.4][st];
    if (this.worker) {
      const d = Math.hypot(center.x - this.worker.pos.x, center.z - this.worker.pos.z);
      s += [0, 0.3, 1.4, 1.8, 1.2, 1.0][st] * Math.exp(-d / 6);
    }
    if (st >= 3) {
      // fill in between existing frames: the courtyard thickens into a fortress
      let n = 0;
      for (const d of DIRS) if (this.sc.has(c.i + d[0], c.j + d[1], c.k + d[2])) n++;
      s += n * 0.45;
    }
    if (origin) {
      const d = center.distanceTo(origin);
      if (d > 6 && d < 28) s += 0.8; // "elsewhere"
    }
    return s;
  }

  _candidates(n, near = null) {
    const list = this.sc.list;
    if (!list.length) return [];
    const out = [];
    // giant: mostly up, some sideways to throw bridges between the towers
    const w = this.giant ? [9, 1.2, 1.2, 0.6, 0.3, 0] : DIR_W[this.stage];
    const wsum = w.reduce((a, b) => a + b, 0);
    for (let t = 0; t < n; t++) {
      let src;
      if (near && Math.random() < 0.6) {
        // bias toward bays close to a point
        let best = null, bd = Infinity;
        for (let q = 0; q < 6; q++) {
          const b = pick(list);
          const d = cellCenter(b.i, b.j, b.k, this.v).distanceTo(near);
          if (d < bd) { bd = d; best = b; }
        }
        src = best;
      } else src = pick(list);
      let r = Math.random() * wsum, di = 0;
      while (r > w[di]) { r -= w[di]; di++; }
      const d = DIRS[Math.min(di, 5)];
      const c = { i: src.i + d[0], j: src.j + d[1], k: src.k + d[2], dir: di, from: new THREE.Vector3(-d[0], -d[1], -d[2]) };
      if (this.canPlace(c.i, c.j, c.k)) out.push(c);
    }
    return out;
  }

  growOne({ origin = null, near = null, delay = 0 } = {}) {
    const cands = this._candidates(36, near);
    if (!cands.length) return null;
    let best = null, bs = -Infinity;
    for (const c of cands) {
      const s = this._score(c, origin);
      if (s > bs) { bs = s; best = c; }
    }
    if (origin) delay += cellCenter(best.i, best.j, best.k, this.v).distanceTo(origin) / 22;
    delay = Math.max(delay, 0.01); // always pass through the sprout hook
    return this.place(best.i, best.j, best.k, { from: best.from, delay });
  }

  // A brand-new colony erupting from the paving somewhere else on the facade.
  seedRemote(origin, { delay = 0, prefer = null } = {}) {
    let best = null, bs = -Infinity;
    for (let t = 0; t < 40; t++) {
      let i, k;
      const r = Math.random();
      const haunt = this.mind && Math.random() < 0.35 ? pick(this.mind.haunts) : null;
      if (haunt !== null && prefer !== 'entrance') { i = Math.floor((haunt - X0) / S + rnd(-1.5, 1.5)); k = 0; }
      else if (prefer === 'entrance' || r < 0.25) { i = pick([16, 17, 18]); k = 0; }
      else if (r < 0.45) { i = 36; k = Math.floor(rnd(0, 9)); }
      else if (r < 0.55) { i = pick([1, 2]); k = Math.floor(rnd(-6, 0)); }
      else if (this.stage >= 3 && r < 0.8) { i = Math.floor(rnd(4, 36)); k = Math.floor(rnd(1, 15)); }
      else { i = Math.floor(rnd(3, 37)); k = 0; }
      if (!this.canPlace(i, 0, k, { free: true })) continue;
      const c = cellCenter(i, 0, k, this.v);
      const d = origin ? c.distanceTo(origin) : 20;
      const s = Math.min(d, 30) / 10 + Math.random() + (prefer === 'entrance' && Math.abs(c.x) < 4 ? 5 : 0);
      if (s > bs) { bs = s; best = { i, k, d }; }
    }
    if (!best) return [];
    const d0 = delay + best.d / 18;
    const out = [];
    const first = this.place(best.i, 0, best.k, { seed: true, delay: d0, from: new THREE.Vector3(0, -1, 0) });
    if (first) out.push(first);
    const h = 1 + Math.floor(Math.random() * (1 + this.stage));
    for (let j = 1; j <= h; j++) {
      if (!this.inBounds(best.i, j, best.k) || this.sc.has(best.i, j, best.k)) break;
      const b = this.place(best.i, j, best.k, { delay: d0 + j * 0.16, from: new THREE.Vector3(0, -1, 0) });
      if (b) out.push(b);
    }
    return out;
  }

  // ---------- reaction to the worker ----------

  onDismantle(bay) {
    const st = this.stage;
    const origin = cellCenter(bay.i, bay.j, bay.k);
    const { i, j, k } = bay;
    this.sc.remove(bay);
    this.audio.rattle(origin, 8, 0.45);
    this.sc.shudder(origin, 1, 10 + st * 5);
    const result = { origin, spawned: [], dropped: 0, reconnect: false };
    // the scaffold shakes the wall it was clamped to
    if (this.facadeAdjacent(i, j, k)) this.wear(origin, WEAR.dismantle[Math.min(st, 4)]);

    // The column above slides down to plug the gap — nothing was gained.
    if (st >= 1 || Math.random() < 0.5) {
      let jj = j + 1;
      while (this.sc.has(i, jj, k)) {
        this.sc.move(this.sc.get(i, jj, k), i, jj - 1, k);
        jj++; result.dropped++;
      }
      if (result.dropped) { this.audio.clank(origin, { heavy: true, vol: 0.7 }); this.sc.shudder(origin, 1.3, 5); }
    }

    const first = this._firstDone !== true;
    this._firstDone = true;
    const n = CFG.replication[st] + (Math.random() < 0.5 ? 1 : 0);
    const remote = CFG.remoteSeeds[st];
    if (first) result.spawned.push(...this.seedRemote(origin, { delay: 0.6, prefer: 'entrance' }));
    else for (let r = 0; r < remote; r++) result.spawned.push(...this.seedRemote(origin, { delay: 0.3 }));
    for (let q = 0; q < n; q++) {
      const b = this.growOne({ origin, delay: 0.25 + q * 0.12 + (first ? 0.6 : 0) });
      if (b) result.spawned.push(b);
    }
    // ...and sometimes it simply grows back: where it was, or right next door.
    const plan = this.mind ? this.mind.regrowPlan() : (st >= 1 && Math.random() < 0.35 ? { delay: rnd(2.5, 4.5), nextDoor: false } : null);
    if (plan) {
      let [ri, rk] = [i, k];
      if (plan.nextDoor) {
        const opts = [[1, 0], [-1, 0], [0, 1]].map(([a, b]) => [i + a, k + b]).filter(([a, b]) => (j === 0 || this.sc.has(a, j - 1, b)) && this.canPlace(a, j, b, { free: true }));
        if (opts.length) [ri, rk] = pick(opts);
      }
      if (!this.sc.has(ri, j, rk)) {
        const back = this.sc.add(ri, j, rk, { yaw: this.yawFor(ri, j, rk), delay: plan.delay, from: new THREE.Vector3(0, -1, 0) });
        if (back) { back.reconnect = true; result.reconnect = true; if (plan.growDur) back.growDur = plan.growDur; }
      }
    }
    return result;
  }

  _sprouted(bay) {
    const st = this.stage;
    if (this.facadeAdjacent(bay.i, bay.j, bay.k)) this.wear(cellCenter(bay.i, bay.j, bay.k), WEAR.sprout[Math.min(st, 4)]);
    if (bay.reconnect && this.onTrick) this.onTrick('reconnect', cellCenter(bay.i, bay.j, bay.k));
    if (st >= 2 && this.facadeAdjacent(bay.i, bay.j, bay.k) && Math.random() < CFG.jabChance[st]) {
      const c = cellCenter(bay.i, bay.j, bay.k);
      const m = this.b.moduleForCell(c.x, c.y, c.z, S);
      if (m) {
        this.wearModule(m, rnd(0.12, 0.26), false);
        this.audio.clank(c, { heavy: true, vol: 0.5 });
        if (Math.random() < 0.5) this.fx.word(c.clone().add(new THREE.Vector3(0, 0.5, 1)), pick(['KRAK!', 'KNIRSCH!', 'CRUNCH!']), { size: 1.1 });
      }
    }
  }

  // ---------- autonomous behaviour ----------

  update(dt) {
    const st = this.stage;
    if (st === 0) return;
    if (this.mind?.still) return;                       // holding its breath
    const pace = this.mind?.pace ?? 1;
    this.acc += CFG.growthRate[Math.min(st, 4)] * dt * pace * (this.director ? this.director.growth() : 1);
    let guard = 0;
    while (this.acc >= 1 && guard++ < 8) {
      this.acc -= 1;
      this.growOne({ near: st >= 2 && this.worker && Math.random() < 0.4 ? this.worker.pos : null });
    }
    this.trickT -= dt;
    if (this.trickT <= 0 && !this.director?.ending) {   // no ordinary pranks once an ending runs
      this.trickT = CFG.mischiefGap[st] * rnd(0.6, 1.4) / pace / (this.director ? this.director.mischief() : 1);
      this._trick();
    }
    this.damageT -= dt;
    if (this.damageT <= 0) {
      this.damageT = 0.5;
      this._pressWalls(0.5);
    }
    if (st >= 4 && this.collapsing) {
      this.collapseT -= dt;
      if (this.collapseT <= 0) {
        this.collapseT = CFG.collapseGap * rnd(0.7, 1.3);
        this._failSomething();
      }
    }
  }

  // Bays clamped to the facade slowly crush what they touch.
  _pressWalls(dt) {
    const rate = CFG.wallDamage[this.stage];
    if (!rate) return;
    const load = new Map();
    for (const bay of this.sc.list) {
      if (bay.delay > 0 || !this.facadeAdjacent(bay.i, bay.j, bay.k)) continue;
      const c = cellCenter(bay.i, bay.j, bay.k, this.v);
      const m = this.b.moduleForCell(c.x, c.y, c.z, S);
      if (m) load.set(m, (load.get(m) || 0) + 1);
    }
    for (const [m, n] of load) this.wearModule(m, n * rate * dt * rnd(0.5, 1.5), true);
  }

  _failSomething() {
    const cols = this.b.columns.filter(c => !c.failed);
    if (!cols.length) return;
    // prefer columns that are already hurt or wrapped in scaffolding
    let best = null, bs = -Infinity;
    for (const c of cols) {
      let s = Math.random() * 2;
      for (const key of ['f0', 'f1', 'f2', 'rL']) s += (1 - c.modules[key].health) * 2;
      if (s > bs) { bs = s; best = c; }
    }
    this.b.failColumn(best);
    if (this.onTrick) this.onTrick('collapse', best.toWorld(2, 8, 0));
  }

  _predict(dist) {
    const w = this.worker;
    const dir = w.vel.lengthSq() > 0.5 ? w.vel.clone().setY(0).normalize() : w.facing.clone();
    return w.pos.clone().addScaledVector(dir, dist);
  }

  _trick() {
    const st = this.stage;
    if (!this.worker) return;
    const options = st === 1 ? ['shiver', 'seed', 'block'] :
      st === 2 ? ['block', 'slide', 'block', 'tower', 'seed'] :
      ['block', 'slide', 'tower', 'wall', 'encircle', 'slide'];
    const t = pick(this.mind ? this.mind.trickOptions(options) : options);
    this.mind?._note('trick', t);
    if (t === 'shiver') {
      this.sc.shudder(this.worker.pos, 0.8, 30);
      this.audio.rattle(this.worker.pos, 10, 0.3);
      this.audio.creak(this.worker.pos, 1.2, 0.3);
    } else if (t === 'seed') {
      this.seedRemote(this.worker.pos, {});
    } else if (t === 'block' || t === 'wall') {
      const p = this._predict(t === 'wall' ? 3.2 : 2.6);
      const [i, , k] = cellOfPoint(p.x, 0, p.z);
      let made = 0;
      const placeCol = (ii, kk, h, delay) => {
        for (let j = 0; j < h; j++) {
          if (!this.canPlace(ii, j, kk, { free: true })) break;
          if (this.place(ii, j, kk, { seed: j === 0, delay: delay + j * 0.12 })) made++;
        }
      };
      placeCol(i, k, st >= 3 ? 2 : 1, 0);
      if (t === 'wall') {
        const v = this.worker.vel;
        const alongX = Math.abs(v.z) >= Math.abs(v.x);
        for (const s of [-1, 1, -2, 2]) placeCol(alongX ? i + s : i, alongX ? k : k + s, 1 + Math.floor(Math.random() * 3), 0.1 * Math.abs(s));
      }
      if (made && this.onTrick) this.onTrick('block', p);
    } else if (t === 'slide') {
      this._slideTowardWorker();
    } else if (t === 'tower') {
      const p = this.worker.pos;
      for (let tries = 0; tries < 20; tries++) {
        const [i, , k] = cellOfPoint(p.x + rnd(-12, 12), 0, p.z + rnd(-8, 10));
        const c = cellCenter(i, 0, k, this.v);
        if (c.distanceTo(p) < 4 || !this.canPlace(i, 0, k, { free: true })) continue;
        const h = 3 + Math.floor(Math.random() * (st + 2));
        for (let j = 0; j < h; j++) {
          if (!this.canPlace(i, j, k, { free: true })) break;
          this.place(i, j, k, { seed: j === 0, delay: j * 0.1, from: new THREE.Vector3(0, -1, 0) });
        }
        if (this.onTrick) this.onTrick('tower', c);
        break;
      }
    } else if (t === 'encircle') {
      const p = this.worker.pos;
      const gap = Math.floor(Math.random() * 8);
      let made = 0;
      for (let a = 0; a < 8; a++) {
        if (a === gap) continue;
        const ang = a / 8 * Math.PI * 2;
        const [i, , k] = cellOfPoint(p.x + Math.cos(ang) * 3.2, 0, p.z + Math.sin(ang) * 3.2);
        if (this.canPlace(i, 0, k, { free: true }) && this.place(i, 0, k, { seed: true, delay: a * 0.07 })) made++;
      }
      if (made && this.onTrick) this.onTrick('encircle', p);
    }
  }

  // Rearranging: a whole stack scrapes across the paving to stand in the worker's way.
  _slideTowardWorker() {
    const p = this._predict(2.5);
    const [ti, , tk] = cellOfPoint(p.x, 0, p.z);
    let best = null, bd = Infinity;
    for (const b of this.sc.list) {
      if (b.j !== 0 || b.delay > 0) continue;
      const d = Math.abs(b.i - ti) + Math.abs(b.k - tk);
      if (d > 0 && d < 7 && d < bd) { bd = d; best = b; }
    }
    if (!best) return;
    const di = Math.sign(ti - best.i), dk = Math.sign(tk - best.k);
    const step = Math.abs(ti - best.i) >= Math.abs(tk - best.k) ? [di, 0] : [0, dk];
    const ni = best.i + step[0], nk = best.k + step[1];
    const stack = [];
    for (let j = 0; this.sc.has(best.i, j, best.k); j++) stack.push(this.sc.get(best.i, j, best.k));
    for (let j = 0; j < stack.length; j++) if (!this.canPlace(ni, j, nk, { free: true })) return;
    for (const b of stack) this.sc.move(b, ni, b.j, nk);
    const c = cellCenter(ni, 0, nk);
    this.audio.scrape(c, 0.7, 0.4);
    this.audio.clank(c, { heavy: true, vol: 0.4, delay: 0.25 });
    this.fx.dust(c.clone().setY(0.2), 4, 1.5);
    if (this.onTrick) this.onTrick('slide', c);
  }
}
