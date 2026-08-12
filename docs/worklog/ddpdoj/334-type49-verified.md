# W334: type `$49` verified against the type table, and three traps in its handler

Status: suite **2375/2375**, green, no skips. Sweep 0 missing. `dojcoverage.py` both OK lines. This
wave is **recon plus one docstring fix**; it adds no port behaviour. It is written up because three
of its findings would each have produced a wrong `$49`.

## WHAT WAS ALREADY RIGHT, SAID PLAINLY

The handoff already had `$49`'s entry points correct: `$27159E` recorded as "the stub -- run length
ZERO" with `$2715A6` as the body. **That reading is confirmed, not corrected.** What this wave adds
is the type table check and the name of the mechanism, because "stub then body" as a description does
not say WHY the body runs when nothing branches to it.

    $267824 + $49 * 8 = $267A6C:   0027159e 00271640

    27159e  move.w #$0,($4,A5)
    2715a4  rts

`$2715A4` is an `rts` and `codexref` finds no code reference to `$2715A6` at all. It runs because
`spawn.js:219` computes the body's address arithmetically:

    const initBody = init + 8;      // $26361A addq.w #8,A1

`$27159E + 8 = $2715A6`. So the init exists only to declare the sub-record count and the machinery
calls `init + 8` for the body. `$81` is the identical shape and the port already names both halves
(`init: 0x273f06, initBody: 0x273f0e`), so `$49` gets recorded the same way:

    type $49    init $27159E  (($4,A5) = 0, so ONE sub-record)    initBody $2715A6    handler $271640

Worth stating because a reader who sees a caller-less routine and no `bra` into it can reasonably
conclude the disassembly is wrong. It is not; the caller is a `+ 8`.

## THE INIT BODY

    2715a6  lea ($271624,PC),A0 / jsr $2637A2        loadSubProto,  sub proto $271624
    2715b2  lea ($271616,PC),A0 / moveq #$6,D0 / jsr $26377A   loadRecordProto, D0+1 = 7 WORDS
    2715c0  jsr $263808                              readInitPosition
    2715c6  cmpi.w #$1F3,$8130CE / bne $2715DE       an EQUALITY on the scroll clock
    2715d2  move.b #$40,($1C,A6)
    2715d8  move.b #$1,($17,A5)                      the SOLE writer of ($17,A5)
    2715de  move.b ($18,A5),($1D,A6)                 the base palette
    2715e4  move.w #$1,$81B414 ; move.w #$1,$81B416
    2715f4  A0 = $8130E0 ; cmpi.w #$260,$8130CE / bcs -> keep ; else A0 = $8130E4
    27160c  move.l A0,($20,A5) / move.w #$1,(A0)
    271614  rts

`($20,A5)` is a POINTER TO A FORMATION FLAG, and that is why the handler frees through it. Both exit
paths do `movea.l ($20,A5),A0 / clr.w (A0)` -- the death arm at `$27168A` and the off-screen free at
`$2716BE`. One of two flags is chosen by scroll position (`< $260` takes `$8130E0`, otherwise
`$8130E4`), so the two formations of `$49` on the stage clear independent flags. A port that stored
the flag's VALUE instead of its address would break both exits.

The `$1F3` equality is deterministic and not a race: records are spawned when the scroll clock
reaches their trigger, so "the record whose trigger is exactly `$1F3`" is one specific record, which
gets sprite base `($1C,A6) = $40` and the mirrored sweep.

## TRAP 1: THE SUB PROTOTYPE OVERLAPS THE HANDLER

`loadSubProto` copies `($4,A5)+1` sub-records of **`$20` bytes**. `($4,A5)` is 0, so one record:
`$271624..$271643`. The handler starts at **`$271640`**. So the prototype's last four bytes are the
handler's first two instructions, `725C C216` = `moveq #$5C,D1 / and.b (A6),D1`.

That is not a misreading, it is the cartridge overlapping data with code. Offsets `+$1C` and `+$1D`
of the fresh record receive `$72 $5C` and are then immediately overwritten by the init itself
(`$2715D2` and `$2715DE`), so only `+$1E`/`+$1F` keep code bytes, as `$C2 $16`.

**Consequence for the window:** the declared window must cover `$271616..$271644`, which spans into
the handler. That is legal -- a window is a byte range and `RomWindows` only cares that a read is
contained WHOLE -- but it must be declared deliberately with this note attached, because it looks
like an off-by-one otherwise.

## TRAP 2: `$2716D8` IS A DEAD INSTRUCTION THAT READS CODE AS DATA

    2716d8  tst.w $271774.l
    2716de  subq.b #1,($1A,A5)
    2716e2  bcc $271774

`$271774` is inside this same routine; the word there is `$41FA`, the `lea` opcode. So the `tst.w`
reads an instruction as data, and then `subq.b` overwrites every flag before the `bcc` reads carry.
**The instruction has no effect and the port must omit it**, not model it. Same shape as W326's
`$27460A` ramp where index `$18` is code, and W332's `$25DAC2`, and it is the third instance of
"this ROM indexes its own instruction stream" in stage 5's band.

## TRAP 3: `neg.w` ON A REGISTER LOADED BY `move.l`

    271714  lea ($271814,PC),A1 / adda.w ($1C,A5),A1 / move.l (A1),D3
    271724  tst.b ($17,A5) / beq $27172E
    27172c  neg.w D3                        <-- WORD negate on a LONG value
    27172e  add.l D3,D2

D3 holds a packed offset pair (high word X, low word Y). `neg.w` negates **only the low word and
produces no borrow into the high word**, so the mirrored variant flips Y and keeps X. Then `add.l`
adds both halves at once, so a low-word carry DOES propagate into X. Writing this as a long negate
would move the mirrored formation horizontally as well.

## THE FIRE TABLES, MEASURED

`($1C,A5)` steps `addq.w #4` and wraps at `$78` (`$271760..$271772`), so **30 steps**.

    $27179C   30 LONGS, raw ($1C,A5)        the draw's sprite records ($316494 step $2A4)
    $271814   30 LONGS, raw ($1C,A5)        packed muzzle offsets, $0080FD00 .. and back
    $27188C   30 WORDS, ($1C,A5) asr 1      ($17,A5) SET   -- $66 ascending by 6, then back down
    $271904   30 WORDS, ($1C,A5) asr 1      ($17,A5) CLEAR -- $9A descending by 6, then back up

**Two tables share one index with two different conventions**: halved for the word tables, raw for
the long tables. The word values sweep up and return, so the attack is a fan that sweeps out and
back over 30 frames, and `($17,A5)` picks which direction it starts in. The three spawners are
already ported and reachable through `shoot`: `$2816F6` (D0 = 4), `$281764` (D0 = `$FFFC0005`), and
`$281744` (D0 = `$40003`, gated on scroll `>= $268`).

## WHAT IS STILL UNREAD

Nothing in `$49`. `$27159E..$27179A` is now read end to end. What remains is writing it, and the
reason this wave stopped short of that is scope honesty: init body, an inline damage arm, the death
arm, the fire arm, the draw, tests and four census pins is one uninterrupted pass, and stage 5 spawns
`$49`, so a half-registered type is a live crash rather than a missing picture.

## The damage arm is the SIMPLE member, and here is why

    271640  moveq #$5C,D1 / and.b (A6),D1 / beq $271698     <- the $5C the family is NAMED for
    271648  move.b #$A3,D0 / and.b D0,(A6)                  clear those bits
    27164e  jsr $286096                                     scoreHit
    271654  D0 = ($1D,A6) ; D2 = ($19,A5) ; eor.b D2,D0 ; move.b D0,($1D,A6)
    271662  tst.w ($18,A6) / bpl $27169E                    still alive
    271698  move.b ($18,A5),($1D,A6)                        NOT hit: restore the base palette

There is no `hpFull` reload and no palette DECISION -- just base `($18,A5)`, XOR mask `($19,A5)`.
`damageArm5C` would invent the `hpFull` write and a palette choice this member does not make, which
is why the handoff says to write it inline. This is the fifth member of the family and the first
simple one.

## Order for the next wave

1. **`$49`**, in one pass, with the corrected `init`/`initBody` pair and the three traps above.
   Window `$271616..$271644` (note the handler overlap) plus one for the death list `$27197C`.
2. Then `$4A` (`$271A64`) and `$4B` (`$271D48`), which share `$270D92` (W333).
3. Then `$47` (`$E2`). `$1A` stays blocked until D2/D3 at `$268D8C` are measured.
4. Then stage 5's boss, the HIBACHI CLOSURE RULE, then the loops.
