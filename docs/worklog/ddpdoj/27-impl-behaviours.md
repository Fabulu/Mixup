# W27 — THE 31 REMAINING BULLET BEHAVIOUR BODIES (`$282104..$283BAF`)

status: **IN PROGRESS.**
wave: 27. role: IMPLEMENTER (sole `src/` writer this wave).
date: 2026-08-03.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B
(`$23xxxx`-`$2Axxxx`) unless noted.

## THE BRIEF

W26 ported the MOVER `$281DDE` and the 8 stage-1 behaviour bodies (kinds
3/4/5/6/7/12/13/19).  The mover dispatches, at rec+$22, the per-bullet
CONTINUATION the spawn-frame initialiser `$282030[kind]` installed -- and 31 of
the 39 kinds still loud-throw by address.  This wave ports them so every kind
dispatches without a throw, and validates the bit-7 RECOMPUTE path (`$281F3E`)
and the bit-14 TRANSFORM path (`$281FA2`+`$281FB4`) that W26 transcribed but
could not exercise (no bit-7/bit-14 kind appears in stage 1 through the midboss).

## RECON METHOD

Independent capstone linear-sweep of `$282104..$283D4C` on
`tools/oracle/out/maincpu.bin` (the decrypted image; NOT prior art).  Script:
`tools/oracle/w27disasm.py` (gitignored output under `out/`).  The 39 behaviour
pointers `$282030[k]` resolve to 37 distinct bodies (kinds 14/15 alias to kind
10's `$282840`); 8 are already ported, leaving **29 distinct bodies covering 31
kind indices** to port.

The `$282030` table (re-derived this wave):
```
 0 $282104   1 $282162   2 $2821C2   3 $2823EC*  4 $2824A8*  5 $282564*
 6 $282620*  7 $2826DC*  8 $282772   9 $2827E0  10 $282840  11 $2828A0
12 $282908* 13 $282962* 14 $282840   15 $282840  16 $2829BC  17 $282A1E
18 $282AAE  19 $282B30* 20 $282BEE  21 $282C56  22 $282D42  23 $282E00
24 $282EBC  25 $282F6E  26 $2830B2  27 $283148  28 $283260  29 $28330C
30 $283430  31 $2834FE  32 $2835CC  33 $2836A8  34 $28371C  35 $283850
36 $2838C6  37 $2839DE  38 $283AF6         (* = ported in W26)
```

## FIELD LAYOUT (re-confirmed against the listing + the sprite emit `$284286`)

The sprite emit (`$284286 lea $2(A6),A1`) leaves A1 at rec+$0E, so a continuation
`addi.l #n,-(A1)` predecrements to rec+$0A -- the DESCRIPTOR (sprite-frame ptr),
NOT renderOffs (which is rec+$06).  After `bsr $2820CC`/`$284286`, A1=rec+$0E.
W26's `animateRenderOffsWrap` therefore animates the DESCRIPTOR field (+$0A);
its name is a misnomer but its offset is correct (gate-invisible: the mover gate
compares posA/posB/speed/dir/velA/velB only).

## THE STRUCTURAL FAMILIES (re-derived from maincpu.bin)

Each INITIALISER clears type-word bit 8 (`andi.b #$fe,(A6)`) and installs the
continuation at rec+$22; most also call `$2820CC` (muzzle+offset+sprite) and/or
the shared epilogue `$2822AE` (dir-faced sprite frame).  Each CONTINUATION ends
`lea $40(A6),A6 / dbra` (net A6 +$40) or kills via `bra $281EC4` (free slot).

* **A. sprite-ring** (0,1,8,9,10,11,20): cont = animate descriptor +$0A by a
  fixed step, wrap to base0 at a limit.  Plain straight-flyers.
* **B. dir-faced + $283CE4 4-frame ring** (2,21): init sets +$12 (frame base),
  +$16 (index); cont `$283CE4` cycles +$16 -=4 &$0C and sets descriptor from
  *(+$12+index), gated on the `$80390C` semaphore.  Sprite-only.
* **C. the bit-7 "transform-once" flyers** (16,18,20-partial): cont overwrites
  descriptor/renderOffs/graphic to a fixed `$410`-family sprite each frame.
  Kind 18 is the ENEMY SPAWNER: countdown +$34, then `jsr $263684` (D0=$35) and
  `bra $281EC4` (kill the bullet, the enemy takes its place).  `$263684` is a
  loud named throw (enemy subsystem).
* **D. the CURVER** (17): bit-7.  cont: counter +$2A underflow -> dir += +$34
  (rate); counter +$2C underflow -> speed += 1.  Position-relevant.
* **E. the homing tracker** (22,24): cont: `btst #3,+$34`; clear -> track branch
  (pos = target pos + +$28 offset; target ptr at +$2C); set -> animate.  When the
  target dies the bullet self-kills.  +$34 bit3 is the track/animate mode latch.
* **F. the decelerator** (23): cont: counter +$2C underflow -> velA -= +$2E
  (word).  Position-relevant (plain path reads velA).
* **G. the wall-bouncer** (25,29,34): cont: if +$2C!=0 test pos vs
  $200/$3600 (posB) and $600/$6E00 (posA after swap); on cross, negate-or-reverse
  dir, xor attr $40/$20, recompute+store velocity, descriptor += $2D0, +$2C--.
* **H. the dir-faced curver w/ extra drift** (26,27,36,37,38): init via epilogue;
  cont: optional trail emit (the `lea -$c(A4)` block), +$30 countdown gate, then
  pos += +$28/+2A pair, counter +$2C -> dir += +$2E, counter +$36 -> speed +=
  +$38, recompute+store velocity.  Position-relevant.
* **I. the dir-faced launcher** (30,31): init precomputes a slowed (>>3) velocity
  into +$30/+32; cont: counter +$2C underflow -> velA += +$30, velB += +32
  (accelerate from slow).  Position-relevant.
* **J. the splitter/tracker** (28): cont: +$28 byte countdown; on reaching 0 once,
  `jsr $242748` (re-aim at player) + `jsr $242296` + spawn via `$2817C2` (bank B
  core) -- then animate.  `$242748`/`$242296` are loud named throws (player-track
  subsystem); the spawn is wirable via `spawnCore` but depends on the aim.
* **K. the slow-clock accel** (33): cont: counter +$2E underflow -> descriptor =
  table[+$2C] (a 6-entry ring at `$283704`), +$2C -= 4 wrap $0C.
* **L. the bouncer variant** (29,34): as G but dir = $80-reverse on the vertical
  walls (29 uses `addi.b #$80`; 34 uses neg+80).

## PLAN

1. Append the 29 init bodies + 28 continuation bodies to `src/mover.js`
   (kinds 2 and 21 share cont `$283CE4`).  Shared helpers: `epilogue2822AE`,
   `cont283CE4`, `velocityStore`, and a `byteCountdown` for the borrow pattern.
2. Add ROM windows for the sprite tables the new bodies read (`$2821FA`,
   `$2822EC`, `$282C8E`, `$2830EA`, `$283704`, and a `$1BF000..$1C2C00` window
   for the sprite-frame data the descriptors point into) to
   `tools/export-tables.py`; regenerate `rip/port/player.tables.json`.
3. Unit-test each continuation's net A6 delta (+$40) + per-kind field writes
   (position-relevant ones with a real ROM; sprite-only constant writes asserted).
4. VALIDATE the bit-7 RECOMPUTE path and the bit-14 TRANSFORM path directly
   (force the type word, run `runMover`, assert the per-frame writes) -- these
   were transcribed in W26 but never exercised.
5. RED: break kind 17's heading write, watch a forced bit-7 comparison diverge;
   restore, SHA-verify.

## FINDINGS (updated as they arrive)

### 2026-08-04 — FAMILY A PORTED (7 bodies, kinds 0/1/8/9/10/11/20)

Resumed after the usage wall. Ported the seven sprite-ring bodies against a
fresh capstone listing of each address (`w27disasm.py`), not against the family
summary above — and the listing corrected that summary twice:

1. **KIND 20 IS SEMAPHORE-GATED, and the summary filed it as a plain ring.**
   Its continuation opens `tst.w $80390C / beq` (`$282C30`/`$282C36`), the same
   gate `cont283CE4` honours. Ported as a plain ring it would step its
   descriptor every frame instead of roughly half of them. The family list had
   20 in family A *and* mentioned it under C ("20-partial"); the listing
   settles it. **This is why bodies get ported from the disassembly and not from
   a summary of the disassembly**, however good the summary is.

2. **KIND 11 ADVANCES VIA A1, NOT A6.** `addi.l #$24,-(A1)` + `lea $40(A6),A6`
   (`$2828EA`/`$2828FE`) where the other six use `adda.l #$a,A6` + `addi.l
   #n,(A6)` + `lea $36(A6),A6`. Same field, same +$40 net, two different
   routes. Recorded because an unexplained difference reads as a transcription
   error to the next person.

3. **KINDS 8 AND 11 WRITE THEIR SPRITE FIELDS TWICE** — `$28278E` sets
   renderOffs `$FE00FE00`/graphic `$210`, then `$2827A4`/`$2827AC` overwrite
   with `$FC00FE00`/`$410`. The first write is dead. Transcribed anyway: the
   port's job is to be the same code, not the tidier code (kind 3 already
   carries an identical dead store).

Kind 0 is also the only body in the family with renderOffs `$FE00FF00` and
graphic `$208`; the other six are `$FE00FE00`/`$210`.

**Inventory: 8 -> 15 distinct bodies, covering 17 of 39 kind indices** (kind
10's `$282840` is aliased by 14 and 15). 22 distinct bodies remain.

### THE GREEN THAT MEANT NOTHING, AND THE ONE THAT DOES

When the seven bodies landed, the suite reported 381/381 — because the only
test touching the maps was a LEDGER test asserting a fixed address set, and it
had just been updated. **Wiring is not behaviour.** That is the same shape as
this wave's own predecessor, where 381/381 was green over seven uncalled
helpers and zero ported bodies.

So three behavioural tests were added (384 total) and then MUTATED and watched
fail, per rule 4:

| mutation | result |
|---|---|
| remove kind 20's `$80390C` gate | RED — `not ok 202`, that test only |
| kind 0 ring step `$C` -> `$D`   | RED — `not ok 201`, that test only |

Each mutation reddened exactly ONE test, not the suite — a mutation that
reddens everything proves nothing about the specific constant. `src/mover.js`
restored and hash-verified byte-identical both ways (`41e01c6516e085b8`), suite
back to 384/384/0 skipped.

### NOT DONE, AND NOT CLAIMED

- **22 distinct bodies remain** (families B–L): the curver, homing tracker,
  decelerator, wall-bouncers, launchers, splitter, slow-clock accel.
- **The bit-7 RECOMPUTE and bit-14 TRANSFORM paths are still unexercised.**
  W26 transcribed them; no stage-1 kind reaches them; this wave did not force
  them either. Step 4 of the plan is untouched.
- **No oracle comparison was run for family A.** These seven are sprite-only
  (descriptor/renderOffs/graphic), and the mover gate compares
  posA/posB/speed/dir/velA/velB — so the gate is BLIND to every field these
  bodies write. The unit tests above are currently the only check on them.
  That blindness is structural, not an oversight, but it means "0 divergent"
  from the mover gate must never be quoted as evidence about family A.
- Step 2 (the ROM windows for `$2821FA`/`$2822EC`/`$282C8E`/`$2830EA`/`$283704`
  and `$1BF000..$1C2C00` in `export-tables.py`) is NOT done — family A reads no
  table, so it was not needed yet. Families B, H and K will need it.

### 2026-08-04 — FAMILY B PORTED (kinds 2, 21) + the tables they needed

**Both bodies END IN `bra.w $2822AE`** — a tail jump into the shared dir-faced
epilogue, which is where bit 8 is cleared and the sprite fields written. The
routine does not stop at its last `move.l`. Read as if it did, the entire
epilogue is dropped. Eleventh incident of the fall-through shape.

Also: **`w27disasm.py` runs straight past the routine into DATA.** Everything
after `$2821FA` disassembles as plausible-looking `ori.b` instructions and is
actually kind 2's sprite-frame pointer table. The `bra.w` is the real end. A
linear sweep cannot tell you where a routine stops; only the control flow can.

**THE DEAD HELPER THAT THREW THE MOMENT IT WAS REACHED.** W26 transcribed
`$2822AE` (`epi2822AE`) and `$283CE4` (`cont283CE4`), but NO KIND DISPATCHED TO
EITHER. They sat as unexercised code. Kinds 2 and 21 are the first to reach
them, and `epi2822AE` threw instantly and by address:

    UNPORTED $2822FC: word at $2822FC is outside every ROM window

The `$2822EC` direction table had never been exported, because nothing had ever
read it. **That throw is the system working exactly as designed** — the
alternative to a missing window is invented data that looks fine. Three windows
added to `export-tables.py` (`$2822EC`+$40, `$2821FA`+$B4, `$282C8E`+$B4);
`player.tables.json` regenerated, 88 windows / 177,078 bytes.

Note `$2822EC` is a DIFFERENT table from `$283C4C` with a different index
expression — `$2822AE` masks `(dir+4)&$F8`, `$283C0E` does `((dir+4)>>2)&$3E`.
Two epilogues, two tables, easy to conflate.

**Inventory: 15 -> 17 initialisers, 16 continuations.** Not equal, and correct:
kinds 2 and 21 share `$283CE4`.

### TWO DEFECTIVE CHECKS, BOTH MINE, BOTH CAUGHT WITHIN THE HOUR

1. **`assert.equal(INIT_BODIES.size, CONTINUATIONS.size)`** — written by me in
   the family A commit under a comment claiming it proved "no body is wired in
   with a dangling +$22 target". It proved nothing of the sort: two maps can
   have equal size with every target wrong. It went red the moment a legitimate
   shared continuation appeared, which is how it was caught. Replaced with a
   check that resolves every continuation key.
2. **The kind 2 test asserted `+$16 == $C` AND `+$16 == $C-4`** — the epilogue
   steps the index by −4 during init, so the two assertions contradicted each
   other. It failed for that reason before it could ever fail for a real one.
   `+$18` is the half that survives init untouched.

Ninth and tenth defective checks on this project. Both were written *by the
person applying the rule about defective checks*, on the same day, which is
worth more than the fixes: knowing the failure mode does not stop you producing
it. Only mutation does.

### MUTATION TABLE (family B)

| mutation | result |
|---|---|
| drop kind 2's `bra.w $2822AE` tail jump | RED — `not ok 204`, that test alone |
| give kind 21 kind 2's table (`$282C8E` -> `$2821FA`) | **GREEN — NOT CAUGHT** |

That second row is the useful one. Kinds 2 and 21 are instruction-identical
apart from one `lea`, which makes swapping their tables the most plausible slip
in the family — and nothing detected it, because kind 21 had no behavioural
test at all. A test comparing the two resolved frame-table pointers was added;
the swap now reddens `not ok 205`, that test alone. `src/mover.js` restored and
hash-verified byte-identical (`a4f6545d2f6a7ecb`); **386 pass / 0 fail / 0
skipped**.

Had the mutation not been run, family B would have shipped with a real hole in
its coverage and a green suite saying otherwise.

### 2026-08-04 — FAMILY C PORTED (kinds 16, 18) — the enemy spawner

Both initialisers are family B's shape (muzzle, +$1D, `$2821FA` table, +$16 =
`$C000C`, +$26 = `$101`, `bra.w $2822AE` tail jump) with extra counter fields.
**They reuse KIND 2's table at `$2821FA`**, so no new ROM window was needed —
the windows added for family B already cover them.

Their continuations do not animate: they **RE-STAMP** descriptor, renderOffs and
graphic with the same fixed `$410`-family values every frame. The sprite never
steps; it is rewritten.

**KIND 18 IS THE ENEMY SPAWNER.** After the re-stamp it runs a WORD countdown at
+$34 (`subq.w #1,$34(A6) / bcc`, `$282B0C`), and on underflow calls `$263684`
with D0 = `$35`, copies the bullet's position into the new enemy's +$16, then
`bra $281EC4` — the bullet kills itself and the enemy takes its place. `$263684`
is the enemy subsystem, unported, so that arm is a loud named throw.

Two things worth knowing before trusting any test of it:

- **The countdown fires on UNDERFLOW, not on reaching zero.** The 68000 sets C
  on borrow and borrow happens only when the word was already 0, so `bcc` is
  taken while it is non-zero. A `+$34` of 2 survives frames at 2 and 1, sits at
  0 on the third, and spawns on the FOURTH. Off by one here spawns the enemy a
  frame early for every kind-18 bullet in the game.
- **Neither initialiser writes +$34.** It arrives from the spawn record. A test
  that forgets to seed it underflows on its first frame.

**Inventory: 17 -> 19 initialisers, 18 continuations.** 22 of 39 kind indices
covered; 18 distinct bodies remain (families D–L).

### A TEST THAT WENT GREEN FOR THE WRONG REASON

`an UNPORTED behaviour kind throws by address` used **kind 16** as its example.
W27 ported kind 16 — so the test would have gone green because its subject
disappeared, not because the behaviour it guards still holds. Re-pointed at kind
17 (`$282A1E`, the curver), which is genuinely unported.

This is a maintenance hazard specific to negative tests: a test asserting "X is
not done yet" decays into a tautology the moment X gets done, and it decays
GREEN. Every future wave that ports a kind must re-point it, not delete it.

### MUTATION TABLE (family C)

| mutation | result |
|---|---|
| kind 18 fires on reaching 0 instead of on underflow | RED — `not ok 207`, alone |
| kind 16 steps its descriptor instead of re-stamping | RED — `not ok 206`, alone |
| drop kind 18's `bra.w $2822AE` tail jump | RED — `not ok 207`, alone |

`src/mover.js` restored and hash-verified byte-identical (`f79f3c3284f94308`);
**388 pass / 0 fail / 0 skipped**.

### 2026-08-04 — FAMILY D PORTED (kind 17, the CURVER) — first gate-visible body

Kind 17 (`$282A1E`) is the first W27 body the mover gate can actually see:
families A–C write only descriptor/renderOffs/graphic, which the gate ignores.
This one writes **DIR (+$1B) and SPEED (+$1A)**, both compared fields.

Its initialiser is byte-identical to kind 18's; the continuation re-stamps the
`$410` sprite fields then runs two independent byte countdowns with reload:

    $282A7C  subq.b #1,$2A / bcc -> reload from +$2B, dir += +$34   (the turn)
    $282A92  subq.b #1,$2C / bcc -> reload from +$2D, speed += 1    (the accel)

**THE COUNTER/RELOAD HALVES ARE NOT WHAT THEY LOOK LIKE.** `move.w #$1,$2a(A6)`
is big-endian, so it seeds the COUNTER +$2A to `$00` and the RELOAD +$2B to
`$01` — not counter=1. A counter at 0 underflows on its FIRST continuation
frame, so a fresh kind-17 bullet turns and accelerates immediately rather than
after a delay. Reading the word as counter=1/counter=4 would postpone the first
turn by a frame and the first acceleration by four, for every curver in the
game. Same shape in kinds 16 and 18, which use the identical writes.

+$34 (the turn rate) is not written by the initialiser — it comes from the
spawn record, exactly like kind 18's countdown.

### A ROM WINDOW THAT WAS TOO NARROW, AND WHY IT PASSED ANYWAY

Adding kind 17 threw `UNPORTED $28232C` on its first frame — **a defect in the
window I added for family B this same session**, not in the port.

`$2822AE` indexes `$2822EC` as `move.w ($2822EC,A1,D0),D1` with
`D0 = (dir+4)&$F8`. D0 is a **BYTE OFFSET** running 0, 8, 16 … `$F8`, so the 32
entries are spaced 8 bytes apart, not packed. I sized the window `$40` on
"32 words = 64 bytes". The true extent is `$100`, ending exactly where kind 3's
body begins at `$2823EC` — a clean abutting bound, the same kind of evidence
used elsewhere in this project to prove a table's length.

**It passed for hours because every test written against that table used
`dir: 0x10`** → D0 = `$10`, comfortably inside `$40`. The first test to use
`dir: 0x40` walked straight off the end. A window validated only by inputs that
all happen to be small is not validated — and nothing in the suite would have
caught it until a real scenario spawned a bullet aimed left.

Widened to `$0100`; tables regenerated, 88 windows / 177,270 bytes.

### MUTATION TABLE (family D)

| mutation | result |
|---|---|
| seed +$2A=1/+$2B=0 (the big-endian half-swap) | RED — `not ok 208` |
| the turn writes SPEED instead of DIR | RED — `not ok 208` |
| accel reloads from +$2B instead of +$2D | RED — `not ok 208` |

All three reddened the curver test and nothing else. `src/mover.js` restored and
hash-verified byte-identical (`66b41156f8cbe684`); **389 pass / 0 fail / 0
skipped**.

### THE NEGATIVE TEST IS NOW SELF-MAINTAINING

`an UNPORTED behaviour kind throws by address` had already been re-pointed once
(kind 16 → 17), and this wave ported kind 17 too. Rather than re-point it a
second time it now **derives** its subject: it reads the `$282030` table out of
the ROM and picks the first kind whose body is absent from `INIT_BODIES`. It
cannot decay green. If every kind is ever ported it calls `assert.fail` with
"retire this test" rather than silently asserting nothing.

**Inventory: 19 → 20 initialisers, 19 continuations. 23 of 39 kind indices
covered; 17 distinct bodies remain (families E–L).**

### 2026-08-04 — FAMILY E, KIND 22: not a homing tracker, an ATTACHED one

The recon called family E "the homing tracker". The listing says otherwise: the
bullet does not steer toward a target, it is **PINNED TO** one and later
**RELEASED**.

- **init** (`$282D62`/`$282D68`) saves the whole velocity longword +$1E into
  +$30 and **clears +$1E**. Zero velocity means the plain path cannot move it,
  so while attached the position comes entirely from the target. Kind 19 uses
  the same save/clear trick for its launch delay.
- **track** (`$282DA4`): position (+$2, the posA:posB longword) = the target's
  own position + the fixed offset at +$28. Target pointer at +$2C.
- **release** (`$282DD8`): `bset #3,$34` latches the mode and +$1E is restored
  from +$30 — the bullet flies off on the velocity it was born with.
- **animate** (`$282D7E`): once latched, an ordinary descriptor ring.

**RELEASE HAPPENS TWO WAYS AND ONLY ONE IS OBVIOUS.** The target pointer being
NULL (`$282DA8 beq`), or the descriptor animation reaching `$1C1EEC`
(`$282DCE`) — and that second one is a FALL-THROUGH: `bne $282DE4` skips the
release, so *reaching* the limit drops into `$282DD8`. Read as "the ring wraps
here", the whole release path disappears. Twelfth incident.

**THE TWO KILL TESTS ARE ON THE TARGET, NOT THE BULLET.** `$282DAC tst.w (A0) /
bpl` kills when the TARGET's type word has bit 15 clear; `$282DB0 tst.b $1(A0) /
bmi` kills on a flag in the target's second byte. A bullet attached to something
that dies, dies with it.

Also: the animate ring's base is `$1C1EC8`, which is **not** the descriptor the
initialiser writes (`$1C1E38`). The first wrap moves it into a different ring.

### THE MUTATION THAT SURVIVED, AND WHAT IT COST TO CATCH

Kind 22's kill at `$282DEE` is a bare `clr.w (A6)` + `move.w #$ffff,$2(A6)` with
**no jsr to the death-effect spawner** — so it is `freeSlotNoEffect`, not
`freeSlot`. I reasoned that out from the listing *before* writing the code, got
it right, and then found the distinction was **completely untested**:

| mutation | first result |
|---|---|
| `freeSlotNoEffect` → `freeSlot` (spurious death effect) | **GREEN — NOT CAUGHT** |
| init drops the `clr.l $1E` | RED — `not ok 209` |
| drop the `bmi` target-flag kill test | RED — `not ok 211` |
| release drops the velocity restore | RED — `not ok 210` |

Getting a detail right is not the same as having a check that would notice if it
were wrong. The only difference between the two helpers is a note emitted to the
log, and no test inspected the log. `UnportedLog.calls` is a Map, so the kill
test now asserts no `$27F8F8` note appears; the mutation reddens `not ok 211`.

`src/mover.js` restored and hash-verified byte-identical (`e2c04d1feb883cf2`);
**392 pass / 0 fail / 0 skipped**.

**Inventory: 20 → 21 initialisers, 20 continuations. 24 of 39 kind indices
covered; 16 distinct bodies remain.**

### 2026-08-04 — FAMILY E FINISHED (kind 24) + FAMILY F (kind 23)

The recon's family split cuts through the middle of one template, and porting
the two bodies together is what made that visible.

**KIND 24 IS NOT A TRACKER.** Its INITIALISER (`$282EBC`) is byte-identical to
kind 22's (`$282D42`) — same descriptor `$1C1E38`, same `$FC00FE00`/`$410`, same
`move.l $1e,$30` / `clr.l $1e`. Its CONTINUATION is not: kind 22's
`btst #3,$34 / beq` goes to the TRACK code at `$282DA4`; kind 24's
`beq $282F46` goes **straight to the release**. There is no target-pointer read
anywhere in the body. So the attach lasts exactly one frame — the spawn frame
stores a zero velocity, the next plain frame moves the bullet nowhere, and the
continuation latches +$34 bit 3 and restores +$1E. It is a **one-frame launch
delay built out of the tracker's machinery**, the same trick kinds 19 and 22
use for different durations.

**AND THE SAME BYTES MEAN DIFFERENT THINGS IN THE TWO BODIES.** In kind 22 +$2C
is the TARGET POINTER longword. In kinds 23/24 those bytes are a countdown
(+$2C), its reload (+$2D) and a deceleration step (+$2E — the low half of what
kind 22 reads as a pointer). Nothing in the record layout says which; only the
body does. A shared "field layout" table for the pool would be actively wrong
here.

**THE SHARED DECEL BLOCK** (`$282E64` == `$282F16`, instruction for
instruction) is family F's entire content, and its +$36 duration word has
**three** states, not two:

    tst.w $36 / beq  -> skip the WHOLE block (no decel AND no +$2C tick)
                bmi  -> skip only the decrement (decelerate forever)
    else  subq.w #1,$36                        (decelerate and count down)

Then `subq.b #1,$2C / bcc`, reload from +$2D on underflow, and
`move.w $2e(A6),D0 / sub.w D0,$1e(A6)` — velA loses the +$2E word. Position-
relevant: the plain path integrates +$1E. Reading the `beq` as "skip the
subtraction" instead of "skip the block" would tick the countdown on frames the
ROM does not, so every later underflow lands on the wrong frame.

Kind 23's own initialiser (`$282E00`) is kind 11's shape, dead sprite write and
all, over the SAME descriptor `$1C0E0C` and the SAME `$24`-step ring to
`$1C0E9C`. The whole difference between kinds 11 and 23 is the decel block.
Kind 23's ring steps UNCONDITIONALLY; kind 24's is behind the bit-11 flip-flop.

### THREE DEAD TAILS, TRANSCRIBED AS COMMENTS AND NOT AS CODE

Both bodies carry template vestiges that **nothing branches to**: kind 23 has a
release stub at `$282E94` and a free-slot stub at `$282EAA`; kind 24 has a
free-slot stub at `$282F5C`. Every branch in the reachable code was enumerated
(`$282E4A`: bne `$282E64`, beq/bmi/bcc; `$282EF0`: beq `$282F46`, bne `$282F16`,
bcc `$282F3C`) and none lands there. This is the *opposite* of the fall-through
trap and needs the same discipline: the sweep prints them right after the body,
so porting them "because they are there" would invent a kill and a second
release the cartridge cannot reach. **Control flow decides, in both directions.**

### MUTATION TABLE (families E-finish + F)

| mutation | result |
|---|---|
| +$36 = 0 skips only the subtraction, not the block | RED — `not ok 212`, alone |
| +$36 negative still decrements | RED — `not ok 212`, alone |
| the decel subtracts from velB instead of velA | RED — `not ok 212` + `214` |
| kind 24's release arm falls through into the decel block | RED — `not ok 214`, alone |
| kind 24 tracks its +$2C target like kind 22 | RED — `not ok 213` + `214` |

No survivors. `src/mover.js` restored and hash-verified byte-identical
(`f9893f046bb3f02a`); **395 pass / 0 fail / 0 skipped**.

One test defect caught in the writing: the kind 23 decel test first used
`dir: $40`, which is purely horizontal — velA is **0** there, so subtracting
from it is invisible and the test could not have failed for the reason it
existed. Moved to `dir: $20`. Same shape as the `dir: $10` window defect
recorded above: a test whose inputs are all convenient is not a test.

**Inventory: 21 → 23 initialisers, 22 continuations. 26 of 39 kind indices
covered; 14 distinct bodies remain (families G–L).**

### 2026-08-04 — FAMILIES G + L PORTED (kinds 25, 29, 34) — the WALL BOUNCERS

Three bodies, one initialiser and one animation tail between them. The recon
put them in two families and got the variants the wrong way round. The measured
table, per wall, from the three listings:

| kind | left ($200) | right ($3600) | top ($600) | bottom ($6E00) | velocity |
|---|---|---|---|---|---|
| 25 | `dir = -dir` | `dir = -dir` | **UNREACHABLE** | `dir = $80-dir` | full |
| 29 | `dir = $40` | `dir = $C0` | `dir = $00` | `dir = $80` | `asr.w #1` |
| 34 | `dir += $80` | `dir += $80` | `dir += $80` | `dir += $80` | full |

The recon said "29 uses `addi.b #$80`; 34 uses neg+80". **It is kind 34 that
adds $80** — on all four walls, a flat 180-degree flip. Kind 29 does not
reflect at all: it `move.w #$40/$C0/$00/$80,D1` and SNAPS to the axis, which is
a different shape of motion, not a different constant. And only kind 29 halves
the recomputed velocity on impact. Ported from the summary, two of three
bouncers would have flown wrong and the third would have kept its speed.

### KIND 25 HAS NO TOP WALL, AND ITS TOP-BOUNCE CODE IS STILL IN THE ROM

`$282FEC bcc.w $28302A` sends posA >= $600 to the bottom test, and `$282FF0
bra.w $283064` sends posA < $600 straight to the animation. So the block at
`$282FF4` — a top bounce that scales the velocity to 3/4 via `asr.w #2` +
`sub.w` — is never entered. Kinds 29 and 34 FALL THROUGH into their equivalent
block; kind 25 has an extra `bra` in the way.

This is the fall-through trap **in reverse**, and it is just as expensive: the
linear sweep prints `$282FF4` immediately after the reachable code, in the
middle of the routine, looking exactly like the top-wall arm the other two
bouncers have. Porting it gives kind 25 a wall the cartridge does not give it.

Ruling it out needed a tool, so there is one now: **`tools/oracle/
w27targets.py <addr>`** disassembles a range and prints every instruction whose
operand resolves to the address. Results:

    $282FF4 (kind 25 top bounce)   0 references in $281000..$285000
    $282E94 (kind 23 release stub) 0
    $282EAA (kind 23 free stub)    0
    $282F5C (kind 24 free stub)    0

and a raw byte search finds none of the four anywhere in the image as a
big-endian longword, so none is a jump-table entry either. Both directions
matter: **only control flow can say where a routine stops, and only control
flow can say which of the code between the ends is alive.**

### THE CONSTANTS CHECK OUT AGAINST EACH OTHER

Independent evidence the descriptor numbers were read right, not just read: the
initialiser sets +$0A = `$1C1B68`; the pre-bounce ring runs to limit `$1C1E38`
and wraps to `$1C1BF8`; a bounce adds exactly `$2D0` — and `$1C1B68 + $2D0 =
$1C1E38`. The bounce lands the descriptor precisely on the boundary between the
two rings, and the tail then switches to the post-bounce pair (limit `$1C2108`,
wrap `$1C1EC8`) because +$2C has just reached 0. Four constants read
separately, meeting exactly.

Also: **the ring pair depends on the bounce budget**, which is easy to read as
one ring with a wrap. And the bouncer initialiser does NOT call `$2820CC` —
no muzzle offset for a bouncer, unlike most of families A–D.

### MUTATION TABLE (families G + L)

| mutation | result |
|---|---|
| port kind 25's dead `$282FF4` top arm | RED — `not ok 215`, alone |
| kind 29 drops the `asr.w #1` | RED — `not ok 216`, alone |
| kind 34 negates instead of adding $80 | RED — `not ok 217` + `218` |
| kind 29's left/right absolute dirs swapped | RED — `not ok 216`, alone |
| the tail's two ring limit/wrap pairs swapped | RED — `not ok 219`, alone |
| the `eori.b` lands on +$1D instead of +$1C | RED — `not ok 215/216/217` |
| left wall test inclusive (`<=` not `<`) | RED — `not ok 218`, alone |
| bottom wall test inclusive (`>=` not `>`) | RED — `not ok 218`, alone |
| drop the `subq.w #1,$2C` budget decrement | RED — 4 tests |
| +$19 no longer gates the tail | RED — `not ok 219`, alone |

Ten mutations, ten reds, **no survivors**. `src/mover.js` restored and
hash-verified byte-identical (`2bcb1f79cdb23556`); **400 pass / 0 fail / 0
skipped**.

The threshold test is the one worth keeping: `cmpi.w/bcc` and `cmpi.w/bls` make
all four walls EXCLUSIVE, and the two inclusive-off-by-one mutations are
invisible to every other test in the file because every other test parks the
bullet well past the line.

**Inventory: 23 → 26 initialisers, 25 continuations. 29 of 39 kind indices
covered; 11 distinct bodies remain (families H, I, J, K + kinds 32/35).**

### 2026-08-04 — FAMILY I PORTED (kinds 30, 31) — the LAUNCHERS

**KINDS 30 AND 31 ARE THE SAME BODY, COMPILED TWICE.** A byte-for-byte compare
of `$283430..$2834FE` against `$2834FE..$2835CC` finds **12 differing bytes in
206, and all 12 are PC-relative displacements or the continuation address**.
There is no behavioural difference to find. Writing that down is the point: the
next reader will otherwise spend the same time looking for one.

**THE ACCELERATION IS NOT ALONG THE BULLET'S HEADING.** The initialiser
precomputes an acceleration vector:

    $283478  D0 = speed (+$1A)
    $283480  D1 = dir (+$1B)
    $283484  sub.b $37(A6),D1        <-- THE DIRECTION OFFSET
    $283488  bsr $284190             velocity(speed, dir - +$37)
    $28348C  asr.w #3 on both        one eighth
    $283490  +$30 = dA, +$32 = dB

The recon recorded this as "precomputes a slowed (>>3) velocity into +$30/+32",
which is the magnitude and not the direction. Ported that way — with +$37
ignored — every kind-30/31 bullet would accelerate straight ahead instead of
curving, and only a player who never met one would not notice.

**THE ACCEL BLOCK IS THE DECEL BLOCK'S MIRROR AND USES DIFFERENT FIELDS.** They
are easy to conflate because the three-state duration gate is instruction-
identical:

| | duration word | effect |
|---|---|---|
| family F (23/24) | **+$36** | velA -= +$2E (one axis, subtract) |
| family I (30/31) | **+$34** | velA += +$30, velB += +$32 (both axes, add) |

The kind-30 test seeds +$36 to zero deliberately, so a port that read family F's
field would find a zero duration and skip — i.e. the test can fail for that
specific confusion.

`$2834EC`/`$2835BA` are dead free-slot stubs (0 references, `w27targets.py`).

### THE MUTATION THAT SURVIVED (second of the wave), AND THE TEST IT FORCED

| mutation | first result |
|---|---|
| accel computed along the bullet's own heading, not `dir - +$37` | RED — `not ok 220` |
| accel not shifted (`asr.w #3` dropped) | RED — `not ok 220` |
| accel duration read from +$36 instead of +$34 | RED — `not ok 221` |
| velB not accelerated (one axis only) | RED — `not ok 221` |
| accel subtracts instead of adds | RED — `not ok 221` |
| **kind 31's initialiser installs kind 30's continuation `$28349A`** | **GREEN — NOT CAUGHT** |

Because the two continuations are functionally identical, cross-wiring them
changes nothing observable — and that is exactly why it is dangerous: **+$22 is
a real longword the board holds**, so the port would disagree with the cartridge
on a field a gate can read, while every behavioural test agreed. This is the
same shape as the family B kind-2/21 table swap, and it is now clear it is a
CLASS of defect, not an incident.

So the check is now general rather than per-kind: **`every ported initialiser
installs ITS OWN continuation address at +$22`** walks the `$282030` table out
of the ROM, runs each ported initialiser's spawn frame, and asserts the +$22 it
installs both resolves in `CONTINUATIONS` and equals the ledgered address. The
subject set is derived, so it cannot decay; the expected addresses are the
ledger half and must be extended deliberately. The kind-31 mutation now reddens
`not ok 222`, that test alone.

That test also caught its own first defect within a minute: it counted KIND
INDICES reached (30) against the number of distinct bodies expected (28),
because kinds 14 and 15 alias kind 10's `$282840`. Counting the wrong unit is
the same mistake as an invented denominator, at test scale.

`src/mover.js` restored and hash-verified byte-identical (`590a3cbd508a246e`);
**403 pass / 0 fail / 0 skipped**.

**Inventory: 26 → 28 initialisers, 27 continuations. 31 of 39 kind indices
covered; 9 distinct bodies remain (families H, J, K + kinds 32/35).**

### 2026-08-04 — FAMILY K PORTED (kind 33) — the SLOW CLOCK, and a ring that is not the table

Kind 33 (`$2836A8`) is the only body in this wave that indexes a ROM table with
a value it keeps in the record, so it is the only one that needed a new window.
Its initialiser is the barest in the whole set: bit 8, descriptor `$1C01AC`,
+$1D, two counters, and the continuation. No muzzle call, no renderOffs or
graphic write at all.

**WHICH FIELD IS THE BIG-ENDIAN TRAP, AND WHICH IS NOT.** The initialiser has
two word writes that look alike:

    $2836BA  move.w #$14,$2c(A6)     -- read back with `move.w $2c(A6),D0` and
                                        `subq.w #$4,$2c`, so +$2C really is the
                                        word $0014.  NOT a counter/reload pair.
    $2836C0  move.w #$101,$2e(A6)    -- read back with `subq.b #1,$2e` and
                                        `move.b $2f(A6),$2e(A6)`, so this IS the
                                        byte pair: counter $01, reload $01.

The rule the earlier findings imply is "a word write to a counter field is a
half-swap", and applied blindly it would have corrupted +$2C. **The read decides
which it is, not the write.** Here both halves of +$2E happen to be 1, so the
swap would have been invisible in that field anyway — recorded because the next
body with `move.w #$0104` will not be so forgiving.

**THE RING IS NOT THE TABLE.** The continuation takes the longword at
`$283704 + (+$2C)` on each +$2E underflow, then `subq.w #$4,$2c / bcc`, and on
BORROW resets +$2C to **`$C`, not `$14`**. So the indices run

    $14, $10, $C, $8, $4, $0,  then  $C, $8, $4, $0,  $C, $8, $4, $0, ...

— the two entries at `$14` and `$10` are a **LEAD-IN that plays exactly once per
bullet**, and the steady state is a four-entry ring inside a six-entry table.
Read as "wrap the ring" it becomes a six-entry loop and every kind-33 bullet
holds a permanently wrong animation phase after its first pass.

And because the counter is the underflow flavour, the table steps on **every
other frame, starting with the second** — a fresh bullet holds `$1C01AC` for two
frames before the table ever speaks.

### THE WINDOW, SIZED FROM THE INDEX EXPRESSION

`$283704 + $18`, six longwords. The highest index the body can produce is `$14`
and the read is a longword, so the extent is `$18` — and `$283704 + $18 =
$28371C`, exactly where kind 34's body begins. An abutting bound, the same
evidence that settled `$2822EC`'s `$100`. Tables regenerated: **89 windows /
177,294 bytes.**

### MUTATION TABLE (family K)

| mutation | result |
|---|---|
| the wrap resets +$2C to $14 instead of $C | RED — `not ok 222`, alone |
| the table steps every frame (drop the +$2E gate) | RED — `not ok 222`, alone |
| the index steps by 2 instead of 4 | RED — `not ok 222`, alone |
| the index is decremented BEFORE the read | RED — `not ok 222`, alone |
| the table base is `$283708` | RED — `not ok 222`, alone |
| +$2C seeded byte-swapped as `$1400` | RED — `not ok 222`, alone |

**A SEVENTH "MUTATION" WAS NOT ONE, AND IT LOOKED LIKE A SURVIVOR.** Replacing
`setU16(+$2C, 0x0014)` with `setU8(+$2C,0)` + `setU8(+$2D,$14)` went green — and
it should have, because those are the same two bytes. It is an equivalent
rewrite, not a mutation. Reported here because a *first* reading of that green
row is "the half-swap is untested", and the honest reading is "the experiment
was invalid". `$1400` is the mutation that actually tests it, and it reddens.

`src/mover.js` restored and hash-verified byte-identical (`fee0d525b697afe6`);
**404 pass / 0 fail / 0 skipped**.

**Inventory: 28 → 29 initialisers, 28 continuations. 32 of 39 kind indices
covered; 8 distinct bodies remain (family H kinds 26/27/32/36/37/38, family J
kind 28, and kind 35).**

### 2026-08-04 — FAMILY H (CORE) PORTED (kinds 26, 27, 32)

The recon described family H as one shape: "optional trail emit, +$30 countdown
gate, then pos += +$28/+2A pair, counter +$2C -> dir += +$2E, counter +$36 ->
speed += +$38, recompute+store velocity". That is **kind 27 exactly**, **kind 32
with two pieces removed** (no trail, no gate), and **kind 26 not at all** — kind
26 has no drift, no steering and no velocity recompute. It is a sprite ring
whose bounds live in the record.

**KIND 26 IS THE FIRST DISPATCH EVER TO REACH `$283C8C`.** `w27targets.py` finds
exactly one reference to that epilogue in `$281000..$285000` and it is kind 26's
`bra.w`. W26 transcribed it as `epi283C8C` and it has sat unexercised since —
the same situation `epi2822AE` was in before family B reached it. Re-read
against the listing this session: `$283C8C` clears bit 8, writes renderOffs
`$FE00FE00` and graphic `$210`, then `bra.b $283C20` into the MIDDLE of the
`$283C0E` epilogue, so it skips `$283C0E`'s own `$FC00FE00`/`$410` and runs only
the direction lookup. **The transcription was right. Its ROM window was
missing**, exactly as before.

**AND THAT WINDOW IS NOT SPRITE-ONLY.** `$283C46` writes +$10 = frame + (+$14),
and kind 26's continuation uses +$10 as its RING LIMIT. Kind 26's initialiser
sets +$14 = `$3C`; the continuation steps the descriptor by `$14` and subtracts
`$3C` when it reaches +$10 — a THREE-frame ring whose bounds are computed in one
routine and consumed in another, with nothing in either naming the other. Window
`$2830EA + $24`, sized from the measured `$283C4C` offsets (0,4,8…$20 and back
down; max `$20`, longword read) and confirmed by the abutting bound: `$2830EA +
$24 = $28310E`, kind 26's continuation. **90 windows / 177,330 bytes.**

**`move.b (A0)+,(A0)+` AT `$28312E` IS `+$19 = +$18`.** Source read with
post-increment, then destination written with post-increment; with A0 at +$18 it
copies +$18 into +$19. It looks like a no-op. Read as one, kind 26 animates
every frame instead of every other frame.

**KIND 27 STARTS AT A GLOBAL-DEPENDENT ANIMATION PHASE.** `move.w $80390A,D0 /
lsr.w #2 / andi.w #3` then a `dbra` adding `$24` — descriptor = `$1BFED0` +
`$24`*(D0+1), one of four phases. Two kind-27 bullets spawned on different
frames are in different phases, and nothing in the record records which.

**KIND 27 DESTROYS ITS OWN SAVED VELOCITY.** `$28315A move.l $1e,$30` saves,
`$283160 clr.l $1e` clears — and `$28318C move.w #$20,$30` then OVERWRITES the
saved velA half with a `$20` countdown. Nothing restores +$1E. So this is *not*
the launch delay of kinds 19/22/24: the bullet has NO stored velocity at all
until its first steer fires and recomputes one. +$30 is a 32-frame BUDGET for
the drift, not a delay before it.

### TWO REAL GAPS AND ONE FALSE ALARM

| mutation | first result |
|---|---|
| drift pair swapped (+$28 <-> +$2A) | RED — `not ok 223` + `226` |
| kind 26's ring never wraps (limit not from +$10) | RED — `not ok 227` |
| kind 26 drops the `+$19 = +$18` reload | RED — `not ok 227` |
| kind 27's phase loop runs `phase` times, not `phase+1` | RED — `not ok 225` |
| kind 27's phase uses `>>3` instead of `>>2` | RED — `not ok 225` |
| kind 27's +$30 gate never expires | RED — `not ok 226` |
| kind 27's +$30 not decremented | RED — `not ok 226` |
| **recompute runs unconditionally (drop the D1 dirty flag)** | **GREEN** |
| **kind 26's epilogue given kind 2's table `$2821FA`** | **GREEN** |
| steer adds the whole word instead of its low byte | GREEN — *and correctly* |

**The third survivor is not one.** `add.b D0,$1b(A6)` and a word add truncated
to the destination byte are the SAME value, because the destination is a byte.
The mutation is an equivalent rewrite. The port's comment claimed a wrong turn
would result; that claim was false and **has been corrected in the source** —
an inaccurate comment in this port is a defect in its own right, since the
comments are the deliverable.

**The first survivor was a test that could not fail.** It wrote `$DEADBEEF` into
+$1E as a sentinel — which the PLAIN path then integrates into the position, so
the bullet flew out of bounds and the mover freed the slot *before the
continuation ran at all*. It passed for the wrong reason, over a branch it never
executed. Now it uses a small sentinel, asserts the sentinel differs from what a
recompute would write, and asserts the bullet is **still alive** after the frame.
Eleventh defective check on this project; the third this wave; and again it took
a mutation, not a reading, to find it.

**The second survivor is the third instance of one class**: kind 2 vs 21's
sprite tables, kind 30 vs 31's continuation address, and now kind 26's frame
table — *a body wired to a sibling's data, invisible because the shapes match*.
The fix pins the RESOLVED pointer against `$2830EA` walked the way the epilogue
walks it.

`src/mover.js` restored and hash-verified byte-identical through the battery
(`c136ae252e549ceb`), then the comment correction landed (`08a4e478248283a3`);
**409 pass / 0 fail / 0 skipped**.

**Inventory: 29 → 32 initialisers, 31 continuations. 35 of 39 kind indices
covered; 4 distinct bodies remain: kind 28 (family J, the splitter), kind 35,
and kinds 36/37/38.**

### 2026-08-04 — FAMILY H COMPLETED (kinds 36, 37, 38) + KIND 35

**KINDS 27, 36, 37 AND 38 ARE ONE BODY, FOUR TIMES.** A byte-for-byte compare of
the three $118-byte bodies against kind 27's finds 15, 16 and 17 differing
bytes, and every one is either a PC-relative displacement or one of exactly FOUR
constants — the descriptor BASE, the continuation address, the ring LIMIT and
the ring WRAP:

| kind | init base | wrap | limit | ring |
|---|---|---|---|---|
| 27 | `$1BFED0` | `$1BFEF4` | `$1BFF84` | `[$1BFEF4, $1BFF84)` |
| 36 | `$1BFF60` | `$1BFF84` | `$1C0014` | `[$1BFF84, $1C0014)` |
| 37 | `$1BFFF0` | `$1C0014` | `$1C00A4` | `[$1C0014, $1C00A4)` |
| 38 | `$1C0080` | `$1C00A4` | `$1C0134` | `[$1C00A4, $1C0134)` |

**Four consecutive $90-byte rings that tile `$1BFEF4..$1C0134`**, and in every
row `init base + $24 == wrap` and `wrap + $90 == limit` — four frames each. That
is twelve constants read separately out of four listings all agreeing on one
pattern, which is evidence a single transcription cannot produce. The
initialiser's base sits one step BELOW its ring because the phase `dbra` always
runs at least once.

**KIND 35 IS A SPEED RAMP, AND IT ONLY WORKS BECAUSE IT IS A BIT-7 BODY.** Its
template sets type-word bit 7, so the mover recomputes velocity from speed/dir
every frame and never reads +$1E. That is what makes `move.b #$0,$1a(A6)` —
SPEED ZERO — meaningful: the bullet appears motionless and the continuation adds
1 to its speed every fifth animating frame. Ported without knowing which mover
path it takes, "speed 0" reads as a harmless field write.

It carries the same `move.l $1e,$30` / `clr.l $1e` idiom as kinds 19/22/24/27,
and here the save is **doubly** vestigial: nothing restores +$30, and a bit-7
bullet never consults +$1E anyway. **Five bodies now share that idiom and only
two of them (19, 22) use it as a launch delay.** The idiom is not the meaning.

### THE NUMBER WRITTEN DOWN BEFORE IT WAS RUN WAS WRONG BY ONE

The port's comment said kind 35's first acceleration is "ten frames in". It is
**nine**. `bchg` reports the OLD bit and bit 11 is clear after the initialiser,
so the FIRST continuation frame animates — animating frames are 1, 3, 5, 7, 9,
and the underflow counter fires on the fifth of those. The test was written with
10 and went red; both the test and the source comment are corrected.

That is exactly the failure this project keeps naming: a number derived by
reasoning and recorded as if measured. It cost nothing here only because the
check was written to be able to fail.

### MUTATION TABLE (kinds 35/36/37/38)

| mutation | result |
|---|---|
| kind 37 given kind 36's ring | RED — `not ok 228`, alone |
| kind 38's init base set equal to its wrap | RED — `not ok 228`, alone |
| kind 35 does not zero its speed | RED — `not ok 229`, alone |
| kind 35 drops the bit-11 flip-flop | RED — `not ok 229`, alone |
| kind 35's counter fires on reaching 0, not on underflow | RED — `not ok 229` |
| kind 35 steps speed by 2 | RED — `not ok 229`, alone |
| the shared +$30 gate seeded `$10` instead of `$20` | RED — `not ok 225` + `226` |

Seven mutations, seven reds, no survivors. `src/mover.js` restored and
hash-verified byte-identical (`2f19549b90eefd51`); **411 pass / 0 fail / 0
skipped**.

**Inventory: 32 → 36 initialisers, 35 continuations. 38 of 39 kind indices
covered. ONE distinct body remains: kind 28 ($283260), family J -- the splitter,
which re-aims at the player via `$242748`/`$242296` and spawns through
`$2817C2`. It is the only kind still taking the loud named throw.**
