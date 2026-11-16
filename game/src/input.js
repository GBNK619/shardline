// SHARDLINE — keyboard + pointer-lock mouse input. One job: raw input state.
export function createInput(canvas, callbacks) {
  const state = {
    keys: new Set(),
    firing: false,
    lookX: 0,
    lookY: 0,
    locked: false,
    // Edge-triggered presses consumed by the game loop each step.
    pressed: new Set(),
  };

  const MOVE_KEYS = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight',
    'Space', 'ControlLeft', 'ControlRight', 'KeyR', 'KeyE', 'KeyG',
    'KeyB', 'KeyF', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6',
    'Escape', 'Enter',
  ]);

  function onKeyDown(e) {
    if (MOVE_KEYS.has(e.code)) e.preventDefault();
    if (!e.repeat) state.pressed.add(e.code);
    state.keys.add(e.code);
    if (e.code === 'Enter' && callbacks.onEnter) callbacks.onEnter();
  }
  function onKeyUp(e) {
    state.keys.delete(e.code);
  }
  function onMouseMove(e) {
    if (!state.locked) return;
    state.lookX += e.movementX || 0;
    state.lookY += e.movementY || 0;
  }
  function onMouseDown(e) {
    if (e.button !== 0) return;
    if (!state.locked) {
      if (callbacks.onUnlockedClick) callbacks.onUnlockedClick();
      return;
    }
    state.firing = true;
  }
  function onMouseUp(e) {
    if (e.button === 0) state.firing = false;
  }
  function onLockChange() {
    state.locked = document.pointerLockElement === canvas;
    if (callbacks.onLockChange) callbacks.onLockChange(state.locked);
  }
  function onBlur() {
    state.keys.clear();
    state.firing = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('pointerlockchange', onLockChange);

  return {
    state,
    requestLock() {
      try {
        const p = canvas.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
      } catch (e) { /* headless or denied: game still runs */ }
    },
    exitLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    takeLook() {
      const x = state.lookX;
      const y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return { x, y };
    },
    // Returns true once per physical press; the game loop calls this each step.
    consumePressed(code) {
      if (state.pressed.has(code)) {
        state.pressed.delete(code);
        return true;
      }
      return false;
    },
    clearPressed() { state.pressed.clear(); },
  };
}
