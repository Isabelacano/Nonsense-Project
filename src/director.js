// The session director. It decides what kind of story this session tells, and when.
//
// At the start it rolls (from the session seed) a behavioural profile for the scaffolding —
// curiosity, mischief, destructiveness, playfulness, escalation, evasion — and a leaning towards
// one of the five endings. From then on everything that happens is reported to it (dismantles,
// dodges, refusals, regrowth, tricks, laughs, arrivals, arguments, quitting, damage) and moves:
//   tension   how far the situation has escalated; it drives the stages (instead of fixed bay or
//             attempt counts), so some sessions stay subtle for a long time and others boil over
//   profile   the tendencies drift with experience and feed the scaffold's choices (mind.js), its
//             growth and the crowd's patience
//   outcomes  a score per ending, earned by what actually happened
// When tension reaches the climax it picks one ending, weighted (see BASE: the standard
// destruction is the common one, the flying scaffolding the rarest), and never the one the
// previous session ended with if there is any alternative; the last few endings are remembered
// in localStorage and recent ones are weighted down, the flying ending especially.
//
// Every ending ends the same way underneath: the scaffolding destroys the university building
// completely (_destroy / _crush: it grips a column, grows onto it, crushes it, grows into the
// ruin; at the very end the two end walls sink). What differs is what happens around that:
//   collapse  the standard ending: it eats the building; the crew runs, one of them far too slowly
//   students  "The Dean Has Left the Building": students, professors and the dean climb out of
//             the windows and run for it, complaining all the way, before their wing goes
//   walker    most of the building goes; then the scaffold pulls itself together into a creature,
//             head-butts the rest down and walks out of the courtyard
//   ghost     once nothing is left standing, Walter Gropius rises from the ruins
//   fly       it multiplies while it eats the building, then lifts off and flies away in flocks
// Each ending runs as an explicit state (this.E): phases, a completion condition, a safety limit,
// and exactly one transition to the end card (finish()). finish() never completes while anything
// of the building is still standing: it first speeds the destruction up and waits for it.
// While an ending runs the ordinary escalation stops: no arrivals, pranks or rare events.
// It also runs the rare events of the main game (students at the windows, the administrator,
// a tour group): each has conditions, a weight, a cooldown and exclusions.
// Dev only (dev server): ?seed=…, ?ending=walker, ?event=admin; window.__director().
import * as THREE from 'three';
import { CFG, outsideCourt } from './config.js';
import { SESSION_SEED, DEV } from './seed.js';
import { cellCenter } from './scaffold.js';
import { Walker } from './walker.js';
import { Extras } from './extras.js';

const rr = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const pickW = (items) => {
  const total = items.reduce((s, [, w]) => s + Math.max(0, w), 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const [v, w] of items) { r -= Math.max(0, w); if (r <= 0) return v; }
  return items[items.length - 1][0];
};

export const ENDINGS = ['collapse', 'students', 'walker', 'ghost', 'fly'];
// how common each ending is meant to be: the standard destruction is the baseline, the students
// and the walking scaffold are regular alternatives, the ghost is a special occasion and the
// flying scaffolding the rarest of all
const BASE = { collapse: 5.5, students: 2.5, walker: 2.5, ghost: 1.1, fly: 0.3 };
// what each leaning does to the starting profile
const LEANS = {
  collapse: { tend: { destruction: 0.35, escalation: 0.1 } },
  students: { tend: { curiosity: 0.3, mischief: 0.15, escalation: -0.05 } },
  walker:   { tend: { playfulness: 0.35, curiosity: 0.25 } },
  ghost:    { tend: { destruction: 0.35, escalation: 0.1 } },
  fly:      { tend: { escalation: 0.3, playfulness: 0.15, destruction: 0.05 } },
};
// safety nets: after this long the destruction is hurried to its end; after HARD_EXTRA more the
// ending finishes regardless (seconds from the ending's start)
const MAX_T = { collapse: 42, students: 48, walker: 72, ghost: 55, fly: 62 };
const HARD_EXTRA = 15;
const STAGE_NAMES = {
  collapse: ['Reversal', 'The permanent building is giving way. The temporary one is not.'],
  students: ['Evacuation', 'Everybody out. The dean too.'],
  walker: ['It Lives', 'Something is pulling itself together.'],
  ghost: ['Demolition', 'It is not leaving anything standing.'],
  fly: ['Swarm', 'It is multiplying. Faster than ever.'],
};
const MEMORY_KEY = 'pandaemonium.endings';
// the wide shot of the whole building, from the north edge of the courtyard
const WIDE = { pos: V(0, 15, 32.5), look: V(0, 3.5, -3) };

function recall() { try { const a = JSON.parse(localStorage.getItem(MEMORY_KEY) || '[]'); return Array.isArray(a) ? a.filter(e => ENDINGS.includes(e)) : []; } catch (e) { return []; } }
function remember(kind) { try { const a = recall(); a.push(kind); localStorage.setItem(MEMORY_KEY, JSON.stringify(a.slice(-5))); } catch (e) { /* storage unavailable: only this session's own randomness then */ } }

export class Director {
  constructor(game) {
    this.g = game;
    this.seed = SESSION_SEED;
    this.t = 0;
    this.past = recall();                               // endings of the previous sessions, oldest first
    this.last = this.past[this.past.length - 1] || null;
    const dev = DEV.ending && ENDINGS.includes(DEV.ending) ? DEV.ending : null;
    this.lean = dev || pickW(ENDINGS.map(e => [e, BASE[e] * this._recency(e)]));
    const base = () => rr(0.25, 0.75);
    this.tend = { curiosity: base(), mischief: base(), destruction: base(), playfulness: base(), escalation: base(), evasion: base() };
    for (const [k, v] of Object.entries(LEANS[this.lean].tend)) this.tend[k] = clamp01(this.tend[k] + v);
    this.tension = 0;
    this.jitter = rr(0.8, 1.25);                    // how far apart the stages lie this session
    this.scores = Object.fromEntries(ENDINGS.map(e => [e, 0]));
    this.counts = {};
    this.history = [];
    this.ending = null;
    this.E = null;
    // rare events: whether each one is even possible this session is rolled once, up front
    this.rare = { cool: 18, seen: {}, rolls: { students: Math.random() < (this.lean === 'students' ? 0.9 : 0.6), admin: Math.random() < 0.45, tour: Math.random() < 0.3 } };
    this.extras = new Extras(game);
    this.walker = null;
    this.lastSurprise = 0;
    this._note('session', `seed ${this.seed} lean ${this.lean} (previous: ${this.past.join(', ') || 'none'}) ${Object.entries(this.tend).map(([k, v]) => k + ' ' + v.toFixed(2)).join(', ')}`);
  }

  // recently played endings are weighted down (the last one is excluded at the climax anyway);
  // the flying ending stays away for longer
  _recency(e) {
    let k = e === this.last ? 0.1 : this.past.slice(-3).includes(e) ? 0.5 : 1;
    if (e === 'fly' && this.past.slice(-4).includes('fly')) k *= 0.25;
    return k;
  }

  _note(kind, info = '') {
    this.history.push(`${this.t.toFixed(1)}s ${kind}${info ? ' ' + info : ''}`);
    if (this.history.length > 400) this.history.shift();
  }

  // ---------- events in ----------
  // Everything noteworthy is reported here. It escalates the tension, earns outcome scores and
  // lets the profile drift.
  note(kind, data = {}) {
    this.counts[kind] = (this.counts[kind] || 0) + 1;
    if (this.ending) return;
    const e = 0.6 + this.tend.escalation * 0.8;
    const add = (v) => { this.tension += v * e; };
    const sc = this.scores, T = this.tend;
    switch (kind) {
      case 'dismantled': add(0.010); sc.collapse += 0.02; break;
      case 'dodged': add(0.022); sc.walker += 0.012 * (0.5 + T.playfulness); sc.fly += 0.004; T.evasion = clamp01(T.evasion + 0.006); this.lastSurprise = this.t; break;
      case 'refused': add(0.02); sc.collapse += 0.03; break;
      case 'regrew': add(0.014); sc.collapse += 0.03; sc.fly += 0.01; break;
      case 'trick': add(0.012); if (data.big) { add(0.02); this.lastSurprise = this.t; } if (data.kind === 'tower' || data.kind === 'elsewhere' || data.kind === 'seed') sc.fly += 0.03; if (data.kind === 'wave' || data.kind === 'copycat' || data.kind === 'coordinated') { sc.walker += 0.1; T.playfulness = clamp01(T.playfulness + 0.02); } if (data.kind === 'bow') sc.students += 0.06; break;
      case 'laugh': add(0.012); sc.walker += 0.04; sc.students += 0.03; T.mischief = clamp01(T.mischief + 0.01); break;
      case 'arrival': add(0.006); sc.collapse += 0.02; sc.students -= 0.01; if (this.g.crew.count > 12) T.playfulness = clamp01(T.playfulness + 0.005); break;
      case 'argue': add(0.008); sc.collapse += 0.03; sc.students += 0.02; break;
      case 'organise': sc.collapse += 0.02; break;
      case 'quit': sc.collapse += 0.04; break;
      case 'damage': add(0.03 * (data.size || 1)); sc.ghost += 0.06 * (0.5 + T.destruction); sc.collapse += 0.06; T.destruction = clamp01(T.destruction + 0.01); break;
      case 'repeat': T.evasion = clamp01(T.evasion + 0.012); break;
    }
  }

  // multipliers for the scaffold's behaviour choices (mind.js)
  like(kind) {
    const T = this.tend;
    const m = {
      dodge: 0.6 + T.evasion * 0.9, shy: 0.5 + T.evasion, platform: 0.5 + T.evasion, fake: 0.5 + T.mischief,
      bow: 0.4 + T.mischief * 1.2, peek: 0.5 + T.curiosity, fidget: 0.5 + T.curiosity * 0.8, nudge: 0.6 + T.curiosity * 0.6,
      wave: 0.3 + T.playfulness * 1.4, copycat: 0.3 + T.playfulness * 1.4, coordinated: 0.4 + T.playfulness + Math.min(1, this.g.crew.count / 20),
      obstacle: 0.4 + T.destruction, elsewhere: 0.4 + T.destruction * 0.8 + T.escalation * 0.4, falseCalm: 0.4 + T.mischief * 0.6 + T.destruction * 0.4,
      stillness: 0.5 + T.curiosity * 0.7, laugh: 0.4 + T.mischief, wiggle: 0.4 + T.playfulness, distant: 0.4 + T.curiosity * 0.4 + T.mischief * 0.4,
    };
    return m[kind] ?? 1;
  }
  // growth: during an ending only where the ending wants it (the swarm multiplying); the
  // destruction itself grows the scaffold onto and into the building (_crush)
  growth() {
    const base = 0.7 + this.tend.destruction * 0.35 + this.tend.escalation * 0.35;
    if (!this.ending) return base;
    return this.ending === 'fly' && this.E?.phase === 'multiply' ? base * 21 : 0;
  }
  mischief() { return 0.7 + this.tend.mischief * 0.6; }
  patience() { return { collapse: 1, students: 1.6, walker: 1.1, ghost: 0.9, fly: 1 }[this.lean] ?? 1; }

  // ---------- per frame ----------
  update(dt, ddt) {
    this.t += dt;
    const g = this.g;
    this.extras.update(dt);
    if (this.walker) this._updateWalker(dt);
    if (!this.ending) {
      if (g.stage >= 1) this.tension += ddt * 0.0012 * (0.6 + this.tend.escalation * 0.8);   // the slow creep of things not working
      const j = this.jitter;
      if (g.stage === 1 && this.tension > 0.12 * j) g.setStage(2);
      else if (g.stage === 2 && this.tension > 0.32 * j) g.setStage(3);
      else if (g.stage === 3 && (this.tension > 0.62 * j || this.t > 480)) this._climax();
      this._rareEvents(dt);
    } else this._runClimax(dt);
  }

  // ---------- choosing the ending ----------
  possible() {
    const g = this.g;
    return {
      collapse: true,
      students: this.extras.freeWindows >= 3,
      walker: true,                                       // it can always pull itself together somewhere
      ghost: true,
      fly: g.scaffold.count >= 60,
    };
  }

  weights() {
    const sc = this.scores;
    return Object.fromEntries(ENDINGS.map(e => [e, BASE[e] * (1 + 0.15 * Math.min(4, Math.max(0, sc[e]))) * (e === this.lean ? 1.6 : 1) * this._recency(e)]));
  }

  _climax() {
    const ok = this.possible(), w = this.weights();
    let cands = ENDINGS.filter(e => ok[e]);
    // not the same ending as last time, if there is any alternative at all
    if (cands.length > 1 && this.last) cands = cands.filter(e => e !== this.last);
    const choice = DEV.ending && ENDINGS.includes(DEV.ending) ? DEV.ending : pickW(cands.map(e => [e, w[e]]));
    this._note('climax', `${choice} (weights ${ENDINGS.map(e => `${e} ${ok[e] ? w[e].toFixed(2) : '–'}`).join(', ')}; last ${this.last || 'none'})`);
    this.beginClimax(choice);
  }

  beginClimax(kind) {
    const g = this.g;
    if (this.ending) return;                          // never a second ending
    this.ending = kind;
    g.climax = kind;
    this.E = { kind, phase: null, t: 0, pt: 0, maxT: MAX_T[kind], done: false, data: {} };
    remember(kind);
    g.hud.clearBubbles();
    const [name, hint] = STAGE_NAMES[kind];
    g.setStage(4, { name, hint, collapse: false });
    this.extras.onSpectacle();
    this[`_begin_${kind}`]();
  }

  _phase(p, info = '') { this.E.phase = p; this.E.pt = 0; this._note(`${this.E.kind}:${p}`, info); }

  // The one and only way to the end card. If anything of the building is still standing, it
  // first hurries the destruction along and finishes as soon as that is complete.
  finish(reason, delay = 0.8) {
    const E = this.E;
    if (!E || E.done) return;
    if (!this.g.building.allDown() && !E.hard) {
      if (!E.pending) { E.pending = { reason, delay }; this._hurry(); this._note('end', `waiting for the last of the building (${reason})`); }
      return;
    }
    E.done = true; E.endT = E.t;
    this._note('end', `${E.kind} after ${E.t.toFixed(1)}s (${reason}); building ${this.g.building.allDown() ? 'completely destroyed' : 'NOT complete'}`);
    this.g.later(delay, () => { this.g.hud.setCinematic(false); this.g.showEnd(); });
  }

  _runClimax(dt) {
    const E = this.E;
    E.t += dt; E.pt += dt;
    this._tickDestroy(dt);
    // the scaffold's view cut-away follows what the shot is about (e.g. the ghost), not the player
    if (E.data.cutTo && !this.g.crew.escape) this.g.crew.focus.copy(E.data.cutTo);
    if (!E.done && E.pending) { if (this.g.building.allDown()) this.finish(E.pending.reason, E.pending.delay); }
    else if (!E.done) this[`_run_${E.kind}`](dt, E);
    else if (E.kind === 'fly' && E.data.dirs) this._steerSwarm(dt, E);     // stragglers keep flying off behind the card
    if (!E.done && E.t > E.maxT && !E.hurried) { E.hurried = true; this._note('safety', 'hurrying the destruction'); this._hurry(); }
    if (!E.done && E.t > E.maxT + HARD_EXTRA) { E.hard = true; this.finish('hard safety limit', 0.2); }
  }

  // what the slowpoke looks back at
  lookBackAt() { return this.E?.data.focus || null; }

  crowd() { return this.g.crew.list.filter(w => w.root.visible && !w.left); }
  _line(w, text, opts = {}) { if (w && w.root.visible) this.g.crew.speak(w, text, { dur: 2.2, priority: true, ...opts }); }
  _giggle(pos, kind, opts) { const d = this.g.audio.laugh(pos, kind, opts); if (d) { this.g.mind.laughs++; this._note('giggle', kind); } return d; }
  scaffoldCentre() {
    const c = V(0, 0, 0), L = this.g.scaffold.list;
    for (const b of L) c.add(cellCenter(b.i, b.j, b.k));
    return L.length ? c.divideScalar(L.length) : V(-20, 3, 6);
  }
  _cinematic(shot) { const g = this.g; if (shot) g.cam.fixed = shot; g.cinematic = true; g.hud.setCinematic(true); }

  // ===================== the destruction (every ending) =====================
  // Two stages, both driven by the scaffold and both using the building's own damage system:
  //   erode   the scaffold keeps working on the facade: module after module (weighted towards
  //           where the scaffold is thickest and what is already hurt) cracks, loses its windows,
  //           leans and topples; a column whose floors give way sinks on its own. Integrity falls
  //           step by step, continuing what the main game already did (demon.wear).
  //   final   once the building is badly enough hurt (`target` integrity, or after `maxErode`
  //           seconds), the rest goes in a quick chaotic cascade, ending in one big impact (_finale),
  //           and then the two end walls sink. building.allDown() is the final state.
  // `keep` columns (nearest to `from`) are spared for the walking scaffold to finish itself;
  // `hold(col)` spares a column for now (students still at its windows).
  _destroy({ target = 0.3, rate = [0.3, 0.48], keep = 0, from = null, hold = null, delay = 0.4, maxErode = 13, gap = [0.15, 0.3] } = {}) {
    const b = this.g.building;
    const keepCols = keep && from ? b.standing().sort((p, q) => Math.abs(p.x0 + p.w / 2 - from.x) - Math.abs(q.x0 + q.w / 2 - from.x)).slice(0, keep) : [];
    for (const c of keepCols) c.protected = true;         // nothing but the creature itself may touch these
    this.E.destroy = { phase: 'erode', t: delay, target, rate, gap, maxErode, erodeT: 0, keepCols, hold, total: b.columns.length };
    this._note('destroy', `erode from integrity ${b.integrity().toFixed(2)} to ${target}${keep ? `, ${keep} columns left for later` : ''}`);
  }
  // how much of the building is gone (by weight)
  _destroyed() { return 1 - this.g.building.integrity(); }
  _hurry() {
    const Q = this.E.destroy;
    if (!Q) { this._destroy({ target: 1, delay: 0.1 }); }
    const R = this.E.destroy;
    for (const c of R.keepCols) c.protected = false;
    R.keepCols = []; R.hold = null; R.gap = [0.1, 0.2]; R.t = Math.min(R.t, 0.1);
    if (R.phase === 'erode') this._toFinal('hurried');
  }
  _toFinal(why) { const Q = this.E.destroy; Q.phase = 'final'; Q.t = 0.2; this._note('destroy', `final collapse (${why}) at integrity ${this.g.building.integrity().toFixed(2)}`); }

  _tickDestroy(dt) {
    const Q = this.E.destroy, b = this.g.building, g = this.g;
    if (!Q) return;
    Q.keepCols = Q.keepCols.filter(c => !c.failed);
    const free = (c) => !c.failed && !Q.keepCols.includes(c) && !(Q.hold && Q.hold(c));
    Q.t -= dt;
    if (Q.phase === 'erode') {
      Q.erodeT += dt;
      if (Q.t <= 0) {
        Q.t = rr(Q.rate[0], Q.rate[1]);
        const m = this._erodeTarget(free);
        if (m) {
          const c = b._center(m);
          g.demon.wearModule(m, rr(0.2, 0.45), false);
          g.scaffold.shudder(c, 0.8, 7);
          if (Math.random() < 0.5) g.demon.growOne({ near: c.clone().setZ(1), delay: 0.05 });
          if (Math.random() < 0.35) g.audio.rattle(c, 5, 0.35);
          if (Math.random() < 0.15) g.fx.word(c.clone().add(V(0, 1, 1.5)), pick(['KRRRK!', 'KNACK!', 'KNIRSCH!']), { size: 0.9, life: 1 });
          if (m.state !== 'intact' && Math.random() < 0.4) this.extras.studentsDuck();
        }
      }
      if (b.integrity() <= Q.target || Q.erodeT > Q.maxErode) this._toFinal(b.integrity() <= Q.target ? 'badly enough hurt' : 'time');
    } else if (Q.phase === 'final' && Q.t <= 0) {
      const next = b.standing().filter(free).sort(() => Math.random() - 0.5)[0];
      if (next) { this._crush(next, { quick: true }); Q.t = rr(Q.gap[0], Q.gap[1]); }
      else if (!b.standing().length && !Q.keepCols.length && !Q.finale) {
        // everything is on its way down: the big one, then the last walls
        Q.finale = true;
        g.later(1.2, () => this._finale());
        if (!Q.wallsByWalker) g.later(1.8, () => b.collapseStatic());
      }
    }
  }

  // which module the scaffold works on next: where it is thickest, and what is already hurt
  _erodeTarget(free) {
    const g = this.g, b = g.building;
    const load = new Map();
    for (const s of g.scaffold.list) { const c = b.columnAt(cellCenter(s.i, s.j, s.k).x); if (c) load.set(c, (load.get(c) || 0) + 1); }
    const cands = [];
    for (const col of b.standing()) {
      if (!free(col)) continue;
      for (const k of ['f0', 'f1', 'f2', 'rL']) {
        const m = col.modules[k];
        if (m.state === 'intact' && m.hasHealth) cands.push([m, 0.6 + (load.get(col) || 0) * 0.08 + (1 - m.health) * 2.2 + (k === 'f0' ? -0.3 : 0)]);
      }
    }
    return pickW(cands);
  }

  // the culmination: one big impact over the whole site
  _finale() {
    const g = this.g;
    g.fx.shake(0.9);
    g.audio.rumble(V(0, 2, -6), 3.5, 1);
    g.audio.impact(V(0, 1, -4), 2.6);
    for (let x = -34; x <= 34; x += 6) g.later(Math.random() * 0.5, () => g.fx.dust(V(x, 1, rr(-2, 2)), 10, 5));
    g.fx.word(V(0, 11, 4), 'KA-WUMMMM!', { size: 2.2, life: 1.8 });
    this.extras.studentsDuck();
    this._note('destroy', 'final impact');
  }

  // The scaffold takes one column: it clamps on (shudder, a few new bays growing onto the face,
  // rattling), crushes it, and a moment later grows into the ruin.
  _crush(col, { quick = false } = {}) {
    const g = this.g, top = col.toWorld(col.w / 2, 7, 0.6);
    if (col.failed) return;
    g.scaffold.shudder(top, 1.2, 9);
    for (let n = 0; n < 3; n++) g.demon.growOne({ near: col.toWorld(col.w / 2, 2 + n * 2, 1), delay: n * 0.08 });
    g.audio.rattle(top, 8, 0.45);
    if (Math.random() < 0.35) g.fx.word(top.clone().setY(10), pick(['KRRRK!', 'KNACK!', 'CRUNCH!', 'KRAWUMM!', 'KNIRSCH!']), { size: 1, life: 1.2 });
    g.later(quick ? 0.1 : 0.45, () => {
      g.building.collapseCore(col, 0.05);
      g.fx.shake(0.22);
      this.extras.studentsDuck();
      this.E.data.crushed = (this.E.data.crushed || 0) + 1;
    });
    g.later(3.2, () => { for (let n = 0; n < 2; n++) g.demon.growOne({ near: col.toWorld(col.w / 2, 0.5, -col.depth / 2), delay: n * 0.1 }); });
  }

  // ===================== D: the standard destruction (the workers' escape) =====================
  // The scaffold wears the building down while the whole night shift piles in and keeps working;
  // then the final collapse, and the moment it lands an absurdly large crowd runs for it: tools
  // flying, lines shouted on the run, the camera chasing the crowd and closing in. Last of all
  // the one who cannot keep up, and his final remark.
  _begin_collapse() {
    const g = this.g;
    this._destroy({ target: 0.3, maxErode: 12 });
    const n = Math.max(18, Math.min(40, 42 - g.crew.count));
    g.crew.nightShift(n, { fast: true });
    this.E.data.focus = V(0, 6, -6);
    this._phase('erode', `${n} more workers called`);
    g.later(0.8, () => this._line(pick(this.crowd()) || g.worker, pick(['It\'s… eating it.', 'Is it supposed to do that?', 'Oh no. Oh no no no.']), { dur: 2 }));
  }

  _run_collapse(dt, E) {
    const g = this.g, D = E.data, Q = E.destroy;
    if (E.phase === 'erode' && Q.phase === 'final') {
      this._phase('collapse');
      this._cinematic(WIDE);                               // the final collapse, all of it in view
      g.later(0.5, () => this._line(pick(this.crowd()) || g.worker, pick(['It\'s coming DOWN!', 'Everybody OUT!', 'RUN!']), { dur: 1.6 }));
    }
    // the moment it lands: everybody runs, most of them towards the north gap (and the camera)
    if (E.phase === 'collapse' && Q.finale && E.pt > 1.3) {
      this._phase('run', `${this.crowd().length} workers`);
      g.crew.startEscape('flee', { shot: WIDE, toward: 0.7, tools: true });
      D.chase = true;
    }
    if (E.phase === 'run') {
      const st = g.crew.escapeStatus(), slow = g.crew.escape.slow;
      this._chaseShot(st, slow);
      // the crowd is (nearly) out: now the slowpoke has the stage for his final remark
      if (!D.slowSaid && slow && slow.root.visible && (st.mainOut || st.mainLeft <= 1) && st.t > 3.5) {
        D.slowSaid = E.pt;
        slow.react('wipe', { fx: false, voice: false });
        this._line(slow, slow === g.worker ? 'They don\'t pay us enough for this.' : pick(['…Wait for me.', 'Thirty-one years. For this.', 'Don\'t wait for me. Seriously.', 'Tell them I tried.']), { dur: 2.6 });
      }
      const slowDone = st.slowOut || (D.slowSaid && E.pt - D.slowSaid > 2.6);
      if (g.building.allDown() && st.mainOut && slowDone) this.finish(st.slowOut ? 'the building is gone and so is everybody' : 'the building is gone; the slowpoke had the last word', 0.8);
      else if (st.t > 18) this.finish('escape time limit', 0.5);
    }
  }

  // The chase camera: it frames the fleeing crowd from the side they are running to and closes in
  // as they go; when only the slowpoke is left, it is on him.
  _chaseShot(st, slow) {
    const g = this.g, D = this.E.data;
    const runners = this.crowd().filter(w => w !== slow && w.ai?.flee && !w.ai.flee.out && st.t - w.ai.flee.start > -0.5);
    const solo = !runners.length || st.mainLeft <= 1;
    const L = solo ? (slow && slow.root.visible ? [slow] : runners) : runners;
    if (!L.length) return;
    const c = L.reduce((s, w) => s.add(w.pos), V(0, 0, 0)).divideScalar(L.length);
    const spread = Math.min(14, L.reduce((m, w) => Math.max(m, w.pos.distanceTo(c)), 0));
    const anchor = V(-5, 0, 46);                            // the north gap: where most of them are running
    const dir = anchor.clone().sub(c).setY(0);
    if (dir.length() < 1) dir.set(0, 0, 1);
    dir.normalize();
    const zoom = Math.min(1, st.t / 4);
    const dist = solo ? 6.5 : (20 - 11 * zoom) + spread * 0.45;
    const pos = c.clone().addScaledVector(dir, dist).setY(solo ? 2.3 : 2.2 + dist * 0.22);
    // inside the courtyard, or (north of it) in the middle of the gap between the Van-de-Velde-Bau and No. 15
    pos.x = Math.max(-37, Math.min(58, pos.x)); pos.z = Math.max(3, Math.min(42, pos.z));
    if (pos.z > 32.5) { if (pos.x > -10 && pos.x < -3) pos.x = Math.max(-9, Math.min(-4, pos.x)); else pos.z = 32.5; }
    g.cam.fixed = { pos, look: c.setY(solo ? 1.5 : 1.2) };
    D.focus = c;
  }

  // ===================== A: "The Dean Has Left the Building" =====================
  _begin_students() {
    const g = this.g;
    const n = this.extras.studentsMass(9, 4);
    this.E.data.focus = V(6, 6, 0);
    this._phase('watch', `${n} windows`);
    // up at the windows, the crew still at it below; the scaffold shows off for its audience
    this._cinematic({ pos: V(3.5, 5.2, 30.5), look: V(9, 4.8, 0) });
    g.later(2.0, () => g.mind._wave());
    // the building wears down while they watch; wherever somebody is still at a window it waits
    this._destroy({ target: 0.3, delay: 1.5, maxErode: 14, hold: (c) => !this.extras.windowsClear(c.x0, c.x1) });
  }

  _run_students(dt, E) {
    const g = this.g, D = E.data;
    if (E.phase === 'watch' && E.pt > 5.5) {
      this._phase('evacuate');
      D.escapees = this.extras.studentsEscape(3.2);
      g.later(0.6, () => this._line(pick(this.crowd()) || g.worker, pick(['Are they… jumping?', 'Mind the students!', 'They\'re coming out of the WINDOWS.']), { dur: 2 }));
    }
    if (E.phase === 'evacuate') {
      if (!g.crew.escape && E.pt > 3) g.crew.startEscape('flee', { shot: WIDE });
      const st = g.crew.escapeStatus();
      if (g.building.allDown() && this.extras.studentsInside === 0 && st && (st.mainOut || st.t > 9)) this.finish('everybody got out; the building did not', 1.2);
    }
  }

  // ===================== B: the living scaffolding =====================
  // The building wears down almost completely first (the crew backs off and watches); only then
  // does the scaffold pull itself together into the creature, which head-butts down what is left,
  // the end walls last, and trots out of the courtyard.
  _begin_walker() {
    const g = this.g;
    this.E.data.spot = this._walkerSpot() || V(Math.max(-28, Math.min(20, g.worker.pos.x)), 0, 8);
    this._destroy({ target: 0.25, keep: 3, from: this.E.data.spot, maxErode: 14 });
    this.E.destroy.wallsByWalker = true;
    this.E.data.focus = V(0, 6, -6);
    g.crew.stare(() => V(0, 4, -4), { style: 'walker', near: 0, gather: V(-2, 0, 10) });
    this._cinematic(WIDE);
    this._phase('destroy');
  }

  _run_walker(dt, E) {
    const g = this.g, D = E.data, Q = E.destroy, b = g.building;
    // everything but the creature's three columns is down (or on its way): it goes quiet …
    if (E.phase === 'destroy' && Q.phase === 'final' && !b.standing().some(c => !Q.keepCols.includes(c)) && E.pt > 3) {
      g.mind._startStill();
      g.mind.still.dur = 2; g.mind.still.then = 'nothing';
      this._phase('hush', `integrity ${b.integrity().toFixed(2)}`);
      g.later(0.8, () => this._line(pick(this.crowd()) || g.worker, pick(['…Why\'d it stop?', 'Is it over?', 'Too quiet.']), { dur: 1.8 }));
    }
    if (E.phase === 'hush' && E.pt > 2.4) { this._phase('assemble'); this._assembleWalker(); }
    const wk = this.walker;
    if (!wk) return;
    if (E.phase === 'assemble' && wk.stand >= 1) {
      this._phase('attack');
      this._giggle(wk.center, 'burst', { vol: 1.1 });
      g.later(0.8, () => this._line(pick(this.crowd()) || g.worker, pick(['It\'s… standing up.', 'Nobody move.', 'Is that thing… alive?']), { dur: 2 }));
      D.targets = Q.keepCols.slice().sort((a, c) => Math.abs(a.x0 - wk.pos.x) - Math.abs(c.x0 - wk.pos.x));
      // and the end walls, last: the nearer one
      D.wall = Math.abs(wk.pos.x + 36) < Math.abs(wk.pos.x - 36.5) ? V(-33.5, 0, 6) : V(34, 0, 6);
      this._nextTarget(wk);
    }
    if (E.phase === 'attack') {
      // walks up to each remaining piece and head-butts it down
      if (wk.done && D.target && !D.butting) {
        D.butting = true;
        wk.headbutt();
        g.later(0.55, () => {
          const t = D.target;
          if (t === 'wall') { b.collapseStatic(); this._finale(); }
          else if (t && !t.failed) { t.protected = false; this._crush(t, { quick: true }); }
          g.fx.shake(0.45); g.audio.clank(wk.center, { heavy: true, vol: 0.9 });
          g.fx.word(wk.center.clone().setY(9), pick(['BONK!', 'KRUNCH!', 'DONG!']), { size: 1.2 });
          if (Math.random() < 0.5) this._giggle(wk.center, pick(['titter', 'giggle']));
          if (!D.saidAttack) { D.saidAttack = true; g.later(0.8, () => this._line(pick(this.crowd()) || g.worker, pick(['It\'s eating the rest!', 'It\'s HEAD-BUTTING the university.', 'Stop it! …Somebody else stop it.']), { dur: 2 })); }
          g.later(0.7, () => { D.butting = false; this._nextTarget(wk); });
        });
      }
      if (!D.target && !D.butting && b.allDown()) {
        // nothing left to eat: off it goes, out through the nearest wide exit
        this._phase('leave');
        const north = [V(-6.3, 0, Math.max(wk.pos.z, 22)), V(-6.3, 0, 41), V(-6.3, 0, 56)];
        const east = [V(Math.min(50, wk.pos.x + 6), 0, 6), V(66, 0, 4.6), V(82, 0, 4.4)];
        const len = (p) => p.slice(0, 2).reduce((s, q, i) => s + q.distanceTo(i ? p[i - 1] : wk.pos), 0);
        wk.path = len(north) < len(east) ? north : east; wk.done = false;
        wk.speed = 4.4;                                    // trotting off, pleased with itself
        D.exit = wk.path[1].clone();
        D.focus = D.exit.clone().setY(3);
        g.later(1.2, () => this._line(pick(this.crowd().filter(w => w !== g.worker)) || g.worker, pick(['Is it… leaving?', 'Where is it GOING?', 'Should we follow it?', 'Somebody stop it! …No, not me.'])));
      }
    }
    if (E.phase === 'leave' && outsideCourt(wk.pos, 5.5)) {
      // the whole creature is past the courtyard boundary
      this._phase('gone', `at ${wk.pos.x.toFixed(0)}, ${wk.pos.z.toFixed(0)}`);
      g.cam.fixed = { pos: g.cam.cam.position.clone(), look: D.exit.clone().setY(3) };
      this._line(g.worker, pick(['…Did the scaffolding just quit?', 'Well. That\'s one way to dismantle it.', 'Is it going to Erfurt?']), { dur: 2.6 });
      g.later(1.5, () => { const o = pick(this.crowd().filter(w => w !== g.worker)); if (o) { this._line(o, pick(['I\'m not chasing it.', 'Somebody tell Erfurt.', 'Can we go home now?', 'It took the good wrench.']), { dur: 2 }); o.react('shrug', { fx: false }); } });
      this.finish('it ate the building and walked out of the courtyard', 3.4);
    }
  }

  _nextTarget(wk) {
    const D = this.E.data;
    D.targets = (D.targets || []).filter(c => !c.failed);
    D.target = D.targets.shift() || null;
    if (!D.target && D.wall && !this.g.building.staticGone && !this.g.building.staticSink) { D.target = 'wall'; wk.path = [D.wall.clone()]; wk.done = false; D.wall = null; return; }
    if (D.target) { wk.path = [D.target.toWorld(D.target.w / 2, 0, 6.2)]; wk.done = false; }
  }

  // a spot in the courtyard with enough ground bays to make a body of, and room to stand up
  _walkerSpot() {
    const g = this.g;
    let best = null, bn = 0;
    for (const b of g.scaffold.list) {
      if (b.j !== 0 || b.k < 1) continue;
      const c = cellCenter(b.i, 0, b.k);
      if (c.x < -30 || c.x > 34 || c.z > 26) continue;
      let n = 0;
      for (const o of g.scaffold.list) { const oc = cellCenter(o.i, o.j, o.k); if (Math.abs(oc.x - c.x) < 5 && Math.abs(oc.z - c.z) < 4.5) n++; }
      if (n > bn) { bn = n; best = c; }
    }
    return bn >= 6 ? best : null;
  }

  _assembleWalker() {
    const g = this.g;
    const spot = (this._walkerSpot() || this.E.data.spot).clone();
    spot.z = Math.max(5, spot.z);
    // the bays round the spot rattle, slide in, and are gone — the creature is what is left
    const parts = g.scaffold.list.filter(b => { const c = cellCenter(b.i, b.j, b.k); return Math.abs(c.x - spot.x) < 6 && Math.abs(c.z - spot.z) < 5.5 && b.j < 5; });
    for (const b of parts) { b.shake = 1.2; b.dirty = true; }
    g.audio.rattle(spot, 16, 0.6);
    g.fx.word(spot.clone().setY(4), 'KLA-KLA-KLONK', { size: 1.1 });
    // everybody stops and looks, right as it starts to move
    g.crew.stare(() => (this.walker ? this.walker.center : spot), { style: 'walker', near: 7.5 });
    g.later(1.2, () => {
      for (const b of parts) if (g.scaffold.bays.get(b.key) === b) g.scaffold.remove(b, { burst: false });
      g.fx.dust(spot.clone().setY(0.5), 18, 5);
      g.audio.clank(spot, { heavy: true, vol: 0.9 });
      const wk = new Walker(g.scene, g.audio, g.fx, spot.clone().setY(0), Math.PI / 2);
      this.walker = wk;
      wk.speed = 3.6;                                      // a happy little trot
      this._note('walker', `assembled from ${parts.length} bays at ${spot.x.toFixed(0)}, ${spot.z.toFixed(0)}`);
      g.hud.clearBubbles();
      this._cinematic(null);
      this._walkerShot(wk);
      g.crew.reactSome(['recoil', 'surprise', 'dodge'], { frac: 0.7, spread: [0, 0.6] });
      this.extras.onSpectacle();
    });
  }

  // an elevated side-on shot of the creature and the crew together, from the side the crew is on
  _walkerShot(wk) {
    const g = this.g, L = this.crowd().filter(w => !outsideCourt(w.pos, 0));
    const c = L.length ? L.reduce((s, w) => s.add(w.pos), V(0, 0, 0)).divideScalar(L.length) : g.worker.pos.clone();
    const to = (wk.path[0] || this.E.data.exit || wk.pos).clone().sub(wk.pos).setY(0);
    if (to.length() < 0.5) to.set(1, 0, 0);
    to.normalize();
    const perp = V(-to.z, 0, to.x);
    if (perp.dot(V(c.x - wk.pos.x, 0, c.z - wk.pos.z)) < 0) perp.negate();
    if (perp.z < -0.3) perp.negate();                       // never from inside the main building
    const spread = Math.min(16, L.reduce((m, w) => Math.max(m, w.pos.distanceTo(wk.pos)), 0));
    const mid = wk.pos.clone().lerp(c, 0.35);
    const pos = mid.clone().addScaledVector(perp, 15 + spread * 0.6).addScaledVector(to, -5).setY(10);
    pos.x = Math.max(-37, Math.min(58, pos.x)); pos.z = Math.max(5, Math.min(31.5, pos.z));
    g.cam.fixed = { pos, look: mid.setY(2.6) };
  }

  _updateWalker(dt) {
    const g = this.g, wk = this.walker;
    wk.stand = Math.min(1, wk.stand + dt * 0.55);
    const D = this.E?.data;
    // it looks at what it is about to eat, otherwise at the nearest worker
    const near = this.crowd().sort((a, b) => a.pos.distanceTo(wk.pos) - b.pos.distanceTo(wk.pos))[0];
    wk.lookAt = D?.target && D.target !== 'wall' ? D.target.toWorld(D.target.w / 2, 6, 0) : D?.target === 'wall' ? wk.path[0]?.clone().setY(4) : near ? near.head.getWorldPosition(new THREE.Vector3()) : g.cam.cam.position;
    wk.update(dt);
    if (g.cam.fixed && this.E?.phase !== 'gone' && !this.E?.done) this._walkerShot(wk);
    // once it is well clear (or the session is over), it is gone for good
    if (outsideCourt(wk.pos, 18) || (this.E?.done && this.E.t - this.E.endT > 5)) { wk.dispose(); this.walker = null; }
  }

  // ===================== E: the ghost of Walter Gropius =====================
  _begin_ghost() {
    const g = this.g;
    // first: nothing left standing; the crew backs off into the middle of the courtyard and watches
    this._destroy({ target: 0.3, maxErode: 12 });
    this.E.data.at = V(-0.8, 2.4, -1.5);                    // he will rise among the ruins, where the entrance was, above the rubble
    this.E.data.focus = V(0, 5, -6);
    g.crew.stare(() => V(0, 4, -5), { style: 'walker', near: 0, gather: V(-1, 0, 10), avoid: this._rubbleAt });
    this._cinematic(WIDE);
    this._phase('destroy');
  }

  // is there rubble (a fallen facade or roof slab) at this spot? workers should not stand in it
  get _rubbleAt() { const b = this.g.building; return (x, z) => b.colliders.some(c => c.kind === 'rubble' && x > c.minX - 0.9 && x < c.maxX + 0.9 && z > c.minZ - 0.9 && z < c.maxZ + 0.9); }

  _run_ghost(dt, E) {
    const g = this.g, D = E.data, at = D.at;
    // the building is gone; a moment for the dust and rubble to settle
    if (E.phase === 'destroy' && g.building.allDown()) this._phase('settle');
    if (E.phase === 'settle' && E.pt > 1.5) {
      this._phase('omen');
      // the ruins hum; everybody hesitates; the scaffold, for once, is scared. The crew stands on
      // clear ground in front of the ruins, not in the rubble
      // clear paving beyond the outermost rubble in front of him (fallen facades lie far out)
      const rz = g.building.colliders.filter(c => c.kind === 'rubble' && c.maxX > at.x - 10 && c.minX < at.x + 10).reduce((m, c) => Math.max(m, c.maxZ), 2);
      D.crowdZ = Math.min(24, rz + 1);
      g.crew.stare(() => at, { style: 'ghost', near: 4.5, gather: V(at.x, 0, D.crowdZ - 5), avoid: this._rubbleAt });
      g.audio.rumble(at, 4, 0.9);
      g.fx.shake(0.25);
      for (const b of g.scaffold.list) { b.shake = Math.max(b.shake, 0.5); b.dirty = true; }
      for (const b of [...g.scaffold.list]) { const c = cellCenter(b.i, b.j, b.k); if (Math.hypot(c.x - at.x, c.z - at.z) < 5) g.scaffold.remove(b, { burst: false }); }
      D.cutTo = at.clone().setY(1);
      this._cinematic({ pos: V(at.x + 11, 6.5, Math.min(32, D.crowdZ + 11)), look: V(at.x - 1, 2.6, (at.z + D.crowdZ) / 2) });
      // bays standing in the line of sight from the shot to him flinch out of the way too
      const eye = g.cam.fixed.pos, head = at.clone().setY(at.y + 2.5), seg = new THREE.Line3(eye, head), q = V(0, 0, 0);
      for (const b of [...g.scaffold.list]) { const c = cellCenter(b.i, b.j, b.k); seg.closestPointToPoint(c, true, q); if (q.distanceTo(c) < 2.4) g.scaffold.remove(b, { burst: false }); }
      g.later(1.2, () => this._line(pick(this.crowd()), pick(['…Is the ground humming?', 'What is that noise?', 'Why is it so quiet?']), { dur: 1.8 }));
    }
    if (E.phase === 'omen') {
      if (Math.random() < dt * 10) { const a = Math.random() * Math.PI * 2, r = rr(1.5, 3.5); g.fx.dust(V(at.x + Math.cos(a) * r, 0.2, at.z + Math.sin(a) * r), 1, 1.4); }
      if (E.pt > 3.2) {
        this._phase('rise');
        D.ghost = this.extras.ghost(at);
        g.audio.choir(at, 6, 0.4);
        g.later(1.6, () => g.audio.whoosh(at.clone().setY(1), 1.6, 0.6, true));
        g.later(2.0, () => g.crew.reactSome(['recoil', 'surprise', 'dodge', 'duck'], { frac: 0.85, spread: [0, 0.9] }));
      }
    }
    const gh = D.ghost;
    if (E.phase === 'rise' && gh && gh.phase === 'hover') { this._phase('speak'); gh.face = V(at.x, 4, -10); D.lines = []; }
    if (E.phase === 'speak' && gh) {
      const say = (text, next) => { g.crew.say(gh.w, text, { dur: Math.max(2.4, text.length * 0.075), priority: true }); gh.w.talkT = Math.min(3, text.length * 0.06); D.lines.push(text); D.nextAt = E.pt + next; };
      if (D.lines.length === 0 && E.pt > 1.4) {
        // he looks at the ruins of his building … and then at them
        gh.face = null;
        gh.w.react('despair', { fx: false, voice: false });
        g.fx.symbol(gh.w.head, 'grawlix', { size: 0.9, life: 2 });
        say('WHAT HAVE YOU DONE TO MY UNIVERSITY?!', 3.6);
        g.later(1.6, () => g.crew.reactSome(['guilty', 'guilty', 'headshake'], { frac: 0.7, spread: [0, 1.2] }));
      } else if (D.lines.length === 1 && E.pt > D.nextAt && !D.blamed) {
        // somebody points at the scaffold; it peeks and titters innocently
        D.blamed = true;
        const o = pick(this.crowd());
        if (o) { o.react('point', { fx: false }); this._line(o, pick(['It started it.', 'It was the scaffolding, sir.', 'He did it.']), { dur: 1.8 }); }
        g.later(1.0, () => { g.scaffold.peekCooldown = 0; g.scaffold.peek(at, { force: true, near: 16, mood: 'wink' }); this._giggle(this.scaffoldCentre(), 'titter', { vol: 0.8 }); });
        D.nextAt = E.pt + 2.6;
      } else if (D.lines.length === 1 && D.blamed && E.pt > D.nextAt) {
        gh.w.react('point', { fx: false, voice: false });
        say(pick(['I leave you alone for five minutes.', 'Who authorized this?', 'This is not what I had in mind.']), 2.8);
      } else if (D.lines.length === 2 && E.pt > D.nextAt) {
        this._phase('dismiss');
        g.crew.startEscape('sheepish', { keepShot: true });
        g.later(1.2, () => gh.sink());
        g.later(1.6, () => g.audio.whoosh(at.clone().setY(1), 1.4, 0.45, false));
      }
    }
    if (E.phase === 'dismiss') {
      const st = g.crew.escapeStatus();
      const gone = !this.extras.active.includes(gh);
      if (gone && (st.mainOut || st.t > 4)) this.finish('he has said his piece', 0.8);
    }
  }

  // ===================== C: the swarm flies away (the rare one) =====================
  _begin_fly() {
    const g = this.g;
    g.demon.giant = true;
    g.scaffold.softCap = Math.min(CFG.maxBays, 760);
    this.E.data.start = g.scaffold.count;
    // it multiplies while it eats the building
    this._destroy({ target: 0.3, delay: 1, maxErode: 13 });
    g.crew.stare(() => V(0, 6, -4), { style: 'walker', near: 0, gather: V(-2, 0, 12) });
    this._phase('multiply');
    g.later(1.5, () => this._line(pick(this.crowd()) || g.worker, pick(['It\'s… speeding up.', 'Why is it doing that?', 'Okay, that\'s a LOT of scaffolding.']), { dur: 2 }));
    g.later(1.0, () => this._giggle(g.worker.pos.clone().setY(3), 'giggle'));
  }

  _run_fly(dt, E) {
    const g = this.g, D = E.data, sc = g.scaffold;
    if (E.phase === 'multiply') {
      if (E.pt > 2 && !D.wide) { D.wide = true; this._cinematic(WIDE); }
      // late in the growth spurt it stops obeying gravity: stacks bob and float a little
      if (this._destroyed() > 0.7 && Math.random() < dt * 14) { const b = pick(sc.list); if (b) { b.offsetVel.y += rr(1.5, 3); b.dirty = true; } }
      if (this._destroyed() > 0.7 && !D.noticed) { D.noticed = true; this._line(pick(this.crowd()) || g.worker, pick(['It\'s… floating.', 'That\'s not how gravity works.', 'Is it supposed to hover?']), { dur: 2 }); }
      // it only lets go once there is nothing left to hold on to
      if (g.building.allDown()) this._liftoff();
    } else if (E.phase === 'lift' || E.phase === 'orbit' || E.phase === 'disperse') this._steerSwarm(dt, E);
  }

  _liftoff() {
    const g = this.g, D = this.E.data, sc = g.scaffold;
    this._phase('lift', `${sc.count} bays`);
    D.swarm = this.scaffoldCentre().setY(19);
    D.swarm.x = Math.max(-25, Math.min(25, D.swarm.x)); D.swarm.z = 13;
    D.focus = D.swarm;
    g.crew.stare(() => D.swarm, { style: 'sky' });
    this._cinematic(null);
    D.shoot = true;
    // the little one stays behind for a moment: a ground bay near the camera
    const ground = sc.list.filter(b => b.j === 0 && b.delay <= 0).sort((a, b) => cellCenter(b.i, 0, b.k).z - cellCenter(a.i, 0, a.k).z);
    D.straggler = ground[0] || null;
    // top first: they peel off in a wave, each to its own place in the circling flock
    const L = sc.list.filter(b => b !== D.straggler).sort((a, b) => b.j - a.j || Math.random() - 0.5);
    D.flyers = L.length;
    L.forEach((b, n) => g.later(0.1 + (n / L.length) * 4.5 + Math.random() * 0.3, () => this._launch(b)));
    g.crew.reactSome(['duck', 'lookup', 'recoil', 'lookup'], { frac: 0.8, spread: [0.3, 2.5] });
    g.later(0.8, () => this._giggle(D.swarm, 'fit', { vol: 1.2 }));
    g.later(2.5, () => this._line(pick(this.crowd()) || g.worker, pick(['DUCK!', 'It\'s FLYING!', 'Heads up! HEADS UP!']), { dur: 1.6 }));
    D.launchedAll = 5.2;
  }

  _launch(b) {
    const g = this.g, sc = g.scaffold;
    if (sc.bays.get(b.key) !== b || b.fly) return;
    b.fly = { t: 0, vel: V(rr(-1, 1), rr(2.5, 5), rr(-1, 1)), spin: V(rr(-1.5, 1.5), rr(-2, 2), rr(-1.5, 1.5)), rx: 0, ry: 0, rz: 0,
      ang: Math.random() * Math.PI * 2, r: rr(7, 19), h: rr(-5, 7), ph: Math.random() * 6, stream: Math.floor(Math.random() * 4) };
    b.shake = 0; b.delay = 0;
    if (Math.random() < 0.08) g.audio.whoosh(cellCenter(b.i, b.j, b.k), 0.8, 0.25);
    else if (Math.random() < 0.05) g.audio.clank(cellCenter(b.i, b.j, b.k), { pitch: 1.4, vol: 0.2 });
  }

  _steerSwarm(dt, E) {
    const g = this.g, D = E.data, sc = g.scaffold, S = D.swarm;
    // the shot: from the north edge of the courtyard, the crew at the bottom of the frame, the flock above them
    if (D.shoot && !D.lastLine) {
      const L = this.crowd();
      const cx = L.length ? L.reduce((m, w) => m + w.pos.x, 0) / L.length : S.x;
      const x = Math.max(-30, Math.min(40, cx * 0.5 + S.x * 0.5));
      g.cam.fixed = { pos: V(x, 3, 32.6), look: V(x, 10, 10) };
    }
    if (E.phase === 'lift' && E.pt > D.launchedAll) { this._phase('orbit'); g.later(1, () => this._line(pick(this.crowd()) || g.worker, pick(['It\'s… migrating?', 'Is it waving at us?', 'Bye…?']), { dur: 1.8 })); }
    if (E.phase === 'orbit' && E.pt > 3.6) {
      this._phase('disperse');
      // four flocks, four directions: over the roofs, west, east, straight up
      D.dirs = [V(0.25, 0.5, -1), V(-1, 0.45, 0.25), V(1, 0.4, 0.3), V(0.1, 1, 0.15)].map(v => v.normalize());
      g.audio.whoosh(S, 2, 0.7);
      g.later(1.4, () => this._hopAndGo());
    }
    // the flock clatters softly as it circles: tubes knocking together up there
    if (!E.done && E.phase !== 'disperse' && (D.clatter = (D.clatter || 0) - dt) <= 0) { D.clatter = rr(0.35, 0.8); g.audio.rattle(S.clone().add(V(rr(-8, 8), rr(-3, 3), rr(-5, 5))), 4, 0.3); }
    const p = V(0, 0, 0), t = E.t, workers = this.crowd();
    let flying = 0;
    for (const b of [...sc.list]) {
      const f = b.fly;
      if (!f) continue;
      flying++;
      p.copy(cellCenter(b.i, b.j, b.k)).add(b.offset);
      if (E.phase !== 'disperse' && f.ang >= 0) {
        // the circling flock: everyone to its own slot on a slowly turning ring (it tightens over time)
        const tight = E.phase === 'orbit' ? Math.max(0.55, 1 - E.pt * 0.12) : 1;
        const a = f.ang + t * 0.7;
        const tgt = V(S.x + Math.cos(a) * f.r * tight, S.y + f.h * tight + Math.sin(t * 1.3 + f.ph) * 1.2, S.z + Math.sin(a) * f.r * 0.6 * tight);
        const want = tgt.sub(p).multiplyScalar(1.3);
        if (want.length() > 16) want.setLength(16);
        f.vel.lerp(want, Math.min(1, dt * 2.2));
        f.spin.multiplyScalar(Math.exp(-dt * 0.5));
      } else {
        // off they go, accelerating along their flock's direction, with a little flutter
        const d = D.dirs[f.stream];
        f.vel.addScaledVector(d, dt * 22);
        f.vel.y += Math.sin(t * 6 + f.ph) * dt * 3;
        if (f.vel.length() > 48) f.vel.setLength(48);
        if (p.distanceTo(S) > 110 || p.y > 110) { sc.remove(b, { burst: false }); continue; }
      }
      // whoever a low flyer passes over ducks
      if (p.y < 4.5 && Math.random() < dt * 4) for (const w of workers) if (!w.busy && Math.hypot(w.pos.x - p.x, w.pos.z - p.z) < 2.5 && g.time - (w._ducked || 0) > 3) { w._ducked = g.time; w.react('duck', { voice: Math.random() < 0.4 }); }
    }
    if (E.phase === 'disperse') {
      // all gone (the straggler too): a beat, a line, the end
      if (!D.lastLine && (flying === 0 && sc.count === 0 || E.pt > 9)) {
        D.lastLine = true;
        g.cam.fixed = { pos: g.cam.cam.position.clone(), look: V(S.x, 3, 4) };
        g.crew.reactSome(['shrug', 'headshake'], { frac: 0.5 });
        this._line(g.worker, pick(['…Well. Job done?', 'So… is that it?', 'I guess it\'s dismantled.']), { dur: 2.4 });
        g.later(1.6, () => { const o = pick(this.crowd().filter(w => w !== g.worker)); if (o) this._line(o, pick(['Do we still get paid?', 'I\'m not filling in the form for this.', 'Who\'s telling the office?']), { dur: 2 }); });
        this.finish(flying === 0 ? 'the swarm has flown' : 'the swarm is leaving', 3.2);
      }
    }
  }

  // the little one left behind: three hops, a giggle, and it flies after the others
  _hopAndGo() {
    const g = this.g, D = this.E.data, b = D.straggler;
    if (!b || g.scaffold.bays.get(b.key) !== b) return;
    for (let n = 0; n < 3; n++) g.later(n * 0.45, () => { b.offsetVel.y += 4.5; b.dirty = true; g.audio.clank(cellCenter(b.i, 0, b.k), { pitch: 2, vol: 0.2 }); });
    g.later(1.0, () => this._giggle(cellCenter(b.i, 1, b.k), 'titter'));
    g.later(1.6, () => { this._launch(b); if (b.fly) { b.fly.ang = -1; b.fly.stream = 3; b.fly.vel.set(0, 8, 0); } });
  }

  // ---------- rare events (main game only) ----------
  // Each event: when it could happen, how much it wants to, and when it must not.
  _rareEvents(dt) {
    const g = this.g, R = this.rare;
    R.cool -= dt;
    if (DEV.event && !R.devDone && this.t > 6) { R.devDone = true; this._rare(DEV.event); }
    if (R.cool > 0 || g.stage < 2) return;
    R.cool = rr(4, 8);
    const n = g.crew.count, integ = g.building.integrity();
    const seen = R.seen, roll = R.rolls;
    const candidates = [
      // students: when something spectacular has happened lately, a few times per session at most
      ['students', roll.students && this.t - this.lastSurprise < 8 && (seen.students || 0) < 2 ? 0.7 * (0.6 + this.tension) * (this.lean === 'students' ? 1.6 : 1) : 0],
      // the administrator: a big crowd, or real damage; once; not in a session leaning towards the ghost
      ['admin', roll.admin && !this.extras.done.admin && this.lean !== 'ghost' && (n >= 12 || integ < 0.75) ? 0.25 + n / 80 : 0],
      // a tour group: early-ish, while it still looks like a monument with some scaffolding on it
      ['tour', roll.tour && !this.extras.done.tour && g.stage <= 3 && this.tension > 0.2 ? 0.12 : 0],
      ['nothing', 3],
    ];
    const choice = pickW(candidates);
    if (choice && choice !== 'nothing') this._rare(choice);
  }

  _rare(kind) {
    const ok = kind === 'students' ? this.extras.students() : kind === 'admin' ? this.extras.admin() : kind === 'tour' ? this.extras.tour() : false;
    if (ok) {
      this.rare.seen[kind] = (this.rare.seen[kind] || 0) + 1;
      this.rare.cool = rr(20, 40);
      this._note('rare', kind);
    }
  }

  summary() {
    return { rareRolls: this.rare.rolls, seed: this.seed, lean: this.lean, past: this.past, ending: this.ending, phase: this.E?.phase, endingT: this.E ? +this.E.t.toFixed(1) : null, done: this.E?.done || false,
      allDown: this.g.building.allDown(), integrity: +this.g.building.integrity().toFixed(2), standing: this.g.building.standing().length,
      tension: +this.tension.toFixed(2), profile: Object.fromEntries(Object.entries(this.tend).map(([k, v]) => [k, +v.toFixed(2)])),
      scores: Object.fromEntries(Object.entries(this.scores).map(([k, v]) => [k, +v.toFixed(2)])), rare: this.rare.seen, counts: this.counts, history: this.history.slice(-40) };
  }
}
