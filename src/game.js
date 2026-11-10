// Game rules: stages, the tempo coupling between the worker and the demon,
// dismantling, collisions and the worker's reactions to what happens.
import * as THREE from 'three';
import { CFG, STAGES } from './config.js';
import { Building } from './architecture.js';
import { Scaffold, cellCenter } from './scaffold.js';
import { Demon } from './demon.js';
import { Worker } from './worker.js';
import { Crew } from './crew.js';
import { Mind } from './mind.js';
import { Director } from './director.js';

const W = CFG.worker;
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// Walkable ground: the courtyard, plus the strip beside the left end wall.
// The courtyard between the main building, the Van-de-Velde-Bau, No. 15 and M18,
// plus the passage past the main building's south-west end.
const AREAS = [
  CFG.court,
  { minX: -39.5, maxX: -36.6, minZ: -17, maxZ: 0.6 },
];

export class Game {
  constructor({ scene, world, fx, audio, hud, followCam }) {
    this.scene = scene; this.world = world; this.fx = fx; this.audio = audio; this.hud = hud; this.cam = followCam;
    this.building = new Building(scene, fx, audio);
    this.scaffold = new Scaffold(scene, fx, audio);
    this.demon = new Demon(this.scaffold, this.building, fx, audio);
    this.worker = new Worker(scene, fx, audio);
    const w = this.worker;
    this.demon.worker = { pos: w.pos, vel: w.vel, facing: w.facing, radius: w.radius, height: w.height };
    // the scaffold's will for this run (temperament, strategy, repertoire)
    this.mind = new Mind(this);
    this.demon.mind = this.mind;
    if (import.meta.env.DEV) window.__mind = () => this.mind.summary();
    this.crew = new Crew(this);
    this.demon.crew = this.crew.list;
    // the session director: what kind of story this session tells, and when (director.js)
    this.director = new Director(this);
    this.demon.director = this.director;
    if (import.meta.env.DEV) window.__director = () => this.director.summary();
    this.scaffold.camera = followCam.cam;
    this.cinematic = false;
    this.focusPos = w.pos;
    this.demon.seedInitial();
    w.onJump = (who) => this.mind.onJump(who);
    this.onMindEvent = (...a) => this.crew.onMindEvent(...a);

    this.stage = 0;
    this.attempts = 0;
    this.time = 0;
    this.tempo = 1;
    this.mode = 'idle';
    this.timers = [];
    this.lastStumble = -10;
    this.lastBumpSound = 0;
    this.ended = false;
    this.endShown = false;
    this.target = null;
    this.chaos = 0;
    this.camLift = 0;
    this.statics = [...world.colliders, ...this.building.colliders];
    this.building.colliders = this.statics; // rubble pushes straight into the shared list

    w.collide = (x, z, y, boundsOnly) => this.collide(x, z, y, boundsOnly, w.free);
    w.onBump = (hit, running, head) => this.onBump(hit, running, head);
    w.onLand = (impact) => { if (impact > 9) { this.fx.shake(0.12); this.worker.addStress(0.01); } };
    this.demon.onTrick = (name, pos) => this.onTrick(name, pos);
    this.building.onImpact = (p, size) => this.onImpact(p, size);
    fx.onTubeLand = (p) => audio.clank(p, { pitch: 1.2 + Math.random() * 0.5, vol: 0.28 });

    // target highlight: a red wire box around the bay the worker would dismantle
    const hg = new THREE.EdgesGeometry(new THREE.BoxGeometry(CFG.grid.S + 0.12, CFG.grid.S + 0.12, CFG.grid.S + 0.12));
    this.highlight = new THREE.LineSegments(hg, new THREE.LineBasicMaterial({ color: '#e8b23a', depthTest: false, transparent: true }));
    this.highlight.layers.set(1);
    this.highlight.renderOrder = 5;
    this.highlight.visible = false;
    scene.add(this.highlight);

    hud.setStage(0, false);
    this.later(1.2, () => w.react('confident'));
  }

  later(t, fn) { this.timers.push({ t, fn }); }

  // ---------- collision ----------

  // `free` lets colleagues walk in from (and out to) beyond the courtyard edge.
  collide(x, z, y, boundsOnly = false, free = false) {
    const r = W.radius;
    let inside = false;
    for (const a of AREAS) if (x >= a.minX + r && x <= a.maxX - r && z >= a.minZ + r && z <= a.maxZ - r) { inside = true; break; }
    if (!inside && !free) return { blocked: true, ground: 0, hit: { kind: 'bounds' } };
    if (free && this.cinematic) return { blocked: false, ground: 0, ceiling: undefined, onMetal: false, hit: null };
    const res = { blocked: false, ground: 0, ceiling: undefined, onMetal: false, hit: null };
    if (boundsOnly) return res;
    const boxes = this.scaffold.boxesNear(x, z, r, y - CFG.grid.S * 0.5, y + W.height + 0.6);
    for (const s of this.statics) boxes.push(s);
    for (const b of boxes) {
      const dx = Math.max(b.minX - x, 0, x - b.maxX);
      const dz = Math.max(b.minZ - z, 0, z - b.maxZ);
      if (dx * dx + dz * dz >= r * r) continue;
      const bottom = b.minY || 0;
      if (y >= b.top - W.step) {
        if (b.top > res.ground) { res.ground = b.top; res.onMetal = b.kind === 'bay'; }
      } else if (y + W.height > bottom + 0.05) {
        if (bottom >= y + W.height - 0.3) {
          res.ceiling = res.ceiling === undefined ? bottom : Math.min(res.ceiling, bottom);
        } else { res.blocked = true; res.hit = b; }
      }
    }
    return res;
  }

  onBump(hit, running, head) {
    const w = this.worker;
    if (head) { w.addStress(0.03); this.fx.shake(0.1); return; }
    if (!hit || hit.kind !== 'bay') return;
    const now = this.time;
    const c = cellCenter(hit.bay.i, hit.bay.j, hit.bay.k);
    if (running && now - this.lastStumble > 1.4) {
      this.lastStumble = now;
      w.react('stumble');
      w.vel.copy(w.facing).multiplyScalar(-3.5);
      w.addStress(0.05);
      this.audio.clank(c, { heavy: true, vol: 0.7 });
      this.audio.rattle(c, 6, 0.4);
      this.scaffold.shudder(c, 1.0, 6);
      this.fx.shake(0.2);
    } else if (now - this.lastBumpSound > 0.6) {
      this.lastBumpSound = now;
      this.audio.rattle(c, 3, 0.2);
      hit.bay.shake = Math.max(hit.bay.shake, 0.4); hit.bay.dirty = true;
    }
  }

  // ---------- dismantling ----------

  tryDismantle() {
    if (this.target) this.dismantle(this.worker, this.target);
  }

  // Any worker's attempt at a bay. Sometimes the bay simply refuses to come off; usually it
  // comes off and the scaffold answers by replicating somewhere else.
  dismantle(w, bay) {
    if (w.busy || !bay) return;
    const player = w === this.worker;
    const c = cellCenter(bay.i, bay.j, bay.k);
    const key0 = bay.key;
    // the scaffold decides: let it happen, dodge during the wind-up, or flatly refuse
    const dodging = this.mind.onReach(w, bay);
    if (!dodging) this.scaffold.peek(c, { chance: 0.2 * this.mind.temper.peek, near: 7, avoid: bay, mood: 'watch' });
    if (!dodging && Math.random() < this.mind.resistChance(player)) {
      // it won't budge: a full-body tug of war, then the scaffold shrugs it off
      w.react('tug');
      bay.shake = 1; bay.dirty = true;
      this.audio.creak(c, 0.9, 0.35);
      this.later(1.15, () => {
        this.scaffold.shudder(c, 0.9, 6);
        this.audio.rattle(c, 6, 0.35);
        this.fx.word(c.clone().add(new THREE.Vector3(0, 0.6, 1.1)), pick(['NOPE.', 'HEH.', 'NÖ.']), { size: 0.9, color: '#7f93d2' });
        w.addStress(0.06);
        this.attempts++;
        this.crew.afterAttempt(w, 'fail');
        this.director.note('refused');
        this.mind.onFail(w);
        if (player) this.later(0.5, () => { if (!w.busy) w.react(pick(['exasperated', 'angry', 'facepalm'])); });
      });
      return;
    }
    w.startDismantle(() => {
      if (this.scaffold.bays.get(key0) !== bay || bay.key !== key0 || bay.evaded) {
        // it got away: slid, hopped or spun out of the wrench
        bay.evaded = false;
        this.attempts++;
        w.addStress(0.05);
        w.react(pick(['disbelief', 'confused', 'surprise', 'angry']));
        this.crew.afterAttempt(w, 'dodged');
        this.director.note('dodged');
        this.mind.onFail(w, 'dodged');
        return;
      }
      this.attempts++;
      const res = this.demon.onDismantle(bay);
      this.director.note('dismantled');
      this.fx.word(res.origin.clone().add(new THREE.Vector3(0, 0.8, 0.8)), pick(['KLONK!', 'KLANG!', 'CLANK!', 'RATTEL!']), { size: 1.1 });
      this.fx.dust(res.origin.clone().setY(Math.max(0.3, res.origin.y - 0.8)), 3, 1);
      w.addStress(0.05 + this.stage * 0.02 + (player ? 0 : 0.03));
      if (Math.random() < 0.3) this.scaffold.peek(res.origin, { chance: 0.6, near: 8, mood: pick(['watch', 'wink', 'glare']) });
      if (!player) { this.crew.afterAttempt(w, 'ok'); return; }
      const first = this.stage === 0;
      if (first) {
        this.setStage(1);
        w.react('confident', { voice: false });
        this.later(1.5, () => { w.react('surprise'); w.addStress(0.08); });
        this.later(2.9, () => w.react('disbelief', { fx: false }));
        return;
      }
      if (res.dropped) this.later(0.25, () => this.fx.word(res.origin.clone().add(new THREE.Vector3(0, 2.2, 1)), 'RUMS!', { size: 1 }));
      const st = this.stage;
      const reaction = st === 1 ? pick(['surprise', 'confused', 'confused', 'disbelief'])
        : st === 2 ? pick(['angry', 'tug', 'confused', 'facepalm'])
        : st === 3 ? pick(['despair', 'angry', 'exasperated'])
        : pick(['meltdown', 'despair', 'exasperated']);
      this.later(0.9, () => { if (!w.busy) w.react(reaction); });
    });
  }

  // ---------- demon & building events ----------

  onTrick(name, pos) {
    const w = this.worker;
    const d = Math.hypot(pos.x - w.pos.x, pos.z - w.pos.z);
    if (Math.random() < 0.25) this.scaffold.peek(pos, { chance: 1, near: 8, mood: 'glare' });
    if (name === 'block' || name === 'encircle') {
      this.fx.word(pos.clone().setY(2.6), name === 'encircle' ? 'ZACK-ZACK!' : 'ZACK!', { size: 1 });
      if (d < 4.5) { w.react('surprise'); w.addStress(0.05); }
    } else if (name === 'slide') {
      this.fx.word(pos.clone().setY(2.4), 'SCHRRK!', { size: 0.9, color: '#2a2140' });
      if (d < 6 && Math.random() < 0.6) this.later(0.5, () => w.react('confused', { voice: false }));
    } else if (name === 'tower') {
      if (d < 18) this.fx.word(pos.clone().setY(5), 'KLONK KLONK', { size: 0.9 });
    } else if (name === 'reconnect') {
      this.scaffold.peek(pos, { chance: 0.7, near: 8, mood: 'wink' });
      this.mind.onReconnect(pos);
      this.crew.addPressure(0.8, 'reconnect');
      this.director.note('regrew');
      this.fx.word(pos.clone().add(new THREE.Vector3(0, 1.2, 0.8)), '…KLICK.', { size: 0.7, color: '#2a2140' });
      if (d < 10) this.later(0.3, () => { w.react(this.stage >= 2 ? 'angry' : 'confused'); w.addStress(0.04); });
    } else if (name === 'collapse') {
      this.fx.word(pos.clone().add(new THREE.Vector3(0, 0, 2)), pick(['KNARZ…', 'KRRRK…']), { size: 1.3, color: '#2a2140', life: 1.4 });
    }
  }

  onImpact(p, size) {
    const w = this.worker;
    this.director.note('damage', { size });
    const d = p.distanceTo(w.pos);
    this.fx.shake(Math.min(1, size * 0.5) * Math.max(0.15, 1 - d / 40));
    this.fx.word(p.clone().setY(2.5 + size), pick(['CRASH!', 'RUMMS!', 'BOOM!', 'KAWUMM!']), { size: 1.2 + size * 0.5, life: 1.1 });
    this.scaffold.shudder(p, 0.6, 10);
    if (d < 7) { w.react('dodge'); w.addStress(0.08); }
    for (const o of this.crew.list) if (o !== w && !this.cinematic && p.distanceTo(o.pos) < 8) { o.react('dodge'); o.addStress(0.06); }
    else if (d < 18 && Math.random() < 0.4) this.later(0.4, () => w.react(this.stage >= 4 ? 'despair' : 'surprise'));
  }

  // Stage changes are decided by the director (director.js). Stage 4 is the climax: one of the
  // five endings, which passes its own name and hint (and collapse: true if the building goes).
  setStage(s, opts = {}) {
    if (s <= this.stage) return;
    this.stage = s;
    this.demon.stage = s;
    this.hud.setStage(s, s < 5, opts);   // no banner for the final stage: the escape plays instead
    this.scaffold.breath = [0, 0, 0.25, 0.6, 1, 1][s];
    this.scaffold.leanAmount = [0, 0, 0.5, 1, 1, 0.6][s];
    const w = this.worker;
    if (s === 2) this.later(0.6, () => w.react('angry'));
    if (s === 3) this.later(0.6, () => w.react('despair'));
    if (s === 4) {
      this.later(0.6, () => w.react(opts.collapse ? 'meltdown' : 'disbelief'));
      if (opts.collapse) { this.demon.collapsing = true; this.demon.collapseT = 0.5; }
    }
    if (s === 5) this.ended = true;
  }

  // After the ending: free camera over the final state (nothing is reset or replayed).
  enterExplore() {
    if (this.exploring) return;
    this.exploring = true;
    this.cam.enterExplore();
    this.hud.setExplore(true);
  }

  showEnd() {
    if (this.endShown) return;
    this.endShown = true;
    const mins = Math.floor(this.time / 60), secs = Math.floor(this.time % 60);
    const stats = `${this.crew.total} workers called in, ${this.attempts} dismantling attempts. ${this.scaffold.count} scaffold bays standing. ${Math.round(this.building.integrity() * 100)}% of the building left. Shift length ${mins}:${String(secs).padStart(2, '0')}.`;
    const CARDS = {
      collapse: ['Aftermath', 'The temporary structure outlasted the permanent one.', '“They don’t pay us enough for this.”'],
      students: ['The Dean Has Left the Building', 'Students, professors and the dean all got out. The university did not.', '“What happened to our university?!”'],
      walker: ['It Left', 'It ate the university. Then it walked off.', '“…Did the scaffolding just quit?”'],
      ghost: ['The Founder', 'Nothing left standing. He came back to see it for himself.', '“WHAT HAVE YOU DONE TO MY UNIVERSITY?!”'],
      fly: ['Migration', 'It took the university apart, then flew south.', '“…Well. Job done?”'],
    };
    const [title, sub, quote] = CARDS[this.climax] || CARDS.collapse;
    this.hud.showEnd(stats, { title, sub, quote });
  }

  // Every step is the director's now (director.js), including how each ending finishes.
  _checkStage() {}

  // ---------- frame ----------

  update(dt, input, camera) {
    this.time += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i];
      t.t -= dt;
      if (t.t <= 0) { this.timers.splice(i, 1); t.fn(); }
    }
    const w = this.worker;
    // camera-relative movement
    const ax = input.axes();
    const { fwd, right } = this.cam.basis();
    const move = new THREE.Vector3().addScaledVector(fwd, ax.y).addScaledVector(right, ax.x);
    if (!this.cinematic) {
      w.update(dt, { move, run: input.shift, sneak: input.ctrl, jump: input.wasPressed('Space'), camPos: camera.position });
      if (input.wasPressed('KeyE')) this.tryDismantle();
    }

    // Tempo: how the worker moves sets how fast the scaffolding lives.
    const T = CFG.tempo;
    this.mode = w.mode;
    const want = w.mode === 'run' ? T.run : w.mode === 'sneak' ? T.sneak : w.mode === 'walk' ? T.walk : T.idle;
    this.tempo += (want - this.tempo) * (1 - Math.exp(-dt * T.response));
    const ddt = dt * this.tempo;

    this.mind.update(ddt);
    this.director.update(dt, ddt);
    this.demon.update(ddt);
    this.scaffold.leanTarget = w.pos;
    this.scaffold.lookAt = (this._eyeTarget ||= new THREE.Vector3()).copy(w.pos).setY(w.pos.y + 1.7);
    this.scaffold.cutaway = { from: camera.position, to: (this.cinematic ? this.focusPos : w.pos).clone().setY(w.pos.y + 1.2) };
    if (this.cinematic) {
      const running = this.crew.list.filter(o => o.root.visible);
      this.scaffold.extraCuts = { points: running.map(o => o.pos), segs: running.map(o => ({ from: camera.position, to: o.pos.clone().setY(1.2) })) };
    }
    this.scaffold.maxPeeks = this.stage >= 4 ? 3 : 2;
    this.scaffold.update(ddt);
    this.crew.update(dt, camera);
    this.focusPos = this.exploring ? this.cam.pivot : this.cinematic ? this.crew.focus : w.pos;
    this.building.update(dt, ddt);
    this._checkStage();

    // ambient creaking grows with the stage and the tempo
    if (this.stage >= 2 && Math.random() < ddt * 0.25 * this.stage) {
      const b = pick(this.scaffold.list);
      if (b) this.audio.creak(cellCenter(b.i, b.j, b.k), 0.8 + Math.random(), 0.25);
    }

    // dismantle target
    this.target = this.cinematic ? null : w.busy ? this.target : this.scaffold.nearestBay(w.pos, w.facing, W.reach, w.pos.y - 0.6, w.pos.y + 2.2);
    if (this.target && this.scaffold.bays.get(this.target.key) === this.target) {
      this.highlight.visible = true;
      const c = cellCenter(this.target.i, this.target.j, this.target.k);
      this.highlight.position.copy(c).add(this.target.offset);
      this.highlight.material.opacity = 0.6 + Math.sin(this.time * 8) * 0.3;
    } else { this.highlight.visible = false; this.target = null; }

    const integ = this.building.integrity();
    this.chaos = THREE.MathUtils.clamp(Math.max(0, this.stage - 1) * 0.16 + (1 - integ) * 0.7, 0, 1);
    this.world.setMood(this.chaos);
    this.audio.updateAmbience(dt, this.chaos);
    const lift = this.scaffold.count > 120 ? Math.min(1, (this.scaffold.count - 120) / 300) : 0;
    this.camLift += ((this.cinematic ? 0 : lift) - this.camLift) * dt * (this.cinematic ? 2 : 1);
    this.cam.extraHeight = this.camLift;

    this.hud.update({
      integrity: integ, stress: w.stress, mood: w.mood(), bays: this.scaffold.count, attempts: this.attempts,
      tempo: this.tempo, mode: w.mode, canDismantle: !!this.target && !w.busy && !this.cinematic, crew: this.crew.count,
    });
  }
}

export { STAGES };
