# W325: type `$01`, two shared library routines, and a WRONG-TABLE error worth the write-up

Status: suite **2345/2345**, green, no skips (2334 + 11). Sweep 0 missing. `dojcoverage.py`
**82/256**, both OK lines. Web gate 31 of 31, exit 0. **414 ROM windows.**

**Stage 5's census DID NOT MOVE.** It is still eleven types over 32 records, and the reason is
this wave's mistake.

## THE MISTAKE, FIRST, BECAUSE EVERYTHING ELSE READS DIFFERENTLY AFTER IT

W325 set out to port stage 5's type `$81`. **It ported type `$01` instead.**

The enemy type table is TWO tables: `$267824` for types `$00..$7F` and `$27E412` for `$80..$FF`.
`tests/w314stage5scope.test.js` gets this right:

    const tab = t < 0x80 ? TYPE_LO : TYPE_HI;
    const off = (t & 0x7f) * SPAWN.TYPE_STRIDE;

The reconnaissance script for this wave copied the **mask** and not the **base**:

    off = 0x267824 + (t & 0x7f) * 8        # WRONG: masks the index, keeps the LOW table

For `t = $81` that reads entry 1 of the low table, so it returned `$267C24`/`$267C70` -- type
`$01`'s init and handler -- and reported them as `$81`'s. Everything downstream inherited the
label: the comments, `T81`, `handler81`, the test names, the export-tables note.

The real type `$81` is **`$273F06`/`$274076`** and is still unported.

**How it was caught, and this is the part worth keeping.** The suite went green and so did the
census -- but `w314stage5scope.test.js` still reported ELEVEN types over 32 records. A wave that
ports one of the eleven must move that number. It did not, so either the test was wrong or the
wave was. Checking which took one script: `enemyHandlerMap` is built from the port's own
`handlerMap()`, so the test DOES see new registrations, which left only one possibility.

**A census that refuses to move is a better witness than a suite that goes green.**

### What was kept, and why it was not reverted

The code is right about the routines it read: `$267C24` and `$267C70` were disassembled directly
and are transcribed faithfully. So it is kept, relabelled, and honestly scoped:

* **No stage script spawns type `$01`.** Walking all five scripts on the 8-byte stride finds zero
  records of it (asserted). So it is reached, if at all, by some other spawner -- and registering
  its handler is safe precisely because nothing in a stage reaches it.
* **It is translated code and not census progress.** The 81 -> 82 in `enemy_types` is real, but
  it is not one of stage 5's eleven.
* **What the wave really buys is two SHARED library routines** the remaining types will want:
  `$242A48` with SEVEN callers and `$259C42` with FIVE.

## THE TWO SHARED ROUTINES

### `$242A48` -- the stick decode, and it is p2RAW

    242a48  jsr $23D17E            D0 = $803976 = p2RAW, the HELD word
    242a4e  andi.w #$F,D0          the four DIRECTION bits
    242a52  lea ($242A70,PC),A0
    242a56  move.b (A0,D0.w),($1B,A6)
    242a5c  bmi $242A64            a NEGATIVE entry means "no direction"
    242a5e  jmp ($2417DE,PC)       -> apply, i.e. MOVE
    242a64  move.b #$40,($1B,A6)   no direction: heading $40 ...
    242a6a  moveq #$0,D2           ... and NO apply

**There are THREE two-instruction input reads and they read three different words**:
`$23D17E` -> `$803976` (p2raw), `$23D186` -> `$803972` (p1edge), `$23D18E` -> `$803978` (p2edge).
`machine.js` names all six. Picking edge where the ROM reads raw makes a held stick move ONCE
instead of every frame, and the port already had a function for the edge pair
(`readInput23D186`), so the wrong one was one character away. Pinned by a test that sets only the
edge word and asserts a refusal.

The table is eight compass headings 8 units apart plus eight refusals:

    idx  0   1   2   3   4   5   6   7   8   9   A   B   C   D   E   F
    val $FF $00 $20 $FF $30 $38 $28 $FF $10 $08 $18 $FF $FF $FF $FF $FF

`$FF` is negative, which is what the `bmi` tests, so index 0 (nothing held), 3 (up+down together),
7, `$B` and `$C..$F` all refuse. **The refusal arm's store is NOT dead**: `$242A64` writes `$40`
before returning and `$40 & $3F` is 0, so a later `$2417DE` from anywhere else reads heading 0
rather than a stale one. Dropping that store would leave the last direction latched.

Carried in `movement.js` as `STICK_HEADINGS`, a literal with an `[M]` marker -- the way `bee.js`
carries `BASE_LADDER` and `items.js` carries `DISPATCH` -- and **`w325type01.test.js` compares all
sixteen bytes against the ROM IMAGE**, which is what makes a hand-copied table safe.

`applyVelocity` was refactored so the six velocity instructions are not transcribed a third
time: `applyVelocityA6` is the A6-direct form the ROM's 63 `jsr` sites actually enter at, and
`applyVelocity` is that plus the `A5 -> sub-record` hop.

### `$259C42` -- two instructions, and the word is never written

`move.w $812E0A,D0 / rts`. `rosetta.py sites` finds two references to `$812E0A` in Build B and
**both are reads**; nothing anywhere stores to it. So it is 0 in a fresh machine. Transcribed as
the read it is, because folding it to a constant would be wrong the moment anything writes it.

## TYPE `$01` ITSELF

    267c70  jsr $242A48         move from p2RAW -- the stick decode above
    267c76  tst.w ($18,A5) / beq $267C86
    267c7e  subq.w #1,($18,A5)  a countdown; while it runs, only the draw happens
    267c86  jsr $23D18E         D0 = p2EDGE
    267c8c  btst #$6,D0 / beq   button bit 6, on the EDGE
    267c94  jsr $259C42         D0 = $812E0A
    267c9a  cmpi.w #$4,D0 / bgt $267CB2      } BOTH SIGNED, so the accepted
    267ca2  tst.w D0 / bmi $267CB2           } range is 0..4 inclusive
    267ca8  add.w D0,D0 / add.w D0,D0        D0 *= 4 -- THE ITEM KIND
    267cac  jsr $27E812         the ITEM ALLOCATOR -- `spawnItem`, W61
    267cb2  jsr $23D762         bucket 0, RECORD convention

P2 holds a direction and it moves; P2 taps a button and it allocates an item whose kind is
`$812E0A * 4`. **The range check is the internal confirmation that the reading is right**: 0..4
scaled by four is exactly the item pool's kinds `$00 $04 $08 $0C $10`, five of its six, with `$14`
(the P2 hyper item) unreachable from here. An unrelated word would not range-check onto precisely
the item-kind ladder.

Two more details the tests pin:

* **The countdown gates the SPAWN, not the MOTION.** `$242A48` runs before the test, so the
  object keeps answering the stick while counting down.
* **The init body has NO `$263808`.** It writes a literal `move.l #$38001C00,($2,A6)` and returns,
  so the script's position bytes are ignored. Every other body in `initbody.js` reads the spawn
  position; calling `readInitPosition` here "for consistency" would move the object. The test
  poisons `($48,A5)` and asserts the literal wins. Its init STUB also writes run length **0**
  where `$1A` and `$1B` write 1.

## AND ONE MORE HOOK COLLISION, CAUGHT BY THE SAME TEST

The first cut called `ctx.itemSpawn?.(site, kind, rec)` after `spawnItem`. But **`items.js`
already calls that hook itself**, as `itemSpawn(d0, siteAddr, a0)` -- a different argument order.
The result was two events per press, one with the fields transposed, and the test caught it as
"config 0 spawns one item" reporting two. The handler now passes the site address to `spawnItem`
and lets the pool do its own reporting.

The general shape, third time this session after `damageArm5C` and `poolETail`'s D1: **before
adding a hook or a parameter, check whether the callee already has one.**

## Order for the next wave

1. **`$1A` IS BLOCKED, and this is new.** W324's handoff note said it was a cheap sibling of `$1B`.
   Reading further found `$268D8C jsr $24203E` -- the PURE aim core, self in D0/D1 and target in
   **D2/D3** -- and `$1A` never sets D2/D3. `$263808` does not set them either. So the angle
   depends on whatever the enemy init dispatcher left in those registers, and the `bcc` after it
   depends on a carry from inside the core's own arithmetic. **That is a register-provenance
   question, the same class that blocks `$280252` (W288), and it must be measured, not guessed.**
   The handoff's "start there, it is cheap" is corrected.
2. **The real `$81`: `$273F06`/`$274076`.** Use `typeEntry`'s two-table form. Three records.
3. Then `$49`/`$4A`/`$4B` (spans `$A2`/`$B6`/`$B6`) and `$47` (`$E2`).
4. `$8130D8`'s rename, still owed since W320, now with four witnesses.
5. **`$B0` is boss reconnaissance, not an enemy.** HIBACHI CLOSURE RULE in the handoff.
