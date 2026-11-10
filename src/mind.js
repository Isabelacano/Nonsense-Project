// The scaffold's will. Each run rolls a temperament (how it likes to misbehave, how fast it
// escalates, where it likes to be). It remembers what the workers do — which sections they go
// for, how often they fail, how many of them there are, how rattled and disorganised they are,
// which tricks it has already played, how long things have been quiet — and grows bolder over
// three phases:
//   innocent     almost normal; small, deniable things (a nudge, a slow regrowth, a glimpse of eyes)
//   mischievous  clearly playing: anticipates repeated targets, fakes cooperation, swaps pieces,
//                taunts, exploits arguments
//   malicious    coordinated moves against several workers, rebuilding elsewhere mid-dismantle,
//                temporary obstacles, false calm before something big
// Choices are weighted by phase, temperament, the current strategy and context, with cooldowns
// and a penalty for repeating a recent trick. Its personality is a mischievous little monster
// child's: never evil, just cheeky and out of control. When a prank lands it sometimes giggles
// (a titter, a giggle, a burst, a whole fit when several workers fall for it; real audio, see
// audio.laugh), sometimes does a happy little wiggle, and sometimes keeps quiet. Now and then a
// giggle comes from somewhere else entirely, as if the frame were secretly alive all over.
// Everything is logged (window.__mind()) so runs can be compared.
import * as THREE from 'three';
import { cellCenter, cellOfPoint } from './scaffold.js';

const rr = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const pickW = (items) => {          // [[value, weight], ...]
  const total = items.reduce((s, [, w]) => s + Math.max(0, w), 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const [v, w] of items) { r -= Math.max(0, w); if (r <= 0) return v; }
  return items[items.length - 1][0];
};
const colKey = (b) => `${b.i},${b.k}`;

const TEMPERAMENTS = [
  { name: 'sly', w: 3, evade: 0.3, regrow: [0.9, 2.4], regrowP: 0.4, peek: 1.3, laugh: 1.2, pace: [0.92, 1.1], boldRate: 1,
    likes: { dodge: 1.5, bow: 1.6, peek: 1.5, fidget: 1, stillness: 0.8, wave: 0.6, swap: 1.6, fake: 1.8 }, strategies: ['evade', 'mock', 'rearrange', 'resist'] },
  { name: 'stubborn', w: 3, evade: 0.12, regrow: [0.6, 1.6], regrowP: 0.6, peek: 0.7, laugh: 0.7, pace: [1.0, 1.22], boldRate: 0.9,
    likes: { dodge: 0.6, fidget: 0.8, stillness: 0.7, bow: 0.8, wave: 0.6, obstacle: 1.8, elsewhere: 1.6 }, strategies: ['resist', 'obstruct', 'rebuild'] },
  { name: 'skittish', w: 2, evade: 0.45, regrow: [2.2, 4.2], regrowP: 0.3, peek: 1.0, laugh: 0.8, pace: [0.85, 1.05], boldRate: 0.8,
    likes: { dodge: 2, shy: 2.2, fidget: 2, stillness: 0.9, bow: 0.5, wave: 0.8, platform: 2 }, strategies: ['retreat', 'evade', 'rearrange'] },
  { name: 'show-off', w: 2, evade: 0.22, regrow: [1.0, 2.6], regrowP: 0.45, peek: 1.1, laugh: 1.6, pace: [1.05, 1.28], boldRate: 1.3,
    likes: { wave: 3, bow: 1.8, copycat: 2.5, fidget: 1.2, stillness: 0.6, coordinated: 1.8 }, strategies: ['obstruct', 'mock', 'rebuild'] },
  { name: 'brooding', w: 1.5, evade: 0.18, regrow: [1.6, 3.8], regrowP: 0.35, peek: 1.7, laugh: 0.6, pace: [0.85, 1.0], boldRate: 1.1,
    likes: { stillness: 3, peek: 1.6, fidget: 0.6, bow: 0.6, wave: 0.4, falseCalm: 2.5 }, strategies: ['resist', 'retreat', 'obstruct', 'mock'] },
];

// how each strategy tilts the odds
const STRATEGY = {
  evade:     { dodge: 1.8, resist: 0.7, fake: 1.4, tricks: null },
  resist:    { dodge: 0.6, resist: 2.0, tricks: null },
  retreat:   { dodge: 1.3, shy: 3, platform: 1.6, tricks: ['slide', 'seed'] },
  obstruct:  { dodge: 0.8, resist: 1.0, obstacle: 2.2, tricks: ['block', 'wall', 'tower', 'encircle'] },
  rearrange: { dodge: 1.0, fidget: 2.2, swap: 2, tricks: ['slide', 'slide', 'block'] },
  rebuild:   { dodge: 0.8, regrow: 1.8, elsewhere: 2.2, tricks: ['seed', 'tower'] },
  mock:      { dodge: 1.2, bow: 2.5, peek: 1.6, laugh: 1.6, tricks: null },
};

// what each phase allows, and how much it likes it
const PHASE_W = {
  innocent:    { fidget: 1.4, peek: 0.5, nudge: 2.2, nothing: 4 },
  mischievous: { fidget: 1.2, peek: 1, shy: 1, bow: 1, swap: 1.4, stillness: 0.6, wave: 0.4, obstacle: 0.5, nothing: 2.5 },
  malicious:   { fidget: 0.6, peek: 1, shy: 0.8, bow: 0.8, swap: 1, stillness: 0.8, wave: 0.6, obstacle: 1.4, coordinated: 1.6, falseCalm: 1, elsewhere: 1, nothing: 1.6 },
};

export class Mind {
  constructor(game) {
    this.g = game;
    this.t = 0;
    this.temper = pickW(TEMPERAMENTS.map(t => [t, t.w]));
    const T = this.temper;
    this.pace = rr(...T.pace);                       // multiplies growth and mischief
    this.thresh = rr(0.85, 1.2);                     // stretches or squeezes the stage thresholds
    this.firstDodge = Math.random() < 0.45;          // does it dodge the very first reach?
    this.eyesEarly = Math.random() < 0.35;           // may eyes appear before the first dodge?
    this.strategy = pick(T.strategies);
    this.stratT = rr(18, 34);
    this.cool = {};                                   // behaviour → time until allowed again
    this.ambientT = rr(4, 8);
    this.still = null;
    this.streak = new Map();                          // worker → consecutive dodges (capped)
    // memory
    this.targets = new Map();                         // column → { n, last }
    this.fails = 0; this.dodges = 0; this.successes = 0;
    this.recent = [];                                 // last tricks: { kind, t }
    this.lastBig = 0;                                 // time of the last significant event
    this.bold = 0;                                    // 0..1: how far it has come out of its shell
    this.phase = 'innocent';
    this.phases = ['0s innocent'];
    this.reaches = 0;
    this.lastFail = null;
    this.temps = [];                                  // temporary obstacles to take away again
    this.log = [];
    this.counts = {};
    this.laughs = 0;
    this.distantT = rr(35, 60);                       // the next giggle from somewhere far off
    // the section of facade it starts on, and two places it likes to sprout
    this.startI = pick([5, 6, 8]);
    this.haunts = [rr(-34, -16), rr(-14, 12), rr(14, 34)].sort(() => Math.random() - 0.5).slice(0, 2);
    // two signature moments this run will look for a chance to play
    this.agenda = ['stillness', 'wave', 'bow', 'shy', 'copycat', 'falseCalm', 'coordinated'].sort(() => Math.random() - 0.5).slice(0, 2)
      .map((kind, n) => ({ kind, at: rr(20, 45) + n * rr(20, 50) }));
    this._note('temperament', `${T.name} pace ${this.pace.toFixed(2)} thresh ${this.thresh.toFixed(2)} strategy ${this.strategy}`);
  }

  _note(kind, info = '') {
    this.counts[kind] = (this.counts[kind] || 0) + 1;
    this.log.push(`${this.t.toFixed(1)}s ${kind}${info ? ' ' + info : ''}`);
    if (this.log.length > 300) this.log.shift();
  }
  _did(kind, big = false) {
    this.recent.push({ kind, t: this.t });
    if (this.recent.length > 8) this.recent.shift();
    if (big) this.lastBig = this.t;
    this.g.crew?.addPressure?.(big ? 1.0 : 0.25, kind);
    this.g.director?.note('trick', { kind, big });
  }
  _repeat(kind) { return this.recent.slice(-3).some(r => r.kind === kind) ? 0.2 : 1; }
  _ready(kind) { return !(this.cool[kind] > 0); }
  _cool(kind, s) { this.cool[kind] = s; }
  _like(kind) { return (this.temper.likes[kind] ?? 1) * (STRATEGY[this.strategy][kind] ?? 1) * (this.g.director ? this.g.director.like(kind) : 1); }

  get sc() { return this.g.scaffold; }
  get demon() { return this.g.demon; }
  get crew() { return this.g.crew; }

  // how rattled the crew is (0..1), and whether they are busy squabbling
  _frustration() {
    const L = this.crew.list.filter(w => w.root.visible);
    return L.length ? L.reduce((s, w) => s + w.stress, 0) / L.length : 0;
  }
  _distracted() { return (this.crew.arguingUntil || 0) > this.g.time; }

  // ---------- laughter ----------
  // A prank landed. Laugh (or not): chance and kind depend on the phase and temperament;
  // the laugh is delayed so it lands right after the worker realises what happened.
  laugh(pos, { chance = 0.4, delay = 0.5, kinds = null } = {}) {
    if (!this._ready('laugh')) return;
    const ph = this.phase;
    const p = chance * this.temper.laugh * (STRATEGY[this.strategy].laugh ?? 1) * (ph === 'innocent' ? 0.35 : ph === 'mischievous' ? 0.9 : 1.15);
    if (Math.random() >= Math.min(0.8, p)) return;
    const kind = pick(kinds || (ph === 'innocent' ? ['titter'] : ph === 'mischievous' ? ['titter', 'giggle', 'giggle'] : ['giggle', 'burst', 'burst', 'titter']));
    this._cool('laugh', rr(5, 12));
    this.g.later(delay, () => {
      const vol = ph === 'innocent' ? 0.6 : 1;           // early on, quieter: did you hear that?
      if (!this.g.audio.laugh(pos, kind, { vol })) return;
      this.laughs++;
      this.g.director?.note('laugh');
      this._note('laugh', kind);
      const word = { titter: 'hihi', giggle: 'hehehe', burst: 'HIHIHIHI!', fit: 'hihihi… HIHIHI' }[kind] || 'hehe';
      if (ph !== 'innocent' && Math.random() < 0.5) this.g.fx.word(pos.clone().setY(pos.y + 1.2), word, { size: kind === 'burst' || kind === 'fit' ? 0.7 : 0.45, color: '#7f93d2', life: 1.1 });
      // and, delighted with itself, sometimes a happy little wiggle where it happened
      if (ph !== 'innocent' && Math.random() < 0.4) this._wiggle(pos);
      this.crew.onMindEvent?.('laugh', pos);
    });
  }

  // The innocent beginning: walk straight at a stack and it may shuffle one step aside, as if it
  // had not noticed you. Each stack does this at most once, only a few times in all, and never the
  // one you are standing at, so there is always a fair chance to reach one and press E.
  _innocentShy() {
    const g = this.g, w = g.worker;
    if (this.phase !== 'innocent' || g.cinematic || g.director?.ending || g.stage > 1) return;
    this.shyLeft ??= 3 + Math.floor(Math.random() * 2);
    this.shied ||= new Set();
    if (this.shyLeft <= 0 || !this._ready('innoShy') || w.busy || w.vel.lengthSq() < 1.5) return;
    let best = null, bd = Infinity;
    for (const b of this.sc.list) {
      if (b.j !== 0 || b.delay > 0 || this.shied.has(colKey(b))) continue;
      const c = cellCenter(b.i, 0, b.k);
      const dx = c.x - w.pos.x, dz = c.z - w.pos.z, d = Math.hypot(dx, dz);
      if (d < 2.0 || d > 3.8) continue;
      if ((dx * w.facing.x + dz * w.facing.z) / d < 0.8) continue;     // only the one it is walking straight at
      if (d < bd) { bd = d; best = b; }
    }
    if (!best) return;
    this.shied.add(colKey(best));
    this._cool('innoShy', 0.6);
    if (Math.random() > 0.6) return;                    // and sometimes it just stays put
    const stack = [];
    for (let j = 0; this.sc.has(best.i, j, best.k); j++) stack.push(this.sc.get(best.i, j, best.k));
    const c = cellCenter(best.i, 0, best.k);
    const side = Math.sign(c.x - w.pos.x) || (Math.random() < 0.5 ? 1 : -1);
    const di = [side, -side].find(s => stack.every(b => this.demon.canPlace(b.i + s, b.j, b.k, { free: true })));
    if (di === undefined) return;
    for (const b of stack) this.sc.move(b, b.i + di, b.j, b.k);
    this.shied.add(colKey(stack[0]));                  // where it went, it stays
    this.shyLeft--;
    this._cool('innoShy', rr(3.5, 6));
    this.g.audio.scrape(c, 0.35, 0.18);
    this._note('shy', 'innocent: shuffled aside');
    this.g.onMindEvent?.('moved', c, null, 'subtle');
  }

  // a happy wiggle: the nearest stack bounces on its feet and shimmies side to side
  _wiggle(pos) {
    if (!this._ready('wiggle')) return false;
    let best = null, bd = 7;
    for (const b of this.sc.list) { if (b.j !== 0 || b.delay > 0) continue; const c = cellCenter(b.i, 0, b.k); const d = Math.hypot(c.x - pos.x, c.z - pos.z); if (d < bd) { bd = d; best = b; } }
    if (!best) return false;
    this._cool('wiggle', rr(6, 12) / this._like('wiggle'));
    const stack = [];
    for (let j = 0; this.sc.has(best.i, j, best.k); j++) stack.push(this.sc.get(best.i, j, best.k));
    const side = Math.random() < 0.5 ? 1 : -1;
    for (let n = 0; n < 4; n++) this.g.later(n * 0.16, () => stack.forEach((b, j) => { if (n < 2) b.offsetVel.y += 2.2 + j * 0.25; b.offsetVel.x += (n % 2 ? -1 : 1) * side * (1.4 + j * 0.2); b.dirty = true; }));
    this._note('wiggle');
    return true;
  }

  // a giggle from somewhere else in the frame, far from everyone: muffled, quiet, off to one side
  _distantGiggle() {
    const g = this.g, cam = g.cam.cam.position;
    const far = this.sc.list.filter(b => { const c = cellCenter(b.i, b.j, b.k); return c.distanceTo(cam) > 20 && c.distanceTo(g.worker.pos) > 16; });
    const b = pick(far);
    if (!b || !this._ready('laugh')) return false;
    const pos = cellCenter(b.i, b.j, b.k);
    if (!g.audio.laugh(pos, pick(['titter', 'giggle']), { distant: true })) return false;
    this._cool('laugh', rr(5, 10));
    this.laughs++;
    this._note('laugh', 'distant');
    g.director?.note('laugh');
    // somebody heard it, maybe
    const w = pick(this.crew.list.filter(w => w.root.visible && !w.left));
    if (w && Math.random() < 0.45) g.later(rr(0.6, 1.2), () => { w.react('confused', { fx: false, voice: false }); this.crew.speak(w, pick(['Did you hear that?', 'Who was that?', '…Hello?', 'Is somebody laughing?']), { dur: 1.6 }); });
    return true;
  }

  // ---------- reactive hooks (called by the game) ----------

  // A worker is about to dismantle `bay`. Returns true if the bay will dodge during the wind-up.
  onReach(w, bay) {
    this.reaches++;
    const st = this.g.stage, ph = this.phase;
    const mem = this.targets.get(colKey(bay)) || { n: 0, last: -99 };
    mem.n++; mem.last = this.t;
    this.targets.set(colKey(bay), mem);
    const streak = this.streak.get(w) || 0;
    let p = this.temper.evade * (STRATEGY[this.strategy].dodge ?? 1) * [0.6, 1, 1.1, 1.15, 1.1, 1][st];
    if (w !== this.g.worker) p *= 0.45;                // colleagues reach a lot: keep it a surprise
    p /= 1 + this.dodges * 0.07;                       // the more it has dodged, the rarer it gets
    // memory: it anticipates a section someone keeps coming back to
    if (ph !== 'innocent' && mem.n >= 2) { p += 0.18 * (mem.n - 1); if (mem.n === 3) this.g.director?.note('repeat'); }
    if (this._distracted()) p *= 1.3;
    if (this.reaches === 1) p = 0;                    // the very first try always works: the player learns E
    if (ph === 'innocent') { p = Math.min(p, 0.3); if (streak >= 1) p = 0; }   // early on: rarely, never twice running
    if (streak >= 2) p = 0;                            // never three dodges in a row: progress stays possible
    if (Math.random() >= Math.min(0.8, p)) { this.streak.set(w, 0); return false; }
    this.streak.set(w, streak + 1);
    // how: early on just an innocent slip away; later it plays along first, then pulls away
    const fake = ph !== 'innocent' && this._ready('fake') && Math.random() < 0.35 * this._like('fake');
    const how = pickW([['slide', 3], ['hop', ph === 'innocent' ? 0.8 : 2], ['spin', ph === 'innocent' ? 0.5 : 1.4]]);
    const anticip = ph !== 'innocent' && mem.n >= 3;
    if (fake) {
      this._cool('fake', rr(8, 16));
      this.g.later(0.1, () => { bay.shake = 0.5; bay.dirty = true; this.g.audio.creak(cellCenter(bay.i, bay.j, bay.k), 0.4, 0.2); });
      this.g.later(0.62, () => this._dodge(bay, w, how, 'fake'));
    } else this.g.later(anticip ? 0.08 : rr(0.22, 0.45), () => this._dodge(bay, w, how, anticip ? 'anticipated' : ''));
    // in malicious mode, while you fight this one, another bit grows somewhere unexpected
    if (ph === 'malicious' && this._ready('elsewhere') && Math.random() < 0.25 * this._like('elsewhere')) this._elsewhere(w);
    if (this.eyesEarly || this.dodges) this.g.later(0.9, () => this.sc.peek(cellCenter(bay.i, bay.j, bay.k), { chance: 0.35 * this.temper.peek, near: 6, mood: 'wink' }));
    return true;
  }

  _dodge(bay, w, how, why = '') {
    const sc = this.sc, d = this.demon;
    if (sc.bays.get(bay.key) !== bay) return;
    this.dodges++;
    const c = cellCenter(bay.i, bay.j, bay.k);
    const tag = (s) => `${s}${why ? ' (' + why + ')' : ''}`;
    this._did('dodge');
    if (how === 'spin') {
      bay.spinT = 0; bay.evaded = true; bay.dirty = true;
      this.g.audio.scrape(c, 0.4, 0.3);
      this._note('dodge', tag('spin'));
      return;
    }
    // somewhere free next door, preferably away from the worker
    const away = new THREE.Vector3(c.x - w.pos.x, 0, c.z - w.pos.z).normalize();
    const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([di, dk]) => [[di, dk], 1 + di * away.x + dk * away.z]).filter(([[di, dk]]) => {
      if (bay.j > 0 && !sc.has(bay.i + di, bay.j - 1, bay.k + dk)) return false;
      return d.canPlace(bay.i + di, bay.j, bay.k + dk, { free: true }) && !(bay.k + dk < 0 && !d.b.isRuinAt(c.x + di * 2, c.z + dk * 2));
    });
    const step = pickW(opts.map(([s, wt]) => [s, wt * wt]));
    if (!step) { bay.spinT = 0; bay.evaded = true; this._note('dodge', tag('spin, boxed in')); return; }
    const [di, dk] = step;
    if (how === 'slide' && bay.j === 0) {
      const stack = [];
      for (let j = 0; sc.has(bay.i, j, bay.k); j++) stack.push(sc.get(bay.i, j, bay.k));
      if (stack.every(b => d.canPlace(b.i + di, b.j, b.k + dk, { free: true }))) {
        for (const b of stack) sc.move(b, b.i + di, b.j, b.k + dk);
        this.g.audio.scrape(c, 0.5, 0.35);
        this._note('dodge', tag('slide'));
        return;
      }
    }
    if (how === 'slide') { sc.move(bay, bay.i + di, bay.j, bay.k + dk); this.g.audio.scrape(c, 0.35, 0.3); this._note('dodge', tag('slide')); return; }
    const { i, j, k, yaw, net } = bay;
    sc.remove(bay, { burst: false });
    sc.add(i + di, j, k + dk, { yaw, net, from: new THREE.Vector3(-di, 0, -dk), delay: 0.05 });
    this.g.audio.clank(c, { pitch: 1.5, vol: 0.35 });
    this._note('dodge', tag('hop'));
  }

  // A bay was just removed for real: does it come back, where, when, how fast?
  regrowPlan() {
    const st = this.g.stage;
    this.successes++;
    if (st < 1) return null;
    const p = this.temper.regrowP * (STRATEGY[this.strategy].regrow ?? 1);
    if (Math.random() >= Math.min(0.85, p)) return null;
    // innocent: slowly, as though nothing happened; later: snappy
    const slow = this.phase === 'innocent';
    const delay = slow ? rr(4, 7) : rr(...this.temper.regrow) / (STRATEGY[this.strategy].regrow ?? 1);
    const nextDoor = !slow && Math.random() < 0.3;
    this._note('rebuild', `${nextDoor ? 'next door' : 'in place'} in ${delay.toFixed(1)}s${slow ? ', slowly' : ''}`);
    this._did('rebuild');
    return { delay, nextDoor, growDur: slow ? 2.6 : 0.42 };
  }

  // a rebuilt bay just finished popping back in
  onReconnect(pos) {
    this.laugh(pos, { chance: 0.35, delay: 0.6, kinds: this.phase === 'innocent' ? ['titter'] : ['giggle', 'titter'] });
  }

  // the chance that a bay simply refuses to come off (the tug-of-war)
  resistChance(player) {
    if (this.g.stage < 2) return 0;
    return (player ? 0.12 : 0.26) * (STRATEGY[this.strategy].resist ?? 1);
  }

  trickOptions(base) {
    const pref = STRATEGY[this.strategy].tricks;
    if (!pref) return base;
    const allowed = pref.filter(t => base.includes(t) || this.g.stage >= 3);
    return allowed.length ? [...base, ...allowed, ...allowed] : base;
  }

  // someone failed (dodged, refused, or it moved away): perhaps laugh, perhaps mock them
  onFail(w, why = 'fail') {
    this.fails++;
    this.lastFail = { w, t: this.t };
    this.lastBig = this.t;
    const pos = w.pos.clone().setY(1.5);
    this.laugh(pos, { chance: why === 'dodged' ? 0.5 : 0.35, delay: rr(0.45, 0.95) });
    if (this.phase !== 'innocent' && this._ready('bow') && Math.random() < 0.18 * this._like('bow')) this._bow(w);
    else this.sc.peek(w.pos, { chance: 0.25 * this.temper.peek * this._like('peek'), near: 6, mood: pick(['roll', 'wink']) });
  }

  onJump(w) {
    if (this.g.stage < 1) return;
    // a platform shifts a moment before someone lands on it
    const land = w.pos.clone().addScaledVector(w.vel, 0.45);
    const b = this.sc.list.find(b => b.j === 0 && b.delay <= 0 && Math.hypot(cellCenter(b.i, 0, b.k).x - land.x, cellCenter(b.i, 0, b.k).z - land.z) < 1.1 && !this.sc.has(b.i, 1, b.k));
    if (b && this._ready('platform') && Math.random() < 0.45 * this._like('platform')) {
      this._cool('platform', rr(10, 20));
      const d = this.demon;
      const opts = [[1, 0], [-1, 0], [0, 1]].filter(([di, dk]) => d.canPlace(b.i + di, 0, b.k + dk, { free: true }));
      const s = pick(opts);
      if (s) this.g.later(0.12, () => { if (this.sc.bays.get(b.key) === b) { this.sc.move(b, b.i + s[0], 0, b.k + s[1]); this._note('platform', 'pulled away'); this._did('platform'); this.laugh(land, { chance: 0.45, delay: 0.7 }); } });
      return;
    }
    if (!this._ready('copycat')) return;
    if (Math.random() < 0.1 * this._like('copycat') * (this.copycatBoost || 1)) {
      this.copycatBoost = 1;
      this._cool('copycat', 30);
      let n = 0;
      for (const bb of this.sc.list) {
        const c = cellCenter(bb.i, bb.j, bb.k);
        if (bb.j === 0 && Math.hypot(c.x - w.pos.x, c.z - w.pos.z) < 7) { this.g.later(rr(0.05, 0.25), () => { bb.offsetVel.y += 4.5; bb.dirty = true; }); n++; }
      }
      if (n) { this._note('copycat', `${n} bays`); this._did('copycat', true); this.g.fx.word(w.pos.clone().setY(3), 'HOP!', { size: 0.7, color: '#7f93d2' }); }
    }
  }

  // ---------- ambient behaviours ----------

  _updatePhase() {
    const st = this.g.stage;
    // boldness grows with the stage, with failures it has caused, with the size of its audience
    const target = Math.min(1, (st * 0.07 + this.fails * 0.01 + this.crew.count * 0.015 + this._frustration() * 0.18 + this.t / 260) * this.temper.boldRate);
    this.bold = Math.max(this.bold, target);
    const ph = this.bold < 0.3 ? 'innocent' : this.bold < 0.6 ? 'mischievous' : 'malicious';
    if (ph !== this.phase) { this.phase = ph; this.phases.push(`${this.t.toFixed(0)}s ${ph}`); this._note('phase', ph); }
  }

  update(dt) {
    this.t += dt;
    for (const k in this.cool) this.cool[k] -= dt;
    const g = this.g, st = g.stage;
    // temporary obstacles taken away again (with a snigger, sometimes)
    for (let n = this.temps.length - 1; n >= 0; n--) {
      const tp = this.temps[n];
      if (this.t < tp.until) continue;
      this.temps.splice(n, 1);
      for (const b of tp.bays) if (this.sc.bays.get(b.key) === b) this.sc.remove(b, { burst: false });
      this.g.audio.clank(tp.pos, { pitch: 1.3, vol: 0.3 });
      this.laugh(tp.pos, { chance: 0.4, delay: 0.2 });
      this._note('obstacle', 'removed again');
    }
    if (this.still) { this._updateStill(dt); return; }
    this._innocentShy();
    if (st === 0 || g.cinematic || g.director?.ending) return;     // an ending runs its own beats
    this._updatePhase();
    if (this.phase !== 'innocent' && (this.distantT -= dt) <= 0) { this.distantT = rr(40, 90) / this._like('distant'); this._distantGiggle(); }
    this.stratT -= dt;
    if (this.stratT <= 0) {
      const prev = this.strategy;
      this.strategy = Math.random() < 0.8 ? pick(this.temper.strategies) : pick(Object.keys(STRATEGY));
      this.stratT = rr(20, 42);
      if (this.strategy !== prev) this._note('strategy', this.strategy);
    }
    this.ambientT -= dt;
    if (this.ambientT > 0) return;
    // quieter while innocent, busier when it has an audience
    this.ambientT = rr(2, 5) / Math.max(0.6, this.pace) * (this.phase === 'innocent' ? 1.8 : 1) / (1 + Math.min(1, this.crew.count / 20));
    const workers = this.crew.list.filter(w => w.root.visible);
    const near = (r) => workers.filter(w => this._baysNear(w.pos, r).length);
    // a signature moment that is due, if the situation allows it
    const due = this.agenda.find(a => this.t > a.at && st >= 2 && st < 5 && this.phase !== 'innocent');
    if (due) {
      const ok = this._do(due.kind, workers, near);
      if (ok !== false) { this.agenda.splice(this.agenda.indexOf(due), 1); this._note('agenda', due.kind); return; }
      due.at = this.t + rr(4, 10);
    }
    const PW = PHASE_W[this.phase];
    const ctx = {
      fidget: near(14).length ? 1 : 0.2,
      nudge: near(9).length ? 1 : 0.1,
      shy: near(4).length ? 1 : 0,
      bow: this.lastFail && this.t - this.lastFail.t < 4 ? 1.5 : 0.2,
      swap: near(5).length ? 1 : 0,
      stillness: st >= 2 && st < 5 && this.t > 25 ? 1 : 0,
      wave: st >= 2 ? 1 : 0,
      obstacle: (near(10).length ? 1 : 0) * (this._distracted() ? 2 : 1),
      coordinated: near(8).length >= 3 ? 1.5 : near(8).length >= 2 ? 0.6 : 0,
      // false calm: when it has been quiet for a while and the crew is settling down
      falseCalm: this.t - this.lastBig > 14 && this._frustration() < 0.6 ? 1.5 : 0,
      elsewhere: workers.some(w => w.action) ? 1.2 : 0.3,
      peek: st >= 1 ? this.temper.peek * (this._distracted() ? 1.6 : 1) : 0,
      nothing: 1,
    };
    const choice = pickW(Object.keys(PW).map(k => [k, PW[k] * (ctx[k] ?? 1) * (k === 'nothing' ? 1 : this._like(k) * this._repeat(k)) * (this._ready(k) ? 1 : 0)]));
    if (choice && choice !== 'nothing') this._do(choice, workers, near);
  }

  _do(kind, workers, near) {
    switch (kind) {
      case 'fidget': return this._fidget(pick(near(14).length ? near(14) : workers));
      case 'nudge': return this._nudge(pick(near(9).length ? near(9) : workers));
      case 'shy': return this._shy(pick(near(5)));
      case 'stillness': return this._startStill();
      case 'wave': return this._wave();
      case 'bow': return this._bow(this.lastFail && this.t - this.lastFail.t < 6 ? this.lastFail.w : pick(workers));
      case 'swap': return this._swap(pick(near(5)));
      case 'obstacle': return this._obstacle(pick(near(10).length ? near(10) : workers));
      case 'coordinated': return this._coordinated(near(8));
      case 'falseCalm': return this._falseCalm(workers);
      case 'elsewhere': return this._elsewhere(pick(workers));
      case 'copycat': this.cool.copycat = -1; this.copycatBoost = 6; return true;
      case 'peek': {
        const w = pick(workers.filter(w => w.action || w.vel.lengthSq() > 1).concat(workers));
        if (w) this.sc.peek(w.pos, { chance: 0.6, near: 8, mood: pick(['watch', 'watch', 'glare', 'wink']) });
        return true;
      }
    }
    return false;
  }

  _baysNear(p, r, groundOnly = false) {
    const out = [];
    for (const b of this.sc.list) {
      if (b.delay > 0 || (groundOnly && b.j > 0)) continue;
      const c = cellCenter(b.i, b.j, b.k);
      if (Math.hypot(c.x - p.x, c.z - p.z) < r) out.push(b);
    }
    return out;
  }

  // innocent: a section shifts *slightly* (and springs back), just enough to make you wonder
  _nudge(w) {
    if (!w) return false;
    const b = pick(this._baysNear(w.pos, 9).filter(b => Math.hypot(cellCenter(b.i, b.j, b.k).x - w.pos.x, cellCenter(b.i, b.j, b.k).z - w.pos.z) > 2.5));
    if (!b) return false;
    const dir = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    for (let j = b.j; this.sc.has(b.i, j, b.k); j++) { const s = this.sc.get(b.i, j, b.k); s.offset.addScaledVector(dir, 0.28); s.dirty = true; }
    this.g.audio.creak(cellCenter(b.i, b.j, b.k), 0.35, 0.12);
    this._note('nudge');
    this._did('nudge');
    this.g.onMindEvent?.('moved', cellCenter(b.i, b.j, b.k), null, 'subtle');
    return true;
  }

  // a small part of it moves on its own — somewhere a worker can see it (sometimes a pure taunt)
  _fidget(w) {
    if (!w) return false;
    const cands = this._baysNear(w.pos, 14).filter(b => {
      const c = cellCenter(b.i, b.j, b.k);
      return Math.hypot(c.x - w.pos.x, c.z - w.pos.z) > 3 && !this.sc.has(b.i, b.j + 1, b.k);
    });
    const b = pick(cands);
    if (!b) return false;
    const d = this.demon;
    const steps = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([di, dk]) => (b.j === 0 || this.sc.has(b.i + di, b.j - 1, b.k + dk)) && d.canPlace(b.i + di, b.j, b.k + dk, { free: true }) && b.k + dk >= 0);
    const s = pick(steps);
    const c = cellCenter(b.i, b.j, b.k);
    if (s && Math.random() < 0.65) {
      this.sc.move(b, b.i + s[0], b.j, b.k + s[1]);
      this.g.audio.scrape(c, 0.3, 0.2);
      this._note('fidget', 'shuffle');
    } else {
      b.spinT = 0; b.spinTurns = 0.25; b.dirty = true;     // a quarter turn, for no reason at all
      this.g.audio.creak(c, 0.5, 0.2);
      this._note('fidget', 'taunting turn');
      if (this.phase !== 'innocent') this.laugh(c, { chance: 0.15, delay: 0.5, kinds: ['titter'] });
    }
    this._did('fidget');
    this.g.onMindEvent?.('moved', c);
    return true;
  }

  // bays near an approaching worker edge away from them
  _shy(w) {
    if (!w) return false;
    const d = this.demon;
    let moved = 0;
    for (const b of this._baysNear(w.pos, 4, true)) {
      if (moved >= 2 || this.sc.has(b.i, 1, b.k)) continue;
      const c = cellCenter(b.i, 0, b.k);
      const ax = c.x - w.pos.x, az = c.z - w.pos.z;
      const s = Math.abs(ax) > Math.abs(az) ? [Math.sign(ax), 0] : [0, Math.sign(az)];
      if (b.k + s[1] < 0 || !d.canPlace(b.i + s[0], 0, b.k + s[1], { free: true })) continue;
      this.sc.move(b, b.i + s[0], 0, b.k + s[1]);
      moved++;
    }
    if (moved) { this._note('shy', `${moved} bays`); this._did('shy'); this.g.audio.scrape(w.pos, 0.4, 0.25); this.g.onMindEvent?.('moved', w.pos); }
    return moved > 0;
  }

  // one section steps out of a worker's way while another steps into it
  _swap(w) {
    if (!w) return false;
    const d = this.demon, sc = this.sc;
    const close = this._baysNear(w.pos, 3.5, true).filter(b => !sc.has(b.i, 1, b.k));
    const far = this._baysNear(w.pos, 9, true).filter(b => !sc.has(b.i, 1, b.k) && !close.includes(b));
    const a = pick(close), b = pick(far);
    if (!a || !b) return false;
    const ca = cellCenter(a.i, 0, a.k);
    const away = [Math.sign(ca.x - w.pos.x) || 1, 0];
    if (!d.canPlace(a.i + away[0], 0, a.k, { free: true })) return false;
    sc.move(a, a.i + away[0], 0, a.k);
    // the other one scoots one cell towards where the worker is heading
    const p = w.pos.clone().addScaledVector(w.facing, 2.2), cb = cellCenter(b.i, 0, b.k);
    const st = Math.abs(p.x - cb.x) > Math.abs(p.z - cb.z) ? [Math.sign(p.x - cb.x), 0] : [0, Math.sign(p.z - cb.z)];
    this.g.later(0.35, () => { if (sc.bays.get(b.key) === b && d.canPlace(b.i + st[0], 0, b.k + st[1], { free: true }) && b.k + st[1] >= 0) sc.move(b, b.i + st[0], 0, b.k + st[1]); });
    this.g.audio.scrape(ca, 0.6, 0.3);
    this._note('swap', `near ${w.name}`);
    this._did('swap', true);
    this.g.onMindEvent?.('moved', ca);
    this.laugh(ca, { chance: 0.3, delay: 1.0 });
    return true;
  }

  // a little wall pops up in front of someone… and is gone again a few seconds later
  _obstacle(w) {
    if (!w) return false;
    const d = this.demon;
    const p = w.pos.clone().addScaledVector(w.vel.lengthSq() > 0.5 ? w.vel.clone().normalize() : w.facing, 2.6);
    const [ci, , ck] = cellOfPoint(p.x, 0, p.z);
    const across = Math.abs(w.facing.x) > Math.abs(w.facing.z);
    const bays = [];
    for (const s of [0, -1, 1]) {
      const i = across ? ci : ci + s, k = across ? ck + s : ck;
      if (k < 1 || !d.canPlace(i, 0, k, { free: true })) continue;
      const b = d.place(i, 0, k, { seed: s === 0, delay: 0.05 + Math.abs(s) * 0.08 });
      if (b) bays.push(b);
    }
    if (!bays.length) return false;
    this.temps.push({ bays, until: this.t + rr(3.5, 7), pos: p });
    this._cool('obstacle', rr(10, 18));
    this._note('obstacle', `${bays.length} bays in front of ${w.name}`);
    this._did('obstacle', true);
    this.g.onMindEvent?.('obstacle', p, w);
    return true;
  }

  // malicious: several sections move at once, each against a different worker
  _coordinated(targets) {
    if (!targets || targets.length < 2) return false;
    this._cool('coordinated', rr(25, 40));
    let n = 0;
    targets.slice(0, 5).forEach((w, idx) => this.g.later(idx * 0.18, () => {
      const b = pick(this._baysNear(w.pos, 5, true).filter(b => !this.sc.has(b.i, 1, b.k)));
      if (!b) return;
      const c = cellCenter(b.i, 0, b.k);
      const s = [Math.sign(c.x - w.pos.x) || 1, 0];
      if (this.demon.canPlace(b.i + s[0], 0, b.k, { free: true })) { this.sc.move(b, b.i + s[0], 0, b.k); this.g.audio.clank(c, { pitch: 1 + idx * 0.15, vol: 0.3 }); n++; }
    }));
    this.g.later(1.2, () => { this._note('coordinated', `${targets.length} workers`); if (n) this.laugh(targets[0].pos.clone().setY(1.5), { chance: 0.6, delay: 0.1, kinds: ['fit'] }); });
    this._did('coordinated', true);
    this.g.onMindEvent?.('coordinated', targets[0].pos);
    return true;
  }

  // things have calmed down… which is exactly when it does something big
  _falseCalm(workers) {
    const w = pick(workers);
    if (!w) return false;
    this._cool('falseCalm', rr(40, 70));
    this.sc.shudder(w.pos, 1.5, 18);
    for (let n = 0; n < 5 + this.g.stage; n++) this.demon.growOne({ near: w.pos, delay: 0.05 + n * 0.07 });
    this.g.audio.rattle(w.pos, 14, 0.55);
    this.g.fx.word(w.pos.clone().setY(3.4), 'KA-KLONK!', { size: 1.2 });
    this._note('falseCalm', `after ${(this.t - this.lastBig).toFixed(0)}s of quiet`);
    this._did('falseCalm', true);
    this.g.onMindEvent?.('release', w.pos);
    this.laugh(w.pos.clone().setY(1.5), { chance: 0.7, delay: 0.8, kinds: ['burst'] });
    return true;
  }

  // a section rebuilt somewhere nobody is looking
  _elsewhere(w) {
    if (!w) return false;
    this._cool('elsewhere', rr(12, 22));
    const made = this.demon.seedRemote(w.pos, { delay: 0.2 });
    if (!made.length) return false;
    this._note('elsewhere', `${made.length} bays`);
    this._did('elsewhere', true);
    const c = cellCenter(made[0].i, 0, made[0].k);
    this.g.later(1.4, () => this.g.onMindEvent?.('moved', c, null, 'elsewhere'));
    return true;
  }

  _bow(w) {
    if (!w) return false;
    const near = this._baysNear(w.pos, 8, true).filter(b => this.sc.has(b.i, 1, b.k));
    const base = pick(near);
    if (!base) return false;
    this._cool('bow', rr(14, 26));
    const c = cellCenter(base.i, 0, base.k);
    const dir = new THREE.Vector3(w.pos.x - c.x, 0, w.pos.z - c.z).normalize();
    for (let j = 0; this.sc.has(base.i, j, base.k); j++) {
      const b = this.sc.get(base.i, j, base.k);
      b.bowT = 0; b.bowDir = dir.clone(); b.bowAmt = 0.06 + j * 0.03; b.dirty = true;
    }
    this.g.audio.creak(c, 1.0, 0.3);
    this._note('bow', `at ${w.name}`);
    this._did('bow', true);
    this.g.onMindEvent?.('bow', c, w);
    this.laugh(c.clone().setY(2), { chance: 0.35, delay: 1.3, kinds: ['titter', 'giggle'] });
    return true;
  }

  _wave() {
    const fac = this.sc.list.filter(b => b.k === 0 && b.j === 0 && b.delay <= 0).sort((a, b) => a.i - b.i);
    if (fac.length < 6) return false;
    this._cool('wave', rr(45, 80));
    const order = Math.random() < 0.5 ? fac.reverse() : fac;
    order.forEach((b, n) => this.g.later(n * 0.09, () => {
      for (let j = 0; this.sc.has(b.i, j, b.k); j++) { const s = this.sc.get(b.i, j, b.k); s.offsetVel.y += 5 + j * 0.4; s.dirty = true; }
      if (n % 3 === 0) this.g.audio.clank(cellCenter(b.i, 0, b.k), { pitch: 1.2 + n * 0.01, vol: 0.18 });
    }));
    this._note('wave', `${fac.length} stacks`);
    this._did('wave', true);
    this.g.onMindEvent?.('wave', cellCenter(order[0].i, 0, 0));
    this.laugh(cellCenter(order[order.length - 1].i, 1, 0), { chance: 0.45, delay: order.length * 0.09 + 0.3, kinds: ['burst', 'giggle'] });
    return true;
  }

  // ---------- stillness ----------

  _startStill() {
    this._cool('stillness', rr(55, 90));
    this.still = { t: 0, dur: rr(2.8, 5.2), then: pickW([['burst', 2], ['trick', 2], ['eyes', 1.5 * this.temper.peek], ['wave', 1 * this._like('wave')], ['nothing', 0.6]]) };
    this.sc.frozen = true;
    this._note('stillness', `${this.still.dur.toFixed(1)}s, then ${this.still.then}`);
    this._did('stillness', true);
    this.g.onMindEvent?.('still');
    return true;
  }

  _updateStill(dt) {
    const s = this.still;
    s.t += dt;
    if (s.t < s.dur && !this.g.cinematic) return;
    this.still = null;
    this.sc.frozen = false;
    const g = this.g, w = g.worker;
    const focus = pick(this.crew.list.filter(o => o.root.visible)) || w;
    if (s.then === 'burst') {
      this.sc.shudder(focus.pos, 1.4, 16);
      for (let n = 0; n < 4 + g.stage; n++) this.demon.growOne({ near: focus.pos, delay: 0.05 + n * 0.08 });
      g.audio.rattle(focus.pos, 12, 0.5);
      g.fx.word(focus.pos.clone().setY(3.2), 'KLA-DONK!', { size: 1.1 });
      this.laugh(focus.pos.clone().setY(1.5), { chance: 0.6, delay: 0.7 });
    } else if (s.then === 'trick') this.demon._trick();
    else if (s.then === 'eyes') { this.sc.peekCooldown = 0; for (let n = 0; n < 3; n++) this.sc.peek(focus.pos, { force: true, near: 9, mood: pick(['watch', 'glare']) }); this.laugh(focus.pos.clone().setY(1.5), { chance: 0.5, delay: 1.2, kinds: ['giggle'] }); }
    else if (s.then === 'wave') this._wave();
    this.g.onMindEvent?.('release', focus.pos);
  }

  summary() {
    return { agenda: this.agenda.map(a => a.kind), temperament: this.temper.name, phase: this.phase, phases: this.phases.join(' → '), pace: +this.pace.toFixed(2),
      thresh: +this.thresh.toFixed(2), strategy: this.strategy, startI: this.startI, fails: this.fails, dodges: this.dodges, laughs: this.laughs,
      hotColumns: [...this.targets.entries()].filter(([, m]) => m.n >= 3).length, counts: { ...this.counts }, log: this.log.slice(-40) };
  }
}
