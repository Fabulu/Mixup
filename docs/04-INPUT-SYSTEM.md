# 04 - SHARED INPUT SYSTEM (gamepad + touch + keyboard, all three games)
status: DONE
role: recon/architect (read-only)   date: 2026-08-06
scope: owner-chosen "shared input layer". This plan folds in the mid-task scope
expansion: touch schemes (fixed 8-way D-pad AND floating analog stick), a
per-game control-scheme picker, and a normalized abstraction that unifies
physical gamepad, keyboard and touch into one directional + action state.

This is a plan. No source under `games/*/src/` is modified by this wave.

---

## 0. PREMISE CHECK (what I verified before designing)

The brief warned that 47 prior briefs rested on something false. I checked the
input model of each game against the code, not against the brief.

**Batman** (`games/batman/src/input.js`)
- Joypad bits at `$FFE1` (held) / `$FFE2` (pressed), read in the VBlank ISR
  `$07CC-$07F6`. `BTN` in input.js: `A=0x01 B=0x02 SELECT=0x04 START=0x08
  RIGHT=0x10 LEFT=0x20 UP=0x40 DOWN=0x80`.
- Per-frame site: `sampleInput(state)` at `games/batman/src/main.js:249`, once
  per logic frame inside `while (acc >= FRAME_MS && steps < 4)`.
- GAMEPAD ALREADY WORKS HERE. `sampleInput` does `now = (held | gp | touchHeld)
  & 0xFF` (input.js:82) and `readGamepad()` (input.js:89) polls
  `navigator.getGamepads()` with the Standard mapping: buttons[0]->A,
  buttons[2]/[1]->B, [8]->SELECT, [9]->START, [12..15] + axes[0]/[1] (threshold
  0.5) for directions. This file is the reference implementation and is partly
  reusable verbatim.
- Input lead is ONE tick (Game Boy, HANDOVER section 7). Sampling inside VBlank.

**Gradius** (`games/gradius/src/input.js`)
- Joypad read `$81BF`, called from NMI at `$80A4`. Held at `$0007`, pressed
  (edge) at `$0005`. Bit layout (measured by RAM diff, input.js:15): RIGHT $01,
  LEFT $02, DOWN $04, UP $08, START $10, A $80 (B and SELECT exist in KEYMAP;
  exact values in `games/gradius/src/state.js` BTN, not re-derived here).
- NO GAMEPAD today. Touch feeds `setTouchButton`/`setTouchDirections` ->
  `noteInput()` -> a TWO-DEEP QUEUE, drained one word per logic frame by
  `nextInputWord()` at `games/gradius/src/main.js:280`, which feeds `nmi()`.
- THE QUEUE IS LOAD-BEARING (waves 14 and 15, documented at length in input.js).
  A bit may never leave the queue while it is still an undelivered press
  (`tail := w | (tail & ~prev)`); `lostEdges` is counted and
  `tests/loop.test.js` asserts the books balance over 40,000 events. ANY
  gamepad/touch path MUST feed through `noteInput()` or it re-creates the
  wave-13 dropped-tap defect. Input lead ZERO (measured, input.js:8).

**DaiOuJou** (`games/ddpdoj/src/input.js` + `games/ddpdoj/src/web/input.js`)
- ROM input read is build A's `$13D464` (reached via `$13BDBA -> $13C7D4`),
  ONE port-word read per IRQ6 (input.js:13). Bits are POSITIONAL in the p1raw
  mirror; the keyboard synthesises a port word via `portWordFromBits(bits)`
  (input.js:52), the inverse of the board's `ror.w #1` shuffle.
- Bit positions in `games/ddpdoj/src/machine.js:262`:
  `BIT = { up:0, down:1, left:2, right:3, b1:4, b2:5, b3:6, start:15 }`.
  CONTROLS (web/input.js:44): UP/DOWN/LEFT/RIGHT, SHOT=b1, BOMB=b2, AUTO=b3,
  START=start. The mover tests X and Y independently (diagonals are two bits).
- Per-frame site: `currentPortWord()` is read inside `Demo.step()` at
  `games/ddpdoj/src/web/app.js:785`, once per logic frame, feeding `g.step()`.
  There is NO queue; the live mask is read directly each logic frame. Input lead
  ZERO (measured, input.js:24).
- Keyboard lives in `src/web/input.js` (`attachKeyboard`, KEYMAP e.code ->
  control name). Touch lives there too (`attachPad`, `setTouchButton`,
  `setTouchDirections`, `dpadMask` 3x3 grid).

**Launcher / registry** (`index.html`, `games/index.json`)
- The launcher reads `games/index.json` and each `games/<id>/game.json`. Three
  states per card (index.html:291): (a) inline via `code.entry` + `code.input`
  + `code.mods` (Batman only); (b) own page via `code.page` (Gradius
  `start.html`, DOJ `index.html`); (c) listed, disabled.
- For Batman the launcher imports `code.input` and calls `inputMod.setTouchButton`
  (index.html:484/489) for the on-screen pad, i.e. the launcher owns the pad
  LAYOUT and Batman's input.js owns the BITS. DOJ and Gradius own both, on their
  own pages.

**Headless gates are structurally isolated from the DOM input path.** This is
the single most important fact for the regression guard:
- Batman `attachInput` returns early with no `window` (input.js:54); the oracle
  harness drives `state.input` directly. `tools/test-all.mjs` (27/27) never
  imports the keyboard/gamepad path.
- Gradius gates drive `readJoypad()` and the queue directly (`tests/input.test.js`,
  `tests/loop.test.js`); `games/gradius/tools/test-all.mjs` (13 stages) is
  ROM/NMI-driven, not DOM-driven.
- DOJ gates drive the mask / port word directly (`tests/web-input.test.js`).
So an input refactor CANNOT regress the 27/27 or 13-stage gates. The real risk
is the LIVE page (owner play-test domain) and the three input UNIT test suites.

---

## 1. MODULE HOME

**Decision: a new repo-root `shared/input.js` (ES module, `.js`; package.json is
already `"type": "module"`).**

Why, based on what exists (not a guess):
- There is NO `common/`, `shared/` or `lib/` dir today (verified). The three
  games each keep a ROM-faithful input module under `games/<id>/src/` that cites
  ROM addresses (`$07CC`, `$81BF`, `$13D464`). That code MUST stay per-game: it
  is the port's claim against the cartridge. The shared layer is a NEW upstream
  concern (gamepad + analog + normalization), not a replacement.
- The launcher's own comment (index.html:229) says: "splitting it into
  `shared/launcher/` waits until a second game has shown which half is actually
  generic." A genuinely shared INPUT concern is the first such second-game
  shared thing, so creating `shared/` is precedent-setting in exactly the way
  the launcher already anticipated. `shared/input.js` matches that convention.
- Import paths work for all three consumers:
  - launcher (Batman inline): `./shared/input.js`
  - `games/gradius/index.html`: `../../shared/input.js`
  - `games/ddpdoj/index.html`: `../../shared/input.js`

**Build change required (one line, flag for the implementer):**
`tools/build-dist.mjs` INCLUDE list (line 61-66) must add the new dir, e.g.
`'shared'`, so it is published into `dist/shared/`. Without it the live site
404s the module and the pages black-screen. This is a `tools/` edit, not a
`games/*/src/` edit, so it respects the read-only rule.

The ROM-level modules stay where they are and are NOT touched by the shared
layer (see section 3).

---

## 2. NORMALIZED ABSTRACTION (exact shape)

The shared module produces ONE normalized state object. Each source (gamepad,
touch, keyboard) writes into it; each game reads it through its own adapter.

```js
// shared/input.js
// The normalized state. Frozen shape; mutated by the controller only.
export const NORMAL = Object.freeze({
  // 8-WAY DIRECTION, as independent axis booleans. A diagonal sets TWO.
  // (Matches every game's mover: DOJ tests X/Y independently, Batman/Gradius
  //  joypads carry one bit per direction. 8-way = 4 cardinal + 4 diagonal +
  //  neutral, represented without an enum.)
  up: false, down: false, left: false, right: false,
  // GENERIC FACE ACTIONS. Neutral names: each game's adapter maps these to its
  // own ROM bits. a1/a2/a3 is the widest superset any game needs.
  a1: false, a2: false, a3: false,
  // SYSTEM BUTTONS.
  start: false, select: false,
  // DIAGNOSTIC. Which source last changed the state. Printed on the status
  // line so a stuck direction is attributable to keyboard/touch/gamepad.
  source: null,   // 'keyboard' | 'touch-dpad' | 'touch-stick' | 'gamepad' | null
});
```

**Why this shape covers all three games without leaking:**
- DOJ needs three face actions (SHOT/BOMB/AUTO) -> a1/a2/a3, no select.
- Gradius needs two face actions (A=shot, B=power-up meter) -> a1/a2, plus
  start/select.
- Batman needs A/B/start/select -> a1/a2/start/select; a3 unused.
No game's concept appears in the shape; each game's adapter assigns meaning.

**Direction representation is deliberately four booleans, not an enum.** The
brief says "8-way digital" and "gate the analog angle to 8 directions": the
analog/floating-stick sources quantize to an octant, then set the one-or-two
booleans for that octant. Four booleans is exactly 8-way + neutral, and it maps
straight onto every game's bit layout without a lookup table.

The controller exposes (signatures, not implementation):
```js
createInput({
  keyboard: KEYMAP_BY_CODE,     // e.code -> 'UP'|'DOWN'|...|'A1'|'A2'|'A3'|'START'|'SELECT'
  gamepad: GAMEPAD_MAP,         // standard-button-name -> normalized action
  touch:   { scheme: 'fixed'|'floating'|'auto', dpadEl, faceEls, stickZoneEl },
}) -> controller

controller.attach(target)       // wire keyboard listeners + gamepad events
controller.pollGamepad()        // call each animation frame; refreshes gamepad state
controller.state()              // -> snapshot of NORMAL (held levels)
controller.onChange(fn)         // fn(snapshot, source) on any normalized transition
                               // (queue-fed games use this; see section 3)
controller.attachFixedDpad()    // the existing 8-way D-pad, as a touch source
controller.attachFloatingStick()// the new floating stick, as a touch source
controller.detach()
```

---

## 3. PER-GAME ADAPTER (feeds; does not replace the ROM model)

Each game's ROM-faithful input code stays INTACT. The adapter reads normalized
state and writes into the game's EXISTING touch-setter API, which already runs
through that game's edge/queue/port-word arithmetic. Nothing in `games/*/src/`
that cites a ROM address changes.

**DOJ adapter** (`games/ddpdoj/src/web/input.js` is the integration point; the
adapter can live there or in a thin sibling). DOJ has no queue, so the adapter
just OR's normalized bits into the live mask that `currentPortWord()` reads each
logic frame (app.js:785). Concretely: build the direction/action mask from
normalized state every frame and OR it into `currentMask()` alongside
`keyHeld | touchHeld`. The existing `portWordFromBits` (input.js:52) does the
ROM shuffle unchanged. Net: a new producer of bits, feeding the same path touch
already feeds.

**Gradius adapter** (integration point `games/gradius/src/input.js`). Gradius
HAS a queue, and the wave-15 invariant must hold for gamepad/touch too. So the
adapter subscribes to `controller.onChange` and calls the EXISTING
`setTouchDirections(mask)` / `setTouchButton(bit, down)` (input.js:248/258),
which run through `noteInput()` -> the queue. A quick gamepad tap therefore
survives exactly as a quick keyboard tap does; `lostEdges` still balances and
`tests/loop.test.js` still passes. The keyboard poll is NOT inside the
catch-up loop (the wave-14 rule: the host clock decides only HOW MANY frames,
never WHAT they read).

**Batman adapter** (integration point `games/batman/src/input.js`). Batman
already OR's `held | gp | touchHeld` in `sampleInput` (input.js:82). The
adapter replaces the inline `readGamepad()` with `controller.state()` (or OR's
normalized state into `gp`) so the existing `seen`/`firstSample`/repeat guard
(input.js:68) and the one-tick lead are untouched. Touch keeps using
`setTouchButton`.

The launcher's Batman pad (index.html:484/489 `inputMod.setTouchButton`) keeps
working unchanged: it feeds Batman's existing touch setter, which the adapter
reads through normalized state.

---

## 4. KEYBOARD Y/N (recommendation: phase it)

**Recommendation: Phase 1 keeps the keyboard per-game (gamepad + touch route
through the shared layer). Phase 2 (optional, owner's call) unifies keyboard
through the shared layer afterward.**

The owner's expanded scope (point 4) describes the end state with keyboard
unified. That is the cleaner long-term design and a prerequisite for the
COMBINED-games goal (HANDOVER section 1). But two of these three games are
COMPLETE / CLEAN (Batman 27/27 bit-exact, Gradius 13-stage green), and each
keyboard path carries subtle, hard-won behaviour:

- Batman's `seen`/`firstSample`/`e.repeat` guard (input.js:38/68) exists because
  the Enter that clicked LAUNCH otherwise registers as START on frame 1 and the
  player drops straight into the level. It looked like a caching bug.
- Gradius's queue and the wave-15 merge rule are the most subtle code in any of
  the three input modules; `tests/loop.test.js` is the only thing that asserts
  its invariant.
- DOJ's keyboard is the simplest, but it shares the same launch-Enter concern.

Moving the keyboard into the shared layer means generalising all three of those
guards and REWRITING all three input unit test suites
(`games/batman/tests/input.test.js`, `games/gradius/tests/input.test.js` +
`loop.test.js`, `games/ddpdoj/tests/web-input.test.js`). That is real risk on
two shipping games for a cleanliness win the owner can take later.

**Phase 1 delivers the whole expanded scope (gamepad + both touch schemes +
picker) for all three games, with the keyboard paths frozen and therefore zero
risk to the launch-Enter and queue invariants.** The shared module is DESIGNED
to accept keyboard from day one (`controller.attachKeyboard`, `KEYMAP_BY_CODE`),
so Phase 2 is a rewire, not a redesign. Swiss QWERTZ + KeyY/KeyZ is preserved
either way: in Phase 1 the existing per-game KEYMAPs are untouched (they
already bind both `KeyY` and `KeyZ`); in Phase 2 the shared `KEYMAP_BY_CODE`
maps both codes to the same action by config.

---

## 5. GAMEPAD SPECIFICS

**Standard mapping (W3C Standard Gamepad), button/axis indices the shared
layer reads.** `pad.mapping === "standard"` is the gate to using these at all.
- D-pad: `buttons[12]` up, `[13]` down, `[14]` left, `[15]` right.
- Face: `[0]` A (bottom), `[1]` B (right), `[2]` X (left), `[3]` Y (top).
- System: `[8]` back/select, `[9]` start, `[16]` home (if present).
- Shoulders/triggers: `[4]` LB, `[5]` RB, `[6]` LT, `[7]` RT (LT/RT may be
  analog: use `.pressed` if present else `.value > 0.5`).
- Sticks: `axes[0]/[1]` left, `axes[2]/[3]` right. Use the LEFT stick for
  movement; the right stick is unused by default (these are not twin-stick
  games; DOJ/Gradius are single-stick shmups, Batman is a platformer).

**Per-game GAMEPAD_MAP (default; player-overridable is a Phase-2 nicety):**
- Batman: A->a1, B->a2, back->select, start->start.
- Gradius: A->a1 (shot), B->a2 (meter/power-up), back->select, start->start.
- DOJ: A->a1 (SHOT), B->a2 (BOMB), X->a3 (AUTO), start->start. (Button 8
  unmapped: DOJ has no select.)

The shared layer exposes Standard buttons by canonical NAME; the per-game
config maps name -> normalized action. The layer never names a game concept.

**Analog deadzone + 8-way gate** (the arcade panels were 8-way digital, so the
analog is quantized, never passed through as analog):
- Radial deadzone `DZ = 0.28` (typical generic value; Batman's current 0.5
  per-axis threshold in input.js:99 is coarse and should be replaced by this).
  `mag = hypot(x, y)`; if `mag < DZ` -> no direction.
- 8-way gate: `angle = atan2(y, x)`; `octant = round(angle / (PI/4))` mod 8;
  map octant to the four booleans (cardinals set one, diagonals set two).
- Hysteresis option (flag, not silently added): keep the last octant while the
  new angle stays within its boundary band, to stop flicker on the cardinal /
  diagonal edge. Decide at implementation time against a real pad.

**`gamepadconnected` / `gamepaddisconnected`:** set a `hasPad` flag for UI
("controller detected"). But the browser USER-GESTURE requirement means a pad
often only reports after the first button press, so the events are a HINT only;
the reliable path is to poll `navigator.getGamepads()` every frame regardless
(Batman already does this at input.js:91). `pollGamepad()` is called once per
ANIMATION frame (rAF), not per logic frame.

**Per-frame polling location, per game:**
- Batman: inside `sampleInput` (the existing call site at main.js:249); the
  adapter calls `controller.pollGamepad()` then reads `controller.state()`.
  One poll per animation frame is the goal; `sampleInput` runs up to 4x per
  animation frame under load, so the poll should be hoisted to the rAF callback
  in main.js and `sampleInput` only reads cached normalized state. (Detail for
  the implementer; does not change the ROM model.)
- Gradius: `pollGamepad()` in the rAF callback; normalized changes push through
  `onChange -> setTouch* -> noteInput` (the queue). The per-logic-frame read at
  main.js:280 (`nextInputWord`) is unchanged.
- DOJ: `pollGamepad()` in the `Demo.loop` rAF callback (app.js:1070); the
  adapter OR's normalized state into the mask read by `currentPortWord()` at
  app.js:785.

**Non-standard pads:** if `pad.mapping !== "standard"`, skip mapping (log the
pad id once on the status line), fall through to keyboard/touch. Never guess a
layout and never crash. Batman's current code already tolerates a missing pad
(getGamepads returns sparse arrays); keep that.

---

## 6. TOUCH SCHEMES (fixed 8-way D-pad + floating analog stick)

The owner confirmed the 4-way-to-8-way D-pad change was good; 8-way stays for
the D-pad AND any analog source. The existing fixed D-pad is kept; the floating
stick is added as an ALTERNATIVE.

**Fixed 8-way D-pad (existing, unchanged behaviour).** Already implemented
per-game:
- DOJ: `dpadMask` 3x3 grid in `src/web/input.js` (corner thirds report TWO
  bits for diagonals).
- Gradius: `dpadMask` in `src/input.js`, same 3x3 logic.
- Batman: `setTouchButton` per direction, driven from the launcher pad.
Output: four direction booleans, exactly the normalized `up/down/left/right`.

**Floating / dynamic analog stick (new, shared).** A common mobile-shmup
pattern. The stick origin appears wherever the player first touches inside a
MOVEMENT ZONE, then tracks the drag delta; output is 8-way (the drag vector
runs through the same deadzone + 8-way gate as the physical analog stick).
- `pointerdown` in the movement zone (coarse pointer only): record `origin =
  (clientX, clientY)`, set pointer capture so the finger that leaves the zone
  still delivers its release (the same lesson DOJ/Gradius D-pads already carry).
- `pointermove`: `delta = (clientX-origin.x, clientY-origin.y)`; apply the
  shared deadzone + 8-way gate from section 5; set the four direction booleans.
- `pointerup/pointercancel/lostpointercapture`: clear direction.
- One finger owns the stick at a time (mirror the D-pad's `padPointer` guard).
- Face buttons (SHOT/BOMB/AUTO, A/B, etc.) remain the existing fixed cluster on
  the other side of the screen; the floating stick replaces ONLY the D-pad.
- Visual: draw a small ring at the origin and a knob at the current delta
  position (CSS-only, pointer-events none). Not load-bearing.

**Why both schemes feed the SAME normalized direction:** the floating stick and
the fixed D-pad both produce four booleans, so the adapter and the ROM model
cannot tell them apart. This is what lets the player pick at runtime (section 7)
with no game-logic change.

Touch/pointer events (not touch events), `touch-action: none`, `preventDefault`,
pointer capture, and the blur/pagehide/visibilitychange BACKSTOP all stay as
they are (DOJ index.html:555-558, Gradius index.html equivalent). The shared
floating-stick module reuses the same disciplines.

---

## 7. CONTROL-SCHEME PICKER (placement, per game)

The physical-gamepad path is AUTOMATIC (detected via the Gamepad API, no
picker). The picker chooses the TOUCH scheme: Fixed D-pad vs Floating stick vs
Auto. Default recommendation below.

**Default recommendation (Auto rule):**
1. If a Standard gamepad is connected (`controller.hasPad`), use it; the
   on-screen pad can hide entirely or dim.
2. Else on a COARSE pointer (`(pointer: coarse)`) use the touch scheme the game
   defaults to: floating stick for DOJ and Gradius (vertical shmups, where a
   dynamic stick is the genre standard) and fixed D-pad for Batman (platformer,
   precise 4-8 way).
3. Else (fine pointer, desktop) keyboard is primary; touch is off.
The player can override. Persisted per game in `localStorage`.

**Picker placement (found, per game):**
- **Batman: the launcher.** `chooseGame('batman')` builds the picker
  (`buildPicker`, index.html:327) which already calls `buildOptions()`. Add a
  Controls option there (a `<select>` like the level/kit selects), persisted as
  `localStorage['batman.controls']`, read in `chooseGame` and passed to the
  touch pad builder. The launcher owns the pad layout for Batman (it already
  calls `inputMod.setTouchButton`), so this is the natural and ONLY place.
- **Gradius: `games/gradius/start.html`.** It already has a "Starting kit"
  section, level select and presets, all read out of `game.json` and `mods.js`
  (start.html:118-133). Add a Controls section (Fixed / Floating / Auto) beside
  the kit; persist in `localStorage['gradius.controls']` and pass to
  `index.html` via the existing hash handoff (start.html:266 `hashFor`).
- **DaiOuJou: `games/ddpdoj/index.html`.** DOJ has NO start/select screen; it
  boots straight into the stage. The `#bar` already carries TATE and INFO
  buttons (index.html:225-226). Add a CTRL button (or a radio inside the INFO
  overlay, alongside the existing TATE/WIDE/Controls prose) that cycles /
  selects the touch scheme, persisted as `localStorage['ddpdoj.controls']`.
  Recommendation: CTRL in `#bar` for one-tap access during play, matching TATE.

---

## 8. REGRESSION GUARD

**Strategy: additive gamepad + touch layer; the keyboard path is frozen in
Phase 1 (section 4). The ROM-level edge/queue/port-word code is never touched
(the adapter feeds through each game's existing touch setters).**

**Why the headless gates cannot regress** (the structural point from section 0):
they drive `state.input` / the queue / the port word directly and never import
the DOM input modules. So:

Gates that MUST pass, named (from HANDOVER section 5):
```
node --test games/batman/tests/          # 740 pass, incl. tests/input.test.js
node tools/test-all.mjs                  # Batman ALL GREEN 27/27, 0 skipped
node --test games/gradius/tests/         # incl. tests/input.test.js, tests/loop.test.js
node games/gradius/tools/test-all.mjs    # GREEN, 13 stages, 0 skipped (read the skip line)
node --test games/ddpdoj/tests/          # incl. tests/web-input.test.js
```
Plus any new shared test (e.g. `shared/input.test.js` via `node --test` on a
new test file, or a `tests/` under a shared test path). The build must also
still pass `node tools/publish.mjs --dry` (the ROM-leak guard is unaffected,
but the new `shared/` dir in the INCLUDE list (section 1) must not pull
anything ROM-derived).

**Where the real risk lives and how it is bounded:**
- LIVE page play (no gate covers it): the owner play-tests each game after each
  wave. This is the primary verification for gamepad/touch behaviour, exactly
  as it was for the six play-report defects this week.
- Input UNIT tests: Phase 1 must keep `tests/input.test.js`,
  `tests/loop.test.js`, `tests/web-input.test.js` green UNCHANGED, because the
  keyboard/touch-setter/queue code is unchanged. If any of them need edits, the
  edit must be red-validated (break the guard, watch red, restore, watch green)
  per HANDOVER rule 4.
- Gradius queue invariant: `tests/loop.test.js` PART 2b (the same-mask guard)
  is the specific check that catches a pad/touch source that bypasses
  `noteInput`. The adapter MUST feed through `setTouch*`; this test enforces it.

---

## 9. MOBILE

Same code path serves mobile Bluetooth pads (Web Gamepad API is device-agnostic:
XInput on PC, Bluetooth HID on mobile). No separate implementation. A phone
with a Bluetooth pad gets the physical-gamepad path automatically
(`controller.hasPad`); a phone without gets the touch scheme the player picked.
The existing touch/pointer pad stays for phones without pads. Confirmed: one
normalised state, three sources, no platform fork.

---

## 10. WAVE BREAKDOWN (honest phasing)

The owner said the touch work is "maybe same wave, maybe its own". The phasing
below keeps each wave independently shippable and the gates named. The owner
collapses waves after seeing this.

**Wave A: shared module + GAMEPAD on DaiOuJou (the active game).**
- New `shared/input.js`: normalized state, Standard-mapping gamepad poll,
  radial deadzone + 8-way gate, connected/disconnected (hint), non-standard
  fallback, `createInput`/`attach`/`pollGamepad`/`state`/`onChange`.
- DOJ adapter: OR normalized gamepad bits into the mask `currentMask()` reads
  (web/input.js); wire `controller.attach` + per-rAF `pollGamepad` in app.js.
- `tools/build-dist.mjs`: add `shared` to the INCLUDE list.
- Files: `shared/input.js` (new), `games/ddpdoj/src/web/input.js` (additive),
  `games/ddpdoj/src/web/app.js` (wire), `games/ddpdoj/index.html` (none likely,
  gamepad is code-only), `tools/build-dist.mjs` (one line).
- Gate: `node --test games/ddpdoj/tests/` green; `web-input.test.js` unchanged
  or extended with a gamepad test (red-validated). Owner live-plays DOJ with a
  pad on desktop and mobile.
- Size: medium. One new module, ~30 adapter lines, one build line.

**Wave B: GAMEPAD on Gradius + Batman.**
- Gradius adapter: `controller.onChange -> setTouchDirections/setTouchButton ->
  noteInput` (queue preserved); `pollGamepad` in the rAF callback. Wire in
  `games/gradius/index.html` and/or `src/main.js`.
- Batman adapter: replace inline `readGamepad()` (input.js:89) with
  `controller.state()`; keep the existing OR in `sampleInput`. Hoist the poll
  to the rAF callback.
- Files: `games/gradius/src/input.js` or a sibling (additive gamepad feed),
  `games/gradius/index.html`, `games/batman/src/input.js` (refactor readGamepad
  to shared normalizer), `games/batman/src/main.js` (poll site), maybe
  `index.html` (launcher pad path stays, reads normalized).
- Gates: `node games/gradius/tools/test-all.mjs` (13 stages, 0 skipped);
  `node --test games/gradius/tests/` (input.test.js, loop.test.js UNCHANGED);
  `node tools/test-all.mjs` (Batman 27/27); `node --test games/batman/tests/`.
  SPECIFIC WATCH: `tests/loop.test.js` PART 2b proves the gamepad feeds through
  the queue and not around it.
- Size: medium. The Gradius queue is the risk surface; the loop test is the
  guard.

**Wave C: touch schemes (floating stick) + control-scheme picker, all three.**
- `shared/input.js` (or `shared/touch.js`): floating-stick module (pointer
  origin-on-touch, deadzone + 8-way gate, capture, backstop), reusing the D-pad
  disciplines.
- Per-game picker UI: launcher `buildOptions` for Batman; start.html Controls
  section for Gradius; DOJ `#bar` CTRL button. `localStorage` persistence per
  game. Auto-default logic (section 7).
- Files: `shared/input.js` (add floating stick), `index.html` (launcher
  Controls + Batman pad mode switch), `games/gradius/start.html`,
  `games/gradius/index.html`, `games/ddpdoj/index.html`.
- Gates: input unit tests green; owner live-plays on a phone (fixed vs floating
  vs pad) per game.
- Size: medium-large (UI in three places). No ROM-model change.

**Wave D (optional, owner's call): unify keyboard through the shared layer.**
- Move KEYMAP (e.code -> normalized name) and the `seen`/`e.repeat`/
  firstSample/launch-Enter guard into `shared/input.js` as a generalised
  keyboard adapter; per-game `KEYMAP_BY_CODE` is config.
- Rewrite the three input unit test suites around the shared keyboard adapter,
  each red-validated.
- Files: `shared/input.js`, all three `src/input.js` / `src/web/input.js`, all
  three `tests/*input*.test.js` + `tests/loop.test.js`.
- Gates: every input test suite + all three headless gates. Highest risk; do
  last, and only if the COMBINED-games work is near enough to justify it.
- Size: medium. This is where the owner's "one unified input source" vision
  (expanded scope point 4) fully lands.

---

## 11. OWNER DECISIONS (answered 2026-08-06; supersede section 4's Phase-1 keyboard recommendation)

- **Keyboard: UNIFY IN ONE PASS.** Keyboard moves into the shared layer for all
  three games now. Section 4's "Phase 1 freeze keyboard / Phase 2 unify" split is
  SUPERSEDED. This raises regression risk on Batman (27/27) and Gradius
  (13-stage): every input unit test must be red-validated; the launch-Enter guard
  (Batman input.js) and the Gradius queue invariant (tests/loop.test.js) must be
  preserved.
- **DOJ bomb: button B** (Standard button 1), matching the arcade panel and the X
  key.
- **Floating-stick movement zone: left half** for DOJ/Gradius (tate), bottom-left
  for Batman (implementer default; owner did not override).
- **Touch Auto default: FLOATING STICK** for DOJ/Gradius when no pad is connected.
  Fixed 8-way D-pad stays available via the picker.

Original open questions, kept for context:

1. **Keyboard unification timing.** Phase 1 ships gamepad + touch + picker with
   the keyboard frozen (zero risk to launch-Enter / the queue invariant). Phase
   2 unifies keyboard. Is Phase 1 now and Phase 2 later the right split, or do
   you want keyboard unified in one pass?
2. **DOJ gamepad bomb button.** Default `B->BOMB`, or `RB/RT->BOMB` (so the
   right thumb never leaves SHOT)? Pickable in Phase 2; needs a default now.
3. **Floating-stick movement zone.** Left half of the stage? A designated
   bottom-left rectangle? The choice trades reachability against not occluding
   the playfield. Recommend left half for DOJ/Gradius (tate), bottom-left for
   Batman.
4. **Picker default for DOJ.** Floating stick is the genre standard for mobile
   shmups; confirm as the Auto default, or keep the fixed D-pad (already
   shipped, 8-way) as default.

---

## 12. IF SOMEONE PICKS THIS UP COLD

- Read section 0 (premise check) first: it cites the exact line per game where
  input is sampled and the ROM address each module mirrors.
- The shared module is additive. It does not replace any ROM-faithful input
  module; it feeds each game's existing touch setters (section 3).
- The gates cannot regress from Phase 1 (section 8); the risk is live play and
  the input unit tests.
- Build the module home (`shared/input.js`) and the one-line `build-dist.mjs`
  change (section 1) FIRST, or every page that imports it black-screens.
