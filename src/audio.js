// All sound is synthesised at runtime (no sample files), through one central manager.
//
// Most effects (clanks, rubble, impacts, glass, footsteps, the scaffold's giggles) are rendered
// once into a small bank of AudioBuffers when the audio starts, and every event then plays one of
// those buffers as a "voice": one buffer source, one gain, one panner. Voices go through a
// manager with a total limit, a limit per category, priorities (a giggle or a shout may take over
// a footstep's slot, never the other way round) and per-sound throttles. If the browser's audio
// thread falls behind anyway, low-priority sounds are shed until it has caught up.
//
// (Before this, every event built its own little synthesis graph: a single rubble sound made
// ~100 nodes, and in the chaotic stage 4 the game created ~5000 nodes per second. The audio
// thread could not keep up, the audio clock fell to a tenth of real time, everything went
// silent for many seconds and then the backlog played at once. That is what this design fixes.)
//
// The scaffold giggles like a mischievous little child (titter, giggle, burst, fit), with a
// faint ring of steel. The workers have short formant-synth vocal noises when something happens
// to them (surprise, oof, sigh, groan, a nervous laugh …). Dialogue is shown in speech bubbles only:
// nothing is spoken aloud.
import * as THREE from 'three';

const VOWELS = {
  a: [730, 1090, 2440], e: [530, 1840, 2480], i: [300, 2200, 3000],
  o: [570, 840, 2410], u: [320, 870, 2240], m: [260, 1000, 2200], r: [520, 1300, 1700],
};

// Each phrase: syllables [vowel(s), duration, pitchStart, pitchEnd, opts].
const PHRASES = {
  confident: [['m', 0.13, 135, 150], ['m', 0.2, 165, 140, { gap: 0.06 }]],
  hup:       [['u', 0.11, 190, 230, { breath: 0.5 }]],
  surprise:  [['a', 0.32, 150, 360, { breath: 0.7 }]],
  what:      [['ua', 0.36, 160, 280, { breath: 0.3 }]],
  huh:       [['a', 0.16, 140, 120, { breath: 0.8 }], ['e', 0.26, 150, 250]],
  angry:     [['ra', 0.5, 230, 120, { growl: 1 }]],
  grr:       [['r', 0.42, 120, 105, { growl: 1.4 }]],
  no:        [['o', 0.15, 230, 210], ['o', 0.15, 240, 220, { gap: 0.06 }], ['o', 0.35, 260, 160, { gap: 0.06 }]],
  effort:    [['m', 0.34, 170, 200, { growl: 0.6 }]],
  oof:       [['u', 0.2, 200, 130, { breath: 0.9 }]],
  despair:   [['ua', 0.35, 230, 260], ['i', 0.6, 260, 150, { gap: 0 }]],
  yelp:      [['i', 0.18, 300, 420, { breath: 0.4 }]],
  sigh:      [['a', 0.55, 175, 115, { breath: 1.4 }]],
  groan:     [['o', 0.55, 150, 108, { growl: 0.35, breath: 0.4 }]],
  nervous:   [['e', 0.08, 185, 200, { breath: 0.6 }], ['e', 0.08, 195, 185, { gap: 0.05, breath: 0.6 }], ['e', 0.12, 185, 150, { gap: 0.05, breath: 0.6 }]],
  whoa:      [['ua', 0.42, 140, 230, { breath: 0.5 }]],
};

// How many voices of each kind may sound at once, and how much each kind matters.
const CAPS = { clank: 8, rubble: 5, impact: 4, glass: 3, step: 6, scrape: 2, creak: 2, voice: 2, laugh: 1, fx: 3 };
const PRI = { step: 0, rubble: 1, clank: 1, glass: 1, scrape: 1, creak: 1, impact: 2, fx: 2, voice: 3, laugh: 4 };
const MAX_VOICES = 36;

// ---------- offline DSP for the sound bank ----------
const TAU = Math.PI * 2;
// RBJ band-pass (0 dB peak), as a tiny stateful filter
function bandpass(f, q, sr) {
  const st = { x1: 0, x2: 0, y1: 0, y2: 0, b0: 0, b2: 0, a1: 0, a2: 0 };
  st.set = (ff, qq = q) => {
    const w = TAU * Math.min(ff, sr * 0.45) / sr, al = Math.sin(w) / (2 * qq), a0 = 1 + al;
    st.b0 = al / a0; st.b2 = -al / a0; st.a1 = -2 * Math.cos(w) / a0; st.a2 = (1 - al) / a0;
  };
  st.run = (x) => { const y = st.b0 * x + st.b2 * st.x2 - st.a1 * st.y1 - st.a2 * st.y2; st.x2 = st.x1; st.x1 = x; st.y2 = st.y1; st.y1 = y; return y; };
  st.set(f, q);
  return st;
}
const onePoleLP = (f, sr) => { const k = 1 - Math.exp(-TAU * f / sr); let y = 0; return (x) => (y += (x - y) * k); };
const onePoleHP = (f, sr) => { const lp = onePoleLP(f, sr); return (x) => x - lp(x); };
const noise = () => Math.random() * 2 - 1;
const dB80 = (t, d) => Math.pow(10, -4 * t / d);     // the old exponential ramps: -80 dB over d

function normalise(d, peak = 0.9) {
  let m = 0; for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  if (m > 0) { const k = peak / m; for (let i = 0; i < d.length; i++) d[i] *= k; }
}

// A struck steel tube: inharmonic partials and a click.
function synthClank(d, sr, heavy) {
  const f0 = (heavy ? 210 : 460) * (0.9 + Math.random() * 0.2);
  const parts = [1, 2.32, 4.25, 6.63, 9.38].map((r, n) => ({ f: f0 * r * (1 + (Math.random() - 0.5) * 0.02), a: 0.5 / (n + 1), dec: (heavy ? 1.4 : 0.8) / (1 + n * 0.6), ph: Math.random() * TAU }));
  const bp = bandpass(3200, 1.2, sr);
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    let s = 0;
    for (const p of parts) s += Math.sin(p.ph + TAU * p.f * t) * p.a * dB80(t, p.dec) * Math.min(1, t / 0.002);
    s += bp.run(noise()) * 0.6 * dB80(t, 0.03) * 2.2;
    d[i] = s;
  }
}
// Rubble: many tiny filtered noise grains.
function synthRubble(d, sr, size, dur) {
  const grains = Math.floor(10 + size * 18);
  for (let g = 0; g < grains; g++) {
    const t0 = Math.pow(Math.random(), 1.6) * dur, i0 = Math.floor(t0 * sr);
    const bp = bandpass(300 + Math.random() * 2400, 2, sr);
    const peak = (0.2 + Math.random() * 0.5) * 2.4, dec = 0.03 + Math.random() * 0.05;
    const n = Math.floor((dec + 0.01) * sr);
    for (let i = 0; i < n && i0 + i < d.length; i++) { const t = i / sr; d[i0 + i] += bp.run(noise()) * peak * dB80(t, dec) * Math.min(1, t / 0.002); }
  }
}
function synthImpact(d, sr, size) {
  const lp = onePoleLP(500 + size * 300, sr), lp2 = onePoleLP(500 + size * 300, sr);
  let ph = 0;
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    const f = 110 * Math.pow(32 / 110, Math.min(1, t / 0.45));
    ph += TAU * f / sr;
    d[i] = Math.sin(ph) * dB80(t, 0.5 + size * 0.2) * Math.min(1, t / 0.004) + lp2(lp(noise())) * 2.5 * 0.8 * dB80(t, 0.35 + size * 0.3);
  }
}
function synthGlass(d, sr) {
  const hp = onePoleHP(3500, sr);
  const pings = [...Array(7)].map(() => ({ t: Math.random() * 0.35, f: 2500 + Math.random() * 4000 }));
  for (let i = 0; i < d.length; i++) {
    const t = i / sr;
    let s = hp(noise()) * 0.7 * dB80(t, 0.3);
    for (const p of pings) if (t > p.t) s += Math.sin(TAU * p.f * (t - p.t)) * 0.15 * dB80(t - p.t, 0.15);
    d[i] = s;
  }
}
function synthStep(d, sr) {
  const lp = onePoleLP(900, sr), lp2 = onePoleLP(1200, sr);
  for (let i = 0; i < d.length; i++) { const t = i / sr; d[i] = lp2(lp(noise())) * 2.6 * dB80(t, 0.06) * Math.min(1, t / 0.003); }
}

// The scaffold's giggle: a small child's "hee-hee-hee". A breathy glottal buzz at a child's pitch
// through child formants, each syllable starting on a puff of "h", the phrase falling in pitch,
// bigger laughs ending on a squeal and catching their breath with a little squeaky inhale.
// A faint comb resonance gives it the ring of a steel tube, so it is the scaffold that laughs.
const CHILD = { i: [420, 2900, 3800], e: [560, 2500, 3500], a: [900, 1750, 3600], ih: [480, 2600, 3600] };
const GIGGLES = {
  titter: { n: [2, 3], f0: [430, 500], syl: [0.05, 0.07], gap: [0.05, 0.075], bursts: [1, 1], squeal: 0, inhale: 0, vows: ['i', 'e'] },
  giggle: { n: [4, 6], f0: [420, 520], syl: [0.055, 0.08], gap: [0.04, 0.06], bursts: [1, 1], squeal: 0.3, inhale: 0.5, vows: ['i', 'ih', 'e'] },
  burst:  { n: [6, 9], f0: [470, 590], syl: [0.05, 0.07], gap: [0.03, 0.05], bursts: [1, 1], squeal: 1, inhale: 0.8, vows: ['i', 'ih', 'a'] },
  fit:    { n: [4, 7], f0: [450, 580], syl: [0.05, 0.075], gap: [0.03, 0.055], bursts: [2, 3], squeal: 0.8, inhale: 1, vows: ['i', 'e', 'a', 'ih'] },
};
function giggleEvents(kind) {
  const s = GIGGLES[kind], R = (a) => a[0] + Math.random() * (a[1] - a[0]);
  const ev = [];
  let t = 0.01;
  const bursts = Math.round(R(s.bursts));
  const f0 = R(s.f0);
  for (let b = 0; b < bursts; b++) {
    const n = Math.round(R(s.n));
    const lift = 1 + b * 0.06;
    for (let k = 0; k < n; k++) {
      const u = k / Math.max(1, n - 1);
      const last = k === n - 1;
      const sq = last && Math.random() < s.squeal;
      const p = f0 * lift * (1.12 - 0.24 * u + (Math.random() - 0.5) * 0.06) * (sq ? 1.45 : 1);
      const dur = R(s.syl) * (sq ? 2.6 : last ? 1.5 : 1);
      ev.push({ type: 'syl', t, dur, p0: p * 1.04, p1: p * (sq ? 1.1 : 0.84), vow: s.vows[Math.floor(Math.random() * s.vows.length)], amp: (1 - u * 0.35) * (sq ? 0.8 : 1), h: k === 0 ? 0.035 : 0.022 });
      t += dur + R(s.gap) * (1 + u * 0.4);
    }
    if (b < bursts - 1 || Math.random() < s.inhale) {
      ev.push({ type: 'inhale', t: t + 0.03, dur: 0.16 + Math.random() * 0.12, p: f0 * 1.5 });
      t += 0.3 + Math.random() * 0.12;
    }
  }
  return { ev, len: t + 0.35 };
}
function synthGiggle(sr, kind) {
  const { ev, len } = giggleEvents(kind);
  const d = new Float32Array(Math.ceil(len * sr));
  const F = [bandpass(500, 5, sr), bandpass(2600, 12, sr), bandpass(3600, 14, sr)];
  const FG = [1, 0.62, 0.3];
  const tilt = onePoleLP(2200, sr);
  let ph = 0;
  for (const e of ev) {
    const i0 = Math.floor(e.t * sr);
    if (e.type === 'syl') {
      const f = CHILD[e.vow];
      F.forEach((b, n) => b.set(f[n] * (0.97 + Math.random() * 0.06), n ? f[n] / 190 : f[n] / 95));
      const hN = Math.floor(e.h * sr), vN = Math.floor(e.dur * sr), N = hN + vN + Math.floor(0.03 * sr);
      for (let i = 0; i < N && i0 + i < d.length; i++) {
        const t = i / sr;
        // "h": breath through the vowel's formants, then the voice comes in
        const hEnv = i < hN ? Math.min(1, t / 0.006) : Math.max(0, 1 - (i - hN) / (0.012 * sr));
        const vt = (i - hN) / sr;
        const vEnv = i < hN ? 0 : Math.min(1, vt / 0.008) * (vt < e.dur ? 1 : Math.max(0, 1 - (vt - e.dur) / 0.03)) * (1 - 0.3 * Math.min(1, vt / e.dur));
        const p = e.p0 * Math.pow(e.p1 / e.p0, Math.min(1, Math.max(0, vt) / e.dur)) * (1 + (Math.random() - 0.5) * 0.012);
        ph += p / sr; if (ph >= 1) ph -= 1;
        const pulse = (ph < 0.5 ? ph * 2 : 2 - ph * 2) * 2 - 1;            // a soft triangle-ish buzz
        const buzz = tilt(pulse - 0.6 * (ph < 0.08 ? 1 : 0));              // with a little glottal snap
        const x = buzz * vEnv * 0.9 + noise() * (hEnv * 0.55 + vEnv * 0.12);
        let y = 0; for (let n = 0; n < 3; n++) y += F[n].run(x) * FG[n];
        d[i0 + i] += y * e.amp;
      }
    } else {
      // the little squeaky intake of breath between bursts
      const bp = bandpass(e.p * 2.2, 6, sr), N = Math.floor(e.dur * sr);
      for (let i = 0; i < N && i0 + i < d.length; i++) {
        const u = i / N, env = Math.sin(Math.PI * Math.min(1, u * 1.2)) * (u < 0.85 ? 1 : (1 - u) / 0.15);
        ph += e.p * (1 + u * 0.2) / sr; if (ph >= 1) ph -= 1;
        d[i0 + i] += (bp.run(noise()) * 0.9 + Math.sin(ph * TAU) * 0.08) * env * 0.5;
      }
    }
  }
  // the ring of the tube: a short comb resonance, mixed in lightly; and a touch of space
  const comb = Math.floor(sr / (560 + Math.random() * 180)), out = new Float32Array(d.length);
  const room = Math.floor(sr * 0.043);
  for (let i = 0; i < d.length; i++) {
    const c = i >= comb ? out[i - comb] * 0.55 : 0;
    out[i] = d[i] + c * 0.5;
  }
  for (let i = 0; i < d.length; i++) d[i] = d[i] * 0.85 + (out[i] - d[i]) * 0.22 + (i >= room ? d[i - room] * 0.18 : 0);
  normalise(d, 0.85);
  return d;
}

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try { this.muted = localStorage.getItem('provisorium.muted') === '1'; } catch (e) { /* storage unavailable */ }
    this.listener = new THREE.Vector3();
    this.camera = null;
    this._v = new THREE.Vector3();
    this.voiceBusyUntil = 0;
    this.lastPlay = {};
    this.active = [];                // playing voices: { cat, pri, end, stop }
    this.bank = {};                  // name → [AudioBuffer]
    this.stats = { played: 0, dropped: 0, stolen: 0, culled: 0, shed: 0, errors: 0, laughs: 0, laughLog: [] };
    this.overloadUntil = 0;
    this._clock = null;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const ctx = this.ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      this.master.connect(comp).connect(ctx.destination);
      // buses: effects (ducked while the scaffold giggles), voices, ambience
      this.sfx = ctx.createGain(); this.sfx.connect(this.master);
      this.vox = ctx.createGain(); this.vox.gain.value = 1.1; this.vox.connect(this.master);
      this.amb = ctx.createGain(); this.amb.connect(this.master);
      const len = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this._buildBank();
      this._startAmbience();
      // if the browser suspends the context (tab switch, device change), bring it back
      ctx.onstatechange = () => { if (ctx.state !== 'running' && !this.muted) this._wantResume = true; };
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  }

  get ready() { return !!this.ctx && this.ctx.state === 'running'; }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('provisorium.muted', m ? '1' : '0'); } catch (e) { /* ignore */ }
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  // ---------- the sound bank ----------
  _buildBank() {
    const ctx = this.ctx, sr = ctx.sampleRate;
    const make = (secs, fn) => { const b = ctx.createBuffer(1, Math.ceil(secs * sr), sr); fn(b.getChannelData(0)); return b; };
    const fromArray = (arr) => { const b = ctx.createBuffer(1, arr.length, sr); b.getChannelData(0).set(arr); return b; };
    const jobs = [
      ['clank', 6, () => make(1.6, d => synthClank(d, sr, false))],
      ['clankHeavy', 4, () => make(2.0, d => synthClank(d, sr, true))],
      ['rubble', 3, () => make(1.0, d => synthRubble(d, sr, 0.7, 0.8))],
      ['rubbleBig', 3, () => make(1.5, d => synthRubble(d, sr, 1.4, 1.2))],
      ['impact', 2, () => make(1.3, d => synthImpact(d, sr, 1))],
      ['impactBig', 2, () => make(1.6, d => synthImpact(d, sr, 2))],
      ['glass', 3, () => make(0.75, d => synthGlass(d, sr))],
      ['step', 4, () => make(0.12, d => synthStep(d, sr))],
      ['titter', 3, () => fromArray(synthGiggle(sr, 'titter'))],
      ['giggle', 4, () => fromArray(synthGiggle(sr, 'giggle'))],
      ['burst', 3, () => fromArray(synthGiggle(sr, 'burst'))],
      ['fit', 3, () => fromArray(synthGiggle(sr, 'fit'))],
    ];
    // the giggles first (they matter most), then the rest; a few per tick so nothing stutters
    jobs.sort((a, b) => (GIGGLES[b[0]] ? 1 : 0) - (GIGGLES[a[0]] ? 1 : 0));
    const queue = [];
    for (const [name, n, fn] of jobs) for (let i = 0; i < n; i++) queue.push([name, fn]);
    const tick = () => {
      const t0 = performance.now();
      while (queue.length && performance.now() - t0 < 12) {
        const [name, fn] = queue.shift();
        try { (this.bank[name] ||= []).push(fn()); } catch (e) { this.stats.errors++; }
      }
      if (queue.length) setTimeout(tick, 0); else this.bankReady = true;
    };
    tick();
  }

  // ---------- the voice manager ----------
  // Rate-limit identical sounds so cascades stay readable instead of noisy.
  _throttle(key, gap) {
    const now = performance.now();
    if (this.lastPlay[key] && now - this.lastPlay[key] < gap) return true;
    this.lastPlay[key] = now;
    return false;
  }

  _spatial(pos, vol) {
    let gain = vol, pan = 0;
    if (pos && this.camera) {
      const d = this._v.copy(pos).distanceTo(this.camera.position);
      gain *= 1 / (1 + Math.max(0, d - 8) * 0.06);
      this._v.copy(pos).applyMatrix4(this.camera.matrixWorldInverse);
      pan = THREE.MathUtils.clamp(this._v.x / 14, -0.85, 0.85);
    }
    return { gain: Number.isFinite(gain) ? gain : 0, pan: Number.isFinite(pan) ? pan : 0 };
  }

  // Ask for a slot: returns true if a sound of this category and priority may start now,
  // stopping a less important one if necessary.
  _claim(cat, pri) {
    const now = this.ctx.currentTime;
    this.active = this.active.filter(v => v.end > now);
    if (pri < 2 && performance.now() < this.overloadUntil) { this.stats.shed++; return false; }
    const same = this.active.filter(v => v.cat === cat);
    if (same.length >= (CAPS[cat] ?? 4)) {
      // a giggle never cuts another giggle off, and footsteps never push out footsteps
      const victim = cat === 'laugh' || cat === 'step' ? null : same.filter(v => v.pri <= pri).sort((a, b) => a.start - b.start)[0];
      if (!victim) { this.stats.dropped++; return false; }
      this._kill(victim); this.stats.stolen++;
    }
    if (this.active.length >= MAX_VOICES) {
      const victim = this.active.filter(v => v.pri < pri).sort((a, b) => a.pri - b.pri || a.start - b.start)[0];
      if (!victim) { this.stats.dropped++; return false; }
      this._kill(victim); this.stats.stolen++;
    }
    return true;
  }
  _kill(v) { try { v.stop(); } catch (e) { /* already stopped */ } this.active.splice(this.active.indexOf(v), 1); }

  // Play one buffer from the bank as a voice. Returns its duration (0 if it did not play).
  _play(name, pos, { vol = 0.5, rate = 1, cat = 'fx', pri = PRI[cat] ?? 1, delay = 0, bus = null, lowpass = 0, dur = 0 } = {}) {
    if (!this.ready) return 0;
    const list = this.bank[name];
    if (!list || !list.length) return 0;
    try {
      const { gain, pan } = this._spatial(pos, vol);
      if (gain < 0.008) { this.stats.culled++; return 0; }                 // too far to hear: skip it
      if (!this._claim(cat, pri)) return 0;
      const ctx = this.ctx, t = ctx.currentTime + delay;
      const buf = list[Math.floor(Math.random() * list.length)];
      const src = ctx.createBufferSource();
      src.buffer = buf; src.playbackRate.value = rate;
      const g = ctx.createGain(); g.gain.value = gain;
      let node = src;
      if (lowpass) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowpass; node.connect(f); node = f; }
      node.connect(g);
      let tail = g;
      if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); tail = p; }
      tail.connect(bus || this.sfx);
      const len = dur > 0 ? Math.min(dur, buf.duration / rate) : buf.duration / rate;
      if (dur > 0) { g.gain.setValueAtTime(gain, t + len * 0.7); g.gain.linearRampToValueAtTime(0, t + len); }
      src.start(t); src.stop(t + len + 0.02);
      src.onended = () => { try { src.disconnect(); g.disconnect(); tail.disconnect(); } catch (e) { /* ignore */ } };
      const v = { cat, pri, start: t, end: t + len, stop: () => { g.gain.setTargetAtTime(0, ctx.currentTime, 0.015); src.stop(ctx.currentTime + 0.08); } };
      this.active.push(v);
      this.stats.played++;
      return len;
    } catch (e) { this.stats.errors++; return 0; }
  }

  // An output node for the live-synthesised sounds (creak, scrape, voice): gain + pan.
  _out(pos, vol = 1, bus = null) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    const { gain, pan } = this._spatial(pos, vol);
    g.gain.value = gain;
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p).connect(bus || this.sfx);
    } else g.connect(bus || this.sfx);
    return g;
  }

  _noiseSrc(t, dur) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
    return s;
  }

  _env(param, t, a, peak, d) {
    param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    param.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  // ---------- effects ----------
  clank(pos, { pitch = 1, vol = 0.5, heavy = false, delay = 0 } = {}) {
    if (!this.ready || this._throttle('clank', 25)) return;
    this._play(heavy ? 'clankHeavy' : 'clank', pos, { vol, rate: pitch * (0.85 + Math.random() * 0.35), cat: 'clank', pri: heavy ? 2 : 1, delay });
  }

  rattle(pos, count = 6, vol = 0.3) {
    if (!this.ready || this._throttle('rattle', 90)) return;
    let d = 0;
    for (let i = 0; i < Math.min(count, 6); i++) {
      d += 0.025 + Math.random() * 0.07;
      this._play('clank', pos, { vol: vol * (0.5 + Math.random() * 0.5), rate: 1.2 + Math.random() * 0.9, cat: 'clank', pri: 1, delay: d });
    }
  }

  // Stick-slip creak of loaded joints (live: rare and throttled).
  creak(pos, dur = 0.9, vol = 0.35) {
    if (!this.ready || this._throttle('creak', 400) || !this._claim('creak', PRI.creak)) return;
    try {
      const ctx = this.ctx, t = ctx.currentTime;
      const out = this._out(pos, vol);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const base = 70 + Math.random() * 50;
      o.frequency.setValueAtTime(base, t);
      o.frequency.linearRampToValueAtTime(base * (0.7 + Math.random() * 0.8), t + dur);
      const am = ctx.createOscillator();
      am.type = 'square'; am.frequency.value = 14 + Math.random() * 18;
      const amg = ctx.createGain(); amg.gain.value = 0.5;
      const vca = ctx.createGain(); vca.gain.value = 0.5;
      am.connect(amg).connect(vca.gain);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.Q.value = 9;
      bp.frequency.setValueAtTime(600 + Math.random() * 500, t);
      bp.frequency.linearRampToValueAtTime(900 + Math.random() * 900, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.9, t + dur * 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(vca).connect(bp).connect(g).connect(out);
      o.start(t); am.start(t); o.stop(t + dur + 0.05); am.stop(t + dur + 0.05);
      this.active.push({ cat: 'creak', pri: PRI.creak, start: t, end: t + dur, stop: () => { out.gain.setTargetAtTime(0, ctx.currentTime, 0.02); } });
    } catch (e) { this.stats.errors++; }
  }

  // Metal dragging across stone when the demon rearranges itself (live, throttled).
  scrape(pos, dur = 0.6, vol = 0.3) {
    if (!this.ready || this._throttle('scrape', 200) || !this._claim('scrape', PRI.scrape)) return;
    try {
      const ctx = this.ctx, t = ctx.currentTime;
      const out = this._out(pos, vol);
      const n = this._noiseSrc(t, dur);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.Q.value = 6;
      bp.frequency.setValueAtTime(1500, t);
      bp.frequency.linearRampToValueAtTime(2600, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.8, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      n.connect(bp).connect(g).connect(out);
      this.active.push({ cat: 'scrape', pri: PRI.scrape, start: t, end: t + dur, stop: () => { out.gain.setTargetAtTime(0, ctx.currentTime, 0.02); } });
    } catch (e) { this.stats.errors++; }
  }

  impact(pos, size = 1) {
    if (!this.ready || this._throttle('impact', 60)) return;
    this._play(size > 1.4 ? 'impactBig' : 'impact', pos, { vol: Math.min(1.4, 0.45 + size * 0.35), rate: 0.9 + Math.random() * 0.2, cat: 'impact' });
    this.crumble(pos, size * 0.7, 0.6 + size * 0.5);
  }

  // Rubble: one pre-rendered grain cloud (it used to be up to 35 live grains per call).
  crumble(pos, size = 1, dur = 1) {
    if (!this.ready || this._throttle('crumble', 70)) return;
    this._play(size > 1 ? 'rubbleBig' : 'rubble', pos, { vol: 0.25 + size * 0.15, rate: 0.85 + Math.random() * 0.3, cat: 'rubble', dur: Math.max(0.3, dur) + 0.1 });
  }

  glass(pos) {
    if (!this.ready || this._throttle('glass', 80)) return;
    this._play('glass', pos, { vol: 0.45, rate: 0.9 + Math.random() * 0.25, cat: 'glass' });
  }

  step(pos, metal = false, vol = 0.12) {
    if (!this.ready) return;
    if (metal) { this._play('clank', pos, { vol: vol * 0.8, rate: 1.6 * (0.9 + Math.random() * 0.2), cat: 'step', pri: 0 }); return; }
    this._play('step', pos, { vol, rate: 0.85 + Math.random() * 0.3, cat: 'step', pri: 0 });
  }

  // A deep rumble under the ground (the ghost ending), a whoosh (things taking off), and a
  // breathy, slightly silly choir chord for the apparition. One-offs, so they are synthesised live.
  rumble(pos, dur = 3.5, vol = 0.8) {
    if (!this.ready || !this._claim('fx', 3)) return;
    try {
      const ctx = this.ctx, t = ctx.currentTime, out = this._out(pos, vol);
      const n = this._noiseSrc(t, dur);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 140;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1.4, t + dur * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const o = ctx.createOscillator(); o.frequency.setValueAtTime(38, t); o.frequency.linearRampToValueAtTime(52, t + dur);
      const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.5, t + dur * 0.5); og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      n.connect(lp).connect(g).connect(out); o.connect(og).connect(out); o.start(t); o.stop(t + dur + 0.05);
      this.active.push({ cat: 'fx', pri: 3, start: t, end: t + dur, stop: () => out.gain.setTargetAtTime(0, ctx.currentTime, 0.05) });
    } catch (e) { this.stats.errors++; }
  }

  whoosh(pos, dur = 1.2, vol = 0.5, up = true) {
    if (!this.ready || this._throttle('whoosh', 150) || !this._claim('fx', 2)) return;
    try {
      const ctx = this.ctx, t = ctx.currentTime, out = this._out(pos, vol);
      const n = this._noiseSrc(t, dur);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.6;
      bp.frequency.setValueAtTime(up ? 300 : 1800, t); bp.frequency.exponentialRampToValueAtTime(up ? 2200 : 300, t + dur);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + dur * 0.45); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      n.connect(bp).connect(g).connect(out);
      this.active.push({ cat: 'fx', pri: 2, start: t, end: t + dur, stop: () => out.gain.setTargetAtTime(0, ctx.currentTime, 0.03) });
    } catch (e) { this.stats.errors++; }
  }

  choir(pos, dur = 5, vol = 0.35) {
    if (!this.ready || !this._claim('fx', 3)) return;
    try {
      const ctx = this.ctx, t = ctx.currentTime, out = this._out(pos, vol, this.vox);
      for (const [f, vw] of [[220, 'o'], [277, 'u'], [330, 'o'], [440, 'u']]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.006);
        const vib = ctx.createOscillator(); vib.frequency.value = 4.6 + Math.random(); const vg = ctx.createGain(); vg.gain.value = f * 0.006; vib.connect(vg).connect(o.frequency);
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = VOWELS[vw][0]; bp.Q.value = 4;
        const bp2 = ctx.createBiquadFilter(); bp2.type = 'bandpass'; bp2.frequency.value = VOWELS[vw][1]; bp2.Q.value = 7;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + dur * 0.35); g.gain.setValueAtTime(0.18, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(bp).connect(g); o.connect(bp2).connect(g); g.connect(out);
        o.start(t); vib.start(t); o.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
      }
      this.active.push({ cat: 'fx', pri: 3, start: t, end: t + dur, stop: () => out.gain.setTargetAtTime(0, ctx.currentTime, 0.1) });
    } catch (e) { this.stats.errors++; }
  }

  // ---------- voices ----------
  // Formant-synth vocal noises for the workers (surprise, oof, sigh …). At most two at a time.
  say(kind, pos, { force = false, pitch = 1 } = {}) {
    if (!this.ready) return;
    const phrase = PHRASES[kind];
    if (!phrase) return;
    const ctx = this.ctx;
    if (!force && ctx.currentTime < this.voiceBusyUntil) return;
    if (this._throttle('say:' + kind, 120) || !this._claim('voice', PRI.voice)) return;
    try {
      const out = this._out(pos, 1.7, this.vox);
      let t = ctx.currentTime + 0.01;
      const t0 = t;
      for (const [vow, dur, p0, p1, opts = {}] of phrase) {
        t += opts.gap || 0;
        const src = ctx.createOscillator();
        src.type = 'sawtooth';
        src.frequency.setValueAtTime(p0 * pitch, t);
        src.frequency.exponentialRampToValueAtTime(p1 * pitch, t + dur);
        const vib = ctx.createOscillator();
        vib.frequency.value = opts.growl ? 28 : 5.5;
        const vibg = ctx.createGain();
        vibg.gain.value = opts.growl ? p0 * 0.08 * opts.growl : 3;
        vib.connect(vibg).connect(src.frequency);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, t);
        env.gain.exponentialRampToValueAtTime(0.7, t + 0.03);
        env.gain.setValueAtTime(0.7, t + dur * 0.7);
        env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        const seq = vow.split('');
        VOWELS[seq[0]].forEach((f, idx) => {
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass'; bp.Q.value = idx === 0 ? 6 : 10;
          bp.frequency.setValueAtTime(f, t);
          if (seq[1]) bp.frequency.linearRampToValueAtTime(VOWELS[seq[1]][idx], t + dur * 0.6);
          const fg = ctx.createGain();
          fg.gain.value = [1.0, 0.55, 0.25][idx] * (seq[0] === 'm' && idx > 0 ? 0.25 : 1);
          src.connect(bp).connect(fg).connect(env);
        });
        env.connect(out);
        if (opts.breath) {
          const n = this._noiseSrc(t, dur);
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass'; bp.frequency.value = 1600; bp.Q.value = 0.8;
          const ng = ctx.createGain();
          this._env(ng.gain, t, 0.01, 0.25 * opts.breath, dur * 0.5);
          n.connect(bp).connect(ng).connect(out);
        }
        src.start(t); vib.start(t);
        src.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
        t += dur;
      }
      this.voiceBusyUntil = t + 0.15;
      this.active.push({ cat: 'voice', pri: PRI.voice, start: t0, end: t, stop: () => out.gain.setTargetAtTime(0, ctx.currentTime, 0.02) });
    } catch (e) { this.stats.errors++; }
  }

  // The scaffold giggling. kind: 'titter' (two quiet little "hehe"s), 'giggle', 'burst' (a quick,
  // high burst ending on a squeal), 'fit' (a longer fit with breaths in between). The old names
  // still work: chuckle → titter, cackle → burst. { distant: true } is the giggle from somewhere
  // else in the frame: muffled, quieter, far off to one side. Only one giggle at a time; while it
  // plays the effects are ducked a little so it can be heard over the clatter.
  laugh(pos, kind = 'giggle', { vol = 1, distant = false } = {}) {
    if (!this.ready || this._throttle('laugh', 900)) return 0;
    kind = { chuckle: 'titter', cackle: 'burst' }[kind] || kind;
    if (!GIGGLES[kind]) kind = 'giggle';
    if (!this.bank[kind]) return 0;
    const base = { titter: 0.75, giggle: 0.95, burst: 1.05, fit: 1.1 }[kind];
    const len = this._play(kind, pos, { vol: base * vol * (distant ? 0.45 : 1), rate: 0.94 + Math.random() * 0.12, cat: 'laugh', pri: PRI.laugh, bus: this.vox, lowpass: distant ? 1900 : 0 });
    if (!len) return 0;
    const t = this.ctx.currentTime, gn = this.sfx.gain;
    gn.cancelScheduledValues(t); gn.setTargetAtTime(distant ? 0.8 : 0.55, t, 0.04); gn.setTargetAtTime(1, t + len, 0.25);
    this.stats.laughs++;
    this.stats.laughLog.push(`${kind}${distant ? ' (distant)' : ''} ${len.toFixed(2)}s`);
    if (this.stats.laughLog.length > 40) this.stats.laughLog.shift();
    return len;
  }

  // ---------- ambience, and keeping the audio healthy ----------
  _startAmbience() {
    const ctx = this.ctx;
    const n = ctx.createBufferSource();
    n.buffer = this.noise; n.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 380;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.05;
    n.connect(lp).connect(this.windGain).connect(this.amb);
    n.start();
    this.birdLevel = 1;
  }

  // Birds sing while the courtyard is orderly and fall silent as chaos grows. Also watches the
  // audio thread: if its clock falls behind real time, low-priority sounds are shed for a while.
  updateAmbience(dt, chaos) {
    if (!this.ctx) return;
    const now = performance.now();
    if (this._wantResume && now - (this._lastResume || 0) > 2500) { this._lastResume = now; this.ctx.resume().then(() => { this._wantResume = false; }).catch(() => {}); }
    if (!this.ready) return;
    const c = this._clock;
    if (!c) this._clock = { a: this.ctx.currentTime, p: now };
    else if (now - c.p > 500) {
      const ratio = (this.ctx.currentTime - c.a) / ((now - c.p) / 1000);
      this.clockRatio = ratio;
      if (ratio < 0.85 && document.visibilityState === 'visible') this.overloadUntil = now + 2000;
      this._clock = { a: this.ctx.currentTime, p: now };
    }
    this.birdLevel = Math.max(0, 1 - chaos * 1.6);
    this.windGain.gain.setTargetAtTime(0.04 + chaos * 0.08, this.ctx.currentTime, 0.5);
    if (Math.random() < dt * 0.5 * this.birdLevel) this._chirp();
  }

  _chirp() {
    if (this.birdLevel < 0.05 || this._throttle('chirp', 300)) return;
    const ctx = this.ctx;
    const out = this._out(null, 0.05 * this.birdLevel, this.amb);
    let t = ctx.currentTime;
    const f = 2800 + Math.random() * 1800;
    const notes = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < notes; i++) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * (1.2 + Math.random() * 0.4), t + 0.06);
      const g = ctx.createGain();
      this._env(g.gain, t, 0.005, 0.8, 0.07);
      o.connect(g).connect(out);
      o.start(t); o.stop(t + 0.12);
      t += 0.09 + Math.random() * 0.05;
    }
  }

  // for testing: what is playing and what has been dropped
  report() {
    const now = this.ctx ? this.ctx.currentTime : 0;
    const act = this.active.filter(v => v.end > now);
    const by = {}; for (const v of act) by[v.cat] = (by[v.cat] || 0) + 1;
    return { state: this.ctx?.state, active: act.length, by, clockRatio: this.clockRatio, bank: Object.fromEntries(Object.entries(this.bank).map(([k, v]) => [k, v.length])), ...this.stats };
  }
}
