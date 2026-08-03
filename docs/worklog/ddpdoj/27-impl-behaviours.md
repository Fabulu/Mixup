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

(in progress)
