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
