// The walking scaffolding: in a rare session the lattice pulls itself together into one creature
// and walks off. It is built from the same parts as the scaffold (steel tubes, knuckle couplers,
// wooden decks): a two-bay lattice body, a one-bay head with eyes, and four legs, each two
// stacked lattice segments joined at a knee. The legs walk with a trot (diagonal pairs), planted
// feet and two-bone IK; the body bobs and sways, the head looks at whoever is nearest. It stands
// up from a crouch first, so the transformation reads.
import * as THREE from 'three';
import { toon, PAL } from './toon.js';
import { markInk } from './render.js';

const UP = new THREE.Vector3(0, 1, 0);

// tubes along the edges of a w × h × d box divided into cells, plus face diagonals
function frame(w, h, d, nx, ny, nz, brace = true) {
  const T = [];
  const xs = [...Array(nx + 1)].map((_, i) => -w / 2 + w * i / nx);
  const ys = [...Array(ny + 1)].map((_, i) => h * i / ny);
  const zs = [...Array(nz + 1)].map((_, i) => -d / 2 + d * i / nz);
  for (const x of xs) for (const z of zs) T.push([[x, 0, z], [x, h, z], 0.06]);
  for (const y of ys) {
    for (const z of zs) T.push([[-w / 2, y, z], [w / 2, y, z], 0.05]);
    for (const x of xs) T.push([[x, y, -d / 2], [x, y, d / 2], 0.05]);
  }
  if (brace) for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) { const f = (i + j) % 2; T.push([[xs[i + f], ys[j], d / 2], [xs[i + 1 - f], ys[j + 1], d / 2], 0.045], [[xs[i + f], ys[j], -d / 2], [xs[i + 1 - f], ys[j + 1], -d / 2], 0.045]); }
    for (let k = 0; k < nz; k++) { const f = (k + j) % 2; T.push([[w / 2, ys[j], zs[k + f]], [w / 2, ys[j + 1], zs[k + 1 - f]], 0.045], [[-w / 2, ys[j], zs[k + f]], [-w / 2, ys[j + 1], zs[k + 1 - f]], 0.045]); }
  }
  return T;
}

export class Walker {
  constructor(scene, audio, fx, pos, heading = 0) {
    this.scene = scene; this.audio = audio; this.fx = fx;
    this.pos = pos.clone(); this.heading = heading; this.t = 0;
    this.stand = 0;                      // 0 crouched … 1 standing
    this.path = []; this.speed = 1.7; this.done = false; this.buttT = -1;
    this.L1 = 4.2; this.L2 = 4.2;        // thigh and shin
    this.bodyH = 6.4;
    // parts in local space: body, head, and a leg segment (along +y, 0..1 scaled to its length)
    this.parts = [];
    const add = (tubes, group) => tubes.forEach(([a, b, r]) => this.parts.push({ a: new THREE.Vector3(...a), b: new THREE.Vector3(...b), r, group }));
    add(frame(6, 2, 4, 3, 1, 2), 'body');
    add(frame(2.2, 2, 2.2, 1, 1, 1).map(([a, b, r]) => [[a[0], a[1] + 1.6, a[2] + 2.9], [b[0], b[1] + 1.6, b[2] + 2.9], r]), 'body');  // the head, up front
    add([[[0, 1.6, 2.0], [0, 2.4, 1.8], 0.07], [[-0.8, 2, 1.95], [-0.8, 1.6, 1.8], 0.06], [[0.8, 2, 1.95], [0.8, 1.6, 1.8], 0.06]], 'body'); // the neck
    for (let leg = 0; leg < 4; leg++) for (const seg of ['thigh', 'shin']) add(frame(0.9, 1, 0.9, 1, 2, 1), `${seg}${leg}`);
    const tubeGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    this.tubes = new THREE.InstancedMesh(tubeGeo, toon(PAL.steel), this.parts.length);
    this.tubes.castShadow = true; this.tubes.frustumCulled = false;
    // decks on the body, knuckles at the knees, feet
    this.decks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), toon('#c98a4b'), 6);
    this.knots = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), toon('#3a3f58'), 16);
    this.decks.castShadow = this.knots.castShadow = true;
    this.decks.frustumCulled = this.knots.frustumCulled = false;
    // the eyes: big, round, a bit mad
    this.eyes = new THREE.Group();
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.SphereGeometry(0.55, 18, 12), toon('#fbf3e2'));
      w.position.set(s * 0.55, 2.6, 4.05); w.scale.set(1, 1.15, 0.7);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), new THREE.MeshBasicMaterial({ color: '#1d1830' }));
      p.position.z = 0.42; w.add(p);
      w.userData.pupil = p;
      this.eyes.add(w);
    }
    this.root = new THREE.Group();
    this.root.add(this.tubes, this.decks, this.knots);
    markInk(this.root);
    scene.add(this.root, this.eyes);
    // legs: hip offsets on the body's corners, planted feet
    this.hips = [[-2.8, 0, 1.8], [2.8, 0, 1.8], [-2.8, 0, -1.8], [2.8, 0, -1.8]].map(a => new THREE.Vector3(...a));
    this.feet = this.hips.map(h => this._toWorld(h.clone().multiplyScalar(1.25)).setY(0));
    this.from = this.feet.map(f => f.clone());
    this.to = this.feet.map(f => f.clone());
    this.swing = [0, 0, 0, 0];
    this.gait = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._a = new THREE.Vector3(); this._b = new THREE.Vector3();
    this.lookAt = null;
    this.update(0);
  }

  _toWorld(v) {
    return v.clone().applyAxisAngle(UP, this.heading).add(this.pos);
  }
  _bodyMatrix(out) {
    const bob = Math.sin(this.gait * Math.PI * 4) * 0.18 * this.stand;
    const roll = Math.sin(this.gait * Math.PI * 2) * 0.05 * this.stand;
    // a head-butt: rear up, then lunge forward and down (headbutt())
    const b = this.buttT >= 0 ? this.buttT : -1;
    const rear = b < 0 ? 0 : b < 0.35 ? b / 0.35 : Math.max(0, 1 - (b - 0.35) / 0.15);
    const lunge = b < 0.35 ? 0 : Math.sin(Math.min(1, (b - 0.35) / 0.6) * Math.PI);
    const y = 1.4 + (this.bodyH - 1.4) * this.stand + bob + rear * 0.8 - lunge * 0.9;
    this._q.setFromEuler(new THREE.Euler(0.03 * Math.sin(this.t * 1.3) - rear * 0.35 + lunge * 0.3, this.heading, roll, 'YXZ'));
    const fwd = lunge * 1.8;
    return out.compose(new THREE.Vector3(this.pos.x + Math.sin(this.heading) * fwd, y, this.pos.z + Math.cos(this.heading) * fwd), this._q, new THREE.Vector3(1, 1, 1));
  }

  // a tube from a to b (world) into instance n
  _tube(n, a, b, r) {
    const dir = this._v.copy(b).sub(a); const len = dir.length();
    this._q.setFromUnitVectors(UP, dir.divideScalar(Math.max(1e-5, len)));
    this._m.compose(this._a.copy(a).addScaledVector(dir, len / 2), this._q, this._b.set(r, len, r));
    this.tubes.setMatrixAt(n, this._m);
  }

  headbutt() { this.buttT = 0; }

  update(dt) {
    this.t += dt;
    if (this.buttT >= 0) { this.buttT += dt; if (this.buttT > 1.0) this.buttT = -1; }
    const moving = this.stand >= 1 && this.path.length > 0;
    if (moving) {
      const tgt = this.path[0];
      const d = this._v.set(tgt.x - this.pos.x, 0, tgt.z - this.pos.z);
      const dist = d.length();
      if (dist < 1) this.path.shift();
      else {
        const want = Math.atan2(d.x, d.z);
        let dh = want - this.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        this.heading += dh * Math.min(1, dt * 1.2);
        const step = Math.min(dist, this.speed * dt * (Math.abs(dh) > 0.8 ? 0.3 : 1));
        this.pos.x += Math.sin(this.heading) * step; this.pos.z += Math.cos(this.heading) * step;
      }
      if (!this.path.length) this.done = true;
    }
    // gait: trot, diagonal pairs (0,3) and (1,2); each foot swings to a spot ahead of its hip
    const period = 1.25;
    if (moving || this.stand < 1) this.gait += dt / period;
    for (let i = 0; i < 4; i++) {
      const phase = (this.gait + (i === 0 || i === 3 ? 0 : 0.5)) % 1;
      const swingNow = phase < 0.45 && (moving || this.stand < 1);
      if (swingNow && !this.swing[i]) {
        this.swing[i] = 1;
        this.from[i].copy(this.feet[i]);
        const ahead = moving ? 1.6 : 0;
        this.to[i].copy(this._toWorld(this.hips[i].clone().multiplyScalar(1.25).add(new THREE.Vector3(0, 0, ahead)))).setY(0);
      }
      if (this.swing[i]) {
        const k = Math.min(1, phase / 0.45);
        this.feet[i].lerpVectors(this.from[i], this.to[i], k);
        this.feet[i].y = Math.sin(k * Math.PI) * 1.1;
        if (k >= 1 || !swingNow) {
          this.swing[i] = 0; this.feet[i].copy(this.to[i]).setY(0);
          if (this.stand > 0.5) { this.audio.clank(this.feet[i], { heavy: true, pitch: 0.6 + i * 0.05, vol: 0.45 }); this.fx.dust(this.feet[i].clone().setY(0.3), 3, 1.6); }
        }
      }
    }
    // body + head
    const M = this._bodyMatrix(new THREE.Matrix4());
    let n = 0;
    for (const p of this.parts) {
      if (p.group !== 'body') continue;
      this._tube(n++, this._a.copy(p.a).applyMatrix4(M).clone(), this._b.copy(p.b).applyMatrix4(M).clone(), p.r);
    }
    const deckM = new THREE.Matrix4();
    [[0, 0.05, 0, 5.9, 0.1, 3.9], [0, 2.0, 0, 5.9, 0.1, 3.9], [0, 1.65, 2.9, 2.1, 0.1, 2.1]].forEach(([x, y, z, sx, sy, sz], i) => {
      deckM.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz)).premultiply(M);
      this.decks.setMatrixAt(i, deckM);
    });
    // legs with two-bone IK; knees bend up and outwards like a big insect
    let kn = 0;
    for (let i = 0; i < 4; i++) {
      const hip = this.hips[i].clone().applyMatrix4(M);
      const foot = this.feet[i];
      const hf = this._v.copy(foot).sub(hip);
      const d = Math.min(hf.length(), this.L1 + this.L2 - 0.01);
      hf.normalize();
      const out = hip.clone().sub(new THREE.Vector3().setFromMatrixPosition(M)).setY(0).normalize();
      const bend = out.clone().add(UP).addScaledVector(hf, -out.clone().add(UP).dot(hf)).normalize();
      const a = (this.L1 * this.L1 - this.L2 * this.L2 + d * d) / (2 * d);
      const h = Math.sqrt(Math.max(0, this.L1 * this.L1 - a * a));
      const knee = hip.clone().addScaledVector(hf, a).addScaledVector(bend, h);
      const footP = hip.clone().addScaledVector(hf, d);
      for (const [seg, s0, s1] of [['thigh', hip, knee], ['shin', knee, footP]]) {
        // orient the segment frame along s0 → s1
        const dir = s1.clone().sub(s0); const len = dir.length();
        const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
        const SM = new THREE.Matrix4().compose(s0, q, new THREE.Vector3(1, len, 1));
        for (const p of this.parts) {
          if (p.group !== seg + i) continue;
          this._tube(n++, p.a.clone().applyMatrix4(SM), p.b.clone().applyMatrix4(SM), p.r);
        }
      }
      for (const [pt, r] of [[hip, 0.35], [knee, 0.42]]) { this._m.compose(pt, new THREE.Quaternion(), new THREE.Vector3(r, r, r)); this.knots.setMatrixAt(kn++, this._m); }
      this._m.compose(footP.clone().setY(Math.max(0.15, footP.y)), new THREE.Quaternion(), new THREE.Vector3(0.6, 0.25, 0.6)); this.knots.setMatrixAt(kn++, this._m);
    }
    this.tubes.instanceMatrix.needsUpdate = this.decks.instanceMatrix.needsUpdate = this.knots.instanceMatrix.needsUpdate = true;
    // eyes ride on the head, pupils follow someone, blink now and then
    this.eyes.matrixAutoUpdate = false;
    this.eyes.matrix.copy(M);
    this.eyes.matrixWorldNeedsUpdate = true;
    const blink = (this.t % 3.7) < 0.12 ? 0.1 : 1;
    for (const e of this.eyes.children) {
      e.scale.set(1, 1.15 * blink, 0.7);
      if (this.lookAt) {
        const local = this.lookAt.clone().applyMatrix4(new THREE.Matrix4().copy(M).invert()).sub(e.position).normalize();
        e.userData.pupil.position.set(local.x * 0.32, local.y * 0.32, 0.42);
      }
    }
  }

  get center() { return this.pos.clone().setY(this.bodyH * this.stand + 1); }

  dispose() { this.scene.remove(this.root, this.eyes); }
}
