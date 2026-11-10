// The university's own cast, called in by the session director (director.js) when the
// situation calls for it — never as decoration, never all at once:
//   students   lean out of the main building's windows, point, film it on their phones, call a
//              friend over, comment, then duck back inside
//   admin      a (fictional) university administrator walks into the courtyard to inspect the
//              disaster, says something dry about what actually happened, and leaves — or, in the
//              "meeting" ending, leads everybody into the building for a meeting
//   tour       a Bauhaus tour group stops at the north gap, the guide explains the scaffolding as
//              heritage, the tourists take photos
//   ghost      the ghost of Walter Gropius (a fictional, stylised apparition — not a portrait,
//              not history) rises out of the courtyard in one of the five endings; the director
//              (director.js) gives him his lines
// In the student ending ("The Dean Has Left the Building") students, a couple of professors and
// the dean fill the windows (studentsMass), watch it get worse, look at each other and duck when
// things crash; then, before their part of the building goes, they climb out, jump down and run
// for the exits, complaining all the way (studentsEscape).
import * as THREE from 'three';
import { Worker } from './worker.js';
import { outsideCourt } from './config.js';

const rr = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const V = (x, y, z) => new THREE.Vector3(x, y, z);

const STUDENT_NAMES = ['Lena', 'Jonas', 'Mia', 'Paul', 'Emma', 'Finn', 'Sofia', 'Ben', 'Clara', 'Noah', 'Ida', 'Leon'];
const STUDENT_LINES = {
  lean: ['Is that… our scaffolding?', 'What is it DOING?', 'Is this an art project?', 'Is this the new Bauhaus?', 'Prof says it\'s a performance.',
    'Form follows… what?', 'Cancel my two o\'clock.', 'Do they know it\'s moving?', 'This is going in my portfolio.'],
  call: ['GUYS. Come look at this.', 'Get over here, quick!', 'You have to see this.'],
  record: ['I\'m filming this.', 'This is going online.', 'Hold on, I\'m live.', 'Say hi, scaffolding.'],
  react: ['It moved!', 'Did it just—', 'No way.', 'OKAY that\'s not normal.', 'It\'s ALIVE.'],
  leave: ['I have a crit in five minutes.', 'Okay, back to the model.', 'Nope. Studio.'],
  // to each other, across the windows
  across: ['Are you seeing this?', 'Is this for a course?', 'Should we call someone?', 'Who do we even call?', 'Is it… waving?', 'This is NOT in the brochure.'],
  outrage: ['What happened to our university?!', 'What are you DOING to this building?', 'My model was in there!', 'I paid semester fees for this!', 'That was a listed building!',
    'Who is in charge here?!', 'I am writing to the dean!', 'Is this going to be on the exam?', 'You had ONE job!', 'Hey! Come back here!'],
};
// the faculty, for the student ending
const FACULTY = [
  { name: 'Prof. Lindner', tie: '#3456a8', glasses: true, hair: '#8a8a8a', shirt: '#d8d0c8', trousers: '#4a4f5c', skin: '#e9b08a', facial: 'beard', scale: 0.98, voice: 0.8 },
  { name: 'Prof. Weber', tie: '#b8503c', glasses: true, hair: '#d8d0c8', shirt: '#5a6070', trousers: '#3b4a66', skin: '#f0b38d', facial: 'none', scale: 0.95, voice: 1.25 },
  { name: 'The Dean', bowtie: true, glasses: true, hair: '#9a9a9a', shirt: '#2f3f6e', trousers: '#2f3f6e', skin: '#e3a27e', facial: 'walrus', scale: 1.02, voice: 0.72 },
];
const FACULTY_LINES = {
  'Prof. Lindner': ['My lecture notes are in there!', 'Thirty years of tenure for THIS?', 'Somebody save the library!'],
  'Prof. Weber': ['I am cancelling the seminar.', 'This will NOT be on the exam!', 'Office hours are over!'],
  'The Dean': ["I'm the dean! Let me through!", 'Somebody tell the ministry.', 'Budget meeting is cancelled!'],
};
const EXITS = [V(-6, 0, 41), V(66, 0, 4.6), V(25.9, 0, 40)];
const STUDENT_COLS = { shirt: ['#c45a6a', '#5b8a62', '#3456a8', '#e8b23a', '#7d6fb0', '#2f7f7a', '#d98f6a', '#2a2a30'], hair: ['#2e1d1a', '#6e4a2e', '#c9894a', '#1e1a1a', '#b8772e', '#c45a2a', '#8a5a9a'], skin: ['#f3c4a0', '#e3a27e', '#c98a68', '#a8714f', '#f0b38d'] };

// windows that face the courtyard and are not where the scaffold usually is: the north-east
// section's big windows and the studio section (first floor), [x, sill y]
const WINDOW_SLOTS = [];
for (let c = 0; c < 5; c++) WINDOW_SLOTS.push([13.6 + (36.5 - 13.6) / 5 * (c + 0.5), 5.4]);
for (const x of [-12.8, -8.0, 6.4, 11.2]) WINDOW_SLOTS.push([x, 5.2]);

export class Extras {
  constructor(game) {
    this.g = game;
    this.active = [];          // { w, kind, update(dt) }
    this.studentEpisodes = 0;
    this.done = { admin: false, ghost: false, tour: false };
    this.usedSlots = new Set();
    this.windowMat = new THREE.MeshBasicMaterial({ color: '#2a2430' });
  }

  get crew() { return this.g.crew; }

  _person(variant) {
    const g = this.g;
    const w = new Worker(g.scene, g.fx, g.audio, variant);
    w.onSay = (who, text, o) => this.crew.say(who, text, o);
    w.collide = (x, z, y, b) => g.collide(x, z, y, b, true);
    w.free = true;
    w.ai = { stuck: 0, dodge: 0 };
    return w;
  }
  _say(w, text, dur = 2.0, priority = true) { if (w.root.visible) this.crew.speak(w, text, { dur, priority }); }
  _steer(w, input, target, speed, dt) { return this.crew._steer(w, input, target, speed, dt); }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i];
      a.t = (a.t || 0) + dt;
      if (a.update(dt, a) === false) { a.cleanup?.(); this.active.splice(i, 1); }
    }
  }

  // ---------- students at the windows ----------
  students(n = 1 + Math.floor(Math.random() * 3)) {
    const free = WINDOW_SLOTS.filter((_, i) => !this.usedSlots.has(i));
    if (!free.length) return false;
    const slots = free.sort(() => Math.random() - 0.5).slice(0, n);
    this.studentEpisodes++;
    slots.forEach((slot, k) => this.g.later(k * rr(1.5, 4), () => this._student(slot, k === 0)));
    return true;
  }

  // the witnesses ending: window after window fills up, and they stay
  studentsMass(n = WINDOW_SLOTS.length, over = 8) {
    const free = WINDOW_SLOTS.filter((_, i) => !this.usedSlots.has(i)).sort(() => Math.random() - 0.5).slice(0, n);
    const faculty = [...FACULTY].sort(() => Math.random() - 0.5).slice(0, Math.min(3, Math.max(2, Math.floor(free.length / 3))));
    if (!faculty.some(f => f.name === 'The Dean')) faculty[0] = FACULTY[2];
    free.forEach((slot, k) => this.g.later(0.3 + (k / Math.max(1, free.length - 1)) * over * rr(0.8, 1.1), () => this._student(slot, k === 0, { stay: true, who: k % 3 === 1 ? faculty.pop() : null })));
    return free.length;
  }
  get freeWindows() { return WINDOW_SLOTS.length - this.usedSlots.size; }
  get studentList() { return this.active.filter(a => a.kind === 'student' && a.phase === 'up'); }

  // all at once (but not in unison): duck at a crash, come back up a moment later
  studentsDuck() { for (const a of this.active) if (a.kind === 'student' && a.phase === 'up') this.g.later(rr(0, 0.35), () => { a.ducked = rr(1.1, 2.0); if (Math.random() < 0.5) a.w.react('surprise', { fx: false, voice: false }); }); }

  // Everybody out: one after another they climb onto the sill, jump down into the courtyard and run
  // for the nearest exit, complaining as they go. Returns how many are escaping.
  studentsEscape(over = 3.5) {
    const L = this.active.filter(a => a.kind === 'student' && (a.phase === 'up' || a.phase === 'down') && !a.escaping);
    const lines = [...STUDENT_LINES.outrage].sort(() => Math.random() - 0.5);
    const first = STUDENT_LINES.outrage[0];
    lines.splice(lines.indexOf(first), 1); lines.unshift(first);
    L.sort(() => Math.random() - 0.5).forEach((a, k) => {
      a.escaping = true;
      const fl = FACULTY_LINES[a.w.name];
      a.line = fl ? pick(fl) : lines[k % lines.length];
      this.g.later(rr(0, over), () => { a.phase = 'climb'; a.ct = 0; a.ducked = 0; });
    });
    this.escapees = L.length;
    return L.length;
  }
  // how many of them are still inside the courtyard (at a window, in the air or running)
  get studentsInside() { return this.active.filter(a => a.kind === 'student' && a.escaping && !a.out).length; }
  // has everybody at a window in this x range got out of the window already?
  windowsClear(x0, x1) { return !this.active.some(a => a.kind === 'student' && (a.phase === 'up' || a.phase === 'down' || a.phase === 'climb') && a.x >= x0 - 0.5 && a.x <= x1 + 0.5); }

  _escapeStep(s, dt) {
    const w = s.w, g = this.g;
    s.ct = (s.ct || 0) + dt;
    if (s.phase === 'climb') {
      // up onto the sill, legs and all, then off
      if (s.ct < dt * 1.5) { for (const o of s.hidden) o.visible = true; g.scene.remove(s.hole); w.react('surprise', { fx: false, voice: false }); }
      w.pos.y += (s.sill + 0.05 - w.pos.y) * Math.min(1, dt * 6);
      w.pos.z += (0.35 - w.pos.z) * Math.min(1, dt * 6);
      w.heading = 0;
      w.updateStatic(dt, {});
      if (s.ct > 0.5) { s.phase = 'jump'; s.vy = 3.2; s.vz = rr(2.2, 3.2); s.vx = rr(-0.6, 0.6); w.react('dodge', { fx: false, voice: true }); }
      return;
    }
    if (s.phase === 'jump') {
      s.vy -= 18 * dt;
      w.pos.x += s.vx * dt; w.pos.y += s.vy * dt; w.pos.z += s.vz * dt;
      w.updateStatic(dt, {});
      if (w.pos.y <= 0) {
        w.pos.y = 0; s.phase = 'run'; s.rt = 0;
        w.react('stumble', { voice: true });
        g.fx.dust(w.pos.clone().setY(0.2), 4, 1.2);
        s.exit = EXITS.slice().sort((a, b) => a.distanceTo(w.pos) - b.distanceTo(w.pos))[Math.random() < 0.75 ? 0 : 1];
        s.lineAt = rr(0.9, 2.2);
        s.speed = s.faculty ? rr(0.75, 0.9) : rr(0.95, 1.15);
      }
      return;
    }
    // run, and say it on the way
    s.rt += dt;
    const input = { move: new THREE.Vector3(), run: true, camPos: g.cam.cam.position, noFidget: true };
    if (!w.busy) this._steer(w, input, s.exit, s.speed, dt);
    if (s.line && s.rt > s.lineAt) {
      this.crew.speak(w, s.line, { dur: 1.9, priority: s.line === STUDENT_LINES.outrage[0] || s.faculty });
      s.line = null;
      this.outraged = (this.outraged || 0) + 1;
    }
    if (s.rt > 1.2 && s.rt < 1.9 && Math.random() < dt * 2) input.lookBack = 1;
    w.update(dt, input);
    if (!s.out && outsideCourt(w.pos, 0.6)) { s.out = true; s.outT = s.rt; }
    // gone a few metres past the boundary (or after a moment); never running on for ever
    if (s.out && (outsideCourt(w.pos, 4) || s.rt - s.outT > 3)) return false;
    if (s.rt > 14) { s.out = true; return false; }
  }

  // the end: they lean out and let the crew have it
  outrage() {
    const L = this.studentList.sort(() => Math.random() - 0.5);
    const lines = [...STUDENT_LINES.outrage.slice(1)].sort(() => Math.random() - 0.5);
    lines.unshift(STUDENT_LINES.outrage[0]);
    const n = Math.min(4, L.length);
    L.forEach((a, k) => {
      a.angry = true;
      this.g.later(rr(0, 0.6) + k * 0.15, () => a.w.react(pick(['angry', 'argue', 'point']), { fx: k < 4, voice: false }));
      if (k < n) this.g.later(0.4 + k * rr(1.5, 1.9), () => { this.crew.speak(a.w, lines[k], { dur: 2.1, priority: true }); this.outraged = (this.outraged || 0) + 1; });
    });
    return n;
  }

  _student([x, sill], first, { stay = false, who = null } = {}) {
    const idx = WINDOW_SLOTS.findIndex(s => s[0] === x);
    this.usedSlots.add(idx);
    const w = this._person(who ? { civilian: true, ...who } : { name: pick(STUDENT_NAMES), civilian: true, shirt: pick(STUDENT_COLS.shirt), trousers: '#3b4a66', skin: pick(STUDENT_COLS.skin), hair: pick(STUDENT_COLS.hair),
      facial: 'none', glasses: Math.random() < 0.35, backpack: Math.random() < 0.3 ? pick(['#c45a2a', '#2f7f7a', '#e8b23a']) : null, scale: 0.86, voice: rr(1.2, 1.7) });
    const hidden = [];
    // the open window behind them: a dark gap in the glass
    // at a window only the upper body shows: no legs (the sill would not hide the clown boots)
    for (const nd of w.J.noodles) if (nd.chain[0].startsWith('leg')) for (const o of w.root.children) if (o.geometry === nd.n.geo) { o.visible = false; hidden.push(o); }
    for (const f of ['footL', 'footR']) { w.J[f].visible = false; hidden.push(w.J[f]); }
    // the open window behind them: a dark gap in the glass (just in front of it, inside the recess)
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.2), this.windowMat);
    hole.position.set(x, sill + 1.15, -0.27); hole.layers.set(1);
    this.g.scene.add(hole);
    // they stand inside, behind the sill, and lean out: the wall hides everything below it
    const low = sill - 1.9, high = sill - 0.62;
    w.pos.set(x, low, -0.14); w.heading = 0;
    const st = { w, kind: 'student', phase: 'up', life: stay ? 1e9 : rr(14, 26), next: rr(1.5, 3), stay, x, sill, hidden, hole, faculty: !!who };
    st.update = (dt, s) => {
      if (s.phase === 'climb' || s.phase === 'jump' || s.phase === 'run') return this._escapeStep(s, dt);
      if (s.ducked > 0) s.ducked -= dt;
      const tgtY = s.phase === 'down' || s.ducked > 0 ? low : high + (s.angry ? 0.12 : 0);
      w.pos.y += (tgtY - w.pos.y) * Math.min(1, dt * (s.ducked > 0 ? 6 : 3));
      const look = s.across && s.acrossT > 0 ? s.across.w.pos : (this.g.focusPos || this.g.worker.pos);
      if (s.acrossT > 0) s.acrossT -= dt;
      w.heading = Math.atan2(look.x - w.pos.x, Math.max(0.5, look.z - w.pos.z)) * (s.acrossT > 0 ? 0.9 : 0.6);
      w.updateStatic(dt, { lookAt: look });
      if (s.angry) return;
      if (s.phase === 'up' && s.t > 0.7 && !s.leant) { s.leant = true; w.react('lean', { fx: false, voice: false }); if (first || Math.random() < 0.5) this._say(w, pick(STUDENT_LINES.lean), 2.2, false); }
      s.next -= dt;
      if (s.phase === 'up' && s.next <= 0) {
        s.next = rr(3, 6);
        const r = Math.random();
        if (r < 0.35) { w.react('record', { fx: false, voice: false }); if (Math.random() < 0.6) this._say(w, pick(STUDENT_LINES.record), 1.8, false); }
        else if (r < 0.55) { w.react('point', { fx: false, voice: false }); }
        else if (r < 0.7 && this.usedSlots.size < WINDOW_SLOTS.length && !s.called) { s.called = true; this._say(w, pick(STUDENT_LINES.call), 1.8, false); this.g.later(rr(2, 3.5), () => { const f = WINDOW_SLOTS.findIndex((_, i) => !this.usedSlots.has(i)); if (f >= 0) this._student(WINDOW_SLOTS[f], false); }); }
        else if (r < 0.85) { w.react(pick(['surprise', 'confused', 'disbelief']), { fx: false, voice: false }); if (Math.random() < 0.5) this._say(w, pick(STUDENT_LINES.react), 1.5, false); }
        else if (s.stay) {
          // a look across at the next window: are you seeing this?
          const o = this.studentList.filter(o => o !== s).sort((a, b) => Math.abs(a.x - s.x) - Math.abs(b.x - s.x))[0];
          if (o) { s.across = o; s.acrossT = rr(1.2, 2); w.react('confused', { fx: false, voice: false }); if (Math.random() < 0.5) this._say(w, pick(STUDENT_LINES.across), 1.6, false); }
        }
      }
      if (s.phase === 'up' && s.t > s.life) { s.phase = 'down'; if (Math.random() < 0.4) this._say(w, pick(STUDENT_LINES.leave), 1.6, false); s.downAt = s.t; }
      if (s.phase === 'down' && s.t - s.downAt > 1.6) return false;
    };
    st.cleanup = () => { this.g.scene.remove(w.root, hole); this.usedSlots.delete(idx); w.root.visible = false; st.out = true; };
    st.react = () => { if (st.phase === 'up' && !w.reaction) { w.react(pick(['surprise', 'disbelief', 'point']), { fx: false, voice: false }); if (Math.random() < 0.35) this._say(w, pick(STUDENT_LINES.react), 1.4, false); } };
    this.active.push(st);
  }

  // something big happened: whoever is at a window reacts
  onSpectacle() { for (const a of this.active) a.react?.(); }

  // ---------- the administrator ----------
  admin({ meeting = false, line = null } = {}) {
    if (this.done.admin) return false;
    this.done.admin = true;
    const g = this.g;
    const w = this._person({ name: 'Dr. Brandt, Administration', civilian: true, tie: '#b8503c', clipboard: true, glasses: true, shirt: '#5a6070', trousers: '#4a4f5c', skin: '#e9b08a', hair: '#9a9a9a', facial: 'none', scale: 1.0, voice: 0.85 });
    w.pos.set(-5, 0, 50); w.heading = Math.PI;
    w.role = 'admin';
    this.adminW = w;
    const crowd = () => this.crew.list.filter(o => o.root.visible && !o.left && o !== w);
    const centre = () => { const c = V(0, 0, 0); const L = crowd(); for (const o of L) c.add(o.pos); return L.length ? c.divideScalar(L.length) : V(-5, 0, 14); };
    const st = { w, kind: 'admin', phase: 'walk', said: 0 };
    st.update = (dt, s) => {
      const input = { move: new THREE.Vector3(), camPos: g.cam.cam.position, noFidget: true };
      if (s.phase === 'walk') {
        const c = centre(); const spot = V(Math.max(-30, Math.min(30, c.x)), 0, Math.min(26, c.z + 6));
        if (this._steer(w, input, spot, 0.8, dt) || w.pos.distanceTo(spot) < 2.5) { s.phase = 'talk'; s.tt = 0; }
      } else if (s.phase === 'talk') {
        s.tt += dt; input.faceTo = centre();
        const lines = this.adminLines(meeting, line);
        if (s.said < lines.length && s.tt > 1 + s.said * 3.2) {
          if (s.said === 0) w.react('point', { fx: false, voice: false });
          this._say(w, lines[s.said], 2.6);
          if (s.said === 0) g.later(1.6, () => { const o = pick(crowd()); if (o) { this.crew.speak(o, pick(['He did it.', 'It was like this when we got here.', 'Define "happened".', 'The scaffolding started it.', 'Not it.']), { dur: 1.8, priority: true }); o.react(pick(['point', 'shrug'])); } });
          s.said++;
        }
        if (s.said >= lines.length && s.tt > 1 + lines.length * 3.2 + 1.5) {
          s.phase = meeting ? 'meeting' : 'leave';
          if (meeting) g.director?.onAdminDone?.();
        }
      } else if (s.phase === 'leave') {
        if (this._steer(w, input, V(-5, 0, 58), 0.85, dt)) { w.root.visible = false; return false; }
      } else if (s.phase === 'meeting') {
        // leads the way to the entrance; the crew's escape logic brings everybody after
        if (this._steer(w, input, V(-0.8, 0, -0.8), 0.7, dt) || w.pos.z < 0.2) { w.root.visible = false; return false; }
      }
      w.update(dt, input);
    };
    this.active.push(st);
    return true;
  }

  adminLines(meeting, line) {
    const g = this.g, integ = g.building.integrity(), n = this.crew.count, d = g.director;
    const out = [];
    if (line) out.push(line);
    if (integ < 0.6) out.push('Can someone explain what happened to the university?');
    else if (n >= 15) out.push(`Why are there ${n} of you?`);
    else out.push('This was supposed to be a maintenance job.');
    if (d && d.counts.dodge > 10) out.push('And why is the scaffolding… looking at me?');
    else if (g.scaffold.count > 400) out.push(`Who ordered ${g.scaffold.count} bays of scaffolding?`);
    else out.push('I leave you alone for five minutes.');
    out.push(meeting ? 'Everyone. My office. Now. Bring a pen.' : 'I\'m going to need a report. In triplicate.');
    return out;
  }

  // ---------- a Bauhaus tour group ----------
  tour() {
    if (this.done.tour) return false;
    this.done.tour = true;
    const g = this.g;
    const guide = this._person({ name: 'Tour guide', civilian: true, shirt: '#d9573b', trousers: '#3b4a66', skin: '#f0b38d', hair: '#c45a2a', facial: 'none', glasses: true, voice: 1.3 });
    const group = [guide];
    for (let i = 0; i < 4 + Math.floor(Math.random() * 4); i++) group.push(this._person({ name: 'Tourist', civilian: true, shirt: pick(STUDENT_COLS.shirt), trousers: '#55613a', skin: pick(STUDENT_COLS.skin), hair: pick(STUDENT_COLS.hair), facial: 'none', backpack: Math.random() < 0.5 ? '#2f7f7a' : null, scale: rr(0.92, 1.02), voice: rr(0.9, 1.5) }));
    group.forEach((w, i) => { w.pos.set(-5 + rr(-1.5, 1.5), 0, 52 + i * 1.3); w.heading = Math.PI; });
    const st = { w: guide, kind: 'tour', phase: 'walk' };
    const lines = ['And here, the original Bauhaus scaffolding. 1919, I believe.', 'Notice the honesty of the materials.', 'Please don\'t feed it.'];
    st.update = (dt, s) => {
      group.forEach((w, i) => {
        if (!w.root.visible) return;
        const input = { move: new THREE.Vector3(), camPos: g.cam.cam.position, noFidget: true };
        const spot = V(-8 + i * 1.4 + (i % 2) * 0.5, 0, 29.5 + (i % 3) * 1.1);
        if (s.phase === 'walk') this._steer(w, input, spot, 0.7, dt);
        else if (s.phase === 'look') { input.faceTo = g.focusPos || V(0, 0, 0); }
        else if (this._steer(w, input, V(-5, 0, 60), 0.75, dt)) w.root.visible = false;
        w.update(dt, input);
      });
      if (s.phase === 'walk' && s.t > 9) { s.phase = 'look'; s.lt = 0; s.said = 0; }
      if (s.phase === 'look') {
        s.lt += dt;
        if (s.said < lines.length && s.lt > 0.5 + s.said * 3.4) { guide.react('point', { fx: false, voice: false }); this._say(guide, lines[s.said], 2.6); s.said++; }
        if (s.lt > 2 && !s.photos) { s.photos = true; group.slice(1).forEach(w => g.later(rr(0, 1.5), () => w.react('record', { fx: false, voice: false }))); }
        if (s.lt > 13) s.phase = 'leave';
      }
      if (s.phase === 'leave' && group.every(w => !w.root.visible)) return false;
    };
    st.cleanup = () => group.forEach(w => g.scene.remove(w.root));
    this.active.push(st);
    return true;
  }

  // ---------- the ghost of Walter Gropius ----------
  // He rises out of the courtyard paving inside a column of pale light, hovers, and the director
  // (director.js) gives him his lines; st.sink() sends him back down. Stylised and playful: a
  // pale, see-through figure with round glasses and a bow tie, a wisp instead of legs, a halo.
  ghost(at = V(-2, 0, 16)) {
    if (this.done.ghost) return null;
    this.done.ghost = true;
    const g = this.g;
    const w = new Worker(g.scene, g.fx, g.audio, { name: 'Walter Gropius (ghost)', civilian: true, bowtie: true, glasses: true, shirt: '#3a3a44', trousers: '#3a3a44', skin: '#e9d8c8', hair: '#4a4040', facial: 'none', scale: 1.75, voice: 0.6 });
    w.onSay = (who, text, o) => this.crew.say(who, text, o);
    // turn him into an apparition: pale, see-through, unlined, no legs, a wisp instead
    w.root.traverse(o => {
      o.userData.ink = false; o.layers.set(1);
      if (!o.isMesh) return;
      const src = o.material;
      const col = (src.color ? src.color.clone() : new THREE.Color('#ffffff')).lerp(new THREE.Color('#cfe6ff'), 0.55);
      o.material = new THREE.MeshBasicMaterial({ color: col, map: src.map || null, transparent: true, opacity: 0, depthWrite: false, alphaTest: src.map ? 0.3 : 0 });
      o.castShadow = false;
    });
    for (const nd of w.J.noodles) if (nd.chain[0].startsWith('leg')) for (const o of w.root.children) if (o.geometry === nd.n.geo) o.visible = false;
    for (const f of ['footL', 'footR']) w.J[f].visible = false;
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.46, 1.6, 16, 1, true), new THREE.MeshBasicMaterial({ color: '#cfe6ff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    tail.rotation.x = Math.PI; tail.position.y = -0.55; tail.layers.set(1);
    w.J.hips.add(tail);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.fx.dustTex, color: '#dff0ff', transparent: true, opacity: 0, depthWrite: false }));
    halo.scale.set(3.6, 4.6, 1); halo.position.y = 1.4; halo.layers.set(1);
    w.root.add(halo);
    const mats = []; w.root.traverse(o => { if (o.material) mats.push(o.material); });
    // the column of light he rises in, and a glowing ring spreading over the paving
    const add = THREE.AdditiveBlending;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.2, 14, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#bfe0ff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: add }));
    beam.position.set(at.x, 7, at.z); beam.layers.set(1);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.0, 40), new THREE.MeshBasicMaterial({ color: '#d8ecff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: add }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(at.x, 0.06 + (at.y || 0) * 0.5, at.z); ring.layers.set(1);
    g.scene.add(beam, ring);
    const lift = at.y || 0;                   // how high above the ground (the ruins) he hovers
    w.pos.set(at.x, -3.4 + lift, at.z); w.heading = Math.PI;
    w.stress = 0.8;                          // a stern, unamused face
    const st = { w, kind: 'ghost', phase: 'glow', at: at.clone(), face: null, op: 0 };
    st.update = (dt, s) => {
      const T = s.t;
      // 1. the paving glows, a ring spreads   2. he rises   3. hovers   4. sinks back
      if (s.phase === 'glow') { ring.material.opacity = Math.min(0.8, T * 0.6); ring.scale.setScalar(1 + T * 2.2); beam.material.opacity = Math.min(0.25, T * 0.12); if (T > 1.6) { s.phase = 'rise'; s.rt = 0; } }
      else if (s.phase === 'rise') { s.rt += dt; const k = Math.min(1, s.rt / 2.6); w.pos.y = -3.4 + lift + 4.6 * (1 - Math.pow(1 - k, 3)); s.op = Math.min(0.82, s.rt * 0.4); beam.material.opacity = 0.25 + Math.sin(s.rt * 3) * 0.05; if (k >= 1) s.phase = 'hover'; }
      else if (s.phase === 'hover') { w.pos.y = 1.2 + lift + Math.sin(T * 1.4) * 0.14; beam.material.opacity = Math.max(0.06, beam.material.opacity - dt * 0.08); ring.material.opacity = Math.max(0.15, ring.material.opacity - dt * 0.2); }
      else if (s.phase === 'sink') { s.st += dt; w.pos.y -= dt * 1.4; s.op = Math.max(0, 0.82 - s.st * 0.45); beam.material.opacity = Math.max(0, 0.2 - s.st * 0.1); ring.material.opacity = Math.max(0, 0.4 - s.st * 0.25); if (s.st > 2.4) return false; }
      for (const m of mats) m.opacity = m.isSpriteMaterial ? s.op * 0.35 : s.op;
      // turns slowly towards whatever he is looking at
      const f = s.face || g.cam.cam.position;
      const want = Math.atan2(f.x - w.pos.x, f.z - w.pos.z);
      let dh = want - w.heading; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
      w.heading += dh * Math.min(1, dt * 2.5);
      if (s.phase === 'rise' && Math.random() < dt * 8) g.fx.dust(V(at.x + rr(-1.2, 1.2), 0.2, at.z + rr(-1.2, 1.2)), 1, 1.2);
      w.updateStatic(dt, { lookAt: f });
    };
    st.cleanup = () => { g.scene.remove(w.root, beam, ring); };
    st.sink = () => { if (st.phase !== 'sink') { st.phase = 'sink'; st.st = 0; } };
    this.active.push(st);
    this.ghostSt = st;
    return st;
  }

  // the collapse: extras who walk get out of there, students duck back in
  onEscape(mode) {
    for (const a of this.active) {
      if (a.kind === 'student' && !a.stay) { a.phase = 'down'; a.downAt = a.t; }
      if (a.kind === 'admin' && a.phase !== 'meeting') a.phase = 'leave';
      if (a.kind === 'tour') a.phase = 'leave';
    }
  }
}
