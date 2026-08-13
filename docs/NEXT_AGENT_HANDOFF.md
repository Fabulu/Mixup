# DoDonPachi DOJBL Version-B: next-agent handoff

Updated: 2026-08-12

## READ THIS FIRST -- STATE AS OF W367

    suite 2479/2479 green, ZERO skips     sweep 0 missing     dojcoverage.py both OK lines
    447 ROM windows                       live build 20260813065010      tree clean, all pushed

**Stage 5: ONE unported type over ONE record.** It began this session at FOUR types over 19.

    $55  PORTED (W351)   the burst-firing drifter
    $46  PORTED (W352)   $55's parent, the extend-spawn-retract arm
    $B0  REGISTERED (W363)  Hibachi -- handler complete, BODY $2A6B94 is a note(), so it appears and lets
                            the stage clear but does not attack
    $1A  PORTED (W365)   the slewing twin-weapon turret
    $4C  THE LAST ONE    one record, fully specified in T4C (43 fields, 18 assertions), NOT written

**`$4C` needs writing, and it is fully prepared.** Read `T4C` and the `$4C` section below: the mechanism is a
multi-part destructible set-piece with a scripted vulnerability window, it has sixteen internal subroutines of which
only TWO are shared, and both shared helpers are read with their traps recorded. **What remains unread are the
fourteen single-call blocks.**

**THE ONE RULE THAT MATTERED MOST THIS SESSION, stated first because it cost the most:** **read every helper's
signature from its definition or an existing call site. Never recall it.** Seven of seven recalled conventions were
wrong, every one silent -- a mirrored aim, a facing from the wrong structure, a duplicate port, dropped field writes,
`ctx` in a record's place. **The two I was most confident about were both wrong.**

**And the second: `rosetta.py dasm` misaligns silently -- SEVEN times this session.** If its first line is not the
address you asked for, it is a MISS. Use raw bytes for anything load-bearing. Once, the instruction it swallowed WAS
the finding (`$26F858`'s guard).

## TYPE $B0 -- HIBACHI (W357, OPENED). Its handler is only 170 BYTES.

High table `$27E412 + ($B0-$80)*8 = $27E592`: init `$2A42D4`, body `$2A42DC`, handler `$2A4606`. **Both
unclaimed**, and W347's high-table formula produced the entry points correctly on first use.

**Bounded first (rule 11), and it is much smaller than expected.** `rts` sites from `$2A4606`: `$2A46B0`,
`$2A4DDE`, `$2A4F54`, `$2A50E2`, then 102 more out to `$2A9000`. **The handler proper is
`$2A4606..$2A46B0` -- 170 bytes** -- followed by an 1838-byte routine. The boss's bulk is in callees, not in
the handler.

    2a4606  jsr $2A6B94                     <- UNCLAIMED, and the only unported callee so far
    2a460c  jsr $25962E                     already ported (11 code mentions)
    2a4612  bcc $2A4622
    2a4614  jsr $242952                     <- THE STAGE-CLEAR ROUTINE
    2a461a  jmp $263762                     and exit
    2a4622  lea (A6),A0     / jsr $26331C   part 1
    2a462a  lea ($20,A6),A0 / jsr $26331C   part 2
    2a4634  lea ($40,A6),A0 / jsr $26331C   part 3
    2a463e  lea ($60,A6),A0 / jsr $26331C   part 4

**`$242952` IS THE STAGE-CLEAR ROUTINE**, the one D11 records W232 forcing headlessly ("the stage machine
WORKS: the type-6 object runs, the clearing flag sets, the stage word steps"). So **Hibachi's handler is where
the game's completion path is triggered**: `$25962E` returns a carry, and on the clear side the handler calls
stage-clear and frees itself. **That makes this handler directly load-bearing for D37 (the endings)** -- it is
the junction between the boss finishing and the stage machine advancing, and it is 170 bytes.

**AND `$26331C` -- THE BARE `rts` I FOUND IN `$1A` -- IS CALLED FOUR TIMES HERE, PER PART, AT THE `$20`
STRIDE.** `(A6)`, `($20,A6)`, `($40,A6)`, `($60,A6)`. So it is a deliberate **per-part hook that is disabled in
this build**, not an oddity of `$1A`: five call sites across two types, all passing a part base, all reaching a
single `rts`. **Transcribe the calls and do nothing in them.** Anyone who "implements" it will be inventing a
subsystem the cartridge switched off.

**RETRACTED WITHIN THE WAVE: Hibachi is an ELEVEN-part object, not four.** I counted four `$26331C` calls
because I had read only the first fourteen disassembly lines. Counting the call sites across the whole handler
(rule 8, which I should have applied first) gives **eleven**, and the ORDER is the finding:

    ROM order:  $0 $20 $40 $60 $80 $A0 $C0  $1A0  $140 $160 $180
    sorted:     $0 $20 $40 $60 $80 $A0 $C0  $140 $160 $180 $1A0

**`$1A0` is called EIGHTH, out of sequence, between `$C0` and `$140`.** Ten of the eleven are in ascending
order and one is deliberately displaced. **That is not a loop and cannot be written as one** -- a port that
iterated `for (let p = 0; p <= 0x1A0; p += 0x20)` would both visit `$E0`, `$100` and `$120` (which are NOT
called) and get `$1A0` in the wrong position.

**Also note the gap:** `$C0` to `$140` skips `$E0`, `$100` and `$120`. So the eleven parts are not contiguous
either. **The call list is data, not a range** -- transcribe the eleven offsets in ROM order.

`$4C` has five parts addressed by offset with no loop; Hibachi has eleven, also by offset, also with no loop,
and with one deliberately out of order. **Same architecture, and in both cases the temptation to write a loop is
the trap.**

### Hibachi's handler READ END TO END -- all 170 bytes

    2a4606  jsr $2A6B94                    UNPORTED, and it runs FIRST
    2a460c  jsr $25962E 
    2a4612  bcc $2A4622
    2a4614  jsr $242952 / jmp $263762      the STAGE-CLEAR path, then free
    2a4622  eleven `lea (part,A6),A0 / jsr $26331C` calls, one out of order
    2a469a  moveq #$0,D3 / move.w D0,D3    D3 = whatever D0 held, zero-extended
    2a469e  move.w #$0,D0
    2a46a2  move.w #$0,D1
    2a46a6  move.w #$2,D2
    2a46aa  jsr $25A17A                    UNPORTED
    2a46b0  rts

**So the whole handler is: one unported prologue call, a clear test with the stage-clear path, eleven disabled
per-part hooks, and one unported epilogue call.** That is the entire boss-route root -- and **nine of its eleven
`$26331C` calls do nothing**, because `$26331C` is a bare `rts`.

**AND `$25A17A` IS ALSO A BARE `rts`.** The bytes at `$25A17A` are `4e75 4e75 4e75 4e75` -- **four consecutive
`rts` instructions**, at `$25A17A`, `$25A17C`, `$25A17E` and `$25A180`. So the epilogue call does nothing either,
and the careful `D0=0 D1=0 D2=2 D3=<incoming D0>` setup before it is discarded.

**That retracts the speculation that `$25A17A` is where ending selection happens.** It selects nothing. A run of
four adjacent `rts` bytes is a TABLE OF DISABLED HOOKS -- the same construct as `$26331C`, four side by side -- so
this build has stubbed out a whole group of entry points, not just one.

**So Hibachi's handler does exactly TWO things**: `jsr $2A6B94`, and the stage-clear path when `$25962E` says the
boss is finished. **Everything else in its 170 bytes is disabled**: eleven `$26331C` calls and one `$25A17A` call,
twelve no-ops in total, plus four dead register loads. **ONE unported callee, not two.**

`$2A6B94` is therefore the entire boss, and it is the 1838-byte stretch ending at `$2A4DDE`.

### W358: `$2A6B94` opened -- it IS real code, and it opens with an early-exit guard

Checked against the stub pattern first, since three "unported" routines this session turned out to be bare
`rts`. This one is not:

    2a6b94  4a6e 0106     tst.w ($106,A6)
    2a6b98  6702          beq.s $2A6B9C      <- branches OVER the rts to the next instruction
    2a6b9a  4e75          rts                 non-zero -> RETURN IMMEDIATELY
    2a6b9c  4a2e 010e     tst.b ($10E,A6)
    2a6ba0  6600 0370     bne.w $2A6F12

**W362 CORRECTION: the four lines above were recorded off by two, and the `bne` target was wrong.** I had the
`rts` and the `tst.b` sharing an address (impossible) and gave the target as `$2A6F10`. **An audit of every
hand-computed branch target in these notes caught it** -- the bytes are `4e 75 | 4a 2e 01 0e | 66 00 03 70` from
`$2A6B9A`, and `bne.w`'s displacement is relative to the byte after the opcode word, so `$2A6BA2 + $370 =
$2A6F12`. `TB0` is corrected too.

**The `beq.s +2` over a single `rts` is the idiom**: the routine does nothing unless `($106,A6)` is zero. Its
first `rts` is only 6 bytes in, which is why a naive "first rts bounds the routine" scan would have called it a
stub too. **The real first block runs to `$2A6E2E`, 666 bytes in.**

**`($106,A6)` and `($10E,A6)` are both past `$100`**, consistent with Hibachi's eleven parts reaching `$1A0` --
so A6 here is the same large multi-part sub-record the handler walks. **These are not part-relative offsets;
they are absolute positions in a sub-record big enough to hold eleven `$20`-byte parts and more.**

**So the boss's structure is: a guard on `($106,A6)`, then a `($10E,A6)` test branching `$370` forward.** Two
gates before any behaviour, and `$2A6F10` (the `bne` target) is a separate arm past the first block's end.

### ALL TWELVE of the first block's callees are ALREADY PORTED

Counted before reading (rule 8): `$2A6B9A..$2A6E30` makes **15 calls to 12 distinct targets**, and every one is
claimed:

    $259B34 x2   13 code      $2598A2 x2   13 code      $243DD0 x2    2 code, 4 notes
    $25980C      42 code      $2599EC      21 code      $2428A6      10 code
    $286096      scoreHit     $28615E      scoreKill    $28C170       3 code, 3 notes
    $23C4D0       2 code      $242922       1 code      $253564       1 code

**RETRACTED: THREE OF THE TWELVE ARE `note()` DEFERRALS, NOT IMPLEMENTATIONS.** The THIN warning added this wave
pointed straight at them, and reading the code site settles it -- `boss.js:184-186` is:

    note(ctx, 0x23c4d0);      // $294DE4
    note(ctx, 0x253564);      // $294DEA
    note(ctx, 0x242922);      // $294DF0

**Those are the port declaring the addresses NOT ported.** So Hibachi's first block needs new primitives, and the
"five consecutive types needing nothing new" claim covers `$55`, `$46`, `$1A` and `$4C` but not `$B0`.

**THE VERIFIED PICTURE, after three rounds of fixing `claimed.py` itself** (see below), is THREE unported --
but not the three above:

    $242922   4 mentions, ALL note()          genuinely unported
    $253564   5 mentions, 4 note()            genuinely unported
    $243DD0   7 mentions, 6 note()            genuinely unported -- the HIT-STOP / SCREEN-SHAKE routine
    $23C4D0   1 CODE in initbody.js:1250      PORTED for that caller, deferred in boss.js -- do not rewrite
    the other eight                           ported

**`$243DD0` is the interesting one: hit-stop / screen-shake is a SHARED effect, not boss-specific.** Its note at
`boss.js:113` records three call sites (`$292912`, `$294C68`, `$294D4C`), so writing it serves more than `$B0`.

**AND IT IS A MEMBER OF A FOURTEEN-ENTRY FAMILY THE PORT ALREADY HAS SIBLINGS FOR.** `bomb.js:331` already
documents the whole region -- this was investigated long before this wave:

    $243CE0..$2440DE   FOURTEEN near-identical entries
    $243E7C            the MIDBOSS's -- ported, as `armScreenClear` in src/midboss.js
    $243DA0            the BOMB's -- arms $81B412 := $FFFF and returns, ten instructions
    $243DD0            <- the one Hibachi calls

And `bulletdriver.js` documents that `$281CE0 move.w $81B412,D0 / bmi` **forks on the SIGN of `$81B412`**, so the
family members differ in what they arm it to: `$0` walks 210 slots, `$FFFF` returns immediately.

**So `$243DD0` is a small variant of a ported routine, not new work. READ IN FULL, it is a 28-byte GUARD:**

    243dd0  tst.w $81B410      / beq $243DEE     armWord zero        -> fall through to the body
    243dd8  cmpi.w #$20,$81B412 / bcs $243DEE    modeWord below $20  -> fall through to the body
    243de2  cmpi.w #$3C,$81B412 / bhi $243DEE    modeWord above $3C  -> fall through to the body
    243dec  rts                                   IN the window [$20,$3C] -> RETURN, do nothing

**The polarity is the whole point and it is easy to invert.** All three branches go to `$243DEE`, the shared
body; the FALL-THROUGH is the `rts`. So the routine **does nothing when `$81B410` is set AND `$81B412` is within
`[$20,$3C]`**, and otherwise runs the body. `bcs` is UNSIGNED below and `bhi` UNSIGNED above, so it is an
unsigned window test, not a signed range.

**`$81B410` and `$81B412` are `armWord` and `modeWord`** -- named in `bomb.js:235` as exactly that, and
`bomb.js:185` records `cancel: 0x243da0` with `$81B412 := $FFFF`. So `$FFFF` (as unsigned `$FFFF`) is ABOVE
`$3C`, meaning **a cancelled bomb takes the `bhi` exit and the body RUNS.** That is a real behavioural
consequence of reading the comparison as unsigned.

**AND THE PORT ALREADY HAS THE WHOLE THING, PARAMETERISED.** `midboss.js:197` is
`armScreenClearMode(ram, ctx, d1, from, mode, entry)`, and lines 199-203 are this exact guard with this exact
polarity:

    if (ram.u16(ARM) !== 0                 // $243E02/$243E7C tst.w
        && ram.u16(MODE) >= 0x20           // cmpi/bcs
        && ram.u16(MODE) <= 0x3c) {        // cmpi/bhi
      return false;                        // $243E1E/$243E98 rts
    }
    ram.setU16(ARM, 1);                    // $243E20/$243E9A
    ram.setU16(MODE, mode);                // $243E28/$243EA2

`armScreenClear` is `armScreenClearMode(..., mode = 0, entry = 0x243e7c)`. And `$243DEE` -- the body `$243DD0`
falls into -- is `move.w #$1,$81B410 / move.w #$FFFF,$81B412`, i.e. **`mode = $FFFF`**.

**So `$243DD0` is ONE LINE:**

    export function screenClear243DD0(ram, ctx, d1, from) {
      return armScreenClearMode(ram, ctx, d1, from, 0xffff, 0x243dd0);
    }

**FIFTH "already ported family member" of the session, and this time the port had already parameterised the
variation point.** Whoever wrote `armScreenClearMode` anticipated exactly this: the `mode` and `entry` arguments
exist precisely so a sibling entry costs one line.

**DO NOT LAND IT YET.** Its only caller is Hibachi, whose handler is unwritten, so adding it now creates dead
code -- the `tallyPhase0Arm25DC2C` mistake, which passed five green check runs while being unreachable. **It
lands in the same commit as the code that calls it.**

So `$B0`'s real remaining cost is `$242922` and `$253564` plus `$2A6B94`'s body. `$243DD0` is solved and costs a
line.

### And BOTH of the other two have ported cores. `$B0` needs almost nothing new.

Applying the same prose check (which is what found all five family members), `boss.js`'s note table already
describes them:

    $253564   "the $811F8C clamp"                       and bulletdriver.js:127 adds that it
                                                        "begins a different routine (cmpi.w #$14,$811F8C)"
    $242922   "$28C170 + the two $FF intervention bytes"

**`$242922` read in full is three instructions of setup around a PORTED call:**

    242922  jsr $28C170              ALREADY PORTED (3 code mentions)
    242928  move.w #$1,$81296E       a flag
    242930  tst.w $8103E6            player 1's record -- the liveness test the note's "$FF intervention
                                     bytes" hang off

**`$253564` is a clamp on `$811F8C` opening `cmpi.w #$14,$811F8C`** -- and `bulletdriver.js:127` already
warns not to read past its entry, so someone has been here.

**So the final boss needs: `$243DD0` (one line), `$242922` (a wrapper round a ported call), `$253564` (a clamp),
and `$2A6B94`'s 666-byte body whose twelve callees are all ported.** That is the whole of `$B0`.

### DO NOT register `$B0` with a note-only handler. It would SOFT-LOCK the run.

`handler2A4606` is 170 bytes and tempting to write early -- registering it would drop stage 5 from three missing
types to two. **Resist that.** Its two real callees are:

    $25962E   runScheduler25962E        PORTED (12 code mentions) -- the clear test
    $242952   runStageAdvance242952     ALSO PORTED -- in stageend.js, imported by boss.js and boss2.js

**RETRACTED, ONE COMMIT LATER: `$242952` IS PORTED.** I claimed it was not, because `stageend.js:109` holds it in
a note TABLE ('THE ADVANCE. `$2429BE addq.w #$1,D7` -- five callers...') and I read a note-table entry as a
deferral. **It is a DESCRIPTION.** The routine ships as `runStageAdvance242952`, imported by `boss.js:75` and
`boss2.js:11` and called at `boss.js:1144` (`$292922 jsr $242952`) and `boss2.js:261`.

**That is the SIXTH "already ported under a name" of this session**, and the first where I got it wrong in the
pessimistic direction -- the previous five were addresses I would have duplicated. **A note-TABLE entry is not a
`note()` call**, and `claimed.py` cannot tell them apart because both are strings containing an address. The
`likely owner(s)` line is what gave it away: it listed `runStageAdvance242952` for `$28CB60`, a routine `$242952`
calls.

**AND THE CHECK IS DONE: `runStageAdvance242952` IS A FULL TRANSLATION, zero internal `note()`/`unreached()`
calls.** Verified by counting them in its body -- the result is 0. It is:

    ctx.soundPost?.(0x28cb60)                                    the $28CB60 call
    bossFlags |= $08                                             $242958 bset #3
    bossFlags &= ~$10                                            $242960 bclr #4
    clearing := 1                                                $242968
    d7 = stage + 1                                               $2429B8/$2429BE
    stageCreate(SE.type6, ...)                                   the type-6 object
    r.addr + $04 := d7                                           $242A3A move.w D7,$4(A0)
    return { d7, result }

**So `handler2A4606` IS writable now, and its only `note()` would be `$2A6B94`.** The stage advance would work,
because this routine works. **The soft-lock argument is fully withdrawn.**

**Having been wrong in BOTH directions on this question inside two commits** -- first "not ported" from a
note-table entry, then "may well be writable" before checking -- the standing rule for this kind of dependency is:
**count the `note()`/`unreached()` calls INSIDE the candidate function.** It is one command, it answers "is this a
real port or a shell", and neither `claimed.py` nor the prose can tell you.

**Remaining decision for whoever writes it:** a `handler2A4606` whose boss body is a `note()` gives a Hibachi that
appears, runs the scheduler, advances the stage when the clear test fires, and otherwise does nothing -- no attacks,
no parts. **That is a defensible checkpoint** (the type is registered, the stage completes, nothing throws) and it
matches what `$43` and `$49` already do. **It is also the last handler in stage 5**, so landing it would take the
stage to two missing types over 5 records.

### `handler2A4606` IS WRITTEN. It is below, ready to place. Three edits, not one.

**PLACEMENT: it goes in `src/boss.js`, not `handlers.js`.** `handlers.js` imports nothing from `stageend.js` and so
has neither `runScheduler25962E` nor `runStageAdvance242952`, while `boss.js` imports both (lines 71 and 75) and
already contains the byte-identical sequence at `boss.js:1141`. **The precedent for a boss handler living outside
`handlers.js` is `$0D`, the midboss, which is in `src/midboss.js`** and registered from `handlers.js` by import.

**The three edits:**

1. Paste the function into `src/boss.js` and export it.
2. In `handlers.js`, import it and add `[0x2a4606, handler2A4606]` to `HANDLERS`.
3. Delete `TB0`'s `ported: false`, then bump the census pins the W360 pin's failure message lists --
   `integration.test.js` `m.size`, `handlers.test.js`'s address list, `w167coverage.test.js`'s `enemy_types`
   (**both** numbers, from `dojcoverage.py`), and `w346typetable.test.js`'s unwritten set to `[0x1a, 0x4c]`.
   The init-body count does NOT move: `$B0`'s init body `$2A42DC` is a separate piece and stays unwritten, so
   **leave `TB0.ported` alone if you register the handler without the init body** -- check which the pin means.

```js
// $2A4606 -- HIBACHI's handler, all 170 bytes of it. See TB0 for the structure and its four
// independent confirmations.
//
// It does exactly TWO things: run the boss body, and take the stage-clear path when the scheduler
// says the boss is finished. The other TWELVE calls in it are no-ops against bare `rts` stubs, and
// they are transcribed as comments rather than as calls -- eleven `$26331C` per-part hooks and one
// `$25A17A`, which is one of four adjacent `rts` bytes at `$25A17A..$25A182`.
//
// THE CARRY POLARITY IS NOT INFERRED. `boss.js:1141` is the same sequence and settles it:
//   const c = runScheduler25962E(...);  if (!c) return;  runStageAdvance242952(...);  freeEnemy(...)
// There `!c` returns because nothing follows. Here `$2A4612 bcc $2A4622` skips FORWARD to the part
// hooks, so `!c` falls through to them instead of returning. Same convention, different continuation.
//
// `runStageAdvance242952` was verified to be a FULL translation (zero note()/unreached() inside) before
// this was written, because a note-only stage advance would soft-lock the run at stage 5's end with a
// green suite and no error.
function handler2A4606(ram, rom, a5, ctx) {
  // $2A4606 -- the whole boss. $2A6B94's first block is 666 bytes ending at $2A6E2E; it opens
  // `tst.w ($106,A6) / beq` over a single `rts`, so it does nothing unless ($106,A6) is zero, and its
  // twelve callees are all ported bar $243DD0 (one line against armScreenClearMode), $242922 (a
  // wrapper round the ported $28C170) and $253564 (the $811F8C clamp).
  ctx.unported?.note(0x2a6b94, '$2A4606 jsr $2A6B94 -- HIBACHI\'s entire behaviour. The handler around '
    + 'it is complete: the clear test, the stage advance and the free all run, so the boss appears and '
    + 'the stage still completes, but it does not attack or move. 666 bytes at $2A6B94..$2A6E2E, guarded '
    + 'on ($106,A6) == 0, with a second gate on ($10E,A6) branching to $2A6F10');

  // $2A460C -- the clear test. Carry SET means the boss is done.
  const c = runScheduler25962E(ram, rom, ctx);            // $2A460C jsr $25962E
  if (c) {                                                // $2A4612 bcc $2A4622 -- inverted here
    runStageAdvance242952(ram, rom, ctx);                 // $2A4614 jsr $242952
    freeEnemy(ram, a5);                                   // $2A461A jmp $263762
    return;
  }

  // $2A4622..$2A46AA -- ELEVEN per-part `lea (part,A6),A0 / jsr $26331C` calls and one `$25A17A`,
  // every one of them reaching a bare `rts`. TB0.partOffsets holds the eleven in ROM ORDER, which is
  // NOT ascending: $1A0 is called seventh, between $C0 and $140, and $E0/$100/$120 are never called.
  // The list is transcribed as data on TB0 so that a future reader can see the order the cartridge
  // uses; nothing is called here because there is nothing to call.
  //
  //   2a4622  lea (A6),A0      / jsr $26331C      part $0
  //   2a462a  lea ($20,A6),A0  / jsr $26331C      part $20
  //   ...                                          $40 $60 $80 $A0 $C0
  //   2a4666  lea ($1A0,A6),A0 / jsr $26331C      part $1A0  <- OUT OF ORDER
  //   2a4670  lea ($140,A6),A0 / jsr $26331C      part $140
  //   ...                                          $160 $180
  //   2a469a  moveq #$0,D3 / move.w D0,D3 / move.w #$0,D0 / move.w #$0,D1 / move.w #$2,D2
  //   2a46aa  jsr $25A17A                          also a bare rts; the register setup above is DEAD
  //   2a46b0  rts
}
```

**The carry polarity is now CONFIRMED FROM THE ROM, not copied.** Both branch targets computed from the bytes:

    $2A4612   64 0e         bcc.s  +$0E  ->  $2A4622   the part hooks
    $29291E   64 00 00 10   bcc.w  +$10  ->  $292930   past boss.js:1145's end, i.e. return

**Both mean the same thing: carry CLEAR = do NOT advance.** So `if (c) { runStageAdvance242952(...); freeEnemy(...) }`
is correct, and `boss.js`'s `if (!c) return;` is the identical test phrased as an early return. **The "inversion" is
only in the JS phrasing; the convention is one convention.**

**AND A BRANCH-ENCODING TRAP I FELL INTO WHILE CHECKING THIS.** I first computed `$2A4612`'s target as `$2A94CD` by
reading the two bytes AFTER the opcode as a word displacement. That is the `.w` form. **`64 0e` is `bcc.s`, with the
displacement in the OPCODE'S OWN LOW BYTE**; the `.w` form has `00` there and takes the following word, which is
exactly what `$29291E`'s `64 00 00 10` is. **So `64 xx` (xx != 00) is short and self-contained, `64 00` is word and
takes two more bytes.** Getting this wrong invents a branch target thousands of bytes away, and it will not look
obviously wrong -- `$2A94CD` is a plausible-looking address.

**So `$B0` stays unregistered until `$242952` and `$2A6B94` both exist.** And `$242952` is worth doing on its own
merits: it is the stage advance, five callers, and it sits directly under D11 (the abrupt stage transition) and
D37 (the endings). **It is probably the highest-leverage single routine left in the project.**

**The prose check has now paid off five times out of five in this session.** `claimed.py` on an address answers
"did I port THIS"; the port's own note tables and file-header prose answer "is this new work", and they are where
every single family relationship was recorded. **Read the prose first. It is the cheaper question and usually the
one that matters.**

**That is the FOURTH time this session that "unported" resolved to "member of a family the port already has"**
after `$242B90`/`$242B3C`, `$26331C`'s stub siblings, and `$263684`/`enqueueDeferred`. **The pattern is strong
enough to be the default assumption**: before writing anything, grep the port's PROSE for the address's
neighbours, not just the address.

**A `--near` mode for `claimed.py` was attempted this wave and REVERTED unfinished.** The idea was sound -- scan
`src/` for every address within `+/-$200` and report which are already in CODE, so the family shows up
automatically instead of being found by luck. **It did not work and I could not diagnose it in the time
available:** the regex matches `0x243da0` correctly in isolation, the target parses correctly, `bomb.js:185` sits
inside the window, and the function still returned zero neighbours.

**It was reverted rather than shipped**, because a neighbour search that silently reports "none" is worse than no
neighbour search: it would license exactly the "genuinely new territory" conclusion this session has been wrong
about four times. `spanned.py` taught the same lesson -- **a broken check that answers confidently is worse than
an absent one.** `claimed.py` keeps this wave's three WORKING fixes; only the unfinished feature is gone.

**So the neighbour check stays MANUAL, and it is worth doing every time: grep the port's prose for the routine's
ROLE** (`screen-clear`, `arm`, `enqueue`, `stub`) rather than its address. All four family finds this session came
from prose, not from address matching.

**And `$23C4D0` is ported for one caller and deferred for another** -- `initbody.js` uses it, `boss.js` defers it.
That is why `claimed.py` reports counts rather than a verdict now: a boolean would have to lie about this address
in one direction or the other.

### `claimed.py` was WRONG THREE WAYS on these twelve addresses, and all three were in its SUMMARY

The measurement (address-literal occurrences per file, classified by position) was right throughout. Every wrong
answer came from a confident label on top of it:

1. **CLAIMED flattened solid and thin ports.** `$263684` read CLAIMED on ONE code mention. Fixed with a THIN
   warning, which then immediately caught four of Hibachi's callees -- and was right about them.
2. **`note(ctx, 0xADDR)` classified as CODE.** The classifier had a rule for it that did not fire on the real
   file. Fixed by testing the address's SYNTACTIC POSITION (is it an argument to `note()`/`unreached()`?) before
   anything else. This is what exposed the deferrals.
3. **"NOT PORTED" overstated what the tool can see.** After fix 2, `$263684` flipped to NOT PORTED -- but it IS
   ported, as `enqueueDeferred`, and `handler46` calls it in shipped code. The tool sees no literal because the
   port uses a NAME. Now worded "NO CODE LITERAL", split by whether PROSE comments or `note()` deferrals dominate.
   A first attempt split on mention count instead and `$243DD0` disproved it within one command.

**The rule for anyone using this tool: it measures address literals, not implementations.** A high prose-comment
count with no literal usually means a named port; a high `note()` count means a real deferral. **Neither verdict is
a substitute for reading the six bytes.**

**AND `claimed.py` HAS A BUG HERE, WHICH IS WHY THE HEADLINE SAID CLAIMED.** It labels those three lines `[CODE]`
even though its classifier has a rule for exactly this case (`re.search(r'(note|unreached)\s*\(', line)` ->
`NOTE`), and that regex tested TRUE against the line text in isolation. So the rule exists, matches in a unit
test, and does not fire on the real file. **Diagnose that before trusting any CLAIMED verdict on an address whose
only code mentions sit in `boss.js`** -- the same false-positive class the `$23C98E` fix was meant to close, still
open by another route.

**The wider lesson: `note(ctx, 0xADDR)` is executable JavaScript AND a declaration of non-portedness.** Any tool
that classifies by "is this a comment or is this code" gets it wrong, because it is both. The reliable test is
whether the address appears as an ARGUMENT to `note()`/`unreached()`, not where it sits on the line.

**FOUR are THIN and must be verified before use, per the `$263684` lesson** (claimed with 1 code mention, which
turned out fine, and the `$242B90` lesson, where "unported" was a register-variant twin):

    $242922   1 code / 3 notes      $253564   1 code / 3 notes
    $23C4D0   2 code / 3 notes      $243DD0   2 code / 4 notes

**A high notes-to-code ratio means the port has WRITTEN ABOUT the address more than it has implemented it** --
exactly the shape of a `note()` standing in for a routine. **Check each of those four is a real implementation and
not a deferral before relying on it**, because `claimed.py` counts a `note()` mention as a hit and reports
CLAIMED.

**The lesson, and it is now three for three: in this build, an UNCLAIMED small routine is likelier to be a stub
than to be work.** `$26331C`, `$25A17A`, and the four-`rts` run all read as "unported" to `claimed.py` while
containing nothing. **Disassemble before estimating** -- six bytes of `4e75` cost nothing to check and would
otherwise have been recorded as a subsystem to port.

**This retires the "HIBACHI CLOSURE RULE and a trace" note.** These notes have long said `$B0` "wants the HIBACHI
CLOSURE RULE and a trace". The handler needs neither: it is 170 bytes, fully read, and its only unknowns are two
ordinary callees at fixed addresses. **The third "the blocker did not exist" of this kind this session**, after
`$55`'s A0 and `$1A`'s D2/D3.

**And its position in the game matters more than its size**: because `$2A4614 jsr $242952` is the stage-clear
call, this handler is the junction the endings (D37) run through. **`$25A17A` -- the epilogue call, taking a
constant `D2=2` -- is the most likely place the ending SELECTION happens.** Read it first for D37, not just for
`$B0`.

## TYPE $4C (W354, OPENED) -- the "eight state handlers" claim is WRONG

These notes have long said `$4C` has "eight state handlers (~2300 bytes)" with `$26F858`/`$26F86A`,
`$26F994`/`$26F9A2`, `$26FA5E`/`$26FA82`, `$26FF9E`, `$26FFE8` unported. **Rule 8 (count before reading) settles
the structure in four scans, and the claim does not survive it.**

`claimed.py` on all eight: UNCLAIMED. **But they are all INSIDE `$4C`'s own span** (`$26F4E2` onward), so they are
internal arms, not external callees -- there is nothing separate to port. Listing them as unported callees
overstated the work by eight routines.

**What `$4C` is NOT:**

* **No `cmpi.b` cascade on the record.** Scanning `$26F5F2..$270100` for `cmpi.b #imm,(d16,A5)` (`0c2d`) finds
  **ZERO** sites -- where every other band member dispatches exactly that way on `($17,A5)`.
* **No jump table.** The only indirect call in the span is a single `jsr (A0)` at `$26F87C`. No
  `jmp/jsr (A0,Dn)` anywhere.
* **No self-rewriting dispatch.** `move.l #imm,($4C,A5)` (rewriting the record's cached handler pointer, the
  mechanism W348 found the driver calling through) appears **zero** times.

**AND I OVER-CORRECTED. RETRACTING, SAME WAVE.** I concluded from those three `cmpi.b #imm,($86,A6)` sites that
`$4C` is a three-state machine on a sub-record byte. **It is not: those sites are in a DIFFERENT ROUTINE.**

Bounding the span properly (rule 11) settles it. There are **19 `rts` sites** in `$26F5F2..$270120`, and the LAST
is `$26FFE6`:

    26f718 26f78e 26f868 26f90c 26f982 26f992 26f9a0 26fa54 ... 26ff54 26ff9c 26ffe0 26ffe6

**So `$4C`'s code region is `$26F5F2..$26FFE8` -- about `$9F6`, ~2550 bytes** -- and `$26FFE8`, which the old note
listed as an "unported callee", is simply **the address where the NEXT routine begins**. Same for `$26FF9E`
(`$26FF9C` is an `rts`). Those two were boundaries, not work.

**`$270000` onward is past the end**, so the `($86,A6)` state machine belongs to whatever routine starts at
`$26FFE8` -- not to `$4C`. My scan range `$26F4E2..$270400` reached into a neighbour and I read its dispatch as
`$4C`'s.

**What survives from the previous entry**: the eight listed addresses are internal to `$4C` and are not separate
ports; there is no `cmpi.b` cascade on the record; there is no jump table; there is no self-rewriting dispatch.
**What does not**: the three-state claim, and the "much smaller than 2300 bytes" claim -- the old ~2300 figure was
close, and 19 `rts` sites across that span is consistent with the original "eight state handlers" reading being
roughly right.

**The lesson, and it is rule 11 again: bound the routine BEFORE scanning inside it.** I scanned a fixed
`$26F4E2..$270400` window chosen by guesswork, and its bytes past `$26FFE8` produced a confident wrong structural
conclusion within one commit. The `rts` scan that fixed it cost one command and should have come first.

### `$4C`'s comparison inventory, from the CORRECT span `$26F5F2..$26FFE8`

    cmpi.b (d16,A5)   0      <- ZERO. No byte cascade on the record, unlike every sibling.
    tst.b  (d16,A5)   3      $26F622 and $26F67E on ($16,A5); $26F790 on ($17,A5)
    tst.w  (d16,A5)   4
    cmpi.w (d16,A5)   3      ALL THREE are cmpi.w #$0600,($1E,A5) -- $26FC32 $26FDFE $26FE0E
    cmpi.b (d16,A6)   4
    tst.b  (d16,A6)   3

**`($17,A5)` IS A BOOLEAN IN `$4C`.** It is touched exactly once, by `tst.b` at `$26F790` -- zero or non-zero.
`$55` gives that same byte four values in a fall-through cascade and `$46` gives it five modes. **Sixth
same-offset-different-meaning instance**, and the sharpest yet: same field, same family, and even the same KIND of
role (a mode selector), but with a different arity that changes the whole control shape.

**`($16,A5)` is the once-on-screen latch**, tested twice -- the same idiom as `$46`, `$4B` and `$1A`, at the same
offset. So `$16` is the one field this band agrees on.

**All three word comparisons are the SAME test**: `cmpi.w #$0600,($1E,A5)` at `$26FC32`, `$26FDFE` and `$26FE0E`.
`$0600` is also `$55`'s ramp cap (`T55.rampCap`), and `($1E,A5)` is a cursor in `$55` too -- so this looks like the
same ramp-with-cap mechanism, checked from three places rather than one. **Three call sites for one test means the
ramp gates three different arms**, which is the structure to map next.

### `($17,A5)` IN `$4C` PICKS AN EMIT STUB. It is not a state at all.

    26f790  tst.b ($17,A5)
    26f794  bne $26F7A0
    26f798  jmp $23DECE        zero     -> FRAME_EMIT
    26f7a0  jmp $23DF58        non-zero -> mirrorStub

**Both are tail-JUMPS, and both stubs are already ported** -- `$23DECE` is `FRAME_EMIT` (owned by `T43 T45 T47 T48
T49 T4A T4B`) and `$23DF58` has 31 mentions with 21 in code, appearing as `mirrorStub`/`drawChild` in
`background.js`. So the byte selects between a normal and a MIRRORED draw.

**That is the seventh same-offset-different-meaning instance and by far the most different.** In `$55` the byte is
a four-value fall-through mode cascade; in `$46` it is a five-mode selector; in `$4C` **it is not a control-flow
state at any arity -- it is a RENDERING variant**, consumed once, at the very end, by a tail-jump. Anything
carried from a sibling here would not be off by a value or an offset; it would be the wrong kind of field
entirely.

**This also means `$4C` has no state machine on the record at all.** Zero `cmpi.b` on A5, and the one `tst.b` on
`($17,A5)` is a draw selector. Whatever multi-arm structure the old "eight state handlers" note was describing must
live in the `cmpi.b`/`tst.b` tests on **A6** (4 and 3 sites), i.e. in the SUB-record -- which is where `$1A` also
keeps its animation cursor and timers.

### The seven sub-record tests, mapped

    26f5fc  tst.b  ($9E,A6)          the handler's SECOND instruction region -- an early gate
    26f62a  tst.b  ($9F,A6)
    26f6e8  tst.b  ($9F,A6)
    26fdf4  cmpi.b #$01,($2A,A6)     a TWO-value test near the end
    26fe30  cmpi.b #$02,($2A,A6)
    26ff6c  cmpi.b #$08,($1A,A6)     the SAME test twice, 14 bytes apart
    26ff7a  cmpi.b #$08,($1A,A6)

**Three distinct sub-record fields, and none of them is a state machine of eight arms.** `($9E,A6)` and
`($9F,A6)` are boolean gates near the handler's head; `($2A,A6)` is tested against `$1` and `$2` (so it takes at
least three values with the default) 1000+ bytes later; `($1A,A6)` is tested against `$8` twice in the last 100
bytes.

**`($9E,A6)`/`($9F,A6)` are at offsets far larger than any field in `$55`, `$46` or `$1A`** -- those types use
`$00..$3B` in the record and `$00..$36` in the sub-record. A sub-record reaching `$9F` means **`$4C`'s sub-record
is much bigger than its siblings'**, which is consistent with it being a multi-part object (its init loads FIVE sub
prototypes, per W342's window note `$26F55A + $AC`).

**CONFIRMED, from the init itself:**

    26f4da  move.w #$4,($4,A5)     the run length -- so FIVE SUB-RECORDS
    26f4e0  rts
    26f4e2  lea $26F566,A0         the init body's first sub prototype

**`($4,A5) = 4` means five sub-records** (the convention is run length + 1, and `$1A`'s `#$1` gave it two).
So `$4C` IS a five-part object, matching W342's five sub prototypes and its `$26F55A + $AC` window, and the
"eight state handlers" note was describing **per-part arms, not eight states of one record**. That explains all
three anomalies at once: the 2550-byte span, the total absence of record-level dispatch, and a sub-record field
at `$9F` when no sibling exceeds `$36`.

**Every member of this band for comparison:** `$55` one sub-record, `$46` one, `$1A` two, `$4C` **five**. It is
the only multi-part object among them, which is why none of its structure looked familiar.

### AND THE FIVE PARTS ARE ADDRESSED BY OFFSET, NOT ITERATED. `$4C` IS UNROLLED.

There is **exactly ONE `dbra`** in `$26F5F2..$26FFE8` -- at `$26FB3A`, `D7`, with a **28-byte** body. Far too
small to be a per-part arm loop over 2550 bytes of code. So `$4C` does not iterate its parts.

**It addresses them by offset through one A6 base, at the `$20` stride `loadSubProto` uses.** That resolves the
sub-record offsets that looked impossibly large:

    part 1  ($00..$1F,A6)      ($1A,A6) tested against $8, twice, at $26FF6C/$26FF7A
    part 2  ($20..$3F,A6)      ($2A,A6) tested against $1 and $2 -- part 2's own $0A
    part 3  ($40..$5F,A6)
    part 4  ($60..$7F,A6)
    part 5  ($80..$9F,A6)      ($9E,A6)/($9F,A6) -- part 5's $1E and $1F

**`5 * $20 = $A0`, and the largest offset seen is `$9F`: exactly the last byte of the fifth part.** That is the
confirmation. No sibling exceeds `$36` because no sibling has more than two parts.

**So `$4C` is 2550 bytes of UNROLLED per-part code** -- which explains every anomaly the four earlier scans turned
up, and means the old "eight state handlers" note was counting arms across parts. **There is no dispatch to find,
because there is no dispatch**: the parts are handled in straight-line sequence, each at its own `$20` offset.

**That makes `$4C` mechanically simple but long**, and it changes how to write it: **not a state machine, and not a
loop -- a sequence of five per-part blocks, each reading `(part * $20 + field, A6)`.** The one `dbra` at `$26FB3A`
is a local 28-byte loop inside one of those blocks, not the part iteration.

### AND W342's WINDOW LENGTH DECOMPOSES EXACTLY. Independent confirmation.

    26f4e2  lea $26F566,A0 / jsr $2637A2      the sub prototype
    26f4ee  lea $26F55A,A0
    26f4f4  move.w #$5,D0                     D0+1 = SIX words for loadRecordProto

    record prototype   $26F55A + $C     six words          -> ends $26F566
    five sub protos    $26F566 + $A0    5 x $20            -> ends $26F606
    TOTAL              $26F55A .. $26F606                  = $AC

**W342 declared that window as `$26F55A + $AC` -- exactly `$C + $A0`.** So the window a previous wave sized from
the prototype loads alone independently confirms the five-part reading, and the five-part reading independently
confirms the window. **Two arguments, arrived at from opposite directions, agreeing to the byte.**

That is the third window this session verified two independent ways (`$272750` by adjacency and by cursor range,
`$269246` by adjacency and by cursor range, now `$26F55A` by declaration and by decomposition). **When a window's
length decomposes cleanly into a structure you can name, that is worth more than either fact alone** -- and it is
cheap to check on any window already declared.

Note `$4C`'s record prototype is only SIX words where `$55` has fifteen and `$1A` has fifteen: the five-part object
keeps almost all its state in the sub-records, not the record. Consistent with the record having no state machine.

### `$4C`'s handler head: part 5's flag releases a MUTUAL-EXCLUSION claim

    26f5f2  tst.w $8130D2 / bne $26F704       the pause -> straight to the tail
    26f5fc  tst.b ($9E,A6) / beq $26F622      part 5's $1E -- the flag whose value comes from the
                                              handler's OWN OPCODES via the prototype overlap
    26f604  move.w #$0,$8130DE                <- clears a MUTUAL-EXCLUSION flag
    26f60c  move.w #$20,D0 / move.w #$20,D1
    26f614  jsr $261100                       pushExternalSpeed -- ported (3 code mentions)

**`$8130DE` IS INSIDE THE SIX-WORD MUTUAL-EXCLUSION BLOCK `$8130DC..$8130E6`**, and these notes already record that
`$269C6C` FREES ANY RECORD that sees any flag in that block set. So `$4C` clearing `$8130DE` is **releasing a claim
other records are waiting on** -- not a private flag. `$49` writes into the same block (`$27160C`/`$271610` store
the ADDRESS of `$8130E0`/`$8130E4` and set it), which is how the band coordinates.

**That makes this arm cross-type behaviour, and the order matters.** A port that cleared `$8130DE` at the wrong time
would let another record proceed early, or strand one waiting. **`$261100` (`pushExternalSpeed`) with `D0 = D1 = $20`
follows immediately**, so the release and the push are one action.

**And it closes the `($9E,A6)` loop that has been open since W354:** the flag is part 5's `$1E`, whose initial value
comes from the handler's own opcodes through the twenty-byte prototype overlap. So **whether `$4C` releases the
mutual-exclusion claim on its first frame is decided by an opcode byte**, which is why that value cannot be invented
and why the overlap has to be copied rather than reasoned about.

**AND THAT ARM ENDS BY FREEING THE RECORD:** `$26F61A jmp $263762`. So part 5's `$1E` being set is a RETIREMENT
path -- release the mutual-exclusion claim, push external speed, die. Not an ordinary per-frame arm.

### `$4C`'s damage arm: the palette XOR is an IMMEDIATE, and the hit mask goes to part 5

    26f650  moveq #$5C,D1 / and.b (A6),D1     the family mask
    26f654  beq $26F6DE                        not hit -> skip
    26f658  move.b #$A3,D0 / and.b D0,(A6)     the family clear byte
    26f65e  move.w D1,($8E,A6)                 <- the HIT MASK stored into PART 5's $0E
    26f662  jsr $286096                        scoreHit
    26f668  move.b ($1d,A6),D0
    26f66c  eori.b #$D,D0                      <- an IMMEDIATE $D, not ($19,A5)
    26f670  move.b D0,($1d,A6)
    26f674  move.l #$7FFF,D0

**THE PALETTE XOR IS A LITERAL `$D` HERE.** `$49`, `$4B`, `$55` and `$1A` all read it from `($19,A5)` -- these notes
call `($18,A5)`/`($19,A5)` "the family's palette pair". **`$4C` has no such field: the mask is baked into the
instruction.** A port reusing the family's `palXor` would read a byte `$4C` never writes, which for a five-part
object is whatever the prototype overlap happened to leave there. **Ninth same-thing-different-way instance in this
band.**

**And the hit mask is written to `($8E,A6)` -- part 5's `$0E`.** So damage taken by the record is recorded into a
PART, not into the record. Given part 5 is also the one whose `$1E`/`$1F` gate the mutual-exclusion release and the
one-shot latch, **part 5 is `$4C`'s control block** rather than a fifth body segment. That is worth stating plainly:
the five parts are not five equivalent things.

So the family agrees on `$5C` and `$A3` and `scoreHit`, and disagrees on: whether there is an `hpFull` reload,
whether the XOR input is inspected (`$1A`'s `$19` sentinel), where the XOR mask comes from (**field vs immediate**),
and where the hit mask goes. **Five members, five different damage arms.**

### `$4C` HAS A SHARED 32-BIT HP POOL, and the one-shot latch is its INVULNERABILITY gate

    26f674  move.l #$7FFF,D0
    26f67a  sub.w ($18,A6),D0        D0 = $7FFF - the part's current HP = THE DAMAGE JUST TAKEN
    26f67e  tst.b ($16,A5) / bne     <- if the one-shot is ARMED, SKIP the subtraction
    26f686  sub.l D0,($1a,A5)        else subtract that damage from a LONG pool in the RECORD
    26f68a  move.w #$7FFF,($18,A6)   and reset the part's HP -- every hit, unconditionally
    26f690  tst.l ($1a,A5) / bpl     pool still positive -> live
    26f698  move.l #$700,D0 / jsr $28615E    killScore $700 -- the largest in the band

**`($18,A6)` IS NOT `$4C`'s HP. It is a per-hit DAMAGE ACCUMULATOR**, reset to `$7FFF` after every hit, and the real
health is a **32-bit pool at `($1A,A5)`** in the record. `$49`, `$4B`, `$55` and `$1A` all test `($18,A6)`'s SIGN for
death; `$4C` tests `tst.l ($1A,A5)`. **A port that copied the family's death test would read a field `$4C` resets on
every frame it is hit, and the object would never die.**

**AND THIS IS WHAT THE ONE-SHOT LATCH IS FOR.** `($16,A5)` gates the subtraction, so **while the latch is UNSET the
damage is discarded**: `$4C` is INVULNERABLE until the latch arms, and the latch arms only when the spawn clock
reaches `$1F0` -- the moment type `$10` spawns. **So `$4C` spawns at `$1B8` invulnerable, and becomes killable 56
clock units later, cued by another type's arrival.**

That is a complete, coherent mechanism and it ties together every oddity of this type: the long-lived single record,
the cross-type clock cue, part 5 as a control block, the hit mask stored into part 5, and the shared pool. **`$4C` is
a multi-part destructible set-piece with a scripted vulnerability window.**

### The eight "unported callees" are now PROVEN internal -- they are `bsr` targets

    26f6ce  bsr $26F858             <- one of the eight
    26f6d2  lea $2701C8,A0 / jsr $246520     buildParts246520 -- and W341 already scoped this
    26f6de  move.b #$12,($1d,A6)    the not-hit palette (the $26F654 skip target)
    26f6e4  bsr $26FFE8             <- a second
    26f6e8  tst.b ($9F,A6) / bne $26F704
    26f6f0  bsr $26F86A             <- a third

**`bsr`, not `jsr`** -- so `$26F858`, `$26F86A` and `$26FFE8` are `$4C`'s own subroutines, which settles W354's
reading from the instruction rather than from an address range. **`$26FFE8` is genuinely a separate routine that
`$4C` calls**, sitting immediately past the main body's last `rts` at `$26FFE6`: both readings were right, and they
are not in conflict.

**AND `$246520` WAS ALREADY SCOPED BY W341**, including its window:

    export-tables.py:2762   (0x2701C8, 0x000E, "W341: type $4C's $246520 caller table -- a count word (1)
                             then one 12-byte node, $2701C8..$2701D5, ending where code begins")

`$246520` is `buildParts246520`, ported. **And the count word is ONE, not five** -- so this call builds a SINGLE
12-byte node, and it is NOT what creates the five parts. Those come from `loadSubProto`'s `5 * $20` in the init.
**I had been assuming `$246520` was the part builder for this type; it is not.** Eighth "already there" of the
session, and the second time W341's own notes anticipated a question I was about to re-derive.

So `$4C`'s remaining unread code is three `bsr` subroutines (`$26F858`, `$26F86A`, `$26FFE8`) plus the tail at
`$26F704`.

**AND MY PREDICTION THAT THE PER-PART BLOCKS MIGHT NOT EXIST WAS WRONG.** Counting `(d16,A6)` references across
`$26F5F2..$270000` by which `$20` block the offset falls in:

    part 1  ($00..$1F)   57 refs     <- dominant: this is the main body
    part 2  ($20..$3F)   24 refs
    part 3  ($40..$5F)   10 refs
    part 4  ($60..$7F)   11 refs
    part 5  ($80..$9F)    7 refs     <- the CONTROL BLOCK, as established
    beyond  ($100+)       2 refs     <- see the caveat

**All five parts ARE individually addressed**, just very unevenly -- part 1 carries eight times part 5's traffic. So
the unrolled per-part structure is real; I had only read the arms that touch part 5, which made it look absent.

**Two caveats on those numbers, because the scan is crude:** it matches any byte pair whose low bits look like
`(d16,A6)` addressing, so like `branches.py` it produces false positives inside multi-word operands. The counts are
INDICATIVE, not exact, and the `$100+` entries in particular may be operand bytes rather than real references --
`$106`/`$10E` are Hibachi's sub-record fields, not known `$4C` ones. **Do not treat this table as an inventory.**

What it is good for is the SHAPE: five parts, wildly unequal usage, and a main body concentrated in part 1. That is
enough to say the port needs five per-part field sets rather than a loop, and that part 1's is the big one.

### The tail is FOUR `bsr` calls -- and the old "eight state handlers" note was counting SUBROUTINES

    26f708  bsr $26F82A
    26f70c  bsr $26F7A8
    26f710  bsr $26F7D2
    26f714  bsr $26F71A      <- to the IMMEDIATELY FOLLOWING instruction
    26f718  rts
    26f71a  move.l #$14985C,D2        subroutine 4 starts here
    26f720  move.l ($2,A6),D1
    26f724  addi.l #$F7000000,D1      a packed-long bias
    26f72a  addi.l #$F600F900,D1      and ANOTHER -- two sequential LONG adds

**So `$4C` has at least SEVEN internal subroutines**: `$26F858`, `$26F86A`, `$26FFE8` from the main flow, plus
`$26F82A`, `$26F7A8`, `$26F7D2`, `$26F71A` from the tail. **The old note's "eight state handlers" was counting these,
and it was very nearly right.** W354 dismissed that note as "wrong in both halves"; **it was wrong about them being
STATES and about the callees being unported, but its COUNT was close.** Worth recording -- I discarded a number that
was better evidence than my reading of it.

**`$26F714 bsr $26F71A` calls the next instruction.** Legal and deliberate: the `bsr` runs the following routine and
returns to the `rts` at `$26F718`, which is a tail call spelled as `bsr`+`rts`. **A port must not "simplify" it into
a fall-through** -- the routine is also reachable independently, or the `bsr` would be pointless.

**AND THE TAIL IS FIVE `bsr` CALLS, NOT FOUR.** `$26F704` is itself `61 00 00 f6` = `bsr.w $26F7FC`, which I had
counted as part of the preceding instruction. So the order is `$26F7FC`, `$26F82A`, `$26F7A8`, `$26F7D2`, `$26F71A`.

### `$26F790` IS A SHARED DRAW TAIL, reached by FOUR `jmp (d16,PC)` jumps

Every `jmp (d16,PC)` in `$4C` -- there are exactly four -- targets the same address:

    $26F7CC  $26F7F6  $26F824  $26F852   ->  ALL FOUR jmp $26F790

Those are the ends of `$26F7A8`, `$26F7D2`, `$26F7FC` and `$26F82A`. **So four of the five tail subroutines set up
registers and then jump into the `tst.b ($17,A5)` draw selector**, which tail-jumps to `$23DECE` or `$23DF58`. The
selector is not a standalone arm -- **it is the shared exit of four draw routines.**

`$26F7FC` shows the shape:

    26f7fc  move.l #$149978,D2          this routine's art long
    26f804  move.l ($2,A6),D1 / swap D1
    26f80a  add.w ($68,A6),D1           <- PART 4's $08, added to the swapped half
    26f810  addi.l #$F47FFC00,D1
    26f816  addi.l #$F600FE00,D1        two sequential LONG adds -- these DO combine
    26f81c  move.w #$A10,D3
    26f822  move.b ($7D,A6),D4          <- PART 4's $1D, the palette byte
    26f824  jmp $26F790                 the shared selector

**So `$4C` emits FOUR sprites per frame**, each with its own art long, its own part's offset and palette, and its own
two-stage bias -- through one selector that picks the stub. That is what the five unrolled parts are FOR, and why the
type has no loop: **each draw routine hard-codes a different part's offsets.**

**And `$26F724`/`$26F72A` are TWO SEQUENTIAL `addi.l` on D1.** These notes already record that **two sequential LONG
biases DO combine**, unlike the word-add case that must not be folded and unlike `$1A`'s swap-separated pair. **So
this band now shows all three bias conventions in one place** -- fold the longs, never fold the words, never fold
across a swap. `$4C` uses the first, `$1A` the third, `$55` and `$46` the packed-long form.

### THE DEFINITIVE SUBROUTINE INVENTORY: SIXTEEN `bsr` targets, two of them shared

    $26F702   from $26F6A2
    $26F71A   from $26F714                                   the bsr-to-next-instruction
    $26F7A8   from $26F70C
    $26F7D2   from $26F710
    $26F7FC   from $26F704
    $26F82A   from $26F708
    $26F858   from EIGHT sites: $26F64C $26F6CE $26F908 $26F96C $26FCCC $26FD60 $26FDF0 $26FF38
    $26F86A   from $26F6F0
    $26F98C   from $26F97A
    $26F994   from $26F930
    $26F9A2   from $26F6FC
    $26FA56   from $26F97E
    $26FA5E   from $26F934
    $26FA82   from $26F700
    $26FF9E   from SEVEN sites: $26F946 $26FC0E $26FD38 $26FD94 $26FDC0 $26FDE6 $26FF10
    $26FFE8   from $26F6E4

**`$26F858` (8 callers) and `$26FF9E` (7 callers) are shared helpers**; the other fourteen are called exactly once.
**So the port needs two real functions and fourteen inlinable blocks** -- and knowing which is which before writing
is worth more than any of the individual readings.

### `$26F858` IS AN 18-BYTE STATE SETTER, and its guard is the whole point

    26f858  b06e 0026     cmp.w ($26,A6),D0      is D0 already the current value?
    26f85c  6700 000a     beq $26F868            YES -> do nothing at all
    26f860  3d40 0026     move.w D0,($26,A6)     NO -> store it
    26f864  426e 0028     clr.w ($28,A6)         AND reset the counter
    26f868  4e75          rts

**This is the change-detecting animation setter**: `($26,A6)` holds the current state and `($28,A6)` its frame
counter, and **the counter is reset ONLY when the state actually changes.** Called with a different D0 from each of
its eight sites.

**A port that stored D0 and cleared `($28,A6)` unconditionally would reset the counter every frame and freeze the
animation on frame zero** -- while still drawing, still advancing everything else, and looking like a sprite that
simply does not animate. **The `beq` IS the function.** Eighteen bytes, eight callers, and the only part that matters
is the part that does nothing.

`rosetta.py` misaligned on this one too (asked for `$26F858`, answered from `$26F85C`), which would have hidden the
`cmp.w` -- i.e. hidden exactly the guard. **Seventh misalignment of the session, and the first where the swallowed
instruction WAS the finding.**

### `$26FF9E` IS A DISTANCE-BAND MAPPER, and it calls `dist242494`

    26ff9e  move.w $813172,D0
    26ffa4  sub.w D0,D3
    26ffa6  jsr $242494              <- dist242494. ALREADY PORTED -- it was one of the NINE duplicates
                                        removed early in this session, so this is the ninth "already
                                        there" and the first that is a routine I personally deleted a
                                        second copy of.
    26ffac  cmpi.w #$200,D0 / bge $26FFCC     dist >= $200 -> leave ($1A,A6) ALONE
    26ffb2  move.b #$8,($1A,A6)               $100 <= dist < $200 -> $8
    26ffb8  cmpi.w #$100,D0 / bge $26FFCC
    26ffbe  move.b #$6,($1A,A6)               dist < $100 -> $6, and more bands follow

**A fall-through cascade of distance thresholds writing `($1A,A6)`**, so the SMALLEST band wins because each later
store overwrites the earlier one. **Written as `else if` it would give the LARGEST band instead** -- the same
fall-through-versus-switch hazard as `$55`'s mode cascade, in a helper called from seven places.

**And `($1A,A6)` is part 1's `$1A`, which `$26FF6C`/`$26FF7A` test against `$8`.** So the loop closes: this helper
grades proximity into a band, and the main flow branches on whether that band is `$8`. **`$4C` reacts to how close
the player is** -- which for a destructible set-piece with a scripted vulnerability window is exactly the behaviour
you would expect, and it is the last major unknown about what this type does.

**AND THIS FULLY REHABILITATES THE OLD NOTE.** Its eight "unported callees" -- `$26F858`, `$26F86A`, `$26F994`,
`$26F9A2`, `$26FA5E`, `$26FA82`, `$26FF9E`, `$26FFE8` -- are **every one a real `bsr` target in this list**, including
both shared helpers. W354 called that note "wrong in both halves". **It was wrong only in its LABEL:** they are
internal subroutine entry points, not external callees, and there are sixteen rather than eight. **The addresses
themselves were correct and useful, and I spent two waves dismissing them before counting.**

### Its death path releases TWO mutual-exclusion flags, one of which `$49` CLAIMS

    26f6a4  move.w #$8000,(A6)          the record's dying bit
    26f6a8  move.b #$1,($9F,A6)         set part 5's $1F -- the gate that BLOCKS re-arming
    26f6ae  move.w #$0,$8130DE          release flag 1
    26f6b6  move.w #$0,$8130E0          release flag 2  <- $49 STORES THIS ONE'S ADDRESS AND SETS IT
    26f6be  move.w #$20,D0 / move.w #$20,D1
    26f6c6  jsr $261100                 pushExternalSpeed -- the SAME call the retirement arm makes

**`$49`'s init stores the ADDRESS of `$8130E0` or `$8130E4` into `($20,A5)` and sets the flag** (`$27160C`/`$271610`,
recorded in `initbody.js`), clearing it on both its exits. **So `$4C` dying clears a flag `$49` may currently hold**
-- and since `$269C6C` frees any record that sees any flag in `$8130DC..$8130E6` set, this is `$4C` reaching into the
band's shared interlock on the way out.

**Three consequences worth stating before anyone writes this:**

1. **The order matters and it is cross-type.** Releasing `$8130E0` early or late changes when other records are
   freed, and `$49` is a live user of that exact word.
2. **`($9F,A6)` is set to BLOCK, not to enable.** `$26F62A tst.b ($9F,A6) / bne` skips the arming, so death setting
   it to `1` permanently prevents the vulnerability window re-opening. A port that treated `$1` as "armed" would
   invert it.
3. **The retirement arm and the death path share their cleanup**: both clear `$8130DE` and call
   `pushExternalSpeed(D0 = D1 = $20)`. So that pair is `$4C`'s "let the stage move on" action, reached two ways.
   Worth factoring in the port, but only after both paths are written -- they differ in the flags they clear.

### `($16,A5)` IS NOT THE ON-SCREEN LATCH IN `$4C`. It is a one-shot armed at a specific SCRIPT FRAME.

    26f622  tst.b ($16,A5) / bne $26F650      already armed -> skip
    26f62a  tst.b ($9F,A6) / bne $26F650      part 5's $1F must be ZERO
    26f632  cmpi.w #$1F0,$8130CE / bne        <- the SPAWN CLOCK, EXACTLY $1F0
    26f63e  move.b #$1,($16,A5)               arm it, once, forever

**In `$46`, `$4B` and `$1A`, `($16,A5)` is the once-on-screen flag** -- and these notes call `$16` "the one field
this band agrees on". **That was wrong.** Here it is a one-shot latch armed only at spawn clock `$1F0`, with part
5's `$1F` as a second gate. **Eighth same-offset-different-meaning instance, and it retires the one exception I
thought the rule had.**

**AND THE SCRIPT CHECK CONFIRMS IT IS A DIFFERENT MECHANISM.** Scanning stage 5's 770 records by type:

    $4C spawns at   $1B8  -- and NOTHING ELSE. It is a single long-lived record.
    $49 spawns at   $1F3  $269
    $10 spawns at   $1F0  $1F2 $1F6 $1FA $1FB

**So `$4C`'s `cmpi.w #$1F0` is NOT self-referential.** `$4C` spawned at `$1B8` and this arm fires **56 clock units
later**, at the exact moment **type `$10`** spawns. By contrast `$49`'s `== $1F3` IS self-referential -- `$49`
spawns at `$1F3`, so its init reads the clock that created it.

**Two types, the same instruction shape, opposite meanings:**

    $49   $8130CE == $1F3   reads the clock that SPAWNED IT -- a per-spawn parameter
    $4C   $8130CE == $1F0   watches for ANOTHER TYPE's spawn moment -- a cross-type CUE

**So `$4C` is a long-lived coordinator that reacts to the script reaching a specific frame**, and combined with its
`$8130DE` mutual-exclusion release, this type is about inter-record timing rather than its own behaviour. That is
consistent with everything else odd about it: five unrolled parts, no state machine, a boolean draw selector, and
almost all its state in the sub-record.

**This is why the script check was worth running rather than assuming the idiom transferred** -- the instruction is
identical to `$49`'s and means something entirely different, which is the eighth instance of this band's rule
appearing at the level of a WHOLE IDIOM rather than a field.

### The FIFTH part's prototype tail IS the handler's code -- and the depth formula predicts it exactly

Dumping the five `$20` blocks from `$26F566`, parts 1-4 are ordinary data with distinct values, and **part 5's tail
is executable code**:

    part 5 $26F5E6:  00 00 00 00 00 00 00 00 00 00 00 00 | 4a 79 00 81 30 d2 66 00 ...
                                                            ^^^^^^^^^^^^^^^^ tst.w $8130D2 / bne

`$26F5E6 + $C = $26F5F2`, the handler entry. So the fifth prototype runs `$14` bytes INTO the handler, and the
band's depth formula gives that without being told:

    subRecords * $20 - (handler - subProto)  =  5 * $20 - ($26F5F2 - $26F566)  =  $A0 - $8C  =  $14  =  TWENTY

**W342 recorded the overlap as "TWENTY bytes" from reading it directly. The formula, the window length `$AC`, and
the five-part structure now all agree.** Four independent confirmations of the same layout.

**So the fifth sub-record receives twenty bytes of the handler's own instructions as its initial field values** --
`tst.w $8130D2 / bne / tst.b ($9E,A6) / beq / move.w ...` become part 5's `$0C..$1F`. That is the same trick `$49`
uses (`+$1C..+$1F` receive `moveq #$5C,D1 / and.b (A6),D1`), and it means **part 5's initial state is whatever those
opcodes happen to encode -- not a designed value.** A port MUST copy the bytes rather than invent plausible field
values, and the depth formula is how you know how many.

**This also settles the `($9E,A6)` puzzle from the other side**: part 5's `$1E`/`$1F` are `33 fc` and beyond, taken
from `move.w #...`, and the handler then TESTS `($9E,A6)` at `$26F5FC` -- reading back a byte its own prototype
seeded from its own opcodes. Circular, deliberate, and exactly the kind of thing that cannot be guessed.

**Settled and needing no further work:** `tst.b ($17,A5)` (one branch, two ported stubs), and the eight addresses
the old note listed as unported callees (all internal, two of them merely the boundaries `$26FF9E` and `$26FFE8`).

**Still open:** what selects among the arms, and the three `cmpi.w #$0600,($1E,A5)` ramp sites.

### THE TOP TOOLING GAP: there is NO ALIGNED DECODER, and that is the root cause of six errors

`rosetta.py dasm <addr>` **silently mis-aligned six times this session** (`$272722`, `$268EDE`, `$26903E`,
`$26907C`, `$2690CE`, `$2690F6`). Each time it printed a different address as its first line and swallowed exactly
one instruction. One of those cost **four waves** chasing a register that was loaded two bytes past where a scan
stopped. `tools/branches.py` (W362) cannot align either -- it scans every 2-byte boundary and says so on every run.

**The fix is a tool that, from an address KNOWN to be an instruction boundary, walks forward computing instruction
LENGTHS and prints the aligned addresses.** Then any `dasm` output can be checked, and any scan can be given real
boundaries instead of even offsets.

**IT WAS DELIBERATELY NOT BUILT THIS SESSION, and the reason should be respected.** It needs length rules for
every opcode family in this cartridge -- `4e75`=2, `4eb9`=6, `4e71`=2, `Bcc.s`=2, `Bcc.w`=4, `0c2d/0c6e`=6,
`4a2d/4a6e`=4, `4a79`=6, `1b7c/3b7c`=6, `532d`=4, `41fa`=4, `41f9`=6, `51cf`=4, and more -- and **a wrong length
anywhere makes every subsequent address wrong while looking completely plausible.** That is the same failure mode
as the misalignment it is meant to fix, with a wider blast radius.

**Three tools this session shipped a confident summary their measurement could not support** (`spanned.py`'s
pass/fail, `claimed.py`'s verdict three times over). An aligner is that risk raised, because its output is not a
summary but a set of ADDRESSES that everything downstream would trust. **Build it with a test that walks a span
whose boundaries are already known from committed disassembly and asserts they match** -- `$2A4606..$2A46B0` is a
good candidate, since its eleven `lea`/`jsr` pairs give eleven verified boundaries.

Until then: **treat any `dasm` whose first line is not the requested address as a MISS**, and prefer raw byte dumps
for anything load-bearing.

### THE BAND RULES -- earned across W345..W353, every one after getting it wrong first

The stage-5 band (`$43 $46 $47 $48 $49 $4A $4B $4C $55 $1A`) shares its MECHANISMS almost completely and agrees
on almost none of its CONSTANTS, OFFSETS or INSTRUCTION FORMS. **Every single thing carried from one member to
another during this session was wrong.** Concretely:

1. **Confirm every field from an instruction IN THIS TYPE.** The same offset means different things across types
   (`$46`'s `($18,A5)` is a countdown, `$55`'s is a palette base) AND the same meaning lives at different offsets
   (`$1A`'s palette pair is at `$1C`/`$1D`). Neither direction of inference is safe.
2. **Read the base register.** `($28,A5)` and `($28,A6)` are the heading and the animation cursor in ONE handler.
   A5 is the record, A6 the sub-record.
3. **Read the operand SIZE and the comparison KIND.** `$8130D2` is tested as a word and as a long in one routine
   (the long covers `$8130D4` too). `$813092` is tested `bls #$1` in an init and `bne #$4` in a death arm.
4. **Bounds tests split the band.** `$55` and `$1A` use two word adds with the carry off the SECOND (must NOT be
   folded); `$46` uses one `ext.l`/`addi.l`/`cmpi.l` (must NOT be split).
5. **The packed-long borrow rule is a per-site decision, not a rule.** `$1A` alone shows three situations:
   `swap`-separated word adds (no borrow possible), a negative low half (borrow applies -- and it is what makes
   the twin muzzles symmetric), and a zero low half (moot).
6. **A word literal is TWO byte fields.** `move.w #$28,($1E,A5)` sets the timer to 0 and the reload to `$28`, so
   the arm fires IMMEDIATELY. Writing `setU8(0x1e, 0x28)` inverts it into a `$29`-frame wait.
7. **Read EVERY reload site.** `($1E,A5)` and `($2E,A5)` in `$1A` each have two, and the second one is what
   creates the burst-within-a-burst grouping.
8. **COUNT call sites before reading spans.** `jsr <emit>` counted with a byte scan gave `$55`'s fan (3 unrolled),
   `$1A`'s fan (1) and `$1A`'s death arm (3 spawns) in one command each. Reading sequentially instead produced a
   retraction every time.
9. **`rosetta.py dasm` MISALIGNS SILENTLY -- six times this session.** If the first output line is not the address
   you asked for, it is a MISS, not an answer. Back up two bytes. Every one of the six hid exactly one
   instruction that mattered, and one cost four waves.
10. **`claimed.py` NOT PORTED can be misleading.** `$242B90` is unported as an address while being byte-identical
    to the ported `$242B3C` bar one register. Disassemble a small routine and compare with its nearest ported
    sibling before believing it.
11. **Bound tables by ADJACENCY.** Five tables this session were bounded exactly by what follows them -- the next
    type's init, the death list, the record prototype, the next RNG bumper. Try that before guessing a length.
12. **Dead code is present and normal.** Four constructs in this band: `$27250C`'s overwritten `#$1`, `$2723B2`'s
    clobbered pointer store, `$268D88`'s no-op `addi.w #$0`, and `$26331C`, a bare `rts`. Transcribe them; do not
    infer intent.

**Stage 5: NINE types with no handler over 27 records** (was ten over 29 at the session start).
Ranked: `$46` 13, `$1A` 4, `$48`, `$4A`, `$4B`, `$43`, `$47`, `$4C`, `$B0`.

**PUBLISH CADENCE IS EVERY FIVE WAVES** (owner, 2026-08-12), not every wave. W335 published; next due
after **W340**. Run `export-web.mjs` BEFORE `publish.mjs --only ddpdoj` whenever the run added ROM
windows. Foreground, never while still editing.

### THE NEXT THREE THINGS, IN ORDER

1. **Write `$4A`** (init `$2719AE`, initBody `$2719B6`, handler `$271A64`). Everything needed is in
   the `$4A` section below. Read `$271AE0` onward first -- its alive path, fire arm and draw, and
   whether `($20,A5)`/`($21,A5)` feed cadence or aim -- then write it. Window `$271A1A + $52`.
2. **`$4B`** (init `$271C92`, initBody `$271C9A`, handler `$271D48`), expected to share `$4A`'s
   overlap trap and its mark-and-fall-through death.
3. **`$47`** (`$E2` records). `$1A` stays blocked until D2/D3 at `$268D8C` are measured.

Then stage 5's boss, the HIBACHI CLOSURE RULE, then the loops.

### THE LESSON THIS SESSION KEPT PAYING FOR: CHECK FOR THE FAMILY FIRST

**Twice in one session a "new mechanism" or a "blocker" dissolved the moment I checked whether the
port already had the shape.** Both times the cost was a wave of attention and both times the check was
two minutes:

  * **W334** -- `$2715A6` has no code xref and looked like a broken disassembly. It is `init + 8`,
    which `spawn.js:219` has computed all along and which `$81` already models as `init`/`initBody`.
  * **W336** -- `$4A` setting `(A6) = $8000` and NOT calling `freeEnemy` looked like an unknown
    lifetime needing a measurement. `death37` in `handlers.js` is the same thing instruction for
    instruction, with the fall-through already labelled in a comment.

A third instance, same root: **W334 also found `bee.js` had carried a docstring saying kind 16 was
unported for fourteen waves after W286 ported it**, and D20 was opened on the strength of it. A stale
comment is not inert.

So: before writing anything, grep the port for the shape, not just for the address. And before
believing a comment, check its condition still holds.

### THREE TRANSCRIPTION TRAPS THIS BAND KEEPS SETTING

1. **Prototypes overlap handlers.** `loadSubProto` copies `($4,A5)+1` records of `$20` bytes and the
   cartridge lets the tail run into code. `$49`: four bytes. `$4A`: **eight** (two sub-records). Never
   trim such a window to the handler start, and never assume the depth from a sibling.
2. **This ROM indexes its own instruction stream.** Four instances now: `$27460A` (W326), `$25DAC2`
   (W332), `$2716D8` (W335, a wholly DEAD `tst.w` of a `lea` opcode) and `$271774`. When a stage-5
   routine reads an address inside itself, check whether the target is code before modelling it.
3. **Word ops on long-loaded registers.** `$27172C neg.w D3` after `move.l (A1),D3` negates the low
   half only, no borrow -- then `add.l` DOES carry. Also `$281744`/`$281764`/`$2816F6` all funnel to
   `$2817C2`, which saves only D7/A0-A1 but **never writes D1..D4**, so chained shots legitimately
   inherit registers (W336). Read the callee before assuming either way.

### STILL OPEN FROM THE OWNER'S PLAYTESTS

D24/D31 hyper laser impact sprites (**start at `src/hyper.js`, not the beam** -- W324 did not fix it),
D25 transition cutting early, D32 stage-2 invisible-but-hittable enemy plus stars/medals only from
midbosses, D21 HUD element near the hyper counter (needs a marked screenshot), D12 repo docs behind
the code. The transition screen's phases 0 and 2 and the arm `$25DC2C..$25DD80` are unwritten.
D28a/D28b are mods, deferred by the owner until the game is done.


## Objective

Complete the readable JavaScript translation of DoDonPachi DaiOuJou Black
Label Version-B, including every stage, boss, loop, system, presentation path,
sound path, and authentic timing/slowdown behavior.

Read the repository `AGENTS.md` before changing anything. The important local
rule is delivery first: spend at least 90 percent of effort on playable product
implementation, use one focused smoke for a meaningful change, and do not
restart broad reconnaissance or build reviewer/test-agent chains.

## THE GOAL: one credit from stage 1 to stage 5 with no Unreached

The milestone to drive at, stated so it can be checked rather than felt: a single
credit plays from the stage-1 start through the stage-4 boss and into stage 5,
including at least one death and every stage transition, without the port
reaching one `Unreached`, and with nothing on screen that the cartridge would
draw and the port does not.

It is worth stating because the objective "translate the whole game" gives no
order, and this one does: everything below is ordered by what that run hits
first, and every item is a defect the owner can see rather than an interior the
owner cannot.

## Current product state

- HEAD is W325, `ddpdoj: type $01, two shared library routines, and a wrong-table error`.
- Live build: **20260811184328**, deployed and confirmed (W321..W324). W325 is NOT yet live.
- Suite: `node --test games/ddpdoj/tests/` is **2345/2345**, green, no skips. 414 ROM windows.
  `dojcoverage.py` reports **82/256** enemy types ported. Web gate 31 of 31, exit 0.
- Stage 5's census is **ELEVEN types over 32 records** (W323 took `$1B`). Note that W325's
  82nd type is `$01`, which NO stage script spawns, so it is not one of the eleven.
- **THE WEB GATE IS GREEN AGAIN AND THE GAME PUBLISHES.** W321 found it had been red for **182
  commits** and that nothing was broken: the expectations were last recorded at `c62f35e` and the
  gate is only ever run BY `publish.mjs`, so it goes stale exactly as long as nobody publishes and
  then blocks the publish that would have caught it. **That ratchet is the reason to publish often.**
  Two controlled experiments cleared the port -- pre-W300 source against current assets gave a
  byte-identical failure set, and current source with the old regenerated tables gave another -- and
  what had actually moved was the sprite PACKING: the art grew to 4244 streams, two shards were
  repartitioned, and every one of those checks counts records filtered by `map.get(offs)?.[2]`. The
  gate's own claim that "`records`, `distinct` and `first` are the PORT's own and no bundle can
  supply them" is FALSE and is corrected in place. `tools/w321itemspan.mjs` is the tool that told
  benign drift from regression: it prints per-frame SPANS and the per-shard spread instead of one
  total, and it takes `--tables` to swap the simulation's tables while leaving the assets alone.
- **READ `HIBACHI CLOSURE RULE` BELOW BEFORE TOUCHING TYPE `$B0`.** It is the one place where every
  measurement this repo has would report a finished stage 5 that has no boss in it.
- **A hand-built `ctx` in a test can agree with a wrong port.** W316 called
  `aim64AtTarget(ctx.tables, ...)` -- and in the live game `ctx.tables` is the MoveTables, not the
  AimTables. Its test passed because the fixture put an AimTables there, so test and port were wrong
  together. W319 corrected both sites to `aimTables(rom)`. Where `main.js` builds a real ctx, prefer
  that shape in fixtures.
- **STAGE 5 HAS STARTED AND IS SCOPED EXACTLY.** W313 windowed its spawn span
  (`$237978 + $2640`, the one stage whose far end is its last movement stream's terminator rather
  than the next stage's script) and W314/W315 censused it: **fifteen enemy types have no handler,
  over 65 of its 770 script records.** Stages 1..4 have zero missing. The ordered list, by how
  much of the stage each buys, with every init and handler address, is pinned in
  `tests/w314stage5scope.test.js` -- start there, do not re-derive it:

      $45 x21  $46 x13  $8E x6  $1B x5  $1A x4  $81 x3
      $48 $49 $4A $4B x2 each   $43 $47 $4C $59 $B0 x1 each

  `$45`'s handler is `$270E36..$27102B` -- **502 bytes**, comparable to the stage-4 types that each
  took a wave (W211..W218). Expect per-type waves, not table rows.
- **THREE THINGS THAT LOOK LIKE SHORTCUTS TO STAGE 5 AND ARE NOT.**
  1. A bare `new Ram()` cannot drive ANY stage: all five throw on garbage pointers, including
     stage 1, which plays end to end. Seeding it and re-installing the stage still throws, because
     `runEnemyFrame` is one of the seven calls a frame makes. Asserted in W314's test.
  2. Absence from `enemyHandlerMap` is NOT the same as unported. `dojcoverage.py` line 120 declares
     `NULL_HANDLERS = {0x26781C, 0x27E40A}` -- the reason 130 of 256 types report as `null`. W314
     counted type `$00` as missing and W315 corrected it.
  3. `$48`/`$49`/`$4A`/`$4B` are NOT one family. Consecutive types, consecutive inits, two records
     each -- the exact shape that paid off in W286, W287, W298 and W312 -- and W315 diffed them:
     seven shared bytes for one pair, forty-seven for the other, then real divergence. Fifteen real
     routines.
- **RUN `python games/ddpdoj/tools/dojcoverage.py`, not just the suite.** Its inventory check
  compares the live source registries against a ROM-derived inventory and rejects a handler
  registration the ROM does not agree is a handler. It is what caught W315's error.
- **`$280BCE` IS DONE at eighteen of twenty** (W312 added hooks 2, 3 and 17). The two left are
  indices 1 and 16, which are both `$280CEE` and belong to `allocBee27F92A`, so this dispatch will
  never translate them. Hooks 2 and 3 are the same twenty-four bytes at two addresses and do NONE
  of the shared speed work, which is why `fillGeneralImpact280B3E` gates it on `sharedSpeedBody`.
- **THE HIGH-SCORE SUBSYSTEM IS COMPLETE** (W300..W311), including the name entry end to end:
  search, insert, entry, factory table, the display screen's eleven `bsr`s and its state routine,
  the tag lookup and writer, the arms, the work list, the banned-name filter, the cursor, the input
  decode, the finish, and the countdown. What is left of it is presentation only:
  `$28F7F4..$28F8AA` and `$28FAF4`, both gated on `$23E45A` -- a SIXTH member of the zooming
  emitter family (`movem.l D4/D7/A0`, its own table at `$23E78C`, extent from D3 rather than
  `($E,A6)`), which `resolveZoomStub` does not accept and which needs the emit-stub window widened
  past `$23E0C2`.
- **THE HIGH-SCORE SUBSYSTEM IS ESSENTIALLY COMPLETE.** W300..W306 took it from one measured
  ordering fact to the whole thing:
  - `src/hiscore.js` -- the search `$287D96`, the insert `$287CEE`, the entry
    `$287BD2`/`$287C08`/`$287C3E`, the factory table `$28841E`, and the tag routines
    `$28F6F4`/`$28F7C8`.
  - `src/hiscorescreen.js` -- all **eleven** of `$25B492`'s `bsr`s and the state routine
    `$25B412` above them.
  - `src/hiscorename.js` -- the name-entry arms `$28F428`/`$28F482`, the row cache `$28F75A`,
    the work-list drop `$28F6C8`, and the banned-name filter `$28F674`.
  - Bonus line 2 calls the check instead of noting it. No counted gap inside any of the above.
  - **What is left is the character GRID only**: `$28FCAA` (the cursor draw, `$28FCAA..$28FD2A`),
    `$28FD2C`/`$28FD6E` (two entry points sharing a tail that ends at `$28FE0E`, drawn only when
    exactly ONE side owes a name), and `$28F4BA jsr $246410` with `$28FA98` -- which is the anim
    driver `stageend.js` declares out of scope as `PRESENTATION_DEVIATION[0x28d6fc]`.
- **THE LAYOUT, because two conventions share nine arrays.** They tile `$803824..$8038B9`: five
  score longs, five 12-byte name entries (three longs, one character each), six arrays of five
  words (loop, stage, ship, style, chain, digits), five overflow words. **The insert family's
  `lea`s name ENDS** (it walks `-(An)`); **the display family's name BASES** (it walks `(A6)+`).
  Same addresses, opposite meanings, depending on which routine you are reading.
- **THE NAME ALPHABET IS SETTLED.** A stored character is its index times four and index 0 is
  `A`. Proved three ways: the factory data is all multiples of four (W301), the display indexes
  its font UNSCALED so it must be (W302), and `$28F8AC`'s seventeen entries spell `SEX`, `KKK`,
  `DIE`, `ASS` and eleven more when read that way (W306). A..Z at 0..25, then 26, 27 and 28,
  with **27 a `$00000000` hole in both fonts**. The rejection constants `3, 3, 15` spell `DDP`.
- **`$8130CC` IS A WORK LIST, one bit per side that owes a name.** Bonus line 2 sets bit 0 or 1,
  `$28F350` copies the byte to `($5,A5)`, and `$28F6C8` clears a bit when that side has no
  tagged row; at zero the screen ends. Note that `$81E0D9` one screen away uses bits **1 and 2**
  for the same kind of thing -- do not pattern-match one onto the other.
- **THE `$FF`/`$FE` TAG IS A SEARCH KEY, not just a sentinel**, and it is `not.b` of the side.
  Two routines find a row by it. The `($C,A4)` slot pointer the insert writes has **zero**
  readers in the build -- W302 lost a search assuming a pointer written is a pointer read.
- **CHECK HOW A ROUTINE LEAVES THE CARRY BEFORE DECIDING IT RETURNS NOTHING.** Four this
  session: `$287D96` (a `sub` borrow), `$287C3E` (explicit `ori`/`andi`), `$25B412` (`ori`
  against `move.w D0,D0`, which exists only to CLEAR it), `$28F6F4` (a `subq` borrow on the
  miss path and an incidental non-carrying `add.w` on the hit path).
- **WHEN A SUBSYSTEM IS PARALLEL ARRAYS, SCAN THE ADDRESS RANGE, NOT ONE POINTER FIELD.**
  W301 wasted a search chasing `($C,A4)` -- whose absolute forms `$81B42C`/`$81B43C` have zero
  references -- and then found all four caller families in one scan for absolute longs landing
  anywhere in `$803824..$8038BA`. The family that touches every column is the one that
  understands the layout.
- **BEFORE DECIDING A QUESTION NEEDS NEW EVIDENCE, CHECK THE EVIDENCE THE REPO SHIPS.**
  Three waves deferred the high-score subsystem because the table's ordering was unknown.
  `rip/web/seed.bin` is a snapshot of the board's main RAM and had the answer in it. W301
  then found the same five scores in the ROM at `$287DF8`: **the shipped seed carries the
  FACTORY table**, so no boot catch-up is needed and a test asserts that.
- **`DBcc` EXITS WHEN ITS CONDITION IS TRUE** -- "decrement and branch if FALSE". So `dbcc`
  exits on carry CLEAR. Reading it the other way makes `$287D96`'s search run backwards,
  and both readings look plausible from the instructions alone.
- `$280BCE` is at **FIFTEEN of twenty** finish hooks translated.
- **A STATEFUL RNG DRAW CANNOT BE INSPECTED TWICE.** `$242B3C` opens with
  `addq.b #1,$803917`, so calling it again to test the sign desynchronises every later
  draw in the frame. W298's first draft did exactly that; there is now a test comparing
  the counter's advance against a known-good kind.
- **THE NINE BONUS LINES ARE COMPLETE with no counted gap of their own.** W297 ported
  `$2532B6`, which `setPanel2603B0` had been counting as the deferred text path even
  though both its printers landed in W116 -- the only missing part was the arithmetic.
- **THE SCORE TALLY'S SPINE IS COMPLETE.** `$25FF7A` walks both records and all NINE of
  `$25FF52`'s real entries have bodies. Line 9 turned out to be already ported --
  `player.js`'s `setPanel2603B0` calls itself "jump-table entry 9 of `$25FF7A`" -- so two
  of the nine cost nothing because an earlier wave wrote down something it could not use
  yet. What remains inside it: one note (`$2532B6`) and the HIGH-SCORE INSERT.
- **SEVEN of the nine bonus lines are in.** Line 8 is `$26037C`, whose head is the same
  both-records shape as line 5 (`lea $8130FA,A2 / lea $81311E,A3`), so read it alongside
  `$2602B6` rather than fresh.
- `$813142` is a LEASE, not a countdown: `$2600D8` spends one per post and bonus line 7
  gives one back. W273's note that the decrement is "UNGUARDED" was true and incomplete.
- **SIX of the nine bonus lines are in.** Line 7 is `$26035A`, whose head is
  `addq.w #1,$813142` -- the same counter `$2600D8` DECREMENTS at `$260112`, going the
  other way, so read the pair together.
- **A RULE WORTH KEEPING (W294):** a register the driver does not set needs MEASURING when
  it feeds arithmetic, and can be a PARAMETER when it feeds one unconditional store into a
  known field. That is why `$280252`'s A0 is still blocked and `$260348`'s A5 shipped.
- **FIVE of the nine bonus lines are in.** Line 6 is `$260348`, and its head writes an
  OBJECT's state byte through **A5** -- which none of the first five does, so A5 must be
  live at entry. **CHECK THAT FIRST**: it is the same class of question that stopped
  `$280252` in W288, and checking it last cost a reverted transcription there.
- **FOUR of the nine bonus lines are in.** Line 5 is `$2602B6`, and its head takes BOTH
  records at once (`lea $8130FA,A2 / lea $81311E,A3`) -- a shape none of the first four
  has, so do not assume the family.
- **THREE of the nine bonus lines are in** ($25FFA8, $260056, $26010E). Before
  transcribing line 4 (`$2601F4`), check its head against `$2600D8`'s and `$25FFA8`'s --
  three of the first four shared something.
- **D9's old note is closed**: `$260056` creates object types `$D` and `$B`, and `$B` is
  the `$25DBB4` W276 ported -- the creator and the created are both in the tree.
- A long census run reaches **frame 6483** and stops at `$280252`, whose body is READ
  but NOT portable until one register is measured -- see work-order item 1.
- **THE LIVE BUILD IS STALE AND NOBODY IS TRACKING IT (D19).** `git push` is not
  `tools/publish.mjs`. This session closed six docket items and moved the bundle
  4194 -> 4244 streams with no publish, and THREE of those items turned out to be
  things that already worked. Ask for the build id with the next report.
- **`900 FRAMES IS TOO SHORT TO SEE AN ITEM.** Every gate here runs 900 and the item
  producer's first drop is at frame 2576. If a probe about items, medals or hyper
  reports zero, check the window before believing it (W282).
- **`top_objects` coverage is 9/20** -- nine of the twenty top-level dispatch entries
  are registered in `main.js`. `w167coverage.test.js` pins it.
- Stages 1, 2 and 3 have their known live spawn paths translated. Stage 3 is
  closed at 414/414 script records and 28/28 script types.
- **THE STAGE-4 BOSS IS COMPLETE FOR EVERY REACHABLE PATH.** W246 through W263
  landed all three phases and the damage-controller edge that drives them:
  - phase 1 was already there (F0/F3/F4, MAIN0/MAIN1, D0/D9/D10, E1/E2/E3/E5).
  - phase 2: F5 (`$2A0D16`, a seven-arm bit machine), MAIN4, the A3 3..8 ramp
    family, A1 6/7/8/9/10, and type `$42`'s body and handler.
  - phase 3: A4 id6, MAIN7, MAIN8, A1 11/13/14, and type `$42`'s `$8130F4 == 2`
    half. W263 translated the low-HP transition that STARTS it, which W219 had
    left as a throw.
  - `w256type42handler.test.js` drives a whole phase-2 cycle in one test: F5's
    arm 6 starts A1 9, A1 9 spawns a formation, each child homes and counts itself
    back on arrival, A1 9 retires, and its retirement flips every survivor into its
    second mode.
- **Deliberately unreachable and left as such**, each pinned by a census rather
  than assumed: A4 id2, MAIN5 and MAIN6 (no `a4Start`/`seqStart` in the bank
  reaches them); the `$281744` twins of A1 13's two fans (21 call sites behind a
  `bra`); type `$42`'s three call-site-less emitters; and `$2A3AFE` (a role-`$FF`
  child meeting `$8130F4 == 2`, which no translated path produces).
- **A death works end to end AND NOW DRAWS** (W227, W228, W231, W275): the
  animation, the reset, the life spent, a fresh player object placed where its
  respawn entry says, `$F0` frames of invulnerability, and the pods deploying to the
  exact `$24C928` target. W275 ported `$24A6B4`, the script-driven display walker the
  ship runs WHILE DYING, and harvested the 49 sprites of the explosion -- all of
  which were missing from the bundle, so the six frames of the death drew nothing.
- The stage transition MACHINE works, its banner picture draws (W232), its
  palettes install (W236), both panels paint (W238, W239) and the `$900000` ring
  clears (W240); the rest of its presentation is the gap.
- The bee popup works (W234), and the secondary explosion spawns (W235).
- Sprite streams **4244**. `w230descriptorsweep.mjs` draws 718 distinct descriptors
  from the shipped seed and 783 from the stage-2 rung (`--lf 19500 --frames 1800`),
  with ZERO unresolvable in both. **Eleven test files pin the stream count exactly**
  and all eleven get bumped together when a wave harvests art; `w218stage4.test.js`
  carries the explanation.
- **SEVEN loop-2 rules exist** (W292 added two, both in bonus line 4 `$2601F4`: the
  pointer word's source and whether `$286FB4` runs -- one `beq` and one `bne` on the
  same word, so a shared flag would get exactly one backwards). The five before them:: W241's zero-lives extend (`$253794`), W250's A1 6
  (which changes both its shot count and its generator), A4 id6's two (`$2A1250`,
  `$2A1346`) and W270's `$260ACA` announcement choice. All read `$813098`. Stage 5
  has not started.
- **The announcement pipeline is closed end to end**: the consumer `announce260B30`
  is registered as object dispatch `[4]` (W269, via `adoptCurrentWindows` in
  `src/rom.js` -- a replay fixture's frozen ROM WINDOW LIST is a port artifact, not
  game state, so it can be substituted once proven a byte-superset), and W270 landed
  the four producers at `$260A20`/`$260A88`/`$260A9A`/`$260AB6`/`$260AF2`.
- **The ship's draw path is verified against the board byte for byte** (W272): three
  bucket-19 records and five bucket-12 trail records, 100 frames out from the
  cartridge's own RAM. See D8 -- there was no missing draw. W274 found that
  `drawShipAlt`'s bit-15 compare was INVERTED; W275 fixed it together with the walker
  it reaches, which is the only way it could be fixed.
- **The stage-clear SCORE TALLY works AND IS DRIVEN** (W273, W274, W276): `$2600D8`
  posts a bonus line, drives all seven HUD rows per side, installs the tally's four
  palette banks (`$241688`) and recounts the live sides; its only counted gap is
  `$23C668`. W276 registered object dispatch `[11]` `$25DBB4`, the stage-clear SCREEN
  the tally lives inside -- states 0 and 2 transcribed, state 1's gates and its menu
  cursor ONE counted note that NAMES the six routines still missing.

## DEFINITION OF DONE, PER WAVE -- and why this section exists

A wave is DONE when all five hold. Nothing else counts, and "the game is finished" is not a
per-wave test:

1. `node --test games/ddpdoj/tests/` is green with **zero skips**.
2. `node games/ddpdoj/tools/w230descriptorsweep.mjs` reports **0 not in the bundle**.
3. `python games/ddpdoj/tools/dojcoverage.py` prints **both OK lines**.
4. A worklog exists under `docs/worklog/ddpdoj/`, numbered by the reserve-then-rename rule.
5. It is **committed AND pushed** (D18).

If the wave is BLOCKED instead, it is done when the blocker is recorded with the specific
MEASUREMENT that would unblock it -- as `$1A` is ("measure D2/D3 at `$268D8C`") and `$280252` is
("measure A0 at `$28029A`"). "Unported" is not a blocker; an unread register is.

**WHY THIS IS WRITTEN DOWN.** A session-scoped Stop hook was set by `/goal` with the condition
*"finishing the whole game including loops, plus everything else we ever said"*. That is a
COMPLETION test used as a TURN-END gate, so it can never pass: every turn ends with the game
unfinished, the hook fires, and once the context is spent the only thing left to produce is
restatement. It fired eight times in a row at the end of 2026-08-11 for exactly that reason.

The lesson for whoever sets the next one: **a goal condition enforced at turn-end has to be
satisfiable at turn-end.** The five checks above are. "The whole game" is not. And autonomy is a
different mechanism entirely -- `/loop` or a cron RE-INVOKES with a fresh context, which is what
unattended progress actually needs; a Stop hook only refuses to let a turn finish and cannot hand
back the one resource that ran out.

This repo is already built for the fresh-context model: this handoff and `docs/DOCKET.md` are the
state carriers, and they are kept current precisely so a new session continues without re-reading
the code. Trust them over trying to keep one context alive.

## An hourly cron is running

A session-scoped job fires every hour at :23 telling the next wake to resume
immediately, take the FIRST unfinished item in the work order below, and spend the
wake on translation rather than on process. It is session-only: it dies with the
Claude session and cannot restart one that has exited. It also auto-expires after
seven days.

## The docket comes first

[DOCKET.md](DOCKET.md) holds twelve defects the owner reported from playing the
shipped build, each with the port-side finding underneath. Player-visible defects
in stages the player actually reaches outrank Stage-4 boss interiors, which is why
W225 is paused.

**THE OWNER ADDED FIVE ITEMS ON 2026-08-11: D13..D17.** D13 (orientation/safe-area) and
D15 (the orientation lock as a setting) are FIXED in W279, D14 (the PWA) in W280. **D16
(the hyper bar should show the level when NOT hypering) and D17 (the in-stage medals)
are OPEN and they are the top of the work order.**

Of the first twelve, eleven are closed: D1, D2 (W226); D9 entirely (W227, W228, W231);
the rank icons and the D5 instrument (W230); D3 (W264/265/266); D4 (W265/266/267); D10
(W268); D7 (W271); D8 (W272); D12 (W253/263). D11's banner picture landed in W232 and
its remainder is the only one of the original twelve still open.

**Two of the last three closed the same way, and it is worth expecting a third.** D7
and D8 were both routines and records that already existed: D7 was `hyperStock286ED6`
and `livesRow2878CC`, complete since W113/W116 and called by nobody; D8 was a draw
path that already matched the board byte for byte behind a page that told the player
not to press the button. **Before assuming a player-visible gap is untranslated code,
check whether the body exists and is uncalled, and whether the shipped page is lying
about it.** `w271hyperstock.test.js` has the mechanical form of the first check.

## D18: FINISH EVERY WAVE WITH A PUSH

The owner asked for this explicitly. Every wave of this session committed and none
pushed, so `main` reached **73 commits ahead of `origin/main`**. A wave is not done
until `git rev-list --count origin/main..HEAD` is 0.

    git push origin main

The remote is `origin` -> `https://github.com/Fabulu/Mixup.git` and the branch is
`main`, which is also the default, so nothing has to be inferred. This is NOT
`tools/publish.mjs`: that gates the Batman suite, builds `dist/` and deploys to
Cloudflare Pages. Pushing does not publish and publishing does not push.

## HIBACHI CLOSURE RULE -- read this before touching type $B0

**Do NOT declare stage 5 complete because** all 770 records initialise, all 35 top-level types have
handlers, the missing-handler census reaches zero, or `$2A4614` reaches the generic stage-advance.
**None of those measurements proves the boss graph**, and the project has already disproved the
weaker version of the same reasoning: W313 walked 770/770 records with no `Unreached` and W314 then
showed spawning and per-frame behaviour are DIFFERENT table entries, so a type can spawn perfectly
and have nothing to run. Stage 5 even contains one type-`$00` record that legitimately appears and
frees itself on its first frame without ever becoming a visible enemy.

**Type `$B0` is not an ordinary enemy.** One script record, and W317 mislabelled it "standalone".
Its handler is about 28 bytes:

    2a4606  jsr $2A6B94        UNPORTED -- this is what owns the boss
    2a460c  jsr $25962E        ported
    2a4612  bcc $2A4622        the carry decides
    2a4614  jsr $242952        THE STAGE ADVANCE
    2a461a  jmp $263762        freeEnemy

`src/stageend.js` has documented `$2A4614` since long before stage 5 started, as **one of the five
`$242952` callers that are the five bosses** (`$292922` stage 1, `$2973A8`, `$29BE36`, `$29EF14`,
`$2A4614`). That fact and the type census lived in different files, which is why nobody joined them.

So `$B0` is a **completion GATE** and `$2A6B94` is the boss machinery. `$2A6B94` opens
`tst.w ($106,A6) / tst.b ($10E,A6) / bne $2A6F12` -- record offsets past 256 bytes and a branch
`$370` forward, i.e. a boss-sized record and a large routine.

**The trap, exactly:** port `$B0`'s 28 bytes, watch the census reach zero, watch `$242952` fire and
the stage number advance -- and no boss ever existed. Every measurement this repo currently has would
report success.

Treat `$B0` (init `$2A42D4`, handler `$2A4606`) as the stage-5 boss-route ROOT until disproven. Read
its complete init body and handler and recursively enumerate every direct call, indirect table call,
object allocation, deferred spawn, scheduler/script-VM entry and mode/loop branch. Pin concrete ROM
addresses and runtime-created object roots. **A name inferred from graphics, a stage counter moving,
or the absence of `Unreached` is not proof.**

### The conditions, researched 2026-08-11 (two agents, sources below)

This section is EXTERNAL EVIDENCE, not ROM measurement. It says what to look for and what to refuse
to implement; it does not license writing any of it without finding the code. Every number here still
needs a ROM witness.

**1-Loop mode: Hibachi has NO conditions.** He follows the stage-5 boss unconditionally and continues
are permitted. Attested by shmups.wiki, HG101, kakigames, 1cclog and a forum post, independently.

**And in 1-Loop mode the 1-5 boss gains Kouryu's SECOND FORM** -- the loop-2 boss chain is substituted
into loop 1, so 1-Loop is not "Hibachi bolted onto the normal 1-5 ending". Medium confidence, a
Japanese source plus a corroborating blog. If true it means the mode branch reaches further back than
the post-boss transition, which matters for where to look.

**2-Loop mode: the gate is evaluated at the END OF LOOP 1**, and it is an OR of three, behind two
preconditions. From Japanese Wikipedia, verbatim structure:

    REQUIRED:  no continue used  AND  no second player joined
    THEN ANY ONE OF:
      misses <= 2                        (not zero -- you may lose two ships)
      bombs used <= 3                    (not zero)
      bee-perfect on >= 3 stages         (all 10 bees in a stage, no death before that stage's boss)

Then Hibachi follows Kouryu's second form in 2-5 with **no further check**. So the owner's guess was
half right: bees are ONE of three alternatives, and it is at most two deaths rather than none.

**Explicitly NOT conditions, and refuse to implement them without ROM evidence:** a strict no-miss, a
strict no-bomb, any chain or hit minimum, "bees collected at maximum value", and any score threshold.
The 350,000,000-point route appears only in English sources and only ever flagged White Label; the
Japanese canon lists three conditions and no score.

**Contested, settle in the ROM, do not pick a side from documentation:**
* whether continues are blocked at the 2-Loop Hibachi in Black Label (sources directly conflict);
* whether rank carries across the loop boundary, and whether there are one or two rank values (one
  page implies BL resets it, another implies a live-count-derived component carries);
* whether ordinary enemy HP is loop-scaled at all -- nothing documents it either way.

**"Black Label Version B" IS NOT A DOCUMENTED DESIGNATION.** Nothing public uses it. There are three
Black Label dumps -- MAME `ddpdojblk` (`ddb10_10_8_434f.u45`), `ddpdojblka` (`ddb_1dot.u45`) and
`ddpdojblkb` (`ddb10.u45`) -- all displaying the same `2002.10.07 Black Ver`, and **no source says
what differs between them.** The `b` suffix is the likely origin of the phrase. If a wave ever needs
to know which dump this port targets, that cannot be answered from documentation and needs a binary
diff. Worth knowing before trusting any external claim about "Black Label" behaviour.

**A safety note from the research:** `tcrf.net/DoDonPachi_DaiOuJou_(Arcade)` served a page containing
embedded instructions rather than game data. Both agents hit it and both correctly ignored it and
reported it. Treat that URL as hostile; do not point tooling at it unattended.

Sources: shmups.wiki DoDonPachi_DaiOuJou and Hibachi pages, ja.wikipedia 怒首領蜂大往生,
hardcoregaming101, world-of-arcades Cave/DdpDaiOuJouBl (incl. its Hardware page), shmups.system11.org
threads 34601 / 17432 / 39713 / 49965 / 34513, kakigames, 1cclog, adb.arcadeitalia MAME set list.

**So "check the loop counter" is not enough: there is a MODE branch as well.** "Stage 5's boss and end
sequence" in any earlier work order is underspecified; it means all five of:

1. the normal stage-5 boss;
2. the post-boss route decision;
3. Hibachi in 1-Loop mode;
4. the loop transition in 2-Loop mode;
5. Hibachi after the second-loop stage-5 route.

Require a separate executable witness for each, plus Hibachi visibly drawing, carrying
cartridge-derived HP, taking multiple attack-script transitions, dying, and reaching the right
ending. A useful oracle trace starts at `$2A42D4`, logs every allocation and indirect call, and
breakpoints `$2A4606` and `$2A4614` under BOTH mode selections -- that shows whether `$B0` creates
the normal boss, launches another scheduler, branches to Hibachi, or merely observes completion.

## Work order toward the goal

### THE NEXT WAVE IS ITEM 0. Start here, do not re-derive the order.

**0. `$25DEAE` -- THE TRANSITION SCREEN'S VALUE ROWS.** This is first because it is the only
   USER-VISIBLE defect on the list: the owner reported "0's, some pictures of medals" and D30 traced
   it. W328..W330 landed the whole interactive draw (cascade, per-side header, both label pairs,
   cursor, blinking highlight; twelve tests). What remains:

   * `$25DEAE` is the **Y cursor**, structurally the same routine as the ported
     `tallyCursor25DD0C` -- same `($8,A4)` edge read, same bit 2 / bit 3 pair -- but over
     `yEntries: 3` on `($F,A5)`, so the `andi.b #$1` mask is replaced by the `$25DA94`/`$25DEAE`
     picker (up and down halves, skipping an entry the other player holds via the already-ported
     `otherSideHolds25DAEA`). Three is not a power of two, which is WHY there is a picker.
   * its TAIL holds the three remaining emit sites -- `$25DF72` (literals `D1 $5BC02600`,
     `D2 $00334224`, `D3 $0648`), `$25DFBA` and `$25DFE8` (`D2 $00334424`, `D3 $0618`) -- all
     `enqueueRegisters(ram, 26, ...)`, and bucket 26 holds TEN records of which the draw already
     uses four.
   * `tallyRequest25FF38` already writes the record the rows read. `$24018C` is NOT a new emitter.

   Every constant above is in `docs/DOCKET.md` under D30. This is a transcription.

### `$49` IS READ END TO END AND VERIFIED AGAINST THE TYPE TABLE (W334). WRITE IT.

Type table `$267824 + $49 * 8 = $267A6C` reads `0027159e 00271640`, and the body address is not a
fall-through: `spawn.js:219` computes `initBody = init + 8` (`$26361A addq.w #8,A1`), so
`$27159E + 8 = $2715A6`. `codexref` finds NO code reference to `$2715A6`, which is expected and not
a disassembly fault. Record it exactly as `$81` is recorded:

    type $49    init $27159E  (($4,A5) = 0, ONE sub-record)   initBody $2715A6   handler $271640

**THREE TRAPS, ANY ONE OF WHICH PRODUCES A WRONG `$49` (W334):**

1. **The sub prototype OVERLAPS the handler.** `loadSubProto` copies `$20` bytes from `$271624`, so
   `$271624..$271643`, and the handler starts at `$271640`. The record's `+$1C`/`+$1D` receive
   `$72 $5C` and are immediately overwritten by the init (`$2715D2`, `$2715DE`); `+$1E`/`+$1F` keep
   `$C2 $16`. The window must therefore cover `$271616..$271644` and span into code. That is legal
   and deliberate -- declare it with this note or it reads as an off-by-one.
2. **`$2716D8 tst.w $271774.l` IS DEAD. OMIT IT.** `$271774` is inside this routine; the word is
   `$41FA`, the `lea` opcode. `$2716DE subq.b` then overwrites every flag before `$2716E2 bcc` reads
   carry. Third instance in stage 5 of the ROM indexing its own instruction stream, after W326's
   `$27460A` and W332's `$25DAC2`.
3. **`$27172C neg.w D3` where D3 came from `move.l (A1),D3`.** Only the LOW word negates and there is
   no borrow into the high word, so the mirrored variant flips Y and keeps X -- then `$27172E add.l`
   lets a low-word carry reach X. A long negate would move the formation sideways.

**`($20,A5)` IS A POINTER TO A FORMATION FLAG, NOT A VALUE.** `$2715F4..$271610` picks `$8130E0` when
the scroll clock is `< $260` and `$8130E4` otherwise, stores the ADDRESS, and writes 1 through it.
Both exits clear it through the pointer: the death arm at `$27168A` and the off-screen free at
`$2716BE`. Storing the value breaks both.

**THE FIRE TABLES, MEASURED.** `($1C,A5)` steps by 4 and wraps at `$78`, so 30 steps.

    $27179C   30 LONGS, index RAW        draw sprite records, $316494 step $2A4
    $271814   30 LONGS, index RAW        packed muzzle offsets
    $27188C   30 WORDS, index ASR 1      ($17,A5) SET   -- $66 up by 6, then back down
    $271904   30 WORDS, index ASR 1      ($17,A5) CLEAR -- $9A down by 6, then back up

Two tables, one index, **two conventions**. The word values sweep out and return, so the attack is a
30-frame fan and `($17,A5)` picks the starting direction. Spawners `$2816F6` (D0 = 4), `$281764`
(D0 = `$FFFC0005`) and `$281744` (D0 = `$40003`, gated on scroll `>= $268`) are all already ported
and reachable through `shoot`.

The init body, read in full:

    27159e  move.w #$0,($4,A5) / rts            the stub -- run length ZERO
    2715a6  loadSubProto($271624)               SHORT form (first word $A000, bit 15 clear)
    2715b2  loadRecordProto($271616, 6)         D0+1 = SEVEN words
    2715c0  readInitPosition
    2715c6  cmpi.w #$1F3,$8130CE / bne          **AN EQUALITY on the scroll clock**, not a
    2715d2  ($1C,A6) = $40 ; ($17,A5) = 1       threshold -- so these two writes happen only on the
                                                exact frame the clock reads $1F3, and a port that
                                                used >= or < would do them for hundreds of frames
    2715de  ($1D,A6) = ($18,A5)
    2715e4  $81B414 = 1 ; $2715EC  $81B416 = 1  the same pair type $81's init writes
    2715f4  A0 = $8130E0
    2715fa  cmpi.w #$260,$8130CE / bcs          clock BELOW $260 keeps $8130E0 ...
    271606  A0 = $8130E4                        ... at or past it, the other word
    27160c  ($20,A5) = A0 ; $271610 (A0) = 1    store the CHOSEN POINTER, then mark it

So `($20,A5)` is a pointer the handler will use, and which of two counters it points at is decided
once, at spawn, by the clock. Two clock reads with two different comparisons, one equality and one
threshold: transcribe both as written.

**AND ITS DAMAGE ARM DOES NOT FIT `damageArm5C`.** It is the same family by mask and by clear, and
simpler:

    271640  moveq #$5C,D1 / and.b (A6),D1 / beq $271698    the sense is INVERTED (beq, not bne)
    271648  move.b #$A3,D0 / and.b D0,(A6)                 the clear via D0, not `andi.b`
    27164e  jsr $286096                                    scoreHit
    271654  D0 = ($1D,A6) ; $271658 D2 = ($19,A5) ; eor.b D2,D0
    27165e  move.b D0,($1D,A6)                             stored HERE, before the death test
    271662  tst.w ($18,A6) / bpl $27169E                   `bpl` to ALIVE, not `bmi` to death
    27166a  move.l #$250,D0                                the death arm, killScore $250

**There is NO base-palette arm, no `hpFull` compare, no `$8130CA` gate and no `cmpi.b #$19` low-HP
check.** `damageArm5C` has all four, so passing this through it would invent a palette decision the
ROM does not make. Keep it separate, and note in the `DAMAGE_5C` table that the family has a
SIMPLE member as well as its three parameterised ones.

### AND `$49`'s DEATH ARM NAMES A SHARED PREREQUISITE: PORT `$270D92` FIRST

    27166a  move.l #$250,D0 / jsr $28615E     scoreKill($250)
    271676  D2 = ($2,A6)
    27167a  lea ($27197C,PC),A1 / jsr $270D92 <-- UNPORTED
    271684  jsr $28C2DC                       the cue type $81 already posts

`$270D92` opens `move.w (A1)+,D1 / cmpi.w #-$1,D1`: a WORD-LIST WALKER terminated by `$FFFF`, taking
its list in A1 and a position in D2. And `codexref` gives it **SIX callers**:

    $270DCC  bra.s          $271390  jsr        $271680  jsr   <- type $49's death arm
    $271AC2  jsr            $271D88  jsr        $27248E  jsr

`$271AC2` is inside type `$4A` (`$271A64`) and `$271D88` is inside type `$4B` (`$271D48`). **So this
one routine is the shared death-spawn walker for the whole `$48`/`$49`/`$4A`/`$4B` band**, which is
the band W315 proved is NOT one family by prototype -- they diverge in their bodies and share this.

**PORT `$270D92` BEFORE ANY OF THEM.** It is small, it is shared six ways, and doing it first turns
three of the remaining stage-5 types from "read a death arm each" into "one call each". Doing `$49`
first instead means porting the walker inside a type wave and then finding two more callers for it.

Its list for `$49` is `$27197C`, whose first words are `0000 008D 0000 FC00 0000 0000 0000 0084` --
so the entries are not uniform and the walker's stride needs reading, not assuming.

`$49`'s alive path, also read: `$27169E` sign-extends `($2,A6)` to a LONG, adds `$4000`, and
`cmpi.l #$2000,D0 / bgt $2716CC` -- a SIGNED LONG compare, unlike the two-`addi.w` word idiom types
`$1B` and `$81` use for the same job. Do not reach for that idiom here.

### `$49` IS NOW READ END TO END. `$270D92` IS PORTED (W333). WRITE IT.

    27169e  moveq #$0,D0 / move.w ($2,A6),D0 / ext.l D0 / addi.l #$4000,D0
    2716ac  cmpi.l #$2000,D0 / bgt $2716CC     **A SIGNED LONG COMPARE.** Not the two-`addi.w` word
                                               idiom `$1B` and `$81` use for the same job -- do not
                                               reach for it here
    2716b6  tst.b ($16,A5) / beq $2716D2       off screen and never seen -> carry on
    2716be  movea.l ($20,A5),A0 / clr.w (A0)   off screen AND seen -> **CLEAR THE COUNTER THE INIT
                                               MARKED**, then $2716C4 jmp $263762
    2716cc  move.b #$1,($16,A5)                on screen -> mark seen
    2716d2  jsr $24179E                        `scrollCompensate`, ported
    2716d8  tst.w $271774                      a ROM word, so a constant test
    2716de  subq.b #1,($1A,A5)                 the cadence

**`($20,A5)` IS A MARKER PAIR, and the init half is already read.** The init body picks `$8130E0` or
`$8130E4` by the scroll clock, stores the POINTER in `($20,A5)` and writes 1 through it; this arm
clears it on the way out. That is the same bracket-your-own-lifetime shape `$1B` has around
`$8130D8`, with a pointer instead of a fixed address -- so whichever of the two counters this type
chose at spawn is the one it releases.

Everything `$49` needs now exists: `loadSubProto`/`loadRecordProto`, `readInitPosition`,
`scrollCompensate`, `scoreHit`, `scoreKill`, `soundPost(0x28C2DC)`, and `walkDeathSpawns270D92` for
the death arm (W333). Its damage arm is the SIMPLE member of the `$5C` family -- write it inline and
do NOT route it through `damageArm5C`, which would invent a palette decision.

Windows to declare with the code: `$271616 + $E` (the 7-word record prototype) and `$271624 + ?`
(the sub prototype, SHORT form, extent from `$2637A2`); the block runs `$271616..$271640` and ends at
the handler, so one window `(0x271616, 0x002A)` covers both. Its death list `$27197C` needs one too.

### AND THE `$1F3` EQUALITY AT SPAWN SELECTS THIS TYPE'S WHOLE ATTACK PATTERN

The init's `cmpi.w #$1F3,$8130CE / bne` arm looked like a curiosity. It is the switch:

    2716e2  bcc $271774                        no borrow -> straight to the draw
    2716e6  move.b ($1B,A5),($1A,A5)           reload the cadence
    2716ec  tst.w $8130D4 / bne $271760        gated OUT while $8130D4 is set
    2716f6  lea ($271904,PC),A1                the DEFAULT fire list
    2716fc  tst.b ($17,A5) / beq $27170A
    271704  lea ($27188C,PC),A1                the ALTERNATE list
    27170a  move.w ($1C,A5),D0 / asr.w #1,D0 / adda.w D0,A1 / move.w (A1),D1
                                               a WORD from that list, indexed by ($1C,A5) HALVED
    271714  lea ($271814,PC),A1 / adda.w ($1C,A5),A1 / move.l (A1),D3
                                               and a LONG from a SECOND table, indexed UNHALVED
    271720  move.l ($2,A6),D2
    271724  tst.b ($17,A5) ...                 tested AGAIN below

**`($17,A5)` is written in exactly one place: the init body's `$2715D8`, on the arm guarded by the
`$8130CE == $1F3` equality.** So a `$49` that spawns on that one frame fires from `$27188C` and every
other `$49` fires from `$271904`. That is why the equality matters and why reading it as a threshold
would give every instance the alternate pattern.

**Two tables, two index conventions, one index.** `($1C,A5)` is halved for the word table at
`$271904`/`$27188C` and used RAW for the long table at `$271814`. Transcribe both; a shared helper
that halved once would put the long table's reads on the wrong entries.

Still unread: `$271724` onward (the fire itself), `$271760`, and `$271774` (the draw).

**Then, in order:** the real `$81` is DONE (W326), so stage 5 is at **ten types over 29 records**.
`$1A` is BLOCKED on a measurement (see below). Next unblocked: `$49`/`$4A`/`$4B` (spans `$A2`,
`$B6`, `$B6`), then `$47` (`$E2`), then the dependency bundles, `$4C` last. Then stage 5's boss, then
the HIBACHI CLOSURE RULE, then the loops.

1. **STAGE 5'S REMAINING TWELVE TYPES.** W316 took `$45` (21 records), W317 `$59`, W319 `$8E` -- so
   the census is **twelve types over 37 records**, pinned with every address in
   `tests/w314stage5scope.test.js`.

   **Do not order them by record count.** W317 scanned for the three deferred-spawn entry points and
   found four of them pull in an UNPORTED CHILD TYPE:

       $55 before $46      $54 before $48      $44 before $43
       $4E, $50, $52 and $58 before $4C     <- four children; leave $4C last

   So "twelve left" understates it: those twelve expose seven more child types, at least nineteen
   handler types before anything found deeper.

   **`$1B` IS DONE (W323).** The census is now **ELEVEN types over 32 records**. The order from
   here is **`$1A` (4 records) then `$81` (3)**, then `$49`/`$4A`/`$4B`, then `$47`, then the
   bundles, leaving `$4C` last.

   ### `$1A` IS BLOCKED ON REGISTER PROVENANCE -- DO NOT START THERE

   **W325 corrects W324's "it should be cheap".** Reading past the init body's opening found:

       268d7e  movem.w ($2,A6),D0-D1        D0 = X, D1 = Y
       268d84  addi.w #$B00,D0
       268d88  addi.w #$0,D1                a no-op add that is IN THE LISTING
       268d8c  jsr $24203E                  <-- THE BLOCKER
       268d92  bcc $268D98                  and it branches on the CARRY
       268d94  move.b ($1B,A6),D1           the carry arm: use the record's own angle

   `$24203E` is `aim.js`'s `core64` and it is **PURE**: `move.w #$1800,D4 / add.w D4,D0..D3`, self
   in D0/D1 and **target in D2/D3**. Type `$1A` never sets D2 or D3 -- D2 is a stage byte from
   `$268D4C` and D3 is untouched -- and `$263808` does not set them either (it reads `($12,A5)`,
   tests bits and writes `($2,A6)`).

   So the aimed angle depends on **whatever the enemy init dispatcher left in D2/D3**, and the
   `bcc` depends on a carry out of the core's own internal arithmetic. Both are answerable only by
   measuring the dispatcher's register state at `$268D8C`. **This is the same class of blocker as
   `$280252`, which W288 left pending "measuring A0 at `$28029A`", and it must be measured rather
   than guessed** -- an invented target would put every one of this type's shots in a plausible
   wrong direction, which no record count would show.

   The rest of `$1A` is read and recorded below; only the aim is blocked.

   The init body, for the wave that measures D2/D3 and then writes it:

       268d1e  move.w #$1,($4,A5) / rts            the init STUB, identical shape to $1B's
       268d26  lea ($268DFA,PC),A0 / jsr $2637A2 / move.l A0,($44,A5)
                                                   the SAME ($44,A5) table-advance idiom
       268d36  lea ($268DDC,PC),A0 / moveq #$E,D0 / jsr $26377A
                                                   15 words, the SAME count as $1B
       268d44  D0 = 4, D1 = 4, D2 = 2; `cmpi.w #$1,$813092 / bls` keeps them on stages 0 AND 1,
               and stage 2 on takes 3, 6, 1  <- THREE bytes here, and D1 is 6, NOT 0
       268d66  ($2A,A5) = D0 ; ($2B,A5) = D1 ; ($30,A6) = D2   -- different offsets from $1B's,
               and the third one lands on the SUB-RECORD (A6) rather than the record
       268d72  jsr $263808                         a JSR, not $1B's tail JMP: more follows it
       268d78  lea $272C7A,A0                      and $272C7A + $80 is ALREADY A WINDOW

   ### AND READ THE TYPE TABLE WITH BOTH BASES -- W325 GOT THIS WRONG AND LOST A WAVE

   There are TWO tables: **`$267824` for types `$00..$7F` and `$27E412` for `$80..$FF`**, indexed
   by `(t & $7F) * 8`. `tests/w314stage5scope.test.js typeEntry` is the correct form; copy it:

       const tab = t < 0x80 ? TYPE_LO : TYPE_HI;
       const off = (t & 0x7f) * SPAWN.TYPE_STRIDE;

   W325 copied the MASK and not the BASE (`0x267824 + (t & 0x7f) * 8`), so asking for `$81` got
   entry 1 of the low table and it translated **type `$01`** instead. The code it wrote is fine and
   is committed, but it is not one of stage 5's eleven and the census did not move.

   **The thing that caught it was the census refusing to move**, not the suite: 2334 tests went
   green and `enemy_types` rose 81 -> 82, while `w314stage5scope.test.js` still said ELEVEN types
   over 32 records. A wave that ports one of the eleven MUST move that number. If it does not,
   suspect the wave before the test -- `enemyHandlerMap` is built from the port's own
   `handlerMap()`, so it does see new registrations.

   Spans from the type table (correctly read): `$1A` $14E, the REAL `$81` at `$273F06`/`$274076`,
   `$49` $A2, `$4A` $B6, `$4B` $B6, `$47` $E2.

   Next, in order: **the real `$81`** (3 records), then `$49`/`$4A`/`$4B`, then `$47`, then the
   dependency bundles, leaving `$4C` last. `$1A` re-enters the queue once D2/D3 are measured.

   ### THE REAL `$81` (`$273F06`/`$274076`): ITS INIT BODY IS READ, AND IT IS CLEAN

   W325 read `$273F0E..$273FE2` completely. **Unlike `$1A` it is not blocked**: it aims through
   `$24200A`, which is `aim64FromCaller` -- the entry that does its OWN `targetSelect` and returns
   a real carry -- rather than `$1A`'s raw `$24203E` core with unset D2/D3. That difference is the
   whole reason this one is next and `$1A` is not.

       273f0e  lea ($274004,PC),A0 / jsr $2637A2 / move.l A0,($44,A5)
                                          the ($44,A5) advance idiom, as $1A/$1B/$9F
       273f1e  lea ($273FEE,PC),A0 / moveq #$A,D0 / jsr $26377A     D0+1 = ELEVEN words
       273f2c  jsr $263808                readInitPosition -- a jsr, more follows
       273f32  lea $272DFA,A2             **ALREADY INSIDE the $272D70 + $190 window**
       -- BLOCK 1 --
       273f38  movem.w ($2,A6),D0-D1 ; D0 += $5C0 ; D1 += $A40
       273f46  jsr $24200A                aim64FromCaller: self from the CALLER, target selected
       273f4c  bcc +4 ; else D1 = ($1B,A6)   NO live player -> fall back to the record's angle
       273f52  ($2B,A6) = D1 ; D1 &= $3E ; D1 += D1 ; ($26,A6) = (A2,D1.w)
       -- BLOCK 2, the same nine instructions with two constants and two offsets changed --
       273f62  movem.w ($2,A6),D0-D1 ; D0 += $5C0 ; D1 += -$A00   (`addi.w #$F600`)
       273f70  jsr $24200A ; bcc ; else D1 = ($1B,A6)
       273f7c  ($31,A6) = D1 ; D1 &= $3E ; D1 += D1 ; ($2C,A6) = (A2,D1.w)
       -- the rest --
       273f8c  D0 = $10, D1 = $8 ; `cmpi.w #$1,$813092 / bls` -- and **BOTH ARMS WRITE $10/$8**,
               so it is $10/$8 on every stage. Same shape W319 found in type $8E; transcribe the
               branch, not the constant, and say why
       273fa6  ($28,A5) = $10 ; ($29,A5) = $8
       273fae  ($1E,A5) -= $8130B0        a RANK adjustment, and it is a BYTE subtract on a word read
       273fb8  $813094 (stage index DOUBLED) indexes $273FE4:
               ($1D,A6) = byte[0] ; ($1C,A5) = byte[0] ; ($1D,A5) = byte[1]
               -- note ($1D,A6) and ($1C,A5) BOTH take byte 0: `move.b (A0),($1D,A6)` does not
               post-increment and the two `(A0)+` after it do
       273fd2  $81B414 = 1 ; $273FDA  $81B416 = 1

   **AND ITS STAGE ROWS ARE NOT ALL THE SAME**, unlike `$1A`'s and `$1B`'s. Read from the image:

       $273FE4:  11 0E  11 0E  11 0E  11 0E  0D 12
                 stages 0..3 identical, and **STAGE 5 (index 4) DIFFERS**

   So here the indexed read matters for real, and stage 5 is precisely the stage this type appears
   in. A port that folded the row to a constant would use the wrong pair in the only stage that
   spawns it.

   Data extents, all pinned by code: the stage rows `$273FE4 + $A`, the 11-word record prototype
   `$273FEE + $16`, and the sub prototype from `$274004` (SHORT form -- its first word is `A001`
   with bit 15 clear). The whole block runs `$273FE4..$274076` and ends at the handler, so **one
   window `(0x273FE4, 0x0092)`** covers it. Nothing in `$273xxx` currently reaches it: the nearest
   is `$2735F0 + $220`, which ends at `$273810`.

   #### AND ITS HANDLER'S STRUCTURE IS READ TOO -- `$274076..$274116`

   It is `$1B`'s shape, which is what makes it the right next wave:

       274076  jsr $2638A6                stepMovement
       27407c  an INLINE bounds test, TWO separate addi.w (#$E00 then #$7A00) with the branch on
               the SECOND -- the same idiom as $1B's #$C00/#$7800, and the same trap: folding
               them into one add tests a different quantity. NOTE it does NOT decrement $8130D8
               on the free path; that refcount is $1B's, not a family convention
       27408a  off screen and ($16,A5) set -> jmp $263762 ; $274098 on screen -> ($16,A5) = 1
       -- THE ARMOUR TIMER, and this type's one genuinely new mechanism --
       27409e  tst.w ($2A,A5) / bmi -> skip
       2740a4  ($18,A6) = $7FFF          HP PINNED AT MAX while the timer runs
       2740aa  D0 = 1 ; tst.w $811F72 / bpl ; else D0 = 2
       2740b6  ($2A,A5) -= D0            **the drain is DOUBLE while $811F72 is negative**
       2740ba  on the borrow, ($18,A6) = $2600   the real HP once the armour is gone
       -- the damage arm --
       2740c2  `damageArm5C` with hpFull **$980**, base ($1C,A5), xor ($1D,A5) -- see the table
               above that routine: this is its THIRD member and it shares $1B's field offsets
       274102  bmi $27449C               the death arm
       274106  ($1D,A6) = D0 ; jsr $28AC72 (`spawnCues28AC72`)
       274110  tst.L $8130D2 / bne $27432C   the LONGWORD freeze -> straight to the draw

   **`$811F72` is the BEAM word.** `spark.js` already reads `$811F73` bit 7 (`ram.btst8(0x811f73, 7)`)
   to pick the pool half, so this is the same word tested as a sign. Meaning: **the laser strips
   this type's armour twice as fast as shots do**, which is a real gameplay behaviour and the kind
   of thing worth a test rather than a comment.

   #### AND ITS STATE MACHINE, TO STATE 2 -- ANOTHER MEMBER OF THE `$45`/`$1B` RAMP FAMILY

   The state word is **`($38,A6)`**, on the SUB-RECORD, where `$1B` uses `($18,A5)` on the record.
   Read it as a word and write it as a word, as everywhere else in this family.

       27411a  cmpi.w #$1000,($2,A6) / blt $274286     below the fire X -> just draw
       274124  move.w ($38,A6),D0 / bne                the dispatch
       -- STATE 0 --
       27412a  ($1E,A5) cadence ; on borrow ($1E,A5) = ($28,A5) -- the $10 the init body wrote --
               and ($38,A6) = 1                                                     -> state 1
       -- STATE 1, the RAMP UP --
       274148  ($3A,A6)/($3B,A6) cadence
       274156  ($36,A6) += 4 ; indexes $27460A -> ($32,A6) ; at index $14 -> ($38,A6) = 2
               **SIX entries** (0,4,8,$C,$10,$14), where $1B's ramp has eight and clamps at $1C
       -- STATE 2, and it does NOT ramp to a clamp: it LOOPS --
       274184  ($3A,A6)/($3B,A6) cadence
       274190  ($36,A6) += 4 ; **if it reaches $18 it is reset to $10**, so the animation
               oscillates over the last two entries instead of stopping. That wrap is the
               difference from $1B's state 3, which walks back DOWN to zero
       2741a2  ($36,A6) indexes the table again ...

   So this is a fourth member of the `$45`/`$1B` ramp family (delay, ramp up, act) with a LOOPING
   tail rather than a ramp-down one. Worth noting for the shared-driver question W323 raised: the
   members now differ in the state field, the table, the entry count AND the tail behaviour, which
   argues for keeping them as separate transcriptions a while longer.

   #### STATE 2's FIRE ARM IS COMPLETE, AND IT SETTLES THE `$1A` QUESTION

       2741a2  ($36,A6) indexes $27460A -> ($32,A6)      the sprite, every frame
       2741b2  ($1E,A5) cadence ; on borrow reload from ($28,A5)
       2741c0  lea $8103E6,A0 / lea $810448,A1 / tst.b ($3,A5) / exg A0,A1
               **the SAME "pick the nearer live player" idiom `handler8E` uses** (W319's
               $27655C..$276578): `($3,A5)` decides which is TRIED first
       2741d4  tst.w (A0) / bmi -> use it ; else tst.w (A1) / bpl -> NOBODY ALIVE, skip to $27423C
               ; else exg and use the second. A negative status word is a LIVE player
       2741e2  movem.w ($2,A0),D2-D3     **the TARGET, out of the selected player's record**
       2741e8  movem.w ($2,A6),D0-D1     self ; D0 += -$880
       2741f2  jsr $2422A2               `aim256` -- the PURE core, and D2/D3 ARE SET
       2741f8  D6 = D1                   the aimed direction, saved
       2741fa  D2 = ($2,A6) ; D3 = $F7800380 ; D4 = 0 ; D0 = $FFFD0005
       27420c  D1 += $A  ; jsr $281764   FIRE
       274216  D1 -= $14 ; jsr $281764   FIRE again -- net -$A the other side of the aim
       274220  D3 = $F780FC80            a SECOND muzzle, and the pair repeats

   So it is a symmetric pair off the aim from each of two muzzles. `$281764` is already driven by
   `boss3.js` through `shoot(...)`, and `$2422A2` is `aim.js`'s `aim256`. Nothing new needed.

   **AND THIS IS THE CONTRAST THAT MAKES `$1A`'s BLOCKER REAL.** Both types call a PURE aim core.
   `$81` sets D2/D3 from the selected player's record immediately before the call, three
   instructions away. `$1A` calls `$24203E` with D2/D3 never set at all -- D2 holds a stage byte and
   D3 is untouched. So the anomaly is `$1A`'s and not a convention this family shares, which is
   worth knowing before someone assumes the dispatcher must be pre-loading them: the sibling that
   does the same thing properly is right here.

   #### THE VOLLEY TAIL AND STATE 3: THE CYCLE CLOSES, 0 -> 1 -> 2 -> 3 -> 0

       -- after the four shots, and ALSO the arm reached when nobody is alive ($27423C) --
       27423c  ($20,A5) volley counter ; on borrow reload from ($21,A5)
       274248  D0 = $40 - $8130B6 ; ($1E,A5) = D0
               **the RANK-shortened cadence**, the same idiom as $8E's `$276602 move.w #$40,D0 /
               sub.w $8130BA,D0` -- a different rank byte, the same construction
       274256  ($38,A6) = 3                                                          -> state 3
       -- STATE 3, the RAMP DOWN --
       27425e  ($3A,A6)/($3B,A6) cadence
       27426a  ($36,A6) -= 4 ; **on the BORROW `clr.w ($38,A6)`**                     -> state 0
       274276  otherwise index $27460A again and carry on down

   So the machine is a closed four-state cycle: delay, ramp up to `$14`, loop `$10..$14` while
   firing rank-paced volleys, ramp down, repeat. `$1B`'s is the same four states with a ramp-down
   that walks to zero; `$45`'s is the same again on a different field. **Four members now**, and
   they differ in the state field, the table, the entry count, the tail and the cadence source --
   which is the argument for four transcriptions rather than one driver, recorded so the question
   does not get reopened from scratch.

   **`$274286` IS NOT THE DRAW.** It is a further cadence -- `subq.b #1,($26,A5) / bcc $27432C`,
   reloading from `($27,A5)` -- and `$27432C` is where the draw actually begins. So there is one
   more animation/behaviour block at `$274292..$27432C` between the state machine and the emit.

   #### THE PRE-DRAW BLOCK AND THE DEATH ARM -- THE MAP IS COMPLETE

       -- $274294, the SPRITE-FACING update, and it is $8E's shape again --
       274294  move.b ($24,A5),D0 / cmp.b ($25,A5),D0 / bne $27432C
               a two-byte EQUALITY gate before the work, exactly as $8E's
               `$276552 cmp.b ($1C,A5),($1D,A5) / bne` gates its own facing update
       2742a0  lea $8103E6,A0 ... the player-select idiom a SECOND time in this handler
       -- $27449C, the DEATH ARM --
       27449c  move.l #$271,D0 / jsr $28615E     `scoreKill` -- note a move.l, not a moveq
       2744a8  jsr $28C2DC                       a KNOWN cue: `ctx.soundPost?.(0x28c2dc)`,
                                                 already used at handlers.js:2828 ("BGM id=5,
                                                 death burst") and in boss4.js
       2744ae  moveq #$D,D0 / jsr $289004        the canonical family shape, kind $D
       2744b6  ($2,A0) = ($2,A6) ; ($1E,A0) = $10 ; ... the SEVEN writes, as $1B's death arm

   **So the whole handler is mapped and it needs NOT ONE NEW PRIMITIVE.** Everything it calls is in
   the port: `stepMovement`, the inline bounds idiom, `damageArm5C` (as its third caller),
   `spawnCues28AC72`, `aim256`, `$281764` via `shoot`, the player-select idiom (twice),
   `scoreKill`, `soundPost(0x28C2DC)`, `spawnEffect` at kind `$D`, and `enqueue*ThroughStub`.

   Constants to carry in: `killScore` **`$271`** (a `move.l`), `deathCue` `$28C2DC`, `hpFull`
   `$980`, armour HP `$7FFF` and post-armour HP `$2600`, the fire gate X `$1000`, the ramp clamp
   `$14` with the wrap `$18 -> $10`, the aim bias `-$880`, the muzzles `$F7800380` and `$F780FC80`,
   the spread `+$A` then `-$14`, `D0 = $FFFD0005`, and the rank cadence `$40 - $8130B6`.

   Windows: **`(0x273FE4, 0x0092)`** and **`(0x27460A, 0x0018)`**, both bounded by code.

   #### THE DRAW, `$27432C` -- AND THE MAP IS NOW 100 PERCENT

       27432c  jsr $23D852               the RECORD-convention emitter, **bucket 7** -- the
                                         damage-first family's own, which W80 resolved out of the
                                         cartridge (`$23D852 41F9 00807450 / D0F9 0080AFC8`)
       274332  D1 = ($2,A6) with -$500 on one half and -$C00 on the other, applied around a `swap`
       274342  D2 = ($32,A6)             the ramped sprite the state machine installed
       274346  D3 = $428 ; D4 = ($1C,A6)
       27434e  jsr $23DF86               the REGISTER-convention emitter, **also bucket 7** (arm A;
                                         `handlers.test.js` names it `EMIT_A`)
       274354  D1 = ($2,A6) ...          and a second register emit follows

   So the draw drives ONE bucket through BOTH conventions, the same structure `$1B`'s draw has with
   bucket 3. Both stubs are already in the port.

   **NOTHING IS UNREAD. THIS TYPE IS READY TO WRITE, BOTH HALVES IN ONE WAVE.**

   #### AND WRITE BOTH HALVES TOGETHER -- W326 STARTED THE INIT BODY AND REVERTED IT

   W326 wrote and verified the init body (`BODY.set(0x273f0e, ...)`, bodies 75 -> 76, module loads
   clean) and then **reverted it**, because registering an init body whose handler is not yet
   registered is the W322 mistake: `$81` HAS three records in stage 5's script, so the body would
   run and the handler lookup at `$274076` would then fail. Type `$01` was safe to land alone only
   because no script spawns it.

   The init body's transcription, for the wave that lands both, since it was written once already:

   * `loadSubProto(0x274004)` with the advanced pointer into `($44,A5)`;
     `loadRecordProto(0x273fee, 0x0a)` = 11 words; `readInitPosition` (a JSR).
   * The two aim blocks as a two-row table -- `{biasY: $5C0, biasX: $A40, angleOff: $2B,
     longOff: $26}` and `{biasY: $5C0, biasX: -$A00, angleOff: $31, longOff: $2C}` -- each
     `aim64FromCaller`, and **on carry the angle is `($1B,A6)`, a VALUE fallback and not a branch
     around the work**. The table index is `(d1 & $3E) * 2` into `$272DFA`.
   * `($28,A5) = $10`, `($29,A5) = $8` (both stage arms agree), the byte-subtract rank adjustment
     `($1E,A5) -= $8130B0`, then the stage row where `($1D,A6)` and `($1C,A5)` BOTH take byte 0.
   * `$81B414 = 1` and `$81B416 = 1`.
   * An `AimTables` WeakMap keyed on the ROM, as this file's other five per-type maps do.

   #### THE RAMP TABLE'S EXTENT IS PINNED BY CODE, AND IT EXPLAINS THE WRAP

   Read from the image at `$27460A`:

       [00] $001732E0   [04] $00173334   [08] $00173388   [0C] $001733DC
       [10] $00173430   [14] $00173484   [18] $3B7C0001   <- CODE, `move.w #$1,...`

   Six `$0017xxxx` sprite descriptors ascending by exactly `$54`, and then **index `$18` is an
   INSTRUCTION**. So state 2's `cmpi.w #$18 / move.w #$10` wrap is not a stylistic choice: it is
   what stops the ROM indexing into its own code, and the table is exactly six longwords with its
   far end bounded by code rather than by a count.

   That also settles the window: **`(0x27460A, 0x0018)`**, plus **`(0x273FE4, 0x0092)`** for the
   prototypes and stage rows. Two windows, both extents pinned by code on the far side.

   A port that ramped one entry further would emit an address built from `$3B7C0001` -- so this is
   a case where the guard IS the semantics, and it needs the `unreached` treatment if the index can
   ever arrive out of range.

   ### W322 CLAIMED `$1B` WAS BLOCKED ON `$24226E`. IT IS NOT, AND THE WAY THAT ERROR HAPPENED IS
   ### THE MOST REUSABLE THING IN THIS SECTION

   W322 read `$2694DA jsr $24226E` in `$1B`'s state-2 fire arm, searched for it, found it only in
   `aim.js`'s `AIM_REFS` reference-count map, and concluded it was unported. **It is ported**, as
   `aim256FromCaller`, whose docstring is literally `` `$24226E` -- aim256 at the record's target,
   self from the CALLER. 48 sites. ``

   The search that produced the wrong answer was `grep 24226e src/*.js` with the `AIM_REFS` line
   filtered out. It missed the implementation because **`AIM_REFS` spells the address `0x24226e` in
   lowercase while every docstring spells it `$24226E` in uppercase.** Filtering out the one hit
   removed the only lowercase occurrence and left the real one invisible to that pattern.

   This repo already had the rule written down -- "`grep 0x2xxxxx` is NOT a test for 'is this
   ported'; this project names routines after their addresses and cites them as `$2xxxxx` in prose"
   -- and W322 quoted W318 for it in the same breath as getting it wrong. So:

   **To decide whether `$2xxxxxx` is ported, grep CASE-INSENSITIVELY for the bare hex digits and
   read every hit, including comments and docstrings.** `grep -ri "24226e"` finds it. Never filter
   hits out of that search before reading them: in this repo the prose IS where the answer lives.

   `git log -S` on the address and a look at the owning module's export list are the two
   confirmations worth adding when the answer matters.

   **Add a type's ROM windows in the SAME wave as its code, never ahead of it.** W321 established
   why: windows change `player.tables.json`, which changes the asset bytes, which repacks the sprite
   shards, which moves the web gate's shard-filtered record counts. Windows for code that is not
   there can turn the gate red for nothing.

   **`$B0` is NOT in this queue.** It is the head of boss reconnaissance; see HIBACHI CLOSURE RULE
   above.

1b. **THE NAME-ENTRY CHARACTER GRID** -- superseded by W307/W311 except for the two panel draws,
   which are gated on `$23E45A`. Kept below for the emitter's description:
   - `$28FCAA..$28FD2A` -- the cursor/grid draw. Straight-line `jsr $23DECE` calls built from
     immediates, the same shape as `$25B4D6` which W303 ported, so it is a transcription and not
     a puzzle. Gated on `($2E,A4)` being non-zero at `$28F4C4`.
   - `$28FD2C` and `$28FD6E` -- two entry points sharing a tail that ends at `$28FE0E`, and they
     differ only in the first immediate (`$4E800C80` vs `$4E802B80`). Called from
     `$28F4E0`/`$28F4EE`, and only when **exactly one** side owes a name: `cmpi.b #$3,D0 / beq`
     skips both when both sides do.
   - `$28F4A6` sets `($2E,A4) = 1` and `$81E0D6 = 1`, then `jsr $246410` with `$28FA98`. That
     call is the anim driver `stageend.js` declares out of scope, so **count it, do not invent
     it** -- `PRESENTATION_DEVIATION[0x28d6fc]` is the precedent.
   - `$28F664 add.w D1,D1 / move.l D0,(A0,D1.w)` is the per-character commit, and `($16,A4)` is
     the count W306's filter gates on. `$81E0D6` is tested by both arms at `$28F442`/`$28F49C`.

   Do NOT go looking for a reader of `($C,A4)`: `$81B42C`/`$81B43C` have zero absolute
   references and W302 lost a search there. The row is found by its tag.

1b. **PUBLISH, then ask the owner to look again at D16 and D17.** This is the cheapest
   next move for the docket and it is D19's whole point. **It is outward-facing and D18 does
   not cover it** ("`git push` is not `tools/publish.mjs`"), so it needs the owner's
   go-ahead; every wave so far has raised it and left it unrun.

   W285 settled D17's mechanism with one measurement: drive `$276744`'s two death
   conditions on a live type-`$8A` carrier mid-run and the reserved ten goes 0 -> 1 the
   next frame. **The medal appears.** So the chain is complete on `main`, and the reason
   it was never seen is that no scenario in the tree kills a carrier.

   Six docket items have been closed since the last deploy and THREE of them turned out
   to be things that already worked. So:

       node games/ddpdoj/tools/export-web.mjs      # FIRST -- this session added windows
       node tools/publish.mjs

   **`export-web.mjs` before `publish.mjs`, always** -- a wave that adds ROM windows and
   publishes without regenerating serves a stale bundle. `publish.mjs` gates on the
   Batman suite being ALL GREEN with 0 skipped, builds `dist/`, deploys, and then
   CONFIRMS the build id landed on several consecutive polls.
2. **MEASURE A0 AT `$28029A`, then port `$280252`.** W288 read the whole body and
   **backed a finished transcription out** rather than ship it, for one reason:

       242290: bsr $24270A              the target select -- SETS A0
       242294: bcs $242264
       242296: movem.w ($2,A0),D2-D3    <- the entry point these bodies use

   Eight sites enter `$242296` directly, skipping the `bsr` that sets A0, and all eight
   are in this family (indices 8..11). But `$27F990 movea.l (A0),A0 / jsr (A0)` leaves
   **A0 = the body's own address**, and nothing on the not-collected path changes it --
   so taken literally the pickup would chase coordinates made of its own opcodes.

   Three possibilities, all testable and only one true: the driver differs from that
   reading; something between `$27F992` and `$28029A` sets A0; or the family really does
   read its own code. **The oracle can answer this and reasoning cannot** -- `w69`'s
   ladders carry full RAM but not registers, so it wants a register capture at a
   breakpoint.

   Two things W288 established that survive regardless: `($24,A6)` is the player record
   W287's finish family writes (the body frees itself when that player's bit 15 goes, so
   the two waves confirm each other), and the draw gate has **two different** exemptions
   from the half rate -- a quiet pool draws everything, and a busy pool still draws a
   pickup within `$600` of its OWNER, so the sprite about to be collected keeps full
   frame rate.
3. **`$280BCE`'s finish routines**, or enough of them to drive a run past frame 6482.
   A long census run from the laser-hold rung throws `Unreached $280BCE` there --
   seventeen of its twenty finish routines are unported, already docketed under D3's
   neighbourhood -- and **that is what stands between the port and observing the whole
   item chain through to a boss part death.**
3. **D17 background, kept for the next reader.** The tally IS reachable (`$8130F9` bit 2 has a writer
   at `src/stageend.js:735`), so the gap is upstream: the medal item, its spawn, or its
   art. `src/bee.js` (W111) says "the medal IS the bee"; `src/hud.js` (W124) has the
   accumulator and the tier drain. Sweep what the medal pool emits during play.
4. **`$25DEAE` AND `$25E0EA`**, the last of state 1 of object `[11]`, then wire state 1
   up and delete its note. W277 landed `$25FF38`/`$25D9E6`/`$25DA60` and W278 landed
   `$25DAEA`, `$25DFF6` and the input read `$23D186`/`$23D18E` -- all in
   `src/tallyscreen.js`.
   - `$25DEAE` is fully read EXCEPT its draw tail from `$25DF4C` (which loads
     `D1 = $5BC00000` for side 0 and `$5BC02600` for side 1). `$28C6FA` and `$28C6E0`
     are sounds and stay counted. **Its tail at `$25DF48 bra $25DB7C` is how the screen
     enters the tally**, and NOTHING ever writes `($2,A5) = 2` -- that branch skips the
     dispatcher, which is why `screenState2_25DB7C` is exported separately. Do not
     "fix" the dispatcher to set the state byte.
   - `$25E0EA` is `lea ($25E006,PC),A0 / bra $25E200`, and `$25E006` is a run of `$20`
     bytes -- ASCII SPACES -- so it is a text blit. Needs that text's extent measured
     and `$25E200` read.

   State 1 also installs a palette from `$225978`: run
   `node tools/export-web.mjs --extent 0x225978` first. The state-1 note in
   `tallyScreen25DBB4` names all six and is now five names too long -- trim it.
5. **THE NINE BONUS LINES AT `$25FF52`** -- the score tally's actual arithmetic, and
   the largest single thing left in that subsystem. **The table is already windowed**
   (`$25FF52+$28`, W279, far end pinned by `$25FF7A`'s own `lea $8130FA,A6`): TEN
   longwords, entry 0 null and guarded by `$25FF84 cmpi.w #$0,D0 / beq`, then
   `$25FFA8`, `$260056`, `$26010E`, `$2601F4`, `$2602B6`, `$260348`, `$26035A`,
   `$26037C`, `$2603B0` -- **NINE lines, not the eight worklog 270 counted.**
   `$25FF7A` is the per-frame driver: it walks BOTH records at stride `$24` with
   `moveq #$1,D7 / dbra`, and `$25FF92` is the only reader of the table. Until these
   land the tally RUNS and its rows PAINT but the figures are not the cartridge's.
6. **The menu cursor, `$25DD0C`.** `btst #$2,D0` decrements `($e,A5)` and `btst #$3,D0`
   increments it, each with `move.b #$1,($d,A5)` and a `$28C6FA` sound, and
   `andi.b #$1,($e,A5)` keeps it to two entries. **D0 comes from `($8,A4)`** -- one of
   the descriptor's three code pointers (`$23D186` for side 0, `$23D18E` for side 1) --
   so that routine is the input read and has to land first. W276's window
   `$25D952+$3E` already covers both descriptors.
7. **The four other announcement-poster caller regions** -- `$25CDxx`, `$25D5xx`,
   `$2601xx`, `$288A02` -- which share the protocol W270 landed.
8. **WHAT ADVANCES `($14,A6)` THROUGH `$255B7C`.** W275 ported the walker and shipped
   all 49 of its descriptors, but only entries 0..5 of the 39-entry pointer table are
   KNOWN to be reached, because only `$24A120`'s write of `$255B7C` is transcribed.
   The port already walks entry 1 during a real death, so **the advance exists and is
   being done by code this port runs without a name for it.** Find the writer and the
   other 32 frames get their trigger. `rosetta.py codexref 255B7C` is the way in, and
   the art is already in the bundle so the fix is code-only.

### A rule this session paid for twice

Two claims went in wrong and both were ABSENCES: "nothing sets this bit" (W272) and
"nothing calls this block" (W273's diagnosis). Each came from a scan whose base or
range was not checked against the instrument that already existed.

**`tools/rosetta.py codexref <addr>` is the instrument.** It handles all six
encodings that carry a code address, including `jsr (d16,PC)`, and has since it was
written. `tools/hard/absxref.py` is NOT a caller xref -- it histograms operands
landing in MAIN RAM, so it cannot see a reference to a ROM block at all.

**The image `rip/sound/maincpu.bin` is OFFSET-ADDRESSED: file offset IS the 68000
address.** Build B is `$200000..$2B0000`. W272 scanned it with a base of `$200000`
and read the wrong bytes. When a hand-rolled scan returns zero, first check it finds
something you already know is there -- `u16($2600D8) == $48E7` is that habit written
down, and `tests/w274paletteset.test.js` now runs the whole audit every suite pass.
9. **The rest of D11's transition presentation.** `$28C186` the exit handshake and
   `$28D6FC` the animation chain. `$28D77C` writes palette RAM the port does not
   model and the four `$25FD38` resets are W62's scope line, so those two stay
   counted. Force `$242952` headlessly and read the counted gaps -- that measurement
   is what scoped W232 and it is still the right way in. The remainder is the
   animation-object EXECUTION ENGINE, the per-frame machine that walks the `$810346`
   chain and decrements each node's `$18`; the way in is the node code pointers at
   `$24627A`, NOT the chain root `$810346`, whose six references are all loaders or
   the clear. `$28C186` is a BGM command and correctly a counted sound gap.
10. **Stage 5, then the loops.** Nothing blocks this any more: the Stage-4 boss is
   complete for every reachable path and the docket is down to one item. Five
   loop-specific rules are translated so far; see the loop-2 bullet above.

## Comment drift found and deliberately not fixed

`src/type5.js`'s header still says `$24C096` is "ONE OF THE 22 THIS FILE COUNTS AND
DOES NOT RUN" and that the port throws on the fourth consecutive held-fire frame.
`src/options.js` ports that object and W272 measured the ramp running and landing on
the board's own value. Comment only, no behaviour. Fix it in a wave that touches
`type5.js` for another reason.

D8, D10 and D12 are presentation or documentation and can be slotted in between.

## Verification commands

- One slice: `node --test games/ddpdoj/tests/<the focused file>.test.js`
- Full suite: `node --test games/ddpdoj/tests/` -- currently 1806/1806, green.
  Keep it that way: W229 had to close five censuses that had been red since the
  Stage-4 waves, and while they were red they could not catch anything. Do not
  pipe the run through `tail`; that discards the failure detail.
- The sprite question: `node games/ddpdoj/tools/w230descriptorsweep.mjs`, which
  reports every descriptor the port draws that the bundle cannot resolve, plus the
  display-list drops and the counted gaps. Currently zero missing.
- After any change to `tools/export-tables.py`, run `python export-tables.py`,
  and run `node export-web.mjs` before any publish so the site does not serve
  stale assets.

## Timing and fidelity traps already resolved

Stage-4 boss (W224), all proved by `w224stage4boss.test.js`:

- F1 INIT falls through into STEP and spends its initial word timer tick, so
  state 0 fires on the following boss pass.
- F1's state checks are sequential, so a promoted state spends its newly written
  timer in the same call.
- `$2596C6` walks A4 before A0 before A1 before A3, and A2 last. So F1 starts
  MAIN2 in the same walk, MAIN3 starts D0 in the same walk, and MAIN3's A4 id5
  would begin on the following pass.
- D0 INIT falls through, changing timer `$0202` to byte 1 on its first call while
  object 6 draws cursor row 0 in that same pass. It then advances `+$106` by 4
  every third call and terminates on exact equality with `$003C`.
- The Stage-4 boss linked main-hit damage aggregation uses the maximum damage
  delta, not the sum or minimum.

Stage-4 boss second phase (W246..W252):

- **EVERY INIT IN THIS BOSS FALLS THROUGH INTO ITS STEP.** F5, MAIN4, MAIN7, all six
  A3 ramps, and A1 6, 7, 8, 9 and 10 -- checked one by one against the image, not
  assumed. Worklog 244's spec claimed F5's did not, and it does.
- **The old-zero borrow caught a prediction in four separate waves.** `subq.b #1 / bcc`
  reloads on the frame the counter was ALREADY zero. So a reload value of 1 fires every
  SECOND frame (a ramp of n steps takes 2n-1 frames, W247), a counter arriving at `$40`
  is `$41` frames from firing (W250, W252), and a counter arriving at zero fires
  immediately (W246's arm 6). Predict the frame number in the test; it is what finds
  this.
- **F5's arms all re-read `$2(a4)`**, so an arm that hands its bit on lets the next arm
  run on the SAME frame. Its latch writes `$4(a4)` and `$C(a4)` as `$10` and the frame
  ends with both at `$0F`.
- **Word literals that are really two byte fields**: `$10(a4)`/`$11(a4)` and
  `$14(a4)`/`$15(a4)` in F5 and A1 8, and A1 10's `$8(a4)` which is a BYTE counter in
  its state 0 and a WORD counter in its state 1.
- **This boss is full of vestigial writes and they must be kept.** A1 8 accumulates two
  angles, reads them into D1, and overwrites D1 with a constant on the next instruction;
  it also loads D7 from a field the shot template overwrites. A1 9's INIT clobbers the
  0/1 side selector F5's arm 6 writes into `$6(a4)`. The stored bytes are observable even
  when the values are not.
- **Limits are PINNED, not compared for equality.** The A3 ramps and MAIN7's speed floor
  both overshoot and then get written back to the limit; an `=== limit` test leaves
  `$FFFE` in an animation cursor.
- **A1 9's rendezvous is a closed loop through the child's parent pointer.** `$19E(a6)`
  is incremented at `$2A3D5A` through `movea.l $1c(a5),a0`, so a scan for `(d16,A6)`
  finds only two sites and supports the WRONG conclusion. Scan `(d16,An)` for every An.

- **Type `$42` cannot be killed by damage**, and the port throws by address if it
  ever is. `$2A3B82` restores `$18(A6)` to `$7FFF` unconditionally two instructions
  before `$2A3B96` tests it. Its children die by ARRIVING, which is also how they
  count themselves back to A1 9 through the parent pointer in `$1C(A5)`.
- **A branch target can be 470 bytes behind the branch.** `$2A3DD4 bgt $2A3C1C` is a
  FREE, not a clamp, and reads as a clamp unless the target is resolved.

- **`POOL_B.base` IS `0x81b732`**, the address every boss4 test uses for A6. It has
  never mattered because none of them spawned pool-B effects; the moment one does,
  the pool scribbles over the sub-record under test. Use an address in the
  sub-record pool's own range instead (`w263lowhp.test.js` does).
- **The old-zero borrow corrected a frame-count prediction in SIX of W246..W263's
  waves.** `subq.b #1 / bcc` reloads on the frame the counter was ALREADY zero. And
  watch which byte of a word literal the counter lives in: `move.w #$20,$4(a4)`
  puts the ZERO in `$4` and the period in `$5`, so that one fires immediately.
- **An out-of-range table read is NOT always a loud throw.** MAIN8's cursor bound is
  a compare rather than a mask, and `$29FB3A + $20` is the first byte of an
  already-exported window, so approximating it would silently read unrelated data.

Elsewhere:

- `src/rom.js` serves a read only from a window that contains it WHOLE, so a
  table crossing a seam between two adjacent windows still throws. W226's
  `$24BB9A` pair is the worked example.
- The hyper item body uses `movem.w ($1a,A6),D0-D1`, two words at `$1A` and
  `$1C`, not the byte speed/angle convention the `I.speed`/`I.angle` names carry.

- NEVER edit source with `sed -i` over a glob, or with a Python script that writes
  in text mode, on this machine: both rewrite whole files as CRLF. Two tests read
  the shipped source AS TEXT (`fire.test.js` splits `options.js` on `
}
`, four
  exporter-assertion tests match `def build(...) -> dict:
\s*check_...`) and go
  red for that reason alone, and a `sed -i` over `tests/*.js` churns every file it
  touches. Write bytes, with LF.

## Protected and generated files

Do not touch, delete, stage, or commit these user-owned/untracked files:

- `NUL`
- `.scratch-*`
- `games/ddpdoj/tools/oracle/c1_gates.py`
- `games/ddpdoj/tools/oracle/c1_mailbox.py`
- `games/ddpdoj/tools/oracle/c1_scan.py`

Do not commit generated rip/assets. Rebuild them locally when needed, but stage
only authored source/exporter/test/worklog files. Never use `git add -A`.

## Worklog numbering

Live numbers: **263 is the highest and is COMPLETE**. 253 is a SPEC that W254/W255
implemented, and 225 is SUPERSEDED by 244; every other number through 263 is
COMPLETE. Reserve the
next number by creating `<N>-RESERVED.md`, then rename it immediately to the real
`IN PROGRESS` worklog as `AGENTS.md` requires. Numbers are never reused.

### `$4A` AND `$4B`: NEAR-CLONES OF `$49` THAT DIVERGE ON THE ONE FIELD THAT MATTERS (W336 recon)

    type $4A    init $2719AE   initBody $2719B6   handler $271A64
    type $4B    init $271C92   initBody $271C9A   handler $271D48

`$4A`'s init body, read in full:

    2719ae  move.w #$1,($4,A5) / rts        TWO sub-records, where $49 declares ONE
    2719b6  loadSubProto($271A2C)
    2719c2  loadRecordProto($271A1A, 8)     D0+1 = NINE words, where $49 takes seven
    2719d0  readInitPosition
    2719d6  cmpi.w #$2B6,$8130CE / bne      the same equality idiom, a DIFFERENT frame ($1F3 for $49)
    2719e2  move.b #$40,($1C,A6) / move.b #$1,($17,A5)
    2719ee  move.w #$1,$81B414 / move.w #$1,$81B416    the same bullet-budget opt-in (W336)
    2719fe  move.b ($18,A5),($1D,A6)
    271a04  jsr $242EC2 / move.b D0,($20,A5)
    271a0e  jsr $242EC2 / move.b D0,($21,A5)
    271a18  rts

**`($20,A5)` IS TWO RNG BYTES HERE, NOT A POINTER.** In `$49` that same field holds the ADDRESS of a
formation flag and both of its exits clear the flag through it. `$4A` calls `drawWord242EC2` twice and
stores a byte from each into `($20,A5)` and `($21,A5)`, and has no formation flag at all. **Porting
`$4A` by copying `$49` would dereference two random bytes as an address.** This is the W315 finding
again in a sharper form: the band shares idioms and diverges in its fields, so every field must be
re-read even when the surrounding code is identical.

**THE OVERLAP TRAP IS HERE TOO AND IT IS EIGHT BYTES DEEP.** `($4,A5) = 1` means TWO `$20`-byte sub
records, so `$271A2C + $40 = $271A6C` while the handler starts at `$271A64`. Its window must be
declared `$271A1A + $52` (`$271A1A..$271A6B`, record proto + both sub records) and must not be trimmed
to the handler. `$49`'s was four bytes; do not assume the depth.

**`$271A6C` IS A DESPAWN TRIGGER, NOT THE OFF-SCREEN TEST -- `$4A` HAS BOTH.**

    271a6c  cmpi.w #$2800,($2,A6) / bgt $271A7E     a POSITION TRIGGER
    271a76  tst.b ($16,A5) / bne $271AB4            ... into the DEATH sequence
    271a7e  moveq #$5C,D1 / and.b (A6),D1 / beq $271AD2    the $5C mask, SIXTH member
    271ad8  moveq #$0,D0 / move.w ($2,A6),D0 / ext.l / addi.l #$4000    <-- and $49's LONG test IS here

An earlier version of this section called `$271A6C` a third spelling of the off-screen test. **That is
wrong and is corrected here:** `$4A` carries `$49`'s signed-long test verbatim at `$271AD8` as well.
`$271A6C` is a separate check that retires the record once it reaches `$2800` with `($16,A5)` set. Two
different tests, not one test spelled differently -- so the count of bounds idioms stays at two
(`addi.w` pairs for `$1B`/`$81`, signed long for `$49`/`$4A`).

**THE REAL FINDING: `$4A` DOES NOT FREE ITSELF WHEN IT DIES.**

    271aa8  move.l #$180,D0 / jsr $28615E       scoreKill -- $180, where $49 pays $250
    271ab4  move.w #$8000,(A6)                  <-- the record MARKS itself
    271ab8  D2 = ($2,A6) ; lea ($271C30,PC),A1 ; jsr $270D92    its OWN list, not $27197C
    271ac6  jsr $28C2DC
    271acc  move.b #$1,($3F,A6)
    271ad2  move.b ($18,A5),($1D,A6)            <-- FALLS THROUGH into the alive path

There is **no `jmp $263762`**. Where `$49`'s death arm ends in `freeEnemy`, `$4A` sets `(A6)` to
`$8000` and `($3F,A6)` to 1 and **keeps running the alive path in the same frame**. So the record
survives its own death as a marked, still-drawing object, and something else retires it later.

That also means `$271AB4` is shared by BOTH exits: the `bne` at `$271A7A` jumps straight into it, so
reaching `$2800` runs the same spawn walk, sound and marking as being shot does. A port that wrote
`$4A`'s death as `$49`'s -- score, walk, free -- would delete a live record and lose whatever `$8000`
and `($3F,A6)` are for.

**AND IT IS NOT BLOCKED -- THE PORT ALREADY HAS THIS EXACT SHAPE.** I first wrote that `$4A` needed a
measurement naming whoever reads `(A6) == $8000`. That was wrong, and it was wrong by skipping the one
check this project has a standing rule about: look for the family before declaring a mechanism new.

`death37` (`handlers.js`, type `$37`) is the same pattern instruction for instruction:

    scoreKill(...)                      $2647F4
    ram.setU16(a6, 0x8000)              the record marks itself
    ram.setU8(a5 + R.rec1E, 1)          the marker byte
    ... effects, spawns, soundPost ...
    ram.setU8(a5 + R.rec1B, ...)        `$26483C fall-through` -- and the port SAYS fall-through

So mark-and-fall-through is an established member shape with a working port, and `$4A` is another
member of it. `$8000` in the first word is what the collision walk at `$2456C6` (`tst.w (A6)+ / bpl`,
already ported in `bomb.js`) reads to skip the record as a target, so the object stops being shootable
while it keeps drawing. `($3F,A6)` is the per-part dead flag `bossf23.js` and `bossphase.js` already
read as `($3F,A6) + ($7F,A6) == 2`.

**So `$4A` can be written now**, with `death49`'s score/walk/sound replaced by `death37`'s
mark-and-continue and no `freeEnemy`. What still needs reading is only `$271AE0` onward: its alive
path, fire arm and draw, plus whether `($20,A5)`/`($21,A5)` feed cadence or aim.

`$4B` is not yet read past its table entry, and is expected to share both the overlap trap and the
mark-and-fall-through death.

### `$4A`'s ALIVE PATH AND FIRE ARM, `$271AD8..$271B42` (W336 recon, continued)

    271ad8  moveq #$0,D0 / move.w ($2,A6),D0 / ext.l / addi.l #$4000
    271ae6  cmpi.l #$1C00,D0 / bgt $271B00        <-- $1C00, where $49 uses $2000
    271af0  tst.b ($16,A5) / beq $271B06
    271af8  jmp $263762                            the off-screen free -- and it does NOT touch a flag
    271b00  move.b #$1,($16,A5)
    271b06  tst.w $8130D2 / bne $271BD8            FREEZE -- and it skips to $271BD8, past everything
    271b10  jsr $24179E                            scrollCompensate
    271b16  jsr ($2714AE,PC)                       <-- UNREAD, and it is NOT in the port yet
    271b1a  tst.b ($3F,A6) / bne $271BC0           <-- the DEATH MARKER, read by $4A ITSELF
    271b22  tst.b ($24,A5) / bne $271B3E           a second-level cadence gate
    271b2a  subq.b #1,($1E,A5) / bcc $271BC0
    271b32  move.b ($1F,A5),($1E,A5) / move.b ($25,A5),($24,A5)
    271b3e  lea ($271C28,PC),A1

**REFINEMENT TO THE DEATH FINDING:** the previous section said "something else retires it later". The
reader is LOCAL: `$271B1A` tests `($3F,A6)` and branches past the whole fire arm to `$271BC0`, so a
marked-dead `$4A` **keeps drawing and stops firing**. That is the observable behaviour of the mark, and
it is `$4A`'s own code that implements it. Whether anything ever frees the record is still open -- the
only `freeEnemy` in the type is the OFF-SCREEN one at `$271AF8`, which suggests a dead `$4A` drifts off
the top and is collected there.

**Three more differences from `$49`, none of them inheritable:**

  * the off-screen limit is `$1C00`, not `$2000`;
  * the freeze at `$271B06` branches to `$271BD8` and skips the counter step, where `$49`'s freeze
    branches INTO its counter step so the sweep keeps advancing. **Opposite behaviour from the same
    idiom** -- do not copy `$49`'s freeze handling;
  * the cadence is TWO levels (`($1E,A5)`/`($1F,A5)` reloading, gated by `($24,A5)`/`($25,A5)`), where
    `$49` has one.

**`$2714AE` IS A NEW CALLEE AND IS NOT PORTED.** It is called every unfrozen frame before the fire
gate. Read it and `codexref` it FIRST -- on this band's record, it is likely shared with `$4B` and
possibly `$48`, and porting it inside a type wave is the mistake W333 avoided by doing `$270D92` first.

Still unread: `$271B42..$271C28` (the fire itself), `$271BC0`/`$271BD8` (the draw and the freeze tail),
and `$2714AE`.

### `$2714AE` IS A BARE `rts`, AND THE BODY BEHIND IT IS UNREACHABLE (W336)

The prerequisite the section above told the next wave to read first turns out to need no porting at
all, and knowing why saves a subsystem's worth of wasted work.

    2714ae  4e75            rts          <-- THE ENTRY POINT IS THE RETURN
    2714b0  tst.b ($3F,A6) / beq $27150E     the body: unreachable
    2714b8  tst.b ($3E,A6) / beq $27150E
    2714c0  subq.b #1,($3C,A6) / bcc $27150E
    2714c8  move.b ($3D,A6),($3C,A6)
    2714ce  moveq #$54,D0 / jsr $263684      an ALLOCATION
    2714d6  move.l ($2,A6),($16,A0)
    2714dc  jsr $242B3C / addi.b #$14,D0 / move.b D0,($1A,A0)

**BOTH callers target `$2714AE`, not `$2714B0`:**

    $2713DA  bsr.w   opcode $6100 disp $D2   -> $2713DA + 2 + $D2 = $2714AE
    $271B16  jsr (d16,PC)  disp $F996        -> $271B18 - $66A   = $2714AE

and `codexref $2714B0` finds **no code reference whatsoever**. So the body has no reachable entry
point in this build: it is a feature Version-B disabled by pointing its entry at a return, which is
what an `rts` patched over a first instruction looks like from the outside.

**WHAT THE PORT MUST DO:** treat both call sites as no-ops and do NOT port `$2714B0..$27150E`. It
allocates through `$263684` with D0 = `$54` and randomises a byte through `$242B3C`, so porting it
would add spawns the board does not make -- a *visible* invention, not a harmless one.

**WHY THIS IS THE FOURTH INSTANCE OF ONE PATTERN.** This build carries dead code that looks live:
`$2716D8`'s `tst.w` of a `lea` opcode, `$27460A` index `$18` and `$25DAC2`'s sentinel disagreement all
have the same shape -- an instruction or a table entry that reads as meaningful and is not. Add "a
`jsr` whose target is an `rts`" to the checklist. **Before porting any callee, read its FIRST
instruction and `codexref` the body separately from the entry.** Two commands, and here it was the
difference between one line of nothing and an invented spawner.

`$4A` therefore has one fewer prerequisite. Still unread: `$271B42..$271C28` (its fire), and
`$271BC0`/`$271BD8` (draw and freeze tail).

### `$4A`'s FIRE ARM, `$271B42..$271BC0` -- A SEVEN-SHOT AIMED FAN WITH A DRIFTING CENTRE (W336)

    271b58  add.w (A1),D0 / add.w ($2,A1),D1        a muzzle bias pair out of $271C28
    271b5e  jsr $24226E                             aim256FromCaller -- ALREADY PORTED (W323)
    271b64  move.b D1,($20,A5)                      <-- THE AIM IS STORED IN ($20,A5)
    271b68  subq.b #1,($26,A5) / bcc $271BC0        a THIRD cadence level
    271b70  move.b ($27,A5),($26,A5)
    271b76  moveq #$0,D1 / move.b ($20,A5),D1       the stored aim comes back as the centre
    271b7c  move.l #$FFFF000B,D0
    271b82  move.l ($2,A6),D2
    271b86  lea ($271C28,PC),A1
    271b8c  tst.b ($17,A5) / bne $271B9A
    271b94  lea ($271C2C,PC),A1                     the mirrored muzzle -- TWO longs, not a table
    271b9a  add.l (A1),D2                           ONE longword add, so a low-half carry reaches X
    271b9c  moveq #$0,D3 / moveq #$0,D4
    271ba0  subi.w #$9,D1                           start NINE units below centre
    271ba4  move.w #$6,D7
    271ba8  jsr $281764  /  addq.b #3,D1  /  dbra D7,$271BA8
    271bb4  move.b ($22,A5),D0 / add.b D0,($20,A5)  the centre DRIFTS by ($22,A5) per volley
    271bbc  subq.b #1,($24,A5)                      the volley counter the $271B22 gate reads

**`move.w #$6,D7` + `dbra` IS SEVEN PASSES**, the standing DBcc rule -- `dbra` branches while the
counter is not -1, so it runs at 6,5,4,3,2,1,0. With `subi.w #$9` first and `addq.b #3` after each, the
headings are centre-9, -6, -3, 0, +3, +6, +9: a **symmetric seven-way fan at 3-unit spacing**. Six or
eight would both be wrong and both would look plausible on screen.

`$281764` is the same spawner `$49`'s second shot uses, and W336 measured that it preserves D1..D4 --
which is exactly why this loop can mutate D1 alone between calls and leave D2/D3/D4 standing. **That
measurement was for `$49` and it pays off again here**, unprompted, which is the argument for reading
callees properly the first time.

**CORRECTION TO THE `($20,A5)` FINDING ABOVE.** An earlier section called `($20,A5)`/`($21,A5)` "two
RNG bytes". More precisely: the init SEEDS them from `drawWord242EC2`, and the fire arm then maintains
`($20,A5)` as the live aim -- written from `$24226E`'s result at `$271B64` and drifted by `($22,A5)` at
`$271BB8`. So it is RNG-seeded aim state, not scratch randomness. The warning that matters is unchanged
and is the whole point: **it is not `$49`'s formation-flag pointer**, and treating it as one would
dereference an aim byte.

So `$4A` is a three-level-cadence, seven-way aimed fan turret whose aim wanders. Only `$271BC0` (which
begins `subq.b #1,($1A,A5)`) and `$271BD8` remain unread, and both are short.

### `$4A` IS NOW READ END TO END, `$271BC0..$271C06` (W336)

    271bc0  subq.b #1,($1A,A5) / bcc $271BD8       the ANIMATION counter
    271bc8  move.b ($1B,A5),($1A,A5)
    271bce  addq.w #4,($1C,A5)
    271bd2  andi.w #$1F,($1C,A5)                   <-- A MASK, not a compare-and-wrap
    271bd8  tst.b ($3F,A6) / bne $271C06           <-- the death marker AGAIN, skipping the DRAW
    271be0  lea ($271C08,PC),A0 / adda.w ($1C,A5),A0 / move.l (A0),D2
    271bec  move.l ($2,A6),D1 / addi.l #-$11FF1400,D1      = $EE00EC00
    271bf6  move.w #$12A0,D3 / moveq #$0,D4 / move.w ($1C,A6),D4
    271c00  jsr $23DECE
    271c06  rts

**CORRECTION, AND IT IS THE THIRD ON THIS TYPE.** Two sections above I wrote that a marked-dead `$4A`
"keeps drawing and stops firing". Wrong: `($3F,A6)` is tested TWICE, at `$271B1A` before the fire arm
AND at `$271BD8` before the draw. A marked-dead `$4A` therefore skips **both** -- it goes invisible and
inert, runs only its animation counter, and occupies its slot until the off-screen free at `$271AF8`
collects it. The mark is a full retirement in everything but slot ownership, which is a different thing
from a dying animation and would have been a visible bug either way round.

**`andi.w #$1F` IS AN EIGHT-ENTRY RING.** Step 4, mask `$1F`, so `($1C,A5)` cycles 0,4,8..$1C: EIGHT
frames, where `$49` uses `cmpi.w #$78 / blt` for thirty. **Do not carry `$49`'s wrap over.** The mask
also means an out-of-range index is impossible by construction, so unlike `$49`'s draw this one needs no
`unreached` guard -- the ROM's own mask is the bound.

That makes the table layout self-consistent and worth recording as a block: `$271C08 + $20` is the
eight-entry draw table (`$314860` ascending), and `$271C28`/`$271C2C` are the two muzzle longwords the
fire arm picks between on `($17,A5)`. So one window `$271C08 + $28` covers the draw table AND both
muzzles.

**`$4A` IS NOW FULLY READ AND HAS NO UNPORTED PREREQUISITE.** Its callees are `$2637A2`, `$26377A`,
`$263808`, `$286096`, `$28615E`, `$270D92` (W333), `$24179E`, `$24226E` (W323), `$281764` (W336),
`$23DECE`, `$242EC2` -- all ported -- plus `$2714AE`, which is an `rts` and must be omitted. Windows
needed: `$271A1A + $52` (record + BOTH sub prototypes, overlapping the handler by eight bytes),
`$271C08 + $28` (draw ring + both muzzles), and `$271C30 + n` for the death list.

### CORRECTION: `$4A` WAS NOT READ END TO END, AND THE TWO MISSING SPANS BOTH MATTER (W336)

The section above claimed `$4A` was read end to end. It was not: `$271A64..$271A6B` and
`$271B42..$271B58` had never been displayed, only assumed from what surrounds them. Both contained
something.

**1. THE HANDLER'S FIRST INSTRUCTION IS THE DEATH MARKER, AND I ASSUMED IT WAS `stepMovement`.**

    271a64  4a2e 003f    tst.b ($3F,A6)
    271a68  6600 0068    bne  -> $271A68 + 2 + $68 = $271AD2

So `($3F,A6)` is tested **THREE** times, not twice, and the first test is the handler's opening
instruction: a marked-dead `$4A` skips the despawn trigger, the whole `$5C` damage arm and everything
else, landing at `$271AD2` and running only the movement/off-screen path, then skipping the fire gate at
`$271B1A` and the draw at `$271BD8`. **The mark makes the record completely inert on its very next
frame** -- it cannot be hit, cannot fire, does not draw, and only drifts until `$271AF8` frees it.

I had guessed these eight bytes were `jsr $2638A6 / nop`, because that is what the byte count fitted and
what most handlers open with. **`$4A` never calls `stepMovement` at all.** Guessing a routine's opening
from its length is exactly the class of mistake the rest of this document is about, and it was one
`python` call away from being checked.

**2. `$271B52 movem.w ($2,A6),D0-D1` SIGN-EXTENDS.** `movem.w` into data registers sign-extends each
word to 32 bits -- it is not a pair of `move.w`s. Here it loads Y into D0 and X into D1 before the
muzzle bias and the aim, so a negative coordinate arrives already extended.

    271b3e  lea ($271C28,PC),A1
    271b44  tst.b ($17,A5) / bne $271B52        ($17,A5) SET keeps $271C28
    271b4c  lea ($271C2C,PC),A1                 CLEAR takes $271C2C
    271b52  movem.w ($2,A6),D0-D1               SIGN-EXTENDING
    271b58  add.w (A1),D0 / add.w ($2,A1),D1    the SAME four bytes as a WORD PAIR
    271b5e  jsr $24226E

**And those four bytes are read two different ways.** `$271B58` takes `$271C28` as a pair of words to
bias the aim, and `$271B9A add.l (A1),D2` takes the same longword to bias the bullet's position. One
table, two conventions, four bytes -- the same shape as `$49`'s one counter feeding two index
conventions, in a smaller space.

So `$4A` is NOW read end to end, and this time that is checked rather than inferred: every byte from
`$2719AE` to `$271C06` has been displayed.

### `$4B`'s INIT BODY, READ IN FULL (W337 recon) -- init `$271C92`, body `$271C9A`, handler `$271D48`

    271c92  move.w #$0,($4,A5) / rts        ONE sub-record -- back to $49's count, not $4A's two
    271c9a  loadSubProto($271D2C)
    271ca6  loadRecordProto($271D18, 9)     D0+1 = TEN words
    271cb4  readInitPosition
    271cba  cmpi.w #$299,$8130CE / bne      a THIRD distinct frame ($49 $1F3, $4A $2B6, $4B $299)
    271cc6  move.b #$40,($1C,A6) / move.b #$1,($17,A5)
    271cd2  move.b ($18,A5),($1D,A6)
    271cd8  move.w #$1,$81B414 / move.w #$1,$81B416      the same budget opt-in (W336)
    271ce8  move.w #$1,$8130E2              <-- UNCONDITIONAL, and it happens either way
    271cf0  lea $8130E2,A0
    271cf6  cmpi.w #$280,$8130CE / bcs $271D0E
    271d02  lea $8130E6,A0
    271d08  move.w #$202,($1A,A5)           <-- late branch ONLY
    271d0e  move.l A0,($26,A5)              <-- the flag pointer, at ($26,A5) NOT ($20,A5)
    271d12  move.w #$1,(A0)
    271d16  rts

**THE OVERLAP DEPTH RULE HOLDS AND IS NOW CONFIRMED RATHER THAN ASSERTED.** `($4,A5) = 0` means ONE
`$20`-byte sub record, so `$271D2C + $20 = $271D4C` against a handler at `$271D48`: **four** bytes, the
same as `$49` and not `$4A`'s eight. The depth follows from `($4,A5)` exactly as W337's window note
said. Window: `$271D18 + $34` (`$271D18..$271D4B`, ten-word record prototype plus the sub prototype).

**THE FLAG POINTER IS BACK, BUT AT A DIFFERENT OFFSET AND ON DIFFERENT WORDS.** `$49` stores it in
`($20,A5)` over `$8130E0`/`$8130E4`; `$4A` has no flag and uses `($20,A5)` for aim state; `$4B` stores it
in **`($26,A5)`** over **`$8130E2`/`$8130E6`**. Three consecutive types, three different meanings for the
same region of the record. Find `$4B`'s exits and clear through `($26,A5)`, and do NOT reuse either
sibling's offset.

**`$8130E2` IS WRITTEN TWICE ON THE LATE BRANCH.** `$271CE8` sets it to 1 unconditionally, and only then
does the `$280` test possibly redirect A0 to `$8130E6` -- so a late `$4B` arms `$8130E2` AND `$8130E6`,
while an early one arms `$8130E2` only, through both the direct write and the pointer. Collapsing the
unconditional write into the branch would leave the early flag set once instead of twice (harmless) and
the LATE case with `$8130E2` clear (not harmless).

**`move.w #$202,($1A,A5)` IS TWO BYTE FIELDS.** The standing rule: `($1A,A5) = 2` and `($1B,A5) = 2`.
Those are the animation counter and its reload, which `$4A` uses the same way -- so the late-spawning
`$4B` gets a 2-frame animation cadence and the early one keeps whatever the prototype gave it.

Still to read: the handler `$271D48` onward, including its `$270D92` call at `$271D88`.

### CORRECTION: `$4B` FREES ITSELF. IT IS `$49`'s SHAPE, NOT `$4A`'s (W337 recon)

The order-for-next-wave note above said of `$4B`: "expect the overlap trap, expect mark-and-fall-through".
The overlap prediction held. **The mark prediction is WRONG** and is corrected here before anyone builds
on it.

    271d48  moveq #$5C,D1 / and.b (A6),D1 / beq $271DA0     the handler OPENS on the damage mask,
                                                            not on a ($3F,A6) test like $4A
    271d56  jsr $286096                                     scoreHit
    271d5c  D0 = ($1D,A6) ; D2 = ($19,A5) ; eor.b ; store    the simple palette XOR
    271d6a  tst.w ($18,A6) / bpl $271DA6
    271d72  move.l #$290,D0 / jsr $28615E                    scoreKill -- a THIRD value
    271d7e  D2 = ($2,A6) ; lea ($271F20,PC),A1 ; jsr $270D92   SIX entries, ending $271F6A
    271d8c  jsr $28C2DC
    271d92  movea.l ($26,A5),A0 / clr.w (A0)                 the flag, through ($26,A5)
    271d98  jmp $263762                                     <-- freeEnemy. IT REALLY DOES FREE.
    271da0  move.b ($18,A5),($1D,A6)                         the not-hit path
    271da6  moveq #$0,D0 / move.w ($2,A6),D0 / ext.l / addi.l #$4000 / cmpi.l #$400 / bgt
    271dbe  tst.b ($16,A5) / beq $271DDA
    271dc6  movea.l ($26,A5),A0 / clr.w (A0) / jmp $263762   the off-screen free, flag cleared too
    271dd4  move.b #$1,($16,A5)
    271dda  tst.w $8130D2                                    the freeze

So `$4B` has **no `$8000` mark and no `($3F,A6)` flag at all**. It is `$49`'s lifetime exactly: score,
walk the death list, clear the formation flag through the stored pointer, `freeEnemy`. `$4A` is the odd
one of the three, not the pattern.

**THREE TYPES, THREE OFF-SCREEN LIMITS, ALL THE SAME IDIOM.** `ext.l` / `addi.l #$4000` / `cmpi.l` /
`bgt`, with the limit `$2000` for `$49`, `$1C00` for `$4A` and **`$400`** for `$4B`. And three kill
scores: `$250`, `$180`, `$290`. Every one of these is a per-type constant wearing shared code.

**WHY I GOT IT WRONG, WHICH IS THE REUSABLE PART.** I predicted mark-and-fall-through for `$4B` because
`$4A` had it and they are adjacent siblings -- the exact inference this document warns against four
sections earlier, applied by me in the same session. The band shares idioms and diverges in fields, and
"it will resemble its neighbour" is not a shortcut even when the neighbour is one type away. **Predicting
a routine's shape before reading it is only useful if the prediction is then checked; recording it as an
expectation in a handoff makes it load-bearing.** Left in place, that line would have had the next agent
looking for a death mark that does not exist.

Window for the death list: `$271F20 + $4A` (SIX 12-byte entries then `$FFFF`, ending `$271F6A`).

Still to read for `$4B`: `$271DDA` onward -- the freeze tail, fire arm and draw.

### `$4B`'s SWEEP AND FIRE ARM, `$271DDA..$271E54` (W337 recon) -- `$49`'s shape again

    271df2  move.b ($1B,A5),($1A,A5)
    271df8  addq.w #4,($1C,A5) / cmpi.w #$78,($1C,A5) / blt / move.w #$0,($1C,A5)
    271e0c  lea ($271F6A,PC),A1 / adda.w ($1C,A5),A1 / move.l (A1),D3     RAW index, 30 LONGS
    271e18  move.l ($2,A6),D2
    271e1c  lea ($271FE2,PC),A1
    271e22  tst.b ($17,A5) / beq $271E32          CLEAR keeps $271FE2 and does NOT negate
    271e2a  lea ($27201E,PC),A1
    271e30  neg.w D3                              SET takes the other table AND mirrors
    271e32  move.w ($1C,A5),D0 / asr.w #1,D0 / adda.w D0,A1 / move.w (A1),D1   HALVED index
    271e3c  add.l D3,D2 / moveq #$0,D3 / moveq #$0,D4
    271e42  move.l #$10003,D0  / jsr $281744
    271e4e  move.l #$FFFD0004,D0 / ...

**`$4B` WRAPS THIRTY, NOT EIGHT.** `cmpi.w #$78 / blt`, the same `$49` construction, where `$4A` uses
`andi.w #$1F` for eight. So the sweep length is a third per-type constant on shared code, alongside the
three off-screen limits (`$2000`/`$1C00`/`$400`) and three kill scores (`$250`/`$180`/`$290`). **Nothing
about this band is inheritable except the instruction sequences themselves.**

It carries `$49`'s two traps verbatim: **one counter, two index conventions** (RAW for the long table at
`$271F6A`, ASR 1 for the word tables), and **`neg.w D3` on a `move.l`-loaded long** at `$271E30`, low word
only, no borrow, followed by `add.l` which does carry. Note the polarity is the OPPOSITE of `$49`'s: here
`($17,A5)` SET takes the second table and mirrors, where `$49` SET took the FIRST table. Do not copy the
sense of the test.

Registers are reused across shots (`$281744` with D0 = `$10003`, then D0 = `$FFFD0004`), which W336
licensed by measuring that the `$2817C2` family preserves D1..D4.

**THE TABLE BLOCK IS CONTIGUOUS AND SELF-CHECKING:**

    $271F20 + $4A   death list, SIX 12-byte entries then $FFFF        ends $271F6A
    $271F6A + $78   30 muzzle LONGS, index RAW                        ends $271FE2
    $271FE2 + $3C   30 sweep WORDS, ($17,A5) CLEAR, index ASR 1       ends $27201E
    $27201E + $3C   30 sweep WORDS, ($17,A5) SET, index ASR 1         ends $27205A

Each table's end is the next one's start, so `$271F20 + $13A` covers all four as one window and the
arithmetic checks itself. Declare it that way or as four; either is defensible, but state which.

Still to read for `$4B`: `$271E54` onward -- the remaining shots and the draw.

### `$4B` IS NOW READ END TO END, `$271E42..$271EA6` (W337 recon). FOUR SHOTS, ASYMMETRIC.

    271e42  move.l #$10003,D0    / jsr $281744      shot 1, at the sweep word itself
    271e4e  move.l #$FFFD0004,D0 / addq.w #2,D1 / jsr $2816F6     shot 2, base+2
    271e5c  subq.w #4,D1         / jsr $2816F6                    shot 3, base-2  (D0 UNCHANGED)
    271e64  addq.w #3,D1 / move.l #$FFF90005,D0 / jsr $2816F6      shot 4, base+1
    271e72  addq.b #1,($25,A5) / andi.b #$1,($25,A5)               a 0/1 TOGGLE
    271e7c  subq.b #1,($22,A5)                                     decremented, NOT branched on
    271e80  lea ($271EA8,PC),A0 / adda.w ($1C,A5),A0 / move.l (A0),D2      RAW index, 30 LONGS
    271e8c  move.l ($2,A6),D1 / addi.l #-$1DFF1600,D1              = $E200EA00
    271e96  move.w #$1EB0,D3 / moveq #$0,D4 / move.w ($1C,A6),D4
    271ea0  jsr $23DECE
    271ea6  rts

**FOUR SHOTS, NOT A LOOP AND NOT SYMMETRIC.** D1 walks base, base+2, base-2, base+1 by three separate
`addq`/`subq`s, and D0 changes for shots 1, 2 and 4 while shot 3 REUSES shot 2's. `$49` has three shots
this way and `$4A` has a seven-pass `dbra` loop -- so all three types spell "fire several bullets"
differently. Shot 3 inheriting D0 is another instance of the register-reuse W336 licensed; without that
measurement it would look like an omission.

`$271E7C subq.b #1,($22,A5)` sets flags that nothing reads -- the next instruction is a `lea`. It is a
plain decrement, not a gate. Do not invent a branch for it.

**THE WHOLE BAND'S TABLE BLOCK IS ONE CONTIGUOUS RUN, AND EVERY BOUNDARY CHECKS THE PREVIOUS ONE:**

    $271EA8 + $78    $4B's 30 draw LONGS, index RAW               ends $271F20
    $271F20 + $4A    $4B's death list, SIX entries then $FFFF     ends $271F6A
    $271F6A + $78    $4B's 30 muzzle LONGS, index RAW             ends $271FE2
    $271FE2 + $3C    $4B's 30 sweep WORDS, ($17,A5) CLEAR         ends $27201E
    $27201E + $3C    $4B's 30 sweep WORDS, ($17,A5) SET           ends $27205A

So `$271EA8 + $1B2` is one window covering all five, with the arithmetic self-checking end to end.
Prefer that single declaration and say in the comment that the five spans abut, since five separate
windows would hide the property that pins them.

**`$4B` NOW HAS NO UNREAD SPAN AND NO UNPORTED PREREQUISITE.** Callees: `$2637A2`, `$26377A`, `$263808`,
`$286096`, `$28615E`, `$270D92` (W333), `$281744`/`$2816F6` (W336), `$23DECE` -- all ported, plus
`$24179E` (`scrollCompensate`, at `$271DE4`), also ported. **An earlier draft of this line said "it needs
no `$24179E`"; that was wrong** -- I had not yet displayed `$271DDA..$271DF2` when I wrote it. It does not
call `$2714AE`, which is the bare `rts` (W336). Windows: `$271D18 + $34` (record + sub prototype,
overlapping the handler by FOUR bytes) and `$271EA8 + $1B2` (all five tables).

**WRITE IT.** The three-way divergence table for the band is in `docs/worklog/ddpdoj/337-type4a.md`;
`$4B` differs from `$49` in the `($17,A5)` polarity, the limit (`$400`), the score (`$290`), the flag
offset (`($26,A5)`) and the flag words (`$8130E2`/`$8130E6`), and from `$4A` in essentially everything
except the shared instruction sequences.

### `$48` FIRST LOOK (W338 recon) -- init `$271284`, handler `$27133A`. IT MARKS, LIKE `$4A`.

Type table `$267824 + $48*8 = $267A64` reads `00271284 0027133A`, so initBody is `$27128C` by the
`init + 8` rule.

    271390  jsr $270D92                     the shared death-spawn walker (W333), its SIXTH caller
    271394  jsr $28C2DC
    27139a  move.b #$1,($3F,A6)             <-- THE MARK. No clr.w through a flag, no freeEnemy.
    2713a0  move.b ($18,A5),($1D,A6)        FALLS THROUGH into the alive path
    2713a6  moveq #$0,D0 / move.w ($2,A6),D0 / ext.l / addi.l #$4000
    2713b4  cmpi.l #$2C00,D0 / bgt $2713CE  <-- a FOURTH off-screen limit
    2713be  tst.b ($16,A5) / beq $2713D4
    2713c6  jmp $263762                     the off-screen free

**SO THE BAND SPLITS 2-2 ON LIFETIME, NOT 3-1.** `$4A` and `$48` mark-and-continue; `$49` and `$4B` free
themselves in the death arm. When W337 found `$4A` marking it looked like the odd one out and W338 said
so; `$48` makes it a genuine pair. **Do not treat any of the four as the band's "normal" shape** -- there
isn't one, and the write-up in `338-type4b.md` should be read with that correction in mind.

Whether `$48` also carries `$4A`'s THREE `($3F,A6)` tests (handler head, before the fire arm, before the
draw) is UNREAD and is the first thing to check: it decides whether a marked `$48` is fully inert or only
partly.

**Four off-screen limits now, one idiom** (`ext.l` / `addi.l #$4000` / `cmpi.l` / `bgt`):

    $49 $2000     $4A $1C00     $4B $400     $48 $2C00

Still to read for `$48`: the init body `$27128C`, the handler from `$27133A` to `$271390`, and everything
after `$2713CE`. Its death list address is inside the unread `$271384`-ish span just before the walker
call.

### `$48`'s HANDLER HEAD AND DAMAGE ARM (W338 recon continued) -- the `$2800` GUARD IS MISSING

    27133a  tst.b ($3F,A6) / bne $27133E + 2 + $60 = $2713A0    <-- the mark test, test 1 of ?
    271342  cmpi.w #$2800,($2,A6)
    271348  ble $271348 + 2 + $38 = $271382                     <-- STRAIGHT to the retirement
    27134c  moveq #$5C,D1 / and.b (A6),D1 / beq $2713A0          the $5C mask
    271354  move.b #$A3,D0 / and.b D0,(A6)
    27135a  jsr $286096                                         scoreHit
    271360  D0 = ($1D,A6) ; D2 = ($19,A5) ; eor.b ; store        the simple palette XOR
    27136e  tst.w ($18,A6) / bpl $2713A6
    271376  move.l #$130,D0 / jsr $28615E                        a FIFTH kill score
    271382  move.w #$8000,(A6)                                   the mark, as $4A
    271386  D2 = ($2,A6) ; lea ($271558,PC),A1 ; jsr $270D92      FIVE entries, ends $271596

**CONFIRMED: `$48` tests `($3F,A6)` at the handler's first instruction, exactly as `$4A` does.** So the
2-2 lifetime split is real and both marking members gate on the mark from instruction one. Whether `$48`
also tests it before its fire arm and before its draw is still unread.

**THE DIVERGENCE: `$48`'s `$2800` TRIGGER HAS NO `($16,A5)` GUARD.**

    $4A   cmpi.w #$2800,($2,A6) / bgt (skip) ; then tst.b ($16,A5) / bne -> retire
    $48   cmpi.w #$2800,($2,A6) / ble -> retire                      NO ($16,A5) TEST AT ALL

Same constant, same purpose, and `$4A` requires the record to have been on screen first while `$48` does
not. `($16,A5)` is the "has been on screen" latch every member sets in its off-screen arm, so `$4A`
retires only after appearing and `$48` retires the moment its position qualifies -- **including
potentially before it ever appears.** A port that copied `$4A`'s guarded form would make `$48` outlive
its intended retirement.

That is the *ninth* distinct axis on which these four types differ while sharing instruction sequences,
and the first where the difference is a MISSING instruction rather than a changed constant. Absence is
harder to notice than a different literal, which is the reason this is written down rather than left to
the next reader's diff.

**Five kill scores now:** `$250` (`$49`), `$180` (`$4A`), `$290` (`$4B`), `$130` (`$48`) -- and four
off-screen limits: `$2000`, `$1C00`, `$400`, `$2C00`.

Still to read for `$48`: the init body `$27128C`, and everything after `$2713CE` (the freeze tail, fire
arm and draw). Death-list window: `$271558 + $3E` (FIVE 12-byte entries then `$FFFF`).

### THE BAND IS TWO PAIRS, NOT FOUR SINGLETONS (W338, `$48`'s init body read in full)

    271284  move.w #$1,($4,A5) / rts        TWO sub-records, as $4A
    27128c  loadSubProto($271302)
    271298  loadRecordProto($2712F0, 8)     D0+1 = NINE words, as $4A
    2712a6  readInitPosition
    2712ac  cmpi.w #$201,$8130CE / bne      a FOURTH frame ($49 $1F3, $4A $2B6, $4B $299, $48 $201)
    2712b8  move.b #$40,($1C,A6) / move.b #$1,($17,A5)
    2712c4  move.w #$1,$81B414 / move.w #$1,$81B416
    2712d4  move.b ($18,A5),($1D,A6)
    2712da  jsr $242EC2 / move.b D0,($20,A5)
    2712e4  jsr $242EC2 / move.b D0,($21,A5)
    2712ee  rts                             <-- NO formation flag, exactly as $4A

**So the four types are TWO PAIRS on structure:**

    { $48, $4A }   ($4,A5) = 1 -> TWO sub records -> EIGHT-byte handler overlap
                   NINE-word record prototype
                   ($20,A5)/($21,A5) RNG-SEEDED, no formation flag
                   lifetime: MARK ($8000 + ($3F,A6)) and fall through, tested at instruction one

    { $49, $4B }   ($4,A5) = 0 -> ONE sub record -> FOUR-byte handler overlap
                   SEVEN- and TEN-word record prototypes
                   ($20,A5) / ($26,A5) holds a POINTER to a formation flag word
                   lifetime: score, walk, clear the flag, freeEnemy

That is a real and useful structure -- it says where to look and which sibling's code to read alongside.
**It does NOT license copying.** Within the `{$48,$4A}` pair the constants still all differ (limit `$2C00`
vs `$1C00`, score `$130` vs `$180`, frame `$201` vs `$2B6`, death list five entries vs eight) and `$48`
is MISSING `$4A`'s `($16,A5)` guard on the `$2800` trigger. The pairing tells you the shape; every field
still has to be read.

Window for `$48`'s prototypes: `$2712F0 + $52` (`$2712F0..$271341`, nine-word record prototype plus BOTH
sub prototypes, overlapping the handler at `$27133A` by eight bytes -- do not trim).

Still to read for `$48`: everything after `$2713CE` -- the freeze tail, fire arm and draw. Expect them to
resemble `$4A`'s and verify every constant and every guard, including whether `($3F,A6)` is tested before
the fire arm and the draw as it is in `$4A`.

### `$48`'s FREEZE TAIL AND AIM SETUP, `$2713CE..$271422` (W338) -- and the dead `bsr` in situ

    2713ce  move.b #$1,($16,A5)
    2713d4  jsr $24179E                     scrollCompensate -- so $48 DOES call it, like $4B
    2713da  bsr $2714AE                     <-- THE BARE rts (W336). OMIT IT.
    2713de  tst.b ($3F,A6) / bne $271488    the mark, test 2 -- before the fire arm, as $4A
    2713e6  tst.b ($24,A5) / bne $271402    the two-level cadence gate, as $4A
    2713ee  subq.b #1,($1E,A5) / bcc $271488
    2713f6  move.b ($1F,A5),($1E,A5) / move.b ($25,A5),($24,A5)
    271402  lea ($271596,PC),A1
    271408  tst.b ($17,A5) / bne $271416    SET KEEPS the first table -- $4A's polarity, NOT $4B's
    271410  lea ($27159A,PC),A1
    271416  movem.w ($2,A6),D0-D1           SIGN-EXTENDING, as $4A
    27141c  add.w (A1),D0 / add.w ($2,A1),D1    the muzzle as a WORD PAIR
    271422  jsr $24226E                     aim256FromCaller

**`$2713DA` IS THE OTHER CALLER OF THE BARE `rts`, NOW SEEN IN CONTEXT.** W336 established that both
callers of `$2714AE` target the `rts` and that the body at `$2714B0` has no reachable entry point; this is
that second caller, sitting in `$48`'s per-frame path exactly where `$4A` has its `jsr`. **Both marking
members call a routine that does nothing, every unfrozen frame.** Omit it in both. Two independent call
sites make it much less likely to be a mis-disassembly and much more likely to be a deliberately disabled
feature in Version-B.

**THE `($17,A5)` POLARITY MATCHES `$4A`, NOT `$4B`.** `bne` keeps the first table, so SET = first. `$4B`
inverted this (SET = second, and it also mirrors). So polarity tracks the PAIRS: `{$48,$4A}` share it and
`$4B` differs from both. That is the first axis found to respect the pairing -- nine others do not, so it
is worth noting as a coincidence to verify rather than a rule to lean on.

`$48` also carries `$4A`'s `movem.w` sign-extension and its word-pair reading of the muzzle longword.

**THE TABLE RUN IS CONTIGUOUS AGAIN:** `$271558 + $3E` is the five-entry death list, ending exactly at
`$271596`, which is the first muzzle longword; `$27159A` is the second. So `$271558 + $46` covers the
death list and both muzzles as one self-checking window, the same construction W338 used for `$4B`.

Still to read for `$48`: `$271426` onward -- its shot loop (or shot list) and its draw, plus whether
`($3F,A6)` is tested a third time before the draw as it is in `$4A`.

### `$48`'s SHOT LOOP, `$27143E..$271486` (W338) -- FIVE shots at 5-unit spacing

    27143e  moveq #$0,D1 / move.b ($20,A5),D1      the stored aim as the centre, as $4A
    271444  move.l #$FFFE000B,D0                   $4A's is $FFFF000B -- the HIGH word differs
    27144a  move.l ($2,A6),D2
    27144e  lea ($271596,PC),A1 / tst.b ($17,A5) / bne -> keep ; else lea ($27159A,PC),A1
    271462  add.l (A1),D2                          the SAME longword, now read as a LONG
    271464  moveq #$0,D3 / moveq #$0,D4
    271468  subi.w #$A,D1                          start TEN below centre ($4A starts NINE)
    27146c  move.w #$4,D7
    271470  jsr $281744  /  addq.b #5,D1  /  dbra D7,$271470
    27147c  move.b ($22,A5),D0 / add.b D0,($20,A5)  the centre DRIFTS, as $4A
    271484  subq.b #1,($24,A5)                      the volley counter

**`move.w #$4,D7` + `dbra` IS FIVE PASSES** (4,3,2,1,0), the standing DBcc rule again. With `subi.w #$A`
first and `addq.b #5` after each, the headings are centre-10, -5, 0, +5, +10: a symmetric **five-way fan at
5-unit spacing**, where `$4A` is a **seven-way fan at 3-unit spacing** (`move.w #$6,D7`, `subi.w #$9`,
`addq.b #3`).

**Identical construction, and FOUR of its five parameters differ between the pair**: the pass count (`#$4`
vs `#$6`), the initial offset (`#$A` vs `#$9`), the step (`#5` vs `#3`) and the spawner (`$281744` vs
`$281764`). Plus D0 (`$FFFE000B` vs `$FFFF000B`). This is the clearest single illustration of the band's
character: the two closest relatives in it share a loop skeleton and agree on almost none of what goes in
it. **Reading `$4A`'s loop and adjusting one number would have produced a wrong fan four ways over.**

The muzzle longword is again read BOTH ways, as in `$4A`: a word pair at `$27141C` to bias the aim inputs
and a longword at `$271462` to bias the bullet position.

Note `$27143A` disassembles as `ori.b #$26,-(A7)`, which is data caught mid-stream, not an instruction --
`$271426..$27143C` is the aim tail and needs one more read at a correct instruction boundary before the
fire arm can be written.

Still to read for `$48`: `$271426..$27143C` (the aim tail) and `$271488` onward (the animation counter and
the draw, plus the expected third `($3F,A6)` test).

### `$48`'s TAIL, `$27142C..$2714AC` (W338) -- the THIRD mark test confirmed, and the draw is a `bsr`

    27142c  move.b D1,($20,A5)              the aim store -- W323's trap, exactly as $4A's $271B64
    271430  subq.b #1,($26,A5) / bcc $271488    the THIRD cadence level, as $4A
    271438  move.b ($27,A5),($26,A5)
    27143e  ... the five-shot fan ...
    271488  subq.b #1,($1A,A5) / bcc        the animation counter
    271490  move.b ($1B,A5),($1A,A5)
    271496  addq.w #4,($1C,A5) / andi.w #$1F,($1C,A5)    EIGHT-entry ring, as $4A -- a MASK, not a compare
    2714a0  tst.b ($3F,A6) / bne $2714AC    <-- THE THIRD MARK TEST, before the draw. As predicted.
    2714a8  bsr $271510                     the draw is a SEPARATE SUBROUTINE
    2714ac  rts
    2714ae  rts                             <-- the bare rts, the very next byte

**THE THIRD `($3F,A6)` TEST IS THERE.** `$48` tests the mark at the handler head, before the fire arm and
before the draw, the same three points as `$4A`. So a marked `$48` is fully inert -- unhittable, silent,
invisible -- and only the movement path runs until the off-screen free. The open question recorded two
sections ago is answered YES, and the `{$48,$4A}` pairing holds on lifetime in full detail.

**`$2714AE` IS THE BYTE IMMEDIATELY AFTER `$48`'s HANDLER ENDS**, which finally explains what it is: a
stub `rts` parked between `$48`'s handler and the disabled body at `$2714B0`. And that body tests
`($3F,A6)`, `($3E,A6)` and `($3C,A6)` -- all dying-state fields -- so the disabled feature is an extra
effect for MARKED records specifically. Version-B turned it off by pointing both call sites at the stub.
That is a coherent story rather than an oddity, and it is now recorded as one.

`$48` also shares `$4A`'s **eight-entry `andi.w #$1F` ring** (`$49` and `$4B` use `cmpi.w #$78` for
thirty), so the ring length tracks the pairs, like the `($17,A5)` polarity. Two axes respect the pairing
now; nine do not.

**Its draw is a `bsr` to `$271510`, not inline** -- the only member of the band that factors it out. That
is the last unread span: `$271510` onward.

### `$48`'s DRAW SUBROUTINE `$271510` (W338) -- and its table run is contiguous too

    271510..27151E   NOT YET DISPLAYED -- the table index setup. READ IT; do not assume it matches $4A's.
    271520  addi.l #-$9FF0A00,D1        = $F600F600     ($4A's is $E200EA00, $4B's $E200EA00-shaped)
    271526  move.w #$A50,D3             ($4A $12A0, $4B $1EB0 -- a THIRD value)
    27152a  moveq #$0,D4 / move.w ($1C,A6),D4
    271530  jsr $23DECE
    271536  rts
    271538  the DRAW RING: EIGHT longwords, five distinct, ping-ponging:
              $318F78 $31910C $3192A0 $319434 $3195C8 $319434 $3192A0 $31910C

The ring is eight entries, matching the `andi.w #$1F` mask, and it ping-pongs over five distinct frames --
the same construction as `$4A`'s (`$314860`.. five distinct, eight entries). Its step is `$194` where
`$4A`'s is `$54C`.

**ONE WINDOW COVERS ALL THREE OF `$48`'s TABLES, AND THE ARITHMETIC CHECKS ITSELF:**

    $271538 + $20   the 8-longword draw ring        -> ends $271558
    $271558 + $3E   death list, FIVE entries + $FFFF -> ends $271596
    $271596 + $08   the two muzzle longwords        -> ends $27159E

So **`$271538 + $66`** (`$271538..$27159D`) is the single declaration, the same construction W338 used for
`$4B`'s five-table run and for `$4A`'s. Every boundary is checked by the next table's start rather than by
a terminator or a row count.

Together with `$2712F0 + $52` (record prototype + BOTH sub prototypes, eight-byte handler overlap), that is
`$48`'s complete window set.

**`$48` IS NOW READ EXCEPT `$271510..$27151E`, SIXTEEN BYTES.** That span is the draw's table index setup.
It is NOT to be assumed from `$4A` -- this session recorded nine axes where the pair diverges and produced
eight self-corrections, every one from inferring across a span instead of displaying it. Display these
sixteen bytes, then `$48` can be written in one pass: its callees are `$2637A2`, `$26377A`, `$263808`,
`$286096`, `$28615E`, `$270D92`, `$24179E`, `$24226E`, `$242EC2`, `$281744`, `$23DECE` -- all ported -- plus
`$2714AE`, the stub `rts`, which is omitted.

### `$47` FIRST LOOK (W339) -- init `$26D6EE`, handler `$26D7D0`. NOT a band member.

`$E2` records, the biggest remaining unblocked type in stage 5. It is structurally unlike
`$48`/`$49`/`$4A`/`$4B` in every way that matters:

    26d6ee  move.w #$3,($4,A5) / rts        FOUR sub records ($4,A5)+1 -- the band has 1 or 2
    26d6f6  loadSubProto($26D760)
    26d702  move.w #$F,D0 / loadRecordProto($26D740)    SIXTEEN words -- and a `move.w`, NOT a `moveq`
    26d712  readInitPosition
    26d718  move.w #$1,$81B414              <-- ONE budget word only; the band always sets TWO
    26d720  move.w #$1,$8130DC              <-- a global the band never touches
    26d728  move.w #$10,D0 / lea $224F38,A0 / jsr $24150A     <-- A PALETTE BANK INSTALL

**THE OVERLAP IS SIXTEEN BYTES, THE DEEPEST YET, AND THE RULE STILL PREDICTS IT.**
`($4,A5) = 3` means FOUR `$20`-byte sub records, so `$26D760 + $80 = $26D7E0` against a handler at
`$26D7D0`. Depth = `subRecords * $20 - (handler - subProto)` = `$80 - $70` = `$10`. The rule established
across `$49` (4), `$4A` (8) and `$4B` (4) generalises; it is arithmetic, not a per-type fact. Window:
`$26D740 + $A0` (`$26D740..$26D7DF`, sixteen-word record prototype plus all FOUR sub prototypes).

**`move.w #$F,D0` RATHER THAN `moveq`** is worth flagging: `loadRecordProto` takes `D0+1` words, so this
is SIXTEEN, and every band member used `moveq #$6`/`#$8`/`#$9`. A reader pattern-matching on `moveq` would
miss the count entirely.

**`$24150A` IS THE PALETTE-BANK INSTALL** the port already has as `installBank` (see `$27C5BE`'s body in
`initbody.js`, which installs three). `$47` installs ONE: bank `$10` from `$224F38`. Check whether
`$224F38` is already inside W91's `$222A78..$2252F8` palette-family window before declaring anything --
W169 found exactly that situation and needed no new window.

Still to read for `$47`: the rest of the init body past `$26D738`, and the whole handler from `$26D7D0`.

**W340 IS THE PUBLISH WAVE.** Land the next type, then `export-web.mjs` then `publish.mjs --only ddpdoj`.

### `$47`'s HANDLER HEAD, `$26D7D0..$26D80E` (W339) -- IT REINSTALLS ITS PALETTE EVERY FRAME

    26d7d0  move.w #$10,D0 / lea $224F38,A0 / jsr $24150A    <-- THE SAME THREE INSTRUCTIONS AS THE INIT
    26d7e0  tst.w $8130D2 / bne $26DAC8                       the freeze, jumping FAR (the draw)
    26d7ea  tst.b ($7E,A6) / beq $26D810                      a flag in the LAST sub-record
    26d7f2  move.w #$0,$8130DC                                clears the global the init SET
    26d7fa  move.w #$20,D0 / move.w #$20,D1 / jsr $261100     <-- $261100, a NEW callee. Read it.
    26d808  jmp $263762                                      freeEnemy

**THE PALETTE INSTALL IS NOT INIT-ONLY.** `$26D7D0` is byte-for-byte the init's `$26D728`: bank `$10` from
`$224F38`, every single frame this handler runs. That is easy to read as redundant and delete, and it is the
first instruction of the handler so it is also easy to skip past on the way to "the real logic". **Port it as
the per-frame call it is.** Something else in stage 5 is presumably overwriting bank `$10`, and this type
repainting it every frame is the mechanism that keeps it correct.

**`$8130DC` IS A SINGLE GLOBAL, NOT A POINTER.** The init sets it to 1 (`$26D720`) and the retirement clears
it (`$26D7F2`). Same purpose as the band's formation flags but with no `($n,A5)` pointer indirection -- `$47`
has only one instance's worth of state to track, which fits a type with `$E2` records driven from one place.

`($7E,A6)` is the retirement trigger. Note the offset: FOUR `$20`-byte sub records give a `$80`-byte record,
so `+$7E` is the last word of the last sub-record. A port that allocated a band-sized record would write
outside it.

**`$261100` IS NOT YET IDENTIFIED** and is called with D0 = `$20` and D1 = `$20` on the retirement path.
`codexref` it before writing `$47`: on this project's record a routine reached from a retirement path with two
equal register arguments is likely shared, and W333's lesson was to port the shared callee FIRST rather than
discover it mid-type.

Still to read for `$47`: `$26D738` (one instruction, the init's tail), `$26D810` onward (the alive path), and
`$26DAC8` (the draw). Its window is `$26D740 + $A0`; check `$224F38` against W91's existing palette family
window before declaring a second one.

### `$261100` IS ALREADY PORTED. `$47` HAS NO UNIDENTIFIED CALLEE. (W339)

The previous section said to `codexref $261100` before writing `$47`. Done, and the answer is that it needs
no work: it is **`pushExternalSpeed(ram, d0, d1)` in `src/background.js`** (line 1222), documented there since
W31 as "THE EXTERNAL SPEED PUSH, the writer side" -- three writes, `$813180 = 1`, `$813182 = D0`,
`$813184 = D1`, and `backgroundFrame` has consumed those words since W13.

`background.js` had already recorded that it has **nine callers in build B**, and `$26D802` -- `$47`'s
retirement path -- is one of them. So `$47` calling it with `D0 = D1 = $20` is the same construction as the
stage-1 midboss at `$26B73A`, which pushes `D0 = D1 = $0020` as its death countdown passes `$30`.

**AND THAT TELLS US WHAT `$47` IS.** `pushExternalSpeed` is the owner's "minibosses stop the scroll" from the
writer end: the stage stops ADVANCING because a paired speed push overrides the script. A type with `$E2`
records that pushes the same `$20`/`$20` on retirement is doing the same job -- **`$47` is a scroll-stopping
set-piece**, not an ordinary enemy, which also explains its four sub records, its sixteen-word prototype and
its per-frame palette repaint.

**FIFTH TIME THIS SESSION** that a "new callee" or "blocker" dissolved on checking whether the port already
had it (after W334's `init + 8`, W336's `death37`, W336's `$2816F6` measurement, W338's `$2714AE` story). The
check is `grep -rniE '<addr>' games/ddpdoj/src/` plus `codexref`, it costs two commands, and it has never once
failed to be worth running. **Run it on EVERY callee before reading its body.**

So `$47`'s remaining work is pure reading: `$26D738` (one instruction), `$26D810` onward (the alive path) and
`$26DAC8` (the draw). Window `$26D740 + $A0`; still check `$224F38` against W91's palette family window.

### `$47`'s DAMAGE ARM IS THE BOSS `$7FFF` DAMAGE-SINK, WHICH THE PORT ALREADY HAS (W339)

    26d810  moveq #$5C,D1 / and.b (A6),D1 / beq $26D892       (4 bytes not yet displayed -- confirm)
    26d818  move.b #$A3,D0 / and.b D0,(A6)
    26d81e  move.w D1,($6E,A6)                    the hit mask is SAVED, unlike any band member
    26d822  jsr $286096                           scoreHit
    26d828  D0 = ($1D,A6) ; eori.b #$F,D0 ; store  <-- a LITERAL $F, not ($19,A5)
    26d834  move.l #$7FFF,D0 / sub.w ($18,A6),D0   the damage TAKEN this frame
    26d83e  sub.l D0,($32,A5)                     ... subtracted from a LONG accumulator
    26d842  move.w #$7FFF,($18,A6)                ... and the sink is RE-ARMED
    26d848  tst.l ($32,A5) / bpl $26D898          alive while the LONG is non-negative
    26d850  move.l #$600,D0 / jsr $28615E         scoreKill $600
    26d85c  move.w #$20,D0 ...

**`($18,A6)` IS NOT `$47`'s HP.** It is a per-frame damage SINK: the bullet code decrements it, and each
frame `$47` computes `$7FFF - ($18,A6)` as the damage taken, subtracts that from the real HP -- a **LONG** at
`($32,A5)` -- and re-arms the sink to `$7FFF`. Reading `($18,A6)` as the HP, as every band member's
`tst.w ($18,A6)` does, would make `$47` effectively immortal.

**AND THE PORT ALREADY HAS THIS PATTERN, IN FOUR PLACES** -- `boss3.js:110`, `boss4.js:224`,
`handlers.js:6221` (all `u16(0x7fff - ...)`) and `midboss.js:727` (the re-arm). So do not invent it: read one
of those and match it. **Sixth family check to pay off this session**, and this one also settles what `$47`
is: the `$7FFF` sink plus a long HP accumulator is a BOSS/large-structure idiom, which together with
`pushExternalSpeed` on retirement and the per-frame palette repaint makes `$47` a scroll-stopping set-piece
beyond reasonable doubt.

Two more per-type details: the palette XOR uses the **literal `$F`** rather than `($19,A5)`, and the hit mask
is saved to `($6E,A6)` -- neither appears anywhere in the band.

Still to read for `$47`: `$26D810` (4 bytes, confirm the mask), `$26D738` (1 instruction), `$26D85C..$26DAC8`
(the death tail and alive path) and `$26DAC8` (the draw). Window `$26D740 + $A0`; check `$224F38` against
W91's palette family window.

### `$47` HAS TWO UNPORTED SHARED PREREQUISITES. PORT THEM FIRST, AS THEIR OWN WAVES. (W339)

Confirmed by displaying the bytes: `$26D810` is `725C C216` = `moveq #$5C,D1 / and.b (A6),D1`, the same `$5C`
mask the band uses. And `$26D738` is `jsr $23C4A0 / rts` -- the init's tail is a CALL.

Running the callee check on everything `$47` touches:

    $23C4A0   NOT PORTED   -- SIX callers ($26D738, $29B6EA, $2A5D14, +3)
    $26C74E   NOT PORTED   -- SIX callers ($26C7A8, $26C7CE, $26C838, +3)
    $26DCB6   NOT PORTED   -- reached by `bsr` from inside `$47`; likely private
    $28C310   ported       -- already used at `handlers.js:6160` as a death-burst cue
    $261100   ported       -- `pushExternalSpeed` (background.js)
    $24150A   ported       -- `installBank`
    $286096` / `$28615E` / `$2637A2` / `$26377A` / `$263808`   all ported

**`$26C74E` IS `$47`'s DEATH-SPAWN WALKER AND IT IS *NOT* `$270D92`.** `$26D880 lea ($26DCEC,PC),A1 / jsr
$26C74E` is the same construction the band uses with `$270D92`, but a different routine with its own six
callers. Do NOT reach for `walkDeathSpawns270D92` here; the entry format is unverified and W333's whole point
was that the stride must come from the code.

**SO THE ORDER IS: `$23C4A0`, THEN `$26C74E`, THEN `$47`.** Six callers each means both are shared
infrastructure, and W333 established the payoff: porting `$270D92` first turned three types from "read a
death arm each" into "one call each". Porting either of these inside `$47`'s wave repeats the mistake that
lesson exists to prevent -- and `$47` is `$E2` records, the wave least able to absorb a surprise.

**MORE `$47` PER-TYPE DETAILS** (none shared with the band): the death path pushes `pushExternalSpeed` a
SECOND time (`$26D864`, so both death and retirement stop the scroll); it marks with `(A6) = $8000` and
`($7F,A6) = 1` -- note **`+$7F`, not `+$3F`**, because the record is `$80` bytes; it clears `$8130DC`; its
sound cue is `$28C310` where the band uses `$28C2DC`; and its not-hit palette restore writes the **literal
`$10`** to `($1D,A6)` rather than `($18,A5)`.

Still to read for `$47`: `$26D89C..$26DAC8` (the rest of the alive path), `$26DAC8` (the draw), `$26DCB6`,
and the two prerequisites. Window `$26D740 + $A0`; check `$224F38` against W91's palette family window.

### CORRECTION: `$23C4A0` IS NOT A PREREQUISITE WAVE. IT IS THREE LINES. (W339)

The previous section said the order was "`$23C4A0`, then `$26C74E`, then `$47`", treating both as shared
infrastructure on the strength of six callers each. **That over-scoped `$23C4A0`.** Displayed:

    23c4a0  move.w #$1,$803934 / clr.w $803936 / rts
    23c4b0  move.w #$6,$803934 / clr.w $803936 / rts
    23c4c0  move.w #$5,$803934 / clr.w $803936 / rts
    23c4d0  clr.w $803934      / move.w #$1,$803936 / rts

**It is one of a family of three-instruction MODE SETTERS**, each writing a number to `$803934` and clearing
`$803936` (or the reverse). Six callers because it is a one-line helper, not because it is infrastructure --
**caller count alone does not distinguish "shared subsystem" from "trivial setter", and I used it as if it
did.**

And both globals are ALREADY in the port: `background.js:1336-1337` writes exactly `$803934 = 0` /
`$803936 = 1`, which **is `$23C4D0`, inlined** in the screen-shake arm. So these are the screen-shake / camera
mode words, the port already produces and consumes them, and `$23C4A0` is two `setU16` calls plus a name.

**REVISED ORDER: `$26C74E` (the real prerequisite, `$47`'s death-spawn walker), then `$47`, with `$23C4A0`
written inline inside `$47`'s wave as `shakeMode23C4A0` or similar.** One wave saved.

**SEVENTH family check to pay off this session**, and the first where it corrected a plan rather than a fact.
The lesson sharpens: run the check on every callee, and read the FIRST INSTRUCTION before deciding a routine
deserves its own wave. `$2714AE` was a bare `rts` (W336), `$23C4A0` is three instructions -- twice now, sizing
a routine by its caller count or its address rather than by its body has produced the wrong plan.

### `$26C74E` IS `$270D92`'s TWIN, DIFFERING IN ONE CONSTANT. THE LAST PREREQUISITE COLLAPSES. (W339)

    $26C74E head:  32 19 0c 41 ff ff 67 00 00 34    move.w (A1)+,D1 / cmpi.w #-1,D1 / beq $26C78A
    $270D92 head:  32 19 0c 41 ff ff ...             IDENTICAL

    $270DB6:  31 7c 00 04 00 1e     move.w #$4,($1E,A0)
    $26C772:  31 7c 00 10 00 1e     move.w #$10,($1E,A0)    <-- THE ONLY DIFFERENCE

Field for field the same walker: word 1 to `($18,A0)`, word 2 as the effect KIND through `$289004`, word 3's
LOW BYTE to `($1C,A0)`, a LONG to `($26,A0)`, the caller's D2 to `($2,A0)`, zeros to `($12,A0)`/`($14,A0)`,
word 6 to `($1A,A0)`, `$FFFF` terminates, twelve bytes per entry. **The only divergence in the whole routine
is `($1E,A0)`: `$4` in `$270D92`, `$10` in `$26C74E`.**

So there is **no prerequisite wave left**. `effects.js:348` already hardcodes `ram.setU16(slot + 0x1e, 4)`;
give `walkDeathSpawns270D92` an `anim` parameter defaulting to `4`, pass `0x10` for `$26C74E`, and pass the
site address as it already does. Both of `$47`'s "prerequisites" have now dissolved -- `$23C4A0` into three
inline lines, `$26C74E` into one parameter.

**EIGHTH family check to pay off this session, and it retired the entire prerequisite plan.** The sequence is
worth reading as one thing: caller count said "two shared subsystems, two waves"; displaying ten bytes of each
said "one parameter and two `setU16`s". **`$47` can now be written as a single wave** once `$26D89C..$26DAC8`,
`$26DAC8` and `$26DCB6` are read.

Do keep the two names distinct in the port. The generalised helper should still record BOTH addresses in its
docstring and the caller should pass the site (`0x271680`-style) so `bulletSpawn`/note attribution stays
truthful about which ROM routine ran -- W333's `siteAddr` parameter already exists for exactly this.

### `$47`'s ALIVE PATH, `$26D89C..$26D8FE` (W339) -- `($17,A5)` IS A STATE VARIABLE HERE

    26d89c  moveq #$0,D0 / move.w ($2,A6),D0 / ext.l / addi.l #$4000
    26d8aa  cmpi.l #$800,D0 / bgt $26D8CC        <-- limit $800, a FIFTH distinct value
    26d8b4  tst.b ($16,A5) / beq $26D8D2
    26d8bc  move.w #$0,$8130DC / jmp $263762     the off-screen free ALSO clears the global
    26d8cc  move.b #$1,($16,A5)
    26d8d2  jsr $24179E                          scrollCompensate
    26d8d8  tst.b ($7F,A6) / bne $26DAC8         the mark -- and $26DAC8 IS THE DRAW
    26d8e0  cmpi.b #$0,($17,A5) / bne $26D8F8    <-- ($17,A5) AS A STATE NUMBER
    26d8ea  subq.w #1,($1C,A5) / bne $26D8F8     a WORD countdown, not a byte
    26d8f2  move.b #$1,($17,A5)                  state 0 -> 1
    26d8f8  cmpi.b #$1,($17,A5) / bne $26D976    state 1's arm begins

**A MARKED `$47` DOES NOT DRAW. THIS SENTENCE PREVIOUSLY CLAIMED THE OPPOSITE AND WAS WRONG.**
`$26D8DC` branches to `$26DAC8`, which I recorded as "the draw" -- but `$26DAC8` is itself
`tst.b ($7F,A6) / bne $26DAF2`, and `$26DAF2` is `4E75`, an `rts`. So the mark is tested a SECOND time at
the draw's own entry and a marked `$47` returns without painting, exactly like `$48` and `$4A`. I called
`$26DAC8` the draw from the branch target alone without displaying its first instruction -- the same error
this document records eight other instances of.

**`($17,A5)` IS A STATE NUMBER, NOT A MIRROR FLAG.** In all four band members `($17,A5)` was the
mirror/table-select bit written once by the init. `$47` uses it as a multi-state machine variable, tested
with `cmpi.b #$0` then `cmpi.b #$1`, advanced by a countdown on `($1C,A5)`. **The band's reading of that
offset does not transfer** -- and `($1C,A5)` is likewise a WORD countdown here where the band used it as a
sweep/ring index.

**Nothing about record offsets is portable between `$47` and the band.** `($17,A5)` state vs mirror,
`($1C,A5)` countdown vs index, `($18,A6)` damage sink vs HP, `+$7F` mark vs `+$3F`, `($32,A5)` long HP
where the band has none. Read every offset from `$47`'s own code.

Five off-screen limits now, one idiom: `$2000` (`$49`), `$1C00` (`$4A`), `$400` (`$4B`), `$2C00` (`$48`),
`$800` (`$47`).

Still to read for `$47`: `$26D8FE..$26DAC8` (states 1+), `$26DAC8` (the draw) and `$26DCB6`.

### `$47` STATE 1, `$26D902..$26D970` (W339) -- SEVEN word-literal-as-two-bytes writes in a row

    26d902  subq.b #1,($18,A5) / bcc $26D976       a cadence on ($18,A5)/($19,A5)
    26d90a  move.b ($19,A5),($18,A5)
    26d910  addq.w #4,($1A,A5) / cmpi.w #$1C,($1A,A5) / blt      an OPENING RAMP, 8 steps of 4
    26d91e  move.w #$1C,($1A,A5)                   clamped, not wrapped
    26d924  move.w #$0,$803934 / move.w #$0,$803936    <-- CLEARS BOTH SCREEN-SHAKE WORDS
    26d934  move.b #$2,($17,A5)                     state 1 -> 2
    26d93a  move.w #$1020,($1E,A5)                  ($1E)=$10  ($1F)=$20
    26d940  move.w #$606,($20,A5)                   ($20)=$06  ($21)=$06
    26d946  move.w #$6,($22,A5)                     ($22)=$00  ($23)=$06   <-- THE TRAP, PUREST FORM
    26d94c  move.w #$2030,($24,A5)                  ($24)=$20  ($25)=$30
    26d952  move.w #$404,($26,A5)                   ($26)=$04  ($27)=$04
    26d958  move.w #$4,($28,A5)                     ($28)=$00  ($29)=$04   <-- again
    26d95e  move.b #$0,($2A,A5) / move.b #$0,($2B,A5)   genuine BYTE writes, for contrast
    26d96a  move.w #$6040,($2C,A5)                  ($2C)=$60  ($2D)=$40

**THE WORD-LITERAL RULE, SEVEN TIMES IN ONE BLOCK.** `move.w #$6,($22,A5)` writes **`$00` to `($22,A5)`
and `$06` to `($23,A5)`** -- the byte the literal names lands in the SECOND field. Read as "`($22,A5) = 6`"
this whole block would misconfigure seven cadence pairs at once, and every one of them is a timer reload,
so the symptom would be wrong firing rates rather than a crash.

`$26D95E`/`$26D964` are genuine `move.b`s to `($2A,A5)` and `($2B,A5)`, sitting in the middle of the block.
**The mix is the hazard**: two real byte writes among seven word-pair writes, so a reader who spots the rule
and applies it uniformly gets those two wrong in the other direction.

**`$26D924` CONFIRMS THE SCREEN-SHAKE READING.** The init calls `$23C4A0`, which sets `$803934 = 1` and
clears `$803936`; state 1 clears BOTH. So `$47` starts a screen shake on spawn and stops it when its opening
ramp completes -- which is exactly what a scroll-stopping set-piece arriving on screen would do, and it
independently corroborates that `$803934`/`$803936` are the shake mode words `background.js` already writes.

`($1A,A5)` is an 8-step ramp CLAMPED at `$1C` (`move.w #$1C` after the `blt`), not wrapped -- unlike every
band ring. `($18,A5)`/`($19,A5)` are a cadence pair here, where in the band `($18,A5)` was the base palette.

Still to read for `$47`: `$26D976` onward (state 2+), `$26DAC8` (the draw) and `$26DCB6`.

### `$47` STATE 2, `$26D98E..$26D9E2` (W339) -- THE PACKED-LONG BORROW, DEMONSTRATED BY THE ROM ITSELF

    26d98e  tst.w $8130D4 / bne $26DA74            the freeze (D4, not D2 -- $47 tests BOTH, separately)
    26d998  movem.w ($2,A6),D0-D1                  SIGN-EXTENDING
    26d99e  addi.w #-$580,D0  /  addi.w #-$800,D1   muzzle 1's WORD biases
    26d9a6  jsr $24200A / bcs $26DA74              aim -- and a REAL `bcs` here, unlike $4A/$48
    26d9b0  moveq #$D,D0 / move.l ($2,A6),D2
    26d9b6  addi.l #-$5800800,D2                   = $FA7FF800   <-- NOTE THE HIGH WORD
    26d9c0  movem.w ($2,A6),D0-D1
    26d9c6  addi.w #-$580,D0  /  addi.w #$800,D1    muzzle 2: same X bias, OPPOSITE Y
    26d9ce  jsr $24200A
    26d9d4  moveq #$D,D0 / move.l ($2,A6),D2
    26d9da  addi.l #-$57FF800,D2                   = $FA800800

**THE ROM PRE-SUBTRACTS THE BORROW AND A PORT MUST NOT RE-DERIVE IT.** Muzzle 1's word biases are `-$580`
(high) and `-$800` (low). Combining them naively gives `$FA80F800`. **The ROM's longword is `$FA7FF800`** --
high word `$FA7F`, one LESS -- because as a single `addi.l` the low half's borrow takes one off the high
half. Muzzle 2's low bias is POSITIVE, so no borrow, and its long `$FA800800` does match naive combination.

So the two muzzles differ by exactly the borrow, and that is the cleanest demonstration in the whole port of
why packed position offsets must be transcribed as the longword the ROM writes rather than assembled from
the word pair. **Transcribe `$FA7FF800` and `$FA800800` literally.** Deriving either from `-$580`/`∓$800`
gets muzzle 1 one unit off in X -- invisible in a test, visible as a misaligned muzzle.

**`$24200A` IS KNOWN TO THE PORT**: `aim.js:81` carries it in the aim-variant table as `[0x24200a, 61]` --
sixty-one callers. But `initbody.js:822` still holds a `note` for it in type `$80`'s init, so **check whether
the variant is actually executed or only tabulated** before relying on it; that distinction is exactly what
`grep 0x2xxxxx is NOT a test for "is this ported"` was written for.

Two more `$47`-only details: it tests `$8130D4` here having tested `$8130D2` at `$26D7E0`, so it gates on
BOTH freeze words at different points -- no band member does that. And `$26D9AC bcs` is a REAL carry test on
the aim result, where `$4A` and `$48` have none and store the biased X instead (W323's trap). `$47` skips the
volley properly.

Still to read for `$47`: `$26D9E8..$26DAC8` (state 2's tail and state 3+), `$26DAC8` (the draw), `$26DCB6`.

### THE PACKED-LONG BORROW, NOW A CHECKED RULE ACROSS FOUR MUZZLES (W339)

`$47`'s state 2 fires from at least five muzzles, each set up as a word pair for the aim and a longword for
the bullet position. Tabulating four of them against the ROM's own constants:

      Xbias   Ybias    ROM long    naive       borrow?
      -1408   -2048    fa7ff800    fa80f800    YES
      -1408   +2048    fa800800    fa800800    no
      +3968   +1728    0f8006c0    0f8006c0    no
      +5056   -1024    13bffc00    13c0fc00    YES

**`long = ((Xbias << 16) | Ybias) - (0x10000 if Ybias < 0 else 0)`** -- verified against all four. The high
word is decremented by exactly one whenever the Y bias is negative, because a single `addi.l` propagates the
low half's borrow.

That is no longer an abstract caution: **two of these four differ from the naive combination and two do not**,
in the same routine, with the same X bias in the first pair. A port that derived the longs from the word pairs
would misplace the negative-Y muzzles by one unit in X and leave the positive-Y ones correct -- the worst
possible failure shape, because it looks like a subtle art or table problem rather than an arithmetic one.

**TRANSCRIBE EVERY `addi.l` CONSTANT LITERALLY.** Do not compute it, do not "simplify" it to the word pair it
appears to encode, and do not assume two muzzles with the same X bias share a high word. The four constants
above and any further ones in `$26DA5E..$26DAC8` come out of the image verbatim.

This is also why `movem.w ($2,A6),D0-D1` matters alongside them: the aim path gets SIGN-EXTENDED words and the
position path gets the packed longword. Two different readings of the same `($2,A6)` in adjacent instructions.

Still to read for `$47`: `$26DA5E..$26DAC8` (the remaining muzzles and state 2's tail), `$26DAC8` (the draw)
and `$26DCB6`.

### `$47`'s SECOND STATE MACHINE MIXES A5 AND A6 AT THE SAME OFFSET (W339)

    26da6a  addi.l #$13C00400,D2               muzzle 5: +$13C0/+$400, positive Y, NO borrow -- rule holds
    26da74  0c2d 0001 002e   cmpi.b #$1,($2E,A5)      <-- tests A5
    26da7a  bne $26DA90
    26da7e  536e 002e        subq.w #1,($2E,A6)       <-- decrements A6
    26da82  bne $26DA90
    26da86  bsr $26DB14                              another private subroutine
    26da8a  move.b #$2,($2E,A5)                       advances A5
    26da90  cmpi.b #$2,($2E,A5) / bne $26DAAC         state 2's arm

**THE OFFSET IS `$2E` IN ALL FOUR INSTRUCTIONS AND THE BASE REGISTER IS NOT.** `$26DA74` and `$26DA8A` use
**A5** (the record); `$26DA7E` uses **A6** (the sub-record). Checked in the encoding rather than trusted from
the disassembler: `536E` is `subq.w #1,(d16,A6)` -- `536D` would be A5. So the state number lives at
`($2E,A5)` and its countdown lives at `($2E,A6)`, two different fields that share an offset.

This reads exactly like a transcription slip and is not one. **A port that "corrected" it to a single field
would fuse a state variable with its timer**, and the symptom would be a set-piece that changes phase on the
wrong frame -- no crash, nothing for the suite to catch. Copy the register letters from the encoding, and when
`$47` is written, put a comment on that line saying why the two differ, or the next reader will try to fix it.

Note also this is a SECOND state machine: `($17,A5)` drives states 0/1/2 (`$26D8E0` onward) and `($2E,A5)`
drives an independent one nested inside state 2. `($2E,A5)` is also the offset `bossf23.js`/`bossphase.js`
read as a per-part dead flag on OTHER types -- another offset whose meaning does not travel.

Muzzle 5's long `$13C00400` is the fifth data point for the borrow rule and it agrees: positive Y, no borrow,
naive combination correct.

Still to read for `$47`: `$26DAAC..$26DAC8`, `$26DAC8` (the draw), `$26DB14` and `$26DCB6`.

### `$47` STATE 3 AND THE DRAW ENTRY, `$26DAAC..$26DAD0` (W339) -- plus a correction

    26daac  cmpi.b #$3,($2E,A5) / bne $26DAC8
    26dab6  bsr $26DC00 / bcs $26DAC8            a subroutine that reports FAILURE through carry
    26dabe  move.b #$2,($2E,A5)                  on success, back to state 2
    26dac4  bsr $26DB14
    26dac8  tst.b ($7F,A6) / bne $26DAF2         <-- the draw's OWN mark test
    26dad0  lea ($26DAF4,PC),A0                  the draw table
    26daf2  4E75                                 rts

**CORRECTION, and it is the ninth of this kind in this run.** An earlier section here said "a marked `$47`
STILL DRAWS", reasoning that `$26D8DC bne $26DAC8` jumps to the draw. `$26DAC8`'s first instruction is
another `tst.b ($7F,A6)` whose `bne` lands on an `rts`. **A marked `$47` returns without painting**, the
same as `$48` and `$4A`. I named `$26DAC8` "the draw" from the branch target alone, without displaying its
first instruction. Corrected in place above.

The pattern in every one of these nine: I described a span I had not displayed. The fix each time was one
command. **Display the first instruction of every branch target before naming what it is.**

**`($2E,A5)` STATES 2 AND 3 FORM A LOOP.** State 3 calls `$26DC00`, and on CARRY CLEAR returns to state 2
and calls `$26DB14`; on carry set it falls through to the draw and stays in state 3. So `$26DC00` reports
failure through carry -- read it before writing this, because "which way the carry means retry" decides
whether the set-piece cycles or stalls.

Two more private subroutines to read: `$26DB14` (called from both state 2's inner machine and state 3) and
`$26DC00`. With `$26DCB6` that is three, plus the draw body from `$26DAD0`.

Still to read for `$47`: `$26DAD0..$26DAF2` (the draw body), `$26DAF4` (its table), `$26DB14`, `$26DC00`,
`$26DCB6`.

### `$47`'s DRAW BODY, `$26DAD0..$26DAF2` (W339) -- IT HAS NO TABLE INDEX

    26dad0  41fa 0022    lea ($26DAF4,PC),A0
    26dad4  4e71         nop
    26dad6  2410         move.l (A0),D2          <-- NO `adda.w`. ALWAYS entry 0.
    26dad8  move.l ($2,A6),D1
    26dadc  addi.l #-$1BFF1600,D1                 = $E400EA00
    26dae2  move.w #$1CB0,D3
    26dae6  moveq #$0,D4 / move.b ($1D,A6),D4     <-- D4 from the PALETTE byte, not ($1C,A6)
    26daec  jsr $23DECE
    26daf2  rts

**TWO THINGS HERE THAT EVERY SIBLING WOULD HAVE MISLED ME ABOUT, AND I DISPLAYED THE BYTES FIRST.**

**1. NO INDEX.** `$49`, `$4A`, `$4B` and `$48` all do `lea table,A0 / adda.w ($1C,A5),A0 / move.l (A0),D2`.
`$47` does `lea / nop / move.l (A0),D2` -- there is no `adda.w`, so the main draw ALWAYS uses entry 0,
`$31A600`. The eight-entry table at `$26DAF4` (uniform step `$9A4`) is real, but the main draw never indexes
into it; the remaining seven entries must be reached by the private subroutines (`$26DB14`, `$26DC00`,
`$26DCB6`), which is consistent with a multi-part set-piece drawing its pieces from one table. **Do not add
an index. Do not assume the ring counter feeds this.**

**2. D4 COMES FROM `($1D,A6)`, THE PALETTE BYTE**, via `moveq #$0,D4 / move.b ($1D,A6),D4`. Every band
member loads D4 from `($1C,A6)` with `move.w`. Here it is a BYTE from the next offset -- so `$47`'s draw
passes its palette where its siblings pass their sprite/bank field. Getting this wrong swaps two fields at
once and produces a set-piece drawn in the wrong colours from the wrong bank.

This is the tenth time in this run that displaying beat inferring, and the first where the habit caught the
error BEFORE it reached a document -- I expected an `adda.w` from four consecutive siblings and checked
instead of writing it down. That is the whole return on the rule.

Still to read for `$47`: `$26DB14`, `$26DC00`, `$26DCB6`. Then it can be written: two windows
(`$26D740 + $A0`, and one covering `$26DAF4 + $20` for the eight-entry table), no unported prerequisite, and
twelve traps documented above.

### `$26DB14` (W339) -- a 60-pass `dbra` that computes a triangular number. TRANSCRIBE THE LOOP.

    26db14  move.w #$258,($2A,A6)          TWO byte fields: ($2A)=$02 ($2B)=$58
    26db1a  move.w #$104,($28,A6)          TWO byte fields: ($28)=$01 ($29)=$04
    26db20  jsr $242EC2 / andi.w #$1F,D0   an RNG draw masked to 0..31
    26db2a  move.b #$40,($2C,A6) / sub.b D0,($2C,A6)     ($2C) = $40 - rng
    26db34  move.b #$0,($2D,A6)
    26db3a  move.w #$3B,D7                 <-- #$3B + dbra = SIXTY passes
    26db3e  addq.b #1,($2D,A6)
    26db42  move.b ($2D,A6),D0
    26db46  add.b D0,($2C,A6)
    26db4a  dbra D7,$26DB3E
    26db4e  rts

**THE LOOP IS A TRIANGULAR-NUMBER ACCUMULATION AND IT FOLDS**, verified for rng = 0, 1 and `$1F`:

    ($2D,A6) = $3C  (60)
    ($2C,A6) = ($40 - rng + 1830) & $FF = ($66 - rng) & $FF     [1830 = 60*61/2, mod 256 = $26]

**Transcribe the loop anyway.** The fold is correct, but writing `($2C,A6) = (0x66 - rng) & 0xff` puts a
derived constant in the port where the ROM has an iteration, and the next reader cannot check it without
redoing this algebra. A sixty-iteration byte loop costs nothing at runtime. If it is folded, the proof above
must sit in the comment -- and `move.w #$3B,D7` + `dbra` being SIXTY and not fifty-nine is exactly the kind
of off-by-one the fold would bake in permanently.

Two more `move.w`-into-byte-pairs at the top (`$258` -> `$02`/`$58`, `$104` -> `$01`/`$04`), bringing this
routine's count of that idiom to two and `$47`'s total to nine.

**AND `$26DB14` IS `($2E,A5)`'s TRANSITION ACTION.** It is called from state 2's inner machine (`$26DA86`)
and from state 3 on success (`$26DAC4`), and it re-seeds `($28,A6)` through `($2D,A6)` each time. So the
set-piece's cycle is: state 2 counts down, `$26DB14` re-seeds, state 3 tests `$26DC00`, on success re-seed
again and return to state 2. **`$26DC00` is the last thing needed to know whether that cycle terminates.**

Still to read for `$47`: `$26DC00` and `$26DCB6`.

### `$26DC00` (W339) -- `subq.b` + `bpl`, so the counter goes NEGATIVE. `due8` IS WRONG HERE.

    26dc04  subq.b #1,($48,A6) / bpl $26DC3C      <-- bpl, NOT bcc. SIGNED.
    26dc0a  move.b ($4C,A6),D0 / addi.b #$10,D0
    26dc12  cmpi.b #$20,D0 / bhi $26DC28          an UNSIGNED range test: is ($4C,A6) outside -$10..+$10?
    26dc1a  cmpi.b #-$2,($48,A6) / bgt $26DCA2    inside the band: threshold -2
    26dc28  cmpi.b #-$3,($48,A6) / bgt $26DCA2    outside it: threshold -3
    26dc32  move.b ($49,A6),($48,A6) / bra $26DCA2    the reload

**THE COUNTER IS SIGNED AND RUNS PAST ZERO.** `subq.b` then `bpl` continues while the result is
NON-NEGATIVE, so `($48,A6)` reaches `-1`, `-2`, `-3` before the reload. **The port's `due8` helper implements
the `bcc`/underflow convention** -- fire when the decrement borrows -- which is what six of seven countdowns
in W27 used and what every band member uses. Using `due8` here fires a frame early and never reaches the
negative thresholds at all. Write this countdown by hand.

**AND THE THRESHOLD DEPENDS ON AN ALIGNMENT TEST.** `($4C,A6) + $10` compared `bhi #$20` is the idiomatic
signed-range-via-unsigned-compare: it asks whether `($4C,A6)` lies within `-$10..+$10`. Inside that band the
counter is allowed to reach `-2`; outside it, `-3`. So the set-piece holds one extra frame when whatever
`($4C,A6)` measures is near zero. Three different comparison flavours in nine instructions -- `bpl` signed,
`bhi` unsigned, `bgt` signed -- and each one is load-bearing.

**WHAT THIS DOES *NOT* ANSWER.** `$26DABA bcs` expects `$26DC00` to report through CARRY, and nothing in
`$26DC00..$26DC38` sets carry explicitly; every path here branches to `$26DCA2`, which is still unread. So
**whether the state-2/state-3 cycle terminates is still open** and `$26DCA2` onward is the place it is
decided. Recorded as open rather than guessed, because the earlier version of this section would have said
"the gate reloads and returns" and been describing a span it had not displayed.

Still to read for `$47`: `$26DC3C..$26DCB6` (including `$26DCA2`, which carries the answer above) and
`$26DCB6` itself.

### `$26DCA2` ANSWERS THE CARRY QUESTION, AND `$26DCB6` EXPLAINS `($6E,A6)` (W339)

    26dca2..26dca8   6 bytes NOT YET DISPLAYED -- the condition that picks between the two exits
    26dcaa  ori  #$1,SR    / rts        <-- FAILURE: carry SET
    26dcb0  andi #$FFFE,SR / rts        <-- SUCCESS: carry CLEAR

**So `$26DC00` does report through carry, by writing SR directly** -- the same house idiom as `$281842
ori #$1,SR` on the bullet spawner's full-pool path (W336). Two independent routines in this ROM return
status by `ori`/`andi` on SR rather than by a flag-setting operation, so treat "explicit SR write" as this
codebase's convention for a boolean return and look for it whenever a caller has a `bcs`/`bcc` with no
obvious flag source. The condition at `$26DCA2` is still six undisplayed bytes; **`$26DABA bcs` means carry
set is the retry/stall path**, so those six bytes decide whether the state-2/3 cycle advances.

    26dcb6  tst.b ($7F,A6) / beq $26DCE0        <-- runs ONLY when the record IS MARKED
    26dcbe  cmpi.b #$0,($66,A6) / bne $26DCE0
    26dcc8  move.w ($6E,A6),D1                  <-- THE HIT MASK THE DAMAGE ARM SAVED

**`$26DCB6` IS WHY `$26D81E move.w D1,($6E,A6)` EXISTS.** That store looked gratuitous when the damage arm
was read -- no band member saves its hit mask -- and this is its only consumer. `$26DCB6` runs on MARKED
records only (`beq` skips when the flag is clear, the inverse polarity of the three tests in the handler) and
reads the saved mask to drive its dying-state effect. **So the damage arm's `($6E,A6)` write must be ported
even though nothing in the damage arm itself uses it.**

That is the fourth place `($7F,A6)` is tested and the first with INVERTED sense: the handler's three tests
skip work when the mark is SET, and this one skips when it is CLEAR. A port that factored "if marked, return"
into a shared guard would invert this routine.

Still to read for `$47`: `$26DCA2..$26DCA8` (six bytes -- the carry condition), `$26DC3C..$26DCA2`, and
`$26DCCC..$26DCE0` (the rest of `$26DCB6`). Then the read is complete.

### THE OPEN QUESTION IS ANSWERED: `$47`'s STATE-2/3 CYCLE TERMINATES (W339)

    26dca2  subq.w #1,($4A,A6)
    26dca6  beq $26DCB0          <-- ZERO, not underflow
    26dcaa  ori  #$1,SR / rts     carry SET   -> $26DABA bcs -> stay in state 3
    26dcb0  andi #$FFFE,SR / rts  carry CLEAR -> state 3 goes back to state 2 and re-seeds

**`($4A,A6)` IS A REPEAT COUNTER AND THE CYCLE RUNS EXACTLY THAT MANY TIMES.** While it is non-zero
`$26DC00` returns carry SET, `$26DABA bcs` sends `$47` to the draw and it stays in state 3. On the frame the
counter REACHES zero, carry is clear, state 3 writes `#$2` to `($2E,A5)` and calls `$26DB14` to re-seed. So
the set-piece cycles a bounded number of times rather than indefinitely -- the question left open two
sections ago, now answered by displaying the six bytes rather than reasoning about them.

**AND IT IS THE `$25354C` SHAPE, WHICH THIS PROJECT HAS ALREADY BEEN BITTEN BY.** `subq.w` + **`beq`** fires
when the counter REACHES zero, not when it underflows. W29's `$25354C` note and the test in
`integration.test.js` ("`$25354C` fires when `$81B410` REACHES zero, not when it underflows") exist precisely
because six of seven W27 countdowns use the `subq`/`bcc` underflow shape and applying that heuristic to a
`beq` one acts a frame late and then again every 65,536 frames. **`$47` now contains BOTH conventions**:
`$26DC04`'s `subq.b`/`bpl` (signed, runs negative) and `$26DCA2`'s `subq.w`/`beq` (fires at zero), fourteen
bytes apart. Neither is `due8`.

Three countdown conventions are now attested in this ROM and `$47` uses two of them in one routine:

    subq + bcc    fire on UNDERFLOW      the common shape; `due8` implements this
    subq + bpl    run into NEGATIVES     $26DC04 -- thresholds at -2/-3
    subq + beq    fire AT ZERO           $26DCA2, and $25354C (W29)

**Read the branch mnemonic on every countdown.** It is two characters and it selects between three different
behaviours.

Still to read for `$47`: `$26DC3C..$26DCA2` and `$26DCCC..$26DCE0`. Everything else is read.

### `$47` STATE 3'S ATTACK IS RANK-GATED, `$26DC3C..$26DC74` (W339)

    26dc40  move.l #$FFFD0004,D0
    26dc46  move.l ($2,A6),D2 / addi.l #$10000000,D2     a PURE high-word bias: +$1000 X, 0 Y, no borrow
    26dc50  moveq #$0,D3 / moveq #$0,D4
    26dc54  tst.w $813098 / bne $26DC70                  <-- THE RANK GATE ($813098 = G.rank98)
    26dc5e  jsr $281744                                  rank 0: shot 1
    26dc64  neg.b D1                                     ... mirrored by a BYTE negate
    26dc66  jsr $281744                                  ... shot 2
    26dc6c  bra $26DCA2                                  straight to the repeat counter
    26dc70  tst.w ($4E,A6) / bne $26DC8A                 rank > 0: a DIFFERENT, longer pattern

**THE ATTACK SCALES WITH RANK AND THE TWO ARMS ARE STRUCTURALLY DIFFERENT.** At rank 0 `$47` fires a
mirrored PAIR and jumps straight to the repeat counter. Above rank 0 it takes a separate arm gated on
`($4E,A6)` running to at least `$26DC8A`. This is not a parameter difference like the band's -- it is two
code paths. `$813098` is already `G.rank98` in `handlers.js` and `$81B414`-style rank reads appear across the
port, so the gate itself is familiar; **what matters is not folding the two arms together.**

**`neg.b D1` IS A HEADING MIRROR AND IS NOT THE `neg.w` TRAP.** Headings in this game are BYTES over 256
directions, so `neg.b` is the correct and complete mirror. That is a different operation from `$27172C`/
`$271E30`'s `neg.w D3` on a `move.l`-loaded PACKED OFFSET, where the word negate leaves the high half alone
and is a trap. **Two negates, two widths, two purposes** -- do not unify them or "fix" either. The
distinguishing question is what the register holds: a heading byte or a packed coordinate pair.

`$26DC4A addi.l #$10000000` is also worth one line: a pure high-word bias, so there is no borrow and the
naive reading is correct here. That makes three flavours of position bias in `$47` alone -- borrowing
(`$FA7FF800`), non-borrowing negative-Y (`$FA800800`) and high-word-only (`$10000000`) -- and only the first
needs the rule.

Still to read for `$47`: `$26DC74..$26DCA2` (the rank > 0 arm) and `$26DCCC..$26DCE0`.

### `$47` STATE 3, THE RANK > 0 ARM, `$26DC70..$26DCA0` (W339) -- IT ALTERNATES BULLET TYPES

    26dc70  tst.w ($4E,A6) / bne $26DC8A
    26dc78  jsr $281744 / neg.b D1 / jsr $281744    toggle 0: a mirrored pair, the RANK-0 spawner
    26dc86  bra $26DC98
    26dc8a  jsr $2816F6 / neg.b D1 / jsr $2816F6    toggle 1: a mirrored pair, a DIFFERENT spawner
    26dc98  addq.w #1,($4E,A6) / andi.w #$1,($4E,A6)    the 0/1 TOGGLE
    26dca2  ... falls into the repeat counter

**SO THE RANK SCALING IS AN INTERLEAVE, NOT A VOLUME INCREASE.** At rank 0, `$47` fires a mirrored pair
through `$281744` every volley and nothing else. Above rank 0 it fires the SAME pair count but alternates the
spawner every volley -- `$281744`, then `$2816F6`, then `$281744` -- so the player sees two bullet types
interleaved rather than more bullets. That is a much more specific piece of behaviour than "harder at rank",
and it is the kind of thing a port that collapsed the two arms would silently lose while still looking right
in a screenshot.

`($4E,A6)` is masked with `andi.w #$1`, the same 2-state toggle construction as `$48`'s `($25,A5)`
(`addq.b #1 / andi.b #$1`) -- one of the few idioms that IS shared across this part of stage 5. `neg.b D1`
mirrors the pair in all three arms identically.

**`$47`'s STATE-3 ATTACK IS NOW FULLY READ:**

    rank 0                 mirrored pair via $281744
    rank > 0, ($4E,A6)=0   mirrored pair via $281744
    rank > 0, ($4E,A6)=1   mirrored pair via $2816F6

all sharing D0 = `$FFFD0004`, D2 = `($2,A6) + $10000000`, D3 = D4 = 0.

Still to read for `$47`: `$26DCCC..$26DCE0` only -- the tail of `$26DCB6`, the marked-record effect. That is
the last span.

### `$47` IS READ END TO END (W339). `$26DCB6` IS WHAT RETIRES IT, AND `+$7E`/`+$7F` ARE DIFFERENT FLAGS.

    26dcb6  tst.b ($7F,A6) / beq $26DCE0        runs only when MARKED (inverted vs the handler's tests)
    26dcbe  cmpi.b #$0,($66,A6) / bne $26DCE0
    26dcc8  move.w ($6E,A6),D1                  the hit mask the damage arm saved at $26D81E
    26dccc  jsr $243E02                         armScreenClearMode -- ALREADY PORTED (midboss.js:235)
    26dcd2  subq.w #1,($70,A6) / bne $26DCE0    a word countdown
    26dcda  move.b #$1,($7E,A6)                 <-- SETS THE HANDLER'S RETIREMENT TRIGGER
    26dce0  andi #$FFFE,SR / rts                carry clear
    26dce6  ori  #$1,SR    / rts                carry set

**THE LIFETIME LOOP CLOSES HERE.** Damage sets the `$8000` mark and `($7F,A6) = 1` (`$26D86A`/`$26D86E`).
`$26DCB6` then runs on marked records only, feeds the saved hit mask to `armScreenClearMode`, and counts
`($70,A6)` down; when that reaches zero it sets **`($7E,A6) = 1`**, which is exactly what the handler tests at
`$26D7EA` to run its retirement (clear `$8130DC`, `pushExternalSpeed`, `freeEnemy`).

**`+$7E` AND `+$7F` ARE ADJACENT BYTES WITH COMPLETELY DIFFERENT ROLES.** `($7F,A6)` means "I am dying" and
gates four tests; `($7E,A6)` means "retire me now" and gates one. One byte apart, in an `$80`-byte record, both
written as `move.b #$1`. **Do not conflate them and do not typo them** -- swapping them makes `$47` either
immortal or instantly gone, and both look like a spawn-table problem rather than a one-nibble error.

**`$243E02` IS ALREADY PORTED** as `armScreenClearMode` (`midboss.js:235`, nine callers). **NINTH family check
to pay off this session.** So `$47` has NO unported callee of any kind:

    ported: $2637A2 $26377A $263808 $286096 $28615E $24179E $24200A $242EC2 $24150A $261100
            $23DECE $243E02 $28C310 $26C74E (via the W339 anim parameter)
    inline: $23C4A0 (three lines)
    omit:   nothing

**`$47` CAN NOW BE WRITTEN.** Windows: `$26D740 + $A0` (16-word record prototype + FOUR sub prototypes,
overlapping the handler by SIXTEEN bytes) and one covering `$26DAF4 + $20` (the eight-entry draw table) plus
`$26DCEC` (the `$26C74E` death list -- measure its length first). Twenty-one traps are documented in the
sections above; the load-bearing ones are the `($18,A6)` damage sink, the `+$7E`/`+$7F` pair, the three
countdown conventions, the packed-long borrow, the missing draw index, and the rank interleave.

### `$1A`'s BLOCKER IS NOW ONE SPECIFIC READ, NOT AN OPEN QUESTION (W340)

The standing note said `$1A` is "blocked until D2/D3 at `$268D8C` are measured". Narrowed:

    268d72  jsr $263808                       readInitPosition
    268d78  lea $272C7A,A0
    268d7e  movem.w ($2,A6),D0-D1             SIGN-EXTENDING -- sets D0 and D1 ONLY
    268d84  addi.w #$B00,D0
    268d88  addi.w #$0,D1                     a REAL instruction that adds zero; do not drop it
    268d8c  jsr $24203E
    268d92  bcc $268D98

**`aim.js:62` ALREADY DOCUMENTS THE CONVENTION**: `core64: 0x24203e,  // aim64 CORE  self=D0/D1
target=D2/D3 -> D1`. So D2/D3 are the TARGET coordinates, and reading upward from `$268D8C` until they
are dead: **nothing in `$1A`'s init writes them at all.** `$268D7E` sets D0/D1, `$268D78` sets A0, and
before that is `jsr $263808`. So the target is whatever `readInitPosition` leaves in D2/D3.

**THE BLOCKER IS THEREFORE: read `$263808` to its `rts` and record its exit state in D2/D3.** That is one
routine and one register pair, not an open-ended provenance hunt. Two possibilities and they are
distinguishable by reading it: either `$263808` deliberately leaves the player position there (in which
case `$1A` aims at the player and the port passes it explicitly), or it leaves something incidental (in
which case `$1A`'s init aims at garbage by construction and the `bcc` at `$268D92` is what saves it -- and
the port must reproduce that, not "fix" it).

`$268D88 addi.w #$0,D1` is worth its own line: **adding zero is a real instruction here**, not padding. It
sets flags, and while `$268D8C`'s `jsr` overwrites them before the `bcc` reads any, dropping it changes
nothing but keeping it costs nothing and preserves the one-to-one correspondence the port relies on. Note
it rather than delete it -- the sibling case `$2716D8` (W335) WAS deletable and the distinction is that
this one's operand is a live register.

Also confirmed: `$272C7A` is the table A0 carries into the aim. Check it against W36's `$272D70 + $190`
window before declaring anything -- it is 246 bytes BELOW that window's start, so it is probably NOT
covered, unlike `$272DFA` which W326 found already inside it.

### `$1A`'s BLOCKER IS A *DYNAMIC* MEASUREMENT, NOT A STATIC READ (W340) -- reclassified

The previous section said: read `$263808` to its `rts` and record its exit state in D2/D3. Done, and the
answer changes what kind of blocker this is.

    263808  move.l ($12,A5),D0 / beq         the script pointer; no script -> early out
    263812  btst #$6,($2,A5) / beq           two ways to seed ($2,A6)/($4,A6)
    26383a  cmpi.b #-$80,($4,A6) / bcs / bset #$7,($4,A6)
    263848..26386E   THE SCRIPT LOOP:
              andi.w #$F,D1 / add.w D1,D1 / add.w D1,D1     an opcode index, x4
              lea ($263948,PC),A1 / adda.w D1,A1 / movea.l (A1),A1 / jsr (A1)
              bra $263848                                    ... and loop
    263870  move.l A0,($12,A5)

**`$263808` IS A MOVEMENT-SCRIPT INTERPRETER**, not a leaf routine. It dispatches through a SIXTEEN-entry
longword table at `$263948` and loops until an opcode breaks out. So **it has no single exit state in
D2/D3**: whatever is there depends on which opcode handlers ran for this record's script, and each of those
sixteen can touch any register.

**SO THE BLOCKER IS NOT "READ ONE MORE ROUTINE".** It is: instrument `$268D8C` and record what D2/D3
actually hold when `$1A`'s init reaches it, across the records stage 5 spawns. That is oracle/trace work --
`tools/oracle/` -- not disassembly, and it is the right classification because sixteen opcode handlers is a
combinatorial static problem and a one-line trace answers it directly.

**AND THE LIKELY ANSWER IS "GARBAGE, GUARDED".** `aim.js:62` says `$24203E` takes target in D2/D3, `$1A`'s
init sets neither, and `$268D92 bcc` immediately follows the call. If the trace shows D2/D3 carrying
whatever the last movement opcode left, then `$1A`'s init aims at an undefined target BY CONSTRUCTION and
the `bcc` is what makes that harmless. **The port must then reproduce the indeterminacy, not repair it** --
which in practice means the aim's result must be shown not to matter on the guarded path, and that is a
statement a trace can support and a static read cannot.

**Recorded honestly as a reclassification, not progress toward a fix.** The blocker moved from "unmeasured
register provenance" to "needs a trace at one instruction", which is more actionable but is not resolved.
`$1A` stays blocked, and it is now the ONLY stage-5 type blocked on something other than reading.

Remaining stage 5 after W340: `$46` (13 records, wants `$55` first), `$1A` (trace-blocked, above), `$43`,
`$4C`, `$B0`. Five types, 20 records.

### `$43` FIRST LOOK (W340) -- init `$26DDA4`, handler `$26DE32`. IT HAS NO `readInitPosition`.

    26dda4  move.w #$0,($4,A5) / rts       ONE sub record -> FOUR-byte handler overlap
    26ddac  loadSubProto($26DE16)
    26ddb8  move.w #$4,D0 / loadRecordProto($26DE0C)     FIVE words -- a `move.w`, not a `moveq`
    26ddc8  move.l #$30001C00,($2,A6)      <-- A FIXED SPAWN POSITION. No jsr $263808 ANYWHERE.
    26ddd0  move.w $813172,D0 / sub.w D0,($4,A6)          scroll-compensated at spawn
    26ddda  move.w #$12,D0 / lea $223578,A0 / jsr $24150A  palette bank $12

**IT NEVER CALLS `readInitPosition`.** Every type read this session calls `$263808`; `$43` writes
`($2,A6)` from a LITERAL instead and then subtracts `$813172` (`G.scroll`) from the X half. So it is a
screen-anchored object placed at a fixed spot and corrected once for the scroll position at spawn -- which
also means it is NOT affected by the `$263808`/D2/D3 indeterminacy that blocks `$1A`.

`move.l #$30001C00,($2,A6)` is the same idiom type `$01` uses (`spawnPos: 0x38001c00`, W325), so this is a
small shared family: fixed-position spawners that write the packed longword directly. Worth checking `$4C`
and `$B0` for it too.

**BOTH OUTSTANDING PALETTE SOURCES ARE ALREADY COVERED BY W91's WINDOW** (`$222A78..$2252F8`), checked
arithmetically:

    $223578   $43's bank $12    inside
    $224F38   $47's bank $10    inside      <- resolves the check flagged in $47's sections

So neither needs a declaration, and the W169 situation repeats: the palette-family window was drawn wide
enough that later types need nothing. **Do not declare a palette window for either.**

`$43`'s prototype window: `$26DE0C + $2A` (`$26DE0C..$26DE35`) -- five-word record prototype plus the ONE
sub prototype, overlapping the handler at `$26DE32` by FOUR bytes, as `($4,A5) = 0` predicts.

Still to read for `$43`: the rest of the init past `$26DDEA`, and the handler from `$26DE32`.

### `$43`'s INIT BODY IS READ IN FULL (W340) -- THREE palette banks, and it is `$9F`'s shape

    26ddac  loadSubProto($26DE16)
    26ddb8  move.w #$4,D0 / loadRecordProto($26DE0C)      FIVE words
    26ddc8  move.l #$30001C00,($2,A6)                     a FIXED position, no readInitPosition
    26ddd0  move.w $813172,D0 / sub.w D0,($4,A6)          scroll-compensated once, at spawn
    26ddda  move.w #$12,D0 / lea $223578,A0 / jsr $24150A     bank $12
    26ddea  move.w #$13,D0 / lea $2235B8,A0 / jsr $24150A     bank $13
    26ddfa  move.w #$14,D0 / lea $2236B8,A0 / jsr $24150A     bank $14
    26de0a  rts

**THREE CONSECUTIVE BANKS, AND THE PORT ALREADY HAS THIS EXACT SHAPE.** `$27C5BE` (type `$9F`, stage 4)
installs three banks the same way -- `installBank` called three times with consecutive bank numbers -- and
`initbody.js` carries it. So `$43`'s init body is `$9F`'s body with different constants, which makes it a
short write. **Tenth family check to pay off this session.**

**ALL THREE SOURCES ARE INSIDE W91's `$222A78..$2252F8` WINDOW** (checked arithmetically), so **no palette
window is to be declared for `$43`**. Their spacing is `$40` then `$100`, i.e. NOT uniform -- do not derive
the second and third addresses from the first by a stride.

`$43` is a screen-anchored, fixed-position, three-bank object with no `readInitPosition` and a four-byte
prototype overlap. Its init needs: `loadSubProto`, `loadRecordProto`, `installBank` x3, one packed-longword
literal and one `G.scroll` subtraction -- **every one of which the port already has.**

Window: `$26DE0C + $2A` (`$26DE0C..$26DE35`), five-word record prototype plus the one sub prototype,
overlapping the handler at `$26DE32` by four bytes.

Still to read for `$43`: the handler `$26DE32` onward. **The init body could be written now** -- it changes
no registration and `$43` is already counted as missing a handler, so it cannot half-register anything.

### `$43`'s HANDLER HEAD (W340) -- A FOURTH COUNTDOWN CONVENTION

    26de32  tst.w $8130D2 / bne $26DED2         the freeze, jumping far
    26de3c  cmpi.b #$0,($17,A5) / bne $26DE5A   ($17,A5) as a STATE NUMBER, as $47 -- not the band's mirror
    26de46  jsr $24179E                         scrollCompensate
    26de4c  subq.w #1,($1E,A5) / bne $26DE5A    a WORD countdown, fires at ZERO
    26de54  move.b #$1,($17,A5)                 state 0 -> 1
    26de5a  cmpi.b #$1,($17,A5) / bne $26DE8C
    26de64  jsr $2417DE                         playerMove -- ALREADY PORTED (machine.js:215)
    26de6a  subq.b #1,($1C,A5) / bcc $26DE8C    a BYTE cadence, fires on UNDERFLOW
    26de72  move.b ($1D,A5),($1C,A5)
    26de78  subq.b #1,($1A,A6)
    26de7c  cmpi.b #$2,($1A,A6) / bne $26DE8C   <-- DECREMENT, THEN COMPARE AGAINST **2**
    26de86  move.b #$2,($17,A5)                 state 1 -> 2

**A FOURTH COUNTDOWN CONVENTION, AND IT IS THE MOST DECEPTIVE ONE YET.** `$26DE78` decrements `($1A,A6)`
and `$26DE7C` compares the result against **`#$2`**, not zero. So the transition fires when the counter
reaches TWO and the counter keeps its final value of 2 rather than wrapping or resting at 0. Every
established reading is wrong here: `bcc` (underflow), `bpl` (runs negative), `beq` (fires at zero) and now
"fires at an arbitrary constant". Four conventions, and `$43` uses two of them nine bytes apart -- `bcc` at
`$26DE6E` and this at `$26DE7C`.

    subq + bcc            fire on UNDERFLOW                 `due8` implements this
    subq + bpl            run into NEGATIVES                 $26DC04 ($47)
    subq + beq / bne      fire AT ZERO                       $26DCA2 ($47), $25354C (W29)
    subq + cmpi #$N       fire at an ARBITRARY CONSTANT      $26DE7C ($43)   <-- NEW

**Read the instruction AFTER every `subq`, not just the branch.** A `cmpi` between them changes the meaning
entirely, and three of these four look identical at a glance.

**`$2417DE` IS `applyVelocityA6` (movement.js). THIS TOOK THREE ATTEMPTS; READ WHY.**

  1. First I called it ported, citing `machine.js:215`'s `playerMove: 0x2417de`. That is an address in a
     CONSTANT TABLE with no consumer -- not a port.
  2. Then I "corrected" that to **NOT ported**, on the strength of the same `grep 0x2417de`.
  3. Both wrong. **`movement.js:89` documents `$2417DE` in PROSE** and `applyVelocityA6(ram, tables, a6)` is
     its implementation, annotating `$2417E0`, `$2417E4`, `$2417EA`, `$2417F2`, `$2417F4` and `$2417F8` line
     by line. `grep 0x2417de` could never have found it.

**This is the standing rule earning its keep against me twice on one address**: *grep case-insensitively for
BARE HEX digits, read every hit INCLUDING comments and docstrings, and read the routine to its `rts`
comparing its BODY.* Searching for `0x`-prefixed lowercase is the failure mode the rule names, and I used it
to reach two opposite wrong conclusions before searching for the routine's BEHAVIOUR instead.

`$2417DE` is the freeze-gated vector application with **62 callers**: read speed/heading from `($1A,A6)`/
`($1B,A6)`, `bsr $241812` for the vector, add D2/D3 into `($2,A6)`/`($4,A6)`, and on freeze return zeros.
`$43` uses the RAW A6 form, which is why `applyVelocityA6` is exported separately from `applyVelocity`.

**AND IT IS A LEAD ON `$1A`'s BLOCKER.** `$2417DE`/`$241812` are what SET D2 and D3 -- the movement delta. So
the D2/D3 that `$1A`'s init hands to `$24203E` at `$268D8C` are very likely the last movement delta left by
whichever `$263808` opcode ran, not a target position at all. That sharpens the trace: instrument `$268D8C`
and compare D2/D3 against the record's last delta rather than against any player coordinate.

`($17,A5)` is a state number here, as in `$47` and unlike all four band members. That is now two of two
non-band stage-5 types using it that way, so the band's mirror-flag reading looks like the exception.

Still to read for `$43`: `$26DE8C` onward (state 2+) and `$26DED2` (the freeze target, probably the draw).

### `$43`'s STATE 2 AND DRAW (W340) -- and `$263678` IS ALREADY PORTED (twelfth family check)

    26de96  subq.b #1,($18,A5) / bcc $26DED2      a cadence
    26de9e  move.b ($19,A5),($18,A5)
    26dea4  addq.w #4,($1A,A5)                    the RAMP
    26dea8  cmpi.w #$40,($1A,A5) / bne $26DEBA
    26deb2  jmp $263762                           at EXACTLY $40 -> freeEnemy
    26deba  cmpi.w #$3C,($1A,A5) / bne $26DED2
    26dec4  moveq #$44,D0 / jsr $263678           at $3C -> a DEFERRED SPAWN of type $44
    26decc  move.l ($2,A6),($16,A0)
    26ded2  lea ($26DF00,PC),A0 / adda.w ($1A,A5),A0    the draw, index RAW

**THE RAMP TERMINATES ON EQUALITY, NOT A THRESHOLD.** `cmpi.w #$40 / bne` -- if the step ever missed `$40`
the object would never free. Step 4 from 0 hits `$40` exactly, so it is safe as written, but the port must
use `=== 0x40` and not `>= 0x40`: the two behave identically here and differently under any future edit, and
"threshold read as equality" has already cost this project a wave (`$1F3`, W335).

**IT SPAWNS TYPE `$44` ONE STEP BEFORE IT DIES**, at ramp `$3C`, and copies its own position into the new
record's `($16,A0)`. So `$43` is a two-part effect: sixteen ramp frames, a spawn on the penultimate one,
then self-free.

**AND `$263678` IS ALREADY PORTED. I NEARLY RECORDED THE OPPOSITE.** A grep for `0x263678` returned nothing
in `src/`, and a grep for its sibling `$263684` returned only a `note` in `midboss.js` -- which I first read
as "the allocator is unported and already blocks the midboss's death spawn". **Wrong on both counts.** That
note is about the deferred queue being FULL at runtime, not about a missing routine, and `spawn.js:419-427`
carries the whole family:

    export const DEFQ_D1 = { FIXED80: 0x80, FIXED00: 0x00, CALLER: -1 };
    /** Enqueue a deferred spawn.  `$263678/$263684/$263690`. ... */

All three addresses are named in that docstring, and `$263678`'s `D1 = $80` is `DEFQ_D1.FIXED80`. So `$43`
needs `enqueueDeferred(ram, 0x44, DEFQ_D1.FIXED80)` and nothing new. **Twelfth family check to pay off, and
the lesson is sharper than the previous eleven**: grepping the ADDRESS found nothing because the port names
the family in a docstring and exports it under a NAME. `grep 0x2xxxxx is NOT a test for "is this ported"`
already says to grep case-insensitively for bare hex and read comments -- this is that rule earning its
keep, and I only got there by reading the cited note instead of trusting my own summary of the grep.

Draw table: `$26DF00 + $40` (sixteen longwords, index `($1A,A5)` RAW, ramp `0..$3C`). Prototype window
`$26DE0C + $2A`. `$43` has NO unported callee: `$2637A2`, `$26377A`, `$24150A`, `$24179E`, `$2417DE`
(`playerMove`), `$263678` (`enqueueDeferred`), `$263762`, `$23DECE`-family draw -- all present.

Still to read for `$43`: `$26DED8` onward (the draw body). Everything else is read.

### `$43` IS READ END TO END (W340). ITS DRAW APPLIES TWO LONG BIASES, AND THOSE *DO* COMBINE.

    26ded2  lea ($26DF00,PC),A0 / adda.w ($1A,A5),A0 / move.l (A0),D2    index RAW, 16 longs
    26dede  move.l ($2,A6),D1
    26dee2  subi.l #$4000000,D1          = + $FC000000
    26dee8  addi.l #-$19FF1A00,D1        = + $E600E600
    26deee  move.w #$1AD0,D3
    26def2  moveq #$0,D4 / move.b ($1D,A6),D4     the PALETTE byte, as $47 and unlike the band
    26def8  jmp $23DECE                  a TAIL JUMP, not a jsr

**TWO SEQUENTIAL LONG BIASES, AND UNLIKE THE PACKED-WORD CASE THEY COMBINE EXACTLY.** `$FC000000` then
`$E600E600` is `$E200E600` applied once -- verified identical on three sample positions including a
low-half-carry case. That is the precise contrast with `$47`'s muzzle constants: **two full 32-bit adds are
associative and may be folded; a word pair is NOT a longword and may not be assembled.** Both facts live in
`addi.l` instructions and look alike, and the distinguishing question is whether the ROM performed word
arithmetic on the halves.

Even so, transcribe both instructions. Folding costs a reader the ability to match the port line-for-line
against the listing, and the fold's safety is a property of these two constants rather than of the idiom.

`$26DEF8` is a **`jmp`, not a `jsr`** -- a tail jump into the emit stub, so `$43`'s handler has no code after
its draw. The port's `enqueueRegistersThroughStub` models the call either way, but a reader looking for an
`rts` will not find one.

D4 comes from `($1D,A6)`, the palette byte, as in `$47` -- so both non-band stage-5 types do this and all four
band members use `($1C,A6)`. **Two of two vs four of four: the band is the outlier, not these.**

**`$43` IS NOW COMPLETE AND HAS NO UNPORTED CALLEE.** `$2637A2`, `$26377A`, `$24150A` (x3), `$24179E`,
`$2417DE` (`playerMove`), `$263678` (`enqueueDeferred`, `DEFQ_D1.FIXED80`), `$263762` (`freeEnemy`),
`$23DECE`. Windows: `$26DE0C + $2A` (prototypes, four-byte handler overlap) and `$26DF00 + $40` (sixteen
draw longwords). No palette window -- all three banks are inside W91's.

**Order for the next wave:** write `$43` (init body + handler + draw, one pass), then `$4C` (`$26F4DA` init,
`$26F5F2` handler), then `$B0`. `$46` wants `$55` first; `$1A` is trace-blocked at `$268D8C`.

### `$4C` FIRST LOOK (W341) -- init `$26F4DA`, handler `$26F5F2`. FIVE sub records, 20-byte overlap.

    26f4da  move.w #$4,($4,A5) / rts       FIVE sub records -- the most of any stage-5 type read
    26f4e2  loadSubProto($26F566)
    26f4ee  move.w #$5,D0 / loadRecordProto($26F55A)     SIX words -- another `move.w`, not a `moveq`
    26f4fe  move.l #$F4001C00,($2,A6)      a FIXED position -- NO readInitPosition, as $43
    26f506  move.w $813172,D0 / sub.w D0,($4,A6)          scroll-compensated once
    26f510  move.w #$1,$81B414             ONE budget word, as $47 (the band sets two)
    26f518  move.w #$1,$8130DE             its alive flag

**THE OVERLAP RULE HOLDS A SIXTH TIME AND PREDICTS THE DEEPEST CASE YET.** `($4,A5) = 4` means FIVE
`$20`-byte sub records, so `$26F566 + $A0 = $26F606` against a handler at `$26F5F2`: **`$14` = TWENTY bytes**.
`depth = subRecords * $20 - (handler - subProto)` has now been confirmed at 4, 8, 4, 16, 4 and 20 bytes across
six types. **It is arithmetic. Compute the window extent from the init's first instruction and stop guessing.**
Window: `$26F55A + $AC` (`$26F55A..$26F605`).

**`$F4001C00` IS A NEGATIVE Y.** The high word `$F400` is `-$C00`, so `$4C` spawns ABOVE the visible field and
descends. `$43`'s `$30001C00` is positive. Same idiom, opposite side -- do not assume a fixed-position
spawner starts on screen.

**THE ALIVE-FLAG WORDS ARE ONE CONTIGUOUS FAMILY**, which is worth naming because six waves found them one at
a time:

    $8130DC   $47          a single global, set in init, cleared on all exits
    $8130DE   $4C          the same shape
    $8130E0   $49  early   reached through a POINTER in ($20,A5), chosen by scroll < $260
    $8130E2   $4B  early   through ($26,A5), chosen by scroll < $280
    $8130E4   $49  late
    $8130E6   $4B  late

So `$8130DC..$8130E6` is a six-word block of per-type presence flags: `$47` and `$4C` write theirs directly,
`$49` and `$4B` hold a POINTER to one of two, and `$4A`/`$48` have none at all. **Anything reading this block
is reading "which stage-5 set-pieces are currently alive"**, and that is probably what gates the stage's
progression -- worth a `codexref` sweep over all six before writing `$4C`.

`$4C` is in the fixed-position family with `$43` and `$01` (W325). Still to read: the init past `$26F520` and
the handler from `$26F5F2`.

### THE `$8130DC..$8130E6` BLOCK IS A MUTUAL-EXCLUSION GATE (W341) -- the sweep answered

Absolute-reference counts across `$200000..$2B0000`, and the pattern in the addresses is the finding:

    $8130DC  18 refs   264DA8 264DE0 264E7C 26730C 269C6C 26D724 26D7F6 26D878 26D8C0 ...
    $8130DE   7 refs   269C7E 26F51C 26F608 26F6B2 2706A4 270C86 274738
    $8130E0  14 refs   269C90 26A56A 26ACA2 26AFDE 26C2BA 26C524 26CA68 26D4B6 26F524 ...
    $8130E2  10 refs   269CA2 26A57C 26ACB4 26AFF0 271CEC 271CF2 27790C 29ED6A 29FE2C
    $8130E4   7 refs   26A58E 26ACD2 271608 27792A 29ED52 2A3FF8 2A4032
    $8130E6   8 refs   26A5A0 26AC6C 26ACE4 271D04 27793C 29ED58 29FB6A 29FC7E

**FOUR ROUTINES TOUCH ALL SIX IN SEQUENCE AT UNIFORM STRIDES** -- `$269C6C/7E/90/A2`, `$26A56A/7C/8E/A0`,
`$26ACA2/B4/D2/E4` and `$26AFDE/F0`. So the block IS treated as a unit, and reading the first one settles
what for:

    269c6a  tst.w $8130DC / beq $269C7C      flag clear -> test the next
    269c74  jmp $263762                      flag SET -> the POLLING RECORD FREES ITSELF
    269c7c  tst.w $8130DE / beq $269C8E      ... and so on down the block

**IT IS A MUTUAL-EXCLUSION GATE.** A record running that code refuses to exist while ANY stage-5 set-piece is
alive: it walks the six flags and `freeEnemy`s itself on the first one set. So `$47`'s `$8130DC` and `$4C`'s
`$8130DE` are not bookkeeping -- **they suppress other enemies for as long as the set-piece is on screen**,
which is exactly what a scroll-stopping set-piece needs and is a visible gameplay behaviour.

That also explains why `$47` clears its flag on **all three** exits (death, off-screen, retirement) and why
`$4B` writes `$8130E2` unconditionally BEFORE choosing its pointer: leaving a flag set would permanently
suppress whatever polls it, and the ROM is careful about it in a way that reads as over-engineering until you
know there is a reader.

**CONSEQUENCE FOR THE PORT:** the flags must be written and cleared exactly, and any type whose handler polls
this block needs the poll ported or it will spawn on top of a set-piece. Four polling sites are named above;
`$269C6C`'s owner should be identified first, since it is the one confirmed to self-free.

Still to read for `$4C`: the init past `$26F520` and the handler from `$26F5F2`.

### `$4C`'s INIT IS READ IN FULL (W341) -- it claims TWO flags, and shares `$43`'s BANK NUMBERS

    26f518  move.w #$1,$8130DE
    26f520  move.w #$1,$8130E0            <-- **A SECOND FLAG**
    26f528  move.w #$12,D0 / lea $2235F8,A0 / jsr $24150A
    26f538  move.w #$13,D0 / lea $223638,A0 / jsr $24150A
    26f548  move.w #$14,D0 / lea $223678,A0 / jsr $24150A
    26f558  rts

**CORRECTION TO THE FLAG MAP TWO SECTIONS ABOVE.** I recorded `$8130E0` as "`$49` early". `$4C` writes it
DIRECTLY as well, so the block is not one-flag-per-type: `$4C` claims **two** of the six (`$8130DE` and
`$8130E0`), while `$49` reaches `$8130E0` through a pointer. Both must be cleared when `$4C` retires, and the
mutual-exclusion gate at `$269C6C` walks both.

**AND IT INSTALLS THE SAME BANK NUMBERS AS `$43` FROM DIFFERENT SOURCES.** Both write banks `$12`, `$13` and
`$14`; `$43` sources `$223578`/`$2235B8`/`$2236B8` and `$4C` sources `$2235F8`/`$223638`/`$223678`. **So these
two set-pieces overwrite each other's palettes**, which is precisely why `$47` reinstalls bank `$10` on EVERY
FRAME (W339) instead of once at init: bank numbers in this range are contested, and a type that wants its
colours to survive has to keep repainting them. Two findings from different waves explaining each other.

`$4C`'s bank spacing is `$40`/`$40` -- uniform, where `$43`'s was `$40`/`$100`. **So neither type's sources are
derivable by a stride from the first, and they are not derivable from each other either.** Transcribe all six
addresses. All three of `$4C`'s are inside W91's `$222A78..$2252F8` window, so again no palette window.

`$4C`'s init needs: `loadSubProto`, `loadRecordProto`, one packed-longword literal (with a NEGATIVE Y),
one `G.scroll` subtraction, two flag words and `installBank` x3 -- all present in the port.

Still to read for `$4C`: the handler `$26F5F2` onward. Windows: `$26F55A + $AC` (prototypes, TWENTY-byte
handler overlap) and whatever its draw table turns out to be.

### THE DYING/RETIRE FLAGS ARE ALWAYS THE LAST TWO BYTES OF THE RECORD (W341) -- one rule for all of them

`$4C`'s handler head is `$47`'s shape, and comparing the two settles an offset question six waves have been
answering type by type:

    26f5f2  tst.w $8130D2 / bne $26F704       the freeze -> the draw
    26f5fc  tst.b ($9E,A6) / beq $26F622      the RETIRE trigger
    26f604  move.w #$0,$8130DE                clears ONE flag -- see below
    26f60c  pushExternalSpeed($20, $20) / jmp $263762
    26f622  tst.b ($16,A5) / bne / tst.b ($9F,A6) / bne     the DYING flag
    26f632  cmpi.w #$1F0,$8130CE              a scroll-clock EQUALITY, as the band's

**`dying = size - 1` and `retire = size - 2`, where `size = (($4,A5) + 1) * $20`:**

    ($4,A5)   size    retire   dying     types
      0       $20     --       --        $49, $4B  (no flags at all; they free directly)
      1       $40     +$3E     +$3F      $4A, $48
      3       $80     +$7E     +$7F      $47
      4       $A0     +$9E     +$9F      $4C

Every type read this session fits. **So stop memorising these offsets and compute them from `($4,A5)`,** the
same way the prototype-overlap depth is computed from it. Two structural facts now fall out of one field in
the init's first instruction. And `$49`/`$4B` having no such flags is consistent rather than exceptional: at
`$20` bytes the pair would land on prototype fields, so those types free directly instead.

**THE ASYMMETRY: `$4C`'s RETIREMENT CLEARS ONLY `$8130DE`, NOT `$8130E0`.** Its init sets BOTH (`$26F518`,
`$26F520`) and `$26F604` clears one. So either something else clears `$8130E0`, or `$4C` leaves it set --
which, given `$269C6C`'s gate frees any record that sees ANY flag set, would permanently suppress the polling
type for the rest of the stage. **Do not "fix" this by clearing both.** Transcribe the single clear, and
`codexref $8130E0`'s fourteen references for another writer -- `$26F524` is `$4C`'s own init and the rest are
listed in the sweep section above. If nothing clears it, that is a cartridge behaviour the port must
reproduce, and it may be the mechanism that ends the stage's enemy spawning.

Still to read for `$4C`: `$26F650` onward and `$26F704` (the draw).

### `$8130E0` IS A *SHARED* FLAG, AND `$4C`'s "ASYMMETRY" WAS MY UNREAD SPAN (W341)

The previous section flagged that `$4C` sets `$8130DE` and `$8130E0` but clears only `$8130DE`, and warned it
might leave a flag stuck. Classified all fourteen references by the opcode preceding each:

    READS  (tst.w)   $269C8E  $26A568  $26ACA0  $26AFDC  $26D4B4  $2702E6  $270446  $2778EC   -- EIGHT
    WRITES (move.w)  $26C2B6 = 1   $26C520 = 0   $26CA64 = 0   $26F520 = 1   $26F6B6 = 0     -- FIVE
    ADDRESS (lea)    $2715F4                                                  -- $49's pointer load

**`$26F6B6` IS INSIDE `$4C`'s OWN HANDLER**, in the `$26F650..$26F704` span I had not read. So `$4C` clears
`$8130DE` at `$26F604` on one exit and `$8130E0` at `$26F6B6` on another: two exits, two flags, no bug. **The
asymmetry was my unread span, not the cartridge's.** Ninth or tenth time this session that an anomaly
dissolved on displaying the bytes -- and this one I had already written into the handoff as a thing not to
"fix", which was the right instinct for the wrong reason.

**AND `$8130E0` IS NOT PER-TYPE.** Three other writers live in `$26Cxxx` -- `$26C2B6` sets it, `$26C520` and
`$26CA64` clear it -- so at least one more type owns this same word, plus `$49` reaches it through a pointer.
So the six-word block is **not** one-or-two-flags-per-type: `$8130E0` at minimum is shared between `$4C`,
`$49` and whatever owns `$26C2B6`. Correct the map two sections above accordingly, and **do not treat any of
the six as belonging to one type.**

Eight readers is the number that matters for the port: whichever types those eight belong to all self-free
while the flag is set (the `$269C6C` gate shape), so a missing clear suppresses eight code paths, not one.
That is why the ROM is careful and why the port must be.

Still to read for `$4C`: `$26F650..$26F704` (which contains that clear) and `$26F704` (the draw).

### `$4C`'s DAMAGE ARM (W341) -- a THIRD size-relative offset, and a damage GATE `$47` lacks

    26f658  move.b #$A3,D0 / and.b D0,(A6)
    26f65e  move.w D1,($8E,A6)             the hit mask -- and see the formula below
    26f662  jsr $286096                    scoreHit
    26f668  D0 = ($1D,A6) / eori.b #$D     a LITERAL $D, where $47 uses $F
    26f674  move.l #$7FFF,D0 / sub.w ($18,A6),D0        the damage taken -- the $7FFF SINK again
    26f67e  tst.b ($16,A5) / bne $26F68A   <-- THE SUBTRACTION IS GATED. $47 HAS NO SUCH TEST.
    26f686  sub.l D0,($1A,A5)              the real HP is a LONG at ($1A,A5), not $47's ($32,A5)
    26f68a  move.w #$7FFF,($18,A6)         re-arm the sink
    26f690  tst.l ($1A,A5) / bpl $26F6E4
    26f698  move.l #$700,D0 / jsr $28615E  kill score $700, where $47 pays $600

**A THIRD SIZE-RELATIVE OFFSET: `hitMask = size - $12`.** `$47` (size `$80`) saves at `+$6E`; `$4C` (size
`$A0`) saves at `+$8E`. Both are `size - $12`. So the record's tail carries a fixed trio:

    2 sub records ($40):  hitMask +$2E   retire +$3E   dying +$3F
    4 sub records ($80):  hitMask +$6E   retire +$7E   dying +$7F
    5 sub records ($A0):  hitMask +$8E   retire +$9E   dying +$9F

**Compute all three from `($4,A5)`.** With the prototype-overlap depth that is FOUR structural facts derived
from the init's first instruction. Confirm `+$2E` on `$4A`/`$48` when either is revisited -- neither was read
as saving a hit mask, so the trio may only be populated by types that have a `$26DCB6`-style consumer.

**THE DAMAGE SUBTRACTION IS GATED ON `($16,A5)`.** `$26F67E tst.b / bne` skips `sub.l D0,($1A,A5)` unless the
record has been on screen -- so **`$4C` is INVULNERABLE until it appears**, and its sink is still re-armed
either way at `$26F68A`. `$47` has no such gate. Porting `$4C` from `$47`'s arm would make it killable before
it enters, which is exactly the class of difference that shows up as "the set-piece sometimes never appears"
rather than as a crash.

Its constants, none shared with `$47`: palette XOR `$D` (not `$F`), HP long at `($1A,A5)` (not `($32,A5)`),
kill score `$700` (not `$600`). **The `$7FFF` sink idiom is shared; nothing else in the arm is.**

Still to read for `$4C`: `$26F6A4..$26F704` (the death tail, which contains the `$8130E0` clear at `$26F6B6`)
and `$26F704` (the draw).

### `$4C`'s DEATH PATH (W341) -- it clears BOTH flags; the RETIREMENT path clears one

    26f6a4  move.w #$8000,(A6)             the mark
    26f6a8  move.b #$1,($9F,A6)            dying at size-1, as the formula predicts
    26f6ae  move.w #$0,$8130DE
    26f6b6  move.w #$0,$8130E0             <-- BOTH cleared here
    26f6be  pushExternalSpeed($20, $20)
    26f6cc  moveq #$6,D0 / bsr $26F858     a private subroutine, EIGHT callers
    26f6d2  lea ($2701C8,PC),A0 / jsr $246520      $246520: SIX callers, UNPORTED
    26f6de  move.b #$12,($1D,A6)           a LITERAL palette, as $47's $10
    26f6e4  bsr $26FFE8                    a private subroutine, ONE caller
    26f6e8  tst.b ($9F,A6)                 the mark again

**THE ASYMMETRY IS REAL BUT PATH-SPECIFIC, AND NARROWER THAN I FIRST WROTE.** Two commits ago I said `$4C`
clears only `$8130DE`; one commit ago I said the missing clear was in my unread span and there was no bug.
**Both were partly wrong.** The DEATH path (`$26F6AE`/`$26F6B6`) clears BOTH. The RETIREMENT path
(`$26F5FC` -> `$26F604`) clears only `$8130DE`. So the two exits genuinely differ, and `$8130E0` survives a
retirement. Given eight readers self-free on it, that is either deliberate -- the retirement is *meant* to
keep suppressing them -- or a cartridge bug. **Transcribe both paths exactly as written and do not unify
them.** This is the third statement I have made about this one flag; the first two were made before reading
the relevant span, and the lesson is the session's usual one.

**THREE MORE CALLEES, AND `$4C` IS NOT A SMALL TYPE:**

    $246520   SIX callers, UNPORTED, and it opens `movem.l D1-D7/A0-A4,-(A7)` -- it saves TWELVE registers,
              so it is a substantial routine, not a setter. It takes a table in A0 ($2701C8 here).
              **Read and codexref it BEFORE writing $4C** -- six callers plus a twelve-register prologue is
              the W333 situation, and porting it inside a type wave is the mistake that lesson prevents.
    $26F858   EIGHT callers, unported, called with D0 = 6. Also likely shared beyond $4C.
    $26FFE8   ONE caller -- private to $4C.

So `$4C` has **two genuine shared prerequisites** (`$246520`, `$26F858`) plus one private subroutine, which
makes it the largest remaining stage-5 type by dependency depth even though it holds one record. Contrast
`$47`, whose two apparent prerequisites both dissolved: these two have caller counts AND substantial bodies,
which is the pair of signals that distinguishes real infrastructure from a three-line setter (the `$23C4A0`
lesson).

Still to read for `$4C`: `$26F6E8..$26F704`, `$26F704` (the draw), and the two prerequisites.

### `$246520` IS A TWO-POOL SPAWNER OVER POOLS THE PORT DOES NOT HAVE (W341)

    246520..246528  an entry variant, then bra $246532
    24652a  movem.l D1-D7/A0-A4,-(A7)      TWELVE registers saved -- a substantial routine
    24652e  move.w #$0,D6
    246532  lea $810346,A1 / moveq #$2,D7  <-- POOL 1, and #$2 + dbra = THREE slots
    24653a  tst.w (A1) / bmi $246600       the free-slot test: NEGATIVE means occupied
    246540  move.w #$8000,(A1)             claim it
    246544  move.w D6,($4,A1)
    246548  movem.l A0-A1,-(A7)
    24654c  move.w (A0)+,D0                read the caller's table ($2701C8 for $4C)
    24654e  move.w #$13,D6
    246552  lea $80FA86,A2 / tst.w (A2) / bmi $2465DE      <-- POOL 2, and #$13 -> TWENTY slots

**NEITHER POOL IS IN THE PORT.** `$810346` and `$80FA86` return nothing on a bare-hex search of `src/` --
this time using the correct pattern (`\$?(0x)?<hex>`, case-insensitive), not the `0x`-lowercase form that
misled me twice on `$2417DE`. So `$246520` is **genuine new infrastructure**: a two-stage allocator that
claims one of THREE slots in `$810346`, then walks TWENTY slots in `$80FA86`, driven by a caller-supplied
table.

**`#$2` and `#$13` with `dbra` are THREE and TWENTY**, not two and nineteen -- the standing DBcc rule, and the
second pool's twenty-slot walk is the sort of count that is wrong by one in a port unless it is read off the
literal.

**SO `$4C` IS PROPERLY BLOCKED, AND CORRECTLY SO.** Its prerequisites are:

    $246520   a two-pool spawner over $810346 (3 slots) and $80FA86 (20 slots)   -- NEW SUBSYSTEM
    $26F858   eight callers, unported, D0 = 6                                    -- unread
    $26FFE8   one caller, private to $4C                                         -- unread

This is the first stage-5 type this session whose prerequisites did NOT dissolve on inspection, and the two
signals that predicted it were caller count PLUS a substantial body -- `movem.l` of twelve registers and two
RAM pools. **`$246520` deserves its own wave**, and it should be measured before `$26F858` because a
twenty-slot pool with a three-slot parent is likely the thing `$26F858` feeds.

**RECOMMENDED ORDER FROM HERE:** `$B0` and `$46`/`$55` are the other remaining work; `$4C` should wait for
`$246520`'s wave rather than absorb it. `$1A` needs the `$268D8C` trace. Stage 5 stands at FOUR types with no
handler over 19 records, from ten over 29 at the start of this session.

### WHAT "FOUR TYPES OVER 19 RECORDS" ACTUALLY MEANS (W341) -- the census is not four comparable units

Stage 5 ends this session at FOUR types with no handler over 19 records, from ten over 29. But I have been
reporting that number as if the four were comparable pieces of work, and they are not:

    $46   13 records   BLOCKED on $55, an unported 1130-byte child (W317). The biggest by record count and
                       still the wrong thing to start with -- W317 measured exactly this.
    $1A    4 records   BLOCKED on a TRACE at $268D8C, not a read (W340). D2/D3 reach $24203E from whichever
                       $263808 opcode ran last, and $2417DE/$241812 are what set them.
    $4C    1 record    BLOCKED on $246520 (a two-pool spawner over $810346/$80FA86, neither in the port) and
                       $26F858 (eight callers). Read end to end otherwise.
    $B0    1 record    **NOT AN ORDINARY TYPE.** Init $2A42D4, handler $2A4606 -- already recorded at line
                       418 above as "the stage-5 boss-route ROOT until disproven", and $2A42D4 is the address
                       the owner's own Hibachi analysis names as the oracle trace start.

**So the remaining 19 records are: one boss route, one type behind a new subsystem, one behind a trace, and
one behind a 1130-byte child.** None is a "write the handler" wave, and reporting "four types left" invites
the next agent to pick the smallest record count and hit `$B0`, which is the true final boss.

**The honest next-wave options, cheapest first:**

    1. `$246520`'s own wave -- a bounded new subsystem (3-slot + 20-slot pools), unblocks `$4C`.
    2. the `$268D8C` trace -- one instrumented instruction, unblocks or reclassifies `$1A`.
    3. `$55` -- unblocks `$46`, the largest remaining record count.
    4. `$B0`/Hibachi -- boss work, and the owner has flagged it as a trap; it wants the HIBACHI CLOSURE RULE
       and a trace, not a handler wave.

Stage 5's enemy-type sweep is effectively DONE: every type that was a straightforward read-and-write has been
written this session. What remains is one subsystem, two measurements and a boss.

### `$246520` IS A MULTI-PART OBJECT CONSTRUCTOR, AND `$24627A` HAS EXACTLY THREE ENTRIES (W341)

    246568  move.l #$0,($2C,A2)
    246570  move.l A2,($2C,A1)      <-- LINKS the new node into the previous one
    246574  movea.l A2,A1           <-- and advances, so this builds a LINKED LIST
    246576  move.w #$0,($1E,A2) / move.w #$0,($2,A2)
    246582  move.w (A0)+,D2         an index from the CALLER's table
    246584  lea ($24627A,PC),A3
    246588  move.l ($4,A3,D2.w),($6,A2)      the SECOND long of the entry
    24658e  movea.l (A3,D2.w),A3             the FIRST long, as a base
    246592  adda.w (A0)+,A3 / move.l A3,($E,A2)
    246598  move.l (A0)+,($A,A2) / move.w (A0)+,($4,A2)
    2465a0  move.w (A0)+,D3 / andi.w #$1F,D3 / add.w D3,D3 / add.w D3,D3

So `$246520` allocates a parent from the 3-slot pool at `$810346`, then builds a **chain of up to twenty
nodes** from `$80FA86`, linking each through `($2C,A1)` and configuring it from the caller's table. `$4C`
passes `$2701C8`. **It is a multi-part-object constructor** -- which is consistent with `$4C` being a
set-piece and with the twelve-register `movem.l` prologue.

**`$24627A` HOLDS EXACTLY THREE ENTRIES AND ENTRY 3 IS CODE:**

    [0]  0080E886  0080FA66
    [1]  0080F086  0080FA68
    [2]  0080F886  0080FA6A
    [3]  48E77F00  3E013200      <-- `movem.l D1-D7,-(A7)` -- AN INSTRUCTION

**Fourth instance in this ROM of a table bounded by its own instruction stream**, after `$27460A` (W326,
index `$18` is `$3B7C0001`), `$2716D8`/`$271774` (W335) and `$2714B0` (W336). So `D2` is `0`, `8` or `$10`
only, and the port must **throw by address on anything else rather than clamp** -- W326's treatment, for the
same reason: the guard IS the semantics.

The three entries are pairs of RAM pointers (`$80E886`/`$80FA66`, `$80F086`/`$80FA68`, `$80F886`/`$80FA6A`),
stepping `$800` and `2` respectively -- so they name three parallel part-pools. **Neither those nor
`$810346`/`$80FA86` are in the port**, so `$246520`'s wave has to introduce the whole region.

**A WINDOW IS NEEDED FOR `$24627A + $18`** (three 8-byte entries), with the note that index 3 is code, and one
for `$2701C8` (`$4C`'s part table -- length unmeasured; it is walked by `(A0)+` with no terminator visible in
what has been read, so its extent must come from the node count or from `$26F858`).

That completes what can be learned about `$246520` without writing it. **It is one bounded wave**: two pools,
a three-entry dispatch table, a linked-list constructor, and a caller table per user.

### `$2701C8` MEASURED (W341) -- ONE node, and `$246520`'s wave is now fully scoped

`$24654C move.w (A0)+,D0` reads a leading COUNT word before the per-node fields, and each node consumes
exactly twelve bytes (`move.w (A0)+,D2`, `adda.w (A0)+,A3`, `move.l (A0)+`, `move.w (A0)+`, `move.w (A0)+`).
So the table shape is `count word, then count * 12`.

    $2701C8:  count = 1
    node[0]:  D2 = $0000   A3 offset = $0480   long = $00225238   word = $001F   D3 = $0009
    $2701D6 onward: CODE  ($3B7C..., $4E75...) -- so the table is $E bytes, $2701C8..$2701D5

**Every field checks out, which is what says the reading is right:** `D2 = 0` is a VALID dispatch index (the
only legal values are `0`, `8`, `$10`, since `$24627A` has three entries and entry 3 is code), and
`long = $225238` is inside W91's `$222A78..$2252F8` palette window -- consistent with dispatch entry `[0]`
being the RAM pointer pair `$80E886`/`$80FA66`. A misread stride or a missing count word would have produced
an out-of-range `D2` immediately, and node[1] read as data would have given `D2 = $3B7C`.

**So `$4C` builds ONE part through `$246520`**, not twenty. The twenty-slot walk at `$80FA86` is the pool's
capacity, not this caller's demand -- **do not size anything from `#$13`.** Other callers of `$246520` (six
total) will pass their own count words, and that is where a twenty-node chain would come from.

**`$246520`'s WAVE IS NOW FULLY SCOPED.** Everything it needs is measured:

    pools      $810346 (3 slots) and $80FA86 (20 slots), plus the three parallel pools named by $24627A
    dispatch   $24627A + $18 -- THREE entries, index 3 is CODE, so D2 in {0, 8, $10} and throw otherwise
    per-caller a count word plus count*12-byte nodes; $4C's is $2701C8 + $E, one node
    windows    $24627A + $18 and $2701C8 + $E; node[0]'s $225238 needs none (inside W91's)
    linkage    parent from $810346, chain through ($2C,A1), each node advanced by `movea.l A2,A1`

That is a bounded wave with no unmeasured quantity left in it. **Write `$246520` next, then `$4C`.**

### `$246520` READ TO ITS `rts` (W341) -- THE POOLS ARE CONTIGUOUS, WHICH PROVES THE STRIDES

    2465cc  move.w ($4,A2),D4 / lea ($30,A2),A4
    2465d4  move.w (A3)+,(A4)+ / dbra D4,$2465D4      a variable-length WORD PAYLOAD at node +$30
    2465da  subq.w #1,D0 / beq $2465E8                <-- D0 IS THE NODE COUNT, confirmed
    2465de  lea ($70,A2),A2                           <-- node stride is $70
    2465e2  dbra D6,$246558                           the twenty-slot loop
    2465e6  moveq #-$1,D0                             pool exhausted -> FAILURE
    2465e8  movem.l (A7)+,A0-A1
    2465ec  tst.w D0 / bpl $2465F8
    2465f0  move.l A1,D0 / bsr $246800                <-- FAILURE UNWIND, and it is UNPORTED
    2465f8  move.l A1,D0 / movem.l (A7)+,D1-D7/A0-A4 / rts     success: the PARENT in D0
    246600  lea ($30,A1),A1                           slot occupied -> parent stride is $30

**THE ARITHMETIC PROVES ITSELF:**

    pool 2 (nodes)    $80FA86 + 20 * $70 = $810346
    pool 1 (parents)  $810346 + 3  * $30 = $8103D6

**`$80FA86 + 20 * $70` lands EXACTLY on `$810346`, the parent pool's own base.** The two pools abut, so if
either stride or either count were wrong the boundary would not land there. That is the same
self-checking-extent property the abutting ROM tables have, in RAM -- and it independently confirms `$70`,
`$30`, twenty and three, none of which was obvious from the literals alone (`#$13` and `#$2` are the dbra
counts; the strides are separate `lea` displacements).

**CORRECTION TO MY OWN "FULLY SCOPED" CLAIM one commit ago.** I said the wave had no unmeasured quantity
left. It had three: both pool STRIDES and the failure unwind. I had measured the pool bases, the slot counts,
the dispatch table and the caller table, and called that complete without reading to the `rts`. **The strides
are not derivable from anything I had measured**, and `$246800` is a whole routine.

**`$246800` IS UNPORTED AND IS NOT OPTIONAL.** It is the unwind called when the twenty-node pool runs dry
mid-chain: the parent is already claimed and some nodes are already linked, so without it a failed
construction leaks a parent slot out of THREE permanently. Read it before writing `$246520`.

**Also: each node carries a variable-length word payload at `+$30`**, length `($4,A2)+1` words, copied from
the `A3` the dispatch table computed. So a node is `$70` bytes of which `$30` is header and up to `$40` is
payload -- and `($4,A2)` comes from the caller's table (`word = $001F` for `$4C`'s node[0], so **32 words =
$40 bytes**, exactly filling the node). Another self-checking fit.

### `$246800` IS A SIX-INSTRUCTION CHAIN-FREE WITH TWENTY-ONE CALLERS (W341) -- port it first

    246800..246803   the prologue (D0/A0 saved)
    246804  movea.l D0,A0
    246806  clr.w (A0)                     release the node
    246808  move.w #$0,($4,A0)             and its second field
    24680e  move.l ($2C,A0),D0 / bne $246804    follow the ($2C) LINK and loop
    246814  movea.l (A7)+,A0 / move.l (A7)+,D0 / rts

**It walks the `($2C)` linked list `$246520` builds and releases every node**, and the two writes are exactly
the inverse of `$246520`'s claim: that routine sets `move.w #$8000,(A1)` and `move.w D6,($4,A1)`, this one
clears both. The pool convention is confirmed from both ends -- `tst.w / bmi` means occupied when NEGATIVE,
so `clr.w` is what frees it.

**TWENTY-ONE CALLERS.** This is not `$4C` infrastructure, it is core linked-list teardown used across the
ROM, and it is six instructions. **Port `$246800` before `$246520`**: it is the cheapest item in this whole
dependency chain and the one most likely to be needed again immediately. `codexref` its twenty-one callers
after writing it -- that list is a map of every multi-part object in the game.

**So the dependency order for `$4C` is now fully determined, cheapest first:**

    1. $246800   6 instructions, 21 callers   the chain-free
    2. $246520   the two-pool constructor: pools $80FA86 (20 x $70) and $810346 (3 x $30), CONTIGUOUS;
                 dispatch $24627A (3 entries, index 3 is CODE); caller table = count word + count*12
    3. $26F858   8 callers, unread, called with D0 = 6
    4. $4C       everything else about it is read

Nothing in items 1 and 2 is unmeasured any more. Item 3 is the only unread routine left in `$4C`'s chain.

**AND THE `($2C)` LINK IS WORTH NAMING GLOBALLY.** `$24681A` (a separate routine immediately after) walks the
same chain summing `($18,A0)`, so `+$2C = next` and `+$18 = a per-node quantity` are a convention shared by at
least three routines. Any future multi-part object in this ROM will use them.

### `$246520` IS NOW READ END TO END (W341) -- a SECOND dispatch table at `$246B38`

The span `$2465A8..$2465CC`, which two earlier commits skipped over while calling the routine "fully scoped"
and then "read to its rts":

    2465a0  move.w (A0)+,D3 / andi.w #$1F,D3 / add.w D3,D3 / add.w D3,D3     mask to 0..31, then x4
    2465aa  lea ($246B38,PC),A3 / adda.w D3,A3        <-- A SECOND TABLE, 4 bytes per entry
    2465b2  move.w (A3)+,($16,A2)
    2465b6  move.w ($16,A2),($14,A2)                  the same word lands in TWO fields
    2465bc  move.w (A3),($1C,A2)
    2465c0  move.l #$FFFF0000,($18,A2)                +$18 -- the field $24681A SUMS
    2465c8  movea.l ($E,A2),A3                        A3 = the sprite base computed at $246592
    2465cc  move.w ($4,A2),D4                         the payload word count

**`$246B38` HOLDS 32 ENTRIES OF FOUR BYTES (`$80` bytes, `$246B38..$246BB7`)**, and the mask is what bounds it:
`andi.w #$1F` makes 0..31 the only reachable indices, so unlike `$24627A` this table needs no guard -- **the
ROM's own mask is the bound**, the same construction `$4A`/`$48`'s `andi.w #$1F` ring uses. Entry 32 reads
`0000 0000`, consistent with the table ending there.

Its contents are a descending-then-ascending pair ladder (`[0] 0000 0004`, `[1] 0000 0003`, `[2] 0000 0002`,
`[3] 0000 0001`, `[4] 0001 0001`, `[5] 0002 0001` ... `[31] 001C 0001`), so the first word climbs while the
second holds at 1 after entry 4. **Transcribe it; do not model it as a formula.**

**`($16,A2)` IS WRITTEN TO TWO FIELDS.** `$2465B6` copies it straight into `($14,A2)` as well, so a node's
`+$14` and `+$16` start equal and presumably diverge as it animates. Writing only one would leave the other at
whatever `loadSubProto` left.

**`+$18` IS INITIALISED TO `$FFFF0000`.** As a word that is `$FFFF` = -1, and `$24681A` sums `($18,A0)` across
the chain with `add.w`. So each fresh node contributes -1 to that sum, which is almost certainly a
"parts remaining" or "damage budget" accumulator counting up from a negative base -- worth confirming when
`$24681A`'s caller is identified.

**A THIRD CORRECTION ON THIS ONE ROUTINE.** I called it "fully scoped" (missing both strides and the unwind),
then "read to its rts" (missing this 36-byte span and this second table). Each claim was made after reading
*most* of it. **The pattern is now unmistakable: I claim completeness at the point where the remaining span is
small enough to feel like a detail.** The only reliable check is to display every byte from entry to `rts` and
say which addresses were displayed.

**WINDOWS `$246520`'s WAVE NEEDS:** `$24627A + $18` (3 entries, index 3 is CODE -- needs a guard) and
`$246B38 + $80` (32 entries, bounded by `andi.w #$1F` -- needs none). Plus each caller's table; `$4C`'s is
`$2701C8 + $E`.

### `$26F858` IS A STATE SETTER; THE DISPATCHER IS A SEPARATE ENTRY AT `$26F86A` (W341)

Displayed rather than inferred, because the first `dasm` started mid-routine and made these look like one
thing:

    26f858  b06e 0026    cmp.w ($26,A6),D0        <-- the SETTER begins
    26f85c  6700 000a    beq $26F868              already in that state -> do nothing
    26f860  3d40 0026    move.w D0,($26,A6)       set it
    26f864  426e 0028    clr.w ($28,A6)           ... and reset the sub-timer, ONLY on a change
    26f868  4e75         rts
    26f86a  41fa 001a    lea ($26F886,PC),A0      <-- the DISPATCHER, a SEPARATE entry
    26f870  move.w ($26,A6),D0 / add.w D0,D0 / add.w D0,D0 / adda.w D0,A0
    26f87a  movea.l (A0),A0 / jsr (A0)            the indirect call
    26f87e  jmp $2417DE                           tail jump to applyVelocityA6 -- ALREADY PORTED
    26f886  the EIGHT-entry jump table

**`$26F6CC moveq #$6,D0 / bsr $26F858` is therefore "GO TO STATE 6"**, and the `clr.w ($28,A6)` is why it
matters that the setter checks first: re-entering the same state must NOT reset the sub-timer. A port that
wrote the state unconditionally would restart the timer every frame the state was re-requested.

**THE JUMP TABLE AT `$26F886` HAS EIGHT ENTRIES** (`$20` bytes, `$26F886..$26F8A5`), and entry 8 reads
`$0C6E0000` -- not a code address -- so the table is bounded by its own data end and the state index is 0..7.
The eight handlers are `$26F8A6`, `$26F90E`, `$26FBD4`, `$26FCF2`, `$26FD66`, `$26FECA`, `$26FF3E`, `$26FF56`
-- **all unread**, and `$26F8A6` immediately follows the table, so the first handler's address doubles as the
table's far end.

**THIS REVISES `$4C`'s SIZE UPWARD, AND THAT IS THE USEFUL PART.** I had it as "one unread routine away from
writable". It is an eight-state machine whose eight handlers are all unread, spanning `$26F8A6..$2701C8` --
roughly **2300 bytes**. That makes `$4C` comparable to a boss, not to `$43`, and it should be scheduled as
several waves: the setter and dispatcher (small, and the dispatcher needs only `applyVelocityA6` plus the
table), then the handlers in groups.

**Windows:** `$26F886 + $20` for the jump table. The handlers will want their own once read.

So the honest state of `$4C`: init read and small, handler head read, damage arm read, death path read, and an
eight-state machine of ~2300 unread bytes behind `$26F86A`. Its two shared prerequisites (`$246800`,
`$246520`) are now PORTED, which was the real value of this stretch.

### `$4C` IS A TWO-LEVEL STATE MACHINE, WHICH EXPLAINS THE SETTER (W341)

`$26F8A6`, the state-0 handler, is itself a sub-state machine on **`($28,A6)`** -- exactly the field
`$26F858`'s setter clears:

    26f8a6  cmpi.w #$0,($28,A6) / bne $26F8C2
    26f8b0  move.w #$1600,($1A,A6)         speed $16, heading $00 -- the applyVelocityA6 FIELDS
    26f8b6  move.w #$202,($34,A6)          TWO byte fields: ($34)=2 ($35)=2
    26f8bc  move.w #$1,($28,A6)            sub-state 0 -> 1
    26f8c2  cmpi.w #$1,($28,A6) / bne $26F8DC
    26f8cc  cmpi.w #$2000,($2,A6) / blt $26F8DC     wait until Y reaches $2000
    26f8d6  move.w #$2,($28,A6)            sub-state 1 -> 2
    26f8dc  cmpi.w #$2,($28,A6) / ...

**SO `($26,A6)` SELECTS ONE OF EIGHT HANDLERS AND EACH HANDLER RUNS ITS OWN MACHINE ON `($28,A6)`.** That is
why the setter clears `($28,A6)` and why its early-out matters: entering a NEW outer state must restart the
inner one, and re-requesting the SAME outer state must not. Two facts recorded separately now explain each
other -- the setter's shape is a consequence of the handler's shape.

**AND IT CONFIRMS THE DISPATCHER'S TAIL JUMP.** `$26F8B0` writes `($1A,A6)`/`($1B,A6)`, which are exactly the
speed and heading `applyVelocityA6` reads -- so state 0 sets a velocity and the dispatcher's
`jmp $2417DE` is what applies it every frame. The three pieces (setter, dispatcher, handler) are one design.

`move.w #$202,($34,A6)` is the word-literal-as-two-byte-fields rule again: `($34,A6) = 2` and
`($35,A6) = 2`. That is the tenth instance of that idiom this session across `$43`, `$47`, `$4B` and `$4C`.

**PORTING SHAPE FOR THE EIGHT HANDLERS:** each is `if (sub === 0) {...} if (sub === 1) {...}` -- a FALL-THROUGH
cascade, not a switch. `$26F8AC bne` skips to the next test rather than to an exit, so a handler can advance
through several sub-states in one frame. **Do not write these as `else if` or as a `switch`**: sub-state 0
setting `($28,A6) = 1` means the `cmpi.w #$1` immediately below it takes effect on the SAME frame. That is the
same cascade shape `$43`'s three states use and the opposite of `$4A`'s mutually exclusive arms.

Still unread: the rest of `$26F8A6` past `$26F8DC`, and the seven handlers `$26F90E`, `$26FBD4`, `$26FCF2`,
`$26FD66`, `$26FECA`, `$26FF3E`, `$26FF56`.

### `$4C` STATE 0 IS COMPLETE (W341) -- and `($1A,A6)` IS BOTH THE SPEED AND THE DECELERATION COUNTER

    26f8dc  cmpi.w #$2,($28,A6) / bne $26F90C          sub-state 2
    26f8e6  subq.b #1,($34,A6) / bcc $26F90C           the cadence -- UNDERFLOW convention
    26f8ee  move.b ($35,A6),($34,A6)                   reload from the pair sub-state 0 seeded
    26f8f4  subq.b #1,($1A,A6) / bne $26F90C           <-- DECREMENT THE SPEED, test for ZERO
    26f8fc  move.b #$1,($17,A5)
    26f902  move.w #$A001,(A6)                         the record's type word
    26f906  moveq #$1,D0 / bsr $26F858                 -> outer state 1
    26f90c  rts

**`($1A,A6)` IS THE SPEED `applyVelocityA6` READS *AND* THE COUNTER THIS ARM DECREMENTS.** Sub-state 0 seeds
it to `$16` (via `move.w #$1600,($1A,A6)`), the dispatcher's `jmp $2417DE` reads it every frame to move the
object, and sub-state 2 knocks it down by one per cadence tick until it hits zero. **So state 0 is "enter
moving, decelerate to a stop, then advance"** -- the deceleration and the timer are the same byte.

Read as a plain timer, the object would keep its entry speed and then teleport into state 1. Read as a plain
speed, the state would never advance. **It is both, and a port must decrement the field the velocity code
reads.** That is a third distinct meaning for `($1A,A6)` in this project after `$4B`'s animation counter and
the band's palette base -- and the fourth countdown-shaped thing that is not a countdown.

Note the mixed conventions inside eight instructions: `($34,A6)` uses `subq.b`/`bcc` (underflow) and
`($1A,A6)` uses `subq.b`/`bne` (fires AT ZERO). **Two of the four catalogued conventions, six bytes apart**,
which is the same trap `$43` set at `$26DE6E`/`$26DE7C`.

`move.w #$A001,(A6)` sets the record's type word on the way out: bit 15 (alive), bit 13, and bit 0.
Transcribe the literal; do not decompose it into flag names that have not been measured.

**STATE 0 IS THEREFORE FULLY READ AND SMALL** -- roughly 24 instructions across three sub-states. If the other
seven are comparable, `$4C`'s ~2300 bytes are mostly the later handlers, and the eight can be written in two
or three waves rather than eight.

Still unread: `$26F90E` (state 1, which begins immediately at `$26F90E cmpi.w #$0,($28,A6)` -- the same
cascade shape) and the six after it.

### `$4C` STATE 1 (W341) -- a two-point oscillation, and a table bounded TWICE

    26f90e  cmpi.w #$0,($28,A6) / bne $26F938        sub-state 0
    26f918  move.w #$1,($28,A6)
    26f91e  move.b #$4,($1A,A6)                      speed 4 (state 0 left it at ZERO)
    26f924  move.w #$0,($2A,A6)                      the oscillation cursor
    26f92a  move.w #$12C,($30,A6)                    a 300-frame duration
    26f930  bsr $26F994 / bsr $26FA5E                two more private subroutines
    26f938  lea ($26F984,PC),A0 / adda.w ($2A,A6),A0
    26f942  movem.w (A0),D2-D3                       <-- SIGN-EXTENDS both words
    26f946  bsr $26FF9E / bcs $26F958                a call reporting through CARRY
    26f94e  addq.w #4,($2A,A6) / andi.w #$7,($2A,A6) advance the cursor on SUCCESS only
    26f958  subq.w #1,($30,A6) / bne $26F982         the duration

**`($2A,A6)` ALTERNATES BETWEEN EXACTLY TWO VALUES.** Step 4, mask `$7`: `0 -> 4 -> 0 -> 4`, because `8 & 7`
is 0. So the table at `$26F984` has **TWO** four-byte entries and no more:

    [+0]  5000 2A00
    [+4]  5000 0E00
    [+8]  3D7C 0000   <-- CODE (`move.w #$46,...` then `rts` at $26F992)

**IT IS BOUNDED TWICE OVER** -- by the ROM's own `andi.w #$7`, and by code at `+8`. That is the fifth table
this session bounded by its own instruction stream, and the first that is *also* mask-bounded. So no guard is
needed (the mask suffices) but the window must still stop at `$8`: `$26F984 + $8`, not `$10`.

**Both entries share D2 = `$5000` and differ only in D3 (`$2A00` / `$0E00`)**, and `movem.w` sign-extends both
into full longs. Given `$24203E`'s documented convention (`self=D0/D1 target=D2/D3`), these are almost
certainly **two target positions at the same X**, and `$26FF9E` is a move-toward-target that reports arrival
through carry: on carry CLEAR the cursor flips to the other point. **So state 1 is "oscillate between two
points at speed 4 for 300 frames"** -- and the `bcs` skipping the flip is what makes it wait until it arrives.

State 0 left `($1A,A6)` at ZERO after decelerating; state 1 re-seeds it to 4. **The speed field is handed
between states**, which is worth knowing before writing them independently.

Two more private subroutines appear: `$26F994` and `$26FA5E`, both called once from sub-state 0. And
`$26FF9E` is the target-mover, called every frame.

Still unread: `$26F982`'s tail, `$26F994`, `$26FA5E`, `$26FF9E`, and the six handlers from `$26FBD4`.

### `$26FF9E` IS A DISTANCE-BANDED APPROACH, AND ONLY `$242494` IS NEW (W341)

`$26FF9E`, called every frame by `$4C`'s state 1 and by six other sites:

    26ffa4  sub.w D0,D3                    the delta to the target
    26ffa6  jsr $242494                    -> D0 = a DISTANCE
    26ffac  cmpi.w #$200,D0 / bge $26FFCC  far: keep the current speed
    26ffb2  move.b #$8,($1A,A6)            under $200: speed 8
    26ffb8  cmpi.w #$100,D0 / bge $26FFCC
    26ffbe  move.b #$6,($1A,A6)            under $100: speed 6   <-- the writes CASCADE
    26ffc4  cmpi.w #$40,D0 / blt $26FFE2   under $40: ARRIVED -- and $26FFE2 CLEARS carry (corrected)
    26ffcc  jsr $242038                    otherwise aim and move

**THE SPEED WRITES CASCADE RATHER THAN SWITCHING.** For `$40 <= D0 < $100` BOTH `move.b`s execute and the
field ends at 6, because `$26FFB0`'s `bge` only skips when D0 is `$200` or more. So the bands are: `>= $200`
unchanged, `$100..$1FF` speed 8, `$40..$FF` speed 6, `< $40` arrived. **Written as a switch, the `$40..$FF`
band would get speed 8** -- the same fall-through-not-switch shape the eight state handlers use.

So `$4C` decelerates as it approaches each of state 1's two oscillation points, and `($1A,A6)` is written here
too -- a FOURTH writer of that field after state 0's seed, state 0's decrement and state 1's re-seed.

**BOTH OF ITS CALLEES RESOLVE, AND ONLY ONE IS NEW:**

    $242038   THREE callers. Its preamble is `4CAE 0003 0002` = `movem.w ($2,A6),D0-D1` -- and it FALLS
              STRAIGHT INTO `$24203E`, which `aim.js:62` already carries as `core64` ("self=D0/D1
              target=D2/D3 -> D1", 48 callers). **So `$242038` is the A6-convenience entry to a ported
              routine**, exactly analogous to `applyVelocityA6` vs `applyVelocity`. Two instructions, not a
              prerequisite.
    $242494   TWENTY-ONE callers, UNPORTED, returns a distance in D0. **This is the one real gap here**, and
              at twenty-one callers it is core geometry infrastructure like `$246800` was -- port it on its
              own and expect it to unblock widely.

That is the sixth time this session a suspected prerequisite turned out to be a thin entry onto ported code,
against three that were real (`$246520`, `$246800`, and now `$242494`). The distinguishing signal remains
caller count PLUS a substantial body: `$242038` is two instructions.

Still unread for `$4C`: `$26F994`, `$26FA5E`, `$26FFE2`'s carry tail, and the six handlers from `$26FBD4`.

### `$26FF9E`'s TWO EXITS, AND A POLARITY I HAD BACKWARDS (W341)

    26ffd8  move.b D1,($1B,A6)        the aim result becomes the HEADING
    26ffdc  ori  #$1,SR / rts         <-- carry SET   = still moving
    26ffe2  andi #$FFFE,SR / rts      <-- carry CLEAR = ARRIVED (from $26FFC8's blt)

**CORRECTION.** The `$26FF9E` section above said "`$26FFE2` sets the carry state 1 reads". It **clears** it.
Fixed in place. The state-1 section's reading was right for the wrong stated reason, so both now agree:

    state 1: bsr $26FF9E / bcs $26F958
      carry SET   -> still moving -> SKIP the cursor flip, keep aiming at the same point
      carry CLEAR -> arrived      -> advance ($2A,A6) to the other point

So the `bcs` is what makes the oscillation wait for arrival, and the ROM signals "not done" with carry set --
the same convention as `$281842`'s full-pool path (W336) and `$26DC00`'s retry (W340). **Three routines now
return failure-or-not-yet as carry SET via an explicit `ori #$1,SR`.** Treat that as this codebase's idiom and
check the polarity at the `ori`/`andi`, never at the caller's branch alone: I read the caller correctly and
still wrote the callee backwards.

`$26FFD8` also names a field: the aim result from `$242038`/`core64` lands in `($1B,A6)`, which is exactly the
heading `applyVelocityA6` reads. **So `$26FF9E` steers and the dispatcher's tail jump moves** -- and with
`($1A,A6)` set by the distance bands, that pair is the whole locomotion of `$4C`.

### `$26FFE8` IS `$4C`'s DYING DRIFT (W341)

    26ffe8  tst.b ($9F,A6) / beq $270128      runs ONLY when the dying flag is set
    26fff0  subi.w #$40,($2,A6)               and moves the record UP by $40 per frame

`$26F6E4 bsr $26FFE8` is its one caller, on the death path. So a dying `$4C` drifts upward at `$40` per frame
-- which is what eventually takes it past the `$800` off-screen limit and frees it. **The retirement is a
drift, not a timer**, and the `($9F,A6)` test has the same "runs only when marked" polarity as `$47`'s
`$26DCB6`.

Still unread for `$4C`: `$26F994`, `$26FA5E`, `$270128` onward, and the six handlers from `$26FBD4`.

### `$4C` USES THE "ARM + RUN" SPLIT TWICE, AND HAS A THIRD STATE LEVEL (W341)

    26f994  move.w #$1,($46,A6)        <-- the ARM: three instructions
    26f99a  move.w #$0,($4C,A6)
    26f9a0  rts
    26f9a2  tst.w ($46,A6) / beq $26FA24     <-- the RUNNER, a SEPARATE routine
    26f9aa  cmpi.w #$1,($4C,A6) / bne $26F9C6
    26f9b4  move.w #$A00,($48,A6) / move.w #$A00,($4A,A6) / move.w #$0,($4C,A6)
    26f9c6  cmpi.w #$0,($4C,A6) / bne $26FA24
    ...

**THIS IS THE SAME SETTER/RUNNER SPLIT AS `$26F858`/`$26F86A`, AND IT IS THE SECOND INSTANCE IN THIS TYPE.**
`$26F994` arms a subsystem (`($46,A6) = 1`) and resets its cursor (`($4C,A6) = 0`); `$26F9A2` runs it, gated
on the arm flag and cascading on the cursor. Both have exactly ONE caller each -- so they are `$4C`-private,
not shared, and the split is a **style** this author uses rather than an interface for other types.

**SO `$4C` HAS THREE LEVELS OF STATE**, and a port must keep them distinct:

    ($26,A6)   the OUTER state, 0..7, selecting one of eight handlers   (set by $26F858, run by $26F86A)
    ($28,A6)   each handler's own sub-state cascade                     (cleared by $26F858 on a change)
    ($4C,A6)   a THIRD machine, gated by the arm flag ($46,A6)          (set by $26F994, run by $26F9A2)

`($48,A6)`/`($4A,A6)` are seeded to `$A00` each -- a pair of equal values, so likely a symmetric X/Y or a
two-muzzle offset, and note they are set on cursor `1` and the cursor is then reset to `0`, so the runner
cycles rather than advancing monotonically.

**Recognising the split matters because both halves look like one routine in a `dasm` that starts at the
first address.** That is exactly how I first misread `$26F858`, and this is the same shape fourteen bytes
further on. **When a routine in `$4C` ends in an `rts` followed immediately by a `tst.w` of the flag it just
set, expect two entry points.**

`$26FA5E`, state 1's other one-caller subroutine, is still unread -- and by this pattern it may well be
another arm or runner.

Still unread for `$4C`: `$26F9C6` onward, `$26FA24`, `$26FA5E`, `$270128` onward, and the six handlers from
`$26FBD4`.

### `$4C`'s SUBSYSTEMS ARE ONE PER SUB-RECORD, AT A `$20` STRIDE (W341)

`$26FA5E` is a THIRD arm, and comparing it with `$26F994` reveals the layout:

    26fa5e  move.w #$1,($66,A6)        arm #2
    26fa64  move.w #$0,($6C,A6)        cursor #2
    26fa6a  move.w #$1818,($6E,A6)     a cadence PAIR: ($6E)=$18 ($6F)=$18
    26fa70  tst.w $813098 / beq $26FA80    <-- THE RANK GATE
    26fa7a  move.w #$404,($6E,A6)      above rank 0: $04/$04 -- FOUR TIMES FASTER
    26fa80  rts
    26fa82  tst.w ($66,A6) / beq $26FBA2   the runner, same shape as $26F9A2

**THE ARM/CURSOR PAIRS SIT ONE PER SUB-RECORD AT A `$20` STRIDE:**

    sub-record 1   +$26 outer state   +$28 its cascade      ($26F858 / $26F86A)
    sub-record 2   +$46 arm           +$4C cursor           ($26F994 / $26F9A2)
    sub-record 3   +$66 arm           +$6C cursor           ($26FA5E / $26FA82)

`$66 - $46 == $20` and `$6C - $4C == $20`, exactly the sub-record stride. **So each of `$4C`'s five
`$20`-byte sub-records hosts one machine**, and `($4,A5) = 4` (five sub-records) is not just a size -- it is
how many independent machines the object has room for. That is a fifth structural fact derived from `($4,A5)`,
after the overlap depth and the hitMask/retire/dying trio.

**It also predicts where to look:** a fourth pair would be `+$86`/`+$8C` in sub-record 4, and the `+$8E` hit
mask and `+$9E`/`+$9F` flags already measured live in that same sub-record. So sub-record 4 is the
damage/lifetime record and sub-records 2 and 3 are weapon subsystems.

**AND THE RANK GATE IS A CADENCE, NOT A PATTERN CHANGE.** `$1818` at rank 0 becomes `$404` above it -- the
reload byte drops from `$18` to `$04`, so the subsystem fires **four times as often** at higher rank. Contrast
`$47`, whose rank arm interleaves a second bullet TYPE at the same rate (W339). **Two types, two different
rank mechanisms**: `$47` changes what it fires, `$4C` changes how often. Neither is a difficulty multiplier
applied uniformly, so neither can be inferred from the other.

`move.w #$1818` and `move.w #$404` are the word-literal-as-two-byte-fields idiom for the eleventh and twelfth
time this session.

Still unread for `$4C`: `$26F9C6` onward, `$26FA24`, `$26FA8A` onward, `$26FBA2`, `$270128` onward, and the
six handlers from `$26FBD4`.

### `$4C` SUBSYSTEM 2's RUNNER (W341) -- A DEAD CONDITIONAL, AND THE BORROW RULE AGAIN

    26f9d0  move.w ($48,A6),D0 / add.w ($4A,A6),D0 / bne $26FA24   wait until BOTH counters are zero
    26f9dc  moveq #$0,D0                                           <-- D0 := 0
    26f9de  and.w $80390A,D0                                       <-- 0 AND anything IS 0
    26f9e4  bne $26FA24                                            <-- SO THIS IS NEVER TAKEN
    26f9e6  move.w #$1,($4C,A6)
    26f9ec  moveq #$4E,D0 / jsr $263684        enqueueDeferred(type $4E, DEFQ_D1.FIXED00) -- PORTED
    26f9f4  move.l ($2,A6),D0 / addi.l #-$3C01380,D0 / move.l D0,($16,A0)
    26fa02  move.w #$FA00,($1A,A0)             a speed/heading PAIR: $FA / $00
    26fa08  moveq #$4E,D0 / jsr $263684        a SECOND spawn

**`$26F9DC..$26F9E4` IS A DEAD CONDITIONAL AND IT LOOKS COMPLETELY LIVE.** `moveq #$0,D0` then
`and.w $80390A,D0` leaves D0 zero whatever `$80390A` holds, so the `bne` can never be taken. `$80390A` is in
the player-input region (`movement.js` has `P2RAW = $803976`), so this READS as "only fire when the player is
doing something" and is in fact unconditional. **Third kind of dead code this session** -- after `$2716D8`'s
`tst.w` of a `lea` opcode (W335) and `$2714AE`'s bare `rts` (W336), this is a *test whose operand is forced to
zero by the instruction before it*.

**Omit the branch, keep the reading.** A port that modelled the input test would silence subsystem 2 whenever
the player was idle, which is a plausible-looking bug nobody would trace to a `moveq`. And do NOT "repair" it
to `move.w $80390A,D0`: that is a guess about intent, and the board runs the dead version.

**THE BORROW RULE, A SIXTH TIME.** `addi.l #-$3C01380` is `$FC3FEC80`. Assembled naively from the word pair
`-$3C0`/`-$1380` it would be `$FC40EC80` -- **one more in the high word**, because the low half's borrow takes
one off. Transcribe the longword.

Both spawns go through `$263684`, which is `enqueueDeferred` with `DEFQ_D1.FIXED00` -- **already ported**, and
the same family `$43` uses at `$263678` with `FIXED80`. So subsystem 2 needs no new machinery: it waits for two
counters, then queues two type-`$4E` objects with biased positions and a `$FA00` speed/heading pair.

By the `$20`-stride finding, subsystem 3's runner at `$26FA82` should mirror this with `+$68`/`+$6A` counters
and its own spawn type. **Read it rather than assuming the mirror** -- this band has punished that inference
nine times.

Still unread for `$4C`: `$26FA10` onward, `$26FA24`, `$26FA8A` onward, `$26FBA2`, `$270128` onward, and the six
handlers from `$26FBD4`.

### `$4C` SUBSYSTEM 3 IS *NOT* SUBSYSTEM 2's MIRROR (W341) -- and its input gate is LIVE

The previous section said to read `$26FA82` rather than assume it mirrored `$26F9A2`. It does not:

    26fa8a  cmpi.w #$1,($6C,A6) / bne   -> move.w #$800,($68,A6) / cursor := 0
    26faa0  cmpi.w #$2,($6C,A6) / bne   -> move.w #$800,($6A,A6) / cursor := 0
    26fab6  cmpi.w #$0,($6C,A6) / bne $26FBA2
    26fac0  tst.w $803914 / bne $26FB3E          <-- a LIVE input test
    26faca  moveq #$0,D0
    26facc  tst.w $8103E6 / ...

**THREE differences from subsystem 2**, none inferable:

    subsystem 2 ($26F9A2)          subsystem 3 ($26FA82)
    TWO cursor cases (1, 0)        THREE (1, 2, 0)
    seeds ($48)/($4A) TOGETHER     seeds ($68) and ($6A) SEPARATELY, on different cursors
    its input test is DEAD         its input test is LIVE

**AND THE DEAD/LIVE DISTINCTION IS ONE INSTRUCTION.** Both subsystems have a `moveq #$0,D0` next to an address
test, and only one is dead:

    subsystem 2:  moveq #$0,D0 / and.w $80390A,D0 / bne     DEAD -- the moveq feeds the AND's destination
    subsystem 3:  tst.w $803914 / bne                       LIVE -- a direct tst, nothing zeroed it
                  moveq #$0,D0 / tst.w $8103E6              LIVE -- the moveq clears D0 for LATER use,
                                                            and `tst.w` does not read D0 at all

**So the test for deadness is whether the zeroed register is the following instruction's DESTINATION**, not
whether a `moveq #$0` appears nearby. Getting that backwards in either direction is a live defect: modelling
subsystem 2's gate silences it when the player is idle; omitting subsystem 3's makes it fire unconditionally.

`$803914` joins `$80390A` in the player-input region, and `$8103E6` is new -- and note it sits just past the
`$810346 + 3 * $30 = $8103D6` parent pool measured earlier, so it is in the RAM the `$246520` subsystem
neighbours rather than in the input block.

Still unread for `$4C`: `$26FA10`, `$26FA24`, `$26FACC` onward, `$26FB3E`, `$26FBA2`, `$270128` onward, and the
six handlers from `$26FBD4`.

================================================================================
## TYPE `$4C` -- ONE CONSOLIDATED REFERENCE (W341). READ THIS INSTEAD OF THE 22 SECTIONS ABOVE.
================================================================================

Twenty-two sections above accumulated `$4C` one finding at a time. This block is the whole picture; they
remain only as the reasoning trail. **Everything below was displayed, not inferred.**

    init      $26F4DA  (($4,A5) = 4 -> FIVE $20-byte sub records)
    initBody  $26F4E2
    handler   $26F5F2
    records   ONE, in stage 5's script.  Window: $26F55A + $AC (prototypes, TWENTY-byte handler overlap)

### THE FIVE FACTS THAT FALL OUT OF `($4,A5) = 4`

    record size          5 * $20 = $A0
    prototype overlap    $26F566 + $A0 = $26F606 vs handler $26F5F2  ->  TWENTY bytes
    hitMask              size - $12 = +$8E
    retire flag          size - 2   = +$9E
    dying flag           size - 1   = +$9F
    subsystem slots      one machine per sub-record, arm/cursor at a $20 stride

### THREE LEVELS OF STATE, EACH AN "ARM + RUN" PAIR WITH TWO ENTRY POINTS

    sub-rec 1   +$26 state / +$28 cascade   $26F858 sets (with an early-out) / $26F86A dispatches
    sub-rec 2   +$46 arm   / +$4C cursor    $26F994 arms                     / $26F9A2 runs
    sub-rec 3   +$66 arm   / +$6C cursor    $26FA5E arms                     / $26FA82 runs

**Every pair is TWO routines, and both halves look like one in a `dasm` that starts at the first address.**
`$26F858`'s early-out is load-bearing: re-entering the same outer state must NOT clear `($28,A6)`.

### THE OUTER MACHINE

`$26F86A`: index `($26,A6) * 4` into the eight-entry table at **`$26F886 + $20`** (its far end is `$26F8A6`,
the first handler it names), `jsr (A0)`, then `jmp $2417DE` -- `applyVelocityA6`, already ported.

    state 0  $26F8A6  READ.  Enter at speed $16, decelerate to a stop, -> state 1.
    state 1  $26F90E  READ.  Speed 4; oscillate between two points from $26F984 + $8 for 300 frames.
    state 2  $26FBD4  READ.  Speed $10 to ONE target, D2/D3 IMMEDIATE ($2800/$1C00), stop on arrival.
    state 3  $26FCF2  READ (head).  Duration $F0 and speed $10; winds ($1E,A5) DOWN BY $40 with a
                      SIGNED CLAMP at zero, every frame and outside the sub-state cascade.
    state 4  $26FD66  READ (head).  State 2's SHAPE with every constant different -- see below.
    state 5  $26FECA  READ (head).  State 3's shape: duration $40 (vs $F0), speed $10 (SAME), and the
                      SAME wind-down block -- BYTE-IDENTICAL, 24 bytes, verified.
    state 6  $26FF3E  READ, COMPLETE.  FOUR instructions: `move.w #$420,($1A,A6)` then rts. Speed $04,
                      heading $20, as a WORD write to the speed/heading PAIR. Nothing else.
    state 7  $26FF56  READ (head).  Heading := 0, then ACCELERATE: `addq.b #1,($1A,A6)` per frame,
                      capped at 8 by `cmpi.b #$8 / beq`. The counterpart to state 0's deceleration.

**ALL EIGHT STATES ARE NOW MAPPED**, and the machine reads as a scripted entrance:

    0  enter at speed $16, DECELERATE to a stop            -> state 1
    1  speed 4, oscillate between two table points, 300 frames
    2  speed $10 to $2800/$1C00 (immediate), STOP on arrival
    3  duration $F0, speed $10, wind ($1E,A5) down by $40
    4  speed 8 to $3200/$1C00 (immediate), slow to 4 on arrival
    5  duration $40, speed $10, the SAME 24 bytes as state 3
    6  speed $04 heading $20, and nothing else (four instructions)
    7  heading 0, ACCELERATE to 8

**Speed is the through-line**: `$16` decelerating to 0, then 4, `$10`, `$10`, 8-to-4, `$10`, 4, accelerating
to 8. Six of the eight states write `($1A,A6)` and they never agree on a value -- which is why the four
writers of that field (state 0's seed, state 0's decrement, state 7's increment, and `$26FF9E`'s distance
bands) all have to be ported separately.

**State 6's `move.w #$420,($1A,A6)` is the word-pair idiom landing on the LOCOMOTION fields** -- speed `$04`
and heading `$20` in one instruction. Read as a single word this state would set an absurd speed and no
heading. Twelfth-plus instance of that idiom this session and the first on these two fields.

**STATES 3 AND 5 SHARE 24 BYTES VERBATIM, AND THIS IS THE FIRST THING IN `$4C` THAT ACTUALLY IS SHARED.**
`$26FD0E..$26FD25` and `$26FEE6..$26FEFD` are byte-identical:

    4a6d 001e  6700 0012  046d 0040 001e  6e00 0008  3b7c 0000 001e

Both also use speed `$10`; only the duration differs (`$F0` against `$40`). **So a helper IS justified here**,
in contrast to states 2/4 where a shared move-to-a-point routine would have needed five parameters and still
got the arrival semantics wrong. The distinguishing evidence is byte-identity, not similarity of shape:

    states 2 & 4   same SHAPE, five constants differ    -> write them separately
    states 3 & 5   24 bytes IDENTICAL, one constant differs -> ONE helper, one parameter

**Check byte-identity before factoring anything in this type.** Six of `$4C`'s eight states are now read and
that is the only verbatim repeat among them.

**STATES 2 AND 4 ARE THE SAME SHAPE AND SHARE NO CONSTANT BUT ONE.** Both are "set a speed, move to an
immediate D2/D3 target, change speed on arrival":

                        state 2        state 4
    entry speed         $10            $08
    target D2 (X)       $2800          $3200
    target D3 (Y)       $1C00          $1C00      <-- the ONE they share
    arrival speed       $00 (stop)     $04 (keep moving slowly)
    sub-state 0 clears  ($2A),($2B),($34)   ($2A) only

**So a shared "move to a point" helper would need five parameters and would still get the arrival semantics
wrong**: state 2 stops, state 4 slows. That is the `$48`/`$49`/`$4A`/`$4B` band's lesson one level down --
identical instruction sequences, different constants, and the sameness of the Y target is the only thing that
transfers.

**STATE 3 ADDS A FIFTH COUNTDOWN CONVENTION**, and it is the only one so far that is not a decrement-by-one:

    26fd0e  tst.w ($1E,A5) / beq $26FD26          skip entirely when already zero
    26fd16  subi.w #$40,($1E,A5) / bgt $26FD26    subtract a STRIDE, signed-compare the result
    26fd20  move.w #$0,($1E,A5)                   ... and CLAMP rather than let it go negative

    subq + bcc          fire on UNDERFLOW                  due8
    subq + bpl          run into NEGATIVES                  $26DC04 ($47)
    subq + beq / bne    fire AT ZERO                        $26DCA2 ($47), $25354C (W29)
    subq + cmpi #$N     fire at an ARBITRARY CONSTANT       $26DE7C ($43)
    subi #$N + bgt      subtract a STRIDE, CLAMP at zero    $26FD16 ($4C)   <-- FIFTH

Note it runs OUTSIDE the `($28,A6)` cascade -- between sub-state 0's block and sub-state 1's test -- so it
winds down on every frame the state is active regardless of sub-state. **A port that put it inside a sub-state
arm would stall it.**

**THE TARGET CAN BE IMMEDIATE OR TABLE-SOURCED, AND `$26FF9E` DOES NOT CARE.** State 1 loads D2/D3 with
`movem.w (A0),D2-D3` from a two-entry table (sign-extending); state 2 uses `move.w #$2800,D2` /
`move.w #$1C00,D3` outright. Same callee, same carry protocol -- so do not build a shared "load the target"
helper that assumes a table.

**AND `($2A,A6)` IS WRITTEN AT TWO DIFFERENT WIDTHS.** State 1 does `move.w #$0,($2A,A6)`; state 2 does
`move.b #$0,($2A,A6)` AND `move.b #$0,($2B,A6)` as separate instructions. Both zero the same two bytes here,
but they are not the same instruction and a port that unified them would lose the distinction the moment
either wrote a non-zero. State 2 also writes `($34,A6)` as a BYTE where state 0 wrote it as the word pair
`$202`.

**Each handler is a FALL-THROUGH cascade of `if (sub === N)`, never a switch**: setting `($28,A6) = 1` means
the `cmpi.w #$1` below it fires on the SAME frame.

### LOCOMOTION -- three fields, four writers

`($1A,A6)` speed and `($1B,A6)` heading are what `applyVelocityA6` reads. `$26FF9E` steers (writing the
heading from `core64`) and sets the speed by DISTANCE BAND: `>= $200` unchanged, `$100..$1FF` -> 8,
`$40..$FF` -> 6, `< $40` -> arrived. **The band writes CASCADE**, so `$40..$FF` really is 6.
`$242494` (ported W341) supplies the distance: `max(a,b) + min(a,b)/2` with **`a = |dy| * 3/4`, one axis only**.

`($1A,A6)` is ALSO state 0's deceleration counter and is re-seeded by state 1. Four writers, three meanings.

### DAMAGE AND DEATH

`$7FFF` sink at `($18,A6)` over a LONG HP at `($1A,A5)`; the subtraction is **gated on `($16,A5)`**, so `$4C`
is invulnerable until it appears. Palette XOR literal `$D`. Kill score `$700`.
Death marks `(A6) = $8000` and `($9F,A6) = 1`, clears BOTH `$8130DE` and `$8130E0`, pushes
`pushExternalSpeed($20,$20)`, and builds parts via `$246520` (ported W341) from `$2701C8 + $E`.
**Retirement clears only `$8130DE`** -- the two exits genuinely differ; do not unify them.
`$26FFE8` then drifts the record UP `$40` per frame until the `$800` off-screen limit frees it.

### THE TWO DEAD-CODE TRAPS, AND THE ONE-INSTRUCTION TEST THAT SEPARATES THEM

    subsystem 2  moveq #$0,D0 / and.w $80390A,D0 / bne     DEAD: the moveq feeds the AND's DESTINATION
    subsystem 3  tst.w $803914 / bne                       LIVE: a direct tst
                 moveq #$0,D0 / tst.w $8103E6              LIVE: tst.w never reads D0

**Deadness is "is the zeroed register this instruction's destination", not "is there a `moveq #$0` nearby".**

### RANK

`$4C` scales rank as a **cadence**: `($6E,A6)` is `$1818` at rank 0 and `$404` above, so subsystem 3 fires four
times as often. (`$47` scales rank by interleaving a bullet TYPE instead -- two types, two mechanisms.)

### WHAT REMAINS

Six state handlers (`$26FBD4` onward, the bulk of ~2300 bytes) plus the spans `$26FA10`, `$26FA24`, `$26FACC`,
`$26FB3E`, `$26FBA2`, `$270128`. **No unported callee remains**: `$246800`, `$246520`, `$242494`,
`applyVelocityA6`, `core64`, `enqueueDeferred` (both `FIXED00` and `FIXED80`), `installBank`, `scoreHit`,
`scoreKill`, `pushExternalSpeed`, `scrollCompensate` and `$23DECE` are all in the port.

### W344 START: THE TRANSITION SCREEN'S PHASE-0 ARM IS READ. `$23C668` NEEDS A VIDEO-SPACE MODEL FIRST.

**`$25DC2C..$25DCA8` -- object [11] phase 0's arm, read in full:**

    25dc2c  movea.l ($8,A5),A4                     the descriptor
    25dc30  cmpi.b #$0,($C,A5) / bne $25DCC0       PHASE 0 ONLY
    25dc3a  tst.w $813098 / beq $25DC50            rank
    25dc44  cmpi.w #$4,$813092 / beq $25DCC0       ... and stage index 4 -> skip entirely
    25dc50  tst.w $803926 / bne $25DCC0
    25dc5a  movea.l ($4,A4),A0 / jsr (A0)          the descriptor's INPUT READ ($23D186, ported)
    25dc60  btst #$F,D0 / beq $25DCC0              bit 15 -- START not pressed -> nothing
    25dc68  jsr $28D53C / bcs $25DCC0              a gate, 6 callers, UNPORTED
    25dc72  movea.l ($C,A4),A0 / jsr (A0) / bcs    a SECOND descriptor slot, UNPORTED
    25dc7c  bsr $25DA60 / bsr $25DA94              the two cursor routines (1 caller each)
    25dc84  move.b #$1,($C,A5)                     **PHASE 0 -> 1**
    25dc8a  move.b ($7,A5),D0 / jsr $260A88        6 callers, UNPORTED
    25dc94  move.w ($14,A4),D0 / lea $225978,A0 / jsr $24150A    installBank (PORTED)
    25dca4  jsr $23C668                            the block clear

**So phase 0 is "wait for START, then set up and advance to phase 1"**, and the `cmpi.w #$4,$813092` means it
is skipped outright on stage 5 at non-zero rank -- worth knowing before wondering why it never runs there.

**`$23C668` IS FOUR INSTRUCTIONS AND I COULD NOT PORT IT.** It is `lea $907000,A0 / move.w #$FF,D0 /
move.l #$0,(A0)+ / dbra` -- 256 longwords, `$400` bytes, and `#$FF` + `dbra` is 256 not 255. **But `$907000`
is not main RAM**: `new Ram().setU32(0x907000, ...)` throws `RangeError: $907000 is outside main RAM`.
`background.js`'s video object addresses `$904000` through `setLong(dest)` with `(dest - $904000) >> 2`, and
whether its array reaches `$907000` (`$3000` further on) is unmeasured.

**I wrote the function against `ram`, its tests failed on that throw, and I removed both rather than leave code
that cannot run.** The reading is kept here because it is correct and the routine has SIX callers -- it opens
the phase-0 arm AND bonus lines 1 and 2 (`$25FFA8`, `$260056`), so the D24/D31 chain runs through it.

**MEASURED (W344): `$907000` IS NOT IN ANY VIDEO OBJECT THE PORT HAS.**

    TxVram   64 * 32 * 2 = 4096 words = $2000 bytes, base $904000  ->  covers $904000..$905FFF
    BgVram   64 * 16 * 2 = 2048 words = $1000 bytes
    $907000  is $1000 bytes PAST TxVram's end -- outside it, and outside BgVram

**So this is not "a four-line port with six callers waiting", as I estimated one commit ago.** It needs a new
video region first: something must model `$907000..$9073FF` before `$23C668` can write anything. That is a new
subsystem decision (which object, what size, who else reads it), not a transcription.

**`$907000`'s ROLE IS STILL UNMEASURED.** `$904000` is the text plane (`TxVram`, 8KB) and `$9000A4`/`$9000BC`
in `handlers.js` are selected by `$803926`. `$907000` sits `$1000` past the text plane, so a second plane or a
sprite region are both plausible and neither is measured. **Find its other readers before choosing a model** --
`$23C668` only clears it, so the routine that READS it is what defines its shape.

**REMAINING FOR PHASE 0:** `$28D53C` (6 callers), `$260A88` (6 callers), `$25DA60` and `$25DA94` (1 each,
and `$25DA94` calls `$25DAEA` which the port HAS as `otherSideHolds25DAEA`), and the descriptor's `($C,A4)`
slot. **Two of those five have six callers each, so they are shared infrastructure and worth their own waves**
-- the signal that separated `$246520` from `$23C4A0` earlier this session.

### `$907000` IS ONE OF A PAIR OF `$400`-BYTE BUFFERS (W344). THE MODEL IS NOW DEFINED.

Scanned every longword in `$200000..$2B0000` pointing into `$907000..$9073FF`. **Four hits, three real:**

    23c66a  lea $907000,A0     the clear ($23C668)
    2592d2  lea $907000,A0     a consumer
    2593d4  lea $907000,A0     a second consumer
    2655b8  -- NOT a reference: the preceding word is `6D00`, a `blt` displacement, and `$9072xx` here is
            `blt` + `moveq #$0,D1` read as a longword. A value-range scan finds these; check the opcode.

**AND THE FIRST CONSUMER NAMES ITS PARTNER:**

    2592d0  lea $907000,A0
    2592d6  lea $907400,A1     <-- a SECOND buffer, exactly $400 further on
    2592dc  jsr $2593F8        ... called with BOTH in A0/A1

**CORRECTION (same wave): `$907400` IS THE REGION'S *END*, NOT A SECOND BUFFER.** Reading `$2593F8` settles
it:

    2593f8..259414   an inner loop: cmp.l (A0),D0 / bne / move.l D5,(A0) / addq.w #4,D2 / dbra D1
    259418  lea ($4,A0),A0
    25941c  cmpa.l A0,A1 / bne $2593F8      <-- A0 walks UP TO A1, so A1 is the EXCLUSIVE END
    259420  andi #$FFFE,SR / rts            carry CLEAR = success

So `$2592D0`/`$2592D6` pass a start and an end, not two buffers, and **the region is ONE `$400`-byte block,
`$907000..$9073FF`** -- which is exactly what `$23C668` clears. The two facts agree, which is what makes this
reading trustworthy where "a pair of buffers" did not explain why the clear covered only half.

`$2593F8` itself is a **search-and-claim**: it scans the block a longword at a time for a value matching D0 and
writes D5 into the first match, returning success in carry. So the block is a small table of `$100` longword
slots, and `$23C668` empties it.

**THE MODEL TO BUILD:** one object covering `$907000..$9073FF` -- **`$400` bytes, `$100` longword slots**,
addressed absolutely the way `TxVram.setLong` handles `$904000`. Half the size I said one paragraph earlier,
and it is the size `$23C668` clears, which is the check that the reading is right.

**READ `$2593F8` BEFORE CHOOSING** -- it is the routine that consumes both halves, so it says whether they are
double-buffered (swap each frame), a copy pair (A0 -> A1), or two independent planes. `$2593D2` is a second
consumer and should agree with it.

Sequence for whoever picks this up: `$2593F8` (defines the pair) -> the video object -> `$23C668` (four lines,
six callers) -> the rest of phase 0 (`$28D53C`, `$260A88`, `$25DA60`, `$25DA94`) -> phase 0 lands -> follow its
calls forward for the bonus-line driver -> **D24/D31 closes.**

================================================================================
## W344 SUMMARY -- FOUR ROUTINES PORTED, PHASE 0 ONE ROUTINE FROM LANDING
================================================================================

**Ported this wave** (13 tests, suite 2425 -> 2438):

    SlotTable907000 + clearSlotTable23C668   background.js   $23C668, 6 callers, and a NEW video region
    busyGate28D53C                           sound.js        $28D53C, 6 callers, the 5th explicit-SR return
    announceMailbox260A20                    rank.js         $260A20, the tst.b side selector
    postAnnounce260A88                       rank.js         $260A88, 6 callers, the house mailbox shape

**Phase 0's arm (`$25DC2C..$25DCA8`) now needs only `$25DA60` and `$25DA94`**, one caller each.

### `$25DA60` IS READ: "LOAD THIS SIDE'S SAVED CURSOR"

    25da60  move.w $813084,D6 / move.w $813088,D7      side 0's saved X/Y
    25da6c  tst.b ($7,A5) / beq $25DA80
    25da74  move.w $813086,D6 / move.w $81308A,D7      side 1's
    25da80  moveq #$0,D5 / move.b ($7,A5),D5           the side, into D5
    25da86  bsr $25D9E6                                 the SENTINEL substitution
    25da8a  move.b D6,($E,A5) / move.b D7,($F,A5)      stored as BYTES
    25da92  rts

**`($E,A5)` and `($F,A5)` ARE THE X AND Y CURSORS the ported draw code already reads** -- W332's
`drawTallyYRows25DF4C` indexes `$25DFF0 + ($F,A5) * 2`. So this routine is what puts a value there, and the
port has been drawing from a field nothing initialised.

**AND THE `$813084..$81308E` BLOCK IS ONE STRUCTURE**, which is worth recording because W343 measured its far
end from the other direction:

    $813084  side 0 cursor X       $813086  side 1 cursor X
    $813088  side 0 cursor Y       $81308A  side 1 cursor Y
    $81308C  the ONE-PLAYER flag (W343)      $81308E  players - 1 (W343)

Interleaved by side at a 2-byte stride, then the two W343 words. **Six words, one block** -- so
`playerFlags25FD94` and the tally cursor live side by side, which is consistent with both being written by the
stage-clear screen.

### `$25D9E6` IS THE `$FF` SENTINEL SUBSTITUTION -- READ IT BEFORE WRITING `$25DA60`

    25d9ea  cmpi.w #$FF,D6 / bne $25DA10     not the sentinel -> the normal path
    25d9f2  tst.w D5 / bne $25DA04           side 1 takes a different default
    25d9f8  move.w #$0,D6 / move.w #$0,D7    side 0's default is 0,0

So a saved cursor of `$FF` means "never set" and each side substitutes its own default. **This is the same
`$FF` sentinel W332 found `$25DAC2` and `$25DAEA` disagreeing about** -- and there the port THROWS on an
out-of-range Y rather than inventing a row. `$25D9E6` is the routine that makes `$FF` legal upstream, so
reading it may explain why that disagreement was survivable on the board.

**Still unread: `$25D9E6`'s head, `$25DA04`, `$25DA10`, and `$25DA94`.** All short, all in one region.

### `$25D9E6` IS A VALUE -> INDEX MAP, AND IT IS PHASE 0's LAST PIECE (W344)

    25d9e6  move.l D0,-(A7) / move.l D1,-(A7)
    25d9ea  cmpi.w #$FF,D6 / bne $25DA10          not the sentinel -> the SEARCH
    25d9f2  tst.w D5 / bne $25DA04                 side 1 takes a different default
    25d9f8  move.w #$0,D6 / move.w #$0,D7          side 0's default: 0, 0
    25da04  ... side 1's default ...
    25da10  moveq #$1,D0                           <-- #$1 + dbra = TWO, the X table's entry count
    25da12  lea ($25D986,PC),A0                    SCREEN11.xTable, xEntries = 2
    25da16  move.w D0,D1 / add.w D1,D1 / move.w (A0,D1.w),D1
    25da1e  cmp.w D6,D1 / bne $25DA2A
    25da24  move.w D0,D6                           FOUND -> D6 becomes the INDEX
    25da2a  dbra D0,$25DA12
    25da2e  moveq #$2,D0                           <-- #$2 + dbra = THREE, the Y table's count
    25da30  lea ($25D98A,PC),A0                    SCREEN11.yTable, yEntries = 3
    ... the same search for D7 ...

**IT CONVERTS SAVED CURSOR *VALUES* INTO TABLE *INDICES*.** `$25DA60` loads raw words from
`$813084`/`$813088`, this maps each to its position in `$25D986`/`$25D98A`, and `$25DA60` then stores the
indices as bytes into `($E,A5)`/`($F,A5)` -- which is what the ported draw code indexes. **So the round trip
is value -> index -> row offset**, and the port currently has only the last leg.

**BOTH TABLES AND BOTH COUNTS ARE ALREADY IN `SCREEN11`** (`xTable`/`yTable`, `xEntries: 2`, `yEntries: 3`),
and the counts match the `dbra` literals exactly -- `moveq #$1` is two passes and `moveq #$2` is three. That
agreement is the check that this reading is right.

**PHASE 0 IS NOW ONE WAVE FROM LANDING**, with nothing unported beneath it:

    $25D9E6   value -> index, with the $FF per-side default    READ (above)
    $25DA60   load this side's saved cursor, call the above     READ (W344 summary)
    $25DA94   pick a free Y row                                 PORTED (pickFreeYRow25DA94)
    $28D53C   the busy gate                                     ALREADY PORTED (menuCarry28D53C)
    $260A88   the announce post                                 PORTED (postAnnounce260A88)
    $23C668   the slot-table clear                              PORTED (clearSlotTable23C668)
    $24150A   installBank                                       ALREADY PORTED
    ($4,A4)   the descriptor's input read = $23D186              ALREADY PORTED

**Still unread: `$25DA04` (side 1's default pair) and the Y half of the search, `$25DA34..$25DA5E`.** Both
short, both in the routine above. Read those two, write `$25D9E6` and `$25DA60`, and phase 0's arm is
transcribable in full -- after which follow its calls forward for the bonus-line driver, which is D24/D31.

### `tools/claimed.py` -- RUN THIS BEFORE PORTING ANY ROUTINE (W344)

**Built after FIVE duplicate ports in one session, all mine, all from one mistake.** I grepped `0x<addr>` in
lowercase, got nothing, and ported a routine the port already had:

    $2417DE   already `applyVelocityA6` (movement.js)   -- and I reached TWO opposite wrong conclusions
    $28D53C   already `menuCarry28D53C` (tallyscreen.js) -- I shipped a copy with INVERTED polarity
    $260A20   already `announceBox260A20` (rank.js)
    $260A88   already covered by `announcePost` (rank.js), a FOUR-poster table
    $261100   already `pushExternalSpeed` (background.js)

The port writes these as `$260A88` in docstrings and names symbols after their ROLE -- `announcePost`,
`announceBox260A20`, `menuCarry28D53C`, `carryWord`. **A `0x`-prefixed lowercase grep finds none of them.**

    python tools/claimed.py 260a88 28d53c 2417de

It matches `$260A88`, `$00260A88`, `0x260a88` and bare `260A88` case-insensitively, reports CODE versus
COMMENT mentions, and names the nearest enclosing declaration so the answer is **who claims it**. Exit 1 when
every address given is unclaimed, so a wave can gate on it.

On `$260A88` it reports 13 mentions, 8 in CODE, and shows `tallyscreen.js:360` already calling
`announcePost(ram, 0x260a88, ...)` -- i.e. the answer was two lines from code I was editing.

**The rule was already written down** (`grep 0x2xxxxx is NOT a test for "is this ported"`). Four violations
after writing it is a compliance problem, not a knowledge problem, which is why this is a tool and not another
paragraph. **Run it on every callee before reading the body, and on every routine before writing one.**

### REACHABILITY IS A WAVE CHECK NOW (W344). THREE EXPORTS ARE CORRECTLY AHEAD; ONE WAS A DEFECT.

`tallyPhase0Arm25DC2C` shipped with **no caller in `src/`** -- written, tested eight ways, committed, inert.
Suite green, sweep clean, coverage OK, tree clean, pushed: **not one of the five checks can see an uncalled
function.** So a new export now needs a caller check, and here is that audit for everything W335-W344 added:

    freeChain246800          called by buildParts246520              OK
    playerFlags25FD94        called by tallyBonusDispatch25FF7A      OK
    clearSlotTable23C668     called by tallyPhase0Arm25DC2C          OK
    pickFreeYRow25DA94       called by tallyPhase0Arm25DC2C          OK
    loadSavedCursor25DA60    called by tallyPhase0Arm25DC2C          OK
    mapSavedCursor25D9E6     called by loadSavedCursor25DA60         OK
    walkDeathSpawns270D92    called by four handlers                 OK
    tallyPhase0Arm25DC2C     called by tallyScreen25DBB4             FIXED THIS WAVE (was dead)
    buildParts246520         NO caller -- and its ROM caller $26F6D2 is UNPORTED     ahead, correctly
    octDistance242494        NO caller -- and its ROM caller $26FFA6 is UNPORTED     ahead, correctly
    tallyBonusDispatch25FF7A NO caller -- its ROM caller $26059E has 0 CODE mentions ahead, correctly

**THE DISTINCTION IS THE WHOLE POINT.** "Dead because its ROM caller is not ported yet" is a correctly staged
prerequisite -- that is what porting `$246800` before `$246520`, or `$242494` before `$26FF9E`, is FOR.
"Dead because I forgot to wire it into code the port already has" is a defect, and it is the one that hid,
because it looks identical from inside the file.

**THE CHECK THAT SEPARATES THEM, and it is two commands:**

    grep -rn <exportName> src/ | grep -v 'export function'      # any caller in the port?
    python tools/claimed.py <its ROM caller's address>            # is that caller ported?

If the export has no caller AND its ROM caller is unclaimed, it is staged. If the export has no caller but its
ROM caller IS claimed, **that is the `tallyPhase0Arm25DC2C` bug** -- wire it.

Both of this wave's process failures were invisible to the five-check definition of done: five duplicate ports
(now guarded by `tools/claimed.py`) and one unreachable export (guarded by the two commands above). **Neither
was a knowledge problem; both were checks I had not made mechanical.**

### `$55` FIRST LOOK (W345) -- init `$272390`, handler `$272424`. IT IS A CHILD, AND ITS POSITION PROVES IT.

`$55` is what blocks `$46`, the biggest remaining stage-5 type at 13 records (W317).

    272390  move.w #$0,($4,A5) / rts       ONE sub record
    272398  loadSubProto($272408)
    2723a4  move.l ($16,A5),D0 / addi.l #$2000000,D0 / move.l D0,($2,A6)
    2723b2  move.l ($1A,A5),($30,A5)
    2723b8  moveq #$E,D0 / loadRecordProto($2723EA)     FIFTEEN words
    2723c6  cmpi.w #$2800,($2,A6) / ...

**IT NEVER CALLS `readInitPosition`. ITS POSITION COMES FROM `($16,A5)` PLUS `$2000000`** -- a pure high-word
bias, so no borrow. `($16,A5)` is a field the PARENT writes, which is what makes `$55` a child rather than a
spawnable type in its own right, and it is why W317 said `$46` "spawns an unported child". **So `$55` cannot be
tested standalone**: any test needs `($16,A5)` and `($1A,A5)` seeded the way `$46` seeds them.

`$2723B2 move.l ($1A,A5),($30,A5)` copies a long within the record before the prototype load, so the
prototype does NOT overwrite it -- worth noting because `loadRecordProto` writes from `($16,A5)` onward and the
order matters.

**THE OVERLAP RULE HOLDS A SEVENTH TIME.** `($4,A5) = 0` means one `$20`-byte sub record, so
`$272408 + $20 = $272428` against a handler at `$272424`: **four bytes**, exactly as the arithmetic predicts.
Confirmed now at 4, 8, 4, 16, 4, 20 and 4 bytes across `$49`, `$4A`, `$4B`, `$47`, `$43`, `$4C` and `$55`.
Window: `$2723EA + $3E` (fifteen-word record prototype plus the one sub prototype, `$2723EA..$272427`).

**AND THE CENSUS IS SOUND.** Audited every remaining stage-5 entry point with `claimed.py` after the nine
duplicates: `$272390`/`$272424` (`$55`), `$27102C`/`$2710E2` (`$46`), `$268D1E`/`$268E6C` (`$1A`) and all
eight of `$4C`'s state handlers are genuinely unported. The duplicates were confined to shared primitives with
role-based names; nothing in the type census was overstated.

### `$55`'s HANDLER HEAD (W345) -- SPAWN INVULNERABILITY, ON A TIMER THE PARENT SUPPLIES

    272424..27242A  NOT YET DISPLAYED (8 bytes)
    27242c  tst.w ($30,A5) / beq $272448        the timer -- zero means it has expired
    272434  move.w #$7FFF,($18,A6)              ... while it runs, HP is $7FFF: INVULNERABLE
    27243a  subq.w #1,($30,A5) / bne $272448
    272442  move.w #$1100,($18,A6)              on the frame it hits zero, REAL HP $1100
    272448  moveq #$5C,D1 / and.b (A6),D1 / beq $27249A     the $5C family mask
    272456  jsr $286096                         scoreHit

**`$55` IS INVULNERABLE FOR A PARENT-SUPPLIED NUMBER OF FRAMES.** The init copies `($1A,A5)` -- a field `$46`
writes -- into `($30,A5)`, and the handler counts it down while forcing HP to `$7FFF`. On the frame it reaches
zero it installs the real HP of `$1100`. So a `$55` cannot be killed before its parent's timer expires, and the
timer's LENGTH is `$46`'s choice.

**THE SUBTLETY: A LONG COPY, A WORD COUNTDOWN.** `$2723B2 move.l ($1A,A5),($30,A5)` copies FOUR bytes, but
`$27242C tst.w` and `$27243A subq.w` touch only the first WORD -- which on a big-endian read is the long's HIGH
half. So the parent supplies a longword of which only the top half is the timer, and `($32,A5)` keeps whatever
the low half was. **Porting the copy as a word would lose that low half**, and porting the countdown as a long
would make the timer effectively never expire.

That also explains why the init copies at all rather than reading `($1A,A5)` directly each frame: the handler
DESTROYS its copy by counting it down, and `($1A,A5)` has to survive for whatever else reads it.

**Its HP `$1100` and the `$7FFF` invulnerability value are both literals**; `$7FFF` is the same sink constant
`$47` and `$4C` use, but here it is a HP FLOOR rather than a per-frame sink -- there is no `sub.w`/re-arm pair,
just a forced value. Do not reach for the sink helper.

Still unread for `$55`: `$272424..$27242A` (the entry, 8 bytes) and everything from `$27245C` on.

### `$55`'s ENTRY AND DAMAGE ARM (W345) -- the invulnerability is itself OPTIONAL

    272424  tst.b ($17,A5) / beq $272448      <-- the WHOLE timer block is skipped when ($17,A5) is 0
    27242c  ... the invulnerability timer (previous section) ...
    272448  moveq #$5C,D1 / and.b (A6),D1 / beq $27249A     the $5C mask -- an EIGHTH family member
    272450  move.b #$A3,D0 / and.b D0,(A6)
    272456  jsr $286096                       scoreHit
    27245c  D0 = ($1D,A6) ; D2 = ($19,A5) ; eor.b ; store    the SIMPLE palette XOR, base+mask
    27246a  tst.w ($18,A6) / bpl $2724A0
    272472  move.l #$113,D0 / jsr $28615E     scoreKill $113 -- a `move.l`, not a moveq
    27247e  jsr $28C2DC                       the band's cue, not $47/$4C's $28C310
    272484  D2 = ($2,A6) ; lea ($272850,PC),A1 ; ...        its own death list

**SO THE SPAWN INVULNERABILITY IS OPTIONAL AND THE PARENT CHOOSES.** `($17,A5)` gates the entire block: zero
means no protection at all and the prototype's HP stands. Non-zero runs the `($30,A5)` countdown with HP forced
to `$7FFF`. **Both `($17,A5)` and the timer's length come from `$46`**, so one parent can spawn protected and
unprotected children.

`($17,A5)` is a THIRD meaning for that offset in stage 5 -- the mirror/table-select bit in all four band
members, a state number in `$47` and `$43`, and now an invulnerability enable. **Nothing about that offset is
transferable.**

Its damage arm is the SIMPLE `$5C` member -- base `($18,A5)`, XOR mask `($19,A5)`, no `hpFull` reload -- so it
joins `$49`, `$4B` and `$48` rather than the `damageArm5C` variants. That makes eight family members now.

Kill score `$113` via `move.l`, and the cue is `$28C2DC` (the band's), not the `$28C310` that `$47` and `$4C`
use -- so `$55` sounds like an ordinary enemy despite being a set-piece child.

Still unread for `$55`: `$27248C` onward (the death arm's tail, its walker call and its list length) and
`$2724A0` onward (the alive path). Its death list is at `$272850`.

### `$55`'s DEATH ARM AND ALIVE PATH HEAD (W345) -- it needs NOTHING new

    27248e  jsr $270D92                      **the SHARED walker, ported W333/W336**, list $272850
    272492  jmp $263762                      freeEnemy -- $55 FREES itself, no $8000 mark
    27249a  move.b ($18,A5),($1D,A6)         the not-hit palette restore
    2724a0  tst.w $8130D2 / bne $272722      the freeze, jumping FAR
    2724aa  move.w ($2,A6),D1 / sub.w ($2A,A5),D1 / move.w D1,($2,A6)    a per-frame DRIFT
    2724b6  jsr $24179E                      scrollCompensate
    2724bc  addi.w #$1400,D0 / addi.w #$7400,D0    the TWO-addi.w bounds idiom

**`$55` NEEDS NO UNPORTED CALLEE.** `$270D92` is `walkDeathSpawns270D92` with the default `anim` of 4 and its
list is `$272850 + $3E` (FIVE 12-byte entries then `$FFFF`, measured). `$286096`, `$28615E`, `$28C2DC`,
`$24179E`, `$2637A2`, `$26377A`, `$24150A` and `$263762` are all in the port. **So `$55` is writable now**, and
with it `$46` stops being blocked.

**IT USES THE TWO-`addi.w` BOUNDS IDIOM, not the band's signed long.** `$2724BC`/`$2724C4` are the
`$1B`/`$81` shape, where `$49`/`$4A`/`$4B`/`$48`/`$47`/`$43` all use `ext.l`/`addi.l`/`cmpi.l`. So the
deciding carry is the SECOND `addi.w`'s alone (W326's finding), and reading it as a signed long compare would
change which side of the screen frees it.

**AND IT DRIFTS BY A PARENT FIELD.** `$2724AA` subtracts `($2A,A5)` from the Y each frame -- a third value
`$46` supplies, after `($16,A5)`'s position, `($1A,A5)`'s timer and `($17,A5)`'s invulnerability enable.
**`$55` is almost entirely parameterised by its parent**, which is why W317 called it a child and why any test
of it is really a test of the pair.

Windows: `$2723EA + $3E` (declared W345) and `$272850 + $3E` for the death list -- **not yet declared.**

Still unread: `$2724C4` onward (the bounds test's tail and the rest of the alive path) and `$272722` (the
freeze target). Everything before that is read.

### `$55`'s ALIVE PATH (W345) -- `($17,A5)` DOES TWO JOBS IN ONE TYPE

    2724c4  addi.w #$7400,D0 / bcc $2724DA    the SECOND addi.w's carry is the deciding one (W326)
    2724cc  tst.b ($16,A5) / beq $2724E0
    2724d2  jmp $263762                       off-screen AND the latch is set -> free
    2724da  move.b #$1,($16,A5)               ... otherwise set the on-screen latch
    2724e0  cmpi.b #$0,($17,A5) / bne $272536 <-- ($17,A5) AGAIN, now selecting the BEHAVIOUR ARM
    2724ea  subq.b #1,($1C,A5) / bcc $272536  arm A's cadence
    2724f2  move.b ($1D,A5),($1C,A5)

**`($17,A5)` IS READ TWICE IN `$55`, AND THE SECOND READ IS A THREE-WAY SELECTOR -- not the two arms I first
wrote.** At `$272424` `tst.b` enables the spawn invulnerability for any non-zero value. Then:

    2724e0  cmpi.b #$0,($17,A5) / bne $272536      0        -> arm A at $2724EA
    272536  cmpi.b #$2,($17,A5) / blt $272582      1        -> $272582
    272540  ... the sinusoidal drift ...           2 and up -> arm C at $272540

**AND IT IS A FALL-THROUGH CASCADE, NOT A SWITCH** -- `$272582` is itself `cmpi.b #$2,($17,A5) / bne $2725B6`,
so the arms are successive tests that a value can pass through more than one of:

    ($17,A5) = 0   runs $2724EA only          (cmpi #0 / bne skips to $272536)
    ($17,A5) = 1   runs $272582's test, FAILS it, so $2725B6            (blt sends 1 past $272540)
    ($17,A5) = 2   runs $272540's sinusoid AND THEN falls into $272582's arm, which tests == 2
    ($17,A5) > 2   runs $272540's sinusoid, then $272582 fails, so $2725B6

**So value 2 runs TWO arms and value 3+ runs one.** That is the same shape `$43`'s three states and every one
of `$4C`'s eight handlers use -- successive `if` tests, never `else if` -- and writing this as a switch would
silently drop the second arm for value 2.

**AND THE CASCADE HAS A FOURTH TEST.** `$2725B6` is `cmpi.b #$3,($17,A5) / bne $272722`. The complete alive-path
map, which took four corrections to get right and is now read end to end:

    ($17,A5)  invuln?  movement arm            second arm
    0         no       $2724EA                 --            (cmpi #0 / bne skips the rest)
    1         yes      NONE                    --            (blt past $272540; != 2; != 3)
    2         yes      $272540 sinusoid        $27258C       ($272582 tests == 2)
    3         yes      $272540 sinusoid        $2725C0 fire  ($2725B6 tests == 3)
    4 and up  yes      $272540 sinusoid        --

**Value 1 runs no movement arm at all -- it is the stationary variant**, and it reaches that state by failing
three successive tests rather than by any positive selection. Values 2 and 3 each run TWO arms. Writing this
as a switch drops the second arm for both.

A port must also not cache the byte as a boolean (that collapses 1 against 2+) nor split protection and mode
into separate fields (the cartridge cannot let them disagree, since one `tst.b` and four `cmpi.b`s read the
same byte).

**`$272722` IS THE SHARED TAIL, NOT A FREEZE TARGET** -- I listed it as one of `$55`'s unread spans and guessed
wrong about what it does. Every arm falls into it, and it is a descriptor walk:

    272728  adda.w ($1e,A5),A0        ($1E,A5) is a BYTE CURSOR into a table, not a counter
    27272c  move.l (A0),D2
    27272e  move.l ($2,A6),D1         the packed X/Y position long
    272732  add.l  ($4,A0),D1         a packed-long bias -- borrow rule applies
    272736  swap   D1
    272738  add.w  ($32,A5),D1        the same field $272570 ramps by $40 up to a $600 cap

So `($1E,A5)`, which `$27259A` advances by `addi.w #$10`, is a cursor with a **$10 stride** over entries whose
first two longs are used. That means **a window must be declared for the table A0 points at before this tail can
be written**, and the arms' `addi.w #$10` is what walks it.

**AND THE TABLE IS INLINE, REACHED PC-RELATIVE.** `rosetta.py dasm` mis-aligns here and hides the instruction --
it prints `$272726 nop` as its first line and silently skips four bytes. The raw bytes at `$272722` are
`41fa 002c`, which is:

    272722  41fa 002c    lea ($2C,PC),A0     PC = $272724, so A0 = $272750

**The table base is `$272750`, sitting immediately after this routine's code.** That is why no absolute table
address ever turned up for `$55` -- there is no `move.l #$XXXXXX,A0` to grep for, and the address never appears
as a literal anywhere in the ROM. **When a routine walks a table you cannot find the base of, suspect
`lea (d16,PC)` and dump the raw bytes; do not trust a disassembly line as the first instruction at an address
you asked for.**

**THE TABLE IS SIXTEEN `$10`-BYTE ENTRIES, `$272750..$272850` EXCLUSIVE, AND ITS BOUND COMES FROM ADJACENCY**
rather than from any sentinel or `cmpi.w`: it ends exactly where `$55`'s death-spawn list at `$272850` begins,
and that list already had a window from W345. The `$10` entry size matches the arms' `addi.w #$10` stride
exactly. Window declared W346, 442 -> 443.

    entry  +0    long   -> D2                      ($272728 move.l (A0),D2)
           +4    long   -> packed position bias     (borrow rule applies)
           +8    word
           +$A   six zero bytes

Two groups of eight share their constants -- group A from `$272750` bias `$F000F400` w8 `$1060`, group B from
`$2727D0` bias `$EC00F400` w8 `$1460`. **The `$80` group boundary is real: `$2724FE` is
`cmpi.w #$80,($1e,A5) / bne $272536`**, so arm A tests the cursor against exactly the group A/group B split.

**AND `($17,A5)` IS SELF-ADVANCING STATE, NOT THE PARENT-SUPPLIED PARAMETER I CALLED IT.** The record writes its
own mode:

    27259a  addi.w #$10,($1e,A5)     advance the cursor one entry
    2725a0  cmpi.w #$f0,($1e,A5)
    2725a6  blt $2725b6              not at the last entry yet -> skip
    2725aa  move.w #$f0,($1e,A5)     CLAMP at entry 15 -- clamped, NOT wrapped
    2725b0  move.b #$3,($17,A5)      PROMOTE mode 2 -> mode 3
    2725b6  cmpi.b #$3,($17,A5)      ...and the next test READS THE NEW MODE, same frame

**The promotion is written mid-cascade and picked up by the very next test in the same cascade, so the firing arm
runs on the exact tick the table finishes.** That is the fall-through shape being used deliberately as a state
machine rather than as a dispatch. **Porting the cascade as a `switch` or as `else if` delays the firing arm by
one frame** -- which is precisely the visible-behaviour class of bug that reads as correct in every unit test.

So the mode table above describes the *entry* condition of each arm, and mode 2 is transient: it walks 16 table
entries at `$10` a step, clamps, promotes itself to 3, and fires. Only modes 0, 1 and 3 are stable.

### `$55`'s mode-3 firing arm -- ENTIRELY REUSE, no new helper

Read `$2725C0..$272630`. **Every callee it needs is already ported**, which is the whole point of checking the
family first:

    2725c0  subq.b #1,($26,A5) / bcc $272722       due8 countdown, reload #$10 at $2725C8
    2725ce  tst.w $8130D4 / bne $272722            FREEZE -- already ported; skips the volley, still runs the tail
    2725d8  cmpi.w #$2000,($2,A6) / ble $272722    fires only once X (the packed long's high word) exceeds $2000
    2725e2  move.b ($2e,A5),D0 / cmp.b ($2f,A5),D0 / bne $27260A    re-aim ONLY when the two bytes agree
    2725ee  movem.w ($2,A6),D0-D1                  SIGN-EXTENDS both -- X into D0, Y into D1
    2725f4  addi.w #-$600,D0                       aim from $600 above the record, not from it
    2725f8  jsr $24226E                            aim256 -- aim.js, 48 existing sites
    2725fe  bcc $272606 / move.w #$80,D1           carry = no target, so the angle DEFAULTS TO $80
    272606  move.b D1,($28,A5)                     cached as a byte, then zero-extended back at $27260C

- **`$8130D4` is FREEZE** (`boss2attacks.js`, `boss4.js`, `bossf23.js`, `bossguns.js`), and `bossguns.js:146`
  already records this exact idiom: the freeze skips the volley but still runs the tail.
- **`$24226E` is `aim256`** in `aim.js` -- listed in `AIM_REFS` with **48 sites**, and `boss3type99.js:138`
  already documents that only some call sites take the carry exit. `$55` is one that does.

Volley setup at `$272610`, not yet fully read:

    272610  move.l #$FFFF0005,D0      packed pair, $FFFF and $0005
    272616  move.l ($2,A6),D2         the packed position
    27261a  move.l #$02000000,D5
    272624  tst.b ($2e,A5) / beq $272686      zero -> the single-shot path; non-zero -> the fan
    27262c  subi.w #$34,D1            back the angle off by $34
    272630  move.w #$4,D7             **VERIFY THIS IS A dbra** before trusting five passes

**READ, and both of my guesses about it were wrong.** The step is `4`, not the `$1A` I inferred, and the shape is
**three unrolled emits inside a five-pass `dbra`** -- fifteen shots, not five:

    272630  move.w #$4,D7            D7 = 4 -> FIVE passes
    27263a  loop top
              ... compute D3 ...  272648  jsr $2816F6      shot 1 at angle A
            27264e  addq.b #$4,D1
              ... compute D3 ...  27265e  jsr $2816F6      shot 2 at A+4
            272664  addq.b #$4,D1
              ... compute D3 ...  272674  jsr $2816F6      shot 3 at A+8
            27267a  addi.b #$10,D1   NOT #$4 -- the inter-cluster gap
            27267e  dbra D7,$27263a
    272682  bra $27270e

So each pass fires a tight triple `4` apart, then skips `$10` to the next cluster: pass k starts at
`-$34 + k*$18`. The fifteen angles run `-$34,-$30,-$2C | -$1C,-$18,-$14 | -$04,$00,+$04 | +$14,+$18,+$1C |
+$2C,+$30,+$34` -- **exactly symmetric about the aim**, which is what makes `$34` the right backoff. Five
clusters of three, the classic clustered fan.

**AND `($2E,A5)` DOES NOT PICK FAN-VERSUS-SINGLE.** `$272686` is a second, smaller fan, not a single shot:

    272686  move.l #$FFFF0004,D0     low word 4, against the other arm's 5
    27268c  subi.w #$22,D1           smaller backoff
    272690  move.w #$3,D7            FOUR passes

So `($2E,A5)` selects between a **five-cluster** and a **four-cluster** volley, and the `move.l #$FFFF000N,D0`
low word tracks it (5 and 4). `($2E,A5)` still does double duty -- it also forms half the re-aim agreement test
at `$2725E2`.

Per-shot vector maths, identical in all three unrolled copies:

    move.w D1,D3 / addq.w #2,D3 / andi.w #$fc,D3     round the angle to the table's 4-byte stride
    move.l (A0,D3.w),D3                              A0 is a 256-byte table of 64 longs
    add.l D5,D3                                      D5 = $02000000, a fixed speed bias

**`$2816F6` IS ALREADY PORTED** -- 50 mentions, 44 in code, and `boss2attacks.js:231` shows it paired with a
sibling `$281708` chosen by shot index. That is the FOURTH helper this type needed and already had.

**A0 IS NEVER LOADED IN THE HANDLER -- IT IS LIVE-IN FROM THE DISPATCHER.** Scanning `$272390..$272634` for every
`lea`/`movea` into A0 finds exactly three, and **all three sit below the handler entry at `$272424`**, inside the
init body:

    272398  lea $272408,A0   (PC-relative)   an inline table in the init body
    2723b8  lea $2723EA,A0   (PC-relative)   the record prototype -- already windowed, W345
    2723dc  lea $223AB8,A0   (absolute)      inside W91's existing $222A78..$2252F8 palette window

Between `$272424` and the volley at `$272630` there is **no A0 write at all**, so the 64-long vector table the
three unrolled emits index is whatever the caller left in A0.

### W346's actual deliverable: the type table is now MECHANICALLY cross-checked

Chasing A0 led to the master type table at `$267824`, `[init, handler]` per type, eight bytes an entry. **This was
not a discovery -- `handlers.js` documents it in `T49`'s comment and `export-tables.py` has windowed it since
WAVE 20.** I rediscovered it twice in one wave. What was genuinely missing is that every spec's
"entry points verified against the type table" claim was **verified by eye, once, when the spec was written**, and
nothing re-checked them. `$55` showed the cost: its `BODY.set` landed after `INIT_BODY_ADDRESSES` was built, so it
registered nothing, and five consecutive green check runs said nothing.

So `TYPE_SPECS` is now exported from `handlers.js` (12 specs by type number) and `tests/w346typetable.test.js`
re-derives all of it from the cartridge on every run: `spec.init` and `spec.handler` against the ROM table,
`spec.initBody === init + 8` as the RULE rather than a restatement, and both registries actually containing what
each spec claims. **The fourth test is the `$55` no-op guard specifically.** Suite 2433 -> 2438.

### W347: BOTH type tables solved, and two W346 claims retracted

    types $00..$7F   $267824 + type * 8            window $267820+$410, wave 20
    types $80..$FF   $27E412 + (type - $80) * 8    window $27E410+$410

**The high base is `$27E412`, not `$27E410`** -- the two bytes at `$27E410` are a trailing `nop` from the
preceding code, which is why the table is not 8-aligned to its window start. Verified three ways against the
port's own registrations: type `$80`'s handler `$2739C0` is `handler80`, `$81`'s `$274076` is `handler81` at
index 1, and `$8E`'s `$2764D2` is `handler8E` at index 14. All 12 specs now cross-check with no exclusions.

**Two W346 claims retracted, both mine:**

- "The address rises as the type falls, which rules out `base + type * 8`." **Wrong.** It came from reading a
  two-pattern `grep -A2` in file order and pairing each spec with the *other's* entry. The consts are correctly
  named and the table is ordinary ascending. When a `grep -A2` matches two patterns, the output is in FILE order,
  not argument order -- attribute each hit by line number before believing it.
- "The `$410` window reaches through type `$80`, so the comment is one type short." **Wrong, and wrong in a way
  worth naming.** `$267C24` is *readable* because the window is `$10` longer than the table, but it holds CODE
  (`41fa 0026 4e71 4eb9`), not an address pair. **Readable is not an entry.** The wave-20 comment was right all
  along: the low table is `$00..$7F`, and type `$80` lives solely in the high table. The test now checks
  PLAUSIBILITY rather than readability, and pins the low table's end by asserting that one entry past `$7F` is
  *not* a plausible init.

Useful side effect: Hibachi (`$B0`) has a table entry at `$27E592`, so the boss-route root's init and handler are
now addressable without a trace.

### W348: the enemy driver's calling convention, and where the A0 trace actually goes

The dispatcher at `$2635F6` is fully read, and it is the source of the `initBody = init + 8` rule:

    2635f6  moveq #$0,D7 / move.b ($C,A5),D7    the record's type byte
    2635fc  lea $267824,A0                      LOW table
    263602  cmpi.w #$80,D7 / blt $263612
    263608  lea $27E412,A0 / subi.w #$80,D7     HIGH table -- confirms W347's two bases from the CODE
    263612  lsl.w #3,D7                         index * 8
    263614  movea.l (A0,D7.w),A1                A1 = the INIT, the first long
    263618  jsr (A1)                            run the init
    26361a  addq.w #8,A1                        <- initBody = init + 8

**The handler is NOT jsr'd at spawn -- it is CACHED INTO THE RECORD.**

    263628  movea.l ($4,A0,D7.w),A0             A0 = the handler, the second long
    26362c  move.l A0,($4C,A5)                  cached in the record
    263630  moveq #$0,D0
    263632  lea $8103E6,A0                      A0 REUSED two instructions later

So **`($4C,A5)` is the record's handler pointer**, and the per-frame driver calls through it:

    263532  movea.l ($4C,A5),A1
    263536  move.l D6,-(A7)                     the CALLER saves D6
    263538  jsr (A1)                            <- every enemy handler is entered here
    26353a  move.l (A7)+,D6                     and restores it

Two calling-convention facts fall out, both usable now:

- **At handler entry `A1` holds the handler's own address**, not A0. Nothing in either dispatch site leaves the
  type table in A0 -- `$263632` overwrites it with `$8103E6` two instructions after loading the handler.
- **`D6` is caller-saved across the handler call.** Handlers may clobber it freely; anything a handler needs
  across the call boundary cannot live in D6.

**And this RETRACTS the framing of `$55`'s blocker.** I wrote that A0 is "live-in from the dispatcher". It is not:
neither dispatch site sets it. **The dispatcher was the wrong place to look.**

### W349/W350: the A0 "trace" WAS A PHANTOM. `$55` is writable now.

`$55` loads A0 itself, at the volley loop top:

    272634  lea $2735FA,A0        reloaded EVERY pass of the dbra
    27263a  move.w D1,D3 / addq.w #2,D3 / andi.w #$fc,D3
    272642  move.l (A0,D3.w),D3
    272646  add.l D5,D3

**Four waves of tracing chased a register that was never in question.** W346 called A0 "live-in from the
dispatcher", W348 corrected that to "inherited from the loop above `$263524`", W349 to "leaked out of `aim256`.
All three were wrong, and the cause was one off-by-one: **my W346 scan swept `$272390..$272634`, and the `lea` is
AT `$272634`.** An exclusive upper bound one instruction short of the answer.

**And the table was already ported.** `$2735FA` has 13 mentions, 12 in CODE, and `boss2attacks.js:166` contains
the identical expression:

    const d3 = (rom.u32(0x2735fa + angle * 4) + local) >>> 0;      // move.l (A0,D3.w),D3 / add.l D5,D3

Its window has existed since **W30** (`$2735F0+$220`, "type `$80`'s two fan-direction tables"). So `$55`'s volley
is the same family as `boss2attacks.js`'s fan.

**`$55` therefore needs no window, no helper, no trace.** It is writable in one pass, reusing the
`boss2attacks.js` vector expression, `aim256`, FREEZE, `shotVector` and the `$2816F6` emit.

**THE RULE THIS COST FIVE WAVES TO LEARN: run `claimed.py` on the ADDRESS OPERAND of every instruction read, not
just on `jsr` targets.** Every one of `$55`'s four helpers and now its vector table were already in the port. And
when scanning a span for a register write, **make the upper bound inclusive and past the last instruction of
interest** -- an exclusive bound that lands on the answer reports "no writes" with total confidence.

Two smaller corrections from reading `aim256`'s exits, both retracting W349:

- **`aim256` does not leak A0 -- `$24230E movea.l (A7)+,A0` RESTORES it** before the `rts`. A0 is callee-saved
  there, so nothing downstream can depend on aim256's tables.
- **`$242312` is not a data table.** `$242300 add.w D4,D4 / add.w D4,D4` scales D4 by four and `$24230A
  jsr (A0,D4.w)` makes a COMPUTED CALL into it: it is a jump table of 4-byte code stubs, the first being
  `add.w D0,D1 / andi.w #$FF,D1`. W349 flagged this as a caveat; it is now settled as a decode error.

### W351: arm A read -- it is `$27258C`'s TWIN, differing only in trigger and action

    2724ea  subq.b #1,($1c,A5) / bcc $272536    the same due8 countdown
    2724f2  move.b ($1d,A5),($1c,A5)            the same reload byte
    2724f8  addi.w #$10,($1e,A5)                the same cursor, the same $10 stride
    2724fe  cmpi.w #$80,($1e,A5) / bne $272536  fires at EXACTLY $80
    272508  move.w #$A001,(A6)                  and writes $A001 to the record's first word

Set against mode 2's arm at `$27258C`, which is byte-for-byte the same first three steps and then
`cmpi.w #$F0` / clamp / promote to mode 3. **So arm A and the mode-2 arm are one mechanism with two
trigger points**, and that is what the drift table's two groups of eight are for: **arm A walks group A
(cursor `$00..$78`) and stops at `$80`; mode 2 walks group B and stops at `$F0`.** The `$2724FE`
comparison against `$80` -- which W346 found and could not explain -- is arm A's terminator, not a
group selector.

**PORT HAZARD: `$2724FE` is `cmpi.w #$80` + `bne`, an EQUALITY test, and `$2725A0` is `cmpi.w #$F0` +
`blt`, a THRESHOLD.** Arm A's event fires only if the cursor lands on `$80` exactly; a cursor that
stepped past it would never fire at all. Writing either as the other kind of test is a silent
behaviour change -- and since the stride is `$10` and `$80` is a multiple of it, the equality happens
to be safe in the ROM, which is exactly why a port that "tidies" it to `>=` would still look correct.
**Reproduce the operators as written.**

### W351: arm A's action contains a DEAD STORE, and the tail ends in a sprite enqueue

    272508  move.w #$A001,(A6)
    27250c  move.b #$1,($17,A5)      <- DEAD. Overwritten two instructions later.
    272512  move.b #$2,($17,A5)      <- the effective value
    272518  move.w #$4,($20,A5)
    27251e  move.w #$FFFD,($22,A5)   -3

**Arm A hands the record to mode 2, not mode 1.** There is no branch between `$27250C` and `$272512`, so
the `#$1` store is simply dead -- almost certainly a development leftover. **Recorded so nobody "fixes"
it into a mode-1 handoff**, and so nobody ports the `#$1` as though it were observable. Note this also
means mode 1 (the stationary variant with no movement arm) is **never reached from arm A** -- it can
only be parent-seeded.

The tail's final two instructions resolve the drift entry's `+8` word:

    27273e  move.w ($8,A0),D3        the entry's +8 word
    272742  moveq #$0,D4 / move.b ($1d,A6),D4    zero-extended
    272748  jsr $23DF86
    27274e  rts

**`$23DF86` is `enqueueRegistersThroughStub`, already ported** (11 mentions, 9 in code; `boss4.js:363`,
and `handlers.js:1352` documents its register convention for a sibling). So the drift entry is
`+0 long -> D2`, `+4 long -> packed position bias`, `+8 word -> D3 for the enqueue` -- every field
accounted for, and the tail is a sprite enqueue rather than anything novel.

Also confirms the table is data: `$272750` disassembles as nonsense (`ori.b #$50,(A7)` / an unknown
`pmove` form), which is what a data window should look like through a disassembler.

### W351: RETRACTING "zero unknowns" -- the handler PROLOGUE was never read

I wrote that every span of `$55` was read. That was wrong, and it was a scope error, not a detail: I had
read the *arms* and the *tail* and treated the handler as covered. **`$272424..$2724E0`, the ~190-byte
prologue, had never been disassembled.** Reading its first half now:

    272424  tst.b ($17,A5) / beq $272448        the invulnerability gate
    27242c  tst.w ($30,A5) / beq $272448        ($30,A5) is the invulnerability COUNTDOWN
    272434  move.w #$7FFF,($18,A6)              HP forced to $7FFF while it runs
    27243a  subq.w #1,($30,A5) / bne $272448
    272442  move.w #$1100,($18,A6)              HP set to $1100 the frame it expires
    272448  moveq #$5C,D1 / and.b (A6),D1       <- THE $5C DAMAGE FAMILY
    272450  move.b #$A3,D0 / and.b D0,(A6)         clear mask $A3, same as $49 and $4B
    272456  jsr $286096                         scoreHit
    27245c  move.b ($1d,A6),D0

Two things follow:

- **`$55` is a SIXTH member of the `$5C` family**, mask `$5C` and clear `$A3`, identical to `T49` and
  `T4B`. Check `damageArm5C` before writing the arm -- `T49`'s note says routing the *simple* members
  through it would invent an `hpFull` reload and a palette decision, but `$55` has a real HP write
  (`$1100`), so it may be the member that fits.
- **`($30,A5)` is a spawn-invulnerability countdown, not a flag.** While it runs, HP is pinned at
  `$7FFF`; on the expiry frame it is set to `$1100`, which is the record's real HP. So `($17,A5)`
  non-zero *enables* the window and `($30,A5)` *times* it -- a second field, previously unnoticed,
  that the parent must seed.

### W351: `tools/spanned.py` -- and the NEGATIVE RESULT it produced

I said coverage should stop being my judgment call and become a check, so I built the check. **It does
not work, and that is the useful finding.** Calibrated against two spans of `$55` whose true status I
knew:

    $272424..$2724E0   the prologue I had NEVER disassembled     29.8% cited
    $2725C0..$272650   the fire arm I read instruction by line   33.3% cited

**Four points apart. Indistinguishable.** And no uncited run in either reaches 16 bytes, so the run
filter calls both clean. The cause is structural: prose cites an address roughly every fourth byte
whenever it discusses a span at all, and a handler's addresses also get cited by neighbouring
discussion, by window declarations, and by unrelated notes about the same region. **Citation density
measures how much has been WRITTEN NEAR a span, not how much has been READ of it.**

The tool is committed with the verdict REMOVED -- it prints the data and an explicit "this is not
evidence the span was read". Shipping it with a pass/fail would have been worse than not building it,
because the next confident "coverage is verified" claim would have cited it.

**The one thing it does support:** a long uncited run at `--min 64` is decent evidence nobody has been
in a region. On `$272390..$272850` it flags `$2727D2..$27284F` (`$7E` bytes) -- correctly, though that
turns out to be the drift table's group B, i.e. DATA whose start I cited and whose body nobody needs to
read. So even the working mode needs a judgment about data versus code.

**The real conclusion: "have I read this span?" is not answerable from repo text.** It needs a read log
written at read time. That is a different tool and a bigger change, and it is the thing that would
actually stop the four-times-retracted "$55 is finished" pattern.

### W351: the damage and death arm read -- standard shape, SIXTH already-ported callee

    27245c  move.b ($1d,A6),D0 / move.b ($19,A5),D2 / eor.b D2,D0 / move.b D0,($1d,A6)
                                            the palette XOR, same idiom as $4B
    27246a  tst.w ($18,A6) / bpl $2724a0    HP sign bit -- not dead, skip the death arm
    272472  move.l #$113,D0                 killScore = $113
    272478  jsr $28615E                     scoreKill
    27247e  jsr $28C2DC                     death cue -- IDENTICAL to T49's
    272484  move.l ($2,A6),D2
    272488  lea ($272850,PC),A1             the death list -- confirms W345's window from the CODE
    27248e  jsr ($270d92,PC)                walkDeathSpawns270D92
    272492  jmp $263762                     <- JMP, not a free
    27249a  move.b ($18,A5),($1d,A6)        the not-hit path: palette base

**`$55` neither frees itself nor marks-and-continues -- it TAIL-JUMPS to `$263762`.** That resolves the
question the `$48`/`$49`/`$4A`/`$4B` band raised for this type, and it is a third answer, not one of the
band's two.

**`$263762` and `$28615E` are both already ported** -- `$263762` is `MOVE_EXIT`/`INIT_BODY_FREED` with 42
code mentions; `$28615E` is `scoreKill` with 13, used by `death49`, `death81` and `death8E`. So the death
arm's shape is `death49`'s, and the running total is **SIX callees, every one already written**:
`$241D34`, `$8130D4`, `$24226E`, `$2816F6`, `$23DF86`, `$28615E` -- plus the `$263762` exit and the
`$270D92` walker.

### W351: `$2724A0` read -- TWO different pause globals, and the sinusoid is BACKED OUT each frame

    2724a0  tst.w $8130D2 / bne $272722    a DIFFERENT global from FREEZE -- straight to the tail
    2724aa  move.w ($2,A6),D1
    2724ae  sub.w ($2a,A5),D1              <- SUBTRACTS last frame's cached sinusoid offset
    2724b2  move.w D1,($2,A6)
    2724b6  jsr $24179E                    scrollCompensate, already ported ($4B uses it at $271DE4)
    2724bc  move.w ($2,A6),D0 / addi.w #$1400,D0

**TWO pause globals, at different granularities.** `$8130D2` here skips the ENTIRE alive path and jumps
to the tail, so the record draws but does not move or act. `$8130D4` (FREEZE) in the mode-3 arm skips
only the volley. **They are not interchangeable and a port that folds them into one `frozen` check
changes behaviour under one of the two.** `$8130D2` has 87 mentions and 42 in code, and lives in
`FROZEN_GLOBALS` -- so both are already modelled, just as distinct things.

**THE CRITICAL PORTING FACT: `sub.w ($2a,A5),D1` backs the sinusoid offset OUT before it is re-applied.**
That is why `$272556 move.w D2,($2a,A5)` caches it. The pattern is remove-then-reapply each frame, not
accumulate. **A port that only adds makes the enemy drift off screen at a rate of one offset per frame**
-- visible immediately, but trivially easy to write wrong since the add is `$40` bytes away from the
subtract and in a different arm.

That makes `$24179E` the **seventh** callee, and the seventh already ported.

### W351: the bounds test read. The PROLOGUE IS NOW CONTIGUOUS from `$272424` to the cascade.

    2724bc  move.w ($2,A6),D0
    2724c0  addi.w #$1400,D0
    2724c4  addi.w #$7400,D0        <- TWO SEQUENTIAL ADDS, and the carry is tested off the SECOND
    2724c8  bcc $2724da             carry clear -> on screen
    2724cc  tst.b ($16,A5) / beq $2724e0    off screen but never armed -> fall into the cascade
    2724d2  jmp $263762             off screen AND armed -> exit, the same tail-jump as death
    2724da  move.b #$1,($16,A5)     on screen -> ARM the flag
    2724e0  cmpi.b #$0,($17,A5)     the cascade

**PORT HAZARD, and a sharp one: `addi.w #$1400` then `addi.w #$7400` IS NOT `addi.w #$8800`.** The sum is
the same; the CARRY is not. With `D0 = $F000`: two adds give `$0400` (carry) then `$7800` (no carry), so
`bcc` is TAKEN. One add of `$8800` gives `$7800` WITH carry, so `bcc` is NOT taken -- opposite branch,
opposite despawn decision. **Keep the two adds separate.** This is the same class as the packed-long rule
already in these notes: two sequential biases do not fold into one.

**`($16,A5)` is the on-screen-once flag, at the SAME offset and with the same meaning as `$4B`'s** at
`$271DD4`/`$271DC6` -- the record may only despawn after it has been on screen at least once. Third
member of that idiom now.

**The handler prologue is contiguous and complete: `$272424` -> `$2724E0`**, in six pieces (gate,
invulnerability countdown, `$5C` mask, palette/death, pause+back-out, bounds). That is a checkable claim
about a byte range, not an assessment.

### W351: the two fan variants differ in EMIT and STEP, not just in cluster count

W346 recorded the `($2E,A5)` split as five clusters against four, differing in pass count and backoff.
**That was incomplete in two ways that matter.** Reading `$272690` onward:

    five-cluster (($2E,A5) != 0)      four-cluster (($2E,A5) == 0)
    move.l #$FFFF0005,D0              move.l #$FFFF0004,D0
    subi.w #$34,D1                    subi.w #$22,D1
    move.w #$4,D7   -> 5 passes       move.w #$3,D7   -> 4 passes
    jsr $2816F6                       jsr $281744        <- A DIFFERENT EMIT
    addq.b #4,D1                      addq.b #2,D1       <- A DIFFERENT STEP

So the four-cluster variant fires a **tighter** triple (step 2, not 4) through a **different emit
routine**. `$281744` is already ported -- 21 mentions, 14 in code, and it is referenced by `T48` and
`T49`'s own specs plus `boss2attacks.js:603` and `boss4.js:753`. It is the sibling `boss2attacks.js:231`
already selects between: `i < 3 ? 0x281708 : 0x2816f6`, so the family is `$2816F6` / `$281708` / `$281744`.

**That is the EIGHTH callee `$55` needs and the eighth already written.** Every single one of its
dependencies existed in the port before this wave began: `$241D34`, `$8130D4`, `$8130D2`, `$24226E`,
`$2816F6`, `$281744`, `$23DF86`, `$28615E`, `$24179E`, plus the `$263762` exit and the `$270D92` walker.

**A port that shared one fan routine between the two variants, parameterised only by pass count and
backoff, would be wrong twice over** -- wrong step and wrong emit -- and would look right because both
paths produce a plausible fan.

**BOTH LOOPS NOW COUNTED FROM THE BYTES, and the variants are NOT three-emits-each:**

    variant            emits/pass                                  dbra          passes   TOTAL
    ($2E,A5) != 0      3 x jsr $2816F6  at $272648 $27265E $272674  $27267E->$27263A  D7=4 -> 5   15
    ($2E,A5) == 0      5 x jsr $281744  at $2726A8 $2726BE $2726D4     $27270A->$27269A  D7=3 -> 4   20
                                          $2726EA $272700

**So the `($2E,A5) == 0` variant fires TWENTY shots and the other fires FIFTEEN.** My W346/W351 names for
these -- "five-cluster" and "four-cluster" -- describe the pass counts and are actively misleading about
volume: the variant with FEWER passes fires MORE bullets, because it unrolls five emits per pass instead
of three. **Call them by their totals (15-shot and 20-shot), not by their cluster counts.**

Consistent with the tighter step: the 20-shot variant steps `2` and backs off `$22`; the 15-shot variant
steps `4` and backs off `$34`. Both stay roughly symmetric about the aim, but they are two distinct
patterns with two distinct emit routines, not one pattern with two parameters.

`$27267E` and `$27270A` are both `dbra D7` (`51cf`), confirming the `move.w #$N,D7` counters are loop
counters and that the N+1 rule applies to both -- which is what makes it 5 and 4 passes rather than 4 and 3.

## TYPE $1A (W353) -- THE "TRACE BLOCKER" DOES NOT EXIST. IT IS UNBLOCKED.

These notes have carried, for many waves, that `$1A` is "blocked on a TRACE at `$268D8C` (D2/D3 provenance),
not a read". **That is wrong. Every register at that call is statically determined, and both callees plus the
table are already ported.** Type table `$2678F4`: init `$268D1E`, body `$268D26`, handler `$268E6C`.

    268d2c  jsr $2637A2                    loadSubProto
    268d32  move.l A0,($44,A5)
    268d36  lea $268DDC,A0 / moveq #$E,D0 / jsr $26377A     15-word record prototype
    268d44  move.b #$4,D0 / move.b #$4,D1 / move.b #$2,D2   <- the DEFAULTS
    268d50  cmpi.w #$1,$813092 / bls $268D66                <- RANK, and it is ALREADY PORTED
    268d5a  move.b #$3,D0 / move.b #$6,D1 / move.b #$1,D2   <- the high-rank values
    268d66  move.b D0,($2A,A5) / move.b D1,($2B,A5)         D0 and D1 CONSUMED here
    268d6e  move.b D2,($30,A6)                              D2 CONSUMED here, into the SUB-record
    268d72  jsr $263808                                     readInitPosition
    268d78  lea $272C7A,A0                                  already ported: TYPE97_ART heading table
    268d7e  movem.w ($2,A6),D0-D1                           SIGN-EXTENDS both -- D0/D1 REDEFINED
    268d84  addi.w #$B00,D0
    268d88  addi.w #$0,D1                                   a NO-OP add (see below)
    268d8c  jsr $24203E                                     already ported, in AIM_REFS
    268d92  bcc $268D98                                     a carry exit
    268d94  move.b ($1B,A6),D1

**So the provenance is trivial once read in order.** `D2` never reaches `$268D8C` at all -- it is consumed at
`$268D6E`, sixteen bytes earlier. And `D0`/`D1` at the call are not the rank values but the record's own
position, freshly loaded by `movem.w` and biased. **The note was describing a dependency that the instruction
order rules out.** `$813092` is RANK with 26 code mentions; `$24203E` is an aim routine with 7; `$272C7A` is
`TYPE97_ART`'s heading table with a window already declared.

**`addi.w #$0,D1` at `$268D88` adds nothing and its flags are destroyed by the `jsr` two instructions later,**
so it is a third dead instruction in this band after `$27250C`'s `#$1` and `$2723B2`'s dead pointer store.
Transcribe it or omit it, but do not read meaning into it.

**This is the third "the blocker did not exist" of this session** (`$55`'s A0, `$46`'s mode 3, now this), and
the only one that was load-bearing across waves: it is why `$1A` was ranked behind `$46` and never attempted.
`$1A` is FOUR records, the biggest remaining piece of stage 5, and it is now a normal read.

### HOW TO WRITE `handler1A` -- every convention VERIFIED, nothing left to derive

W364 checked each helper's calling convention against its source rather than assuming, and found two traps and one
retraction doing so. The result is that writing this handler is now transcription. **Do not re-derive these; they
were each wrong once.**

    PROLOGUE
      bounds      TWO word adds, $1000 then $6E00, carry off the SECOND ($268E76..$268E7E). Pinned by
                  w363type1afields.test.js, including a $F000 case proving they must not be folded.
      on-screen   ($16,A5) latch, same offset and meaning as $46/$4B/$1A ($268E80/$268E8E)
      exit        both off-screen-armed and death jmp $263762 -> freeEnemy

    DAMAGE ARM ($5C family, fifth member)
      mask $5C / clear $A3, scoreHit -- but this member INSPECTS ($1D,A6) first: if it holds the
      sentinel $19, the base ($1C,A5) is substituted BEFORE the XOR with ($1D,A5). $49/$4B/$55 XOR
      unconditionally. Getting this wrong shows a colour the cartridge never draws, only at one HP
      threshold, only when hit -- invisible to a playtest.

    PAUSE
      $8130D2 as a WORD at $268EE2, and as a LONG at $268F4A and $269088. The long read covers
      $8130D4 too, so it tests BOTH pause globals. ram.u16 where the ROM has tst.l loses one of them.

    MOTION
      wobble      ($36,A6) += $20 free-running, bit 6 ONLY (andi.w #$40) added to ($6,A6): a SQUARE
                  wave, not a sine. Cheaper than the $241D34 route $55 takes for the same visual job.
      cursor      ($28,A6) BIDIRECTIONAL, step 4: forward wraps $10 -> 0, reverse wraps underflow -> $C.
                  The reverse arm uses the CARRY, so it is not (cursor - 4) & 0xC.

    TURRET -- the two traps
      target      `targetSelect(ram, a5)`. It ALREADY keys on ($3,A5) and does the exg. W353 said to
                  write this inline and that was BACKWARDS; the port's function is this logic exactly.
      aim         `aim64(self, target)` -- $24203E, "self=D0/D1 target=D2/D3 -> D1", 0..63 out, and
                  aim.js:51 confirms RANK DOES NOT REACH IT.
      slew        `slew64(<facing from ($28,A5)>, target)`. NOT slew64FromRecord: that is $24218C, a
                  different entry point taking the facing from ($1B,A6) -- a different structure.
      sprite      andi.w #$3E then double: 32-step, where the heading is 64-step. The turret aims and
                  turns twice as finely as it draws, and $272C7A's window is $80 = 32 longs.

    ARM 1 -- the 7-shot fan
      T1A.fan.angles, emit $281744, speed bias = a drawByte242B3C draw SWAPPED into the high word, so
      the shot speed is RANDOM per volley where $55's is fixed $02000000. Timer ($1E,A5) reloads from
      ($2B,A5) -- the RANK value -- at $268FE0, and from ($1F,A5) at $269052. TWO reload sources.

    ARM 2 -- the twin muzzles
      ($2E,A5) reloads from ($2A,A5), the OTHER rank value, and from ($2F,A5) when ($30,A5) expires:
      a burst-within-a-burst. Two aims at Y +/-$680 off a shared X-$600, via aim256 (self-selecting,
      so it IGNORES ($3,A5) -- the two arms can target DIFFERENT players). Each shot jittered by
      asr.b #2 of a fresh draw: ARITHMETIC, so signed, -32..+31 centred. Emit $281708, biases
      $FA000680 and $F9FFF980 -- the borrow rule makes both Xbias $FA00 with Ybias +/-$680.

    TAIL
      table at $269246 (4 longs, cursor 0/4/8/$C), position + swap-separated word adds -$400 / +$500
      (NO borrow between halves -- do NOT fold into addi.l), D3 = $620, emits $23D762 AND $23DECE.

    DEATH ARM
      killScore $350 via $28615E, cue $28C2DC (shared with $49 and $55), burstBucket $289B22 with X
      bias $F800, then a RANK-4-EXACTLY and clock < $2B0 gated MIRROR burst with $0800, then THREE
      spawnEffect $289004 calls -- kinds $D, $5, $5 -- whose setups look alike and carry DIFFERENT
      velocities. Count the call sites; reading them in sequence produced a retraction.

**DO NOT land a partial `handler1A`.** Hibachi could be registered with a `note()` body because its critical
function was the STAGE ADVANCE, which was complete. `$1A`'s critical function is FIRING: a non-firing version is
four records of harmless scenery and silently changes the stage's difficulty. It is all-or-nothing.

### The main body IS WRITTEN, against the brief above. It is NOT complete -- four helpers remain.

Below is `$268E6C..$269058` transcribed: the two-add bounds test, the `$5C` arm with its `$19` sentinel, the
`$8130D2` word read then the LONG read, the square-wave wobble, the bidirectional cursor, and arm 1 with all three
W364 conventions applied (`targetSelect`, `aim64`, `slew64` with the facing from `($28,A5)`, and the `andi.w #$3E`
sprite index). **This is the part where getting a convention wrong would be silent**, so it is the part worth
having written while the checks were fresh.

**ALL FOUR ARE NOW WRITTEN TOO, and appended below the main body. TWO SIGNATURES IN THEM ARE UNVERIFIED**, and by
this session's record that means they are probably wrong -- five of five checked conventions needed correcting:

**BOTH LOOKED UP, AND BOTH GUESSES WERE WRONG -- seven of seven now:**

    $24226E is `aim256FromCaller(t, ram, a5, selfY, selfX)`     aim.js:339. NOTE THE ARGUMENT ORDER:
                                                                **selfY BEFORE selfX**. My guess had
                                                                (tables, selfX, selfY) -- wrong function
                                                                AND wrong order. Swapping X and Y gives a
                                                                MIRRORED aim that still looks plausible on
                                                                screen, which is the worst kind of wrong.
    spawnEffect returns a BARE ADDRESS                          effects.js returns `POOL_B.bitBucket`
                                                                directly, not `{ addr }`. So the death
                                                                spawns must write through the returned
                                                                value itself; `r.addr` would be undefined
                                                                and every field write would silently vanish.

**So `arm2_1A` and `death1A` as written below are BOTH wrong** -- `arm2_1A` calls a non-existent overload with
transposed coordinates, and `death1A` writes through `r.addr` on a number. **Fix both before landing:**

    const up   = aim256FromCaller(aimTables(rom), ram, a5, u16(y + T1A.muzzleYOffset), selfX);
    const down = aim256FromCaller(aimTables(rom), ram, a5, u16(y - T1A.muzzleYOffset), selfX);
    ...
    const addr = spawnEffect(ram, ctx, kind);
    ram.setU32(addr + 0x02, ram.u32(a6 + 0x02));

**`aim256FromCaller` taking `a5` also explains why arm 2 ignores `($3,A5)`**: it does its own selection from the
record, by the shared rule -- which is exactly what W351 read off the ROM at `$2725F8` for `$55` and what makes the
two arms able to target different players. **The port's argument list encodes the behavioural fact.**

**Also unresolved: `noteEffect` is a LOCAL at `handlers.js:275`, not an export.** That is fine if `handler1A` lives
in `handlers.js` (it should -- it is not a boss, so the `boss.js`/`midboss.js` precedent does not apply), but
`death1A` cannot be split into another file without exporting it first.

**Everything else in the four pieces is transcription against verified conventions**: the fan's random speed bias
via a swapped `$242B90` draw, the two reload sources on `($2E,A5)`, the signed `asr.b #2` jitter, the
borrow-symmetric muzzle biases, the swap-separated tail bias with its own helper so the no-borrow property is
explicit, and the death arm following `$88`'s deferral pattern exactly.

**FORMERLY: still to write --**

    fan1A(ram, rom, a5, a6, ctx)     arm 1's seven shots: T1A.fan.angles, emit $281744, speed bias =
                                     a drawByte242B3C draw SWAPPED into the high word (random per volley)
    arm 2                            $269092..$26915E: the ($2E,A5) burst counter with its TWO reload
                                     sources, two aims at Y +/-$680 via aim256 (self-selecting, so it
                                     ignores ($3,A5)), asr.b #2 signed jitter, emit $281708, and the
                                     borrow-rule-symmetric biases $FA000680 / $F9FFF980
    tail1A(ram, rom, a5, a6, ctx)    the $269246 table by cursor, swap-separated word adds -$400/+$500
                                     (NOT an addi.l), D3 = $620, and BOTH emits $23D762 and $23DECE
    death1A(ram, rom, a5, a6, ctx)   killScore $350, cue $28C2DC, then the burst and THREE spawnEffect
                                     calls -- kinds $D, $5, $5 -- with DIFFERENT velocities. Count the
                                     sites; reading them in sequence produced a retraction in W351.

**Two conventions read for the death arm, and one of them changes the plan:**

    spawnEffect(ram, ctx, d0, siteAddr = 0x289004)     effects.js:373 -- PORTED, and the default
                                                       siteAddr is already $289004
    $289B22  the burst                                 **NOT PORTED.** Its "code" mentions are
                                                       `noteEffect(u, 0x289b22, a5, ...)` deferrals at
                                                       handlers.js:5000-5001 plus an address label in
                                                       T1B's spec at :3291

**DECISION RESOLVED, with an exact precedent: DEFER IT via `noteEffect`.** `handlers.js:4998-5001` is type `$88`'s
death arm and it has `$1A`'s structure line for line:

    scoreKill(ram, rom, ctx, 0x115, d1);                  // $27627E/$276284 jsr $28615E
    ctx.soundPost?.(0x28c2dc);                            // $27628A -- the SAME cue $1A uses
    noteEffect(u, 0x289b22, a5, 'D0=$C, D2=$FFFFFA00');   // $27629C
    noteEffect(u, 0x289b22, a5, 'D0=$C, D2=$00000600');   // $2762A8

**Two `$289B22` bursts with different D2 biases, both deferred, in a block whose own header reads "THE DEATH
EXPLOSION, WIRED".** So the explosion is wired and the pool-C burst specifically is a known deferral of the effect
subsystem, not an oversight. `noteEffect(u, addr, a5, what)` records the D2 value in its message, which is how the
information survives the deferral.

**`death1A` is therefore pure transcription:**

    scoreKill(ram, rom, ctx, T1A.killScore, hit)                  // $269160/$269166 -- $350
    ctx.soundPost?.(T1A.deathCue)                                 // $26916C -- $28C2DC
    noteEffect(u, 0x289b22, a5, 'D0=$C, D2=$F8000000')            // $26917E
    if (rank === 4 && clock < $2B0) noteEffect(... 'D2=$08000000') // $2A619C -- the MIRROR burst
    three spawnEffect(ram, ctx, kind) calls, kinds $D / $5 / $5, with the field writes between them

**And the "do not land a partial" rule does NOT bar this**, by its own criterion: the burst is COSMETIC, like
Hibachi's stage-clear reasoning inverted. What barred a partial `$1A` was the FIRING arms, which are gameplay. A
deferred death burst leaves `$1A` no worse than `$88`, which ships that way.

**AND THIS EXPOSED A THIRD DEFERRAL FORM `claimed.py` COULD NOT SEE.** Its classifier matched `note(` and
`unreached(` but not **`noteEffect(`** -- "Effect" follows "note", so `note\s*\(` fails. `$289B22` therefore
reported CLAIMED with three CODE mentions when none is an implementation. Widened to `note\w*\s*\(` in W365, which
drops it to 2 CODE and now trips the THIN warning, i.e. the tool now flags it for exactly the check it needs.

**That is the FIFTH correction to `claimed.py` and the third to its classifier.** The deferral helpers are a
FAMILY, and any new one silently turns a deferral into a CLAIMED verdict.

**AND THE FAMILY IS NOW ENUMERATED, so the fix is provably complete for the current codebase** rather than being a
fourth guess. Every deferral-shaped definition in `src/`:

    unreached              src/unported.js       MATCHED
    note                   src/unported.js       MATCHED
    noteEffect             handlers.js:275       MATCHED (by the W365 widening)
    notePerFrameLedger     (exported)            MATCHED
    deferReset             background.js:315     NOT a deferral marker -- it resets the CAMERA's
                                                 deferred list ($240F0A/$240F10/$240F1A), so the name
                                                 is about the deferred-spawn QUEUE, not about unported code

**So `note\w*` plus `unreached\w*` covers all four real markers, and the one non-matching candidate is not a marker
at all.** The regex is complete, not merely widened. **The maintenance rule stands for any FUTURE helper**: if one
is added, check it against this list and widen in the same commit -- and note that `noteEffect` is NOT exported
(`handlers.js:275`), so a grep for `export function note` alone would have missed it.

**RESOLVED: `spawnCues28AC72`'s signature is `(ram, rom, a5, a6)`.** `cues.js:72` defines it and
`handlers.js:1580`, `:2224` and `:3392` all call it that way. **My guess was `(ram, rom, ctx, a6)` -- wrong in the
third argument**, which would have passed `ctx` where the record pointer belongs. Corrected in the code below.

That is the fourth argument-convention guess W364 checked and the fourth that needed correcting (`slew64` vs
`slew64FromRecord`, `targetSelect`'s applicability, the `moveq` register encoding in a test, and now this).
**Every helper call in a new handler should be read from its definition or an existing call site, not recalled** --
the hit rate on recall in this codebase is, empirically, zero out of four.

```js
// $268E6C -- TYPE $1A, stage 5's slewing twin-weapon turret. FOUR script records.
//
// See T1A for the measured fields and the seven sibling-divergence traps. The three that cost a check
// each in W364, all verified against source rather than assumed:
//
//   * `slew64`, NOT `slew64FromRecord`. The latter is $24218C, a different ROM entry point that takes
//     the facing from ($1B,A6). $242190 takes it in a register, and $1A supplies ($28,A5).
//   * `targetSelect(ram, a5)` IS this type's inline block -- it already keys on ($3,A5) and does the
//     exg. W353 recorded the opposite and would have caused a duplicate port.
//   * the heading is 64-step and the SPRITE is 32-step: `andi.w #$3E` drops bit 0 before the double.
//
// And ($28,A5) is the HEADING while ($28,A6) is the ANIMATION CURSOR -- one offset, two structures,
// both live in this function. A5 is the record, A6 the sub-record.
function handler1A(ram, rom, a5, ctx) {
  const a6 = ram.u32(a5 + 0x06);

  // $268E6C..$268E92 -- TWO sequential word adds, carry off the SECOND. Folding them into one
  // addi.w #$7E00 changes the branch: with D0 = $F000 the pair clears the carry and the single sets it.
  const first = u16(ram.u16(a6 + 0x02) + T1A.boundsBias[0]);   // $268E76
  const offScreen = first + T1A.boundsBias[1] > 0xffff;        // $268E7A/$268E7E bcc
  if (offScreen) {
    if (ram.u8(a5 + T1A.onScreenAt) !== 0) { freeEnemy(ram, a5); return; }   // $268E80/$268E86
  } else {
    ram.setU8(a5 + T1A.onScreenAt, 1);                        // $268E8E
  }

  // $268E94 -- the $5C damage arm. THIS MEMBER INSPECTS ($1D,A6) BEFORE XORING: $49, $4B and $55 all
  // XOR unconditionally, and copying them would show a colour the cartridge never draws.
  const hit = ram.u8(a6) & T1A.damageMask;                    // $268E94/$268E96
  if (hit === 0) {
    // $268E9A..$268EB0 -- the not-hit path picks the base or the sentinel by HP.
    ram.setU8(a6 + 0x1d, i16(ram.u16(a6 + 0x18)) >= T1A.hpGate
      ? ram.u8(a5 + T1A.palBase)                              // $268E9A
      : T1A.paletteSentinel);                                 // $268EAE moveq #$19,D0
  } else {
    ram.setU8(a6, ram.u8(a6) & T1A.damageClear);              // $268EB2 andi.b #$A3
    scoreHit(ram, ctx, a6, hit);                              // $268EB6 jsr $286096
    let d0 = ram.u8(a6 + 0x1d);                               // $268EBC
    if (d0 === T1A.paletteSentinel) d0 = ram.u8(a5 + T1A.palBase);   // $268EC0/$268EC6
    d0 = (d0 ^ ram.u8(a5 + T1A.palXor)) & 0xff;               // $268ECA/$268ECE
    if ((ram.u16(a6 + 0x18) & 0x8000) !== 0) {                // $268ED0 tst.w / bmi $269160
      death1A(ram, rom, a5, a6, ctx);
      return;
    }
    ram.setU8(a6 + 0x1d, d0);                                 // $268ED8
  }

  spawnCues28AC72(ram, rom, a5, a6);                          // $268EDC jsr $28AC72
  // $268EE2 -- the pause as a WORD here, and as a LONG at $268F4A/$269088 where it also covers $8130D4.
  if (ram.u16(T1A.pauseAll) !== 0) { tail1A(ram, rom, a5, a6, ctx); return; }   // $268EE8 bne $268F4A

  // $268EEA..$268F14 -- the SQUARE-wave wobble. ($36,A6) free-runs by $20 and only bit 6 is used, so
  // ($6,A6) alternates between $F000 and $F040. Not a sine, and cheaper than $55's $241D34 route.
  ram.setU16(a6 + 0x06, 0xf000);                              // $268EEA
  if (ram.u8(a6 + 0x1b) < 0x40) {                             // $268EF0 cmpi.b #$40 / bcc
    ram.setU16(a6 + 0x36, u16(ram.u16(a6 + 0x36) + T1A.wobbleStep));            // $268EF8
    ram.setU16(a6 + 0x06,
      u16(ram.u16(a6 + 0x06) + (ram.u16(a6 + 0x36) & T1A.wobbleMask)));         // $268EFE..$268F06
    if (due8(ram, a6 + 0x26)) {                               // $268F0A subq.b #1,($26,A6) / bcc
      ram.setU8(a6 + 0x26, ram.u8(a6 + 0x27));                // $268F10 -- the pair is in the SUB-record
      // $268F16..$268F38 -- the BIDIRECTIONAL cursor. Forward wraps at $10 to 0; reverse wraps on
      // UNDERFLOW to $C, using the carry, so it is not (cursor - 4) & 0xC.
      const dir = ram.u8(a6 + 0x1c) !== 0;
      let cur = ram.u16(a6 + T1A.cursorAt);
      if (!dir) {
        cur = u16(cur + T1A.cursorStep);                      // $268F1C addq.w #4
        if (cur === T1A.cursorWrap) cur = 0;                  // $268F20/$268F28 -- EQUALITY, then clr
      } else {
        const next = cur - T1A.cursorStep;                    // $268F2E subq.w #4
        cur = next < 0 ? T1A.cursorWrapDown : next;           // $268F32 bcc / $268F34 move.w #$C
      }
      ram.setU16(a6 + T1A.cursorAt, cur);
      ram.setU32(a6 + 0x0a, rom.u32(T1A.artTable + cur));     // $268F3A..$268F44
    }
  }

  // $268F4A -- the LONG read, so this one test honours BOTH $8130D2 and $8130D4.
  if (ram.u32(T1A.pauseAll) !== 0) { tail1A(ram, rom, a5, a6, ctx); return; }

  // $268F50..$269046 -- ARM 1: the seven-shot fan.
  if (due8(ram, a5 + T1A.fanGateAt)) {                        // $268F50 subq.b #1,($22,A5) / bcc
    ram.setU8(a5 + T1A.fanGateAt, ram.u8(a5 + T1A.fanGateReloadAt));            // $268F5C
    // $268F62 -- re-aim only on the burst's first volley, the same idiom as $55's ($2E,A5)/($2F,A5).
    if (ram.u8(a5 + T1A.burstAt) === ram.u8(a5 + T1A.burstReloadAt)) {
      // $268F6E..$268F8C -- targetSelect IS this block: it keys on ($3,A5) and does the exg.
      const sel = targetSelect(ram, a5);
      if (sel && sel.addr) {
        // $268F8E/$268F94 -- movem.w SIGN-EXTENDS both. aim64 is $24203E: self D0/D1, target D2/D3.
        const want = aim64(aimTables(rom),
          u16(ram.u16(a6 + 0x02) + 0x0b00), ram.u16(a6 + 0x04),                 // $268FA0 addi.w #$B00
          ram.u16(sel.addr + 0x02), ram.u16(sel.addr + 0x04));
        // $268FB2 -- slew64, NOT slew64FromRecord. The facing comes from ($28,A5), the RECORD.
        const dir = slew64(ram.u16(a5 + T1A.headingAt) & 0xff, want);            // $268FAE/$268FB2
        ram.setU16(a5 + T1A.headingAt, u16(dir));                               // $268FB8
        // $268FBC -- the sprite is 32-step where the heading is 64-step: andi.w #$3E drops bit 0.
        ram.setU32(a5 + 0x24, rom.u32(T1A.headingTable + ((dir & 0x3e) * 2)));   // $268FC2
      }
    }
    if (i16(ram.u16(a6 + 0x02)) >= T1A.fanGateX && due8(ram, a5 + T1A.fanTimerAt)) {   // $268FD2/$268FDA
      ram.setU8(a5 + T1A.fanTimerAt, ram.u8(a5 + T1A.rankArm1At));              // $268FE0 -- the RANK value
      fan1A(ram, rom, a5, a6, ctx);
    }
  }

  tail1A(ram, rom, a5, a6, ctx);                              // $269058
}
// $269024..$269046 -- arm 1's SEVEN shots. One emit per pass, not unrolled like $55's.
// T1A.fan.angles is pinned against the cartridge by w363type1afields.test.js: seven values derived from
// backoff $24 and step $C, checked symmetric about the aim.
//
// THE SPEED BIAS IS RANDOM PER VOLLEY. $268FF6 calls $242B90 -- drawByte242B3C's D5-returning twin, same
// table -- and $269012 SWAPS the byte into the high word, so it becomes the X half of a packed long.
// $55's equivalent is a fixed $02000000, and reusing $55's fan with a constant here gives a
// uniform-speed volley: visually close, mechanically wrong, invisible in one frame.
function fan1A(ram, rom, a5, a6, ctx) {
  const base = ram.u16(a5 + T1A.headingAt) & 0xff;
  const d5 = (drawByte242B3C(ram, rom) << 16) >>> 0;      // $268FF6 jsr $242B90 / $269012 swap D5
  const ctxB = { ram, rom, log: new WriteLog(ram) };
  T1A.fan.angles.forEach((off) => {
    const d1 = (base + off) & 0xff;                       // $26901C subi.w #$24 / $26903E addi.w #$C
    const idx = (d1 + 2) & 0xfc;                          // $26902C addq.w #2 / $26902E andi.w #$fc
    const regs = {
      d0: 0x5,                                            // $269016 moveq #$5,D0 -- a WORD 5
      d1,
      d2: ram.u32(a6 + 0x02),                             // $269018
      d3: i32(rom.u32(T1A.vectorTable + idx) + d5),       // $269032 move.l (A0,D3.w),D3 / $269036 add.l D5,D3
      d4: 0,
      d5,
      a5,
    };
    ctx.bulletSpawn?.(0x269038, fireBullet(ctxB, T1A.fan.emit, regs));   // $269038 jsr $281744
  });
}

// $269092..$26915E -- ARM 2: the twin-muzzle burst, on its own rank-dependent timer.
//
// ($2E,A5) HAS TWO RELOAD SOURCES: ($2A,A5), the other rank value, on the ordinary step, and ($2F,A5)
// when the ($30,A5) volley counter expires. That is a burst-within-a-burst, and treating ($2E,A5) as
// having one reload collapses the grouping.
//
// It also selects its target DIFFERENTLY from arm 1: aim256 does its own selection by the shared rule
// and IGNORES ($3,A5), so the two arms can legitimately fire at different players in one frame.
function arm2_1A(ram, rom, a5, a6, ctx) {
  if (!due8(ram, a5 + T1A.arm2TimerAt)) return;           // $2690A2 subq.b #1,($2E,A5) / bcc
  ram.setU8(a5 + T1A.arm2TimerAt, ram.u8(a5 + T1A.rankArm2At));          // $2690AA -- the RANK value
  ram.setU8(a5 + T1A.arm2CountAt, ram.u8(a5 + T1A.arm2CountReloadAt));   // $2690B0
  // $2690B6/$2690BC -- TWO byte writes of $80, the no-target fallback for both muzzles.
  ram.setU8(a5 + T1A.muzzleAimAt[0], T1A.muzzleAimFallback);
  ram.setU8(a5 + T1A.muzzleAimAt[1], T1A.muzzleAimFallback);

  // $2690C2..$2690F2 -- two aims from points +/-$680 in Y off a shared X-$600. The `bcs` at $2690D6
  // fires on the FIRST aim only, so no target leaves BOTH muzzles at $80.
  const selfX = u16(ram.u16(a6 + 0x02) + T1A.muzzleXOffset);
  const up = aim256(aimTables(rom), selfX, u16(ram.u16(a6 + 0x04) + T1A.muzzleYOffset));
  if (up === null) return;                                // $2690D6 bcs $2690F6
  ram.setU8(a5 + T1A.muzzleAimAt[0], up & 0xff);          // $2690DA
  const down = aim256(aimTables(rom), selfX, u16(ram.u16(a6 + 0x04) - T1A.muzzleYOffset));
  if (down !== null) ram.setU8(a5 + T1A.muzzleAimAt[1], down & 0xff);    // $2690F2

  // $2690F6..$26915E -- the two shots. Each jitters its own muzzle's aim by asr.b #2 of a FRESH draw:
  // ARITHMETIC, so signed, giving -32..+31 centred. `>>> 2` on an unsigned byte biases every shot one way.
  const ctxB = { ram, rom, log: new WriteLog(ram) };
  T1A.muzzleAimAt.forEach((at, i) => {
    const draw = drawByte242B3C(ram, rom);                // $269108/$269130 jsr $242B3C
    const jitter = (draw << 24) >> 24 >> T1A.muzzle.jitterShift;          // $26910E asr.b #2
    const d1 = (ram.u8(a5 + at) + jitter) & 0xff;         // $269110 add.b D0,D1
    const regs = {
      d0: T1A.muzzle.d0,                                  // $269112 move.l #$20016,D0
      d1,
      d2: ram.u32(a6 + 0x02),                             // $269118
      d3: T1A.muzzle.bias[i],                             // $26911C/$269144 -- borrow-symmetric
      d4: 0,
      d5: 0,
      a5,
    };
    ctx.bulletSpawn?.(0x269124 + i * 0x28, fireBullet(ctxB, T1A.muzzle.emit, regs));
  });

  // $269152 -- step the volley counter; on underflow ($2E,A5) reloads from ($2F,A5), NOT ($2A,A5).
  const n = ram.u8(a5 + T1A.arm2CountAt);
  ram.setU8(a5 + T1A.arm2CountAt, (n - 1) & 0xff);
  if (n === 0) ram.setU8(a5 + T1A.arm2TimerAt, ram.u8(a5 + T1A.arm2GapAt));   // $269158
}

// $269058..$26907E -- the tail. TWO emits, and the position bias is SWAP-SEPARATED word adds.
//
// $26905E..$26906C is `move.l ($2,A6),D1 / addi.w #-$400,D1 / swap D1 / addi.w #$500,D1 / swap D1`. The
// halves are added while swapped APART, so there is NO borrow between them. Folding this into
// `addi.l #$0500FC00` introduces a carry the cartridge never performs.
function tail1A(ram, rom, a5, a6, ctx) {
  enqueueRegistersThroughStub(ram, rom, T1A.drawStubs[0],                // $269058 jsr $23D762
    swapBiasedPosition(ram.u32(a6 + 0x02)),
    ram.u32(a5 + 0x24),                                                  // $26906E move.l ($24,A5),D2
    0x620,                                                               // $269072 move.w #$620,D3
    ram.u8(a6 + 0x1d));
  enqueueRegistersThroughStub(ram, rom, T1A.drawStubs[1],                // $26907A jsr $23DECE
    swapBiasedPosition(ram.u32(a6 + 0x02)),
    ram.u32(a5 + 0x24), 0x620, ram.u8(a6 + 0x1d));
  // $269082 jsr $26331C -- a bare rts. Transcribed, not called. Hibachi calls the same stub eleven times.
}

/** The swap-separated bias: -$400 on the LOW half, +$500 on the HIGH, with no borrow between them. */
function swapBiasedPosition(pos) {
  const lo = u16((pos & 0xffff) - 0x400);                 // $269062 addi.w #-$400,D1
  const hi = u16(((pos >>> 16) & 0xffff) + 0x500);         // $269068 addi.w #$500,D1 after the swap
  return ((hi << 16) | lo) >>> 0;
}

// $269160..$26925C -- the death arm. Follows type $88's ($27627E) line for line, including deferring
// the pool-C bursts through noteEffect: $88 ships that way and its own header says "THE DEATH EXPLOSION,
// WIRED", so the burst is a known effect-subsystem deferral rather than an oversight.
function death1A(ram, rom, a5, a6, ctx) {
  const u = ctx.unported;
  scoreKill(ram, rom, ctx, T1A.killScore, ram.u8(a6) & T1A.damageMask);   // $269160/$269166 -- $350
  ctx.soundPost?.(T1A.deathCue);                                          // $26916C -- shared with $49/$55
  noteEffect(u, T1A.burstBucket, a5, `D0=$C, D2=$${T1A.burstBias[0].toString(16).toUpperCase()}`);
  // $269184 -- RANK EXACTLY 4 (cmpi.w #$4 / bne, not a threshold) AND clock below $2B0. Content almost
  // nobody sees, so a port that gets it wrong passes every playtest: it belongs in a test, not a session.
  if (ram.u16(T1A.rankGlobal) === T1A.rank4Exactly
      && ram.u16(T1A.clockGlobal) < T1A.rank4ClockBelow) {
    noteEffect(u, T1A.burstBucket, a5,
      `D0=$C, D2=$${T1A.burstBias[1].toString(16).toUpperCase()} -- the RANK-4 MIRROR burst`);
  }
  // $2691A8/$2691DC/$26920E -- THREE spawnEffect calls, kinds $D, $5, $5, with DIFFERENT velocities.
  // Counting the sites is how this was read; reading them in sequence produced a retraction in W351.
  const fields = [
    { kind: 0xd, w: [[0x1e, 0x10], [0x12, 0], [0x14, 0], [0x26, 0x400], [0x28, 0], [0x10, 1]] },
    { kind: 0x5, w: [[0x1e, 0x10], [0x12, 0]] },
    { kind: 0x5, w: [[0x1e, 0x10], [0x14, 0x400], [0x26, 0xf800], [0x28, 0x600], [0x10, 1]] },
  ];
  for (const { kind, w } of fields) {
    const r = spawnEffect(ram, ctx, kind);                // $289004
    if (!r || r.addr === undefined) continue;
    ram.setU32(r.addr + 0x02, ram.u32(a6 + 0x02));        // the record's position
    for (const [off, val] of w) ram.setU16(r.addr + off, val);
  }
  freeEnemy(ram, a5);
}
```

### `$1A`'s init body read end to end -- three tables, two windows declared (445 -> 447)

    268d1e  move.w #$1,($4,A5) / rts        the init proper: run length 1 = TWO sub-records
    268d26  lea $268DFA,A0 / jsr $2637A2    sub prototype $268DFA
    268d36  lea $268DDC,A0 / moveq #$E,D0   record prototype $268DDC, FIFTEEN words
    ...the rank cascade and the aim call above...
    268da0  add.w D1,D1 / move.l (A0,D1.w),($24,A5)     a heading long out of $272C7A
    268da8  move.w ($28,A6),D0 / lea $269246,A0 / move.l (A0,D0.w),($2a,A6)
    268db8  move.w $813094,D0 / lea $268DD2,A0 / lea (A0,D0.w),A0
    268dc8  move.b (A0)+,($1c,A5) / move.b (A0)+,($1d,A5)      a PAIR, post-incremented
    268dd0  rts

**Three contiguous structures, and each is bounded without a guess.** `$268DD2` rows run to the record
prototype at `$268DDC`; that runs its 15 words to `$268DFA`; the sub prototype's `$40` (TWO sub-records) runs
to `$268E3A`, comfortably clear of the handler at `$268E6C` -- so **this type has NO prototype overlap**, unlike
`$49`,`$4A`,`$4B`,`$47`,`$43`,`$4C`,`$55`,`$46`. Declared as one `$268DD2 + $68` window.

**The five palette rows are `15 0a / 15 0a / 15 0a / 15 0a / 0a 15`.** Four identical pairs and a fifth that
**SWAPS base and XOR**. Indexed by `$813094` (already ported, 8 code mentions). **A port that noticed the first
four were identical and hoisted a constant would be wrong on exactly one row** -- the same trap shape as `$46`'s
two clock arms sharing `$F0`. And `$15`/`$0A` is the very pair `$55`'s prototype carries, so the palette is
shared across the pair.

**`$269246` is four longs DESCENDING by `$304`** -- `0017D17C 0017CE78 0017CB74 0017C870` -- and `$55`'s drift
table ASCENDS by `$304` (`B050 B354 B658 ...`). Same art family, opposite direction. Bounded by adjacency to
type `$1B`'s init at `$269256`, the same way `$46`'s table was bounded by its neighbour and `$55`'s by its
death list. Declared as `$269246 + $10`.

### `$1A`'s handler head: the bounds convention SPLITS the band three ways

    268e76  addi.w #$1000,D0
    268e7a  addi.w #$6E00,D0       TWO sequential word adds, carry off the SECOND
    268e7e  bcc $268E8E
    268e80  tst.b ($16,A5) / beq $268E94
    268e86  jmp $263762            off screen AND armed -> the shared exit
    268e8e  move.b #$1,($16,A5)    on screen -> arm the once-seen latch
    268e94  moveq #$5C,D1 / and.b (A6),D1     the $5C damage family
    268e98  bne $268EB2
    268e9a  move.b ($1c,A5),D0     <- THE PALETTE BASE, and note the OFFSET
    268e9e  cmpi.w #$7C0,($18,A6)

**THE BOUNDS TEST IS TWO SEQUENTIAL WORD ADDS, like `$55` and UNLIKE `$46`.** So the band now shows both
conventions side by side:

    $55   addi.w #$1400 then addi.w #$7400, carry off the second   -- must NOT be folded
    $1A   addi.w #$1000 then addi.w #$6E00, carry off the second   -- must NOT be folded
    $46   ext.l then addi.l #$4000 then cmpi.l #$2000              -- must NOT be split

**Three types, two conventions, and no way to tell which from the type's other traits.** Read the bounds test
per type; never carry it over from a sibling.

**AND `($1C,A5)` IS `$1A`'s PALETTE BASE.** `$268E9A move.b ($1c,A5),D0` on the not-hit path is the family's
palette-base read, which confirms the five-row table at `$268DD2` writes base/XOR into `($1C,A5)`/`($1D,A5)`.
**`$55` keeps that pair at `$18`/`$19`; `$1A` keeps it at `$1C`/`$1D`.**

That is the exact inverse of the `$46` lesson and worth stating as one rule: **in this band the same OFFSET can
mean different things across types (`$46`'s `($18,A5)` is a countdown, `$55`'s is a palette base), AND the same
MEANING can live at different offsets (`$1A`'s palette pair is at `$1C`/`$1D`).** Neither direction of inference
is safe. The only reliable move is the one that has worked all session: find an instruction that reads or writes
the field, in this type.

`$1A` is also a `$5C`-family damage arm, joining `$49`, `$4B` and `$55`.

### `$1A`'s damage arm has a TWO-STATE palette the siblings do not

    268e9a  move.b ($1c,A5),D0            the not-hit path: the base
    268e9e  cmpi.w #$7C0,($18,A6)         ...gated on HP
    268eae  moveq #$19,D0                 ...or the literal $19
    268eb0  bra $268ED8                   -> store

    268eb2  andi.b #$A3,(A6)              the HIT path, same clear mask as the family
    268eb6  jsr $286096                   scoreHit
    268ebc  move.b ($1d,A6),D0            read the CURRENT palette
    268ec0  cmpi.b #$19,D0 / bne $268ECA  <- if it is $19, swap in the base FIRST
    268ec6  move.b ($1c,A5),D0
    268eca  move.b ($1d,A5),D2 / eor.b D2,D0     then the XOR
    268ed0  tst.w ($18,A6) / bmi $269160  dead -> $269160
    268ed8  move.b D0,($1d,A6)

**`$19` is a sentinel palette, not a colour choice.** The not-hit path writes it when HP is on one side of
`$7C0`, and the hit path RECOGNISES it and substitutes the real base before XORing. `$49`, `$4B` and `$55` all
XOR unconditionally against whatever is in `($1D,A6)`; **`$1A` is the first member that inspects it first.**

A port that copied the sibling arm would XOR `$19` directly and produce a colour the cartridge never shows --
and only on frames where the record is hit while at that HP threshold, which is exactly the kind of narrow
window that survives a playtest.

So the `$5C` family agrees on the mask (`$5C`), the clear byte (`$A3`) and `scoreHit`, and disagrees on: whether
there is an `hpFull` reload, whether there is a palette DECISION, and now whether the XOR input is inspected.
**Four members, four different arms.**

### `$1A`'s alive path, and the rosetta.py misalignment trap AGAIN

**`rosetta.py dasm 0x268ede` returns pure garbage** (`ori.b #$72,($4A79,A0)`, `ori.l #$30D26660,D1`) because the
real instruction boundary is `$268EDC`, two bytes earlier. **This is the SECOND time this trap has cost a read
this session** -- the first was `$272722`, where it silently dropped four bytes and hid a `lea (d16,PC)`.

**The rule, now earned twice: when a disassembly line looks like `ori`/`pmove`/`ILLEGAL` in the middle of a
routine, the alignment is wrong, not the cartridge.** Back up two bytes and re-ask. Cheap to test, and it has
now produced two entirely fictional readings when skipped.

Realigned:

    268edc  jsr $28AC72                     spawnCues28AC72, already ported (9 code mentions)
    268ee2  tst.w $8130D2 / bne $268F4A     the whole-path pause -- same global as $55 and $46
    268eea  move.w #$F000,($6,A6)
    268ef0  cmpi.b #$40,($1B,A6) / bcc $268F4A
    268ef8  addi.w #$20,($36,A6)
    268efe  move.w ($36,A6),D0 / andi.w #$40,D0
    268f06  add.w D0,($6,A6)                a $40-or-0 wobble added to ($6,A6)
    268f0a  subq.b #1,($26,A6) / bcc $268F4A
    268f10  move.b ($27,A6),($26,A6)        timer and reload, both in the SUB-record

Two things worth noting. **`($36,A6)` is a free-running phase** whose bit 6 alone is used (`andi.w #$40`), so
`($6,A6)` alternates between `$F000` and `$F040` on a `$20`-per-frame ramp -- a square wave, not a sine, and
cheaper than the `$241D34` route `$55` takes. **And `$1A` keeps its timer pair in the SUB-record** (`($26,A6)`
/`($27,A6)`) where `$55` and `$46` keep theirs in the record (`($1A,A5)`, `($26,A5)`). Another instance of the
same-meaning-different-place rule.

`$8130D2` is now confirmed as the band's shared whole-path pause across `$55`, `$46` and `$1A`.

### `($28,A6)` is a BIDIRECTIONAL 4-frame cursor, and `tst.l $8130D2` tests BOTH pause globals

    268f1c  addq.w #4,($28,A6)              forward
    268f20  cmpi.w #$10,($28,A6) / bne
    268f28  clr.w ($28,A6)                  wrap $10 -> 0
    268f2e  subq.w #4,($28,A6)              reverse
    268f32  bcc $268F3A
    268f34  move.w #$C,($28,A6)             wrap underflow -> $C
    268f3a  move.w ($28,A6),D0
    268f3e  lea $269246,A0                  the four longs
    268f44  move.l (A0,D0.w),($a,A6)        the art long into the sub-record
    268f4a  tst.l $8130D2                   <- LONG, not word

**The cursor takes exactly the values 0, 4, 8, `$C`** and indexes the table at `$269246`. That independently
confirms the `$269246 + $10` window declared earlier this wave from adjacency alone: four longs is exactly what
the cursor can address. Two bounds arguments agreeing is the first time this wave a window has been checked
twice.

**It is BIDIRECTIONAL**, with two different wraps -- forward resets to 0 at `$10`, reverse resets to `$C` on
underflow. So the animation can run either way, and the reverse arm cannot be written as `(cursor - 4) & 0xC`
without checking: the ROM uses the CARRY, not a mask.

**AND `$268F4A` IS `tst.l $8130D2`, WHERE `$268EE2` WAS `tst.w $8130D2`.** A long test at `$8130D2` reads
`$8130D2..$8130D5` -- which covers `$8130D2` AND `$8130D4`, the volley pause. **So this one instruction tests
BOTH of the band's pause globals at once**, and that is why they sit adjacent.

`ram.u16(0x8130d2)` where the cartridge has `tst.l` would silently ignore `$8130D4` and keep animating through a
freeze the cartridge honours. **Read the operand SIZE on these globals, not just the address** -- the same
address is legitimately tested at two widths in one routine.

### `$1A` DOES ITS OWN TARGET SELECTION, with a per-record side preference

    268f50  subq.b #1,($22,A5) / bcc $268FC8      the fire timer
    268f5c  move.b ($23,A5),($22,A5)              and its reload
    268f62  move.b ($20,A5),D0
    268f66  cmp.b ($21,A5),D0 / bne $268FC8       <- the BURST-first idiom
    268f6e  lea $8103E6,A0                        PLAYER 1's record
    268f74  lea $810448,A1                        PLAYER 2's record
    268f7a  tst.b ($3,A5) / beq $268F82
    268f80  exg A0,A1                             <- SWAP the preference
    268f82  tst.w (A0) / bmi $268F8E              is the preferred one alive?
    268f86  tst.w (A1)

**`($20,A5)` vs `($21,A5)` is `$55`'s burst idiom at different offsets.** `$55` compares `($2E,A5)` against
`($2F,A5)` to detect the first volley of a burst; `$1A` does the identical `move.b`/`cmp.b`/`bne` on `$20`/`$21`.
Third instance of same-meaning-different-offset in this band.

**AND `$1A` INLINES TARGET SELECTION INSTEAD OF CALLING `$24270A`.** `$8103E6` and `$810448` are the two player
records (both heavily ported -- 21 and 20 code mentions, owned by `PLAYER`/`PLAYER_OBJECT`). `$24270A`
(`targetSelect`) loads `$8103E6` four times and picks a side; `$1A` loads BOTH, then uses **`($3,A5)` as a side
PREFERENCE** and `exg A0,A1` to swap which is tried first, before falling back on liveness (`tst.w (A0)/bmi`).

**RETRACTED, AND IT WAS EXACTLY BACKWARDS: `targetSelect(ram, a5)` IS THIS LOGIC.** `aim.js:260` is

    export function targetSelect(ram, a5, mut = null) {
      return targetSelectBy(ram, ram.u8(a5 + 0x03) !== 0, mut);   // $242716 tst.b ($3,A5)
    }
    function targetSelectBy(ram, swap) {
      let a0 = AIM.selP1, a1 = AIM.selP2;                // $24270A / $242710
      if (swap) { a0 = AIM.selP2; a1 = AIM.selP1; }      // $24271C exg A0,A1

**That is `$1A`'s block instruction for instruction** -- two player records loaded, `($3,A5)` tested, `exg A0,A1`
on non-zero. The port's `targetSelect` ALREADY keys on `($3,A5)`; the side preference I thought was unique to `$1A`
is the shared rule.

So `$1A` does not "inline target selection instead of calling `$24270A`" in any way that matters: **the ROM
duplicates the logic inline, and the port's function reproduces it exactly.** Calling `targetSelect(ram, a5)` is
correct and correct-by-construction.

**My warning said "write the inline form" and would have caused a duplicate port of existing code -- the precise
failure this session's tooling was built to prevent.** Seventh "already ported" of the session, and the only one
where I actively argued AGAINST reuse. The lesson is narrower than the earlier ones: **`claimed.py` on `$24270A`
would have answered this in seconds, and I never ran it, because I had already decided the code was novel.** A
conclusion reached before the check makes the check feel unnecessary.

### `$1A` is a SLEWING turret, and `($28,A5)` vs `($28,A6)` is the same offset in two structures

    268f8e  movem.w ($2,A0),D2-D3     the chosen TARGET's position, sign-extended
    268f94  movem.w ($2,A6),D0-D1     SELF, sign-extended
    268f9a  lea $272C7A,A3            the heading table, into A3 this time
    268fa0  addi.w #$B00,D0           the same $B00 bias the init used
    268fa4  addi.w #$0,D1             the same NO-OP add as $268D88 -- TWICE now
    268fa8  jsr $24203E               aim (already ported, AIM_REFS)
    268fae  move.w ($28,A5),D0        the CURRENT heading
    268fb2  jsr $242190               SLEW -- see the WARNING below: NOT slew64FromRecord
    268fb8  move.w D1,($28,A5)        the new heading
    268fbc  andi.w #$3E,D1 / add.w D1,D1
    268fc2  move.l (A3,D1.w),($24,A5) the heading long

**`aim -> current -> slew -> store` is the turret idiom**, and both halves were already ported. So `$1A` turns
TOWARD its target rather than snapping, which no other type in this band does.

**WARNING, and it would be a SILENT bug: `$1A` MUST CALL `slew64`, NOT `slew64FromRecord`.** `aim.js:392` is

    /** `$24218C` -- `$242190` with the current facing taken from `($1B,A6)`. */
    export function slew64FromRecord(ram, a6, target) { return slew64(ram.u8(a6 + 0x1b), target); }

so **`slew64FromRecord` IS `$24218C`, a DIFFERENT ROM entry point** that hard-codes the facing as `($1B,A6)`.
`$242190` is its register-argument twin -- `aim.js`'s own `slew256` docstring says so ("there is no
register-argument twin the way `$242190` is `$24218C`'s"). **`$1A` calls `$242190` and supplies the facing in D0
from `($28,A5)`** (`$268FAE move.w ($28,A5),D0`) -- a RECORD field, not the sub-record's `($1B,A6)`.

**So the call is `slew64(<facing from ($28,A5)>, target)`.** Using `slew64FromRecord` would read a different field
in a different structure and slew from whatever that byte holds, **while still producing plausible turning**, which
is what makes it dangerous.

Same class as the `$242B90`/`$242B3C` twins: two ROM entry points to one routine, differing only in where an
argument comes from, with the port modelling both. **Check WHICH entry point a caller uses, not just which
routine.**

**`$24203E` IS `aim64`, and `aim.js:62` gives its convention outright:** `aim64 CORE, self=D0/D1 target=D2/D3 -> D1`,
described at `aim.js:150` as "THE 64-DIRECTION AIM. Pure: four coordinates in, 0..63 out", with 48 call sites in
`AIM_REFS`. So `$1A`'s `$268F8E movem.w ($2,A0),D2-D3` (the chosen player) and `$268F94 movem.w ($2,A6),D0-D1`
(self) are exactly that calling convention, and the result is a 6-bit direction.

**AND A RESOLUTION SPLIT FALLS OUT OF THAT.** After the slew, `$268FBC andi.w #$3E,D1 / add.w D1,D1` masks the
heading to EVEN values `0..$3E` and doubles it, giving `0,4,8..$7C` -- thirty-two longs. So:

    the HEADING kept in ($28,A5)   is 64-step, full aim64 resolution, and the slew works at that resolution
    the SPRITE chosen from $272C7A is 32-step: `andi.w #$3E` DROPS BIT 0 of the heading

**The turret therefore aims and turns twice as finely as it draws.** A port that indexed the sprite table with the
full heading would read past the table (64 entries into a 32-entry window) and a port that slewed at 32 steps would
turn visibly coarsely. **They are different resolutions on purpose, and the `andi.w #$3E` is where they diverge.**

Also worth noting from `aim.js:51`: **"RANK DOES NOT REACH THIS FILE. `$24203E..$2420C4`..."** -- so the aim itself
is rank-independent, and `$1A`'s rank sensitivity is entirely in its two firing intervals, which is what W353 found
from the other direction.

**The index arithmetic confirms `$272C7A`'s existing window.** `andi.w #$3E` then `add.w D1,D1` yields
`0,4,8..$7C` -- thirty-two longs, `$80` bytes -- and the declared window is `$272C7A + $80`. Second window this
wave confirmed by two independent arguments.

**`($28,A5)` IS THE HEADING. `($28,A6)` IS THE ANIMATION CURSOR.** Same offset, one in the record and one in the
sub-record, both live in this one handler. That is a sharper version of the band's confusion rule: it is not only
that offsets mean different things across TYPES, but that within a single routine the same offset means two
different things depending on which base register it hangs off. **`A5` is the record, `A6` is the sub-record --
read the register, every time.** A port that hoisted a `const CURSOR = 0x28` would be wrong half the time here.

**`addi.w #$0,D1` has now appeared twice** (`$268D88` and `$268FA4`), both immediately before `jsr $24203E`. So
it is part of this type's call idiom rather than a one-off artifact -- still a no-op whose flags the `jsr`
destroys, but consistent enough that it should be transcribed rather than silently dropped.

### `$1A`'s fire arm, and THE FIRST UNPORTED CALLEE OF THIS RUN

    268fd2  cmpi.w #$1000,($2,A6) / blt $269058     an X gate
    268fda  subq.b #1,($1E,A5) / bcc $269058        the shot timer
    268fe0  move.b ($2B,A5),($1E,A5)                <- RELOADED FROM THE RANK VALUE
    268fe6  lea $272FFA,A4                          already ported (1 code mention, "delta")
    268fec  move.w ($28,A5),D1 / move.w D1,D0       the slewed heading
    268ff2  add.w D1,D1 / add.w D1,D1               D1 *= 4
    268ff6  jsr $242B90                             <- **NOT PORTED**
    268ffc  add.b D5,D1
    268ffe  andi.w #$3E,D0

**`($2B,A5)` IS THE SHOT INTERVAL AND IT IS RANK-DEPENDENT.** The init's cascade at `$268D50` set it from
`$813092`: `$4` when RANK <= 1, `$6` above. So reading that cascade pays off here -- the fire rate is the only
thing rank changes about this type, and `($2A,A5)` (`$4`/`$3`) is still unaccounted for. **This is the first
concrete consequence found for the rank values**, which the old "blocked on a trace" note never got to.

**`$242B90` IS NOT PORTED -- the first unported callee across `$55`, `$46` and `$1A`.** All three types until now
needed nothing new. It is NOT a new subsystem though: `rng.js:63` already documents it as **one of the 32 RNG
bumper sites in build B** that share the counter at `$803917`, each reading a different canned table with a
different mask. The port already models six of them (`drawByte242B3C`, `drawByte24311A`, `drawByte2431F4`,
`drawSigned242FDE`, `drawSigned242FFC`, `drawWord242EC2`).

**So the work is one more member of an existing family**: read `$242B90`'s table address and mask, add a
`drawXxx242B90` to `rng.js` beside its siblings, and check whether it is a byte, a signed byte or a word draw --
the six existing names show all three shapes exist, so that must be read rather than assumed.

`add.b D5,D1` after the call means D5 carries a caller-supplied base the RNG offsets, so **find where D5 is set
before writing this** -- it is not visible in the span read so far.

### `$242B90` READ. It is a BYTE draw returning in **D5**, table `$242BAC`, 256 entries.

    242b90  addq.b #1,$803917       bump the shared counter, as all 32 siblings do
    242b96  move.w $803916,D5       the state WORD -> D5
    242b9c  move.l A0,-(A7)         A0 saved (so it is callee-preserved, unlike $55's aim256 exit)
    242b9e  lea $242BAC,A0          the canned table, PC-relative
    242ba4  move.b (A0,D5.w),D5     a BYTE, indexed by the state, back into D5

**It returns in D5, not D0.** `drawWord242EC2` returns D0; this one overwrites D5. **That is exactly why
`$1A`'s `$268FFC add.b D5,D1` works** -- and why the earlier note that "D5 carries a caller-supplied base" was
wrong. D5 is not an input at all: `$242B90` produces it, and `$1A` adds the fresh draw to its heading. **The
prerequisite I flagged last commit does not exist.**

**The table is `$242BAC..$242CAC`, 256 bytes, bounded by ADJACENCY: `$242CAC` is the next bumper site** in
`rng.js`'s own list of 32. Fifth time this wave that adjacency has bounded a table exactly, and the cleanest --
the list of siblings is itself the bound.

`(A0,D5.w)` is a SIGNED word index, so it needs `drawWord242EC2`'s treatment (`i >= 0x8000 ? i - 0x10000 : i`),
which `rng.js` already implements for its sibling.

**AND IT NEEDS NO NEW CODE AT ALL. `$242B90` IS `$242B3C` WITH A DIFFERENT DESTINATION REGISTER.**

    $242B3C  addq.b #1,$803917 / move.w $803916,D0 / move.l A0,-(A7) / lea $242BAC,A0 / move.b (A0,D0.w),D0
    $242B90  addq.b #1,$803917 / move.w $803916,D5 / move.l A0,-(A7) / lea $242BAC,A0 / move.b (A0,D5.w),D5

**Byte-identical except D0 versus D5, and they SHARE the table at `$242BAC`.** `drawByte242B3C` is already
ported (`rng.js:321`) with exactly this logic including the signed-index treatment, and **the window already
exists** -- W61 declared `$242BAC + $100` and its comment says "`$242B3C`'s 256-byte table", which was the clue
sitting in plain sight.

So `$1A` calls `drawByte242B3C(ram, rom)` and treats the result as D5. **`$1A` needs ZERO new primitives after
all**, and `rng.js`'s claim that the 32 bumpers "each read a DIFFERENT canned table" is not strictly true --
at least this pair shares one.

**`claimed.py` reporting `$242B90` as NOT PORTED was correct but misleading**, and the miss is instructive: an
address can be unported while the ROUTINE at it is fully ported under a sibling address. **Before believing
`claimed.py`'s NOT PORTED on a small routine, disassemble it and compare against the nearest ported sibling** --
these register-variant twins will not show up any other way. That is the third time in this band that
"unported" resolved to "already there under another name".

### `$1A`'s volley: `$55`'s table and `$55`'s emit, with a RANDOMISED speed

    269012  swap D5                    the RNG byte -> the HIGH word
    269014  moveq #$0,D4
    269016  moveq #$5,D0               D0 = 5, a WORD, where $55 passes the long $FFFF0005
    269018  move.l ($2,A6),D2          the packed position
    26901c  subi.w #$24,D1             backoff $24
    269020  move.w #$6,D7              SEVEN passes (DBcc N+1)
    269024  lea $2735FA,A0             THE SAME vector table $55 uses (T55.vectorTable)
    26902a  move.w D1,D3 / addq.w #2,D3 / andi.w #$fc,D3      the identical index arithmetic
    269032  move.l (A0,D3.w),D3
    269036  add.l D5,D3                <- the swapped RNG byte AS THE SPEED BIAS
    269038  jsr $281744                THE SAME emit $55's FINALE uses

**Three exact shares with `$55`**: the vector table `$2735FA` (windowed since W30), the emit `$281744`, and the
`move.w D1,D3 / addq.w #2 / andi.w #$fc / move.l (A0,D3.w),D3` index arithmetic, byte for byte. So the two types
are the same fan machine.

**The one real difference is the speed bias, and it is the interesting part.** `$55` adds a fixed
`D5 = $02000000`. `$1A` calls `$242B90` (`drawByte242B3C`), gets a byte in D5, **`swap`s it into the high word**,
and adds that -- so **the shot speed is RANDOMISED per volley** by the shared RNG counter, in the same field
`$55` holds constant. `swap` on a byte draw is what turns `0..$FF` into `0..$FF0000`, i.e. the X-speed half of
the packed long.

**A port that reused `$55`'s fan with a `speedBias` constant would produce a uniform-speed volley** -- visually
close, mechanically wrong, and invisible in any single frame.

Also: `moveq #$5,D0` is a WORD 5 where `$55` passes the long `$FFFF0005`. Same emit, different D0 width, so the
emit must be reading only the low word -- or `$55`'s high `$FFFF` means something `$1A` omits. **Worth checking
against `$281744`'s body before writing either.**

**SEVEN SHOTS, ONE PER PASS -- not unrolled.** Exactly one `jsr $281744` in the loop body (`$269038`), and
`$269042 dbra D7 -> $26902A` with `D7 = 6`, so seven passes of one shot. `$55` unrolls three (or five) emits per
pass; `$1A` does not. **Same emit, same table, different loop shape.**

    26903e  addi.w #$C,D1           the step
    269042  dbra D7,$26902A
    269046  subq.b #1,($20,A5)      the BURST counter, exactly $55's $27270E idiom

**The seven angles are `-$24 -$18 -$0C $00 +$0C +$18 +$24`** -- backoff `$24`, step `$C`, six gaps, exactly
symmetric about the aim. Same symmetry property `$55`'s two volleys have, which is the check that the reading is
right. And `$269046` confirms `($20,A5)` is the burst counter, matching the `($20,A5)`/`($21,A5)` pair read
earlier at `$268F62`.

**`rosetta.py` MISALIGNED A THIRD TIME.** Asked for `$26903E` it printed `$269042` as its first line and
silently swallowed the step instruction -- the same failure as `$272722` and `$268EDE`. The raw bytes
`06 41 00 0c` settled it. **Three occurrences now: treat a disassembly whose first line is not the requested
address as a MISS, not an answer.** Every one of the three hid exactly one instruction that mattered.

### The burst reload is `$55`'s exactly, and the tail bias is a THIRD convention

    26904c  move.b ($21,A5),($20,A5)   burst reload   -- byte for byte $55's $272716
    269052  move.b ($1f,A5),($1e,A5)   timer reload   -- byte for byte $55's $27271C
    269058  jsr $23D762                EMIT_STUB, already ported (9 code mentions, owned by T01/TYPE84_ART)
    26905e  move.l ($2,A6),D1
    269062  addi.w #-$400,D1           the LOW word (Y)
    269066  swap D1
    269068  addi.w #$500,D1            the HIGH word (X)
    26906c  swap D1                    swapped back
    26906e  move.l ($24,A5),D2         the heading long the slew wrote
    269072  move.w #$620,D3

**`$26904C`/`$269052` are `$55`'s dual reload verbatim** -- both the burst counter and the shot timer restored
from their paired reload bytes, at different offsets. That is the fourth same-idiom-different-offset instance and
it settles that the burst mechanism is shared across the pair, not coincidental.

**THE BIAS IS TWO INDEPENDENT WORD ADDS WITH `swap` BETWEEN THEM, AND THAT IS NOT A PACKED LONG.**

    $55  tail   addi.l ($4,A0),D1              a packed long from a table -- BORROW rule applies
    $46  tail   addi.l #$F000F000,D1           a packed long literal     -- BORROW rule applies
    $1A  tail   addi.w #-$400 / swap / addi.w #$500 / swap    -- NO borrow between halves

**A port that "simplified" `$1A`'s form into `addi.l #$0500FC00,D1` would introduce a borrow the cartridge never
performs.** `-$400` on the low half cannot carry into the high half here, because the halves are added while
swapped apart. So the packed-long borrow rule that these notes have carried for many waves has an **inverse
trap**: it applies to `addi.l` on a packed pair, and must NOT be applied to `swap`-separated word adds that
compute the same-looking result. Read which form the cartridge uses.

`$23D762` is `EMIT_STUB`, already ported -- the third distinct emit in this band after `$23DECE` (`FRAME_EMIT`,
`$46`) and `$23DF86` (`$55`). **So three sibling types use three different emit stubs**, which is one more thing
not to carry across.

### The tail's end, a no-op `jsr`, and a FOURTH misalignment

    26907a  jsr $23DECE              FRAME_EMIT -- so $1A uses BOTH $23D762 AND $23DECE
    269080  movea.l A6,A0            A0 = the sub-record
    269082  jsr $26331C              <- A BARE `rts`. Does nothing.
    269088  tst.l $8130D2 / beq $269092    the DUAL pause again, long again
    269090  rts
    269092  cmpi.w #$1000,($2,A6) / blt $269090
    26909a  tst.b ($30,A5) / bne $2690F6

**`$26331C` IS A SINGLE `rts`.** `claimed.py` calls it UNCLAIMED, which is right and means nothing to port: the
`jsr` is a no-op. `$26331E`, two bytes later, is `lea $81332C,A0` -- the enemy-array clear belonging to a
different routine -- so `$26331C` is a deliberate stub entry, presumably a disabled hook. **Fourth dead
construct in this band**, after `$27250C`'s `#$1`, `$2723B2`'s dead pointer store, and `$268D88`'s no-op add.
Transcribe it as a comment; do not go looking for what it "should" do.

**Correction to the previous entry: `$1A` uses TWO emits, not one.** `$23D762` (`EMIT_STUB`) at `$269058` and
`$23DECE` (`FRAME_EMIT`) at `$26907A`. So the band's emit picture is: `$55` uses `$23DF86`, `$46` uses `$23DECE`,
`$1A` uses BOTH `$23D762` and `$23DECE`. Three types, three stubs, and one type calling two of them.

**And `rosetta.py` misaligned a FOURTH time** at `$26907C`, printing `ori.b #$CE,-(A3)` and hiding
`jsr $23DECE`. Same fix, same two-byte back-up. The rule is now beyond doubt.

**The alive path does not end at `$269090`.** `tst.l $8130D2 / beq $269092` means NOT-paused falls through to a
SECOND section at `$269092` with its own X gate and a `($30,A5)` test -- so the handler has more structure after
the draw, which is unlike `$55` and `$46` where the tail is terminal.

### BOTH rank values are now accounted for -- `$1A` has a SECOND firing arm

    2690a2  subq.b #1,($2E,A5) / bcc $26915E    a THIRD countdown, separate from ($1E) and ($22)
    2690aa  move.b ($2A,A5),($2E,A5)            <- RELOADED FROM THE OTHER RANK VALUE
    2690b0  move.b ($31,A5),($30,A5)            a second reload pair
    2690b6  move.b #$80,($32,A5)
    2690bc  move.b #$80,($33,A5)                TWO byte writes, not one move.w #$8080
    2690c2  movem.w ($2,A6),D0-D1
    2690c8  addi.w #-$600,D0                    the same -$600 bias $55's aim uses

**The init's rank cascade is now fully consumed**, which the old "blocked on a trace" note never reached:

    ($2A,A5) = $4 low rank / $3 high    -> reloads ($2E,A5), the SECOND arm's timer   ($2690AA)
    ($2B,A5) = $4 low rank / $6 high    -> reloads ($1E,A5), the FIRST arm's timer    ($268FE0)

So rank changes **both** firing intervals, in opposite directions: the high-rank values are `$3` (faster) for the
second arm and `$6` (slower) for the first. **That asymmetry is the whole point of the cascade** and it would be
invisible to anyone who read only one arm. Two commits ago I recorded `($2A,A5)` as "still unaccounted for"; this
closes it.

**`($30,A5)` is a countdown with `($31,A5)` as its reload**, so the `tst.b ($30,A5) / bne $2690F6` gate at
`$26909A` is testing a live timer, not the invulnerability field it is in `$55`. **Fifth same-offset-different-
meaning instance** -- `$55`'s `($30,A5)` is its invulnerability counter, seeded to `$10` by its prototype.

**`move.b #$80,($32,A5)` then `move.b #$80,($33,A5)` are two byte writes where one `move.w #$8080` would do.**
Same resulting memory, so this one is safe either way -- but it is the explicit inverse of the word-literal trap:
there the cartridge writes a word and a port must see two fields; here it writes two bytes and they really are
two fields. **The cartridge's chosen width is the documentation.**

### The second arm is TWO MUZZLES, and it uses a DIFFERENT target-selection route

    2690c2  movem.w ($2,A6),D0-D1
    2690c8  addi.w #-$600,D0 / addi.w #$680,D1     muzzle 1: X-$600, Y+$680
    2690d0  jsr $24226E                            aim256, the SELF-SELECTING entry
    2690d6  bcs $2690F6                            no target -> skip BOTH stores
    2690da  move.b D1,($32,A5)                     aim 1
    2690de  movem.w ($2,A6),D0-D1                  position RELOADED
    2690e4  addi.w #-$600,D0 / addi.w #-$680,D1    muzzle 2: X-$600, Y-$680  (sign flipped)
    2690ec  jsr $24226E
    2690f2  move.b D1,($33,A5)                     aim 2

**`($32,A5)` and `($33,A5)` are two independent muzzle headings**, aimed from points `±$680` in Y off the
record's own position with a shared `X-$600` offset. That is what the `move.b #$80` pair at `$2690B6`/`$2690BC`
was pre-seeding: **`$80` is the no-target fallback**, the same fallback constant `$55` uses at its carry exit.
And `bcs` fires on the FIRST aim only, so a missing target leaves BOTH muzzles at `$80` rather than aiming one.

**`$1A` USES TWO DIFFERENT TARGET-SELECTION ROUTES IN ONE HANDLER.** Arm 1 at `$268F6E` selects inline --
`lea $8103E6,A0 / lea $810448,A1 / tst.b ($3,A5) / exg A0,A1` -- honouring a per-record side preference. Arm 2
here calls `$24226E`, which does its own `bsr $24270A` selection by the shared rule and ignores `($3,A5)`
entirely. **So the two arms can legitimately target different players in the same frame.** Anything that
"unified" them would be wrong, in whichever direction it unified.

**And `rosetta.py` misaligned a FIFTH time** at `$2690CE`, where the true boundary is `$2690CC` -- it rendered
`addi.w #$680,D1` plus a `jsr` as `addi.l #$4EB90024,D0` and four lines of garbage. Five occurrences across three
types. **Always pass an address you have arrived at by adding up instruction lengths, and reject any output whose
first line differs.**

### The muzzle-fire arm calls `$242B3C` -- so `$1A` USES BOTH RNG TWINS

    2690fa  bcc $26915E
    2690fc  move.b ($2A,A5),($2E,A5)      the rank-dependent reload again
    269102  moveq #$0,D1 / move.b ($32,A5),D1    muzzle 1's aim, zero-extended
    269108  jsr $242B3C                   <- the D0 twin, ALREADY PORTED as drawByte242B3C
    26910e  asr.b #2,D0                   ARITHMETIC shift: the draw is treated as SIGNED
    269110  add.b D0,D1                   jitter the aim by draw/4
    269112  move.l #$20016,D0             the bullet kind/speed pair
    269118  move.l ($2,A6),D2             position
    26911c  move.l #$FA000680,D3          a packed long: $FA00 / $0680

**This closes the loop on the twin finding.** `$1A` calls `$242B90` at `$268FF6` (draw into D5, added to the fan's
speed bias) AND `$242B3C` here (draw into D0, shifted and added to a muzzle aim). **Both register variants of the
same table, in one handler, for two different purposes.** So the ROM's two entry points are not redundancy -- they
exist precisely so a caller can have the draw land in D0 or D5 without shuffling registers. `drawByte242B3C`
serves both; only the destination differs.

**`asr.b #2,D0` is an ARITHMETIC shift, so the draw is signed here.** The jitter is therefore `-32..+31`, centred
-- not `0..63`. A port using `>>> 2` on an unsigned byte would bias every muzzle shot to one side. **The table is
the same one `drawByte242B3C` already reads; what differs is how this caller interprets the byte.**

`move.l #$FA000680,D3` is a packed long with a POSITIVE low half (`$0680`), so the borrow rule does not bite here
-- unlike `$46`'s `$F000F000` where both halves are negative.

**And a SIXTH misalignment**: asked for `$2690F6`, `rosetta.py` returned `$2690FA` as its first line, hiding the
`subq.b` that the `bcc` depends on. Six occurrences.

### The two muzzle shots, and a TEXTBOOK demonstration of the packed-long borrow rule

    muzzle 1  D1 = ($32,A5) + asr.b #2 of a $242B3C draw
              D0 = $20016   D2 = ($2,A6)   D3 = $FA000680   D4 = 0   jsr $281708
    muzzle 2  D1 = ($33,A5) + asr.b #2 of a fresh draw
              D0 = $20016   D2 = ($2,A6)   D3 = $F9FFF980            jsr $281708

**`$281708` is already ported** -- 33 mentions, 23 in code, and `boss2attacks.js:231` already selects between it
and `$2816F6` by shot index. **So it is the third member of the emit family and `$1A` needs nothing new for it.**

**THE TWO D3 VALUES LOOK LIKE DIFFERENT X BIASES AND ARE THE SAME ONE.** Apply the borrow rule
(`long = ((Xbias<<16)|Ybias) - $10000 if Ybias < 0`):

    $FA000680  ->  Ybias $0680 POSITIVE, no borrow   ->  Xbias $FA00, Ybias +$680
    $F9FFF980  ->  Ybias $F980 NEGATIVE, borrow      ->  Xbias $F9FF + 1 = $FA00, Ybias -$680

**Both muzzles share Xbias `$FA00` and take Ybias `+$680` / `-$680`** -- exactly the `±$680` the two aims were
computed from at `$2690C8`/`$2690E4`. **The symmetry is the proof the borrow rule is being applied correctly**, and
it is the cleanest demonstration of that rule anywhere in these notes: a port that read `$F9FF` literally would
place the second muzzle one pixel-unit off in X and never notice, while the correct reading makes the pair exactly
symmetric.

So `$1A`'s second arm is a symmetric twin-muzzle burst, each shot aimed independently at (possibly) different
players, each jittered by its own signed RNG draw, fired through `$281708`.

### `$1A`'s HANDLER IS READ END TO END: `$268E6C..$26915E`

    26914a  moveq #$0,D4 / jsr $281708      muzzle 2's emit
    269152  subq.b #1,($30,A5) / bcc $26915E
    269158  move.b ($2F,A5),($2E,A5)        <- a THIRD reload source for ($2E,A5)
    26915e  rts                             the handler ENDS here

**`($2E,A5)` HAS TWO DIFFERENT RELOAD VALUES DEPENDING ON WHICH PATH RELOADS IT.** `$2690AA` and `$2690FC` both
reload it from `($2A,A5)`, the rank value; `$269158` reloads it from `($2F,A5)` when the `($30,A5)` counter
expires. **So the second arm is a burst-within-a-burst**: `($2E,A5)` paces individual twin-muzzle volleys at the
rank interval, `($30,A5)` counts volleys, and when it runs out `($2F,A5)` sets a different (presumably longer)
gap before the next group. A port that treated `($2E,A5)` as having one reload would collapse the grouping.

**That is the sixth distinct countdown in this one handler**: `($1E)`/`($1F)` the fan timer, `($22)`/`($23)` the
fan gate, `($26,A6)`/`($27,A6)` the sub-record animation timer, `($1A)`/`($1B)`... and `($2E)` with TWO reloads
plus `($30)`/`($31)`. **Read every reload site, not the first one.**

### The death arm at `$269160`

    269160  move.l #$350,D0        killScore $350
    269166  jsr $28615E            scoreKill, already ported
    26916c  jsr $28C2DC            the death cue -- the SAME cue $49 and $55 use

So `$1A` shares its death cue with `$49` and `$55` and differs only in the score (`$350` against `$55`'s `$113`).

**HANDLER COMPLETE.** `$268E6C..$26915E` read in full: the two-word-add bounds test, the `$5C` damage arm with
its `$19` sentinel palette, the `$8130D2` pause at two widths, the square-wave wobble, the bidirectional
animation cursor, the inline target selection with its side preference, the slewing turret, the seven-shot
symmetric fan with RNG speed, and the twin-muzzle burst with its borrow-rule-symmetric biases.

### The death arm has a RANK-4-ONLY, clock-gated extra behaviour

    269160  move.l #$350,D0 / jsr $28615E       killScore $350
    26916c  jsr $28C2DC                         the shared cue
    269172  moveq #$C,D0 / move.w #$0,D1
    269178  move.l #$F8000000,D2
    26917e  jsr $289B22                         burstBucket -- already ported, owned by T1B/death1B/death84
    269184  cmpi.w #$4,$813092 / bne $2691A8    <- RANK EXACTLY 4
    269190  cmpi.w #$2B0,$8130CE / bcc $2691A8  <- and spawn clock BELOW $2B0

**`$289B22` is already ported** (`burstBucket`, used by `death1B` and `death84`), so the ordinary death effect
needs nothing new.

**But there is a behaviour that only exists at RANK 4 and only before clock `$2B0`.** `cmpi.w #$4` with `bne` is an
EQUALITY test, so it is rank 4 exactly -- not "rank 4 or above". Combined with the clock gate, this is content
almost nobody sees: **maximum rank, early in the stage.**

**Two consequences worth stating.** First, **this is unreachable in most playtests**, so a port that gets it wrong
will pass every casual check -- it belongs in a test, not a playtest. Second, `$1A` now uses `$813092` (RANK) in
**two** places with **two different comparisons**: `cmpi.w #$1 / bls` in the init (a threshold, selecting the
timer values) and `cmpi.w #$4 / bne` here (an equality, gating a death effect). **Same global, same type, two
comparison kinds** -- which is the operand-level version of the lesson `$8130D2` taught at two widths.

**The rank-4 extra is a MIRRORED burst.** That is all it is, and it is elegant:

    26917e  move.l #$F8000000,D2 / jsr $289B22     the standard burst: X bias $F800, NEGATIVE
    26919c  move.l #$08000000,D2 / jsr $289B22     the rank-4 extra:   X bias $0800, POSITIVE

**Same routine, same Y (`$0000`), X bias negated.** So at rank 4 before clock `$2B0` the death burst is thrown in
BOTH directions instead of one. Nothing new to port -- it is a second call to `burstBucket` with one constant
changed.

Note both D2 values have a ZERO low half, so the borrow rule does not apply to either -- unlike the twin-muzzle
biases where it was decisive. **Third distinct borrow situation in this one type**: `swap`-separated word adds (no
borrow possible), a negative low half (borrow applies), and a zero low half (borrow moot).

### The shared continuation at `$2691A8`

    2691a8  moveq #$D,D0 / jsr $289004          spawnEffect, already ported (13 code mentions)
    2691b0  move.l ($2,A6),($2,A0)              the position into the new effect record
    2691b6  move.w #$10,($1e,A0)
    2691bc  move.w #$0,($12,A0)
    2691c2  move.w #$0,($14,A0)

`$289004` is `spawnEffect`, already ported and used by `death1B` among others, so **the whole death arm needs no
new primitive** -- consistent with every other type in this band.

### The death arm spawns TWO effect kinds, set up almost identically

    2691a8  moveq #$D,D0 / jsr $289004      effect kind $D
    2691b0  move.l ($2,A6),($2,A0)          the record's position
    2691b6  move.w #$10,($1e,A0)
    2691bc  move.w #$0,($12,A0) / move.w #$0,($14,A0)
    2691c8  move.w #$400,($26,A0)           <- only the $D effect gets these three
    2691ce  move.w #$0,($28,A0)
    2691d4  move.w #$1,($10,A0)
    2691da  moveq #$5,D0 / jsr $289004      effect kind $5
    2691e2  move.l ($2,A6),($2,A0)          the SAME position
    2691e8  move.w #$10,($1e,A0)            the SAME $10
    2691ee  move.w #$0,($12,A0)

**Two `spawnEffect` calls, kinds `$D` and `$5`, both at the record's own position with `($1E,A0) = $10`.** The
first also gets `($26,A0) = $400`, `($28,A0) = 0` and `($10,A0) = 1`; the second's tail is not yet fully read.

**The near-identical setup is the hazard here.** Eleven of the two blocks' instructions match, and the differences
are the kind byte and three fields on the first. **A port that factored these into one helper called twice would
have to get the "extra three fields only on the first" right**, and the symmetry actively invites collapsing them.
Write them out, or parameterise explicitly.

**THREE effect spawns, not two, and the death arm ENDS at `$26925C`.** Counted from the bytes rather than read
span by span:

    2691aa  kind $D    ($26,A0)=$400   ($28,A0)=0      ($10,A0)=1   ($12/$14,A0)=0/0
    2691dc  kind $5     ...            ...             ...          ($12,A0)=0
    26920e  kind $5    ($26,A0)=$F800  ($28,A0)=$600   ($10,A0)=1   ($14,A0)=$400
    26925c  rts

**Correction to the previous entry:** I wrote that both `$5` effects were set up near-identically. They are not --
the second gets `($14,A0) = $400`, `($26,A0) = $F800` and `($28,A0) = $600`, where the first cleared `($12,A0)`.
So the three spawns are a `$D` plus **two `$5`s with different velocity vectors**: a debris spray, not a repeat.

**That is the same trap I had just finished warning about, and I walked into it one commit later.** The blocks look
alike for eleven instructions and then diverge in the fields that carry the motion. **Counting the call sites first
(`jsr $289004` appears exactly three times between `$269160` and the `rts` at `$26925C`) would have given the shape
in one command instead of three reads and a retraction** -- the same move that settled `$55`'s fan (three emits) and
`$1A`'s (one).

**`$1A` IS NOW READ END TO END: init `$268D1E..$268DD2`, tables, handler `$268E6C..$26915E`, death arm
`$269160..$26925C`.** Fourteen callees, every one already ported. Two windows declared (445 -> 447).

Still to read: `$26921A..$26925C`, the third spawn's field tail.

## TYPE $46 (W352, IN PROGRESS) -- 13 records, the largest remaining piece of stage 5

Unblocked by `$55`. Type table `$267824 + $46*8 = $267A54`: init `$27102C`, body `$271034` (the `+8` rule
again), handler `$2710E2`. `claimed.py`: the handler and `$271024` unclaimed, the init NOT PORTED (one
comment mention only), and **`$271034` is NOT in `initbody.js`** -- so both a body registration and a
handler are needed.

**Bounded on both sides without a guess.** W316's note already records that `$45`'s sprite window
`$27100C+$20` ends exactly at `$27102C`, `$46`'s init. And the prototypes end where the handler starts.

    27102c  move.w #$0,($4,A5) / rts        the init proper: ONE sub-record
    271034  lea $2710C6,A0 / jsr $2637A2    loadSubProto      <- sub prototype $2710C6
    271040  lea $2710B8,A0 / moveq #$6,D0 / jsr $26377A       <- record prototype, D0+1 = SEVEN words
    27104e  jsr $263808                     already ported, 25 code mentions
    271054  move.w $8130CE,($22,A5)         the spawn clock, STORED into the record

**Window declared W352: `$2710B8 + $2E`, 443 -> 444.** The four-byte handler overlap is exactly what the
family depth formula predicts: `1 * $20 - ($2710E2 - $2710C6) = $20 - $1C = 4`.

### The init hard-codes the FIVE script frames this type spawns at

A fall-through cascade of spawn-clock equality tests, each `bne` skipping only its own store:

    $8130CE == $E6   -> ($18,A5) = $60      $27105C
    $8130CE == $E4   -> ($18,A5) = $F0      $27106E
    $8130CE == $108  -> ($18,A5) = $40      $271080
    $8130CE == $106  -> ($18,A5) = $F0      $271092
    $8130CE == $116  -> ($18,A5) = $80      $2710A4
    (no match)       -> whatever the record prototype set

Same idiom as `$49`'s single `$8130CE == $1F3` direction pick, but five-way. Two frames (`$E4`, `$106`)
select the same `$F0`, so it is four distinct values over five frames.

**THIS IS A FREE CROSS-CHECK AND IT SHOULD BE A TEST.** The cartridge is naming the exact script frames at
which `$46` spawns. The port already has stage 5's spawn script, so those five clock values must appear in
it as `$46` spawns -- and any `$46` spawn at another frame must be one that takes the prototype default.
That pins the init against the script from two independent directions. **Write that before the handler**:
it is cheap, and if it fails the reading of the cascade is wrong.

### The record prototype settles `($18,A5)`: it IS the palette base, and the default is `$20`

`enemyproto.js:50` records that `$26377A` copies `D0+1` words to **`($16,A5)`**, not to `($0,A5)` -- so a
seven-word prototype covers `$16..$23`, and `($18,A5)` sits inside it as word 1's high byte. (I nearly
recorded the opposite: counting 14 bytes from `$0` puts `$18` outside the prototype, which would have made
the eight defaulted records take allocator leftovers instead of a real value.)

    $2710B8  word 0 -> ($16,A5)/($17,A5) = 00 00
             word 1 -> ($18,A5)/($19,A5) = 20 10     <- palette BASE $20, palette XOR $10
             word 2 -> ($1A,A5)/($1B,A5) = 02 02     <- a timer and its reload, both 2
             words 3-6 -> ($1C..$23,A5)  = all zero

**RETRACTED, BY THE HANDLER ITSELF: `($18,A5)` IS NOT `$46`'s PALETTE BASE. IT IS A COUNTDOWN.**

I concluded "palette base" because `($19,A5)` held `$10` and, in `$49`/`$4B`/`$55`, base-beside-XOR at
`$18`/`$19` is the palette pair. **That was a pattern match, not evidence, and `$27115A` settles it:**

    27115a  subq.b #1,($18,A5) / bcc $27117A      it is DECREMENTED -- a timer, not a colour
    271162  jsr $242EC2                           the RNG (already ported: RNG_242EC2, 5 code mentions)
    271168  andi.w #$3F,D0 / addi.w #$20,D0       reload = RNG & $3F + $20, so $20..$5F
    271170  move.b D0,($18,A5)
    271174  move.b #$1,($17,A5)                   and promote to mode 1

So the init's five-frame cascade sets a per-spawn-frame **initial DELAY**, not a palette: `$60` at clock
`$E6`, `$F0` at `$E4` and `$106`, `$40` at `$108`, `$80` at `$116`, and the prototype's `$20` for the other
eight. **Note `$20` is exactly the FLOOR of the random reload range** -- the eight default records start with
the shortest possible wait and every subsequent wait is drawn from `$20..$5F`, which is a coherent story the
palette reading never had.

`($1A,A5)`/`($1B,A5)` = `02 02` still stands as the word-literal-is-two-byte-fields rule, and `($17,A5)`
defaulting to 0 still matches the family's mode byte. **What does not transfer is the field MEANING**: this
family shares record OFFSETS across types but not their purposes, and `$18`/`$19` adjacency is not a
signature. **Confirm every offset's role from an instruction that reads or writes it, never from a sibling.**

### `$46`'s mode-0 arm is a POSITION-BOX trigger

    271120  cmpi.b #$0,($17,A5) / bne $27117A     mode 0 only
    27112a  tst.b ($16,A5) / beq $27117A          must have been on screen
    271132  cmpi.w #$7000,($2,A6) / bge           X <  $7000
    27113c  cmpi.w #$5000,($2,A6) / ble           X >  $5000
    271146  cmpi.w #$0,($4,A6) / ble              Y >  $0
    271150  cmpi.w #$3800,($4,A6) / bge           Y <  $3800
    27115a  ...the countdown above, then mode 1

Six guards, all branching to the same `$27117A`, so it is the same fall-through shape as `$55`'s cascade.
The record must be inside the box `X in ($5000,$7000)`, `Y in ($0,$3800)` AND have been on screen before its
timer runs.

**And the handler's own bounds test is a SIGNED LONG, the mirror image of `$55`'s trap:**

    2710e4  move.w ($2,A6),D0 / ext.l D0          sign-extend to long
    2710ea  addi.l #$4000,D0
    2710f0  cmpi.l #$2000,D0 / bgt $27110A

`$55` had two word adds that must NOT be folded; `$46` has one long operation that must NOT be split into
word steps. Same family, opposite hazard, and both look interchangeable in JS.

### `$46`'s mode 1 is a LATCHED ramp, and mode 2 IS THE `$55` SPAWN

    27117a  cmpi.b #$1,($17,A5) / bne $2711D4
    271184  tst.w ($1c,A5) / bne $271196          <- the LATCH: skip the X gate once started
    27118c  cmpi.w #$3C00,($2,A6) / ble $2711D4      first step only: X > $3C00
    271196  subq.b #1,($1a,A5) / bcc $2711D4         the prototype's 02/02 timer
    27119e  move.b ($1b,A5),($1a,A5)
    2711a4  addq.w #4,($1c,A5)                       ramp by 4
    2711a8  cmpi.w #$1C,($1c,A5) / blt $2711D4
    2711b2  move.w #$1C,($1c,A5)                     CLAMP at $1C -- so SEVEN steps of 4
    2711b8  move.b #$2,($17,A5)                      promote to mode 2
    2711be  move.w #$28,($1e,A5)                     <- SEE BELOW
    2711c4  jsr $242EC2 / andi.w #$3,D0 / addq.w #2,D0 / move.w D0,($20,A5)   a COUNT of 2..5

**The latch is the point of `tst.w ($1c,A5)`**: the `X > $3C00` gate applies only while the ramp is still at
zero, so the ramp STARTS past that X but then continues regardless of where the record drifts. A port that
checks X every frame stalls the ramp whenever the record moves back.

**`move.w #$28,($1e,A5)` IS THE WORD-LITERAL TRAP, LIVE.** It writes TWO byte fields: `($1E,A5) = $00` and
`($1F,A5) = $28`. Then `$2711DE subq.b #1,($1E,A5)` borrows immediately (0 - 1), so `bcc` is NOT taken and
the arm **fires on its very first frame**, after which `$2711E6 move.b ($1F,A5),($1E,A5)` reloads it to
`$28`. So this one instruction means "fire now, then every `$29` frames". **Writing `setU8(a5+0x1e, 0x28)`
because "the timer is `$28`" inverts that: it would wait `$29` frames before the first shot.**

### Mode 2 spawns `$55` -- the edge, from the code

    2711ec  moveq #$55,D0
    2711ee  jsr $263684              the spawn (already ported, though only 1 code mention -- check it)
    2711f4  move.l ($2,A6),($16,A0)  the parent's packed position into the CHILD
    2711fa  move.l A5,($1a,A0)       and a BACK-POINTER to the parent record
    2711fe  move.b #$4,($17,A5)      promote to mode FOUR, not 3
    271204  move.b #$40,($1a,A5)     and set ($1A,A5) to $40

So the `$46` -> `$55` edge that `w314stage5scope.test.js` pins is now confirmed from the instruction, not
just from the scan. **Mode 2 jumps to mode 4 and `$27120A` immediately tests for mode 3**, so mode 3's arm is
skipped on the promoting frame and must be entered by some other path -- find it before writing the cascade.

**RESOLVED, AND THE ALARM WAS MINE: A0 IS A DEFERRED-SPAWN QUEUE ENTRY, NOT THE CHILD'S RECORD.** I flagged
`move.l A5,($1a,A0)` as possibly clobbering `$55`'s drift timer at `$1C`/`$1D`. It does not clobber anything:
`$263684` is **already documented in this very file's source** at `handlers.js:2004` as
`enqueueDeferred(ram, type, DEFQ_D1.FIXED00)`, and `spawn.js:429` shows it returns a queue entry at
`$815EAA + count`, stride `$50`. So:

    2711ee  jsr $263684                 enqueueDeferred(ram, 0x55, DEFQ_D1.FIXED00)
    2711f4  move.l ($2,A6),($16,A0)     queue entry +$16 = the spawn POSITION
    2711fa  move.l A5,($1a,A0)          queue entry +$1A = the parent record pointer

**`boss2.js:1071` already does exactly this shape** -- `enqueueDeferred(...)` then `ram.setU32(q.addr + 0x16, ...)`.
`$263678` is the same routine with `DEFQ_D1.FIXED80` (`handlers.js:3171`), which is what makes three distinct
`jsr` targets in `w314stage5scope.test.js`'s scanner.

**The lesson, and it is the same one as `($18,A5)`:** I read `($16,A0)`/`($1A,A0)` as record offsets because
`$55`'s prototype loads at `($16,A5)` and the numbers matched. Matching offsets across two different
STRUCTURES is not evidence they are the same structure. The register said which structure it was, and the
port already had the answer written down twice.

So `handler46`'s spawn is three lines of existing API, and nothing about `$55` needs revisiting.

### `$46` READ END TO END. Mode 3 is a REVERSE ramp, and nothing entered it.

    mode 0  $271120  position box X($5000,$7000) Y($0,$3800) + on-screen, then a random
                     $20..$5F countdown, then -> mode 1
    mode 1  $27117A  LATCHED ramp: ($1C,A5) += 4 to a $1C clamp, X > $3C00 gating only the
                     first step, then -> mode 2 with ($1E/$1F,A5) = 00/$28 and ($20,A5) = RNG 2..5
    mode 2  $2711D4  enqueueDeferred($55, FIXED00) + position + parent pointer, then -> mode FOUR
    mode 3  $27120A  the REVERSE ramp: ($1C,A5) -= 4 down to a 0 clamp, then -> mode 4
    mode 4           NO ARM -- the cascade tests 0,1,2,3 only, so mode 4 falls straight to the tail
    tail    $27123C  lea ($26,PC),A0 / adda.w ($1C,A5),A0 / move.l (A0),D2, then
                     move.l ($2,A6),D1 / addi.l #$F000F000,D1 (the packed-long BORROW rule),
                     move.w #$1080,D3, D4 = ($1D,A6) zero-extended, jsr $23DECE, rts

**`$23DECE` is `FRAME_EMIT`** -- 80 mentions, 70 in code, already owned by `T43 T45 T47 T48 T49 T4A T4B`. So
it is the band's standard sprite emit and `$46` uses it unchanged. **That is the NINTH callee `$46` needs and
the ninth already ported** -- like `$55`, this type introduces no new primitive.

**Window declared W352: `$271264 + $20`, 444 -> 445**, bounded by CODE rather than a guess (`$271284` is
`3b7c 0001`, a `move.w #$1`).

**THE OPEN QUESTION, and it is a good one: NOTHING SETS MODE 3.** Mode 0 goes to 1, mode 1 to 2, mode 2 to 4,
mode 3 to 4. No arm in `$46` writes `#$3` to `($17,A5)`. So mode 3 -- the retract -- is either dead code or
**written from outside the record**, and there is an obvious candidate: `$2711FA move.l A5,($1a,A0)` hands the
child a pointer to this exact record. **Hypothesis, UNVERIFIED: `$55` tells its parent to retract by writing
`3` through that back-pointer.** That would make the pair a single mechanism -- `$46` extends, spawns `$55`,
and retracts when the child says so.

**SETTLED: `$46`'s MODE 3 IS UNREACHABLE DEAD CODE, and the chain that proves it also VALIDATES `T55`.**

The drain (`spawn.js:476`) copies queue `+$1A` to record `+$1A` and only THEN runs `initDispatch`
(`$2634E4`). So `$55`'s init sees the parent pointer. And it does read it:

    27239e  jsr $2637A2                loadSubProto
    2723a4  move.l ($16,A5),D0         the QUEUED POSITION $46 wrote
    2723a8  addi.l #$2000000,D0
    2723ae  move.l D0,($2,A6)          -> the sub-record position
    2723b2  move.l ($1a,A5),($30,A5)   the parent pointer, moved to ($30,A5)
    2723b8  lea $2723EA,A0 / moveq #$E,D0 / jsr $26377A    THEN the 15-word prototype load

**But the prototype load covers `($16,A5)..($33,A5)`, and its word 13 is `00 10`.** So `($30,A5)` is
overwritten with `$0010` fourteen bytes after the parent pointer was stored there. **`$2723B2` is a DEAD
STORE** -- the second one this pair has produced, after `$27250C`'s `#$1`.

Three consequences:

1. **`$55` cannot signal its parent.** The pointer is destroyed before the handler ever runs, so the
   hypothesis is dead and **nothing anywhere writes `3` to `$46`'s `($17,A5)`. Mode 3 is unreachable.**
   `handler46` should mark that arm `unreached()`, NOT implement a promotion into it -- implementing one
   would invent a transition the cartridge cannot make.
2. **`T55`'s `invulnAt: 0x30` IS CORRECT and `handler55` as shipped is right.** I raised this as a possible
   defect in shipped code; it is not. `($30,A5)` really is an invulnerability counter, and the prototype
   really does seed it to `$10`.
3. **The prototype independently confirms every remaining `T55` field**, which is the check I never had:

       ($17,A5) = 00        mode 0, so $55 spawns into arm A
       ($18/$19) = 15 0a    palette base $15, XOR $0A
       ($1C/$1D) = 03 03    drift timer and reload
       ($26/$27) = 00 08    fire timer 0, reload 8 -- fires immediately, then every 9
       ($2E/$2F) = 01 01    burst counter 1, reload 1 -- so counter == reload on the first volley
                            (it re-aims) and reaches 0 on the next (the finale fires)
       ($30,A5)  = 00 10    the invulnerability window, $10 frames

   **That `($2E,A5)` = `($2F,A5)` = 1 is the nicest confirmation:** it means every burst is exactly two
   volleys, an aimed 15-shot followed by the 20-shot finale, which is what the burst-counter reading
   predicts and would be nonsense under the "pattern selector" reading I first had.

### W351: `handler55` WAS WRITTEN AND THEN REVERTED. Read this before writing it again.

The full handler was written against `T55` (~150 lines: prologue, `$5C` arm, pause, back-out, bounds, the
four-test cascade, `fire55`, `tail55`) and registered at `$272424`. **It was reverted, and the reasons are
worth more than the code was:**

1. **Four census pins failed**, exactly as designed -- `W223 type $41`, the `handlerMap()` adapter cover,
   `W217 reusable coverage`, and `W317`'s thirteen-spawn count. These have hard-coded totals so that adding
   a handler cannot pass silently. **Bumping them is mechanical BUT must be done from the new true counts,
   not by making the assertion match.**
2. **One piece of the fan loop was DERIVED, not read.** The ROM steps the angle after each emit and then
   adds `$10` between clusters; expressing that as a nested loop needs the inter-cluster add to compensate
   for the trailing per-shot step. I wrote `d1 + interCluster - step` to do that. **That compensation is
   arithmetic I reasoned out, not an instruction I saw.** The safe form is to UNROLL the three (and five)
   emits literally as the ROM does, with the exact `addq.b` after each, rather than a loop plus a fix-up.
3. **There was no test for `handler55`.** Landing a ~150-line handler whose only validation is that four
   unrelated pins still pass is how W328's four `ram`-instead-of-`rom` descriptor reads survived for
   thirteen waves, and how the `tallyPhase0Arm25DC2C` dead code passed five green checks.

`T55` remains committed and `ported: false` remains set, so the suite still pins the unwritten set. Suite
back to 2438/2438 after the revert.

**What the next pass needs, in order:**

1. **Unroll both volleys -- ALREADY DONE.** `T55.volleyOrdinary.angles` (15) and `T55.volleyFinale.angles`
   (20) hold the literal offsets, and `tests/w351volleyangles.test.js` rebuilds both from the cartridge's
   instruction stream every run and checks each is symmetric about the aim. **Index those lists; do not
   re-derive a loop** -- that fix-up arithmetic is what got the first attempt reverted.
2. **Write `handler55`** against `T55`, then delete its `ported: false`.
3. **Write a focused test** driving one record through mode 0 -> 2 -> 3, asserting the burst reload at
   `$27270E` and the 15-then-20 shot counts.
4. **Bump the four census pins.** LOCATED, with current values, so nobody rediscovers them off a red suite:

       tests/integration.test.js:266      assert.equal(m.size, 77, ...)   -> 78
       tests/handlers.test.js:137         deepEqual([...HANDLER_ADDRESSES].sort(...), [...])
                                          -> insert 0x272424 in sorted position
       tests/w167coverage.test.js:84      enemy_types: 89/256 ported, 37 unknown, 130 null
                                          -> 90/256, and RE-RUN dojcoverage.py for the unknown/null
                                             split rather than assuming only the first number moves
       tests/w314stage5scope.test.js:210  assert.ok(!map.has(typeEntry(k).handler), '... is unported')

**The last one is the trap, and it IS triggered -- checked, not guessed.** `tests/w314stage5scope.test.js:205`
reads:

    for (const [t, span, kids] of [[0x46, 0x1a2, [0x55]], [0x48, 0x264, [0x54]],
      [0x43, 0x10e, [0x44]], [0x4c, 0xbe4, [0x4e, 0x50, 0x52, 0x58]]]) {
        assert.ok(got.has(k), `type $.. spawns $..`);
        assert.ok(!map.has(typeEntry(k).handler), `and $.. is unported`);

**`$46` spawns `$55`, and `$55` is the asserted-unported child.** So porting `$55` makes the second
assertion FALSE. It must be **rewritten, not renumbered**, and the file documents its own precedent: when
W319 ported `$8E` and W323 ported `$1B`, both were *kept* as assertions that the scan still agrees about
what they spawn, with the ported-ness claim flipped. Do the same here -- keep `got.has(0x55)` (the scan
must still see `$46` spawning it) and flip the second assertion to assert it IS in `map`. **Deleting the
entry would lose the `$46` -> `$55` edge**, which is the only machine-checked record of it.

**And this CONFIRMS from the test rather than from my notes that porting `$55` unblocks `$46`** -- `$46` is
13 records with span `$1A2`, the largest single remaining piece of stage 5, and its unported-child blocker
is exactly `$55`.

### W351: `($2E,A5)` IS A BURST COUNTER. The two volleys are ORDINARY and FINALE.

Both variants converge on `$27270E` (the 15-shot arm reaches it by `$272682 bra $27270E`):

    27270e  subq.b #1,($2e,A5)         <- a COUNTDOWN, not a mode selector
    272712  bcc $272722                not underflowed -> tail
    272716  move.b ($2f,A5),($2e,A5)   reload the burst counter from ($2F,A5)
    27271c  move.b ($27,A5),($26,A5)   AND reload the fire timer ($26,A5) from ($27,A5)

**That reframes all three reads of `($2E,A5)` into one coherent mechanism**, and I had every one of them
wrong in isolation:

    2725e2  move.b ($2e,A5),D0 / cmp.b ($2f,A5),D0 / bne    re-aim ONLY when counter == reload,
                                                            i.e. on the FIRST volley of a burst
    272624  tst.b ($2e,A5) / beq $272686                    the 20-shot pattern fires when the counter
                                                            has reached ZERO -- the LAST volley
    27270e  subq.b #1 / bcc / reload both timers            step the burst, and on underflow restart it

**So `$55` fires a BURST of volleys: it aims once at the start, fires the 15-shot pattern for each volley
of the burst, and fires the 20-shot pattern as the FINALE.** That is why the "fewer passes" variant is the
bigger one -- it is the closing volley, not an alternative mode. W346 called this byte a fan-vs-single
selector, W351 called it a five-vs-four cluster selector; it is a burst position counter and the two
patterns are ordinary-volley and finale.

`($2F,A5)` is the burst length and `($27,A5)` the inter-burst fire-timer reload -- **two more
parent-seeded fields**, bringing `$55`'s spawn parameters to: `($17,A5)` mode, `($30,A5)` invulnerability
time, `($1C,A5)`/`($1D,A5)` drift timer, `($1E,A5)` cursor, `($26,A5)`/`($27,A5)` fire timer,
`($2E,A5)`/`($2F,A5)` burst counter, `($18,A5)`/`($19,A5)` palette base and XOR.

What IS settled: all FIVE callees already ported (`shotVector` `$241D34`, FREEZE `$8130D4`, `aim256`
`$24226E`, the emit `$2816F6`, the enqueue `$23DF86`); both tables already windowed (`$272750+$100`
W346, `$2735FA` inside W30's `$2735F0+$220`); and the whole alive path from `$2724EA` on. No new window
and no new helper are needed for any of that.

Also still unseeded: `($1E,A5)`, `($17,A5)`, `($2E,A5)` and `($2F,A5)` have no writes in the handler either, so
they are parent-supplied at spawn -- except `($17,A5)` and `($1E,A5)`, which the mode-2 arm writes itself
(`$2725AA`/`$2725B0`). **`($17,A5)` is therefore BOTH parent-seeded and self-advancing**, which is why calling it
"the parent-supplied parameter" was wrong in one direction and calling it "self-advancing state" was incomplete
in the other.

**AND A TOOLING TRAP THAT COST FOUR WRONG READS: `rip/sound/maincpu.bin` IS ADDRESSED BY RAW FILE OFFSET.**
The address IS the offset -- do NOT subtract `$200000`. "Offset-addressed" in the older notes meant exactly
this, and I read it as "subtract the build base", which made `$272710..$272750` come back all zeros and briefly
made me retract a correct `lea` reading. Confirm the convention on any new script by searching the image for
bytes you already know: `d0ed 001e 2410` is at file offset `$272728`, base `+0`.

Incidentally that search found the same three-instruction idiom at **sixteen** distinct addresses, so
`adda.w ($1E,A5),A0 / move.l (A0),D2` is a shared family rather than anything specific to `$55`. Check the
family before writing the tail.

**`$241D34` IS ALREADY PORTED** as `ctx.tables.shotVector(d0, d1)` -- 29 mentions, 7 in code, used by
`bossscripts.js`, `boss4.js` and `bossarrival.js`. The sinusoid arm calls it with amplitude `#$28` in D0 and a
phase from `($2C,A5)` that self-advances by 2, taking D2 as the result. **Do not write a sine helper for `$55`.**

That is now FOUR distinct meanings for offset `+$17` across stage 5 -- mirror/table select in all four band
members, a state number in `$47` and `$43`, and in `$55` both an invulnerability enable and an arm selector.

**CORRECTION (same wave): `($2A,A5)` IS NOT A PARENT PARAMETER.** Arm B COMPUTES it. `$272544..$272556` loads
`D0 = $28` as an amplitude and `D1 = ($2C,A5)` as a phase, advances that phase by 2 (`addq.b #2`), calls
`$241D34` -- already ported, 29 mentions and 7 in code, the angle/vector helper `boss4.js` and others use --
and stores the returned `D2` into `($2A,A5)`. **So arm B gives `$55` a SINUSOIDAL drift**, phase-advancing two
steps a frame, and the drift subtraction at `$2724AA` consumes what arm B produced.

So what `$46` actually supplies is FOUR things: `($16,A5)` position, `($1A,A5)` timer, `($17,A5)` protection
AND arm select, and the `($1C,A5)`/`($1D,A5)` cadence pair. `($2A,A5)` is internal state, and in arm A -- which
never reaches `$272544` -- it presumably stays whatever the prototype left, making arm A's drift constant where
arm B's oscillates. **That is the difference between the two arms and it is worth confirming when arm A's tail
is read.**

Still unread: `$272536` (arm B), `$2724F8`..`$272536` (the rest of arm A) and `$272722` (the freeze target).
Everything else in `$55` is read, its init is ported, and it needs no unported callee.
