# W323: type `$1B` is PORTED, and W322's blocker never existed

Status: suite **2328/2328**, green, no skips (2315 + 13). Sweep 0 missing, 4244 of 4244 streams.
`dojcoverage.py` **81/256** enemy types, both OK lines. Web gate 31 of 31, exit 0. **413 ROM
windows.**

Stage 5 goes from **twelve types over 37 records to ELEVEN over 32**.

## FIRST, THE CORRECTION, BECAUSE IT IS THE MOST REUSABLE PART

W322 reported type `$1B` blocked on `$24226E` and reverted a working init body on that basis.
**It was wrong. `$24226E` is `aim256FromCaller` and always was**, with a docstring that names it:

    /** `$24226E` -- aim256 at the record's target, self from the CALLER. 48 sites. */
    export function aim256FromCaller(t, ram, a5, selfY, selfX) {

The search that produced the wrong answer was `grep 24226e src/*.js` with the `AIM_REFS` line
filtered out. **`AIM_REFS` spells the address `0x24226e` in lowercase; every docstring spells it
`$24226E` in uppercase.** Filtering out the one lowercase hit removed the only match that pattern
could see and left the implementation invisible.

This repo already had the rule written down -- "`grep 0x2xxxxx` is NOT a test for 'is this
ported'; this project names routines after their addresses and cites them as `$2xxxxx` in prose"
-- and W322 cited W318 for it in the same breath as violating it. The rule now in the handoff:

**To decide whether `$2xxxxxx` is ported, grep CASE-INSENSITIVELY for the bare hex digits and read
every hit, including comments and docstrings. Never filter hits out of that search before reading
them: in this repo the prose IS where the answer lives.**

The one thing W322 got right was refusing to ship a half-ported type. That judgement stands even
though its premise was false.

## THE TYPE, AND IT NEEDED NOT ONE NEW PRIMITIVE

Four family checks, all positive, which is why 1020 bytes cost one wave:

* the damage arm is type `$8E`'s -- `damageArm5C`, and this is its **second caller**
* `$23DF58` is bucket 3 by REGISTER and `$23D816` is **the same bucket** by RECORD. `$23D816 lea
  $80688C,A0 / adda.w $80AFC6,A0` is the same queue pair, and `$23D822 lea ($2,A6),A1` says its
  record is **A6 itself**. First draw arm in the port to drive one bucket through both conventions
* `$27F8F0` is `allocPoolA27F8F0`, exported by `bee.js` since W312
* `$24226E`, `$242B3C`, `$28AC72`, `$28615E`, `$289004`, `$281708` all ported

### The four-state cycle, and it is type `$45`'s shape

    state 0  $269458  a delay on ($1E,A5)                                        -> state 1
    state 1  $269476  a delay on ($22)/($23), requires X < $6C00 (`bge`, SIGNED), RAMPS ($24,A5)
                      UP by 4 through the eight longs at $26972C into ($26,A5); at index $1C arms
                      ($34,A5) = $FFFE                                           -> state 2
    state 2  $2694BA  a delay on ($1E)/($2E), fires a MIRRORED AIMED PAIR, and the ($20)/($21)
                      volley counter ends the burst                              -> state 3
    state 3  $269556  a delay, RAMPS ($24,A5) back DOWN by 4; at index 0          -> state 0

W320 recorded two states; there are four. W316's type `$45` delays, ramps up by 4 clamped at `$1C`,
fires, then ramps back down by 4 -- same states, same step, same clamp, a different field. Two
members is a candidate family; a third would justify a shared driver.

## THREE THINGS THE TESTS CAUGHT THAT COMMENTS WOULD NOT HAVE

### 1. THE PORT SHIPPED A DEFECT AND THE TEST FOUND IT: an invented branch

The first cut of `fireState2` read:

    const aimed = aim256FromCaller(...);
    if (aimed.carry) return;        // both players dead: no aim, no shot   <-- WRONG

**There is no `bcs` after `$2694DA jsr $24226E`.** The next instruction is `$2694E0 move.w D1,D7`.
And `$24226E`'s own no-target exit is `$242264`, which is **`rts` and nothing else** -- six bytes
returning with the carry SET and **D1 UNCHANGED**. So on a frame where both players are dead this
type does NOT skip its volley: it fires with whatever D1 held, which `$2694D0 movem.w ($2,A6),D0-D1`
had just loaded as the sub-record's **Y word**. Deterministic garbage the board really does fire.

The early return was not merely a cosmetic difference. **The volley counter that advances the state
machine only ticks on a frame that FIRES**, so the invented branch stranded the type in state 2
forever whenever no player was alive. That is how the test found it: the four-state assertion
reported `[0, 1, 2]` and never 3. A comment could not have caught it; only running it could.

`w323type1b.test.js` now pins the behaviour directly ("with BOTH PLAYERS DEAD the pair still
fires"), and asserts the consequence as well as the cause.

### 2. THE INLINE BOUNDS TEST IS TWO ADDS AND FOLDING THEM CHANGES THE ANSWER

    269356  move.w ($2,A6),D0
    26935a  addi.w #$C00,D0
    26935e  addi.w #$7800,D0
    269362  bcc  -> ON SCREEN

Type `$1B` does NOT call `$242684`; it inlines the test. **The deciding carry comes from the SECOND
add alone** -- the first add's carry is discarded -- so the real predicate is

    u16(x + $C00) >= $8800

and NOT the folded `x + $8400 > $FFFF`, which is `x >= $7C00`. The two disagree for
`x` in `[$F400, $FFFF]`: at `x = $F400`, `x + $C00` wraps to `$0000`, far below `$8800`, so **the
ROM says ON SCREEN** while a folded reading frees the enemy. Asserted at `$F400` and at `$F3FF` one
below, so the boundary is pinned from both sides.

### 3. `asr.b #1` ON THE RNG DRAW IS ARITHMETIC, ON A SIGNED BYTE

`$2694E2 jsr $242B3C` then `asr.b #1,D0 / add.b D0,D1` jitters the angle. `asr` rounds toward
-infinity on a **byte**, so a draw of `$FF` is -1 and halves to **-1**, not to `$7F`. A logical
shift would turn every negative jitter into a large positive one and bias the whole spread one way
round the circle -- silent, and invisible in any single frame. Pinned as arithmetic.

## THE REST OF THE TRANSCRIPTION

Init body `$26925E`: `loadSubProto($2692FA)` with the **advanced pointer stored into `($44,A5)`**
(W218's type `$9F` idiom -- the sub prototype's end is what the loader computed, never a constant);
`loadRecordProto($2692DC, $E)` = 15 words; `cmpi.w #$1,$813092 / bls` keeps **4/4 on stages 0 AND
1** and takes 3/0 from stage 2 on (two `move.b`s, so byte fields); the sprite ring indexed by
`($28,A6)`; the stage row from `$813094`; `addq.w #1,$8130D8`; then `jmp $263808` -- a **TAIL** jump.

Handler: `stepMovement`, the inline bounds test above (whose free path decrements the refcount
first), the shared damage arm, `spawnCues28AC72`, a **WORD** freeze test at `$2693CC` and two
**LONGWORD** ones at `$269434`/`$26943E` (over `$8130D2` and `$8130D4` together -- W308's shape; a
`.w` reading would step the machine while the game is frozen, which the test pins by setting only
`$8130D4`), the `($2E,A6)` sweep whose bit 6 is subtracted from `($6,A6)`, and the four-entry
sprite ring that wraps `$10 -> 0` going up and reloads `$C` on the borrow going down.

Draw arm `$269582`: two register emits with D3 `$230` and `$430`, the record emit between them, and
the second emit's biased half reduced by the sweep bit.

Fire arm `$2695E0`: `moveq #$7,D7` plus `dbra` is **EIGHT** passes, D1 from `$6B` stepping 7, and a
second cadence that on expiry rewrites the FIRST cadence's reload period from `($31,A5)` -- a
burst-then-rest pattern rather than one rate.

Death arm `$26962E`: `scoreKill($130)`, cue `$28C28E`, a counted note for `$289B22` (D0 = `$C`, the
same effect subsystem `handlers.js` already notes at three sites), **three** `$289004` spawns each
with the family's seven writes -- and the third is `move.l #$84,D0`, not a `moveq`, which
`spawnEffect`'s `D0 & $7F` mask turns into **kind 4** -- then the refcount decrement and **four**
`allocPoolA27F8F0` rows walked `(A4)+` from `$26970C`.

Every `move.w #$1,($12,A0)` in that arm is TWO BYTE FIELDS: byte `$12` becomes 0, byte `$13`
becomes 1. The W273/W316/W317 idiom, live nine times in one routine.

## THE TWO ROM WINDOWS, AND A REFINEMENT TO W321'S RULE

    $2692D2 + $7E   the whole data block between the init body's `jmp` tail (ending $2692D0) and
                    the handler at $269350, whose first bytes are `4e b9` -- hex-dump confirmed.
                    Five stage rows, the 15-word record prototype, and the sub prototype whose own
                    end is whatever $2637A2 computes, so it gets no length of its own
    $26970C + $40   three CONTIGUOUS tables in one window: the death rows, the sprite ring, and the
                    ($24,A5) ramp. Deliberately overlaps W23's $269740 + $20; overlap is fine and
                    used on purpose in that file, whereas WIDENING an existing window is not

W322 declined to land windows ahead of code because W321 had shown that windows change
`player.tables.json`, which repacks the sprite shards, which moves the gate's shard-filtered
counts. **That is true but narrower than stated:** these two windows took the tables from 411 to
413 and the gate came back **exit 0 with no expectation touched**. The refinement:

**Only windows that add sprite ART repack the shards.** These add enemy prototypes and index
tables, which `export-web.mjs` does not harvest as streams -- the bundle still holds 4244 of 4244.
The rule to keep is the process one: add a type's windows in the same wave as its code, then run
`export-web.mjs` and the gate together, and read the result rather than predicting it.

## Order for the next wave

1. **`$1A`** -- now the biggest CLEAN stage-5 target at four records, and the scope test already
   asserts it spawns nothing. Then `$81` (3 records), `$49`/`$4A`/`$4B`, `$47`.
2. **`$8130D8` as its own small wave.** Still not done, and the witness list keeps growing:
   `handlers.js` calls it `midbossD8`, `bullets.js` calls it `initX`, and `initbody.test.js` calls
   it "the stage-kill flag" and "midboss spawned" in two test names. It is a **live-enemy
   refcount** -- `$1B` increments it in its init body and decrements it on BOTH exits, which W322
   and W323 both read directly. Three files and two test names to correct together, with the
   evidence in the comment.
3. Then the dependency bundles (`$55`->`$46`, `$54`->`$48`, `$44`->`$43`, and
   `$4E`/`$50`/`$52`/`$58`->`$4C`), leaving `$4C` last.
4. **`$B0` is boss reconnaissance, not an enemy.** HIBACHI CLOSURE RULE in the handoff.
