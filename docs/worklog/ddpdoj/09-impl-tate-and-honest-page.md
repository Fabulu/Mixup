# WAVE 9 — TATE, an honest page, the missing exhaust, and the silent laser

status: **DONE**
wave: 9   role: impl   started: 2026-08-01

Files touched, all inside `games/ddpdoj/`:
`index.html`, `src/web/app.js`, `src/render/capture.js`, `src/type5.js`,
`tests/web-page.test.js` (new), `tools/attachreport.mjs` (new).
`games/gradius/` and `games/batman/` untouched.

**The headline, if you read nothing else:** the splice was moving 3 of the
player's 8 display-list records. It now moves 8, and the reason the other 5 were
missed is that the matcher scored PRESENCE instead of scoring
CONDITIONAL ON PRESENCE, and never printed what it rejected. §3B.

## I HAVE NO BROWSER

Said plainly, once, and it governs everything below. There is no browser on this
machine and downloading one is forbidden. **Every CSS and layout claim in this
file is a claim about the rules I wrote, not about what a phone renders.** The
scaling ARITHMETIC is unit-tested; the LAYOUT is not tested at all and cannot be
here. The human-check list at the end is the honest boundary.

## The task, as I understood it

Five jobs from one phone session, plus five mid-flight corrections from the
coordinator (three of which were wrong and were withdrawn — see §7, which is the
process finding).

---

## 1. JOB 1 — TATE. AND THE FIRST THING I RULED OUT

**The brief's premise was wrong and it mattered.** It said "the page currently
shows the unrotated buffer, which is why it is a tiny horizontal strip". It does
not. `HEAD`'s `src/web/app.js` has always rotated:

```
$ git show HEAD:games/ddpdoj/src/web/app.js | grep -n "CANVAS_W\|rotateCCW"
50:export const CANVAS_W = SCREEN_H, CANVAS_H = SCREEN_W;      -> 224 x 448
140:    rotateCCW(this.rgb, SCREEN_W, SCREEN_H, this.rot);
$ grep -n 'canvas id="screen"' dist/games/ddpdoj/index.html
168:<div id="stage"><canvas id="screen" width="224" height="448"></canvas></div>
```

The DEPLOYED page was already TATE. Had I "fixed" it by rotating, the picture
would have come out sideways. **The tiny picture was JOB 2 all along**: the body
was a flex column, the banner was four paragraphs of 13 px monospace, and
`#stage` got whatever was left — on a 390 px phone that is a hundred-odd pixels,
so `fitCanvas` floored to scale 1 and drew the game at 224/dpr CSS px wide.

MAME's own declaration, confirmed as instructed:

```
$ mame.exe -listxml ddpdojblk | findstr /C:"<display"
  <display tag=":screen" type="raster" rotate="270" flipx="no"
           width="448" height="224" refresh="59.185606" ... />
```

so 224 wide by 448 tall is right, and the port was already producing it.

### What I built anyway

* `PICTURES` in `app.js`: `tate` = 224x448 with `rotateCCW`, `yoko` = 448x224
  raw. `Demo.setMode` resizes the canvas BACKING STORE; `draw()` picks whether
  to rotate.
* **The rotation stays in the pixel buffer. There is no CSS transform, and the
  canvas is explicitly set to `transform: none`.** That is the whole answer to
  "integer scaling must survive the rotation": the canvas's layout box is always
  an axis-aligned rectangle whose size is a whole multiple of the picture in
  device pixels, so there is nothing for a transform's output box to disagree
  with. A `rotate(90deg)` would have put the browser's resampler between the port
  and the glass, and any transform-origin rounding reintroduces exactly the
  fractional-scale defect the Batman ending was reported for.
* `pickScale(pic, cssW, cssH, dpr)` is PURE and exported so it can be tested.

### The choice, stated as required: TATE by default EVERYWHERE, WIDE by an explicit remembered toggle

Not automatic on orientation or pointer. Three reasons:

1. TATE is the *correct* picture on every device. Defaulting a desktop to the
   sideways buffer would have made the desktop page worse than it is today.
2. The owner's "PCs will of course play horizontal" I read as *the window* being
   landscape, not as wanting a sideways game. **This is the one place I am
   guessing at intent** — if it is wrong it is a one-line change of
   `DEFAULT_MODE`, and the toggle already exists either way.
3. Automatic switching on `orientationchange` means a phone tilted in a hand
   changes what the picture *is* mid-play. The two modes are different pictures,
   not two layouts of one.

The choice is stored in `localStorage` under `ddpdoj.mode`, inside `try/catch`
so private mode does not fail the boot.

---

## 2. JOB 2 — the layout

`body` is now `display: grid; grid-template-rows: auto minmax(0,1fr) auto` on
`height: 100dvh` (with `100vh` before it as the fallback). Three rows:

* a ONE-LINE bar: title, a compact stats line, the TATE/WIDE toggle, INFO;
* `#stage`, the only row that grows;
* the pad, keeping its landscape-letterbox `position: fixed` behaviour.

**Every word of prose is behind INFO, and INFO opens as a FIXED OVERLAY, not as
a block in the flow.** That is deliberate and it is the structural fix: the
canvas's size can no longer depend on how much text is open, so this defect
cannot come back by someone adding a paragraph. `100dvh` rather than `100vh`
because on a phone `100vh` is the viewport with the URL bar *hidden*, so a
`100vh` page is taller than the screen whenever the bar is showing and the pad
goes under the fold.

The error box and the loading status are also overlays, for the same reason.

---

## 3. JOB 3 — THE MATCHER WAS ASKING THE WRONG QUESTION

**Read §3B first; §3A is the first, incomplete answer and is kept because the
way it was wrong is the finding.**

### 3A → 3B in one line

§3A found the exhaust by lowering a threshold. The owner then found the
SHADOWS, which no threshold could ever have found. §3B replaces the threshold
with a differently-shaped test and gets EIGHT records, which is exactly what the
owner predicted from looking at the screen.

## 3A. The first answer: the pods were fine, the exhaust was not

This job was rewritten under me four times. What follows is what I MEASURED, in
the order I measured it; the wrong turns are in §7.

### 3.1 The count, from the display list, not from pixels

Every one of the 161 capture frames, classified by the record's offset from the
board's ship position:

```
   12 frames: {"other":37,"POD":2,"effect80x40":1,"SHIP":1,"effect16x32":1}
   11 frames: {"other":40,"POD":2,"SHIP":1}
   ... 40 distinct shapes, and in EVERY ONE of them: "SHIP":1
   1 frame:  {"other":39,"POD":3,"SHIP":1}      <- one duplicate pod record

records NOT tracking the player that reuse the SHIP's artwork: 0
ship artwork streams: $3      (ONE stream, all 161 frames)
```

**There is exactly one ship record on every frame and no second copy of the
ship's artwork anywhere in the list.** The "captured ship is still being drawn"
theory is dead: suppression is not needed because there was never a second ship.

### 3.2 The correlation, re-run with the threshold removed

`pixpack.mjs` histograms every record of every frame against the board's ship
position and accepts an offset holding on `--min-hit` (default **0.9**) of
frames. Re-running that histogram over the SHIPPED capture and printing
**everything**, not just the accepted:

```
  dx,dy      frames    size    streams  what it draws           what it is
  -16,-41    162/161   32x16     33     175 px                  option pod
  -16, 24    161/161   32x16     32     165 px                  option pod
  -24,-16    161/161   48x32      1     517 px, an aircraft     THE SHIP
  -52,-20     81/161   80x40     17    1515 px, a fire cloud    EXHAUST PLUME
  -30,-16     80/161   16x32      2     145 px, a round glow    exhaust glow
  -1428,-83   41/161   16x 1      1     -                       (impostor)
  -170,6      22/161   16x16      1     -                       (impostor)
```

and the two missing ones appear on **ODD capture frames only**:

```
-52,-20 frames 81 first 12: 1,3,5,7,9,11,13,15,17,19,21,23   parity 11111111...
-30,-16 frames 80 first 12: 1,3,5,7,9,11,13,15,17,19,21,23   parity 11111111...
```

**THE FINDING, and it is the answer to "why did the matcher accept exactly
three":** the matcher tested every record and rejected these two on its
threshold. They flicker at half the frame rate, so they can never score above
~50 %, and `--min-hit 0.9` was chosen for a record that is present every frame.
Nothing was overlooked; the acceptance rule was wrong for half the set.

So the player's own exhaust stayed on the RECORDED ship's path and flew off
across the screen. At **1515 drawn pixels against the ship's 517** it is the
biggest player-attached thing on screen, which is why it dominated the report.
The pods, at 165 and 175 px, were spliced correctly all along — the owner is
right, and D1 is right too, about a different thing (§3.4).

Rendered on their own, ASCII, to check they are what the numbers say:

```
=== idx 28  off -52,-20  80x40  stream $951  color 2       (an amorphous cloud)
=== idx 30  off -30,-16  16x32  stream $87   color 26      (a small round glow)
=== idx 29  off -24,-16  48x32  stream $3    color 0       (a detailed aircraft)
```

### 3.3 What I changed

`Capture.attached()` re-derives the tracking set at LOAD TIME from the bundle it
already has (`frameList[].refPy/refPx` and the sprite buffers are both already
shipped), at `ATTACH_MIN_FRACTION = 0.45`. **No asset rebuild is required** —
the owner's existing `assets/` and any deployed bundle keep working.

Measured on the real capture:

```
packer accepted offsets: ["-16,24","-16,-41","-24,-16"]
re-derived offsets      : ["-16,24","-16,-41","-24,-16","-52,-20","-30,-16"]
records spliced per frame: {"3":79,"4":2,"5":80}      (was {"3":160,"4":1})
packer records missing from the re-derivation: 0      (a strict SUPERSET)
```

0.45 is not tuned next to a cliff: the accepted minimum is 80/161 and the best
rejected is 41/161, and `tests/web-page.test.js` asserts the threshold sits
inside that gap.

The parser used is `parseSpriteList`, imported — not a private copy. A second
parser could drift on the terminator or the sign extension in silence.

### 3.4 Review defect D1: right about the WORDS, wrong if read as "the pods are broken"

D1 says the page claimed the pods are "computed live, by the port". That claim
IS false: the option object is `$24C096`, one of `type5.js`'s 22 counted-and-not-
run subsystem calls, and `grep p1Options src/` finds only the address constant.
But the pods are SPLICED, they sit at the board's own fixed offset from the
ship, and on screen they are correct — which is what the owner saw.

**So D1 is a WORDING defect. The fix is the text, not the code.** Both the
banner and `app.js`'s header now say the pods are relocated recorded sprites.

## 3B. THE REAL ANSWER: score CONDITIONAL ON PRESENCE

The owner, still just looking at the screen: *"one more thing in the recording
that's supposed to be with the ship: a shadow on the ground of your ship and
your two options"*, and then *"I think the shadow flickers"*.

Both true. And the second one is the key to the first.

### 3B.1 Why no threshold could have worked

`pixpack.mjs` asks **"is this record at a constant offset from the ship in
>= X % of frames?"** That single question conflates two unrelated things:

* **(a) is it PRESENT this frame?** On this hardware the dominant reason a
  sprite is absent is that **alternate-frame drawing is how transparency was
  faked** — a sprite drawn every other frame at 59.185606 Hz reads as ~50 %
  translucent on a CRT. Shadows and exhaust plumes are exactly what gets done
  that way. So an entire CLASS of player-attached records can never score above
  ~50 % on (a), for a reason that says nothing about attachment.
* **(b) GIVEN it is present, is it where the ship says?** That is attachment.

§3A moved the threshold from 0.9 to 0.45 and caught the exhaust. It would not
have caught the shadows even at 0.01, because **the shadows are not at a
constant offset from the ship at all** (§3B.3). The threshold was never the bug.

### 3B.2 The new test, and the eight records

Identity is the record's **appearance class** — `width x height, colour,
priority, flip` — because display-list slots are rebuilt from scratch every
frame and an index is not an identity. Score = of the frames in which a record
of that class exists at all, the fraction in which one sits at the modal
predicted position. Minimum sample 8 frames, so a class seen twice cannot pass
on 2/2. Two position models, both measured, never invented: `rigid` (constant
offset from the ship) and `ground` (§3B.3).

```
$ node games/ddpdoj/tools/attachreport.mjs
ATTACHMENT, conditional on presence -- 161 capture frames
accept: score >= 95% over >= 8 frames

class                 size    present  phase        model   offset        score  verdict
2x16 c0 p0 f0        32x16    161/161  every frame  rigid   (-16,24)     100.0%  ACCEPT
2x16 c0 p0 f2        32x16    161/161  every frame  rigid   (-16,-41)    100.0%  ACCEPT
3x32 c0 p0 f0        48x32    161/161  every frame  rigid   (-24,-16)    100.0%  ACCEPT
1x16 c24 p0 f0       16x16     81/161  EVEN         ground  (0,0)        100.0%  ACCEPT
1x8 c24 p0 f0        16x8      81/161  EVEN         ground  (0,20)       100.0%  ACCEPT
1x8 c24 p0 f2        16x8      81/161  EVEN         ground  (0,-12)      100.0%  ACCEPT
5x40 c2 p0 f0        80x40     80/161  ODD          rigid   (-52,-20)    100.0%  ACCEPT
1x32 c26 p0 f0       16x32     80/161  ODD          rigid   (-30,-16)    100.0%  ACCEPT
  ------------------------------------------------------  <-- TESTED AND REJECTED
2x24 c26 p0 f3       32x24      1/161  EVEN         rigid   (129,-26)    100.0%  sample<8
2x24 c26 p0 f2       32x24      1/161  ODD          rigid   (-37,80)     100.0%  sample<8
1x1 c0 p0 f0         16x1      70/161  irregular    rigid   (-1428,-83)   58.6%  reject
4x48 c11 p0 f0       64x48     30/161  irregular    ground  (226,70)      10.0%  reject
3x40 c11 p0 f0       48x40     54/161  irregular    rigid   (65,49)        7.4%  reject
4x40 c11 p0 f0       64x40     27/161  ODD          rigid   (-41,97)       7.4%  reject
2x16 c24 p0 f0       32x16     27/161  EVEN         rigid   (-113,133)     7.4%  reject
1x16 c26 p0 f3       16x16    108/161  irregular    rigid   (-343,-22)     3.7%  reject
1x16 c26 p0 f2       16x16     27/161  irregular    rigid   (-25,85)       3.7%  reject
1x8 c0 p0 f0         16x8      50/161  irregular    rigid   (298,-116)     2.0%  reject
2x48 c9 p0 f0        32x48     50/161  irregular    rigid   (310,-116)     2.0%  reject
4x64 c9 p0 f0        64x64     50/161  irregular    rigid   (298,-132)     2.0%  reject
3x32 c10 p0 f0       48x32    161/161  every frame  ground  (189,7)        1.9%  reject

8 accepted, 11 rejected on SCORE, 2 rejected for too small a SAMPLE.
worst accepted 100.0%  vs  best rejected-on-score 58.6%  -- a gap of 41.4 points.
records spliced per frame: {"5":80,"6":81}
ordering: ground-plane (shadow) records drawn BEHIND the ship 243, IN FRONT 0
```

**EIGHT, exactly as the owner predicted: ship + 2 pods + 2 exhaust + ship shadow
+ 2 option shadows.** Every accepted class scores **100.0 %** — not 96, not 98.
The best rejected-on-score is 58.6 %, a 41-point gap. There is no tuned constant
left anywhere near a cliff.

Note `2x16 c24 p0 f0` at 7.4 %: an ENEMY's shadow, same palette as the player's,
correctly rejected. That is the class-collision risk the identity scheme has,
and the conditional score handles it — and the failure direction is safe: a
collision LOWERS the score, so the outcome is a lost splice that shows up in the
reject list, never an enemy dragged around behind the ship.

### 3B.3 The shadows sit on a GROUND PLANE, and the listing says so

Empirically the shadow's short-axis offset is rigid (+6, +26, −6 on all 81
frames) but its long-axis position is not:

```
frame  ship_x  shadow_x        frame  ship_x  shadow_x
    0      69        66          90     404       234
   40     219       141         140     369       216   <- and back down again
   80     373       218         160     292       178
```

`shadow_x = (ship_x >> 1) + 32` on every frame, in both directions. I could have
curve-fitted that and shipped it. Instead — `unidasm` on the player tail, which
`player.js:278` already names as *"the shadow-sprite emit ($23EFC0)"*:

```
249ea0: move.l ($2,A6),D1        D1 = posY:posX, 1/64 px
249ea4: move.w #$1c00,D5
249ea8: sub.w D5,D1 / asr.w #1,D1 / add.w D5,D1    X -> midpoint with $1C00
249eae: swap D1
249eb0: move.w #$1400,D5
249eb4: sub.w D5,D1 / asr.w #1,D1 / add.w D5,D1    Y -> midpoint with $1400
249eba: swap D1
249ebc: addi.l #$fe00fe00,D1     -8 px on each axis, as ONE long add
249ee2: jsr $23EFC0              -> asr.l #6 / andi.l #$07ff03ff
```

A shadow is **halfway between its object and a fixed point, on BOTH axes**.
`shadowProject()` in `src/render/capture.js` is that, transcribed:

```
$249E7E's arithmetic vs the SHIP SHADOW record, over 161 frames:
  present 81, EXACT 81, wrong 0, absent 80
```

**81 of 81 exact.** Not a fit — a transcription.

**AND READING THE LISTING IS WHAT SAVED IT.** The X halving is INVISIBLE in this
capture: the recorded ship's `px` is 5312 on all 161 frames (§3.5), so
`rigid-y` and `half-y` fit the data equally well and the correlation alone had
to guess. The listing does not guess. Had I shipped `rigid-y`, the shadow would
have tracked the player's lateral movement at **twice** the correct rate and
been wrong by up to ~50 px the moment the player moved sideways — a defect
invisible to every gate, because the gates only ever replay a ship that does not
move sideways.

The option shadows come from the same idiom inside the option object: the
sequence `sub.w D5,D1 / asr.w #1,D1 / add.w D5,D1` with the same `$1C00`/`$1400`
constants occurs **thirty times in `$24C40E..$24D25A`**, which is `$24C096`'s
body. Their offsets from the ship's shadow are constant, measured on all 81
frames: `(0,+20)` and `(0,−12)`.

### 3B.4 THE FLICKER — phase measured, and the rendering question NOT answered

```
PHASE  shadow: 81/161 frames, ALL EVEN   first: 0,2,4,6,8,10,12,14
       plume : 80/161 frames, ALL ODD    first: 1,3,5,7,9,11,13,15
       frames carrying BOTH: 0  -> THEY INTERLEAVE
```

The exhaust and the shadow are each drawn on exactly half the frames, on
**opposite** phases, and no frame carries both. Two readings, and this
measurement does not decide between them: two independent 50 %-transparency
effects that happen to be out of step, or one sprite-budget alternation that
draws one of them per frame. The distinction matters for how a future port
should DRIVE them, so it is written down rather than assumed.

**THE QUESTION FOR THE OWNER, deliberately not answered here.** This page
reproduces the flicker exactly, because the splice moves records and never
invents them. On the arcade CRT at 59.185606 Hz that alternation reads as
translucency. On a 60 Hz LCD it may read as visible strobing instead. Drawing
these records every frame at half opacity would look better and would be
something **the board never did** — an invention that diverges while flattering.
There is a precedent in this repo for the other choice: Batman's water dither
was deliberately NOT reproduced, for photosensitivity reasons, and it is
documented as a considered deviation rather than a bug.

Measured, so the decision can be made on numbers: **five records flicker** — the
80x40 exhaust plume (1515 px, ODD), the 16x32 exhaust glow (145 px, ODD), and
the three shadows (16x16 + two 16x8, ~180 px total, EVEN) — at 29.6 Hz each,
against a ship and pods drawn solid on every frame. **Nobody should change this
without the owner saying so**, and `src/render/capture.js`'s header says that in
the source too.

### 3B.5 Ordering — checked, and safe by construction

A higher display-list index draws IN FRONT on this hardware, so a shadow moved
in front of the ship would be obviously wrong. `splice` rewrites position words
0 and 1 of records already in the list; it never reorders, never appends and
never touches the `pri` bit, so the order the board chose is invariant. Measured
on the capture as a check, and asserted in the tests:

```
ordering: ground-plane (shadow) records drawn BEHIND the ship 243, IN FRONT 0
```

### 3B.6 The reject list is the durable half of the fix

The old matcher printed *"three offsets accepted at 161/161 frames"* and said
**nothing** about having considered and dropped the exhaust and the shadows. It
looked like a clean run for two waves while the player's biggest attached sprite
flew off on the recorded path. So `Capture.attachmentReport()` now records every
class it tested with its score and verdict, `tools/attachreport.mjs` prints the
table with the accept/reject line drawn in it, and the page's provenance line
says how many classes were rejected and names the tool. **A rejected candidate
is a finding.**

### 3.5 THE TILT — measured, and NOT fixed this wave

The owner is right that the ship you steer does not bank. The cause:

```
$ py range 4473 .. 25856   distinct 118
$ px range 5312 .. 5312    distinct 1        <- ONE value, all 161 frames
```

**The recorded ship never moved sideways.** So its tilt was 0 for the whole
capture, and its record carries **one** sprite stream (`$3`) on all 161 frames.
There is no banking animation in the recording to inherit, and `splice` rewrites
words 0 and 1 only, so there would be nothing to inherit it into anyway.

The port DOES compute tilt and DOES compute the tilt-indexed animation longs
(`vectors.js` `anim()` over `$25533A`/`$2553CA`), and those longs ARE
display-list words 2-3, so the ship COULD be made to bank from live state.
**What blocks it is the rebase, and I measured that too:**

```
animA offs set (ROM space): $1200 $1264 $12c8 ... $1840   (17 entries)
records in the capture whose stream is in that set: 0
```

zero, because `export-web.mjs` re-bases every sprite stream into a packed 16-bit
space and **does not ship the map**. The ship's record carries `$0003`, the
rebased form of one of those. Wiring the tilt therefore needs one new field in
the manifest (the 17 rebased `animA`/`animB` pairs), an exporter change, and a
rebuilt bundle. That is a second feature with a bundle-format change, and the
coordinator's own instruction was not to expand the wave. **It is not done, it
is written down here and on the page, and the page now says the ship is "a still
frame that moves" rather than letting it look inert.**

---

## 4. JOB 4 — the page's claims

Rewritten. What it now says, all of it checkable against this file:

* one ship is simulated and verified frame-exact; everything else is a 161-frame
  recording that loops;
* the enemies are pixels, cannot see you and cannot be shot;
* FIVE records are relocated — ship, two pods, two exhaust — and the pods and
  exhaust are relocated recordings, not simulation;
* the ship does not bank, and why;
* no weapon is drawn and there is no sound;
* what each fire button actually does, as four separate cases (§5);
* **a `$` address in the red box means NOT PORTED YET** — the box now leads with
  `"$24C8BE IS NOT PORTED YET."` and the sentence "This is not a crash", keeps
  the full message, and still `console.error`s the trace.

The bomb/laser warning was NOT an overclaim and was not touched, per the
coordinator's correction.

`tests/web-page.test.js` now FAILS if `index.html` or `app.js` ever say the
option pods are "computed live" again, and if `app.js`'s SIMULATED block ever
regains the word "options". D1 would have been caught by that test.

---

## 5. JOB 5 — THE SILENT LASER. It was (b), and here is the measurement.

### 5.1 (a) is ruled out: the held bit arrives

400 logic frames, driven through the port's own `currentPortWord` path:

```
port word: neutral ffff   b1 held ffdf   mirrors when held: {"p1":16}  (bit 4)

--- NOTHING PRESSED, 400 frames: 400/400 no throw
    p1raw b1 set on   0 frames; p1edge b1 set on  0 frames
--- SHOT HELD every frame, 400 frames: 400/400 no throw
    p1raw b1 set on 400 frames; p1edge b1 set on  1 frames
    $81295C live shots: max 6, non-zero on 39 of 400 frames
--- SHOT TAPPED (2 on / 6 off), 400 frames: 400/400 no throw
    p1raw b1 set on 100 frames; p1edge b1 set on 50 frames
    $81295C live shots: max 10, non-zero on 400 of 400 frames
```

The raw mirror carries the hold on every single frame. The web input layer sets
it every frame; nothing is edge-only.

**And the cadence machine reading the EDGE is CORRECT, not a bug.** `$249B48`
is `btst #$4,($19,A6)` and `($19,A6)` is the low byte of `$803972`, the edge
mirror (`machine.js` `P.btnByte`). One burst per press and then quiet is what
the board does; DaiOuJou is a tap-shooter.

### 5.2 (b): the branch is reached and returns in silence

What the board ALSO does with a held Button 1, measured in wave 4 §4 on scenario
`speedmodes` and not by me:

```
lf=2401 p1raw=0x0011 speedIdx=22 -> 21 -> ... -> 12    + BUTTON 1: A RAMP DOWN
        appliedDy 246 234 223 212 201 190 179 167 156 145 134
lf=2481 (released) speedIdx 13,14,...,22, one step PER FRAME
writers: W pc=24C8CE n=25   W pc=24C900 n=19
```

I re-derived the location from the image on this machine:

```
$ unidasm maincpu.bin -basepc 0x24c8be
24c8be: 102c 001a   move.b ($1a,A4),D0
24c8c2: b02c 0038   cmp.b  ($38,A4),D0
24c8c6: 671a        beq    $24c8e2
24c8c8: 532e 004b   subq.b #1,($4b,A6)
24c8cc: 6614        bne    $24c8e2
24c8ce: 532c 001a   subq.b #1,($1a,A4)          <- THE WRITE
24c8d2..24c8de: ($4b,A6) = (($5a,A4)-2)>>1 + 4  <- reload = 4 with formation 2

$ callers, absolute-long, over the whole image
  jsr $24C8BE : (none)      -- reached PC-relative from inside its own routine
  jsr $24C096 : $28B616     -- and $28B616 is object type 5's call slot
```

`$24C096` is **one of the 22 `type5.js` counts with `unportedLog.note` and does
not run.** So the laser ramp was reached, every frame, and returned quietly.

**The silence had a second half**, and it is why the page's author expected a
throw that never came. The spawn's laser selector is `btst #$0,($1,A6)` on the
player record:

```
249c1c: 082e 0000 0001   btst #$0,($1,A6)
249c32: 082e 0000 0001   btst #$0,($1,A6)
$ grep -n "P.flags1" src/*.js
  four READS (player.js 308, 327, 357; shots.js 178)   ZERO WRITES of bit 0
```

so `laser` in `shots.js` is permanently whatever the seed says, and the
`unreached(0x254078, 'THE LASER...')` sitting behind it is **unreachable code**.
The only absolute-long writer of that bit in the image is `$24989E`, inside the
BOMB block, which the port already throws on.

### 5.3 The fix

`type5.js` now throws at the `$24C096` call slot, on exactly the condition under
which the board's ramp would MOVE something:

```js
laserRampWouldMove(heldFrames, speedIdx, laserFloor)
  = heldFrames >= 4 && speedIdx !== laserFloor
```

**Four frames, not one**, because `$24C8C8`'s counter reloads to
`(((\$5a,A4)-2)>>1)+4 = 4` for the measured formation 2, so a 1–3 frame tap
never moves `($1a,A4)` and the port is not diverging yet. That threshold is what
keeps wave 8's work reachable: `stage1-shot` fires SINGLE-FRAME taps every 20
logic frames, so no gate trips it, and a player can still tap to run the ported
spawn and driver.

Measured after the change, same harness:

```
--- NOTHING PRESSED, 400 frames: 400/400 no throw
--- SHOT HELD every frame:  3/400 frames THREW
    Unreached: UNPORTED $24C8BE: THE LASER. Button 1 has been HELD for 4 logic
    frames ... walking the ship's speed index from 22 down to its ($38,A4)
    floor of 12 ...
--- SHOT TAPPED (2 on / 6 off): 400/400 no throw
```

The `22` and the `12` in that message are read live out of the port's RAM and
they match wave 4's independent measurement exactly, which is a second,
unplanned corroboration that the guard is on the right two bytes.

### 5.4 THE AUDIT: unported paths that return quietly

Every `unportedLog.note` site in `src/`, and whether it CAN be a throw.

| path | ROM addr | throws? | reachable only by INPUT? | can it be a throw? |
|---|---|---|---|---|
| ISR6 inner input gate | `$15B980` | no | no — overrun frames | no: every frame |
| ISR6 coin/service | `$13CFBA` | no | no | no: every frame |
| ISR6 jsr #3 / tail | `$18ACC0`,`$13C4FC` | no | no | no: every frame |
| ISR6 gated routines (4) | `$141676` etc | no | no | no: every frame |
| main-loop call #1 | `$256D5A` | no | no | no: every frame |
| main-loop call #3 | `$24683E` | no | no | no: every frame |
| **main-loop call #4, the display-list build** | `$23D2AE` | no | no | no: every frame — it is WHY the picture is a replay |
| object dispatch entries (18 of 20) | `$240F62`+8n | no | no | no: every frame |
| player tail: shadow emit + BCD | `$249E7E` | no | no | no: every frame |
| shot: bra to the tail | `$249B8C` | no | yes | harmless: a translated branch, not a gap |
| shot: idle, no counter running | `$249BA4` | no | yes | harmless: the idle path IS ported |
| shot fire SOUND | `$28C3BA` | no | yes | no: audio is out of slice by design |
| type 5's tail | `$28B670` | no | no | no: every frame |
| **type 5's 22 subsystem calls** | 22 addrs incl. `$24C096` | no | no | **no as a group — but the LASER RAMP inside `$24C096` now throws on its own condition. This wave's fix.** |

**The audit's conclusion: exactly one silent path was reachable by a button and
had a visible board effect, and it was the laser. The rest are unconditional
per-frame structure that cannot throw without making the page unbootable, and
the page explains their consequence (replayed picture, no enemies, no sound)
rather than hiding it.**

---

## 6. THE GATES

```
$ node --test games/ddpdoj/tests/
  # tests 112   # pass 112   # fail 0   # skipped 0        (was 89/89/0/0)

$ node tools/build-dist.mjs
  published verbatim, deliberately: games/batman/assets/player.tiles.bin (6974 B)
  rom-leak guard: 171 files checked (8 also checked decompressed) against 12
    ROM(s) -- clean, 1 deliberate exception(s)
  dist/ built: 175 files, 2542 KB
  THE DELIBERATE EXCEPTION IS STILL BATMAN'S. Nothing of ddpdoj's is allowlisted.

$ node tools/bundlegate.mjs --assets assets --dump rip/pix-demo --tsv .../demo.tsv
  PASS: the PUBLISHED BUNDLE renders 15955968/15955968 = 100.0000% over 159 frames
$ ... --assets ../../dist/games/ddpdoj/assets
  PASS: 15955968/15955968 = 100.0000%
$ node tools/demogate.mjs --rom rip/rom --web rip/web --dump rip/pix-demo ...
  PASS: 15955968/15955968 = 100.0000% over 159 frames
$ node tools/webgate.mjs --assets assets              PASS, 11 files
$ node tools/webgate.mjs --assets ../../dist/.../assets  PASS, 11 files
```

**The pixel gates are what prove the wider splice is not a regression**: moving
five records instead of three still scores 15,955,968/15,955,968 against MAME's
own framebuffer, because in the gate the port's ship IS the board's ship and the
two extra records land exactly where they already were.

And the gates can still fail:

```
--break blank-tile   EXPECTED-RED 15804494/15955968 = 99.0507% -- diverged, as it must
--break drop-stream  EXPECTED-RED AssetError: capture frame 91 (lf2091) record 51 ...
webgate --break missing-file / truncated / not-gzip   all EXPECTED-RED, by name
```

### The two deliberate breaks, seen red, restored byte-identical

**BREAK 1 — the integer floor** (`app.js`, `Math.floor` removed):

```
before  sha256 9b28573a6a3dd992c95d6b65ac4cb1260463ae4f31292f54911a5fd93a0d4746
--BREAK--  not ok 1 - the chosen scale is a WHOLE NUMBER of device pixels in
                      BOTH orientations                       # pass 15 # fail 1
restored  sha256 9b28573a6a3dd992c95d6b65ac4cb1260463ae4f31292f54911a5fd93a0d4746
          # pass 16 # fail 0                                       (identical)
```

**BREAK 2 — score on PRESENCE instead of conditionally** (`capture.js`,
`hit / present` → `hit / usable.length`). That is the OLD question, and it
reproduces wave 7's defect exactly:

```
before  sha256 1c909eaed1a54e99688226cdeb0f3f1cb7e287bcc3021e2e478e3c35ea2016d0
--BREAK--  not ok  6 - a record that FLICKERS is accepted: presence is not the question
           not ok  7 - a GROUND-PLANE record is accepted, and never as `rigid`
           not ok  8 - the exhaust and the shadow INTERLEAVE
           not ok 10 - a perfect match on too few frames is rejected on SAMPLE
           not ok 13 - splice moves ONLY the position words
           not ok 15 - splice puts a GROUND record where shadowProject says
                                                              # pass 17 # fail 6
           attachreport: 3 accepted            <-- EXACTLY wave 7's three
restored  sha256 1c909eaed1a54e99688226cdeb0f3f1cb7e287bcc3021e2e478e3c35ea2016d0
          # pass 23 # fail 0                                       (identical)
```

**BREAK 3 — drop the `ground` model**, leaving only `rigid`. That reproduces
§3A's incomplete fix exactly:

```
--BREAK--  not ok  7 - a GROUND-PLANE record is accepted, and never as `rigid`
           not ok  8 - the exhaust and the shadow INTERLEAVE
           not ok 15 - splice puts a GROUND record where shadowProject says
                                                              # pass 20 # fail 3
           attachreport: 5 accepted            <-- EXACTLY §3A's five
restored  sha256 1c909eaed1a54e99688226cdeb0f3f1cb7e287bcc3021e2e478e3c35ea2016d0
          # pass 23 # fail 0                                       (identical)
```

The two breaks reproducing the two previous defective states — 3 records and 5
records — is the strongest evidence I have that the tests are testing the thing
that actually went wrong twice.

---

## 7. WHAT I RULED OUT, AND THE PROCESS FINDING

Ruled out, each with the measurement:

* **"the page shows the unrotated buffer"** — no; `HEAD` and `dist/` are both
  224x448 and both call `rotateCCW`. §1.
* **"the option pods are detached / fly the recorded path"** — no; their offsets
  hold on 161/161 frames and the splice moves them. They were always correct.
* **"the captured ship is still being drawn / the splice is additive"** — no;
  every frame has exactly ONE ship record, and 0 records outside the tracking
  set use the ship's artwork. §3.1.
* **"the fireball is a second ship-and-options set"** — no; it is two records,
  80x40 and 16x32, at fixed offsets, flashing on alternate frames. §3.2.
* **"the fireball may not be player-attached at all"** — no; both records hold a
  single constant offset on every frame they appear on.
* **"the held bit never registers" (JOB 5 candidate (a))** — no; set on 400/400
  held frames. §5.1.
* **"the tilt is being taken from the ghost"** — no ghost; the recorded ship
  simply never banked (`px` has ONE distinct value across the capture). §3.5.
* **"pixpack never tested the exhaust"** — no; it tested it and its threshold
  rejected it. That is the finding. §3.2.
* **"the shadows are just another record the threshold missed"** — no. No
  threshold on the old question could have found them at any value, because
  they are not at a constant offset from the ship at all. §3B.3.
* **"the shadows track the ship rigidly on the short axis"** — this FITS the
  capture perfectly and is WRONG. The recorded ship never moved sideways, so
  the data cannot distinguish it from the half-rate rule; the listing can, and
  says half. §3B.3. This is the closest I came to shipping a defect that no
  gate in this project could ever have caught.
* **"the exhaust and the shadow share a phase"** — no; exhaust ODD, shadow
  EVEN, zero frames carrying both. §3B.4.

**The process finding, and it is the same one `docs/knowledge/05` keeps
recording.** Between them, the brief and seven mid-flight corrections proposed
eight different causes for one symptom. Every wrong one came from reading a
function signature, a review note or a screenshot description; every right one
came from a measurement. I very nearly implemented two of the wrong ones — I had
already written and tested the code to HIDE the option pods before the
correction arrived, and it would have removed a feature that worked.

**But the sharper finding is about what a MEASUREMENT is worth when the corpus
is thin.** §3A's fix was measured, gated, and had a 39-point margin, and it was
still only 5 of 8. It was measured against a capture that could not show the
other three. Three things in a row here were invisible to every gate this
project owns:

* the shadows, because the matcher's question had the wrong shape;
* the shadows' lateral half-rate, because the recorded ship never moved
  sideways, so the data fits both answers;
* the ship's banking, for the same reason (§3.5).

**All three were found by the OWNER LOOKING AT THE SCREEN, and two of the three
were then settled by reading the 68000 listing, not by more statistics.** The
gates score 15,955,968/15,955,968 either way, because the gates replay a ship
that flies the recorded path — the one path on which every one of these defects
is invisible. `docs/knowledge/03` is about checks that pass while the game is
broken; this is a whole class of them, and the class is "the corpus contains no
frame in which the answer differs".

The durable defences, both shipped: the matcher **prints what it rejected**
(§3B.6), and where the capture cannot decide, **the listing decides** — with the
disassembly quoted next to the code.

---

## 8. THE HUMAN CHECK LIST — riskiest first

Nobody has run any of this in a browser. Ordered so that a failure early stops
you wasting time on the rest.

1. **The picture is big.** Portrait phone, `/games/ddpdoj/`. The game should
   fill essentially the whole height between the top bar and the d-pad. If it is
   still small, the grid rows are wrong and nothing below matters. Tap INFO and
   confirm the text OVERLAYS the game rather than shrinking it.
2. **The picture is sharp, not chunky.** The stats line ends with `x4`, `x5`…
   — that is the integer scale. Zoom right in on the HUD text: the pixels must
   be exact squares. Any softness or uneven pixel widths means the scale is
   landing on fractional device pixels and the whole JOB 1 argument is wrong.
3. **Nothing detaches any more.** THIS IS THE FIX. Move the ship hard left and
   right and hold it away from where the recording goes, then look for anything
   left behind. Eight things must stay glued to you: the ship, two pods, the big
   fire cloud, the small glow, and three shadows. If anything still flies off,
   run `node games/ddpdoj/tools/attachreport.mjs` and send me the table — the
   stray record's class will be in the reject list with its score, which is
   exactly what the old matcher could not tell anybody.
4. **The shadows track you SIDEWAYS at half rate.** Move left and right slowly
   and watch the three shadows below the ship: they should slide about half as
   far as you do. This is the one thing in the whole wave with no test coverage
   from the capture — the recorded ship never moved sideways, so the gates
   cannot see it. It comes from the listing (`$249EA8`), not from a fit. If the
   shadows move the SAME distance as the ship, or twice as far, that half is
   wrong.
5. **The pods stay on the ship** — they did before; this must not have broken
   them.
6. **The flicker.** The fire cloud and the shadows are drawn on alternate
   frames, on opposite phases. On the arcade CRT that is translucency. Tell me
   whether it reads as translucency or as strobing on your phone — this is a
   deliberate open question and the page says so.
7. **TATE/WIDE.** Press it. The picture must switch orientation immediately, stay
   sharp (check the scale number changes and the art stays square), and survive a
   reload. Rotate the phone: the picture must NOT flip mode on its own.
8. **Tap fire.** Nothing visible should happen and the game must keep running.
   No error box. (The shot is computed and invisible.)
9. **HOLD fire for about a second.** The red box must appear saying
   `$24C8BE IS NOT PORTED YET` and `This is not a crash`. If it stays silent, the
   guard is not reached and §5.3 is wrong.
10. **AUTO.** Hold it. The game must keep running indefinitely — that is the one
   way to keep firing without stopping the port.
11. **Bomb.** Red box, `$249814`. Unchanged, but confirm the new box wording reads
   as an explanation and not as a crash.
12. **The d-pad diagonal** still works and no direction sticks after the app
    switcher / a phone call / locking the screen.
13. **Landscape on the phone**: the pad should sit in the letterbox at the sides
    and the picture should keep the full height.
14. **Desktop**: keyboard unchanged (arrows/WASD, Z and Y and Space, X, C,
    Enter), no pad visible.

If item 3 fails, the useful thing to send back is a screenshot plus roughly where
the stray sprite is relative to the ship; the offset is all I need.

---

## 9. If someone picks this up cold

* **Run `node games/ddpdoj/tools/attachreport.mjs` first.** It prints every
  record class in the capture with its conditional score and its verdict, and
  the accept/reject line drawn between them. If something on screen is not
  following the ship, its class is in that table with a number next to it.
* The splice set is re-derived in `src/render/capture.js` `attached()`. It reads
  only the shipped bundle — no rebuilt `assets/` needed. Its header carries the
  whole measurement table.
* The thresholds are `ATTACH_MIN_SCORE = 0.95` and `ATTACH_MIN_FRAMES = 8`, and
  the measured gap around them is 100 % accepted vs 58.6 % rejected.
  `tests/web-page.test.js` asserts the behaviour on a synthetic capture that
  contains one of every failure mode, so moving them fails loudly.
* **If you add a position model**, add it to `anchor()` and to the model list in
  `_build()`, and give it a listing citation. `rigid` and `ground` both have
  one; a third that is only a curve fit is how the lateral-half-rate defect
  would have shipped.
* **The next real job on this page is the tilt** (§3.5): add the 17 rebased
  `animA`/`animB` pairs to `export-web.mjs`'s manifest, write them into the ship
  record's words 2-3 from the port's live tilt in `Capture.splice`, rebuild
  `assets/`, and re-run `bundlegate`. It is a live, verified value going unused,
  and banking is very visible in this game.
* The second job is the laser itself: `$24C096` is the option object and it owns
  the ramp, the pods and the pods' shots (slots 7..12). Porting it closes the
  laser, the pods and `OPTION_COLUMNS` in one move.
* `MODES`/`PICTURES`/`pickScale` are exported from `src/web/app.js`; if a third
  presentation is ever wanted, add it there and the tests will cover it
  automatically — they loop over `MODES`.
