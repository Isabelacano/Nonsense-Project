// Entry point: renderer, loop, overlays and global keys.
import './seed.js';   // first: seeds Math.random for this session
import * as THREE from 'three';
import { createWorld } from './world.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { FollowCamera } from './camera.js';
import { Game } from './game.js';
import { IllustratedRenderer } from './render.js';
import { ILL } from './toon.js';

const canvas = document.getElementById('view');
// MSAA happens in the colour render target; the composite pass does tone mapping + grading itself.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
const DPR = () => Math.min(window.devicePixelRatio, 1.5);
renderer.setPixelRatio(DPR());
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
renderer.info.autoReset = false;

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 900);
camera.layers.enable(1); // layer 1 = drawn but not ink-outlined (sky, sprites, dust)
const world = createWorld(renderer);
const scene = world.scene;
const audio = new Audio();
audio.camera = camera;
const fx = new FX(scene, camera);
const input = new Input();
const hud = new HUD(audio);
const followCam = new FollowCamera(camera, canvas);
followCam.input = input;
const game = new Game({ scene, world, fx, audio, hud, followCam });
const illustrated = new IllustratedRenderer(renderer, scene, camera);
illustrated.setSize(window.innerWidth, window.innerHeight, DPR());
// Debug hooks for the console (dev server only): __game, __step(n, dt) to fast-forward the
// simulation, __renderInfo, __mind, __director.
if (import.meta.env.DEV) {
  window.__game = game;
  window.__step = (n = 100, dt = 1 / 30, keys = {}) => {
    const fake = { axes: () => ({ x: keys.x || 0, y: keys.y || 0 }), shift: !!keys.run, ctrl: !!keys.sneak, wasPressed: (c) => c === 'KeyE' && keys.e };
    for (let i = 0; i < n; i++) { game.update(dt, fake, camera); fx.update(dt); }
  };
  window.__renderInfo = () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles });
}

let running = false;
const intro = document.getElementById('intro');
const start = () => {
  if (running) return;
  audio.unlock();
  intro.hidden = true;
  hud.show();
  running = true;
  canvas.focus();
};
document.getElementById('start').addEventListener('click', start);
document.getElementById('restart').addEventListener('click', () => location.reload());
// "Keep looking": the scene stays exactly as it is; the camera is handed over for free exploration
document.getElementById('stay').addEventListener('click', () => { hud.hideEnd(); game.enterExplore(); canvas.focus(); });
window.addEventListener('pointerdown', () => audio.unlock());
input.anyKey = (e) => {
  audio.unlock();
  if (!running) { if (e.code === 'Enter' || e.code === 'Space') start(); return; }
  if (e.code === 'KeyM') hud.toggleMute();
  if (e.code === 'KeyH') hud.toggleKeys();
  if (e.code === 'KeyR' && game.endShown) location.reload();
};

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(DPR());
  renderer.setSize(window.innerWidth, window.innerHeight);
  illustrated.setSize(window.innerWidth, window.innerHeight, DPR());
});

// The sun's shadow frustum follows the worker so shadows stay crisp.
const sunOffset = world.sun.position.clone().sub(world.sun.target.position);
const sunDir = sunOffset.clone().normalize();
const sunRight = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), sunDir).normalize();
const sunUp = new THREE.Vector3().crossVectors(sunDir, sunRight).normalize();
const sunTmp = new THREE.Vector3();
const sc = world.sun.shadow.camera;

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  if (running) game.update(dt, input, camera);
  else game.worker.update(dt, { move: new THREE.Vector3(), run: false, sneak: false, jump: false, camPos: camera.position });
  fx.update(dt);
  followCam.update(dt, game.focusPos, fx.shakeAmount * 0.6);
  world.update(dt, clock.elapsedTime, camera.position, followCam.target);
  ILL.uTime.value += dt;
  hud.updateBubbles(camera, dt);
  const t = game.focusPos;
  // snap the moving shadow frustum to whole shadow-map texels (in light space), so shadow
  // edges stand still instead of shimmering while the frustum follows the action
  const tgt = sunTmp.set(t.x * 0.5, 0, Math.max(0, t.z * 0.5));
  const lr = tgt.dot(sunRight), lu = tgt.dot(sunUp), lf = tgt.dot(sunDir);
  const texel = (sc.right - sc.left) / world.sun.shadow.mapSize.x;
  world.sun.target.position.copy(sunRight).multiplyScalar(Math.round(lr / texel) * texel)
    .addScaledVector(sunUp, Math.round(lu / texel) * texel).addScaledVector(sunDir, lf);
  world.sun.position.copy(world.sun.target.position).add(sunOffset);
  renderer.info.reset();
  illustrated.render(dt);
  input.endFrame();
  requestAnimationFrame(frame);
}
followCam.update(1, game.worker.pos, 0);
frame();
