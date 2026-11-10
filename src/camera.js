// Third-person follow camera. Drag with the mouse to orbit, wheel to zoom.
// It rises as the scaffolding grows so the player can still read the space.
// Three modes share one controller:
//   follow   (default) orbits round the worker
//   fixed    a placed shot (the escape), set through `fixed = { pos, look }`
//   explore  after "Keep looking": free orbit round a free pivot, pan and zoom
import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);

export class FollowCamera {
  constructor(camera, dom) {
    this.cam = camera;
    this.yaw = 0;              // 0 = looking at the facade (−z)
    this.pitch = 0.36;
    this.dist = 11.5;
    this.extraHeight = 0;
    this.target = new THREE.Vector3();
    this.pos = new THREE.Vector3(0, 8, 20);
    this.shake = 0;
    this.fixed = null;
    this.explore = false;
    this.pivot = new THREE.Vector3();   // explore mode: the point the camera orbits
    this.input = null;                  // keyboard state (set by main), used for panning in explore mode
    this._drag = null;
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('pointerdown', (e) => {
      this._drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey };
      try { dom.setPointerCapture(e.pointerId); } catch { /* synthetic or already released pointer */ }
    });
    window.addEventListener('pointerup', () => { this._drag = null; });
    window.addEventListener('pointermove', (e) => {
      if (!this._drag) return;
      const dx = e.clientX - this._drag.x, dy = e.clientY - this._drag.y;
      this._drag.x = e.clientX; this._drag.y = e.clientY;
      if (this.explore && this._drag.pan) { this._pan(-dx * this.dist * 0.0016, dy * this.dist * 0.0016, 0); return; }
      this.yaw -= dx * 0.005;
      if (this.explore) {
        this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.004, -0.15, 1.5);
      } else {
        this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.004, 0.12, 1.2);
        this.yaw = THREE.MathUtils.clamp(this.yaw, -1.4, 1.4);
      }
    });
    dom.addEventListener('wheel', (e) => {
      const step = this.explore ? Math.max(1, this.dist * 0.12) : 1.2;
      this.dist = THREE.MathUtils.clamp(this.dist + Math.sign(e.deltaY) * step, this.explore ? 2.5 : 6, this.explore ? 140 : 30);
      e.preventDefault();
    }, { passive: false });
  }

  // Unit vectors for camera-relative movement.
  basis() {
    return {
      fwd: new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)),
      right: new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)),
    };
  }

  // Hand the current view over to free exploration, starting exactly where the camera is now.
  enterExplore() {
    const look = this.target.clone();
    const off = this.cam.position.clone().sub(look);
    this.dist = Math.max(4, off.length());
    this.yaw = Math.atan2(off.x, off.z);
    this.pitch = Math.asin(THREE.MathUtils.clamp(off.y / this.dist, -1, 1));
    this.pivot.copy(look);
    this.fixed = null;
    this.explore = true;
    this.extraHeight = 0;
  }

  // move the pivot: x along the screen's right, y straight up, z along the view direction (flattened)
  _pan(x, y, z) {
    const { fwd, right } = this.basis();
    this.pivot.addScaledVector(right, x).addScaledVector(UP, y).addScaledVector(fwd, z);
    this.pivot.y = THREE.MathUtils.clamp(this.pivot.y, 0, 40);
  }

  update(dt, focus, shake) {
    if (this.fixed) {
      // a placed shot (the escape): glide there and hold, looking at a point
      this.pos.lerp(this.fixed.pos, 1 - Math.exp(-dt * 2.2));
      this.target.lerp(this.fixed.look, 1 - Math.exp(-dt * 2.2));
      this.cam.position.copy(this.pos);
      if (shake > 0.001) { this.cam.position.x += (Math.random() - 0.5) * shake; this.cam.position.y += (Math.random() - 0.5) * shake; }
      this.cam.lookAt(this.target);
      return;
    }
    if (this.explore) {
      const inp = this.input;
      if (inp) {
        const speed = (inp.shift ? 26 : 11) * dt * Math.max(0.5, this.dist / 20);
        const ax = inp.axes();
        const vert = (inp.isDown('KeyE', 'PageUp') ? 1 : 0) - (inp.isDown('KeyQ', 'PageDown') ? 1 : 0);
        if (ax.x || ax.y || vert) this._pan(ax.x * speed, vert * speed, ax.y * speed);
      }
      this.target.lerp(this.pivot, 1 - Math.exp(-dt * 10));
      const want = new THREE.Vector3(
        this.target.x + Math.sin(this.yaw) * Math.cos(this.pitch) * this.dist,
        this.target.y + Math.sin(this.pitch) * this.dist,
        this.target.z + Math.cos(this.yaw) * Math.cos(this.pitch) * this.dist,
      );
      want.y = Math.max(want.y, 0.4);
      this.pos.lerp(want, 1 - Math.exp(-dt * 10));
      this.cam.position.copy(this.pos);
      this.cam.lookAt(this.target);
      return;
    }
    const k = 1 - Math.exp(-dt * 5);
    this.target.lerp(new THREE.Vector3(focus.x, focus.y + 1.5, focus.z), k);
    const pitch = this.pitch + this.extraHeight * 0.25;
    const dist = this.dist + this.extraHeight * 5;
    const want = new THREE.Vector3(
      this.target.x + Math.sin(this.yaw) * Math.cos(pitch) * dist,
      this.target.y + Math.sin(pitch) * dist,
      this.target.z + Math.cos(this.yaw) * Math.cos(pitch) * dist,
    );
    // never inside the neighbouring buildings: rise over their roofs instead
    if (want.z > 32.5 || (want.x > 39.8 && want.x < 56 && want.z > 8.5)) want.y = Math.max(want.y, 14);
    want.y = Math.max(want.y, 1.5);
    this.pos.lerp(want, 1 - Math.exp(-dt * 4));
    this.cam.position.copy(this.pos);
    if (shake > 0.001) {
      this.cam.position.x += (Math.random() - 0.5) * shake;
      this.cam.position.y += (Math.random() - 0.5) * shake;
      this.cam.position.z += (Math.random() - 0.5) * shake * 0.5;
    }
    this.cam.lookAt(this.target);
  }
}
