# W318: type $8E read end to end, and two corrections to my own dependency scan

Status: RECON, no source change. Suite 2315/2315 unchanged, green, no skips. Sweep 0 missing.

This wave is a transcription plan, not a transcription. Type `$8E` is read completely and both of
the dependency scares turned out to be my own errors -- which is the useful part, because both would
have mis-ordered the next several waves.

## Starting state

W317 committed and pushed at `25a51a2`, suite 2315/2315.

## CORRECTION 1: W317's SCAN MEASURED CHILD TYPES, NOT SUBROUTINES

W317 labelled nine of the thirteen remaining types "standalone" on the strength of a scan for the
three deferred-spawn entry points. That measures whether a type spawns an unported ENEMY TYPE. It
says nothing about whether the handler CALLS an unported routine, and I wrote "standalone" as if it
did. The label was too strong and this wave widened the scan.

## CORRECTION 2: AND THE WIDENED SCAN'S ONE HIT WAS ALSO WRONG

The widened scan flagged `$268018` -- 138 bytes, called by `$8E` at `$2765C0` -- as unported, on the
evidence that `grep 0x268018 src/*.js` finds nothing.

It is ported. `handlers.js:416` implements it as **`playerDist268018`**, described at line 406 as
"the OCTAGONAL player distance, computed per player". The grep missed it because the address appears
in the function's NAME and in `$`-prefixed comments, never as a `0x` literal.

So W317's table was right, `$8E` is genuinely clean, and my correction was the error. **Third time
this session that checking my own conclusion reversed it** -- after W314's bare-`Ram` control and
W315's coverage-inventory catch. This one reverted a would-be correction rather than a would-be
port, which is the same lesson from the other side.

The reusable part: **`grep 0x2xxxxx` is not a test for "is this ported".** This project names ported
routines after their addresses and cites them as `$2xxxxx` in prose, so a hex-literal search finds
data tables and misses routines. Search both forms, and prefer the registry (`HANDLER_ADDRESSES`,
`INIT_BODY_ADDRESSES`, `enemyHandlerMap`) where one exists.

## TYPE $8E, READ END TO END

Init body `$27640C..$27649F`; handler `$2764D2..$2766A5`; six script records.

    27640c  loadSubProto($2764B6) / loadRecordProto($2764AA, 5)   -- 6 words
    276426  readMovementInit
    27642c  STAGE 1 only ($813092 == 0) AND clock >= $156: HP ($18,A6) = $500
    276444  aim64AtTarget, result to ($21,A5)
    27644e  ($1B,A6) & $3E, doubled -> the 32-entry sprite table $272D7A -> ($A,A6)
    276464  ($17,A5) = 4, then a second $813092 test that ALSO writes 4
    27647a  ($1A,A5) -= $8130B4          the rank byte
    276484  $813094 (stage*2) indexes $2764A0: ($1D,A6), ($18,A5), ($19,A5)

`$2764A0` is `10 0F 00 1E 00 1E 00 1E 11 0E` -- five 2-byte rows, one per stage, and `adda.w D0,A0`
with D0 = stage*2 picks the row. So stage 1 gets `$10,$0F` and stage 5 gets `$11,$0E`. The three
reads are `(A0)` then `(A0)+` twice, so `($1D,A6)` and `($18,A5)` both take the FIRST byte.

Handler:

    2764d2  stepMovement, then onScreen242684; off-screen with ($16,A5) set -> freeEnemy
    2764f4  the $5C hit mask on (A6)
              no hit: D0 = ($18,A5); if HP >= $140 or $8130CA set, draw with it,
                      else D0 = $19 -- a LOW-HP palette
              hit:    andi.b #$A3,(A6), scoreHit, and if the palette was already $19 reset it
                      to ($18,A5) before the ($19,A5) XOR flash
    276530  HP negative -> the death arm at $27662E
    27653c  tst.L $8130D2 -- a LONGWORD test over the freeze AND $8130D4, the same shape as
            W308's `tst.w $81E0D8`; a `.w` reading would ignore $8130D4 entirely
    276546  cadence ($1E)/($1F); when ($1C,A5) == ($1D,A5), pick the nearer live player
            (the two records $8103E6/$810448, `exg` on ($3,A5), `bmi`/`bpl` on each), aim256
            core $24203E, slew64 $242190, store the facing in ($20,A5) and the directional
            sprite from $272D7A
    2765ac  X >= $1000 and the ($1A,A5) cadence: playerDist268018 gates the shot; fire
            $2813F0 with D3 from the muzzle table $27327A + $80000, then a second cadence
            on ($1C)/($1D) reloads ($1A,A5) from $40 - $8130BA
    276612  the DRAW: emitter dispatch -- ($1E,A6)*4 into $2782CC, `movea.l (A0,D0.w),A0 /
            jsr (A0)`, with D6 = $F800F800
    27662e  the death: scoreKill $20, cue $28C25A, a word from $278314[($1E,A6)*2],
            $289AF4 with D0 = 8, $27F8EE with D0 = 8 and D2 = ($1E,A6), then $289004 with
            D0 = $C and the position copied into it

## WHAT THE TRANSCRIPTION STILL NEEDS DECIDED

Two things, both about the draw and death arms rather than the logic:

1. **`$2782CC`** is inside the 18-entry primary-emitter table `$27829C` that `spritequeue.js`
   documents (`$27829C + 12*4 = $2782CC`), and the call is `movea.l (A0,D0.w),A0 / jsr (A0)` -- a
   table-driven emitter, so it wants `resolveEmitStub`/`enqueueThroughStub` rather than a fixed
   stub address. Which of the port's enqueue wrappers matches has to be read off the resolved
   entry, not assumed.
2. **`$278314`** is a second table (`$2782E4 + $30`, just past the 12 register-convention entries)
   and the death arm reads a WORD from it at `($1E,A6)*2`, not a longword. Its extent needs the
   same both-sides bounding the W316 and W317 windows got.

Neither is hard; both are the kind of thing that goes wrong when guessed, and there was not enough of
this wave left to do them properly. Recorded rather than half-written.

## Order for the next wave

1. **FINISH TYPE `$8E`** from the plan above. The logic is fully read; what remains is resolving
   `$2782CC`'s emitter entry and bounding `$278314`.
2. Then `$1B` (5 records, ~1020B) and `$81` (3, ~1452B) -- the two whose every `jsr` target the port
   already implements and which spawn nothing.
3. **Leave `$46` until `$55`**, `$48` until `$54`, `$43` until `$44`, and `$4C` last (four children).
4. Stage 5's boss and end sequence, then the loops.
5. **`$280252`** still blocked on measuring A0 at `$28029A` (W288).
6. Mover kind 18's spawn arm, now that W317 established `$263684` is `enqueueDeferred`.
