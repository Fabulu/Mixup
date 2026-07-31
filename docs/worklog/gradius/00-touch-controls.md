# Gradius: on-screen (touch) controls for games/gradius/index.html
status: DONE (code + tests green; the phone itself is UNVERIFIED -- no browser here)
wave: 0   role: impl   started: 2026-07-31

## The task, as I understood it

`games/gradius/index.html` is a standalone page and is keyboard-only, so the
port is unplayable on a phone. Add an on-screen pad that drives the SAME state
the keyboard drives (`$0007` held / `$0005` edge, via `currentButtons()` ->
`readJoypad()`), carry over the lessons already paid for in the root launcher's
touch block and `games/batman/src/input.js`, and prove it with a test that has
been seen to go red.

I have NO BROWSER in this environment. Nothing below is a claim that the pad
works on a phone. See "What a human still has to check".

## What I read first

- `docs/worklog/README.md` (in full)
- root `index.html` lines 91-112 (pad CSS) and 462-500 (pad wiring)
- `games/batman/src/input.js` (`setTouchButton` / `clearTouchButtons`, the two
  separate masks, the `seen` repeat guard)
- `games/gradius/src/input.js`, `src/state.js` (`BTN`), `src/player.js`,
  `src/main.js` (`fitCanvas`), `games/gradius/game.json`

## The bit layout I am driving (MEASURED in this port, not looked up)

`games/gradius/src/state.js` `BTN`, sourced from PROBE.md 4 (A/B RAM diff):

    RIGHT $01  LEFT $02  DOWN $04  UP $08  START $10  SELECT $20  B $40  A $80

The low nibble is direction, which is why `AND #$0F` at $A082 is a single "any
direction held" test. `readJoypad()` writes `$0007` (held) and `$0005` (the
rising edge against the previous held byte) -- the touch mask is OR'd into
`currentButtons()` BEFORE `readJoypad()` runs, so it goes through exactly the
same edge computation the keyboard does. There is no second input path.

## Design

`src/input.js` gains a SECOND mask, `touchHeld`, OR'd with the keyboard `held`
in `currentButtons()`. Two masks and not one, the same split Batman uses: the
two paths lose events in different ways (a missed `keyup` vs a stolen pointer
gesture) and each has its own recovery, so merging them lets one path's reset
wipe the other's live state.

New exports, all pure or module-local:

- `TOUCH_BUTTONS` -- `{UP,DOWN,LEFT,RIGHT,A,B,SELECT,START}` -> bit. The page
  looks masks up here through `data-btn`, so the layout is HTML and the bits
  are one table in one file.
- `setTouchButton(bit, down)` / `clearTouchButtons()`
- `setTouchDirections(mask)` -- replaces the whole low nibble at once
- `dpadMask(u, v, w, h)` -- pure hit test, the piece the tests can drive

### The d-pad is a surface, not four buttons

Gradius needs diagonals: `updatePlayer()` tests X ($A021/$A033) and Y
($A04B/$A065) INDEPENDENTLY -- there is no diagonal case, so two bits at once
is the only way to fly diagonally, and a pad that cannot report two is a
crippled ship.

Four separate `<button>`s with `setPointerCapture` on each cannot do it: the
capture that stops a stuck direction also stops a second button ever seeing the
finger. So the d-pad is ONE capture target (the 3x3 grid container) and the
direction mask is computed from where the pointer is inside it:

    cx = u/w, cy = v/h
    cx < 1/3 -> LEFT   cx >= 2/3 -> RIGHT   (middle third: neutral on X)
    cy < 1/3 -> UP     cy >= 2/3 -> DOWN    (middle third: neutral on Y)

A corner cell is a third of the width by a third of the height and reports two
bits. `pointermove` re-evaluates, so a finger can slide from LEFT to UP+LEFT
without lifting. Out-of-range coordinates fall into the outer bands by
construction, so a finger that slides off the pad keeps its direction rather
than going neutral -- and the release still arrives because of the capture.
The nine cells are `<i>` elements, non-interactive, lit from the mask (both
edge cells and the corner light on a diagonal).

Only one pointer owns the d-pad at a time (`padPointer`), so a second finger
landing on the pad cannot steal it and its `pointerup` cannot clear the first
finger's direction.

### Layout

d-pad left, cluster right: SELECT + START (small, side by side) stacked ABOVE
B and A. That is the launcher's hard-won lesson (START inline with A/B made the
cluster wider than the space beside the d-pad and pushed A off the right edge
on narrow phones), adapted to the NES's four buttons.

Portrait: the pad is in normal flow under the canvas, so `#stage` shrinks and
`fitCanvas()` picks a smaller INTEGER scale. Landscape on a short viewport:
`position: fixed` at the bottom with `pointer-events: none` on the container
and `auto` on the two clusters, so the pad sits in the letterbox either side of
the canvas and does not swallow taps over it.

`fitCanvas()` is untouched -- whole-device-pixel scaling is preserved; the page
just calls it again on `orientationchange` and on `visualViewport` resize.
(Note: the task brief mentions `canvas.dataset.scale`; that does not exist in
this port -- `fitCanvas()` in `src/main.js` sets `canvas.style.width/height`
from `Math.floor(min(availW/W, availH/H))` and RETURNS the scale. Nothing else
reads it.)

### Shown only on coarse pointers

`matchMedia('(pointer: coarse)')` adds `.on` to `#pad` and `.touch` to `<body>`
(which hides the keyboard legend). On a desktop the pad is `display: none` and
nothing about the keyboard path changes.

## What I MEASURED

### The gate

    $ node --test games/gradius/tests/
    # tests 45   # pass 45   # fail 0   # skipped 0   # todo 0

    (baseline before this change, the five pre-existing files:
     node --test .../nmi .../oam .../player .../ppu .../terrain
     # tests 28  # pass 28  # fail 0  # skipped 0
     so the 17 new ones are tests/input.test.js (12) + tests/page-wiring.test.js (5))

    $ node games/gradius/tools/test-all.mjs
      PASS  inputs
      PASS  unit tests (node --test games/gradius/tests/)
      PASS  port trace shape == probe.lua state vector
      PASS  port vs cartridge (compare.mjs)
      PASS  self-check: the comparison goes red when the port is broken
      GREEN -- 5 passed, 0 failed, 0 SKIPPED

    compare.mjs inside that run: 16 scenarios, 3341 of 4184 frames compared,
    0 failures, 0 clamps uncovered, 0 stale annotations; the three deliberate
    neuters (lead1, seed-x+1, laginject=450) all went red (153/116/146 TIER 1
    failures). The port's verified behaviour has NOT moved -- nothing in the
    frame path changed, only currentButtons(), which is host plumbing outside
    nmi().

    $ node --test games/batman/tests/registry.test.js     # I edited game.json
    # tests 13  # pass 13  # fail 0  # skipped 0

    $ node tools/build-dist.mjs
    rom-leak guard: 112 files checked against 2 ROM(s) -- clean, no allowlist
    dist/ built: 115 files, 1500 KB
    (games/gradius/index.html is published via PAGES, so the edited page goes
    through the guard; it is clean.)

I did NOT re-run `python games/gradius/tools/oracle/scen.py`. The recorded
corpus is already in the tree, stage 3 of the gate compared against it and
passed, and nothing this change touches is inside nmi() -- re-recording would
have re-measured the same cartridge frames with the same port code.

### The mutations -- every check here was SEEN TO FAIL

Each was applied to the real file, the suite run, the file restored
(`git diff --stat` afterwards shows only the intended change).

tests/input.test.js:

| # | the break | result |
|---|---|---|
| M1 | `TOUCH_BUTTONS`: transpose `A` and `B` | RED, 5 failures. `A: press frame` expected `{held:128,pressed:128}`, actual `{held:64,pressed:64}` |
| M2 | `currentButtons()` returns `held` only (touch never reaches the game) | RED, 6 failures |
| M3 | `dpadMask` reports one axis at a time (no diagonals) | RED, 2 failures; diagonal expected 10 (UP\|LEFT), actual 2 (LEFT) |
| M4 | `setTouchDirections` writes the whole byte, wiping A/B | RED, 1 failure; expected 138, actual 10 |
| M5 | `data-btn="SELECT"` -> `"SELCT"` in index.html | RED: `data-* "SELCT" is a button TOUCH_BUTTONS knows` |
| M6 | d-pad cell order in index.html drifts from game.json | RED: touchLayout test |
| M7 | game.json `B` mask 64 -> 65 | RED: `input.buttons is the $0007 layout` |
| M8 | `setTouchButton` never clears (a button that is never released) | RED, 1 failure |

tests/page-wiring.test.js (mutations to index.html's wiring):

| # | the break | result |
|---|---|---|
| P1 | d-pad `pointermove` bound to `pointermoveXX` (finger cannot slide) | RED; slide expected $81, actual $8A |
| P2 | no `setPointerCapture` on the face buttons | RED |
| P3 | the `blur` backstop deleted | RED, 2 failures; after blur, mask still $C6 |
| P5 | the `visibilitychange` backstop deleted | RED, 2 failures |
| P6 | `pad.classList.add('on')` deleted (pad never shown) | RED |
| **P4** | **`if (padPointer !== null) return;` deleted -- any second finger steals the d-pad** | **STILL GREEN** |

**P4 is the finding.** The guard that stops a second finger taking the d-pad
away from the first (and, one release later, leaving a stuck direction) was
reached by the suite but INTERROGATED by none of it: the only stray event I had
tested was a stray *pointerup*, which the pointerId check rejects anyway. I
closed it -- the test now fires a stray *pointerdown* at a different cell and
asserts the direction does not move:

    P4b, after the fix: RED, 1 failure -- expected 129 ($81 A|RIGHT), actual 132
    ($84 A|DOWN), i.e. the second finger had taken the pad.

### The fake-DOM harness, and what it is not

`tests/page-wiring.test.js` extracts the REAL `<script type="module">` text out
of `games/gradius/index.html`, rewrites only the two import specifiers
(`./src/main.js` to a stub, so nothing tries to `fetch()`; `./src/input.js` to
the real module by absolute URL), and runs it against the smallest DOM its
handlers touch. It asserts the mask through the real `currentButtons()`.

IT IS NOT A BROWSER. It has no layout, no real hit testing, no compositor and
no pointer-capture semantics -- it only proves that the page's own code calls
the port's input module with the values it computes from a bounding box. Layout
is exactly the half it cannot see.

One trap found while writing it, noted in the file: two `import()`s of
identical data: URLs return the SAME cached module, so the second and later
loads never re-ran the page script and every test after the first reported a
mask of 0. Each instance now carries a counter comment.

## What a human still has to check on a real phone

I HAVE NO BROWSER IN THIS ENVIRONMENT. I have not seen this pad render, and I
am not claiming it works on a phone. In likelihood order:

1. **Does the pad crowd the 256x240 canvas?** This is the biggest unknown.
   Portrait: the pad is in flow under the canvas and `fitCanvas()` should pick a
   smaller integer scale (my arithmetic for a 390x844 CSS px phone at dpr 3 says
   scale 4, canvas 341x320 CSS px, which fits -- ARITHMETIC, not a measurement).
   Landscape under 560 px tall the pad becomes `position: fixed` at the bottom
   with `pointer-events: none` on the container; check that the d-pad and the
   button cluster do not overlap the picture and that taps on the canvas area
   are not swallowed.
2. **Stuck directions.** Slide a finger off the d-pad and lift; slide off a face
   button and lift; press with two fingers at once; take a phone call
   mid-press; switch apps and come back. The ship must stop every time.
3. **Diagonals.** Put a finger in a corner third and confirm the ship flies
   diagonally, and that sliding around the pad changes direction without
   lifting. Confirm the corner third is big enough to hit reliably -- the cell
   is 48x48 CSS px here and that number is a guess, not a measurement.
4. **The scale is still WHOLE device pixels.** Rotate the phone, let the URL bar
   slide away, and check the dithering does not shimmer -- `fitCanvas()` floors,
   but it now runs on `orientationchange` and `visualViewport` resize too and I
   could not watch it.
5. **Nothing regressed on desktop.** `(pointer: coarse)` should be false on a
   mouse: no pad, keyboard exactly as before. A touchscreen laptop reports
   coarse and WILL show the pad -- that is intended, but somebody should look.
6. Firing does nothing yet, and that is not a bug in this change: no shot code
   is ported. A/B/START/SELECT reach `$0007`/`$0005` correctly (tested) and the
   page says so in the HUD.

## If someone picks this up cold

- The bits live in ONE place: `TOUCH_BUTTONS` in `games/gradius/src/input.js`.
  `index.html` names buttons (`data-btn`, `data-cell`), never masks;
  `game.json`'s `input` block is the written description and
  `tests/input.test.js` holds all three against `BTN`.
- The d-pad is deliberately NOT four buttons. If you "simplify" it into four
  captured buttons you will lose diagonals, and the ship needs them.
- `currentButtons()` is `held | touchHeld`. Nothing else may write
  `state.input` -- a second input path is how a control ends up working in the
  DOM and doing nothing in the game.
- The one place a mutation still survived and was then closed is the
  `padPointer` guard (P4 above). If you touch the d-pad handlers, re-run that
  mutation.
- STILL OPEN, not caused by this change: `games/gradius/index.html` cannot go
  through the root launcher (`code.entry`/`code.mods`/`code.input` are null,
  the port only has `boot()`). When it can, the launcher's pad is a DIFFERENT
  implementation with no diagonals -- the two will have to be reconciled, and
  this one is the one that can fly the ship.

