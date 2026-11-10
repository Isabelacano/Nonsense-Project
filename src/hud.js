// DOM overlay: hearts (nerves), inked counters, stage tag, inventory-style slots
// (tempo, stage, sound), prompts, banner, speech bubbles over the workers' heads
// and the dark foreground foliage frame.
import * as THREE from 'three';
import { STAGES } from './config.js';

const $ = (id) => document.getElementById(id);
const TEMPO_ICON = { run: '#i-bolt', sneak: '#i-snail', walk: '#i-boot', idle: '#i-pause' };
const TEMPO_TAB = { run: 'rushing', sneak: 'careful', walk: 'normal', idle: 'waiting' };

export class HUD {
  constructor(audio) {
    this.audio = audio;
    this.el = {
      hud: $('hud'), stageNo: $('stageNo'), stageName: $('stageName'), stageHint: $('stageHint'), stageSlot: $('stageSlot'),
      barIntegrity: $('barIntegrity'), valIntegrity: $('valIntegrity'), valMood: $('valMood'),
      hearts: [...document.querySelectorAll('#hearts .heart')],
      valBays: $('valBays'), valAttempts: $('valAttempts'), valCrew: $('valCrew'),
      tempo: $('tempo'), tempoVal: $('tempoVal'), tempoMode: $('tempoMode'), tempoIcon: $('tempoIcon').querySelector('use'),
      prompt: $('prompt'), banner: $('banner'), bannerNo: $('bannerNo'), bannerName: $('bannerName'),
      mute: $('mute'), muteVal: $('muteVal'), keys: $('keys'), end: $('end'), endStats: $('endStats'),
    };
    this.el.mute.addEventListener('click', () => this.toggleMute());
    this._syncMute();
    this.last = {};
    this.bubbles = [];
    this.bubbleLayer = $('bubbles');
    this._v = new THREE.Vector3();
    this.frame = $('frame');
    this._drawFrame();
    window.addEventListener('resize', () => this._drawFrame());
  }

  show() { this.el.hud.hidden = false; }

  toggleMute() {
    this.audio.unlock();
    this.audio.setMuted(!this.audio.muted);
    this._syncMute();
  }

  _syncMute() {
    this.el.mute.setAttribute('aria-pressed', String(this.audio.muted));
    this.el.muteVal.textContent = this.audio.muted ? 'off' : 'on';
  }

  toggleKeys() { this.el.keys.hidden = !this.el.keys.hidden; }

  setStage(i, announce = true, override = {}) {
    const s = { ...STAGES[i], ...(override.name ? { name: override.name, hint: override.hint || STAGES[i].hint } : {}) };
    this.el.stageNo.textContent = i < 5 ? `Stage ${i + 1} / 5` : 'Final state';
    this.el.stageName.textContent = s.name;
    this.el.stageHint.textContent = s.hint;
    this.el.stageSlot.textContent = i < 5 ? `${i + 1}/5` : 'end';
    if (announce) {
      const b = this.el.banner;
      b.hidden = true;
      void b.offsetWidth; // restart the CSS animation
      this.el.bannerNo.textContent = i < 5 ? `Stage ${i + 1}` : 'The end';
      this.el.bannerName.textContent = s.name;
      b.hidden = false;
    }
  }

  // Only touch the DOM when a value actually changed.
  _set(key, el, prop, value) {
    if (this.last[key] === value) return;
    this.last[key] = value;
    if (prop === 'text') el.textContent = value; else el.style[prop] = value;
  }

  update({ integrity, stress, mood, bays, attempts, tempo, mode, canDismantle, crew = 1 }) {
    const e = this.el;
    const pct = Math.round(integrity * 100);
    this._set('int', e.barIntegrity, 'width', pct + '%');
    this._set('intv', e.valIntegrity, 'text', pct + '%');
    // nerves as hearts: each one breaks as stress rises
    const full = Math.max(0, Math.ceil((1 - stress) * 5 - 0.001));
    if (this.last.hearts !== full) {
      e.hearts.forEach((h, i) => {
        const empty = i >= full;
        if (empty !== h.classList.contains('empty')) {
          h.classList.toggle('empty', empty);
          h.classList.remove('beat'); void h.getBoundingClientRect(); h.classList.add('beat');
        }
      });
      this.last.hearts = full;
    }
    this._set('mood', e.valMood, 'text', mood);
    this._set('bays', e.valBays, 'text', String(bays));
    this._set('att', e.valAttempts, 'text', String(attempts));
    if (this.last.crew !== crew) {
      this.last.crew = crew;
      e.valCrew.textContent = String(crew);
      const c = e.valCrew.parentElement;
      c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump');
    }
    this._set('tv', e.tempoVal, 'text', '×' + tempo.toFixed(tempo < 1 ? 2 : 1));
    this._set('tm', e.tempoMode, 'text', TEMPO_TAB[mode] || mode);
    if (this.last.mode !== mode) {
      this.last.mode = mode;
      e.tempoIcon.setAttribute('href', TEMPO_ICON[mode] || '#i-pause');
      e.tempo.className = 'slot' + (mode === 'run' ? ' run' : mode === 'sneak' ? ' sneak' : '');
    }
    if (this.last.pr !== canDismantle) { this.last.pr = canDismantle; e.prompt.hidden = !canDismantle; }
  }

  showEnd(stats, card = null) {
    this.el.endStats.textContent = stats;
    if (card) for (const [id, v] of [['endTitle', card.title], ['endSub', card.sub], ['endQuote', card.quote]]) { const el = document.getElementById(id); if (el && v) el.textContent = v; }
    this.el.end.hidden = false;
  }
  hideEnd() { this.el.end.hidden = true; }

  // explore mode: the key panel shows the camera controls instead
  setExplore(on) {
    this.setCinematic(false);
    this.el.hud.classList.toggle('exploring', on);
    this.el.keys.hidden = false;
    this.el.keys.innerHTML = on
      ? '<div><kbd>drag</kbd> orbit · <kbd>wheel</kbd> zoom</div><div><kbd>right-drag</kbd> / <kbd>←↑↓→</kbd> pan · <kbd>Q</kbd><kbd>E</kbd> down / up</div><div><kbd>Shift</kbd> faster · <kbd>R</kbd> new shift</div>'
      : this.el.keys.innerHTML;
  }

  // A speech bubble that follows a worker's head. Lines in capitals are shouted.
  bubble(worker, text, { dur = 2.4 } = {}) {
    for (const b of this.bubbles) if (b.worker === worker) this._dropBubble(b);
    const el = document.createElement('div');
    const gib = !/[a-z]{2}/i.test(text.replace(/GAAAH/g, ''));            // symbol-swearing
    const shout = !gib && text === text.toUpperCase() && /[A-Z]/.test(text);
    const punch = text.startsWith("They don't pay");
    el.className = 'bubble in' + (shout ? ' shout' : '') + (gib ? ' gib' : '') + (punch ? ' punch' : '');
    const name = document.createElement('b'); name.textContent = worker.name;
    el.append(name, document.createTextNode(text));
    el.style.rotate = ((Math.random() - 0.5) * 5).toFixed(1) + 'deg';
    this.bubbleLayer.append(el);
    this.bubbles.push({ worker, el, t: 0, dur });
  }

  clearBubbles() { for (const b of this.bubbles) this._dropBubble(b); this.bubbles.length = 0; }

  // The ending plays like a little film: gameplay clutter steps aside.
  setCinematic(on) { this.el.hud.classList.toggle('cinematic', on); }

  _dropBubble(b) {
    b.el.classList.remove('in'); b.el.classList.add('out');
    b.dead = true;
    setTimeout(() => b.el.remove(), 300);
  }

  updateBubbles(camera, dt = 1 / 60) {
    const W = window.innerWidth, H = window.innerHeight;
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.t += dt;
      if (b.dead) { this.bubbles.splice(i, 1); continue; }
      if (b.t > b.dur || !b.worker.root.visible) { this._dropBubble(b); this.bubbles.splice(i, 1); continue; }
      const p = b.worker.head.getWorldPosition(this._v).project(camera);
      const hide = p.z > 1;
      b.x = (p.x * 0.5 + 0.5) * W; b.y = (-p.y * 0.5 + 0.5) * H - 22;
      b.hide = hide;
    }
    // keep bubbles from sitting on top of each other: nudge later ones upwards
    const live = this.bubbles.filter(b => !b.dead && !b.hide);
    for (let i = 0; i < live.length; i++) {
      const a = live[i];
      a.w = a.w || a.el.offsetWidth; a.h = a.h || a.el.offsetHeight;
      for (let j = 0; j < i; j++) {
        const o = live[j];
        if (Math.abs(a.x - o.x) < (a.w + o.w) / 2 + 4 && Math.abs(a.y - o.y) < (a.h + o.h) / 2 + 2) a.y = o.y - o.h - 6;
      }
    }
    for (const b of this.bubbles) {
      if (b.dead || b.x === undefined) continue;
      b.el.style.transform = `translate(${Math.round(b.x)}px, ${Math.round(b.y)}px) translate(-50%, -100%)`;
      b.el.style.visibility = b.hide ? 'hidden' : 'visible';
    }
  }

  // Dark leafy silhouettes in the lower corners, like the foreground layer of the reference.
  _drawFrame() {
    const c = this.frame, dpr = Math.min(window.devicePixelRatio, 2);
    const W = window.innerWidth, H = window.innerHeight;
    c.width = W * dpr; c.height = H * dpr;
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    let seed = 5;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const S = Math.min(W, H) / 720;
    const leaf = (x, y, r, a, col) => {
      g.save(); g.translate(x, y); g.rotate(a);
      g.beginPath();
      g.moveTo(0, -r); g.quadraticCurveTo(r * 0.75, 0, 0, r); g.quadraticCurveTo(-r * 0.75, 0, 0, -r);
      g.fillStyle = col; g.fill();
      g.restore();
    };
    const clump = (cx, cy, spread, n, dir) => {
      const cols = ['#1f3a36', '#25443d', '#2d4f45'];
      // solid base mass: overlapping blobs that get smaller toward the open side
      const blobs = [];
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const x = cx + dir * t * spread;
        const r = (1 - t * 0.75) * spread * (0.22 + rnd() * 0.14);
        const y = cy - r * (0.55 + rnd() * 0.5) * (1 - t * 0.5);
        blobs.push([x, y, r, cols[i % 3]]);
      }
      for (const [x, y, r, col] of blobs) {
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = col; g.fill();
      }
      // lighter rim on the upper-left of each blob: the two-tone bush of the reference
      for (const [x, y, r] of blobs) {
        g.save();
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.clip();
        g.beginPath(); g.arc(x - r * 0.12, y - r * 0.12, r * 0.98, Math.PI * 1.05, Math.PI * 1.6);
        g.strokeStyle = '#4f7d62'; g.lineWidth = r * 0.12; g.stroke();
        g.restore();
      }
      // leaves sticking out of the silhouette
      for (let i = 0; i < n * 3; i++) {
        const [x, y, r] = blobs[Math.floor(rnd() * blobs.length)];
        const a = -Math.PI / 2 + (rnd() - 0.5) * 2.4;
        leaf(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92, (10 + rnd() * 14) * S, a + Math.PI / 2, cols[i % 3]);
      }
      // grass blades
      g.lineCap = 'round';
      for (let i = 0; i < n * 2; i++) {
        const x = cx + dir * rnd() * spread * 1.05, y = cy - rnd() * 10 * S;
        const h = (25 + rnd() * 60) * S * (1 - Math.abs(x - cx) / (spread * 1.3));
        g.strokeStyle = cols[i % 3]; g.lineWidth = 3.2 * S;
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + dir * 5 * S, y - h * 0.6, x + dir * (rnd() * 16 - 5) * S, y - h); g.stroke();
      }
      // a few inked flowers
      const fl = ['#e7a0a8', '#fbf3e2', '#e8b23a', '#fbf3e2'];
      for (let i = 0; i < 6; i++) {
        const [bx, by, br] = blobs[1 + Math.floor(rnd() * (blobs.length - 2))];
        const x = bx + (rnd() - 0.5) * br, y = by - br * (0.3 + rnd() * 0.6);
        const r = (4 + rnd() * 4) * S;
        g.strokeStyle = '#2a2140'; g.lineWidth = 1.8 * S;
        for (let p = 0; p < 5; p++) {
          const a = p / 5 * Math.PI * 2;
          g.beginPath(); g.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.75, 0, Math.PI * 2);
          g.fillStyle = fl[i % 4]; g.fill(); g.stroke();
        }
        g.beginPath(); g.arc(x, y, r * 0.55, 0, Math.PI * 2); g.fillStyle = '#e8b23a'; g.fill(); g.stroke();
      }
    };
    clump(-30 * S, H + 30 * S, Math.min(W * 0.3, 400 * S), 14, 1);
    clump(W + 30 * S, H + 30 * S, Math.min(W * 0.33, 430 * S), 15, -1);
  }
}
