// THE SHARED INPUT LAYER.
//
// Normalized input: keyboard + profiled browser gamepads unified into one
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

// Canonical Gamepad button names. STD is the W3C Standard profile and remains
// public because existing game adapters configure actions with these names.
export const STD = Object.freeze({
  a: 0, b: 1, x: 2, y: 3,
  lb: 4, rb: 5, lt: 6, rt: 7,
  back: 8, start: 9, home: 16,
  dup: 12, ddown: 13, dleft: 14, dright: 15,
});

const STANDARD_DPAD = Object.freeze({ up: 12, down: 13, left: 14, right: 15 });
const STANDARD_BUTTONS = Object.freeze({
  a: 0, b: 1, x: 2, y: 3,
  lb: 4, rb: 5, lt: 6, rt: 7,
  back: 8, start: 9, home: 16,
});

/**
 * Browser gamepad profiles, ordered from exact to conservative.
 *
 * Standard pads use the W3C mapping regardless of their printed labels. The
 * named non-Standard profiles cover layouts browsers commonly expose without a
 * mapping string. The final DirectInput fallback deliberately requires two axes
 * and ten buttons, enough for movement, three actions, select and start. It
 * assumes only the widespread 0/1/2 face and 8/9 system-button convention.
 * Unknown smaller devices remain unsupported rather than receiving a hazardous
 * partial mapping.
 */
export const GAMEPAD_PROFILES = Object.freeze([
  Object.freeze({
    name: 'standard',
    match: (pad) => pad.mapping === 'standard',
    buttons: STANDARD_BUTTONS,
    dpad: STANDARD_DPAD,
    stick: Object.freeze([0, 1]),
  }),
  // Legacy PS3 DirectInput is unlike every modern Standard-like Sony layout:
  // Select/Start are 0/3, the d-pad is 4..7, and face buttons are 12..15.
  Object.freeze({
    name: 'playstation-3-directinput',
    match: (pad) => pad.mapping !== 'standard'
      && /PLAYSTATION\(R\)3|PLAYSTATION 3|DUALSHOCK 3|054c[^\n]*0268/i.test(pad.id || ''),
    buttons: Object.freeze({
      a: 14, b: 13, x: 15, y: 12,
      lb: 10, rb: 11, lt: 8, rt: 9,
      back: 0, start: 3, home: 16,
    }),
    dpad: Object.freeze({ up: 4, down: 6, left: 7, right: 5 }),
    stick: Object.freeze([0, 1]),
  }),
  // Switch Pro/Joy-Con pairs exposed raw retain the common physical-position
  // order: B/A/Y/X occupy indices 0/1/2/3, minus/plus are 8/9.
  Object.freeze({
    name: 'nintendo-switch-directinput',
    match: (pad) => pad.mapping !== 'standard'
      && /NINTENDO|SWITCH|057e/i.test(pad.id || ''),
    buttons: STANDARD_BUTTONS,
    dpad: STANDARD_DPAD,
    stick: Object.freeze([0, 1]),
    dpadAxes: Object.freeze([6, 7]),
    hatAxis: 9,
  }),
  // Modern Sony pads are normally Standard. Firefox/Linux combinations that
  // expose them raw commonly retain the Standard-like 0..3, 8/9 and 12..15
  // indices, unlike the explicitly matched PS3 profile above.
  Object.freeze({
    name: 'playstation-directinput',
    match: (pad) => pad.mapping !== 'standard'
      && /PLAYSTATION|DUALSHOCK|DUALSENSE|WIRELESS CONTROLLER|054c/i.test(pad.id || ''),
    buttons: STANDARD_BUTTONS,
    dpad: STANDARD_DPAD,
    stick: Object.freeze([0, 1]),
    dpadAxes: Object.freeze([6, 7]),
    hatAxis: 9,
  }),
  Object.freeze({
    name: 'generic-directinput',
    match: (pad) => pad.mapping !== 'standard'
      && (pad.axes?.length ?? 0) >= 2 && (pad.buttons?.length ?? 0) >= 10,
    buttons: STANDARD_BUTTONS,
    dpad: STANDARD_DPAD,
    stick: Object.freeze([0, 1]),
    dpadAxes: Object.freeze([6, 7]),
    hatAxis: 9,
  }),
]);

/** Resolve one browser Gamepad to a maintained profile, or null if it is too
 * small/unknown for a complete conservative mapping. */
export function gamepadProfile(pad) {
  if (!pad || pad.connected === false) return null;
  return GAMEPAD_PROFILES.find((profile) => profile.match(pad)) ?? null;
}

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

/** Read a profiled Gamepad button as a boolean. `.pressed` if present (digital
 *  buttons carry it), else `.value > 0.5` (analog triggers carry `.value`). */
function btnPressed(b) {
  if (!b) return false;
  if (typeof b.pressed === 'boolean') return b.pressed;
  return typeof b.value === 'number' && b.value > 0.5;
}

const axisValue = (pad, index) => {
  const value = pad.axes?.[index];
  return Number.isFinite(value) ? value : 0;
};

/** Chrome's older DirectInput path exposes a POV hat as one axis with eight
 * values from -1 through +1; neutral is outside that range. Accept only values
 * close to those eight detents, so an ordinary analog axis is never guessed as
 * a d-pad. */
function hat8way(value) {
  const none = { up: false, down: false, left: false, right: false };
  if (!Number.isFinite(value) || value < -1.05 || value > 1.05) return none;
  const detent = Math.round((value + 1) * 3.5);
  const expected = -1 + detent * (2 / 7);
  if (detent < 0 || detent > 7 || Math.abs(value - expected) > 0.08) return none;
  switch (detent) {
    case 0: return { up: true, down: false, left: false, right: false };
    case 1: return { up: true, down: false, left: false, right: true };
    case 2: return { up: false, down: false, left: false, right: true };
    case 3: return { up: false, down: true, left: false, right: true };
    case 4: return { up: false, down: true, left: false, right: false };
    case 5: return { up: false, down: true, left: true, right: false };
    case 6: return { up: false, down: false, left: true, right: false };
    default: return { up: true, down: false, left: true, right: false };
  }
}

/**
 * Create a normalized input controller.
 *
 * @param {Object} opts
 * @param {Object} opts.keyboard  KEYMAP_BY_CODE: { [e.code]: action } where
 *   action is 'UP'|'DOWN'|'LEFT'|'RIGHT'|'A1'|'A2'|'A3'|'START'|'SELECT'.
 *   Two codes may map to the same action (Swiss QWERTZ KeyY + KeyZ).
 * @param {Object} [opts.gamepad]  GAMEPAD_MAP: { [canonicalName]: action } where
 *   canonicalName is a key of STD ('a','b','x','start',...). Profiled d-pad
 *   buttons and the left stick are ALWAYS wired to directions; this maps only
 *   face/system buttons. If omitted, face buttons are unmapped (directions still
 *   work).
 * @param {number} [opts.gamepadIndex] Exact browser Gamepad.index to own. If
 *   omitted, the first supported pad is used, preserving the single-player API.
 * @returns {Object} the controller.
 */
export function createInput({ keyboard = {}, gamepad = {}, gamepadIndex = null } = {}) {
  // Each source keeps its OWN state; state() returns the OR. This is the only
  // correct way to merge sources: if keyboard and gamepad both press UP and the
  // keyboard then releases, UP must stay true while the stick holds it.
  const kb = {};
  const gp = {};
  for (const n of ALL_NAMES) { kb[n] = false; gp[n] = false; }

  let source = null;
  const listeners = [];
  const unsupportedLogged = new Set();
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
  const clearGamepadState = () => {
    let changed = false;
    for (const n of ALL_NAMES) if (gp[n]) { gp[n] = false; changed = true; }
    if (changed) { source = 'gamepad'; emit(); }
  };

  const entriesFor = (pads) => Array.from(pads ?? [], (pad, slot) => ({
    pad,
    index: Number.isInteger(pad?.index) ? pad.index : slot,
  }));

  const selectGamepad = (pads) => {
    for (const entry of entriesFor(pads)) {
      if (!entry.pad || (gamepadIndex !== null && entry.index !== gamepadIndex)) continue;
      const profile = gamepadProfile(entry.pad);
      if (profile) return { ...entry, profile };
    }
    return null;
  };

  const noteUnsupported = (pads) => {
    for (const { pad, index } of entriesFor(pads)) {
      if (!pad || (gamepadIndex !== null && index !== gamepadIndex) || gamepadProfile(pad)) continue;
      const key = `${index}:${pad.id || 'unknown'}`;
      if (unsupportedLogged.has(key)) continue;
      unsupportedLogged.add(key);
      // The status line is the owner's domain; this is a hint, not a crash.
      console.warn(`Gamepad "${pad.id || 'unknown'}" at index ${index} has no safe input profile.`);
    }
  };

  const gpConnected = (e) => {
    const pad = e.gamepad;
    if (!pad || !gamepadProfile(pad)) return;
    if (gamepadIndex === null || pad.index === gamepadIndex) listeners.hasPad = true;
  };
  const gpDisconnected = () => {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads
      ? navigator.getGamepads() : [];
    const selected = selectGamepad(pads);
    listeners.hasPad = !!selected;
    listeners.profile = selected?.profile.name ?? null;
    if (!selected) clearGamepadState();
  };

  function pollGamepad() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const pads = navigator.getGamepads();
    const selected = selectGamepad(pads);
    noteUnsupported(pads);
    listeners.hasPad = !!selected;
    listeners.profile = selected?.profile.name ?? null;
    if (!selected) {
      clearGamepadState();
      return;
    }

    const { pad, profile } = selected;
    const next = Object.fromEntries(ALL_NAMES.map((name) => [name, false]));

    // Profiled digital d-pad. Its existence suppresses the more conservative
    // DirectInput axis/hat fallbacks, even while all four buttons are released.
    let hasDigitalDpad = false;
    for (const name of DIR_NAMES) {
      const index = profile.dpad?.[name];
      if (index === undefined || !pad.buttons?.[index]) continue;
      hasDigitalDpad = true;
      next[name] ||= btnPressed(pad.buttons[index]);
    }

    // Every maintained profile has a left stick, quantized through the arcade
    // 8-way gate. Missing/non-numeric axes read as neutral.
    const stick = profile.stick ?? [0, 1];
    const analog = gate8way(axisValue(pad, stick[0]), axisValue(pad, stick[1]));
    for (const name of DIR_NAMES) next[name] ||= analog[name];

    // DirectInput commonly reports the d-pad either as the old Chrome POV-hat
    // axis 9 or as axes 6/7. Prefer a present hat axis; using both can mistake
    // trigger axes 6/7 for a held direction on layouts that expose ten axes.
    if (!hasDigitalDpad && profile.hatAxis !== undefined
        && pad.axes?.length > profile.hatAxis) {
      const hat = hat8way(pad.axes[profile.hatAxis]);
      for (const name of DIR_NAMES) next[name] ||= hat[name];
    } else if (!hasDigitalDpad && profile.dpadAxes
        && pad.axes?.length > Math.max(...profile.dpadAxes)) {
      const dpad = gate8way(axisValue(pad, profile.dpadAxes[0]),
        axisValue(pad, profile.dpadAxes[1]), 0.5);
      for (const name of DIR_NAMES) next[name] ||= dpad[name];
    }

    // Face/system buttons use canonical names at the adapter boundary, then the
    // selected profile translates each name to its physical browser index.
    for (const [canonicalName, action] of Object.entries(gamepad)) {
      const index = profile.buttons[canonicalName];
      if (index === undefined) continue;
      const name = action.toLowerCase();
      if (!ALL_NAMES.includes(name)) continue;
      next[name] ||= btnPressed(pad.buttons?.[index]);
    }

    let changed = false;
    for (const name of ALL_NAMES) {
      if (gp[name] !== next[name]) { gp[name] = next[name]; changed = true; }
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
    listeners.hasPad = false;
    listeners.profile = null;
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
    get profile() { return listeners.profile ?? null; },
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
