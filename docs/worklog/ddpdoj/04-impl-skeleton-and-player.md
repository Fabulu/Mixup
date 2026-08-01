# WAVE 4 — the port skeleton and the player: "fly around"

status: DONE (with two named gaps: the OPTION object and the SPRITE-LIST entries
are not ported — §"What I could not do")
wave: 4   role: impl   started: 2026-08-01

All addresses are **VERSION-B** (`$23xxxx`–`$28xxxx`, 2002.10.07 BLACK VER)
unless a line says build A. Machine pin on every run:
`maincpu_fnv64=D4C25CA9C91B9D47`, 6,291,456 bytes; decrypted image
`sha256 4d3efd54ae0d1ae7ae9dbe3c242de7aa098b7edaf971e474c15f063a9ca88b8c`.

## The task, as I understood it

`PLAN-vertical-slice.md` §"Wave 4". First port code: `games/ddpdoj/src/`, the
seven-call main loop, counters per loop iteration, the ISR model with its
overrun gate, input mirrors, the object driver as a table walked in ORIGINAL
ORDER **with a work-budget hook from commit one**, and the player: position,
mover, sub-pixel handling, bounds, per-button speed modes, options. Verified
frame-exact, not approximated. Plus the four `NOTES-replay.md` constraints.

Inherited BLOCKING OPEN from `02-review.md`: **on a VERSION-B run the interrupt
handlers are build A's.** Re-measured before porting them (§1).

## THE HEADLINE

```
python games/ddpdoj/tools/oracle/pgm.py flyaround
  SEED   lf=2000  2200 logic frames compared (lf 2001..4200)
  COLS   31 compared: lf vf irq6 rel c390a c390d c390e p1raw p1edge p1prev
         p2raw p2edge objn objord objlive py px paccy paccx ptc ptilt pspd
         pang pst pf1 pdir pbtn anima0 anima1 animb0 animb1
  WALLHITS 284 ($261126) [x min, x max]
  MASKED pst bit $1000: differed on 109 of 2200 frames, first at lf2571
  DIGEST cdb190c5d71443997136054d8c4b4c7b605bf01e2ad249a4be552272e5ba776c
  RESULT 0 DIVERGENT FRAMES on 31 columns over 2200 logic frames
```

RED, all four mutations, each re-run and each seen:

```
clamp-first        RED OK: mutation 'clamp-first' diverged, as it must
edge-after-store   RED OK: mutation 'edge-after-store' diverged, as it must
no-tilt-decay      RED OK: mutation 'no-tilt-decay' diverged, as it must
lsr-not-asr        RED OK: mutation 'lsr-not-asr' diverged, as it must
```

The replay property, three runs, one digest:

```
node games/ddpdoj/tools/determinism.mjs ... --poke 810424=FF
  IN-PROCESS run 1: cdb190c5d71443997136054d8c4b4c7b605bf01e2ad249a4be552272e5ba776c
  IN-PROCESS run 2: cdb190c5d71443997136054d8c4b4c7b605bf01e2ad249a4be552272e5ba776c
  SUBPROCESS      : cdb190c5d71443997136054d8c4b4c7b605bf01e2ad249a4be552272e5ba776c
  IDENTICAL -- 2200 logic frames, 31 columns, three runs, one digest
```

```
node --test games/ddpdoj/tests/    18 pass, 0 fail, 0 SKIPPED
```

---

## What I MEASURED

### 1. The wave-2 defect, re-measured before one line of the ISR was written

`02-review.md` says the phase table's ISR rows name build-B addresses that never
execute. Confirmed independently here, and the port is written against build A's
chain accordingly:

* `$13D464` (build A's input read) and `$23D0F8` (build B's) are the **same
  eleven instructions**, byte pattern for byte pattern — `lea $C08000,A0 /
  move.w (A0),D0 / move.w D0,D1 / lsr.w #8,D1 / ror.w #1,D0 / ror.w #1,D1 /
  not.w D0 / not.w D1 / tst.b $803940 / beq / jsr / move.w D0,$803970 /
  move.w D1,$803976`. So the arithmetic would have been right either way and
  **only the addresses in the comments would have been wrong** — which is
  exactly how the wave-2 table survived review of its own numbers.
* The chain the port implements, read from the vector's value:
  `$13BDBA → $13C7D4 → jsr $13CFBA / jsr $13D464 / jsr $18ACC0 /
  tst.b $803940+beq $13C80C / jsr $141676,$140FFE,$141258,$185DC4 /
  subq.b #1,$803940 / jmp $13C4FC`.

`src/isr.js` carries all of it with the measurement in the header.

### 2. THE INPUT MIRRORS ARE A BIT-ROTATE, and the port derives them

`$803970` is **not** the port word. `p1raw = not(ror.w #1, $C08000)`, so every
bit moves and P2's low bit lands in P1's mirror. This is why the port's replay
input word is the RAW HARDWARE WORD and not the mirror: feeding the mirror in
would make `p1raw/p1edge/p1prev` un-compared.

New oracle column `portin` (`PROBE_PORTIN=1`, a read tap on `$C08000`; the
prefetch caveat does not apply, no instruction is ever fetched from I/O).

```
CENSUS input_port_reads_per_logicframe 1:4184 2:15 3:1
```

i.e. exactly one read per IRQ6, and the 2s/3s are dilated logic frames where the
LAST read is the one the mirrors carry. Measured mappings, each from a run:

| portin | p1raw | what |
|---|---|---|
| `$FFFE` | `$8000` | 1P Start alone → **mirror bit 15** |
| `$FF7F` | `$0040` | P1 Button 3 → **mirror bit 6** |
| `$FFFF` | `$0000` (p2raw `$7F80`) | nothing; p2raw's high byte is garbage (`lsr.w #8` zero-extends before the `not`) |

and the direction bits, each confirmed by which clamp answered:
**bit0 = +Y (`$6500` clamp), bit1 = −Y (`$800`), bit2 = −X (`$300`),
bit3 = +X (`$3500`)**, bit4/5/6 = Buttons 1/2/3.

### 3. THE MOVER, on VERSION-B, in full

The player is object dispatch type **2** (`$2491C0`, A6 = `$8103E6`); P2 is type
**3** (`$249246`, A6 = `$810448`, stride `$62`). Per-frame update `$2494FA`.

The whole of the movement is `$2417DE`:

```
$2417E0 D0 = ($1A,A6)          the SPEED INDEX
$2417E6 D1 = ($1B,A6) & $3F    the ANGLE, from $2552DC[stick nibble]
$2417EA tst.w $8130D2 / bne    -> zero vector
$2417F2 bsr $241812            (dy,dx)
$2417F4 add.w D2,($2,A6)       THE MOVE, straight into the record
$2417F8 add.w D3,($4,A6)
```

`$241812` was the one piece whose addressing looked wrong on paper — it indexes
a 65-entry table with `angle*4` — and the fold table settled it:

* `$200920` is a pointer table; entry *s* is `$200D20 + $208*s`, and each table
  is **65 entries of {dx:int32, dy:int32} covering ONE QUADRANT**, `(r,0)` at 0°
  to `(0,r)` at 90°. Level 0 is all zeros: a real "do not move".
* `$2418B4` is a **256-word triangle wave** `0,8,…,$200,$1F8,…,0` read at word
  index `angle*4`. It folds the full circle onto that quadrant, which is why the
  quadrant negation at `$241850/$241870/$241890/$2418B0` is not a double count.
  For the eight angles the stick can produce it returns
  `0, $100, $200, $100, 0, $100, $200, $100`.
* `asr.l #4` then narrows to a word. **Arithmetic, not logical** — the
  `lsr-not-asr` mutation exists because of it.

`$2552DC` = `ff 00 20 ff 30 38 28 ff 10 08 18 ff ff ff ff ff`. `$FF` is
"no direction" and it is returned for nibble 3 (up+down) and 0xC (left+right)
**while the direction bits are still set**, which matters — see §5.

### 4. THE SPEED MODES — measured, three of them, and the ramp's writer found

Scenario `speedmodes` (new, permanent), holding each button in turn while
pushing the stick. `pgm.py` + `PROBE_WATCH` on `$810400` (`$1A`, the index) and
`$810416` (`$30`, the applied ΔY):

```
lf=2201 p1raw=0x0001 speedIdx=22 appliedDy=246     base
lf=2601 p1raw=0x0021 speedIdx=28 appliedDy=313     + BUTTON 2
lf=2801 p1raw=0x0041 speedIdx=22 appliedDy=246     + BUTTON 3: NO CHANGE
lf=2401 p1raw=0x0011 speedIdx=22 -> 21 -> ... -> 12   + BUTTON 1: A RAMP DOWN
        appliedDy 246 234 223 212 201 190 179 167 156 145 134
lf=2481 (button released) speedIdx 13,14,...,22, one step PER FRAME
```

So on VERSION-B, TYPE-A: **base index 22 = 246 units/frame vertical and 163
horizontal; Button 2 held = index 28 = 313/208; Button 1 held = a laser ramp
from 22 down to the record's `($38,A6)` floor of 12, one step every 4 frames,
and back up one step per frame on release.** The build-A memmap recon's
"246 / 163 / 313 with Button 2 or 3" is confirmed on build B for 246/163/313,
and **corrected on Button 3: it does not change speed.**

The ramp's writers were not in the player handler. A write tap on `$810400`
(`objhunt.lua`, `OBJ_LO/OBJ_HI`) over the `speedmodes` run named them:

```
W pc=24C8CE n=25   W pc=24C900 n=19   (plus $2494C0 init, $249A74 respawn +6)
$24C8BE  move.b ($1a,A4),D0 / cmp.b ($38,A4),D0 / beq
         subq.b #1,($4b,A6) / bne ; subq.b #1,($1a,A4)      <- DOWN
         D0 = ($5a,A4); D0-=2; D0>>=1; D0+=4; ($4b,A6)=D0   (=4 with ($5a,A4)=2)
$24C8E4  ... cmp.b ($39,A4),D0 / beq ; addq.b #1,($1a,A4)   <- UP, every frame
```

A4 is the player record and **A6 is the OPTION record** — the ramp lives inside
the option object's update, which is one more reason the option is the next
thing to port.

### 5. THE CLAMPS — move past, then clamp, and give the overshoot back

```
$2495CA jsr $2417DE           the position is ALREADY MOVED here
$2495D0 ($30,A6) = D2 ; ($32,A6) = D3      the frame's velocity
$2495DC movem.w ($2,A6),D2-D3              re-read the MOVED position
$249608 cmpi.w #$300,D3 / bhi     ] and for each of the four bounds:
$24960E subi.w #$300,D3           ]   D3 -= bound          (the overshoot)
$249612 sub.w D3,($32,A6)         ]   the ACCUMULATOR loses it
$249616 move.w #$300,D3           ]   and the position is pinned
$24961A jsr $261126               ]   (`tst.w $81317A / clr.w $81316C`)
$2496E8 movem.w D2-D3,($2,A6)     THE STORE
```

Bounds, straight off the listing: **Y `[$800, $6500]` = 32.0–404.0 px,
X `[$300, $3500]` = 12.0–212.0 px**, all in 1/64 px. The X bounds are exactly
the build-A memmap numbers; the Y bounds are new on B.

Two order traps a port gets wrong silently, both now pinned by tests:

1. **Clamp-then-move is wrong ONLY AT A WALL.** That is the wave's required red
   validation and it took two attempts: the obvious mutation ("clamp the
   position on entry") **PASSED the whole 2,200-frame comparison**, because the
   position is already inside the box every frame. The mutation had to be the
   one a person would actually write — clamp, then add the vector, then store
   unclamped — which is why `src/player.js` carries a named `CLAMP_ORDER` seam.
   Once it was the right mutation it went red at **lf 2087** on `py`/`paccy`
   (`port=25875 board=25856`, i.e. 19 units of overshoot the board gave back).
2. **The no-direction path branches PAST the clamps** (`$2495C6 bra $24969C`),
   not merely past the horizontal blocks. With nibble 3 (up+down) the table says
   `$FF` while bit 0 is still set, so a port that let the vertical clamp run
   would clamp on a frame the board does not. Covered by a test and by the
   scenario (`3350=UD`, `3320=LR`).

### 6. The frame sync is a GOVERNOR, and one inherited statistic is wrong

`$23C212` is not an arm. It is a five-way decision ending in a dynamic governor
at `$23C272` that sums `$81B40C + $81295C + 2*$81295E`, compares it against a
threshold built from four PC-relative tables, and either arms **two** vblanks or
nudges a hysteresis counter at `$803932`. Ported in full in `src/framesync.js`;
the port threw `Unreached $23C272` on its very first run, which is what the loud
throw is for.

**And the census that supports "the divider paths have never executed" cannot
see them.** `armed_vblanks` counts the value of the write that takes `$803940`
from 0 to non-zero — and `$23C212` **always writes 1 first**, so the later
`move.b #$2,$803940` at `$23C248`/`$23C38A` is a non-zero→non-zero write the
census never records. The column that actually bounds it is
`irq6_per_logicframe` (1 on 4,184 of 4,200 fly-around frames). *The conclusion
survives; the statistic that supported it does not.* Same shape as wave 2's
correction to `gated_zero_release`.

Measured over the fly-around window: `$80392E`, `$803930`, `$803932` are 0 on
all 4,200 frames, so the governor runs on one frame in three and takes the
"load below threshold, counter already 0" path every time.

### 7. The object driver, and why `objn/objord/objlive` are real columns here

Ported as wave 2 measured it: 20 slots × `$50` at `$80E240`, walked forward,
**with the work budget checked in the original order before every dispatch**
(`src/budget.js`, `unitsPerFrame = NEVER_TRIGGERS`, truncation is a named throw
because (C) is unmeasured — wave 2 got `slots processed == slots live` on all
696 forced-overrun frames). Only types 2 and 3 are implemented; every other
dispatch is COUNTED (`$240F62 + type*8`) and printed by the runner.

For the comparison to mean anything the table has to be static, and it is:
`object_slots_live` is **8 from lf1969 to lf4200** on the fly-around run. That
was not free — see §8.

### 8. THE SCENARIO, and the two things that had to be true for it to exist

`fly-around`, 4,200 logic frames, seed at lf2000, 2,200 compared. All four walls
pinned, all four diagonals, single-frame reversals, both conflicting-stick
cases. Two design facts, both bought with a failed run:

* **NO BUTTONS.** Mirror bit 4 is the shot edge (`$249B48`), bit 5 the bomb
  (`$2497FE`), and **bit 6 is AUTO-SHOT**: `$2497B2` finds the byte at `$80380F`
  set to `$01` and synthesises a shot edge into `($19,A6)` on alternate frames
  (`bchg #4,($1,A6) / bset #4,($19,A6)`). Every button drives wave 5's code. The
  port's guard threw `Unreached $2497AA` the first time Button 3 was held —
  which is how this was found rather than assumed.
* **AN INTERVENTION: `$810424` (the player's `($3e,A6)` invulnerability timer)
  is held at `$FF` from lf1990, at the sample point, ON BOTH SIDES.** Without
  it, a button-free run of this script **dies at lf2469** — measured: the player
  record goes blank (`pspd 22 → 0`), the object table drops a slot, and every
  player column follows. `$FF` is a value the game itself writes at `$2495A2`
  and the branch that reads it (`$249524 cmpi.b #$ff`) is ported, so the poke
  changes WHETHER the ship dies and not WHAT any ported routine computes. Same
  rule wave 2 applied to the NOP sled. New `PROBE_POKE`/`PROBE_POKE_FROM` in
  `frame.lua`; `portdiff.mjs` applies the identical poke at the identical point.

### 9. Three oracle findings that are not port results

* **`PROBE_RAMDUMP` dumps the PRE-arm semaphore.** `frame.lua` reads RAM from
  inside the write tap and a 68000 write tap fires before the value lands, so
  `$803940` in the seed is 0, not the 1 the instruction is about to store. The
  first run of the comparison reported `rel: port=0 board=1` at the very first
  frame because of it. `Game` restores it (`opts.seedArm`, default 1) with the
  reason in the code.
* **MAME's two video-frame measures disagree.** `vf` (`screen:frame_number()` at
  the arm) vs the interrupt-ack census: **6 of 2,200 frames** differ, with
  deltas 0 and 2 (`lf3840 screen+0/irq6=1`, `lf4039..4044` alternating 2/0). The
  game reads neither. `portdiff.mjs` compares `vf` against the cumulative
  **vblank count** and prints `VFSKEW` for the rest; the column is therefore a
  restatement of `irq6`, and that is said rather than implied.
* **`pst` bit 12 is set by an unported routine and is masked, once, by name.**
  `bset #4,(A6)` at `$2458D8` is the collision test (`box overlaps → flag the
  record and OR $400 into (A5)`), found by a static search for the opcode and
  confirmed by the run: with invulnerability pinned the board flags 109 hits the
  ship survives. Collision is not ported in wave 4 (the brief says "the ship's
  hitbox IF REACHABLE"). The player handler clears the bit again at `$24952A`
  before any ported branch reads it, so the mask changes nothing the port
  computes — and the runner PRINTS the count on every run, because a carve-out
  nobody counts is a carve-out that grows.

---

## What I built

```
games/ddpdoj/src/
  machine.js     the machine + every address the port speaks in, cited
  ram.js         the board's 128 KiB, big-endian, and 68000 word arithmetic
  unported.js    Unreached (a LOUD NAMED THROW) and UnportedLog (counted)
  input.js       $13D464 the mirrors, $23D12A the edges
  isr.js         the IRQ6 model -- BUILD A's chain, with the (A) gate
  framesync.js   $23C212 and the $23C272 governor
  budget.js      THE WORK BUDGET. One constant. Counted, never timed.
  objdriver.js   $2410BC: 20 slots, original order, budget-checked
  vectors.js     $241812 and the animation tables
  player.js      $2494FA: dispatch types 2 and 3
  state.js       the compared columns, and the ONE masked bit, by name
  main.js        the seven-call loop
games/ddpdoj/tools/
  export-tables.py  ROM tables -> rip/port/ (gitignored twice over)
  portdiff.mjs      THE GATE: port vs board, first divergence PER COLUMN
  breakage.mjs      four named mutations, all seen RED
  determinism.mjs   the replay property: 2 in-process + 1 subprocess
games/ddpdoj/tests/player.test.js      18 tests, 0 skipped
```

Oracle changes (all opt-in; `pgm.py gate`'s recorded hash is unaffected because
every new column is off by default — re-verified, §"What I could not do" item 6):
`frame.lua` gains `PROBE_WATCH`, `PROBE_PORTIN`, `PROBE_POKE`/`PROBE_POKE_FROM`;
`pgm.py` gains `flyaround` (which reads the watch spec OUT OF `src/state.js`, so
the two sides of the comparison cannot drift, and asserts its own copy of the
symbols against `src/machine.js`); `scenarios.json` gains `fly-around` and
`speedmodes`; `pgm.py check` gains five wave-4 stages.

---

## What I could not do, and why

1. **THE OPTION OBJECT IS NOT PORTED.** `o0y/o0x/o1y/o1x` are read from the
   oracle and printed as NOT COMPARED, with the frame the board first moves them
   (lf2001, i.e. immediately). The wave's "done when" names option positions and
   this is the half of it I did not reach. What it needs is known and written
   down: the option is its own object with a `$20`-byte record at `$8104AA`,
   moved by `$24D130` through the SAME `$241812` vector routine with its own
   `($1A,A6)/($1B,A6)` and an `asr` scale (`#3`, then `#2` or `#1`), and snapped
   to the player by `$24C33E/$24C342` (`move.l ($2,A4),($2,A6)` — a LONGWORD, so
   both coordinates at once, and it fires the write tap twice), with a
   per-formation offset routine dispatched from `$24C384`. Its turn logic is
   `$24C310` (`($36,A6)` is the target angle, `($1B,A6)` steps 2 toward it).
   The laser speed ramp (§4) also lives in this object. I ran out of budget
   after the frame-sync governor turned out to be a governor.
2. **THE PLAYER'S SPRITE-LIST ENTRIES ARE NOT COMPARED.** They are built by
   main-loop call #4 (`$23D2AE`) out of a 12-byte request queue at `$80397C`
   that object handlers enqueue into — the whole sprite pipeline, which is wave
   6's integration job. What IS compared, and is the strongest available proxy,
   is the player's **animation records** `$8103F0`/`$8103FA` (`anima0/1`,
   `animb0/1`): `$249E4E` looks them up out of `$25533A`/`$2553CA` indexed by
   the bank counter `($4E,A6)`, so they move whenever the ship's drawn attitude
   moves, and `no-tilt-decay` red-validates exactly that.
3. **THE HITBOX IS NOT MEASURED.** Wave 2 item 6 was BLOCKED and stayed blocked.
   I did locate the collision test — `$2458C0`: `D4 = ($4,A6) + D6;
   D5 = D4; D4 += ($14,A6); cmp.w D3,D4 / bcs; D5 -= ($16,A6); cmp.w D5,D2 /
   bcs; bset #4,(A6)` — so the box half-extents are `($14,A6)` and `($16,A6)` of
   the record being tested, and the entry point for wave 5 is one write tap on
   those two words. That is a lead, not a measurement: I did not step a bullet
   across a pinned ship and I did not compare VERSION-A.
4. **TYPE-B (the second ship) was never exercised.** `($58,A6)` was 0 on every
   frame of every run. The animation tables are addressed
   `movea.l (A0,D0.w),A0` with `D0 = shipType*2` and the two pointers are 4
   bytes apart, so the selector must be 0 or 2 rather than 0 or 1; the exporter
   exports selector 0 only and the port throws on anything else. Plan §6 item 4
   already says the ship-select offers what is verified.
5. **P2 is ported but never exercised.** Dispatch type 3 shares the code path
   (`updatePlayer` keys off `($7,A5)`); no scenario has a second player.
6. *(not a gap — a check I owed and ran.)* **`frame.lua`'s three new env vars are
   inert by default, MEASURED.** Every new column is behind a variable the
   standard `trace()` does not set, so wave 2's recorded gate hash must survive
   this wave's edits, and it does:

   ```
   python pgm.py gate
     run 1: 635bb92f1a9dc81e968bab5e755f807e78c0c18538af5cfc8c29974520d84884
     run 2: 635bb92f1a9dc81e968bab5e755f807e78c0c18538af5cfc8c29974520d84884
     IDENTICAL
     CENSUS stack_guard_hits=0 below_$81FD00
     BUILD required=B frames_on_required=1901 frames_on_other=699
   ```

   That is the hash `02-impl-object-driver-and-overrun.md` and `NOTES-oracle.md`
   §"WAVE 2" record, to the character. No digest in the corpus moved.
7. **One frame of (B) dilation is unpredictable by design.** The board's
   `irq6_per_logicframe` is 2 on 15 of 4,200 frames and 3 on one. None of them
   fell inside the compared window on the committed run (`DILATED` printed
   nothing), but they will eventually, and the port cannot predict them: the
   budget is uncalibrated and COUNTED, never timed. `portdiff.mjs` reports them
   as board-side dilation, MAME-timed and uncalibrated, rather than as port
   defects. That is the plan's own §3 assumption 1 showing up in a report.
8. **The `speedmodes` scenario kills the player** (it fires, so it is played
   badly). It is a measurement scenario, not a comparison scenario, and it says
   so in `scenarios.json`.

## If someone picks this up cold

```
python games/ddpdoj/tools/export-tables.py     regenerate the ROM tables (rip/)
python games/ddpdoj/tools/oracle/pgm.py flyaround          THE GATE
python games/ddpdoj/tools/oracle/pgm.py flyaround --reuse --break clamp-first
node --test games/ddpdoj/tests/
node games/ddpdoj/tools/determinism.mjs <tsv> <seed.bin> --seed-lf 2000 --poke 810424=FF
python games/ddpdoj/tools/oracle/pgm.py check              everything, cheapest first
```

Six things that will save you the hours they cost me:

1. **The seed's `$803940` is 0 and the game's is 1.** `PROBE_RAMDUMP` runs
   inside the arm's write tap, before the write lands. Every downstream symptom
   looks like a broken ISR model.
2. **`armed_vblanks` cannot see a second arm.** It counts only the 0→non-zero
   transition, and `$23C212` always writes 1 first. Use `irq6_per_logicframe`.
3. **`$23C212` is a governor, not an arm.** If your port stops at
   `tst.w $803936`, that is the correct place to stop and `$23C272` is what to
   port next.
4. **Every button is wave 5.** Bit 6 is auto-shot via `$80380F`, not a free
   "hold something harmless".
5. **The obvious clamp mutation is a no-op.** "Clamp on entry" passes 2,200
   frames. The clamp order can only be broken from inside `$2494FA`.
6. **A write tap on `$810400` catches `$810401` too** (word-aligned range).
   `$2495B4` writes the ANGLE, not the speed index; the ramp is `$24C8CE` /
   `$24C900` and it runs in the OPTION's context, with A4 = the player.
