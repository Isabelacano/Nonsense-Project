// Comic visual effects: symbols over the worker's head, onomatopoeia, dust,
// flying tubes, glass shards and rubble chunks. All short-lived and pooled.
import * as THREE from 'three';
import { dustTexture, wordTexture, symbolTexture } from './textures.js';
import { toon } from './toon.js';

const DEBRIS_COLORS = {
  plaster: ['#f1d48e', '#e7c47c', '#e6d6b2'],
  slate: ['#c2543a', '#b0482f', '#8f3a2a'], // roof tiles
};

export class FX {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.items = [];
    this.wordCache = new Map();
    this.symbols = {};
    for (const k of ['drop', 'vein', 'star', 'steam']) this.symbols[k] = symbolTexture(k);
    this.dustTex = dustTexture();
    this.tubeGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 6);
    this.tubeMat = toon('#7f93d2');
    this.chunkGeo = new THREE.BoxGeometry(1, 1, 1);
    this.chunkMats = {};
    for (const [k, list] of Object.entries(DEBRIS_COLORS)) {
      this.chunkMats[k] = list.map(c => toon(c));
    }
    this.shardGeo = new THREE.PlaneGeometry(0.25, 0.35);
    this.shardMat = new THREE.MeshBasicMaterial({ color: '#d6e6ee', transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    this.ringGeo = new THREE.RingGeometry(0.85, 1, 40);
    this.ringGeo.rotateX(-Math.PI / 2);
    this.shakeAmount = 0;
    this.onTubeLand = null;
  }

  _add(obj, life, update, onEnd) {
    // sprites, dust and glints live on layer 1: coloured, but never ink-outlined
    if (obj.isSprite || obj.material?.transparent) obj.layers.set(1);
    this.scene.add(obj);
    this.items.push({ obj, life, age: 0, update, onEnd });
    return obj;
  }

  _word(text, color) {
    const key = text + color;
    if (!this.wordCache.has(key)) this.wordCache.set(key, wordTexture(text, { fill: color }));
    return this.wordCache.get(key);
  }

  _sprite(tex, size) {
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
    const s = new THREE.Sprite(mat);
    s.renderOrder = 10;
    const a = tex.userData.aspect || 1;
    s.scale.set(size * a, size, 1);
    s.userData.base = s.scale.clone();
    return s;
  }

  // Onomatopoeia popping out of the world: KLONK!, CRASH!, …
  word(pos, text, { color = '#d9573b', size = 1.2, life = 0.9, rise = 1.2 } = {}) {
    const s = this._sprite(this._word(text, color), size);
    s.position.copy(pos);
    s.material.rotation = (Math.random() - 0.5) * 0.5;
    return this._add(s, life, (it, dt) => {
      const t = it.age / it.life;
      const pop = t < 0.15 ? 0.3 + (t / 0.15) * 0.95 : 1.25 - Math.min(0.25, (t - 0.15) * 1.5);
      s.scale.copy(s.userData.base).multiplyScalar(pop);
      s.position.y += rise * dt;
      s.material.opacity = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
    });
  }

  // Symbol attached to a moving anchor (the worker's head).
  symbol(anchor, kind, { size = 0.8, life = 1.3, offset = new THREE.Vector3(0, 0.6, 0) } = {}) {
    let tex;
    if (kind === '!') tex = this._word('!', '#d9573b');
    else if (kind === '?') tex = this._word('?', '#3456a8');
    else if (kind === '!?') tex = this._word('?!', '#e8b23a');
    else if (kind === 'grawlix') tex = this._word('#@%!', '#d9573b');
    else tex = this.symbols[kind];
    const s = this._sprite(tex, size);
    const wob = Math.random() * 6;
    return this._add(s, life, (it, dt) => {
      const t = it.age / it.life;
      anchor.getWorldPosition(s.position);
      s.position.add(offset);
      const pop = t < 0.12 ? 0.2 + t / 0.12 : 1 + Math.sin(it.age * 14 + wob) * 0.05;
      s.scale.copy(s.userData.base).multiplyScalar(pop);
      s.material.rotation = Math.sin(it.age * 9 + wob) * 0.12;
      s.material.opacity = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
    });
  }

  sweat(anchor, n = 3) {
    for (let i = 0; i < n; i++) {
      const s = this._sprite(this.symbols.drop, 0.28);
      const vel = new THREE.Vector3((Math.random() - 0.5) * 3, 2.5 + Math.random() * 1.5, (Math.random() - 0.5) * 3);
      let started = false;
      this._add(s, 0.9, (it, dt) => {
        if (!started) { anchor.getWorldPosition(s.position); s.position.y += 0.25; started = true; }
        vel.y -= 9 * dt;
        s.position.addScaledVector(vel, dt);
        s.material.opacity = 1 - it.age / it.life;
      });
    }
  }

  steam(anchor) {
    const s = this._sprite(this.symbols.steam, 0.55);
    const side = Math.random() < 0.5 ? -1 : 1;
    let off = 0;
    this._add(s, 0.8, (it, dt) => {
      off += dt;
      anchor.getWorldPosition(s.position);
      s.position.y += 0.35 + off * 1.4;
      s.position.x += side * (0.25 + off * 0.6);
      s.scale.copy(s.userData.base).multiplyScalar(0.6 + off * 1.2);
      s.material.opacity = 1 - it.age / it.life;
    });
  }

  // Cartoon stars circling a dazed head.
  stars(anchor, life = 1.4) {
    for (let i = 0; i < 3; i++) {
      const s = this._sprite(this.symbols.star, 0.3);
      this._add(s, life, (it) => {
        const a = it.age * 7 + i * (Math.PI * 2 / 3);
        anchor.getWorldPosition(s.position);
        s.position.x += Math.cos(a) * 0.45;
        s.position.z += Math.sin(a) * 0.45;
        s.position.y += 0.35 + Math.sin(a * 2) * 0.05;
        s.material.opacity = it.age > life - 0.3 ? (life - it.age) / 0.3 : 1;
      });
    }
  }

  dust(pos, n = 6, spread = 1.5, color = '#efe0c8') {
    for (let i = 0; i < n; i++) {
      const mat = new THREE.SpriteMaterial({ map: this.dustTex, color, transparent: true, depthWrite: false, opacity: 0.85, fog: false });
      const s = new THREE.Sprite(mat);
      s.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * spread, Math.random() * spread * 0.3, (Math.random() - 0.5) * spread));
      const vel = new THREE.Vector3((Math.random() - 0.5) * spread, 0.4 + Math.random() * spread * 0.5, (Math.random() - 0.5) * spread);
      const size0 = 0.4 + spread * 0.35 * Math.random() + spread * 0.25;
      const life = 1.2 + Math.random() * 1.2 + spread * 0.2;
      mat.rotation = Math.random() * 6;
      this._add(s, life, (it, dt) => {
        const t = it.age / it.life;
        s.position.addScaledVector(vel, dt);
        vel.multiplyScalar(Math.exp(-dt * 1.5));
        const sc = size0 * (1 + t * 1.8);
        s.scale.set(sc, sc, 1);
        mat.opacity = 0.85 * (1 - t);
      });
    }
  }

  ring(pos, radius = 4) {
    const mat = new THREE.MeshBasicMaterial({ color: '#fbf1dc', transparent: true, opacity: 0.7, depthWrite: false });
    const m = new THREE.Mesh(this.ringGeo, mat);
    m.position.copy(pos); m.position.y = 0.05;
    this._add(m, 0.6, (it) => {
      const t = it.age / it.life;
      const r = 0.5 + t * radius;
      m.scale.set(r, 1, r);
      mat.opacity = 0.7 * (1 - t);
    });
  }

  // Rubble chunks bouncing on the paving.
  chunks(pos, n = 6, kind = 'plaster', rotY = 0) {
    const out = new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY));
    for (let i = 0; i < n; i++) {
      const mats = this.chunkMats[kind] || this.chunkMats.plaster;
      const m = new THREE.Mesh(this.chunkGeo, mats[i % mats.length]);
      const s = 0.12 + Math.random() * 0.4;
      m.scale.set(s, s * (0.5 + Math.random() * 0.6), s * (0.6 + Math.random() * 0.6));
      m.castShadow = true;
      m.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.5, (Math.random() - 0.5)));
      const vel = out.clone().multiplyScalar(1 + Math.random() * 3).add(new THREE.Vector3((Math.random() - 0.5) * 4, 1 + Math.random() * 3, (Math.random() - 0.5) * 4));
      const spin = new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8);
      const life = 5 + Math.random() * 4;
      this._add(m, life, (it, dt) => {
        if (m.position.y > s * 0.3 || vel.y > 0) {
          vel.y -= 16 * dt;
          m.position.addScaledVector(vel, dt);
          m.rotation.x += spin.x * dt; m.rotation.y += spin.y * dt; m.rotation.z += spin.z * dt;
          if (m.position.y < s * 0.3) {
            m.position.y = s * 0.3;
            vel.y = Math.abs(vel.y) > 2 ? -vel.y * 0.3 : 0;
            vel.x *= 0.5; vel.z *= 0.5; spin.multiplyScalar(0.4);
          }
        }
        if (it.life - it.age < 1) m.position.y -= dt * 0.4; // sink away quietly
      });
    }
  }

  shards(pos, rotY = 0) {
    const out = new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY));
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(this.shardGeo, this.shardMat);
      m.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0)).addScaledVector(out, 0.3);
      const vel = out.clone().multiplyScalar(1 + Math.random() * 3).add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2));
      const spin = new THREE.Vector3(Math.random() * 10, Math.random() * 10, 0);
      m.scale.setScalar(0.4 + Math.random());
      this._add(m, 1.8, (it, dt) => {
        vel.y -= 14 * dt;
        m.position.addScaledVector(vel, dt);
        m.rotation.x += spin.x * dt; m.rotation.y += spin.y * dt;
        if (m.position.y < 0.02) { m.position.y = 0.02; vel.set(0, 0, 0); spin.set(0, 0, 0); }
      });
    }
  }

  // Tubes yanked off a dismantled bay fly away and clatter on the ground.
  tube(a, b, vel) {
    const m = new THREE.Mesh(this.tubeGeo, this.tubeMat);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const dir = b.clone().sub(a);
    m.position.copy(mid);
    m.scale.set(1, dir.length(), 1);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    m.castShadow = true;
    m.userData.ink = true;   // flying scaffold tubes keep their outline
    const spin = new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9);
    let bounces = 0;
    this._add(m, 2.4, (it, dt) => {
      vel.y -= 16 * dt;
      m.position.addScaledVector(vel, dt);
      m.rotation.x += spin.x * dt; m.rotation.y += spin.y * dt; m.rotation.z += spin.z * dt;
      if (m.position.y < 0.1) {
        m.position.y = 0.1;
        if (vel.y < -1.5 && bounces < 2) { bounces++; this.onTubeLand && this.onTubeLand(m.position); }
        vel.y = -vel.y * 0.35; vel.x *= 0.6; vel.z *= 0.6; spin.multiplyScalar(0.5);
      }
      const t = it.age / it.life;
      if (t > 0.7) m.scale.x = m.scale.z = Math.max(0.01, 1 - (t - 0.7) / 0.3);
    });
  }

  shake(amount) { this.shakeAmount = Math.min(1.2, this.shakeAmount + amount); }

  update(dt) {
    this.shakeAmount *= Math.exp(-dt * 5);
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.age += dt;
      if (it.age >= it.life) {
        this.scene.remove(it.obj);
        if (it.obj.isSprite) it.obj.material.dispose();
        else if (it.obj.material && it.obj.material.transparent && it.obj.material !== this.shardMat) it.obj.material.dispose();
        this.items.splice(i, 1);
        continue;
      }
      it.update(it, dt);
    }
  }
}
