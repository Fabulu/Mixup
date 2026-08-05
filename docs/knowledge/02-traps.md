# The traps

Eight failure shapes that cost this project real work. None of them is Game Boy specific —
and none turned out to be Batman specific either: every one has since recurred on the NES
and the arcade port.

This is the generalisation. The concrete instances live per game:
`docs/03-VERIFICATION.md` holds Batman's **45 numbered lessons**, and
`docs/worklog/gradius/` and `docs/worklog/ddpdoj/` carry the per-wave record for the other
two. There is no single cross-game registry, which is the reason for the counting note
under trap 1.

---

## 1. Follow the fall-through, not the label

A routine that looks like it returns often runs straight on into the next one. **At least
thirty separate incidents** across the three games, one of which invalidated an
already-shipped handler. It is the most expensive trap in the project's history and it has
not stopped happening: it recurs on every new machine, in every wave, in a new costume.

> **On that number, because it used to be wrong here.** This line said "nine" for a long
> time. Nine was Batman's count, and it stopped being the project's count the moment a
> second game started. Thirty is a **deduplicated floor**, arrived at by sweeping
> `docs/03-VERIFICATION.md`, `docs/knowledge/`, `docs/worklog/**`, `SAVEPOINT.md` and
> `HANDOVER.md` and collapsing the same incident described in several files into one; a
> further dozen candidates were left out because they are ROM behaviours found by reading
> ahead rather than defects that shipped, and the boundary between those two is a judgement
> call.
>
> **Do not increment this by claiming "the Nth incident" in a worklog.** The project tried
> that and the ordinal forked: once Gradius and DaiOuJou were being worked in parallel, each
> incremented its own counter, and the series now collides — `$282DCE` and `$24560A` are
> both written down as "the twelfth", and the highest ordinal ever claimed, nineteen, is
> below the deduplicated floor. An ordinal maintained in two places is not a count. Either
> build one canonical list, or say "again" and describe the shape.

The nastiest version: four routines that look like four handlers turn out to be *two*
routines with two entry points each, whose halves jump into one another. One half
subtracts 2 and falls into the other, which adds 1 back — so the real step is −1, not −2.
We shipped the −2 reading.

The variant that catches you inside your own port: an arm that "skips the update" quietly
borrows the update's *tail*. The ROM's early return does not run the tail; ours did. That
drew a player the cartridge does not draw, for 45 consecutive frames.

The version that scales, found on the arcade port: it can be **systemic rather than
incidental**. All 256 entries in DaiOuJou's object type table are exactly 8 bytes — a run
length and an `rts` — and the real initialisation begins at +8, reached by an `addq.w #8,A1`
in the caller. Read only the table address and you get *none* of any enemy's setup, not half
of it. The same census walked every handler twice, linearly to the first terminator and then
by following edges: **105 of 111 run past their first terminator**, one of them by 4,014
bytes. When a trap turns out to be a property of the whole table rather than one routine,
measure the table — do not fix the routine you noticed.

**Practice:** when you port a branch that returns early, ask what the ROM's return
actually skips — not just what it skips *computing*, but what it skips *doing* at the end
of the caller. And when a routine "looks finished", say what *ended* it: a terminator you
saw, or a label you stopped at.

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
