// THE SHARED INPUT LAYER.
//
// Normalized input: keyboard + gamepad (W3C Standard mapping) unified into one
// directional + action state. Each game's adapter reads this through its own
// ROM-faithful bit shuffle (DOJ's portWordFromBits, Gradius's queue, Batman's
// joypad). This module never names a game concept: directions are up/down/
// left/right, face actions are a1/a2/a3, system buttons are start/select.
//
// WHY THIS LIVES HERE (not under games/): the three games each keep a
// ROM-faithful input module under games/<id>/src/ that cites ROM addresses.
// That code MUST stay per-game: it is the port's claim against the cartridge.
// The shared layer is a NEW upstream concern (gamepad + analog + normalization),
// not a replacement. See docs/04-INPUT-SYSTEM.md section 1.
//
// KEYBOARD KEYS ARE MATCHED ON `e.code` (PHYSICAL POSITION), and a config that
// binds two codes to the same action (e.g. KeyY + KeyZ for Swiss QWERTZ) is
// supported by construction: KEYMAP_BY_CODE is just a { [code]: action } table.

// Radial deadzone for the analog stick. Below this magnitude, no direction.
// 0.28 is a typical generic value; the arcade panels were 8-way digital, so the
// analog is always QUANTIZED through gate8way, never passed through as analog.
const DEADZONE = 0.28;

/**
 * The normalized state template. Frozen; the controller returns fresh snapshots.
 *
 * Four direction booleans: a diagonal sets TWO (8-way + neutral, no enum).
 * Matches every game's mover: DOJ tests X and Y independently; Batman/Gradius
 * joypads carry one bit per direction.
 *
 * a1/a2/a3 are neutral face-action names. Each game's adapter assigns meaning
 * (DOJ: a1=SHOT, a2=BOMB, a3=AUTO; Gradius: a1=shot, a2=meter; Batman: a1=A,
 * a2=B, a3 unused).
 */
export const NORMAL = Object.freeze({
  up: false, down: false, left: false, right: false,
  a1: false, a2: false, a3: false,
  start: false, select: false,
  source: null,   // 'keyboard' | 'gamepad' | 'touch-stick' | null
});

// Canonical Standard Gamepad button indices (W3C Standard Gamepad spec).
export const STD = Object.freeze({
  a: 0, b: 1, x: 2, y: 3,
  lb: 4, rb: 5, lt: 6, rt: 7,
  back: 8, start: 9, home: 16,
  dup: 12, ddown: 13, dleft: 14, dright: 15,
});

const DIR_NAMES = ['up', 'down', 'left', 'right'];
const ACTION_NAMES = ['a1', 'a2', 'a3', 'start', 'select'];
const ALL_NAMES = [...DIR_NAMES, ...ACTION_NAMES];

/**
 * 8-way gate: radial deadzone + octant quantization.
 *
 * `x`,`y` are the analog axes (Standard Gamepad sign convention: x negative =
 * left, y negative = up). Returns four independent direction booleans; a
 * diagonal octant sets two. Below the deadzone, all four are false (neutral).
 *
 * Octant (not per-axis threshold) so a near-cardinal deflection carrying a small
 * off-axis component does NOT set the off-axis direction: per-axis `y < 0` would
 * set UP for a vector like (0.95, -0.05), which is almost pure RIGHT.
 *
 * Shared by the gamepad left stick and the floating touch stick.
 */
export function gate8way(x, y, dz = DEADZONE) {
  const mag = Math.hypot(x, y);
  if (mag < dz) return { up: false, down: false, left: false, right: false };
  // atan2: 0 = +x (right), PI/2 = +y (down), -PI/2 = -y (up), +/-PI = -x (left).
  // octant 0=right, 1=down+right, 2=down, 3=down+left, 4=left, 5=up+left, 6=up,
  // 7=up+right.
  const oct = (Math.round(Math.atan2(y, x) / (Math.PI / 4)) + 8) % 8;
  switch (oct) {
    case 0: return { up: false, down: false, left: false, right: true };
    case 1: return { up: false, down: true,  left: false, right: true };
    case 2: return { up: false, down: true,  left: false, right: false };
    case 3: return { up: false, down: true,  left: true,  right: false };
    case 4: return { up: false, down: false, left: true,  right: false };
    case 5: return { up: true,  down: false, left: true,  right: false };
    case 6: return { up: true,  down: false, left: false, right: false };
    default: return { up: true, down: false, left: false, right: true };
  }
}

/** Read a Standard Gamepad button as a boolean. `.pressed` if present (digital
 *  buttons carry it), else `.value > 0.5` (analog triggers carry `.value`). */
function btnPressed(b) {
  if (!b) return false;
  if (typeof b.pressed === 'boolean') return b.pressed;
  return typeof b.value === 'number' && b.value > 0.5;
}

/**
 * Create a normalized input controller.
 *
 * @param {Object} opts
 * @param {Object} opts.keyboard  KEYMAP_BY_CODE: { [e.code]: action } where
 *   action is 'UP'|'DOWN'|'LEFT'|'RIGHT'|'A1'|'A2'|'A3'|'START'|'SELECT'.
 *   Two codes may map to the same action (Swiss QWERTZ KeyY + KeyZ).
 * @param {Object} [opts.gamepad]  GAMEPAD_MAP: { [stdName]: action } where
 *   stdName is a key of STD ('a','b','x','start',...). D-pad buttons and the
 *   left stick are ALWAYS wired to directions; this maps only the face/system
 *   buttons. If omitted, gamepad face buttons are unmapped (directions still
 *   work).
 * @returns {Object} the controller.
 */
export function createInput({ keyboard = {}, gamepad = {} } = {}) {
  // Each source keeps its OWN state; state() returns the OR. This is the only
  // correct way to merge sources: if keyboard and gamepad both press UP and the
  // keyboard then releases, UP must stay true while the stick holds it.
  const kb = {};
  const gp = {};
  for (const n of ALL_NAMES) { kb[n] = false; gp[n] = false; }

  let source = null;
  const listeners = [];
  const pressed = new Set();   // tracked gamepad buttons, for edge detection
  const nonStandardLogged = new Set();
  let target = null;
  let attached = false;

  // ---- keyboard ----
  // Codes we have seen a real (non-repeat) keydown for. A key already down when
  // the page loaded only ever reaches us as auto-repeat; taking those at face
  // value turns the Enter that launched the page into a START press on frame 1.
  // This is the generalized form of DOJ's `keySeen` and Batman's `firstSample`.
  const keySeen = new Set();

  const down = (e) => {
    const action = keyboard[e.code];
    if (!action) return;
    e.preventDefault();
    const name = action.toLowerCase();
    if (e.repeat && !keySeen.has(e.code)) return;   // launch-Enter guard
    keySeen.add(e.code);
    if (!kb[name]) { kb[name] = true; source = 'keyboard'; emit(); }
  };
  const up = (e) => {
    const action = keyboard[e.code];
    if (!action) return;
    e.preventDefault();
    const name = action.toLowerCase();
    keySeen.delete(e.code);
    if (kb[name]) {
      // Only clear if no OTHER code maps to the same action and is still held.
      // (Swiss QWERTZ: KeyY and KeyZ both -> SHOT; releasing one must not clear
      // the other.) Check whether any remaining held code maps here.
      let stillHeld = false;
      for (const code of keySeen) {
        if (keyboard[code] === action) { stillHeld = true; break; }
      }
      if (!stillHeld) { kb[name] = false; source = 'keyboard'; emit(); }
    }
  };
  const kbClear = () => {
    let changed = false;
    for (const n of ALL_NAMES) if (kb[n]) { kb[n] = false; changed = true; }
    keySeen.clear();
    if (changed) { source = 'keyboard'; emit(); }
  };

  // ---- gamepad ----
  const gpConnected = (e) => {
    if (e.gamepad && e.gamepad.mapping === 'standard') listeners.hasPad = true;
  };
  const gpDisconnected = (e) => {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads
      ? navigator.getGamepads() : [];
    const has = [...pads].some((p) => p && p.mapping === 'standard');
    listeners.hasPad = has;
    if (!has) {
      let changed = false;
      for (const n of ALL_NAMES) if (gp[n]) { gp[n] = false; changed = true; }
      if (changed) { source = 'gamepad'; emit(); }
    }
  };

  function pollGamepad() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    let pad = null;
    for (const p of pads) {
      if (p && p.mapping === 'standard') { pad = p; break; }
    }
    // A non-standard pad is logged once by id and skipped (never guess a layout).
    if (!pad) {
      for (const p of pads) {
        if (p && p.mapping !== 'standard' && !nonStandardLogged.has(p.id)) {
          nonStandardLogged.add(p.id);
          // The status line is the owner's domain; this is a hint, not a crash.
          console.warn(`Non-standard gamepad "${p.id}" skipped (no Standard mapping).`);
        }
      }
    }
    if (listeners.hasPad !== !!pad) listeners.hasPad = !!pad;
    if (!pad) {
      let changed = false;
      for (const n of ALL_NAMES) if (gp[n]) { gp[n] = false; changed = true; }
      if (changed) { source = 'gamepad'; emit(); }
      return;
    }

    let changed = false;
    const set = (name, val) => {
      if (gp[name] !== val) { gp[name] = val; changed = true; }
    };

    // D-pad buttons 12-15.
    set('up', btnPressed(pad.buttons[STD.dup]));
    set('down', btnPressed(pad.buttons[STD.ddown]));
    set('left', btnPressed(pad.buttons[STD.dleft]));
    set('right', btnPressed(pad.buttons[STD.dright]));

    // Left stick axes 0/1 through the 8-way gate (OR with the D-pad).
    const g = gate8way(pad.axes[0] || 0, pad.axes[1] || 0);
    set('up', gp.up || g.up);
    set('down', gp.down || g.down);
    set('left', gp.left || g.left);
    set('right', gp.right || g.right);

    // Face/system buttons per GAMEPAD_MAP.
    for (const [stdName, action] of Object.entries(gamepad)) {
      const idx = STD[stdName];
      if (idx === undefined) continue;
      const name = action.toLowerCase();
      if (!ALL_NAMES.includes(name)) continue;
      set(name, btnPressed(pad.buttons[idx]));
    }

    if (changed) { source = 'gamepad'; emit(); }
  }

  // ---- state + change notification ----
  function snapshot() {
    const s = {};
    for (const n of ALL_NAMES) s[n] = kb[n] || gp[n];
    s.source = source;
    return s;
  }

  const cbs = new Set();
  function emit() { const s = snapshot(); for (const cb of cbs) cb(s, source); }

  function attach(t = (typeof window !== 'undefined' ? window : null)) {
    if (attached) detach();
    target = t;
    if (!target) return;              // headless: tests drive the mask directly
    target.addEventListener('keydown', down);
    target.addEventListener('keyup', up);
    target.addEventListener('blur', kbClear);
    target.addEventListener('gamepadconnected', gpConnected);
    target.addEventListener('gamepaddisconnected', gpDisconnected);
    attached = true;
  }

  function detach() {
    if (!target) { attached = false; return; }
    target.removeEventListener('keydown', down);
    target.removeEventListener('keyup', up);
    target.removeEventListener('blur', kbClear);
    target.removeEventListener('gamepadconnected', gpConnected);
    target.removeEventListener('gamepaddisconnected', gpDisconnected);
    kbClear();
    for (const n of ALL_NAMES) gp[n] = false;
    attached = false;
    target = null;
  }

  return Object.freeze({
    attach,
    detach,
    pollGamepad,
    state: snapshot,
    onChange: (fn) => { cbs.add(fn); return () => cbs.delete(fn); },
    clearKeyboard: kbClear,
    get hasPad() { return !!listeners.hasPad; },
  });
}

/**
 * Attach a floating / dynamic touch stick to `zoneEl`.
 *
 * The stick origin appears wherever a coarse pointer first lands inside the
 * zone; the drag delta runs through `gate8way` (the same deadzone + octant gate
 * the physical analog stick uses) and the resulting four booleans are delivered
 * to `onDirections`. One finger owns the stick at a time. Pointer capture ensures
 * the finger that slides out of the zone still delivers its release. The
 * returned backstop clears the direction and should be called on blur / pagehide
 * / visibilitychange.
 *
 * Both the floating stick and the fixed 8-way D-pad produce four booleans, so
 * the adapter and the ROM model cannot tell them apart -- this is what lets the
 * player pick at runtime with no game-logic change.
 *
 * @param {HTMLElement} zoneEl  the movement zone (e.g. left half of the stage).
 * @param {Object} opts
 * @param {(d: {up,down,left,right}) => void} opts.onDirections  called on every
 *   change; receives all-false on release / backstop.
 * @param {number} [opts.deadzone]  pixel radius before a direction registers.
 *   Default 12 px (a small thumb movement).
 * @param {(origin: {x,y}, current: {x,y}) => void} [opts.onPaint]  optional
 *   visual callback (draw ring + knob). Not load-bearing.
 * @returns {() => void} the backstop.
 */
export function attachFloatingStick(zoneEl, { onDirections, deadzone = 12, onPaint } = null) {
  if (!zoneEl) return () => {};
  let ptr = null;
  let origin = null;
  const none = () => onDirections?.({ up: false, down: false, left: false, right: false });

  const move = (e) => {
    if (e.pointerId !== ptr) return;
    e.preventDefault();
    const dx = e.clientX - origin.x;
    const dy = e.clientY - origin.y;
    // Treat the pixel delta as an analog vector: gate8way quantizes it. The
    // deadzone is in pixels here, not 0-1, so we pass it through as a fraction
    // of a reference magnitude (the deadzone itself).
    const mag = Math.hypot(dx, dy);
    if (mag < deadzone) {
      onDirections?.({ up: false, down: false, left: false, right: false });
      onPaint?.(origin, { x: e.clientX, y: e.clientY });
      return;
    }
    // Normalize so the octant math is independent of how far the finger dragged.
    const g = gate8way(dx / mag, dy / mag, 0);
    onDirections?.(g);
    onPaint?.(origin, { x: e.clientX, y: e.clientY });
  };

  const start = (e) => {
    if (ptr !== null) return;         // one finger owns the stick at a time
    if (e.pointerType === 'mouse') return;  // mouse uses the keyboard; stick is touch
    e.preventDefault();
    ptr = e.pointerId;
    origin = { x: e.clientX, y: e.clientY };
    zoneEl.setPointerCapture?.(e.pointerId);
    none();
    onPaint?.(origin, origin);
  };

  const end = (e) => {
    if (e.pointerId !== ptr) return;
    e.preventDefault();
    ptr = null;
    origin = null;
    none();
    onPaint?.(null, null);
  };

  zoneEl.addEventListener('pointerdown', start);
  zoneEl.addEventListener('pointermove', move);
  for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    zoneEl.addEventListener(t, end);
  }
  zoneEl.addEventListener('contextmenu', (e) => e.preventDefault());

  return function backstop() {
    ptr = null;
    origin = null;
    none();
    onPaint?.(null, null);
  };
}
