# W109 -- shared input layer + DaiOuJou end-to-end (keyboard + gamepad + touch + picker)

status: IN PROGRESS
role: implementer (shared/input.js + DOJ adapter)
date: 2026-08-06

## PREMISE CHECK (done before coding)

Verified every claim in the brief and plan section 0/3 against the code:

- `currentPortWord()` is read inside `Demo.step()` at app.js:785 (one read per
  logic frame, fed to `g.step()`). CONFIRMED.
- `Demo.loop` (the per-rAF method) is at app.js:1070, driven by the rAF callback
  `frame()` at app.js:1245-1259 inside `boot()`. CONFIRMED.
- `attachKeyboard(opts.target)` is called in `boot()` at app.js:1243, NOT in
  index.html. This is a minor deviation from the plan's implication but correct:
  keyboard is wired inside app.js. The controller's `attach` goes here.
- `attachPad` (fixed D-pad + face buttons) IS in index.html:543. It writes
  `touchHeld` via `setTouchDirections` / `setTouchButton`. CONFIRMED.
- BIT at machine.js:262: `{ up:0, down:1, left:2, right:3, b1:4, b2:5, b3:6,
  start:15 }`. CONFIRMED.
- INCLUDE list at build-dist.mjs:61-66. Adding `'shared'` publishes `dist/shared/`.
  CONFIRMED.
- `package.json` has `"type": "module"` (line 6), so `.js` is ES module. CONFIRMED.
- No `shared/` dir exists. Worklog 109 is free (108 is the proximity recon).
- The headless test (web-input.test.js) imports `clearKeyboard` but NOT
  `attachKeyboard`; it drives `setTouchButton`/`setTouchDirections` and reads
  `currentMask`/`currentPortWord`. So replacing the keyboard path does not break
  the test's imports, and `currentMask` must still read `touchHeld` in headless.

The brief's premise is CORRECT on all material claims.

## DESIGN

### shared/input.js (new, repo root)

Normalized state: four direction booleans (diagonal sets two) + a1/a2/a3 +
start/select + source diagnostic. No enum; four booleans IS 8-way + neutral.

Sources managed independently, OR'd in `state()`:
- keyboard: KEYMAP_BY_CODE (e.code -> 'UP'|...|'A3'|'START'|'SELECT'). Launch-Enter
  guard generalized: a repeat for a code never freshly seen is suppressed (same
  logic as DOJ's existing `keySeen`).
- gamepad: Standard mapping only (`pad.mapping === 'standard'`, else skip + log id
  once). D-pad buttons 12-15 + left stick axes 0/1 through `gate8way`. Face/system
  buttons per GAMEPAD_MAP. `pollGamepad()` once per rAF.

`gate8way(x, y, dz=0.28)`: radial deadzone + octant quantization -> four booleans.
Octant chosen over per-axis threshold because a near-cardinal deflection with a
small off-axis component must NOT set the off-axis direction (per-axis `y < 0`
would).

`attachFloatingStick(zoneEl, {onDirections, deadzone})`: reusable floating touch
stick. Origin on pointerdown in the zone, drag delta through `gate8way`, pointer
capture, blur/pagehide backstop. Calls `onDirections({up,down,left,right})`.

Controller API: `createInput({keyboard, gamepad})` -> `{attach, pollGamepad,
state, onChange, clearKeyboard, detach, hasPad}`.

### DOJ adapter (games/ddpdoj/src/web/input.js)

- Remove `keyHeld`, `keySeen`, `attachKeyboard` (keyboard moves to shared).
- Keep `KEYMAP` (DOJ control names, game.json + tests depend on it).
- Derive `KEYMAP_BY_CODE` (normalized names) from KEYMAP.
- `GAMEPAD_MAP = { a:'A1', b:'A2', x:'A3', start:'START' }` (owner: B = BOMB).
- `let controller = null;` set by new `attachInput(target)`.
- `currentMask()` reads controller state -> mask bits, OR'd with `touchHeld`.
  In headless (no controller), returns just `touchHeld` -- tests unaffected.
- `clearKeyboard()` -> `controller?.clearKeyboard()` (no-op in headless).
- `pollInput()` -> `controller?.pollGamepad()`.

### Wiring (app.js)

- `boot()`: replace `attachKeyboard(opts.target)` with `attachInput(opts.target)`.
- `Demo.loop()`: call `pollInput()` at the top (once per rAF, before step()).

### Picker (index.html)

CTRL button in #bar (beside TATE/INFO) cycles AUTO -> FIXED -> FLOAT -> AUTO.
Persisted in `localStorage['ddpdoj.controls']`. Floating stick zone overlays the
left half of #stage. Face buttons stay the fixed cluster always.

### Build line (tools/build-dist.mjs)

Add `'shared'` to the INCLUDE list.

## PROGRESS

### shared/input.js -- DONE

- `NORMAL` frozen template (4 dir booleans + a1/a2/a3 + start/select + source).
- `gate8way(x, y, dz=0.28)`: radial deadzone + octant quantization -> four
  booleans. Octant chosen over per-axis so a near-cardinal (0.95, -0.05) does NOT
  set the off-axis direction.
- `STD`: Standard Gamepad button indices (frozen).
- `createInput({keyboard, gamepad})`: controller with keyboard + gamepad, each in
  its own state, OR'd in `state()`. Launch-Enter guard generalized (a repeat for
  a code never freshly seen is suppressed). Swiss QWERTZ multi-code-per-action
  handled (releasing one of two codes mapping to the same action keeps the bit if
  the other is still held). Non-standard pads logged once and skipped.
  `pollGamepad()` polls `navigator.getGamepads()` once per rAF. D-pad buttons
  12-15 + left stick axes 0/1 through gate8way (OR'd). `gamepadconnected`/
  `disconnected` set `hasPad` flag.
- `attachFloatingStick(zoneEl, {onDirections, deadzone, onPaint})`: floating
  touch stick with pointer capture, origin-on-press, gate8way quantization,
  one-finger-at-a-time, backstop returned.

### DOJ adapter (web/input.js) -- DONE

- Removed `keyHeld`, `keySeen`, `attachKeyboard`. Keyboard now via shared layer.
- `KEYMAP` (DOJ control names) kept unchanged -- tests + game.json depend on it.
- `KEYMAP_BY_CODE` derived from KEYMAP via `DOJ_TO_NORMAL` mapping.
- `GAMEPAD_MAP = { a:'A1', b:'A2', x:'A3', start:'START' }` (owner: B = BOMB).
- `currentMask()` reads controller state -> mask bits, OR'd with `touchHeld`.
  Headless (controller null) returns just `touchHeld` -- tests unaffected.
- `clearKeyboard()` -> `controller?.clearKeyboard()` (no-op in headless).
- `attachInput(target)` + `pollInput()` exported.
- `attachStick(zoneEl)` wraps `attachFloatingStick` -> `setTouchDirections`.

### Wiring (app.js) -- DONE

- `boot()`: `attachKeyboard` -> `attachInput`.
- `Demo.loop()`: `pollInput()` at top (once per rAF, before step()).

### Picker (index.html) -- DONE

- CTRL button in #bar, cycles AUTO -> FIXED -> FLOAT -> AUTO.
- `localStorage['ddpdoj.controls']` persistence.
- #stickzone overlay on left half of #stage (position:relative added).
- `applyScheme()` toggles D-pad visibility vs stickzone; face cluster always on.
- Backstop includes both padBackstop + stickBackstop + clearKeyboard.

### Build line (build-dist.mjs) -- DONE

- 'shared' added to INCLUDE list.
- 'input.test.js' added to NEVER_SHIP (test not published to live site).

## RED-VALIDATION

### shared/input.test.js (13 tests, all green)

Two guards red-validated by deliberate break:

1. **gate8way near-cardinal test**: replaced octant with per-axis (`y < 0`).
   Test 4 ("near-cardinal does NOT set the off axis") went RED. Restored octant,
   GREEN. This proves the test is not tautological -- it is the one assertion
   that distinguishes octant from per-axis.

2. **Launch-Enter guard**: disabled the `if (e.repeat && !keySeen.has(...))`
   guard. Test 8 ("repeat for unseen key is suppressed") went RED. Restored,
   GREEN.

### web-input.test.js (1211 tests, all green, 0 skipped)

Unchanged: the test drives `setTouchButton`/`setTouchDirections` and reads
`currentMask`/`currentPortWord`. In headless, `controller` is null, so
`currentMask()` returns just `touchHeld` -- identical to the pre-wave behavior
where it returned `(keyHeld | touchHeld)` with `keyHeld` = 0. The keyboard path
was REPLACED (not modified), so no existing assertion needed editing.

## GATE RESULTS

- `node --test games/ddpdoj/tests/`: **1211 pass, 0 fail, 0 skipped**.
- `node --test shared/input.test.js`: **13 pass, 0 fail, 0 skipped**.
- `node tools/build-dist.mjs`: **264 files, ROM leak guard clean** (261 files
  checked, 49 also decompressed, against 12 ROMs; 6 deliberate exceptions;
  shared/input.js pulls NO ROM-derived data).
- `node tools/publish.mjs --dry`: see report below.

## WHAT LANDED

The full wave: shared module + DOJ keyboard (from shared) + DOJ gamepad (new) +
fixed D-pad (kept) + floating stick (new) + CTRL picker + build line. Nothing
deferred.
