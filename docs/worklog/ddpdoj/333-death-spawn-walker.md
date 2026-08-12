# W333: `$270D92`, the death-spawn walker three stage-5 types share

Status: suite **2375/2375**, green, no skips (2369 + 6). Sweep 0 missing. `dojcoverage.py` both OK
lines.

This wave exists because of a reordering, and the reordering was worth more than the type would have
been.

## WHY THIS AND NOT `$49`

The work order said `$49` next. Reading `$49`'s death arm found `$27167A lea ($27197C,PC),A1 / jsr
$270D92`, and `$270D92` was unported. `codexref` on it:

    $270DCC  its own back-edge
    $271390  jsr        $271680  jsr  <- type $49's death arm
    $271AC2  jsr        $271D88  jsr        $27248E  jsr

`$271AC2` is inside type `$4A` (`$271A64`) and `$271D88` is inside type `$4B` (`$271D48`). **So one
small routine is the shared death-spawn walker for that whole band** -- the band W315 proved is NOT
one family by prototype. They diverge in their bodies and share this.

Porting `$49` first would have meant writing the walker inside a type wave and only then discovering
two more callers for it. Doing the walker first turns three remaining stage-5 types from "read a
death arm each" into "one call each". **That is the family check paying off by following a `jsr`
rather than assuming it was private**, the same shape as W286 and W312.

## THE ROUTINE, AND WHY THE STRIDE HAD TO COME FROM THE CODE

    270d92  move.w (A1)+,D1                    entry word 1
    270d94  cmpi.w #-$1,D1 / beq $270DCE        $FFFF TERMINATES
    270d9c  move.w (A1)+,D0 / jsr $289004       word 2 is the effect KIND
    270da4  move.w (A1)+,D0 / move.b D0,($1C,A0)   word 3, and only its LOW BYTE
    270daa  move.w D1,($18,A0)                  word 1 lands at +$18
    270dae  move.l (A1)+,($26,A0)               words 4+5 as ONE LONG
    270db2  move.l D2,($2,A0)                   the CALLER's position, out of D2
    270db6  move.w #$4,($1E,A0)
    270dbc  move.w #$0,($12,A0) / move.w #$0,($14,A0)
    270dc8  move.w (A1)+,($1A,A0)               word 6
    270dcc  bra $270D92

**An entry is TWELVE BYTES: word, word, word, LONG, word.** `$270DAE` is what makes it that rather
than six words, and it matters: a port that walked six words would take the long's two halves as
separate fields and **every field after the third would slide**. Type `$49`'s own list at `$27197C`
does not look uniform to the eye (`0000 008D 0000 FC000000 0000` then `0000 0084 ...`), which is
exactly why the stride came from the code.

`$270DA6` is a BYTE store out of a word that was just read. Using a word write there would also
clobber `($1D,A0)`, which is the palette byte the callers set.

## TWO DELIBERATE DIFFERENCES FROM THE LISTING

**1. A FULL POOL MUST NOT STOP THE WALK.** The ROM never tests `$289004`'s return: on a full pool it
answers `$81C8B2`, the bit bucket, the writes land harmlessly and the loop carries on. `spawnEffect`
returns a falsy slot instead, so the port skips the writes and **keeps walking**. Bailing out would
lose every entry after the first failure, which the board does not do. Tested by filling pool B and
asserting all three entries are still walked.

**2. THE WALK IS BOUNDED AT 64 ENTRIES AND THROWS.** The loop's only exit in the ROM is the `$FFFF`
word, so a wrong list address or a misread stride is an **infinite loop**, not a wrong picture. A
suite that hung would be a worse way to learn that than one that fails, so the port bounds it and the
`unreached` names both possible causes. No real list approaches 64.

## What this unblocks

Types `$49`, `$4A` and `$4B` now have their death arms one call each. `$49` is otherwise read
already (W333's recon in the handoff): init body complete, its damage arm is the **simple** member of
the `$5C` family with no palette machinery, and its alive path uses a SIGNED LONG compare
(`ext.l`, `+$4000`, `cmpi.l #$2000 / bgt`) rather than the two-`addi.w` word idiom `$1B` and `$81`
use for the same job.

## Order for the next wave

1. **`$49`** -- init body and damage arm are read, the death arm is now one call, and only
   `$2716CC` onward is unread. Do NOT route its damage arm through `damageArm5C`.
2. Then `$4A` and `$4B`, which share this walker and which W315 measured as 47 shared bytes then real
   divergence.
3. Then `$47` (`$E2`). `$1A` stays blocked until D2/D3 at `$268D8C` are measured.
4. Then stage 5's boss, the HIBACHI CLOSURE RULE, then the loops.
