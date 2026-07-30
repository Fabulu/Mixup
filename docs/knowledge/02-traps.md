# The traps

Eight failure shapes that cost this project real work. None of them is Game Boy specific.
`docs/03-VERIFICATION.md` holds the 41 concrete instances; this is the generalisation.

---

## 1. Follow the fall-through, not the label

A routine that looks like it returns often runs straight on into the next one. **Nine
separate incidents**, one of which invalidated an already-shipped handler.

The nastiest version: four routines that look like four handlers turn out to be *two*
routines with two entry points each, whose halves jump into one another. One half
subtracts 2 and falls into the other, which adds 1 back — so the real step is −1, not −2.
We shipped the −2 reading.

The variant that catches you inside your own port: an arm that "skips the update" quietly
borrows the update's *tail*. The ROM's early return does not run the tail; ours did. That
drew a player the cartridge does not draw, for 45 consecutive frames.

**Practice:** when you port a branch that returns early, ask what the ROM's return
actually skips — not just what it skips *computing*, but what it skips *doing* at the end
of the caller.

## 2. Byte-exact data is not a correct picture

A screen matched the cartridge's VRAM to the byte and rendered wrong, because what was
missing was not data but *whether anything drew it*. Bit this project twice.

**Corollary discovered later, and it is the sharper version:** "renders without throwing"
is not "renders a picture". Three separate harnesses drove one handover and all reported
PASS while the game rendered a **solid white frame** — they checked that rendering did not
throw, never that it produced an image. Assert on the **output**.

## 3. When one field will not converge, suspect the measurement

Two long hunts turned out to be sampling artifacts, not port bugs:

- the camera, because we sampled on tick boundaries instead of in the game's loop;
- an invulnerability counter, because the ROM decrements it at the *head* of the player
  update and we sampled at tick end, so the oracle always read one higher while a count
  ran.

**Signal:** everything around the field is perfect and its *consequences* all match, but
the field itself is permanently off by a constant. That is a measurement offset. Compare
the consequences instead, or move the sample point.

## 4. Checks that cannot fail

The most expensive class, because it is invisible: the suite is green *and* the game is
broken. Four distinct shapes, all found here:

1. **Asserts nothing threw.** See trap 2.
2. **The harness sets up state the application never has.** Two harnesses assigned a
   field that the real boot path only sets when the game is launched a particular way. Both
   reported a sequence **pixel-exact over 2,027,520 pixels** while the shipped game drew
   the wrong thing. Removing that one line turned the same run into 59 of 88 frames wrong.
3. **A sampled frame list with no transitions.** During a 130-frame hold, output does not
   change frame to frame, so every candidate alignment scores zero and the "one alignment
   must be exact on every frame" invariant is *vacuous*. Sample the transitions.
4. **A unit test that takes the answer in as an argument.** A function's tests passed
   `grounded` in directly, so they exercised the arithmetic and never the **call site's**
   operand — and stayed green through a bug that used the wrong record byte on four levels.

**Rule that covers all four:** a harness may only set up state the application sets up on
the path being tested, and a check must assert on output the application actually
produces.

## 5. A check outside the gate rots

One tool asserted a level's init block value by value, and had been **red on all three
difficulties for months**, because nothing ran it. The bug it was written for was live and
player-visible the whole time.

**Rule:** if it is worth writing, it goes in the gate the same day. And the gate must fail
loudly on a stage that cannot run — see `03-checks-that-can-fail.md` on SKIP.

## 6. Instruction-level timing is out of scope — say so explicitly

Real hardware drops work on lag frames: the main loop does not finish before the next
interrupt, and that iteration's updates are skipped. Your port will never lag, so it runs
one step ahead forever after.

Chasing this is a rabbit hole with no bottom. **Name it, bound it, tag it.** We hook the
lag flag, count occurrences, and annotate the affected fields as `knownLag` so the
divergence stays *visible* but does not fail the run. One measured lag frame explained an
entire 18-field "regression" that looked like a real bug.

## 7. Deliberate deviations need protecting from well-meaning fixes

Not every difference from the original is a defect. We reproduce a 50%-dither effect
*spatially* rather than as the hardware's 30 Hz alternation, because a modern display
turns that alternation into a strobe over a third of the screen — a photosensitivity
hazard rather than the translucency a slow LCD made of it.

That deviation looks exactly like a bug in the pixel numbers (it is the worst score in our
suite). **Document it where the code is, and in the results table, or someone will
helpfully "fix" it.** Same for any place where you measured two options and deliberately
kept the worse-looking one.

## 8. Ask what it looked like, not what it did

A player-reported "softlock" sent four investigations in four wrong directions: a missing
asset, a rejected promise, a synchronous throw, a hold that never ended.

The report that solved it in minutes was **"the boss explodes, the screen fades to white,
and then we softlock."** The fade was the clue. Nothing was frozen — the next level had
loaded and was running perfectly, with the palette left faded out. The game was
*invisible*, not stuck.

**Practice:** when a report names a symptom (softlock, crash, freeze, glitch), ask what
was on the screen and what changed just before. Symptom words encode a diagnosis, usually
the wrong one.
