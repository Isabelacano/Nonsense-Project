// The crew. Nobody decides how many workers there will be: the first one starts alone, and
// every failure, every section that grows back, every trick and every rattled colleague adds to a
// "pressure" that eventually makes somebody call for help (one person, or a few at once when
// things are really bad). Some colleagues give up and leave again. So a run can end with a
// handful of workers or with an absurd crowd (up to CFG.crew.max, a performance limit).
// Each colleague has a simple work loop (pick a bay, walk there, dismantle, react) plus a role
// (worker, organiser, self-declared expert, onlooker, the one who regrets coming) and moods
// that send them panicking, gawking, quitting, arguing and bumping into each other.
// Dialogue reacts to what just happened, from a large pool that avoids repeats.
// At the end (see director.js) they leave the courtyard — running, giving up, or slinking off
// sheepishly, each along their own route at their own moment — and one of them is always the
// conspicuously slow one. Leaving is measured against the courtyard boundary (CFG.court).
// Dialogue is shown in speech bubbles (nothing is spoken aloud).
import * as THREE from 'three';
import { CFG, outsideCourt } from './config.js';
import { Worker, VARIANTS } from './worker.js';
import { cellCenter } from './scaffold.js';

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rr = (a, b) => a + Math.random() * (b - a);
const pickW = (items) => { let r = Math.random() * items.reduce((s, [, w]) => s + w, 0); for (const [v, w] of items) { r -= w; if (r <= 0) return v; } return items[0][0]; };
const V = (x, z) => new THREE.Vector3(x, 0, z);

// Ways onto and off the courtyard (between the real buildings): the gap between the
// Van-de-Velde-Bau and No. 15 to the north, the passage past the main building's south-west
// end, the open east side towards Marienstraße, and the gap between No. 15 and Marienstr. 16.
const ROUTES = [
  { name: 'north', outside: V(-5, 58), gate: V(-5, 31.5) },
  { name: 'west', outside: V(-38.2, -30), gate: V(-38.2, 2.0) },
  { name: 'east', outside: V(78, 4), gate: V(60.5, 4.5) },
  { name: 'northeast', outside: V(25.9, 58), gate: V(25.9, 31) },
];

// Calling for help: who says what, and what the newcomers say when they walk in.
const CALLS = ['KURT. Get over here.', 'Call Uschi. Uschi owes me.', 'We need muscle. JENS!', 'Heike, bring the big wrench.',
  'Get Ralf. Ralf knows scaffolding.', 'Where\'s Timo? TIMO!', 'Dörte, we have a situation.', 'Everybody. EVERYBODY.',
  'Somebody call the office.', 'We need more hands. Many more.', 'Get the night shift in.', 'Call everyone. I mean everyone.',
  'Is anyone else on site?!', 'Get the guys from the canteen.', 'Phone the other crew.', 'HELP. Professionally.'];
const HELLOS = ['Alright. Who broke it?', 'Relax. I\'ve seen worse. Probably.', 'Is this a joke? Tell me this is a joke.',
  'I was promised a quiet Thursday.', 'Thirty years. Never seen it do THAT.', 'Sorry I\'m late. Did I miss anything?',
  'Who the hell approved this?', 'I brought coffee. Not enough coffee.', 'Nobody touch anything. Except me.',
  'Step aside, amateurs.', 'Okay. Where\'s the problem?', 'They said it was a small job.', 'Why are there so many of you?',
  'Is it supposed to do that?', 'Morning. Oh. Oh no.', 'I\'m only here for the overtime.'];
const REGRETS = ['Oh no.', 'I should not have answered the phone.', 'Nope. Nope nope.', 'I\'m going back to the van.', 'Is it too late to leave?'];
const NAMES = ['Gerd', 'Sabine', 'Horst', 'Anke', 'Bodo', 'Karin', 'Detlef', 'Petra', 'Uwe', 'Moni', 'Rainer', 'Gabi', 'Klaus', 'Birgit',
  'Frank', 'Silke', 'Holger', 'Ines', 'Rolf', 'Tanja', 'Lutz', 'Heidi', 'Sven', 'Elke', 'Torsten', 'Conny', 'Wolle', 'Babs', 'Ercan',
  'Ayse', 'Piotr', 'Marta', 'Jürgen', 'Ilse', 'Manni', 'Steffi'];
const COLS = {
  hat: ['#e8b23a', '#f1ece0', '#d9573b', '#f07a2a', '#3456a8', '#2f7f7a'],
  vest: ['#f07a2a', '#e8b23a'],
  shirt: ['#3456a8', '#b8503c', '#2f7f7a', '#7d6fb0', '#55613a', '#8a4a5a', '#2f3f6e', '#c98a4b'],
  trousers: ['#2f3f6e', '#4d5a3a', '#3b4a66', '#4a3b4f', '#3456a8', '#6b3552', '#55613a'],
  skin: ['#f0b38d', '#e3a27e', '#c98a68', '#e8a882', '#f3c4a0', '#d8956f', '#c08a60', '#a8714f', '#e9b08a'],
  hair: ['#5a3226', '#3a2a2a', '#2e1d1a', '#b8772e', '#c45a2a', '#8a8a8a', '#c9894a', '#6e4a2e', '#e0c070', '#1e1a1a', '#d8d0c8'],
};
// one more colleague: the first ten are the named regulars, after that it gets made up as it goes
function variantFor(n) {
  if (VARIANTS[n]) return VARIANTS[n];
  const facial = pick(['none', 'none', 'walrus', 'beard', 'stubble']);
  const HATS = ['#e8b23a', '#f07a2a', '#3456a8', '#d9573b', '#f1ece0', '#4f9a5a', '#2f7f7a', '#e8b23a'];
  return { name: NAMES[(n - 10) % NAMES.length] + (n - 10 >= NAMES.length ? ' ' + 'II III IV V'.split(' ')[Math.floor((n - 10) / NAMES.length) - 1] : ''),
    hat: HATS[n % HATS.length], vest: pick(COLS.vest), shirt: pick(COLS.shirt), trousers: pick(COLS.trousers), skin: pick(COLS.skin), hair: pick(COLS.hair),
    facial, glasses: Math.random() < 0.2, freckles: Math.random() < 0.15, bun: Math.random() < 0.12, earrings: Math.random() < 0.12,
    pencil: Math.random() < 0.15, cigarette: Math.random() < 0.08, scale: rr(0.93, 1.06), voice: rr(0.66, 1.6) };
}
const ROLES = [['worker', 50], ['organiser', 12], ['expert', 14], ['onlooker', 14], ['regretter', 10]];
const roleFor = () => { let r = Math.random() * 100; for (const [k, w] of ROLES) { r -= w; if (r <= 0) return k; } return 'worker'; };

// Dry, tired, workplace lines, keyed by what just happened. Short, so the bubbles stay small.
const LINES = {
  fail: ['Yeah, no.', 'You seeing this shit?', 'Yeah, that\'s not in my contract.', 'I\'m too old for this.', 'Nope. Absolutely not.', 'Oh, come ON.',
    'Great. The scaffolding has a union now.', 'I need a cigarette.', 'Cool. Cool cool cool.', 'Classic Monday.', 'This is fine.',
    'I\'m not paid enough to understand this.', 'Fantastic.', 'Every. Single. Time.', 'I hate this job.', 'Who designed this?'],
  grow: ['It grew BACK.', 'Did it just…', 'Was that there before?', 'I didn\'t see that. I didn\'t see that.', 'Don\'t look at it.',
    'We JUST took that off.', 'That\'s the one I did!', 'It\'s… regenerating?', 'Undo. It did an undo.'],
  gawk: ['Huh.', 'Mm-hm.', 'Yep.', 'Well, that\'s new.', 'Not my problem. Yet.', 'Interesting.', 'I\'m just gonna watch.', 'It\'s breathing. Is it breathing?'],
  argue: [['Hold it STILL!', 'YOU hold it!'], ["That's my bay.", 'It was mine first.'], ['Stop helping.', "I'm not helping."],
    ['Left! LEFT!', 'Your left or mine?'], ["It's laughing at us.", "Scaffolding doesn't laugh."], ['Who ordered this?', 'Management.'],
    ['Do you have a plan?', 'I have a sandwich.'], ['You\'re standing on my foot.', 'You\'re standing on MY foot.'], ['Pass the wrench.', 'What wrench?'],
    ['This is your fault.', 'I just GOT here.'], ['Lift with your knees!', 'I AM lifting with my knees!']],
  bump: ['Watch it!', 'OI!', 'My hat!', 'Personal space!', 'Sorry. No. Not sorry.', 'Eyes on the job!'],
  panic: ['This is a management problem.', 'I\'m billing someone for this.', 'Who the hell approved this?', 'I\'m not paid to understand this.',
    'We need a bigger wrench.', 'Somebody call someone.', 'Is it covered by insurance?'],
  dodged: ['It MOVED.', 'Did you see that?', 'Hold STILL.', 'Oh, it wants to play.', 'Cute. Real cute.', 'Get back here.', 'It ducked. It DUCKED.',
    'I had it. I HAD it.', 'It knew. How did it know?', 'Same one again. It\'s doing it on purpose.'],
  anticipated: ['It knew I was coming.', 'It\'s learning.', 'Okay, it remembers me.', 'Not that one again…'],
  still: ['…Why\'d it stop?', 'I don\'t like this.', 'Nobody move.', 'Is it… sleeping?', 'Shh.', 'Too quiet.', 'Is it over?'],
  release: ['Called it.', 'NOPE.', 'Yep. There it is.', 'Of course.', 'And there it goes.', 'I KNEW it.'],
  bow: ['Did it just BOW at me?', 'Oh, it\'s mocking us now.', 'Don\'t. Don\'t you dare.', 'Was that sarcasm? From scaffolding?'],
  bowSeen: ['It\'s mocking him.', 'Ha. It got you.', 'It likes you.'],
  moved: ['That one moved.', 'Was that over there before?', 'I saw that.', 'Mm-hm. Sure.', 'Did anyone else see that?'],
  subtle: ['…Did that move?', 'Huh.', 'Must be the wind.', 'Probably nothing.'],
  elsewhere: ['Uh, guys? Over there.', 'There\'s more of it over there now.', 'Where did THAT come from?'],
  laugh: ['Did it just… laugh?', 'Was that you?', 'It\'s LAUGHING.', 'I\'m not crazy. It laughed.', 'Tell me you heard that.'],
  obstacle: ['Where\'d this come from?', 'That wasn\'t here.', 'Oh, a WALL now.', 'Excuse me?!'],
  obstacleGone: ['…and it\'s gone.', 'Now it\'s gone again.', 'I hate this place.'],
  coordinated: ['They\'re ALL moving!', 'It\'s organised. It\'s ORGANISED.', 'Okay, that was coordinated.'],
  propose: ['Simple. We pull it all at once.', 'Trust me, I\'ve seen this on TV.', 'Leave it to me.', 'You just need the right angle.',
    'Watch. Technique.', 'Hit it at the joints. Always the joints.', 'You\'re all holding it wrong.'],
  proposeFail: ['Great plan, genius.', 'Technique, huh?', 'Ten out of ten. Very TV.', 'Leave it to you, he said.', 'Wonderful. Any more ideas?'],
  organise: ['Everybody, LEFT side!', 'Okay, people, listen up!', 'Two on each column!', 'On my count!', 'Form a line!', 'Nobody move till I say!'],
  organiseFail: ['Nobody\'s listening.', 'Who put you in charge?', 'Yeah, no.', 'Your count or mine?'],
  quit: ['I\'m going back to the van.', 'Nope. I\'m out.', 'I\'m taking my break. Forever.', 'Call me when it\'s dead.', 'Not my scaffolding.'],
  watch: ['I\'m supervising.', 'Keep going, you\'re doing great.', 'Yeah, I\'d help, but…', 'Fascinating.', 'Popcorn, anyone?'],
};
const GIBBERISH = ['@#%&!!', '$%#*!!', '?!?!!', 'GAAAH—%$#!!', '#@*%!'];
const RESIGNED_LINES = ["It wins.", "I'm going home.", "Tell my wife I tried.", "Same time tomorrow? No.", "Not my scaffolding anymore.", "I need a holiday.", "Somebody else's problem now."];
const MEETING_LINES = ["Is there coffee at this meeting?", "Do we need to bring anything?", "I'm not signing anything.", "Will there be minutes?", "Who's taking notes?", "This could have been an email."];
const RESIGNED_SARCASM = ["Great teamwork, everyone.", "Best shift ever.", "Put it in the report.", "Tell them it was like that.", "I'm done.", "Right. I'm leaving.", "Nope. Not my problem.", "Somebody else's scaffolding now."];
const SHEEPISH_LINES = ['Sorry.', 'Sorry, Herr Gropius.', "We'll fix it. Probably.", 'It was like this when we got here.', 'Yes, sir.', 'Not it.'];
const SLOW_LINES = ['…Wait up.', "I'm coming. I'm coming.", 'My knees.', 'Thirty-one years.', "Don't wait for me.", '…Every single time.'];
const ESCAPE_LINES = ['NOPE! NOT TODAY!', "Yeah, I'm not paid enough for this!", "That's a management problem!",
  'EVERY MAN FOR HIMSELF!', "I'm billing someone for this!", 'GAAAH—%$#!!', "I'm too old for this!"];

export class Crew {
  constructor(game) {
    this.g = game;
    this.list = [game.worker];
    game.worker.ai = null;                 // the player's worker
    game.worker.onSay = (who, text, o) => this.say(who, text, o);
    this.calls = 0;
    this.sinceLast = 0;
    this.pendingCall = null;
    // reinforcements: pressure builds up from events; each crew has its own patience
    this.pressure = 0;
    this.patience = rr(0.45, 1.7);
    this.pressureLog = [];
    this.recentLines = [];
    this.arguingUntil = 0;
    this.quits = 0;
    this.frame = 0;
    this.props = [];                       // dropped tools and hats tumbling to the ground
    this.escape = null;
    this.ambientPeek = 6;
    this.focus = new THREE.Vector3().copy(game.worker.pos);
    this.lastLine = -10;                   // speech scheduler: one voice at a time, mostly
    this.routeTurn = 0;
    this.nextVariant = 1;
    this.max = CFG.crew?.max ?? 60;
  }

  get count() { return this.list.filter(w => !w.left).length; }
  get total() { return this.list.length; }
  get ending() { return this.escape; }

  // ---------- speech ----------

  // Every line goes through here: keeps the courtyard from turning into a wall of bubbles.
  say(w, text, { dur = 2.2, priority = false } = {}) {
    const g = this.g, now = g.time;
    if (!priority && (now - this.lastLine < 1.3 || g.hud.bubbles.length >= 2)) return false;
    this.lastLine = now;
    g.hud.bubble(w, text, { dur });
    return true;
  }

  // a line for this kind of moment that hasn't been heard for a while
  line(kind) {
    const pool = LINES[kind] || LINES.fail;
    const fresh = pool.filter(l => !this.recentLines.includes(l));
    const l = pick(fresh.length ? fresh : pool);
    this.recentLines.push(l);
    if (this.recentLines.length > 30) this.recentLines.shift();
    return l;
  }

  speak(w, text, opts = {}) {
    if (!w.root.visible) return;
    w.talkT = Math.min(opts.dur || 2, 0.35 + text.length * 0.045);
    this.say(w, text, opts);                // a bubble only; no talking sound with it
  }

  // ---------- arrivals ----------

  // Something went wrong (or weird) in view of the crew: it adds to the pressure to call for help.
  addPressure(v, why = '') {
    if (this.escape || this.g.stage >= 5) return;
    this.pressure += v;
    if (this.pressureLog.length < 400) this.pressureLog.push(`${this.g.time.toFixed(0)}s +${v.toFixed(1)} ${why}`);
  }

  _checkArrivals(dt) {
    const g = this.g;
    this.sinceLast += dt;
    if (g.stage === 0 || g.ended || g.director?.ending) return;
    // slow background pressure: the longer it goes on, and the more rattled they are, the worse
    const present = this.list.filter(w => w.root.visible && !w.left);
    const fr = present.reduce((s, w) => s + w.stress, 0) / Math.max(1, present.length);
    this.pressure += dt * (0.02 + fr * 0.06 + (g.stage >= 3 ? 0.03 : 0));
    // calm moments let it drain a little
    if (fr < 0.25) this.pressure = Math.max(0, this.pressure - dt * 0.03);
    if (this.pendingCall || this.total >= this.max) return;
    const n = present.length;
    const need = (3.5 + Math.pow(n, 0.7) * 1.4) * this.patience * (g.director ? g.director.patience() : 1);
    if (this.pressure < need || this.sinceLast < 4) return;
    const callers = present.filter(w => !w.busy);
    if (!callers.length) return;
    const caller = this.calls === 0 ? g.worker : pick(callers);
    // how many come: usually one; when it is really bad, a few at once
    const ratio = this.pressure / need;
    const many = Math.min(this.max - this.total, ratio > 2.2 ? Math.floor(rr(3, 6)) : ratio > 1.5 ? Math.floor(rr(2, 4)) : 1);
    this.pressure -= need * 0.8;
    this.pendingCall = { t: 0, many, caller };
    caller.react('call');
    this.speak(caller, this.calls < CALLS.length && Math.random() < 0.7 ? CALLS[this.calls] : pick(CALLS), { dur: 2.0, priority: true });
    this.calls++;
  }

  _spawn({ hello, hurry = false } = {}) {
    const g = this.g;
    const variant = variantFor(this.nextVariant++);
    const w = new Worker(g.scene, g.fx, g.audio, variant);
    const route = ROUTES[Math.floor(Math.random() * ROUTES.length)];
    w.pos.copy(route.outside).lerp(route.gate, rr(0.45, 0.75)).add(V(rr(-1.5, 1.5), rr(-1.5, 1.5)));
    w.heading = Math.atan2(route.gate.x - w.pos.x, route.gate.z - w.pos.z);
    w.collide = (x, z, y, b) => g.collide(x, z, y, b, w.free);
    w.onBump = (hit) => this._bump(w, hit);
    w.onSay = (who, text, o) => this.say(who, text, o);
    w.free = true;
    const role = roleFor();
    w.role = role;
    // how they come in: hurrying, cautiously, pushing past people, or taking their time
    const style = hurry ? pick(['hurry', 'hurry', 'pushy']) : pick(['hurry', 'hurry', 'cautious', 'pushy', 'stroll']);
    g.director?.note('arrival');
    w.ai = { style, pushy: style === 'pushy', state: 'arrive', path: [route.gate.clone(), this._workSpot()], t: 0, hello: hello || (role === 'regretter' ? pick(REGRETS) : pick(HELLOS)), cool: 0, fails: 0, stuck: 0, plan: null, route };
    if (role === 'regretter') w.ai.quitAt = rr(8, 25);
    w.stress = role === 'regretter' ? 0.35 : 0;
    this.list.push(w);
    g.demon.crew = this.list;
    this.sinceLast = 0;
    return w;
  }

  _workSpot() {
    const bays = this.g.scaffold.list.filter(b => b.j === 0 && b.delay <= 0);
    if (!bays.length) return V(rr(-20, 20), rr(5, 12));
    const b = pick(bays);
    const c = cellCenter(b.i, b.j, b.k);
    return V(c.x + rr(-3, 3), Math.min(30, c.z + rr(2.5, 6)));
  }

  // ---------- per-frame ----------

  update(dt, camera) {
    const g = this.g;
    this.frame++;
    if (!this.escape) this._checkArrivals(dt);
    if (this.pendingCall && !this.escape) {
      const pc = this.pendingCall;
      pc.t += dt;
      // they trickle in one after another rather than appearing together
      const gap = pc.gap || [0.5, 1.4];
      while (pc.many > 0 && pc.t > (pc.delay ?? 2.2) + (pc.spawned || 0) * rr(gap[0], gap[1])) { this._spawn({ hurry: pc.hurry }); pc.many--; pc.spawned = (pc.spawned || 0) + 1; }
      if (pc.many <= 0) this.pendingCall = null;
    }
    for (const w of this.list) {
      if (w === g.worker && !this.escape && this.mode !== 'stare') continue;   // the player drives this one
      if (!w.root.visible) continue;
      // level of detail: far-away workers redraw their faces and limbs less often
      const d = w.pos.distanceTo(camera.position);
      w.lod = w === g.worker ? 0 : d > 32 ? 2 : d > 18 ? 1 : 0;
      // far away: no shadow casting either (only re-flagged when the level changes)
      if (w.lod !== w.shadowLod) { w.shadowLod = w.lod; const cast = w.lod < 2; w.root.traverse(o => { if (o.isMesh) o.castShadow = cast; }); }
      w.lodFrame = this.frame;
      const input = this.escape ? this._fleeInput(w, dt, camera) : this.mode === 'stare' ? this._stareInput(w, dt, camera) : (w.ai.leaving ? this._leaveInput(w, dt, camera) : this._think(w, dt, camera));
      w.update(dt, input);
    }
    this._separate();
    this._updateProps(dt);
    if (this.escape) this._updateEscape(dt);
    else this._ambient(dt);
    g.scaffold.watchers = this.list.filter(w => w.root.visible).map(w => w.head.getWorldPosition(w._eyeTarget || (w._eyeTarget = new THREE.Vector3())));
  }

  // A rare unprompted peek somewhere near a worker.
  _ambient(dt) {
    const g = this.g;
    if (g.stage < 2) return;
    this.ambientPeek -= dt;
    if (this.ambientPeek > 0) return;
    this.ambientPeek = 9 + Math.random() * 16 - g.stage * 1.5;
    const w = pick(this.list);
    g.scaffold.peek(w.pos, { chance: 0.7, near: 9, mood: pick(['watch', 'watch', 'glare', 'wink']) });
  }

  // steer: head for a target, sidestep when blocked, keep a little distance from colleagues
  _steer(w, input, target, speed, dt) {
    const ai = w.ai;
    const d = V(target.x - w.pos.x, target.z - w.pos.z);
    const dist = d.length();
    if (dist < 0.45) return true;
    d.normalize();
    for (const o of this.list) {
      if (o === w || !o.root.visible) continue;
      const ox = w.pos.x - o.pos.x, oz = w.pos.z - o.pos.z, od = Math.hypot(ox, oz);
      const k = ai.pushy ? 0.15 : 0.9;   // the pushy ones barge through
      if (od < 1.7 && od > 0.01) { d.x += (ox / od) * (1.7 - od) * k; d.z += (oz / od) * (1.7 - od) * k; }
    }
    if (ai.dodge > 0) { ai.dodge -= dt; d.set(-d.z * ai.dodgeSide, 0, d.x * ai.dodgeSide).addScaledVector(d, 0.35); }
    input.move.copy(d.normalize());
    input.speed = speed;
    if (w.lastHit) {
      ai.stuck += dt;
      if (ai.stuck > 0.45 && !(ai.dodge > 0)) { ai.dodge = rr(0.5, 0.9); ai.dodgeSide = Math.random() < 0.5 ? -1 : 1; }
    } else ai.stuck = Math.max(0, ai.stuck - dt * 0.5);
    return false;
  }

  // a colleague who has had enough walks off the job, unhurried, back the way they came
  _quit(w) {
    if (w.ai.leaving) return;
    w.ai.leaving = true;
    w.free = true;
    w.reaction = null; w.action = null;
    this.quits++;
    this.g.director?.note('quit');
    this.speak(w, this.line('quit'), { dur: 2.2, priority: true });
    this.g.later(rr(0.8, 1.6), () => { const o = this.list.find(o => o !== w && o.root.visible && !o.left && o.pos.distanceTo(w.pos) < 10); if (o && Math.random() < 0.5) this.speak(o, pick(['Coward.', 'Can I come?', 'Wait for me.', 'Typical.', 'Lucky.']), { dur: 1.6 }); });
  }

  _leaveInput(w, dt, camera) {
    const input = { move: new THREE.Vector3(), run: false, sneak: false, jump: false, camPos: camera.position, stroll: true, noFidget: true };
    const r = w.ai.route || ROUTES[0];
    const t = w.ai.out ? r.outside : r.gate;
    if (this._steer(w, input, t, 0.7, dt) || w.pos.distanceTo(t) < 2) { if (w.ai.out) { w.root.visible = false; w.left = true; } else w.ai.out = true; }
    return input;
  }

  // Each colleague's loop. Early on they mostly work; later they panic, gawk and give up more.
  _think(w, dt, camera) {
    const g = this.g, ai = w.ai;
    const input = { move: new THREE.Vector3(), run: false, sneak: false, jump: false, camPos: camera.position };
    ai.t += dt;
    ai.cool = Math.max(0, ai.cool - dt);
    if (w.busy || (w.reaction && w.reaction.t < 0.5)) return input;

    if (ai.state === 'arrive') {
      const sp = { hurry: 1.15, cautious: 0.75, pushy: 1.1, stroll: 0.7 }[ai.style] || 1;
      input.run = ai.style === 'hurry' || ai.style === 'pushy';
      input.stroll = ai.style === 'stroll';
      if (ai.style === 'cautious' && ai.path.length === 1 && w.pos.distanceTo(ai.path[0]) < 7) { input.sneak = true; input.lookAt = this._nearestBayPos(w); }
      if (this._steer(w, input, ai.path[0], sp, dt)) {
        ai.path.shift();
        if (!ai.path.length) {
          ai.state = 'work';
          w.react(Math.random() < 0.5 ? 'point' : 'confident');
          this.speak(w, ai.hello, { dur: 2.6, priority: true });
          ai.cool = rr(1.5, 2.5);
        }
      }
      if (w.free && w.pos.x > -39 && w.pos.x < 61 && w.pos.z < 32.8 && w.pos.z > 0.8) w.free = false;
      return input;
    }
    if (ai.face) input.faceTo = ai.face;
    if (ai.cool > 0) return input;

    // occasionally drop the plan for something more human
    if (!ai.plan) {
      const st = g.stage, s = w.stress;
      const roll = Math.random();
      const pPanic = st >= 3 ? 0.12 + s * 0.12 : 0.03, pGawk = 0.08 + s * 0.08, pQuit = st >= 3 ? s * 0.1 : 0;
      // quitting for good: the regretter early, anybody else once they have really had it
      if ((ai.quitAt && ai.t > ai.quitAt && w.stress > 0.3) || (w.stress > 0.88 && ai.fails > 7 && Math.random() < 0.08)) { this._quit(w); return input; }
      const role = w.role;
      if (role === 'organiser' && roll < 0.22 && this.count > 2) ai.plan = { kind: 'organise', t: rr(2.2, 3.4) };
      else if (role === 'expert' && roll < 0.18 && (!ai.proposed || ai.t - ai.proposed > 25)) ai.plan = { kind: 'propose', t: 1.6 };
      else if (role === 'onlooker' && roll < 0.55) ai.plan = { kind: 'watch', t: rr(4, 9) };
      else if (roll < pPanic) ai.plan = { kind: 'panic', t: rr(1.2, 2.6), to: V(rr(-36, 55), rr(3, 31)) };
      else if (roll < pPanic + pGawk) ai.plan = { kind: 'gawk', t: rr(1.4, 3.2) };
      else if (roll < pPanic + pGawk + pQuit) ai.plan = { kind: 'quit', t: rr(2, 3.5) };
      else ai.plan = { kind: 'work', t: rr(6, 14) };
      if (ai.plan.kind === 'gawk') {
        const b = pick(g.scaffold.list);
        ai.plan.at = b ? cellCenter(b.i, b.j, b.k) : V(0, 0);
        if (Math.random() < 0.35) this.speak(w, this.line('gawk'), { dur: 1.6 });
      } else if (ai.plan.kind === 'panic') {
        if (Math.random() < 0.4) this.speak(w, Math.random() < 0.3 ? pick(GIBBERISH) : this.line('panic'), { dur: 1.6 });
      } else if (ai.plan.kind === 'quit') {
        w.react(pick(['meltdown', 'despair', 'facepalm']));
        if (Math.random() < 0.4) this.speak(w, pick(['I need a cigarette.', "I'm too old for this.", 'Wake me when it stops.']), { dur: 2 });
      }
    }
    const plan = ai.plan;
    plan.t -= dt;
    if (plan.t <= 0) { ai.plan = null; return input; }

    if (plan.kind === 'panic') {
      input.run = true;
      if (this._steer(w, input, plan.to, 1.1, dt) || ai.stuck > 1) plan.to = V(rr(-36, 55), rr(3, 31));
      if (Math.random() < 0.4) input.lookBack = Math.sin(ai.t * 3) > 0 ? 1 : 0;
      return input;
    }
    if (plan.kind === 'gawk') { input.faceTo = plan.at; input.lookAt = plan.at; input.noFidget = true; return input; }
    if (plan.kind === 'organise') {
      if (!plan.said) {
        plan.said = true;
        w.react('point');
        this.g.director?.note('organise');
        this.speak(w, this.line('organise'), { dur: 1.8, priority: true });
        const o = pick(this.list.filter(o => o !== w && o.root.visible && !o.left && o.pos.distanceTo(w.pos) < 12));
        if (o) this.g.later(rr(1.6, 2.6), () => { if (!this.escape) { this.speak(o, this.line('organiseFail'), { dur: 1.6 }); if (Math.random() < 0.5) o.react(pick(['shrug', 'facepalm'])); } });
      }
      return input;
    }
    if (plan.kind === 'propose') {
      if (!plan.said) { plan.said = true; ai.proposed = ai.t; w.react('confident'); this.speak(w, this.line('propose'), { dur: 2, priority: true }); }
      return input;
    }
    if (plan.kind === 'watch') {
      // standing back, hands on hips, offering commentary
      const b = this._nearestBayPos(w);
      input.faceTo = b; input.lookAt = b; input.noFidget = !!plan.still;
      if (!plan.said && Math.random() < dt * 0.25) { plan.said = true; this.speak(w, this.line('watch'), { dur: 1.8 }); }
      return input;
    }
    if (plan.kind === 'quit') return input;

    // work
    if (!ai.target || g.scaffold.bays.get(ai.target.key) !== ai.target || ai.stuck > 2.5) {
      ai.target = this._chooseBay(w); ai.stuck = 0;
      // after it has played tricks on them, they approach the next one warily
      ai.wary = ai.target && Math.random() < Math.min(0.6, 0.12 + ai.fails * 0.08);
    }
    if (!ai.target) { ai.cool = 1.2; return input; }
    const c = cellCenter(ai.target.i, ai.target.j, ai.target.k);
    input.lookAt = c;
    const near = g.scaffold.nearestBay(w.pos, w.facing, CFG.worker.reach, w.pos.y - 0.6, w.pos.y + 2.2);
    if (near) {
      input.faceTo = cellCenter(near.i, near.j, near.k);
      const fd = V(input.faceTo.x - w.pos.x, input.faceTo.z - w.pos.z).normalize();
      if (fd.dot(w.facing) > 0.8) {
        ai.target = near;
        if (g.stage >= 3 && Math.random() < 0.25) input.jump = true;
        g.dismantle(w, near);
        ai.cool = rr(0.3, 0.8);
      }
      return input;
    }
    const toW = V(w.pos.x - c.x, w.pos.z - c.z);
    if (toW.lengthSq() < 0.01) toW.set(0, 0, 1);
    toW.normalize();
    input.run = g.stage >= 4 || (g.stage >= 3 && w.stress > 0.6);
    const dist = Math.hypot(c.x - w.pos.x, c.z - w.pos.z);
    if (ai.wary && dist < 4.5) {
      // creep the last few steps, eyes on it; stop once to stare it down
      input.run = false; input.sneak = true; input.lookAt = c;
      if (!ai.stared && dist < 3.2) { ai.stared = true; ai.plan = { kind: 'gawk', t: rr(0.7, 1.6), at: c }; return input; }
    } else ai.stared = false;
    this._steer(w, input, c.clone().addScaledVector(toW, CFG.grid.S * 0.5 + 0.75).setY(0), 1, dt);
    return input;
  }

  _chooseBay(w) {
    const g = this.g, others = new Set(this.list.filter(o => o !== w && o.ai && o.ai.target).map(o => o.ai.target));
    let best = null, bestS = Infinity;
    for (const b of g.scaffold.list) {
      if (b.delay > 0 || b.j > 0 || others.has(b)) continue;
      const c = cellCenter(b.i, b.j, b.k);
      const s = Math.hypot(c.x - w.pos.x, c.z - w.pos.z) + Math.random() * 8;
      if (s < bestS) { bestS = s; best = b; }
    }
    return best;
  }

  // The scaffold did something (see mind.js): the workers who could see it react, each
  // in their own time and way; a line only now and then.
  onMindEvent(kind, pos, who, flavour) {
    if (this.escape) return;
    const g = this.g;
    const seen = this.list.filter(w => w.root.visible && !w.left && (!pos || w.pos.distanceTo(pos) < 16));
    if (seen.length) this.addPressure({ still: 0.6, release: 1.2, bow: 0.8, wave: 1, obstacle: 0.9, coordinated: 1.6, laugh: 0.7, moved: 0.3 }[kind] ?? 0.3, kind);
    if (kind === 'laugh') {
      // someone heard it, and wishes they hadn't
      const w = pick(seen.filter(w => w.pos.distanceTo(pos) < 12));
      if (w) g.later(rr(0.4, 1.0), () => { w.react(pick(['disbelief', 'surprise', 'confused']), { fx: false, voice: false }); if (Math.random() < 0.45) this.speak(w, this.line('laugh'), { dur: 1.8 }); });
      return;
    }
    if (kind === 'obstacle' && who) {
      g.later(rr(0.5, 1.0), () => { who.react(pick(['surprise', 'stumble', 'disbelief'])); if (Math.random() < 0.6) this.speak(who, this.line('obstacle'), { dur: 1.6 }); });
      return;
    }
    if (kind === 'coordinated') {
      seen.slice(0, 6).forEach((w) => g.later(rr(0.2, 1.2), () => w.react(pick(['surprise', 'dodge', 'disbelief']), { voice: false })));
      if (seen.length) g.later(1.4, () => this.speak(pick(seen), this.line('coordinated'), { dur: 1.8, priority: true }));
      return;
    }
    if (kind === 'still') {
      seen.forEach((w, n) => g.later(rr(0.2, 1.4), () => {
        if (w.ai) { w.ai.plan = { kind: 'gawk', t: rr(2.5, 4.5), at: this._nearestBayPos(w) }; w.ai.cool = 0; }
        if (Math.random() < 0.4) w.react(pick(['confused', 'disbelief']), { fx: false, voice: false });
      }));
      if (seen.length) g.later(rr(1.2, 2.2), () => this.speak(pick(seen), this.line('still'), { dur: 1.8 }));
    } else if (kind === 'release') {
      seen.forEach(w => { if (w.pos.distanceTo(pos) < 9) g.later(rr(0, 0.35), () => w.react(pick(['surprise', 'dodge', 'surprise']))); });
      if (seen.length && Math.random() < 0.6) g.later(0.9, () => this.speak(pick(seen), Math.random() < 0.35 ? pick(GIBBERISH) : this.line('release'), { dur: 1.4 }));
    } else if (kind === 'bow' && who) {
      g.later(0.9, () => { who.react(pick(['angry', 'disbelief', 'facepalm'])); if (Math.random() < 0.7) this.speak(who, this.line('bow'), { dur: 2 }); });
      const o = pick(seen.filter(o => o !== who));
      if (o && Math.random() < 0.4) g.later(2.4, () => this.speak(o, this.line('bowSeen'), { dur: 1.5 }));
    } else if (kind === 'moved' || kind === 'wave') {
      const w = pick(seen);
      if (!w) return;
      g.later(rr(0.3, 0.9), () => {
        if (w.ai && !w.busy) { w.ai.plan = { kind: 'gawk', t: rr(1.2, 2.4), at: pos.clone() }; }
        if (Math.random() < (flavour === 'subtle' ? 0.25 : 0.5)) w.react(pick(flavour === 'subtle' ? ['confused'] : ['confused', 'surprise', 'disbelief']), { voice: false });
        if (Math.random() < (flavour === 'subtle' ? 0.15 : 0.3)) this.speak(w, this.line(flavour === 'subtle' ? 'subtle' : flavour === 'elsewhere' ? 'elsewhere' : 'moved'), { dur: 1.6 });
      });
    }
  }

  _nearestBayPos(w) {
    let best = null, bd = Infinity;
    for (const b of this.g.scaffold.list) { const c = cellCenter(b.i, b.j, b.k); const d = c.distanceToSquared(w.pos); if (d < bd) { bd = d; best = c; } }
    return best || w.pos.clone();
  }

  // Called by the game after any worker's dismantle attempt resolves.
  afterAttempt(w, outcome) {
    const g = this.g;
    if (this.escape) return;
    this.addPressure(outcome === 'dodged' ? 1.2 : outcome === 'fail' ? 1.0 : 0.35, outcome);
    // a failed "expert" gets what's coming
    if (w.ai && w.ai.proposed && w.ai.t - w.ai.proposed < 12 && outcome !== 'ok') {
      w.ai.proposed = -99;
      const o = pick(this.list.filter(o => o !== w && o.root.visible && !o.left && o.pos.distanceTo(w.pos) < 12));
      if (o) g.later(rr(1.0, 1.8), () => { if (!this.escape) { this.speak(o, this.line('proposeFail'), { dur: 1.8, priority: true }); o.react(pick(['facepalm', 'shrug', 'confident'])); } });
    }
    if (outcome === 'dodged' && Math.random() < 0.45) g.later(rr(0.8, 1.5), () => { if (!this.escape) this.speak(w, this.line(g.mind.targets && [...g.mind.targets.values()].some(m => m.n >= 3 && g.mind.t - m.last < 2) && Math.random() < 0.5 ? 'anticipated' : 'dodged'), { dur: 1.7 }); });
    if (w === g.worker) {
      if (outcome === 'fail' || Math.random() < 0.25) g.later(rr(1.0, 1.8), () => { if (!this.escape) this.speak(w, w.stress > 0.75 && Math.random() < 0.3 ? pick(GIBBERISH) : this.line('fail'), { dur: 1.8 }); });
      return;
    }
    const ai = w.ai;
    if (!ai) return;
    ai.fails++;
    ai.target = null;
    const st = w.stress;
    // reactions escalate with personal stress, so newcomers start off cocky
    const kind = st < 0.2 ? pick(['surprise', 'confused', 'disbelief'])
      : st < 0.45 ? pick(['confused', 'angry', 'facepalm', 'tug'])
      : st < 0.7 ? pick(['angry', 'exasperated', 'facepalm', 'disbelief'])
      : pick(['exasperated', 'meltdown', 'despair', 'angry']);
    g.later(rr(0.5, 1.4), () => {
      if (w.busy || this.escape) return;
      w.react(kind);
      const r = Math.random();
      if (st > 0.7 && r < 0.18) this.speak(w, pick(GIBBERISH), { dur: 1.3 });
      else if (r < 0.3) this.speak(w, this.line(outcome === 'ok' ? 'grow' : 'fail'), { dur: 1.8 });
    });
    ai.cool = rr(1.6, 3.2) - g.stage * 0.2;
    const other = this.list.find(o => o !== w && o.root.visible && o.pos.distanceTo(w.pos) < 3.5 && !o.busy && !(o.ai && o.ai.cool > 1.5));
    if (other && Math.random() < 0.3 + g.stage * 0.05) this._argue(w, other);
    if (outcome === 'fail' && Math.random() < 0.35) g.scaffold.peek(w.pos, { chance: 0.6, near: 6, mood: 'roll' });
  }

  _argue(a, b) {
    const g = this.g;
    const [la, lb] = pick(LINES.argue);
    this.arguingUntil = this.g.time + 4.5;   // the scaffold notices when they are busy squabbling
    this.g.director?.note('argue');
    for (const [x, y] of [[a, b], [b, a]]) if (x.ai) { x.ai.cool = 3.4; x.ai.face = y.pos.clone(); x.ai.plan = null; }
    g.later(rr(0.6, 1.0), () => { if (this.escape) return; a.react('argue'); this.speak(a, la, { dur: 1.7, priority: true }); });
    g.later(rr(2.0, 2.5), () => { if (this.escape) return; b.react(Math.random() < 0.6 ? 'argue' : 'exasperated'); this.speak(b, lb, { dur: 1.7, priority: true }); a.addStress(0.04); b.addStress(0.04); });
    g.later(3.8, () => { if (a.ai) a.ai.face = null; if (b.ai) b.ai.face = null; });
  }

  _bump(w, hit) {
    if (hit && hit.kind === 'bay') { hit.bay.shake = Math.max(hit.bay.shake, 0.3); hit.bay.dirty = true; }
  }

  // Workers push each other apart; a fast collision is a comic bonk, a slow one a shove.
  _separate() {
    const L = this.list, now = this.g.time;
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i], b = L[j];
      if (!a.root.visible || !b.root.visible) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz), min = a.radius + b.radius + 0.15;
      if (d > 0.001 && d < min) {
        const push = (min - d) / 2, nx = dx / d, nz = dz / d;
        a.pos.x -= nx * push; a.pos.z -= nz * push; b.pos.x += nx * push; b.pos.z += nz * push;
        const rel = Math.hypot(a.vel.x - b.vel.x, a.vel.z - b.vel.z);
        if (rel > 4.0 && now - (a.lastBonk || 0) > 2.5 && now - (b.lastBonk || 0) > 2.5) {
          a.lastBonk = b.lastBonk = now;
          a.react('bonk', { voice: false }); b.react('stumble');
          a.vel.addScaledVector(V(-nx, -nz), 3); b.vel.addScaledVector(V(nx, nz), 3);
          this.g.fx.word(a.pos.clone().lerp(b.pos, 0.5).setY(2.6), pick(['BONK!', 'DONK!', 'OOF!']), { size: 0.8, color: '#e8b23a' });
          if (!this.escape && Math.random() < 0.6) this.g.later(0.6, () => this.speak(b, this.line('bump'), { dur: 1.3 }));
        }
      }
    }
  }

  // ---------- the endings' exits ----------
  // mode 'flee'      (students / collapse) everybody bolts at their own moment along their own route,
  //                  shouting, glancing back, stumbling, dropping things; the foreman says it
  // mode 'resigned'  (mass resignation) they give up — tools thrown down, shrugs, hands up — and
  //                  leave fast, at staggered moments, gesturing and grumbling on the way
  // mode 'sheepish'  (the ghost) heads down, a hurried walk, a mumbled apology
  // In every mode one worker is the slowpoke — usually the foreman, sometimes an exhausted
  // colleague — who trudges far behind, stops once to look back, and is the last to go.
  // Everybody heads for the nearest real way out; crossing the courtyard boundary counts as gone
  // (escapeStatus()), and they disappear a few metres later instead of walking on for ever.
  startEscape(mode = 'flee', opts = {}) {
    if (this.escape) return;
    const g = this.g;
    this.escape = { t: 0, lastBurst: -5, mode };
    this.pendingCall = null;   // whoever was just called stays home
    this.mode = null;
    g.cinematic = true;
    const shots = {
      flee: { pos: new THREE.Vector3(-4.5, 4.2, 40), look: opts.look || new THREE.Vector3(-3, 4.5, 6) },
      resigned: { pos: new THREE.Vector3(-3, 10, 32), look: new THREE.Vector3(-6, 2, 7) },
      sheepish: { pos: new THREE.Vector3(-4.5, 6, 40), look: new THREE.Vector3(-2, 2, 12) },
    };
    if (opts.shot) g.cam.fixed = opts.shot;
    else if (opts.keepShot && g.cam.fixed) { /* the ending's own shot stays */ }
    else g.cam.fixed = shots[mode] || shots.flee;
    g.hud.clearBubbles();
    g.hud.setCinematic(true);
    g.director?.extras.onEscape(mode);
    const boss = g.worker;
    const present = this.list.filter(w => w.root.visible && !w.left);
    const order = [...present].sort(() => Math.random() - 0.5);
    const talkers = order.filter(w => w !== boss).slice(0, Math.min(mode === 'flee' ? 5 : 4, present.length - 1));
    const lines = [...(mode === 'flee' ? ESCAPE_LINES : mode === 'sheepish' ? SHEEPISH_LINES : RESIGNED_SARCASM)].sort(() => Math.random() - 0.5);
    // the slowpoke: the foreman more often than not
    const slow = Math.random() < 0.55 || present.length < 3 ? boss : pick(present.filter(w => w !== boss));
    const flee = mode === 'flee', resigned = mode === 'resigned';
    for (const w of present) {
      w.reaction = null; w.action = null;
      w.J.wrench.visible = flee || resigned;            // grab the wrench (to run with it, or to throw it down)
      w.free = true;
      // the nearest way out, mostly; now and then another one
      const routes = [...ROUTES].sort((a, b) => a.gate.distanceTo(w.pos) - b.gate.distanceTo(w.pos));
      const route = flee && Math.random() < (opts.toward ?? 0.35) ? ROUTES[0] : Math.random() < 0.85 ? routes[0] : routes[1];
      // some stop to watch it happen before it dawns on them that they should run
      const gawker = flee && Math.random() < 0.2;
      const hurried = resigned && Math.random() < 0.5;
      w.ai = {
        ...(w.ai || {}),
        stuck: 0, dodge: 0, stare: null,
        flee: {
          route, start: flee ? (gawker ? rr(1.6, 3.6) : rr(0.0, 1.1)) : resigned ? rr(0.3, 3.8) : rr(0.2, 2.2),
          wobble: rr(1.5, 3.5), wob: Math.random() * 6, side: Math.random() < 0.5 ? -1 : 1,
          // resigned: half of them jog, the other half walk fast; sheepish: a quick, embarrassed walk
          speed: flee ? rr(1.05, 1.3) : resigned ? (hurried ? rr(0.82, 1.0) : rr(1.3, 1.5)) : rr(1.25, 1.45),
          walk: !flee && !hurried, gawker, looks: [rr(1.2, 3.0), rr(3.5, 6)], stumble: flee && Math.random() < 0.35 ? rr(1.5, 4) : -1,
          drops: flee ? [opts.tools ? rr(0.3, 1.3) : rr(0.8, 2.2), rr(2.4, 4.5), Math.random() < 0.3 ? rr(1, 3) : -1] : resigned ? [Math.random() < 0.45 ? rr(0.6, 2.5) : -1, -1, -1] : [-1, -1, -1],
          hatAt: (flee && Math.random() < 0.3) || (resigned && Math.random() < 0.12) ? rr(0.6, 2.4) : -1,
          line: talkers.includes(w) ? { at: (flee ? 0.7 : 0.4) + talkers.indexOf(w) * rr(0.9, 1.6), text: lines.pop() } : null,
          // the gesture they leave with (resigned, sheepish)
          gesture: resigned ? pickW([['throwdown', 35], ['shrug', 15], ['giveup', 30], ['headshake', 20]]) : mode === 'sheepish' ? 'guilty' : flee && opts.tools && Math.random() < 0.22 ? 'throwdown' : null,
          phase: 'run',
        },
      };
      if (w === boss && flee) {
        // the foreman runs too, then gives up running and jogs out, delivering the line
        Object.assign(w.ai.flee, { route: ROUTES[0], start: 0.25, speed: 1.0, looks: [1.4, 3.2], stumble: 2.0, drops: [-1, -1, -1], hatAt: -1, line: null, boss: true });
      }
      if (w === slow) {
        // far behind everybody: slow, reluctant, one long stop to look back at it all (on the way
        // the camera is heading for, when there is one)
        Object.assign(w.ai.flee, { slow: true, walk: true, slowSpeed: w === boss ? rr(0.42, 0.5) : rr(0.36, 0.45), pauseAt: rr(2.2, 3.6), pauseFor: rr(1.3, 1.9), looks: [rr(0.8, 1.6), rr(5, 6.5)], stumble: -1, line: null, route: opts.toward ? ROUTES[0] : routes[0] });
        w.ai.flee.start = Math.min(w.ai.flee.start, 0.8);
      }
    }
    this.escape.slow = slow;
  }

  // how far the exit has got: everybody but the slowpoke out of the courtyard? the slowpoke too?
  escapeStatus() {
    const e = this.escape;
    if (!e) return null;
    const L = this.list.filter(w => w.ai?.flee);
    const main = L.filter(w => w !== e.slow);
    const out = (w) => w.ai.flee.out || !w.root.visible;
    const sf = e.slow?.ai?.flee;
    return { t: e.t, mainOut: main.every(out), mainLeft: main.filter(w => !out(w)).length, slowOut: !e.slow || out(e.slow),
      slowJoke: !sf || out(e.slow) || (sf.paused && e.t - sf.start > sf.pauseAt + sf.pauseFor + 1.2), mainOutAt: e.mainOutAt ?? null };
  }

  _visible(p, camera) {
    const v = this._pv || (this._pv = new THREE.Vector3());
    v.copy(p).setY(1).project(camera);
    return Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 && v.z < 1 && p.distanceTo(camera.position) < 60;
  }

  _fleeInput(w, dt, camera) {
    const e = this.escape, f = w.ai?.flee;
    const input = { move: new THREE.Vector3(), run: !f?.walk, sneak: false, jump: false, camPos: camera.position, noFidget: true };
    if (!f) { w.root.visible = false; return input; }
    const t = e.t - f.start;
    if (t < 0) {
      if (f.gawker) { input.faceTo = this.g.cam.fixed?.look; input.lookAt = input.faceTo; return input; }   // just… watching
      // a jolt of surprise where they stand, then off
      if (!f.jolted && e.t > f.start * 0.4 && e.mode === 'flee') { f.jolted = true; w.react(Math.random() < 0.6 ? 'surprise' : 'dodge'); }
      return input;
    }
    if (f.gawker && !f.realised) { f.realised = true; w.react('surprise'); if (Math.random() < 0.5) this.speak(w, pick(['…Oh. RUN.', 'Wait, we\'re running?', 'Oh no no no.']), { dur: 1.4, priority: true }); }
    // the parting gesture, right as they set off (throwing the tool down, a shrug, hands up …)
    if (f.gesture && !f.gestured) {
      f.gestured = true;
      if (!f.slow || f.gesture !== 'throwdown') w.react(f.gesture, { voice: Math.random() < 0.5 });
      if (f.gesture === 'throwdown') this.g.later(0.4, () => { if (w.root.visible) this._drop(w, w.dropOne(['wrench', 'hammer']), 'slam'); });
      if (f.gesture === 'throwdown' || f.gesture === 'shrug') return input;
    }
    if (w.busy) return input;
    let speed = f.speed;
    const jog = f.boss && t > 4.2;
    if (jog) { input.run = false; input.stroll = true; speed = 0.75; }
    if (e.mode === 'sheepish' && !f.slow) input.lookAt = w.pos.clone().add(new THREE.Vector3(0, -2, 0));
    if (f.slow) {
      input.run = false; input.tired = true; speed = f.slowSpeed;
      if (t > f.pauseAt && t < f.pauseAt + f.pauseFor) {
        // the long look back
        input.faceTo = this.g.director?.lookBackAt?.() || this.g.cam.fixed?.look; input.lookAt = input.faceTo; input.tired = false;
        if (!f.paused) {
          f.paused = true;
          w.react(pick(['wipe', 'headshake', 'disbelief']), { fx: false, voice: false });
          w.audio.say('sigh', w.pos, { force: true });
          if (Math.random() < 0.7) this.g.later(0.5, () => this.speak(w, pick(SLOW_LINES), { dur: 1.8, priority: true }));
        }
        return input;
      }
    }
    const target = f.phase === 'run' ? f.route.gate : f.route.outside;
    // a wavy, imperfect line rather than a beeline
    const lane = Math.sin(t * f.wobble + f.wob) * (f.slow ? 0.3 : 0.9) * f.side;
    const tgt = target.clone();
    const dir = V(tgt.x - w.pos.x, tgt.z - w.pos.z).normalize();
    tgt.x += -dir.z * lane * 3; tgt.z += dir.x * lane * 3;
    const arrived = this._steer(w, input, tgt, speed, dt) || w.pos.distanceTo(target) < 2.2;
    if (arrived && f.phase === 'run') f.phase = 'out';
    // the courtyard boundary: crossing it means gone; a few metres on (out of shot) they vanish
    if (!f.out && outsideCourt(w.pos, 0.6)) { f.out = true; f.outT = e.t; }
    if (f.out && (outsideCourt(w.pos, 5) && !this._visible(w.pos, camera) || outsideCourt(w.pos, 14) || w.pos.distanceTo(f.route.outside) < 3 || e.t - f.outT > 6)) { w.root.visible = false; w.left = true; }
    for (const at of f.looks) if (t > at && t < at + 0.7) input.lookBack = f.side;   // glance back
    return input;
  }

  _updateEscape(dt) {
    const e = this.escape, g = this.g;
    e.t += dt;
    const boss = g.worker;
    for (const w of this.list) {
      const f = w.ai?.flee;
      if (!f || !w.root.visible) continue;
      const t = e.t - f.start;
      if (t < 0) continue;
      // things slip out of their hands on the way (or get tossed aside)
      for (let i = 0; i < f.drops.length; i++) {
        if (f.drops[i] > 0 && t > f.drops[i]) { f.drops[i] = -1; this._drop(w, w.dropOne(['wrench', 'hammer', 'tape']), e.mode === 'flee' && i > 0 ? 'slip' : 'toss'); }
      }
      if (f.hatAt > 0 && t > f.hatAt) { f.hatAt = -1; this._drop(w, w.dropOne(['hat']), e.mode === 'flee' ? 'fly' : 'toss'); }
      if (f.stumble > 0 && t > f.stumble) { f.stumble = -1; w.react('stumble'); if (Math.random() < 0.5 && e.t - e.lastBurst > 1.2) { e.lastBurst = e.t; this.speak(w, pick(GIBBERISH), { dur: 1.2, priority: true }); } }
      if (f.line && t > f.line.at) { this.speak(w, f.line.text, { dur: 1.9, priority: true }); f.line = null; }
    }
    // the punchline: the foreman stops running, tosses the wrench aside and says it on his way out
    const bf = boss.ai?.flee;
    if (bf && e.mode === 'flee' && !bf.saidIt && !bf.slow && e.t - bf.start > 4.6) {
      bf.saidIt = true;
      this._drop(boss, boss.dropOne(['wrench']), 'toss');
      this.speak(boss, "They don't pay us enough for this.", { dur: 3.2, priority: true });
      boss.react('shrug', { fx: false, voice: false });
    }
    // the camera's cut-away follows whoever is still in the courtyard (the slowpoke, in the end)
    const inside = this.list.filter(w => w.root.visible && !w.ai?.flee?.out);
    const follow = inside.find(w => w !== e.slow) || (e.slow?.root.visible ? e.slow : null) || inside[0];
    if (follow) this.focus.copy(follow.pos);
    const st = this.escapeStatus();
    if (st.mainOut && e.mainOutAt === undefined) e.mainOutAt = e.t;
  }

  // ---------- the director's levers ----------
  // calling in reinforcements in bulk (the night shift of the resignation ending): fast, in bursts
  nightShift(n, { fast = false } = {}) {
    const g = this.g;
    const caller = this.list.find(w => w.root.visible && !w.left && !w.busy) || g.worker;
    caller.react('call');
    this.speak(caller, pick(['Get the night shift in. ALL of it.', 'Call everyone. I mean everyone.', 'We need more people. Many more.']), { dur: 2.2, priority: true });
    this.pendingCall = { t: 0, many: Math.min(n, this.max - this.total), caller, gap: fast ? [0.12, 0.35] : [0.5, 1.4], delay: fast ? 1.2 : 2.2, hurry: fast };
    this.calls++;
  }

  // a few of the visible workers react (staggered, not in unison)
  reactSome(kinds, { frac = 0.6, spread = [0.1, 1.2], filter = null, max = 99, voice = true } = {}) {
    const L = this.list.filter(w => w.root.visible && !w.left && (!filter || filter(w))).sort(() => Math.random() - 0.5);
    const n = Math.min(max, Math.ceil(L.length * frac));
    L.slice(0, n).forEach((w, i) => this.g.later(rr(spread[0], spread[1]), () => { if (w.root.visible) w.react(pick(kinds), { voice: voice && i < 3 }); }));
    return L.slice(0, n);
  }

  // Everybody stops what they are doing and watches something: the walking scaffolding, the swarm
  // in the sky, the ghost. Each in their own way and time — a jolt, then staring, pointing, a look
  // at the colleague next to them, a tool dropped, a step back if it comes too close.
  stare(targetFn, { style = 'walker', near = 7.5, gather = null, avoid = null } = {}) {
    this.mode = 'stare';
    this.stareAvoid = avoid;             // optional (x, z) => true where nobody should end up standing (rubble)
    this.stareGather = gather;           // optional: they first move to places in a loose arc in front of this point
    this.stareAt = targetFn;
    this.stareStyle = style;
    this.stareNear = near;
    for (const w of this.list) if (w.root.visible && !w.left) {
      w.reaction = null; w.action = null;
      w.ai = w.ai || {};
      w.ai.plan = null;
      w.ai.stare = { delay: rr(0.05, 0.9), beat: rr(1.2, 3), chase: style === 'walker' && Math.random() < 0.15 ? rr(2, 5) : 0, dropped: false };
    }
  }

  _stareInput(w, dt, camera) {
    const input = { move: new THREE.Vector3(), run: false, sneak: false, jump: false, camPos: camera.position, noFidget: true };
    const s = w.ai.stare || (w.ai.stare = { delay: 0, beat: 2, chase: 0 });
    const at = this.stareAt();
    const style = this.stareStyle;
    s.delay -= dt;
    if (s.delay > 0) return input;
    if (!s.reacted) {
      s.reacted = true;
      const first = { sky: ['lookup', 'surprise', 'recoil'], ghost: ['confused', 'recoil', 'surprise'], resign: ['disbelief', 'headshake', 'confused', 'wipe'] }[style] || ['recoil', 'surprise', 'disbelief', 'dodge'];
      w.react(pick(first), { voice: Math.random() < 0.5 });
    }
    if (w.busy) return input;
    const d = V(at.x - w.pos.x, at.z - w.pos.z), dist = d.length();
    // the ghost: drawn towards the glow, step by hesitant step, then rooted to the spot
    if (style === 'ghost' || this.stareGather) {
      // drawn towards it / away from the collapse (each to a place in a loose arc in front of the
      // gathering point), then rooted to the spot
      const G = this.stareGather || at;
      if (!s.slot) {
        // a free place: not in the rubble, not on top of a colleague
        const taken = (x, z) => this.list.some(o => o !== w && o.ai?.stare?.slot && Math.hypot(o.ai.stare.slot.x - x, o.ai.stare.slot.z - z) < 1.6);
        for (let k = 0; k < 16 && !s.slot; k++) {
          const x = G.x + rr(-5 - k * 0.3, 5 + k * 0.3), z = Math.min(31, G.z + rr(5.2, 8.5) + k * 0.6);
          if (!(this.stareAvoid && this.stareAvoid(x, z)) && !taken(x, z)) s.slot = V(x, z);
        }
        s.slot ||= V(G.x + rr(-5, 5), Math.min(31, G.z + 14));
      }
      const ds = Math.hypot(s.slot.x - w.pos.x, s.slot.z - w.pos.z);
      if (ds > 0.9) { w.free = true; this._steer(w, input, s.slot, ds > 12 ? 1.2 : 0.5, dt); input.lookAt = at; return input; }
    }
    // too close: back off, still facing it
    if (style !== 'sky' && dist < this.stareNear) {
      d.normalize();
      input.move.set(-d.x, 0, -d.z); input.speed = 0.75; input.faceTo = at; input.lookAt = at;
      if (!s.backed) { s.backed = true; if (Math.random() < 0.5) w.react('recoil', { voice: Math.random() < 0.4 }); }
      return input;
    }
    // a few follow it for a bit, as if they could stop it, then think better of it
    if (s.chase > 0 && !outsideCourt(w.pos, -3)) { s.chase -= dt; input.run = true; if (dist > 10) this._steer(w, input, V(at.x, at.z), 0.9, dt); return input; }
    input.faceTo = s.neighbour && s.neighbourT > 0 ? s.neighbour.pos : at;
    input.lookAt = input.faceTo === at ? at : s.neighbour.pos;
    if (s.neighbourT > 0) s.neighbourT -= dt;
    // the beats: every couple of seconds, something small
    s.beat -= dt;
    if (s.beat <= 0) {
      s.beat = rr(1.6, 3.6);
      const r = Math.random();
      if (r < 0.22) w.react(style === 'sky' ? 'lookup' : style === 'resign' ? 'shrug' : 'point', { voice: false });
      else if (r < 0.4) {
        // a look at the colleague next to them: are you seeing this?
        const o = this.list.filter(o => o !== w && o.root.visible && !o.left).sort((a, b) => a.pos.distanceTo(w.pos) - b.pos.distanceTo(w.pos))[0];
        if (o && o.pos.distanceTo(w.pos) < 6) { s.neighbour = o; s.neighbourT = rr(0.9, 1.4); if (Math.random() < 0.5) w.react('confused', { fx: false, voice: false }); }
      } else if (r < 0.52 && !s.dropped) { s.dropped = true; this._drop(w, w.dropOne(['wrench', 'hammer', 'tape']), 'slip'); w.react('disbelief', { fx: false, voice: false }); }
      else if (r < 0.66) w.react(pick(['headshake', 'confused', 'disbelief']), { fx: false, voice: Math.random() < 0.3 });
    }
    return input;
  }

  argueSomewhere() {
    const L = this.list.filter(w => w.root.visible && !w.left && w.ai && !w.busy);
    for (const a of L.sort(() => Math.random() - 0.5)) {
      const b = L.find(o => o !== a && o.pos.distanceTo(a.pos) < 6);
      if (b) { this._argue(a, b); return true; }
    }
    return false;
  }

  _drop(w, o, how = 'slip') {
    if (!o) return;
    const v = w.vel.clone().multiplyScalar(how === 'toss' ? 0.2 : how === 'slam' ? 0.05 : 0.55);
    if (how === 'toss') v.add(new THREE.Vector3(Math.cos(w.heading) * 4, 0, -Math.sin(w.heading) * 4)); // flung off to the side
    if (how === 'slam') v.add(w.facing.clone().multiplyScalar(1.5));                                     // hurled down in front
    v.y = how === 'fly' ? rr(4, 6) : how === 'toss' ? 3.5 : how === 'slam' ? -7 : rr(1, 2);
    this.props.push({ o, vel: v, spin: new THREE.Vector3(rr(4, 12), rr(2, 6), rr(4, 12)), bounces: 0, how });
    if (how === 'fly') this.g.fx.word(o.position.clone().setY(o.position.y + 0.6), 'FWUP', { size: 0.5, color: '#fbf1dc', life: 0.7 });
  }

  _updateProps(dt) {
    for (const p of this.props) {
      if (p.bounces > 3) continue;
      p.vel.y -= 18 * dt;
      p.o.position.addScaledVector(p.vel, dt);
      p.o.rotation.x += p.spin.x * dt; p.o.rotation.y += p.spin.y * dt; p.o.rotation.z += p.spin.z * dt;
      if (p.o.position.y < 0.06 && p.vel.y < 0) {
        p.o.position.y = 0.06;
        p.vel.y *= -0.35; p.vel.x *= 0.5; p.vel.z *= 0.5; p.spin.multiplyScalar(0.4);
        p.bounces++;
        // the clatter lands exactly when the tool hits the ground
        if (p.bounces === 1) {
          this.g.audio.clank(p.o.position, { pitch: (p.how === 'slam' ? 1.1 : 1.6) + Math.random() * 0.6, vol: p.how === 'slam' ? 0.55 : 0.3 });
          if (p.how === 'slam' && Math.random() < 0.5) this.g.fx.word(p.o.position.clone().setY(0.9), pick(['CLANG', 'KLONK', 'DONK']), { size: 0.55, color: '#fbf1dc', life: 0.7 });
        }
        if (p.bounces > 3) { p.o.rotation.x = Math.PI / 2; p.o.rotation.z = 0; }
      }
    }
  }
}
