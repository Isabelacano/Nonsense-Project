// Keyboard state. Arrow keys move (WASD also works), Shift runs, Ctrl sneaks,
// Space jumps, E dismantles. Ctrl/Shift are read from the event flags too, so
// holding them before pressing an arrow behaves as expected.
const CAPTURE = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyE', 'KeyW', 'KeyA', 'KeyS', 'KeyD']);

export class Input {
  constructor(target = window) {
    this.down = new Set();
    this.pressed = new Set();
    this.shift = false; this.ctrl = false;
    this.anyKey = null;
    target.addEventListener('keydown', (e) => {
      this.shift = e.shiftKey; this.ctrl = e.ctrlKey || e.metaKey || e.altKey;
      if (CAPTURE.has(e.code) || e.ctrlKey) e.preventDefault();
      if (e.code === 'AltLeft' || e.code === 'AltRight') e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
      if (this.anyKey) this.anyKey(e);
    });
    target.addEventListener('keyup', (e) => {
      this.shift = e.shiftKey; this.ctrl = e.ctrlKey || e.metaKey || e.altKey;
      this.down.delete(e.code);
      if (e.code.startsWith('Control') || e.code.startsWith('Meta') || e.code.startsWith('Alt')) this.ctrl = false;
      if (e.code.startsWith('Shift')) this.shift = false;
    });
    window.addEventListener('blur', () => { this.down.clear(); this.shift = this.ctrl = false; });
  }

  isDown(...codes) { return codes.some(c => this.down.has(c)); }
  wasPressed(code) { return this.pressed.has(code); }
  endFrame() { this.pressed.clear(); }

  axes() {
    const x = (this.isDown('ArrowRight', 'KeyD') ? 1 : 0) - (this.isDown('ArrowLeft', 'KeyA') ? 1 : 0);
    const y = (this.isDown('ArrowUp', 'KeyW') ? 1 : 0) - (this.isDown('ArrowDown', 'KeyS') ? 1 : 0);
    return { x, y };
  }
}
