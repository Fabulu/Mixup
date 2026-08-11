# W322: the `$5C` damage arm becomes one routine, and type `$1B` is NOT a leaf

Status: suite 2315/2315, green, no skips. Sweep 0 missing. `dojcoverage.py` both OK lines. Web
gate 31 of 31 (W321).

Two products. One is a refactor that removes a transcription before it happens. The other is a
dependency this wave went looking for `$1B`'s remaining arms and found instead, which is why
`$1B` is still not ported and should not have been.

## THE `$5C` DAMAGE ARM IS A FAMILY OF TWO, AND NOW ONE ROUTINE

W320 read type `$1B` and recorded that it runs type `$8E`'s damage arm instruction for
instruction with two parameters changed. This wave verified that against the ROM and then acted
on it: `damageArm5C` in `src/handlers.js`, called by BOTH types.

    26937e  moveq #$5C,D1 / and.b (A6),D1 / bne     the hit bits
    269384  move.b (base,A5),D0                     NOT hit: the base palette
    269388  cmpi.w #hpFull,($18,A6) / bcc           HP still full -> keep it
    26938e  (the bcc the disassembler misaligns -- see below)
    269390  tst.w $8130CA / bne                     the gate is up -> keep it
    269398  moveq #$19,D0                           else the LOW-HP palette
    26939c  andi.b #$A3,(A6) / jsr $286096          the HIT path: clear, then scoreHit
    2693a6  move.b ($1D,A6),D0
    2693aa  cmpi.b #$19,D0 / bne                    already low-HP -> flash from the BASE
    2693b4  move.b (xor,A5),D2 / eor.b D2,D0
    2693ba  tst.w ($18,A6) / bmi                    the death arm
    2693c2  move.b D0,($1D,A6)

The two parameter sets, and there are only two:

                     hpFull   base       xor        source
      type $8E       $140     ($18,A5)   ($19,A5)   $2764F4..$276538  (W319)
      type $1B       $380     ($1C,A5)   ($1D,A5)   $26937E..$2693C2  (W322)

`damageArm5C` returns `{pal, dead}` and the CALLER runs its own death arm, because the two death
arms are genuinely different routines. This is shared damage, not shared dying.

**Type `$8E` was refactored onto it and W319's tests are what proves the refactor is
behaviour-preserving.** They passed unchanged, first run, which is the only reason a refactor of
tested code was in scope at all. Type `$1B` will be the second caller when it lands, and the
third instance is what would say whether this is a family of two or of many.

### A disassembler note worth writing down

`rosetta.py dasm` misaligns at `$26938C` and prints `ori.b #$32,(A0)+`, which is not an
instruction in this routine. `cmpi.w #$380,($18,A6)` at `$269388` is SIX bytes and runs to
`$26938E`, so the real instruction is the `6432` at `$26938E`: `bcc $2693C2`. The garbage line is
the tail of the `cmpi` being read as an opcode. Checked because a `bcc` and an `ori.b` at the same
address are not the same routine, and the branch is what makes the "HP full keeps its palette"
early-out exist.

## TYPE `$1B` IS BLOCKED ON `$24226E`, AND THAT IS THE WAVE'S REAL FINDING

`$1B` was read END TO END this wave -- every arm, both exits, all five tables. Then it was NOT
written, and the init body and ROM windows this wave had already added were REVERTED. The reason:

    2694d0  movem.w ($2,A6),D0-D1        state 2 loads X and Y as two words
    2694d6  addi.w #$A80,D0
    2694da  jsr $24226e                  <-- THIS
    2694e0  move.w D1,D7

**`$24226E` has no port implementation.** It appears in exactly one place in `src/`:

    src/aim.js:84   [0x24226e, 48],

which is `AIM_REFS`, the reference-count map -- a measurement that it has **48 callers in the 6 MB
image**, not a translation of it. So it is a live, widely-shared entry point of the
player-tracking library that this port has never needed until now. `grep 0x24226e` finding a hit
is exactly the false positive W318 got burned by: the address is present as DATA about the
routine, not as the routine.

`$242B3C` next to it in the same arm is fine -- that is `items.js`'s `RNG_242B3C`, ported.

### Why the half was reverted rather than landed behind an `unreached`

The init body had already been written and passed. Landing it without a handler, or with a handler
whose state-2 arm is an `unreached`, would put a THROW on the fire path of a **stage-1** type --
the most-played stage in the game. That is the W56/W57 shape: type `$1C` stopped the live page
because something was registered that could not complete. A type that cannot finish is better
absent than half-present, so `initbody.js` and `export-tables.py` were both put back.

The ROM windows were reverted for a second and independent reason that W321 had just established:
**adding windows changes `player.tables.json`, which changes the asset bytes, which repacks the
sprite shards, which moves the web gate's shard-filtered counts.** Landing windows for code that
is not there would risk turning the gate red again for nothing. They belong in the same wave as
the write, with one `export-web.mjs` and one gate run covering both.

## WHAT IS READ, SO THE NEXT WAVE WRITES AND DOES NOT RE-READ

Everything below is measured this wave unless marked W320.

**Init body `$26925E..$2692D0`** (W320, re-verified instruction by instruction):

    269264  jsr $2637A2 on $2692FA, and $26926A stores the ADVANCED A0 into ($44,A5) -- the
            table-advance idiom W218's type $9F uses; the sub prototype's end is whatever the
            loader computed, never a constant
    269276  jsr $26377A on $2692DC with D0 = $E -- D0+1 = 15 words
    26927c  D0 = D1 = 4; `cmpi.w #$1,$813092 / bls` keeps 4/4 on stages 0 AND 1, and only stage 2
            onward takes D0 = 3, D1 = 0. Two `move.b`s, so byte fields, not a word pair
    269296  ($2F,A5) = D0 ; $26929A ($2E,A5) = D1
    26929e  ($28,A6) indexes $26971C -> ($2A,A6)
    2692ae  $813094 (the stage index DOUBLED) indexes $2692D2 -> ($1C,A5), ($1D,A5)
    2692c4  addq.w #1,$8130D8                    THE REFCOUNT
    2692ca  jmp $263808 -- a TAIL jump, so the position read is the last thing that happens

**Handler `$269350`:**

    269350  jsr $2638A6 (stepMovement)
    269356  an INLINE bounds test, not a call to $242684: D0 = ($2,A6); addi.w #$C00; addi.w
            #$7800; bcc = on screen. TWO SEPARATE ADDS, so the deciding carry comes from the
            SECOND one alone and the first add's carry is discarded. Off screen and ($16,A5)
            already set -> subq.w #1,$8130D8 then jmp $263762. Off screen and not yet seen ->
            straight to the damage arm. On screen -> $269378 move.b #$1,($16,A5)
    26937e  the shared $5C damage arm above
    2693c6  jsr $28AC72 -- `spawnCues28AC72`, ported
    2693cc  tst.w $8130D2 / bne $269434          the freeze, a WORD here
    2693d4  ($6,A6) = $F400; then ($1B,A6) < $40 gates ($2E,A6) += $20 and subtracts that word's
            bit 6 from ($6,A6)
    2693f4  ($26,A6)/($27,A6) cadence, then ($1B,A6) picks the direction: UP adds 4 and wraps
            $10 -> 0, DOWN subtracts 4 and reloads $C on the borrow. A FOUR-ENTRY RING (0, 4,
            8, $C)
    269424  ($28,A6) indexes $26971C -> ($2A,A6)
    269434  tst.L $8130D2 twice in a row, at $269434 and $26943E, both `bne $269582`
    269448  cmpi.w #$1000,($2,A6) / blt -> just draw

**A FOUR-state machine on `($18,A5)`, read as a WORD** (W320 recorded two; it is four):

    state 0  $269458  ($1E,A5) cadence; on borrow ($1E,A5) = $10 and ($18,A5) = 1 -> state 1
    state 1  $269476  ($22,A5)/($23,A5) cadence; requires ($2,A6) < $6C00 (`bge` is SIGNED);
                      ($24,A5) += 4 and indexes the EIGHT longs at $26972C into ($26,A5); at
                      index $1C sets ($34,A5) = $FFFE and ($18,A5) = 2 -> state 2
    state 2  $2694BA  ($1E,A5)/($2E,A5) cadence; `movem.w ($2,A6),D0-D1`, D0 += $A80,
                      jsr $24226E  <-- THE BLOCKER; then TWO shots through $281708, a mirrored
                      pair with D3 = $0A800400 and $0A7FFC00, each with an RNG jitter from
                      $242B3C (`asr.b #1,D0 / add.b D0,D1`), and D0 assembled by the swap trick
                      as (($34,A5) << 16) | $13. Then ($34,A5) += 1, and the ($20,A5)/($21,A5)
                      burst counter; when IT expires ($1E,A5) = ($1F,A5), ($22,A5) = $10 and
                      ($18,A5) = 3 -> state 3. Note `move.b ($21,A5),($20,A5)` then `beq`: the
                      branch tests the MOVE, so a zero reload holds the state
    state 3  $269556  ($22,A5)/($23,A5) cadence; ($24,A5) -= 4 back down through $26972C into
                      ($26,A5); at index 0 `clr.w ($18,A5)` -> state 0

**This is type `$45`'s shape.** W316's `$45` is a four-state machine that delays, ramps `($1E,A5)`
UP by 4 and clamps at `$1C`, fires, then ramps back DOWN by 4 -- the same states, the same step of
4, the same `$1C` clamp, on a different field. Worth recording as a candidate family before a
third one is written.

**Draw arm `$269582`,** and it needs no new emitter:

    269582  D1 = ($2,A6) with one axis -$600 and the other -$E00 (two addi.w around a swap);
            D2 = ($2A,A6); D3 = $230; D4 = ($1C,A6); jsr $23DF58
    2695a4  jsr $23D816
    2695aa  D1 = ($2,A6), -$600 and +$800 less (($2E,A6) & $40) -- the sweep bit; D2 = ($26,A5),
            the ramped long; D3 = $430; D4 = ($1C,A6); jsr $23DF58
    2695d6  tst.l $8130D2 / rts on the freeze, else fall into the fire arm

`$23DF58` is bucket 3's REGISTER-convention emitter (`enqueueRegistersThroughStub`, already used
at `$269BAE` among others). `$23D816` is bucket 3's RECORD-convention emitter -- `$23D816 lea
$80688C,A0 / adda.w $80AFC6,A0` is the same bucket, and `$23D822 lea ($2,A6),A1` says its record
is **A6**, so the port call is `enqueueThroughStub(ram, rom, 0x23d816, a6)`. Both conventions into
one bucket from one draw arm is worth knowing.

**Fire arm `$2695E0`:**

    2695e0  cmpi.w #$1000,($2,A6) / blt -> rts
    2695e8  ($30,A5)/($2F,A5) cadence
    2695f4  D0 = $FFFE0004; D2 = ($2,A6); D3 = $FE000000; D4 = 0
    269606  moveq #$7,D7 -> EIGHT passes; D1 = $6B, jsr $281708, D1 += 7, dbra
    26961a  ($32,A5)/($33,A5) second cadence; on expiry ($30,A5) = ($31,A5) -- it SWAPS the first
            cadence's reload period, which is a burst-then-rest pattern rather than one rate

**Death arm `$26962E`:**

    26962e  D0 = $130, jsr $28615E                scoreKill
    26963a  jsr $28C28E                           a cue (ctx.soundPost)
    269640  D0 = $C, D1 = 8, jsr $289B22          a noteEffect -- handlers.js already notes
                                                  $289B22 at three sites with D0 = $C
    26964c  moveq #$D, jsr $289004  + SEVEN writes to A0
    26967e  moveq #$C, jsr $289004  + the same seven with ($14,A0) = 0, ($26,A0) = $FA00,
                                     ($28,A0) = $600
    2696b0  move.l #$84,D0, jsr $289004 + seven more. NOTE the `move.l`, not a `moveq`, and
            `spawnEffect` masks D0 & $7F, so this spawns kind **4**, not kind $84
    2696e6  subq.w #1,$8130D8                     the refcount, again
    2696ec  D0 = 8; lea ($26970C,PC),A4; moveq #$3,D6 -> FOUR passes of `move.l (A4)+,D1`,
            D2 = 3, jsr $27F8F0 -- `allocPoolA27F8F0`, exported by bee.js with exactly this
            signature. The `(A4)+` walk means the `lea` names the BASE, the display-family
            convention
    269704  jmp $263762

Three `$289004` spawns each followed by seven `move.w`s is the canonical family shape
`handlers.js:275` already documents ("Every death arm inlines `moveq #kind,D0 / jsr $289004`").
And every `move.w #$1,($12,A0)` in them is TWO BYTE FIELDS: byte $12 becomes 0 and byte $13
becomes 1. That is the W273/W316/W317 trap and it is live in this arm nine times.

**The five tables, with the extents CODE pins rather than a count:**

    $2692D2 + $0A   five two-byte stage rows, and ALL FIVE ARE `0A 15` -- verified by hex dump.
                    The stage index changes nothing here. Port the indexed read anyway; the
                    sameness is a measurement about this build, not a licence to drop the index
    $2692DC + $1E   the 15-word record prototype
    $2692FA + ?     the sub prototype; its end is whatever $2637A2 computes, so it has no stated
                    length. The whole data block runs $2692D2..$269350 ($7E bytes) and ends at
                    the handler, whose first bytes are `4e b9` (jsr) -- confirmed by hex dump
    $26970C + $10   the death arm's four rows
    $26971C + $10   the four-entry sprite ring
    $26972C + $20   the eight-long ($24,A5) ramp, indices 0..$1C

The last three are CONTIGUOUS: one window `$26970C + $40`, ending at `$26974C`. It overlaps W23's
`$269740 + $20` type-$31 stub window, which is fine -- this file already overlaps windows on
purpose (see its `$2881D2` note) -- and what is forbidden is widening an existing one, so a new
window is the right move. Both windows are written out here and were deliberately NOT committed.

## Order for the next wave

1. **`$24226E` first**, as its own wave. 48 callers makes it a shared library entry, not a type's
   private helper, and porting it unblocks `$1B` and probably more. `aim.js` is where it goes and
   `AIM_REFS` already names it.
2. **Then `$1B`**, from the read above -- it is a transcription now, not an investigation, and the
   damage arm is already waiting for it. Add both ROM windows WITH the code, then one
   `export-web.mjs` and one web-gate run.
3. **Then `$8130D8` as its own small wave.** W320's rename, still not done, and W322 adds a
   witness to it: `initbody.test.js` calls it "the stage-kill flag" and "midboss spawned" in two
   test names, `handlers.js` calls it `midbossD8`, and `bullets.js` calls it `initX`. It is a
   live-enemy REFCOUNT -- `$1B` increments it in its init body and decrements it on BOTH exits,
   which this wave read directly. Three files and two test names to correct together.
4. Then `$81` (3 records), `$1A`, `$49`/`$4A`/`$4B`, `$47`, then the dependency bundles.
5. **`$B0` is boss reconnaissance, not an enemy.** HIBACHI CLOSURE RULE in the handoff.
