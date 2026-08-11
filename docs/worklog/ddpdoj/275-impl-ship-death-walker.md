# W275: `$24A6B4` -- the ship's dying animation, and the compare that reaches it

Status: DONE. Suite 1901/1901 (1889 + 12), sweep 0 missing on both the shipped seed and the
stage-2 rung, both run before the commit. Sprite streams 4194 -> 4244.

W274 found that `drawShipAlt`'s bit-15 compare is inverted and could not ship the fix,
because flipping it without the walker turns the three real-death tests into throws. This
wave lands the walker, flips the compare, and harvests the art -- which turned out to be the
other half of the fix.

## Starting state

W274 committed at `b906b09`, suite 1889/1889.

## THE THREE PARTS, AND ALL THREE WERE NEEDED

**1. The compare.** `$24A448 bmi $24A482` goes to the DRAW; `$24A460 bmi $24A46A` goes to the
**RTS**. Two entries twelve bytes apart reading bit 15 with opposite senses, and the port had
`drawShip`'s line copied into both. Flipped.

**2. The walker,** `$24A6B4..$24A75C`. Reached when bit 15 is CLEAR and bit 8 is SET, which
is exactly what the death path leaves:

    24a118: andi.w #$2000,(A6)          the state word becomes $2000
    24a11c: bset   #$0,(A6)             ...then $2100
    24a120: move.l #$255B7C,($14,A6)    THE PROGRAM POINTER, in the hitbox long
    24a128: move.w #$6,($18,A6)         and the counter, six frames

So `($14,A6)` really is the hitbox long reused as a program pointer, exactly as the note this
replaces said, and `($18,A6)` is `dirByte`'s word likewise reused. Both are read under their
ordinary names with a comment rather than renaming two fields across six files.

**3. The art.** Walking all 38 streams collects **49 distinct descriptors and every one was
missing from the shipped sheet**. Porting the walker alone would have produced an animation
that computes perfectly and draws nothing -- which is exactly what docket D3 and D4 were.

## WAVE 12'S MEASUREMENT WAS RIGHT AND ITS CONCLUSION WAS NOT

`shipsprite.js`'s header has said since W12: "MEASURED over all 2,233 drawn frames of
`fly-around`: bit 8 is never set, so `$24A6B4` never runs and it is a LOUD NAMED THROW here."
The measurement is correct. **`fly-around` contains no death.** Three years of waves read
that sentence and none asked what the scenario covered, including W272, which built a second
argument on top of it and got that wrong too.

The header now says what the routine is.

## THE PROGRAM IS DOUBLY INDIRECT AND THE OPCODE IS THE DESCRIPTOR

    $24A6CA movea.l ($14,A6),A2 / movea.l (A2),A2

so `($14,A6)` points into the pointer table at `$255B7C` (39 longwords, already windowed as
`$255B7C+$9C`, **and its last entry is `$FFFFFFFF` -- the table terminates itself the same way
its streams do**), and each entry points at an opcode stream. `move.l (A2)+,D2` dispatches on
the whole long:

    negative    end the walk ($24A6D2 bmi -> the rts at $24A6B2)
    0           ($2a,A6) = the next long, ($2e,A6) = the next word     SET UP
    1           $24A70E, the two-half split
    2           ($4,A6) = the next word                               MOVE
    anything    D1 = ($2,A6) + ($2a,A6) as ONE 32-BIT ADD, D2 = THE OPCODE ITSELF,
    else          D3 = ($2e,A6), D4 = ($28,A6), then emit

**The long that failed to be 0, 1 or 2 IS the sprite.** D2 is not re-read on the default arm.
That is the one thing about this routine a paraphrase would certainly get wrong, and the test
asserts the emitted record's descriptor equals the opcode.

The add is 32-bit, so a carry out of the short axis reaches the long one -- which is why
`($2a,A6)` is a long and not two words. `$255C18`'s stashed value is `$ED00F600` against a
posX of `$1C00`, so the carry really happens and a per-axis 16-bit add would differ. Asserted.

## `$23F294` NEEDED NO NEW CODE

The family check again. `$23F294` is `$23F1FA` byte for byte -- same bucket 19 buffer
`$808EE4`, same counter `$80AFDC`, same `asr.l #6` / `andi.l #$7FF03FF` / `ori.l #$80008000`
-- wrapped in `move.l A0,-(A7) / move.l D0,-(A7)` and the two pops. JS has no
caller-clobbered registers, so the two are ONE call. `hud.js` already makes this argument for
its own pair; this is the second instance.

## THE SIX-FRAME ANIMATION, AND THE COUNTER IS THE SAME SIX

The pointer table's first six entries are one-emit streams at stride 8 whose descriptors step
by `$234`, and `$24A128 move.w #$6,($18,A6)` is the same six. While the counter runs the
ship's OWN record is enqueued as well, and the decrement comes BEFORE the enqueue, so a seed
of 6 gives six frames with the extra record and then the program alone. All asserted.

## TWO EXTENTS, BOTH PINNED BY SOMETHING ELSE

**The programs, `$255C18 + $1C0`.** Measured by walking all 38 real entries with the same
opcode rules the port uses. The highest byte any stream reads is `$255DD7`, and the bytes
after it are `4D F9 00 81 1F 72` = **`lea $811F72,A6`, CODE**. `$255330+$900` already covered
`$255330..$255C2F`, which is why the first two streams resolved and the third did not. The
test asserts both halves: every stream terminates inside the window, and a longword at
`$255DD6` throws because it crosses into the instruction.

**The art, five `STRUCTURE_RANGES` rows** read off the chain with the `--extent` probe:

    $588A4 .. $5D5E4   16 streams, stride $4D4, closed by $8F4
    $5D5E4 .. $5E7CC    2 streams, stride $8F4, closed by $584
    $5E7CC .. $629FC   12 streams, stride $584, closed by $1C4
    $629FC .. $642B4   14 streams, stride $1C4, closed by $234
    $642B4 .. $64FEC    6 streams, stride $234, closed by $C     <- the six-frame run

50 streams for the walker's 49: one frame of one family is unreferenced, and the family ships
whole for the reason W66's own row gives -- a family is closed by its stride CHANGING, not by
which of its frames one run happened to ask for. Guard bumped 24 -> 29.

## Eleven test files pin the stream count, and all eleven moved

4194 -> 4244. `w218stage4.test.js` now carries the explanation for the class, because the
number moves whenever a wave harvests art and the next person to hit it should not have to
work out whether it is a floor or an identity claim. It is an identity claim.

## What this closes

**A death now draws.** The animation, the reset, the life spent, the respawn and the pods all
worked already (W227/W228/W231); what the player saw during the six frames of the death
itself was the ship's ordinary record and nothing else. The 49 sprites of the explosion were
computed by no code and shipped in no bundle.

## Order for the next wave

1. **Object dispatch `[11]` `$25DBB4` end to end.** `$2600D8` landed in W273 and W274 closed
   its last gap, so `[11]` needs only `$28D53C` (6 instructions) and `$23C932` (9), both
   trivial; `$2533F6`, `$253448` and `$241292` were already ported. 900 counted notes a run.
   Then the four other announcement-poster caller regions -- `$25CDxx`, `$25D5xx`, `$2601xx`,
   `$288A02` -- which share W270's protocol.
2. **The other 32 streams the walker can reach.** This wave shipped all 49 descriptors, but
   only entries 0..5 of the pointer table are known to be REACHED, because only `$24A120`'s
   write is transcribed. Something advances `($14,A6)` through the table -- the port already
   walks entry 1 during a real death, so the advance exists and is being done by code this
   port runs without a name for it. Find the writer and the other 32 frames get their
   trigger. `codexref 255B7C` is the way in.
3. Then D11's remainder and stage 5.

## And the rule from W274, earning its keep

W274 wrote: "a negative result about the image is a claim about a SCAN, so name the scan."
W272's bit-8 claim was one such. **W12's was another, and it was not a scan of the image at
all -- it was a scan of one SCENARIO.** `fly-around` has no death, so "never set in 2,233
frames" was never evidence about the game. Extend the rule: a negative measured on a corpus
is a claim about the corpus, and the corpus needs naming just as loudly as the tool does.
