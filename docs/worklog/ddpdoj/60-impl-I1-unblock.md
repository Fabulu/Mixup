# 60 — IMPL: I1, `$2459D0` — THE PLAYER'S OWN BOX, the thing items wait on

status: **DONE** — see §4 (the measurement), §5 (collection is reachable),
§6 (what still blocks items) and §7 (26 mutants, 26 red).

started: 2026-08-05
role: IMPLEMENTER (SOLE writer to `games/ddpdoj/`; `games/gradius/` NOT TOUCHED)
target: `ddpdojblk` VERSION-B. Every address is build B (`$23xxxx`–`$2Axxxx`)
unless the line says otherwise.

**THE OWNER, PLAYING THE LIVE BUILD:** *"There's some bigger ships that show up
now and they're supposed drop powerups, which they don't. And I'm sure the
powerups don't work yet."*

Recon 59 §10 answers that with three waves and says the FIRST one is not items:
`$2459D0`, the player's own bounding box, is what `src/damage.js` defers
`$244D62` blocks 1–4 behind, and block 2 is the collection. **This wave is
`$2459D0` and only what it needs.**

`[M]` = measured by me this session, over
`games/ddpdoj/tools/oracle/out/maincpu.bin` (the decrypted build-B image,
address == file offset) through `tools/oracle/xref.py dasm`, and over the PORT
driven from the shipped bundle seed. **No MAME was run. Nothing here is compared
against the board.**

---

## 1. THE BRIEF'S PREMISE — CHECKED, AND IT HOLDS, WITH ONE ENLARGEMENT

Recon 59 §10/§11 says I1 is `$2459D0` + `$244D62` blocks 1–4 and that everything
item-shaped waits on it. **[M] That is right.** What it does not say, because it
did not disassemble the routine, is what `$2459D0` IS:

> **`$2459D0` is the player's box against the ENEMY BULLET POOL — the routine
> that decides the player has been shot.**

[M] `$2459EC lea $817F8E,A6` is `src/bullets.js`'s `BUL.pool` (`$817F8C`) **plus
2**, and `$2459F6`/`$245A02`/`$245A0E`/`$245A1A` are `BUL.window`
(`$81B414`/`$81B416`/`$81B418`/`$81B41A`) instruction for instruction.

**[M] AND THE BODY IS TEN-WAY UNROLLED.** `$245A26..$245C2A` is ten identical
52-byte copies with ONE `$245C2E dbra D6,$245A26` at the bottom, so the routine
is **610 bytes, not 52**, and its slot count is `(D6+1)*10`:

```
[M] D6 = #$6 / #$A / #$F / #$12 / #$14      ->  70 / 110 / 160 / 190 / 210
[M] src/bullets.js took the SAME five numbers from the SPAWNER's free-slot
    search at $281506, which is FIVE-way unrolled: 5*(D7+1) with
    D7 = $D/$15/$1F/$25/$29                 ->  70 / 110 / 160 / 190 / 210
[M] and $245902, inside block 9, walks the same pool at the same $40 stride
    NOT UNROLLED AT ALL ($24593C..$2459CA, one dbra, `lea ($40,A5),A5`):
    D7 = $45/$6D/$9F/$BD/$D1                ->  70 / 110 / 160 / 190 / 210
    -- and its `rts` is at $2459CE, two bytes before $2459D0 itself.
```

**Three unrollings of one ladder, three instruction streams, one answer**, and
the answer is written down nowhere in the cartridge. A reader who took
`$2459D0` for its first 52 bytes would have walked ONE bullet.
`tests/w60playerbox.test.js` asserts the ten-way and the five-way agree, which
is the only check that can catch either transcription drifting.

---

## 2. WHAT WAS PORTED

| ROM | bytes | what | where |
|---|---:|---|---|
| `$2459D0..$245C33` | **610** | the player's box + the 10x-unrolled bullet walk | `damage.js playerBox` |
| `$244D78..$244D92` | 26 | block 1: the live test, `clr.w $80FA7E`, the `jsr`, the re-test | `collisionPass` |
| `$244D94..$244DFD` | 106 | **block 2 — THE ITEM COLLECTION** | `itemCollisionBlock` |
| `$244DFE..$244E5B` | 94 | block 3 — impact pool A | `impactCollisionBlock` |
| `$244E5C..$244EDF` | 132 | block 4 — RAMMING, `$244ED2` one HP | `ramCollisionBlock` |
| `$244D40..$244D5D` | 30 | the no-shot entry, which also runs `$2459D0` | `tailNoPlayer` |

**Zero new export windows, zero new asset bytes, NO POOL ALLOCATED FROM,
`games/gradius/` untouched.**

Four things in there that a "tidy" port destroys, all from the listing:

* **`$244DE6 andi.w #$C0,D4` is transcribed as `$C0`.** Recon 59 §4.2:
  `$27F54C` sets item status bit 0 and `$27F582` bit 7, so this guard catches
  the at-max flag and NOT the normal one, and no writer of bit 6 exists.
* **`$245A3A moveq #$51`** rejects bits 0, 4 and 6 of the bullet's high byte —
  and bit 4 is the one the next instruction SETS, so the mask is its own
  idempotence. Bit 7, the LIVE bit, is **not tested**: a free slot whose stale
  position is inside the box is a hit.
* **Blocks 2, 3 and 4 use three DIFFERENT strides and three different empty
  tests** — `$40` on `+$02 == 0`, `$2C` on `+$00` bit 15 THEN `+$02 == 0`, and
  `$20` on `+$00` bit 15 — and block 2 reuses two half-extents where blocks 3
  and 4 read four.
* **`$244ED6 bra $244EE0` leaves the LOOP, not the routine.** `$244EE0` is
  block 5's first instruction, the same one the `dbra` falls through to.

Also corrected, from recon 59 §0's fourth row, after re-reading it myself:
[M] `$27F936 lea $817DC6,A0 / move.w #$9,D7` and `$8171BE + 70*$2C == $817DC6`,
so `$27F92A` is **impact pool A's reserved ten**, not the item family.
`src/handlers.js`'s two notes said `$816B7A`; both are fixed. [M] `$27E812` IS
the item family and its six `lea`s are exactly recon 59 §1's six bases with
D2 = 7/1/1/5/5/0.

---

## 3. THE THING THIS WAVE MAKES REACHABLE, AND WHY IT DOES NOT STOP THE BUILD

`$245A48 or.b #$10,(A4)` and `$244EC4 bset #$4,(A4)` set **bit 4 of `$8103E6`**
— the bit `src/player.js` tests at `$249542 bclr #$4,(A6) / bne $249F8A`, which
is a **loud named throw** and is THE PLAYER DEATH ROUTINE. [M] Inside it:
`$24A006 lsr.w #2,$81B646` quarters the rank power, `$24A014` clears the hyper
stock through `$286ED6`, and `$24A10E jsr $27E812` is the player's own item
drop.

**[M] It is not reached on this tree, and the reason is a SEED PROPERTY.**
`($3e,A4)`, the invulnerability byte, is `$FF` in the shipped bundle seed on all
6,185 measured frames; nothing under `src/` writes it; `$FF` is the "hold" value
`$24952E cmpi.b #$FF` refuses to decrement. So `$249524`'s arm runs and
`$24952A bclr #$4,(A6)` clears the flag every frame, before `$249542` is
reached. **On the board the invulnerability expires and the player dies.**
That is stated rather than relied on, and it is the first thing to re-measure
when anything writes `($3e,A4)`.

---

## 4. THE MEASUREMENT — W34's method, with a no-fire control AND a tree control

`games/ddpdoj/tools/w60boxgate.mjs` (committed), from the shipped bundle seed.
The PORT replayed; the fire input is an INTERVENTION (`docs/knowledge/09`) and
the tool says so.

Every run stops in the same place on both trees — `UNPORTED $292902`, the
stage-1 boss, W34's own frontier — at step **6,185** (none/tap) and **5,870**
(hold).

| over 6,185 frames | `--no-fire` (CONTROL) | tap | hold (5,870) |
|---|---:|---:|---:|
| `$2459D0` runs, via `$244D62` | 3,093 | 3,093 | 2,935 |
| ...via `$244D40` | 3,092 | 3,092 | 2,935 |
| player flagged by a BULLET | **251** | 105 | 113 |
| player flagged by a RAM | **496** | 206 | 196 |
| `$80FA7E` set | 363 | 167 | 171 |
| block 2 walks / records flagged | 0 / 0 | 0 / 0 | 0 / 0 |
| block 3 walks / records flagged | 0 / 0 | 0 / 0 | 0 / 0 |
| block 4 rams / HP removed / kills | 496 / 496 / **0** | 206 / 206 / **0** | 196 / 196 / **0** |
| `($3e,A4)` | `$FF` x 6,185 | `$FF` | `$FF` |
| bullet window | 70 slots | 70 | 70 |

**`$2459D0` RUNS TWICE PER FRAME AND THE SPLIT IS THE POINT.** `$81308C` is 1,
so the tail alternates on `$80390C`: the frames P1 does not get `$244D62` it
gets `$244D40`, which is `$2459D0` and nothing else. The shot-vs-enemy check is
a 30 Hz check (W34 §2.1); **the player-vs-bullet check is a 59 Hz one**, and
reading `$244D40` as "the pass minus everything" hides that.

Note the control has MORE flags than the firing runs, which is the right way
round: fire kills the things that would have shot and rammed.

### 4.1 THE TREE CONTROL — the ledger, W60 against `HEAD`

`git show HEAD:...damage.js` swapped in, same seed, same frames, sha256 verified
byte-identical on the way back (`cb323f36bb3f1ba1`).

| 6,185 frames | tree | kills | kill score | chain | `$81B646` | `$81B64A` | `$81B65C` | `$81309E` |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| no fire | HEAD | 0 | 0 | 0 | 0 | 0 | 0 | 53 |
| no fire | **W60** | 0 | 0 | 0 | 0 | 0 | 0 | 53 |
| tap | HEAD | 296 | 5,771 | 662 | 0 | 0 | 0 | 53 |
| tap | **W60** | **298** | **5,787** | **664** | 0 | 0 | 0 | 53 |
| hold | HEAD | 242 | 5,132 | 583 | 0 | 2,136 | 0 | 53 |
| hold | **W60** | 242 | 5,132 | 583 | 0 | 2,136 | 0 | 53 |

**THE ANSWER TO THE BRIEF'S RANK QUESTION: NO RANK WRITE BECAME REACHABLE.**
`$81B646` (recon 59 §5.1's power term), `$81B65C` (the hyper stock recon 59 §5.2
calls +16 rank permanently) and `$81309E` are digit-for-digit unchanged in all
six runs, and `$81B64A` is unchanged too. Two things must be said with that,
because either alone would mislead:

1. **The SCORE and CHAIN ledger DID move**, by two kills, in the tap run. Block
   4 itself killed nothing (`hp1` never went negative across 898 rams); the
   −1 HP made two enemies die to SHOTS that otherwise survived the window.
   **Ramming is an indirect producer of score, and this wave measured it as
   +2 kills / +16 / +2 chain over 6,185 frames.**
2. **`$81309E` cannot move in this port at all**, whatever this wave did:
   [M] `$2608D2` and `$260794` — object type 10, the rank recompute — are
   ABSENT from `src/`, so rank is frozen at its seeded 53. "No rank write
   became reachable" is true, and it is *partly* true for a reason that
   predates W60 and that a later wave must not read as a W60 result.

**THE FRAME POSITION of the two writes that did move:** unchanged from W34 §5.
Block 4 writes an HP word and the player's hit bit and calls nothing — no
`$286096`, no `$28615E`, no rank word. A ram-assisted kill's score is written
later, by the ENEMY's own death arm, at the instruction that handler reaches,
i.e. at the enemy driver's dispatch position, which the port has reproduced
since W29. **No write this wave adds chose its own place in the frame.**

---

## 5. IS COLLECTION REACHABLE? — YES, and it is proved with a labelled POKE

Nothing in this port can spawn an item (`$27E812` is a counted note; `$27E99E`
is type-5 call #18, listed in `src/type5.js calls[17]` and not made), so
`$8171BA` is 0 on every frame of every run above and block 2 walks nothing.
That is a fact about the port, not about the block. `tools/w60boxgate.mjs
--items N` writes N item records into `$816B7A` and the count into `$8171BA` by
hand, and prints POKED on every row it produces:

```
[M] MODE none  --items 25 (POKED)  frames 600
      $2459D0 runs      301 via $244D62 block 1 + 300 via $244D40
      BLOCK 2 (items)   301 walks, 7525 records flagged      == 25 x 301
      ITEM POOL CENSUS  max live 25 of 25, max $8171BA 25,
                        count-vs-slots disagreements 0
```

**The `or.w $80FA72,(status)` lands. Collection is reachable; the gate recon 59
named is gone.**

### 5.1 THE POOL CENSUS — E5b's standard, and the honest answer

**This wave allocates from NO pool.** Blocks 2, 3 and 4 write into records that
already exist; `$2459D0` writes into the bullet pool the bullet driver owns.
The census is run anyway, every slot every frame over the whole 6,185-frame
window, and reconciled against `$8171BA`:

```
[M] max live slots 0 of 25, max $8171BA 0, count-vs-slots disagreements 0
    -- in all three input modes, on both trees.
[M] under --items 25: max live 25 of 25, max $8171BA 25, disagreements 0.
```

There is nothing to leak, and the census says so rather than the wave asserting
it. W33's leak appeared at frame 2,906; this window is more than twice that.

---

## 6. WHAT STILL BLOCKS ITEMS — all of wave I2, by address

`$2459D0` was the gate, not the work.

| unported | what it is |
|---|---|
| `$27E812` | the item ALLOCATOR — a counted note in `handlers.js deathSeq85`, with the D0 arithmetic and the `$81308C` gate already transcribed |
| `$27E99E` | the DRIVER, type-5 call #18, listed in `type5.js calls[17]` and not called |
| `$27F6AE`, `$27F746` | the record fill and the 8-entry template table (entries 6 and 7 run into code) |
| `$27EA2A`, `$27EBDC`, `$27ED8C`, `$27EF50`, `$27F1A6`, `$27F254` | the six kind bodies |
| `$27F2F0`, `$27F54C`, `$27F582`, `$27F5F4`, `$27F656` | the free, the two collect tails, the two animation steppers |
| `$252C96`..`$25313D` | the ten collect routines |
| `$286128` | the item score adder, absent from `src/score.js` |
| 139 sprite streams | 0 of 139 in the shipped sheet |

**So an item still cannot exist, cannot be drawn, cannot be collected and cannot
be scored — but the collision that flags it now runs.** That is exactly the
boundary recon 59 drew between I1 and I2, and I1 does not cross it.

Block 3 is in the same position for a different reason: `$817F7E` is 0 and stays
0 because `$27F8F8`, impact pool A's only allocator, is a counted note (W51
§3.1) whose driver `$27F95A` — type-5 call #4 — is unported.

---

## 7. EVERY CHECK WAS SEEN TO FAIL — 26 mutants, 26 RED, 0 survivors

`games/ddpdoj/.scratch/mutate60.mjs`: apply ONE edit with a single-occurrence
anchor assertion, run ONE test file, require a NAMED test red, restore, and
**verify the file's sha256 is byte-identical** (the harness exits 2 on a
mismatch). Every restore matched; `src/damage.js` is `cb323f36bb3f1ba1` before
and after all 26.

| # | mutation | first NAMED test red |
|---|---|---|
| M1 | `$2459DA` uses `($10,A4)` for both long bounds | `...FOUR different half-extents` |
| M2 | `$2459E4` uses the LONG extents on the short axis | same |
| M3 | the ten-way unroll read as a plain `dbra` | `...TEN-WAY UNROLLED` |
| **M4** | the ladder cascades past a zero rung | **GREEN, then RED** |
| M5 | `$245A3A moveq #$51` read as `#$50` | `...rejects on $51` |
| M6 | ...read as `#$D1`, i.e. testing the LIVE bit too | same |
| M7 | `$245A52 bra` read as a `continue` | `...RETURNS -- one bullet per pass` |
| M8 | `$245A48 or.b D4,(A4)` dropped | same |
| M9 | `$245A44 or.b D4,(-$4,A6)` dropped | same |
| M10 | `$245A28 cmp.w D4,D0/bcs` operands swapped | `...rejects on $51` |
| M11 | `$244DE6 andi.w #$C0` tidied to `$81` | `BLOCK 2's guard is $C0` |
| M12 | block 2 `bra`s out after a flag | `BLOCK 2 keeps walking` |
| **M13** | block 2's stride read as `$3E` (the `lea`) | **GREEN, then RED** |
| M14 | block 2 empty-tests `+$00` like the driver | `...LIVE COUNT, at a LITERAL $40` |
| M15 | block 3's stride read as `$28` (the `lea`) | `BLOCK 3 stride is $2C` |
| **M16** | block 3's guard read as `$C0` over `+$00` | **GREEN, then RED** |
| **M17** | block 3 reuses two extents where four are read | **GREEN, then RED** |
| M18 | `$244EB0 andi.w #$1` type gate dropped | `BLOCK 4: the $1 type gate` |
| M19 | `$244EBE bcc` read as `bcs` | `BLOCK 4 rejects a Y at or above $F800` |
| M20 | block 4 keeps walking after a ram | `BLOCK 4: ...leaves the LOOP` |
| M21 | `$244EC4 bset #$4,(A4)` put on the ENEMY | same |
| M22 | `$244D7E clr.w $80FA7E` dropped | `$244D7E clears $80FA7E` |
| M23 | `$244D8A tst.w/bne` dropped | `$244D8A: a bullet hit SKIPS...` |
| M24 | the `$2800` bias applied to the box only | `BLOCK 2 flags an item...` |
| **M25** | `$244D40` does not run `$2459D0` | **GREEN, then RED** |
| **M26** | the blocks walk CAPACITY, not the live count | **GREEN, then RED** |

**SIX SURVIVED THE FIRST PASS AND ALL SIX WERE DEFECTIVE CHECKS OF MINE.** None
was uncatchable, which is the distinction W31 asked later waves to keep:

* **M13 — A CHECK THAT SEEDED ITS OWN ANSWER, and it is the exact shape
  `docs/knowledge/03` names.** The stride test placed its records at
  `slot * DMG.itemStride` and then asserted on a record found through the same
  constant, so it agreed with itself whatever `itemStride` held. The records are
  now at LITERAL `$40` byte offsets. This project has shipped that shape twice
  before; it nearly shipped a third time here.
* **M4, M16 and M17 — fixtures sitting where two readings agree.** M4's ladder
  was only ever raised in order, where "break at the first zero" and "skip a
  zero" cannot differ; it now leaves a GAP. M16's rejected record set bit 7,
  where `tst.b +$01` and `andi.w #$C0` over `+$00` give the same answer; it now
  also drives BIT 6, where they differ. M17's box was loose enough that both
  extents fell inside it; block 3's four extents are now four DIFFERENT values
  and each of the four boundaries is asserted at the boundary and one off it.
* **M25 — the right assertion, run against the wrong file.** It was pointed at
  `tests/w34damage.test.js`, whose `$244D40` assertions the mutation leaves
  true. Pointed at the file that owns the claim.
* **M26 — no test at all.** Nothing asserted that the blocks walk `$8171BA`
  rather than the pool's 25 slots. Three items in the box with the count at ONE
  now pin it, with the count at THREE as the control that makes it a statement
  about the counter and not about the box.

Unit tests: **706 -> 727 pass, 0 fail, 0 SKIPPED.** New file
`tests/w60playerbox.test.js` (21 tests); `tests/w34damage.test.js` gained two
INVERTED assertions rather than deleted ones — `$2459D0` must no longer appear
as a deferral note, and the `$28B706` arms must now report `boxRun` with no
`anyShot`.

---

## 8. THE GATE, AND THE PAGE

```
python games/ddpdoj/tools/oracle/pgm.py check
VERDICT: ALL GREEN -- 51 passed, 0 failed, 0 SKIPPED
node --test games/ddpdoj/tests/     727 pass, 0 fail, 0 SKIPPED   (was 706)
```

**Nothing was disabled, skipped, narrowed or loosened.** No compared column set,
window or frame count moved and no stage was added. The stages this wave could
plausibly have broken all pass, and two are worth naming because the player's
box is now live inside them:

* **`fly-around: port vs board, 0 divergent frames`** — the 2,200-frame
  port-vs-board window, with `$2459D0` now running on EVERY frame of it (once
  through `$244D62`, once through `$244D40`). It stays 0 divergent.
* **`midboss DEATH` and its `RED [no-kill]` control**, whose enemies are the
  ones block 4 can now ram.

### 8.1 THE BROWSER, LOCAL AND DEPLOYED

E3 found the deployed build showing no beam where the same code drew one
locally, so both were driven, with the same script: 10 s boot, 15 s idle, then
**45 s of Button 1 HELD with the ship sweeping left and right** — the owner's
own script from `docs/knowledge/09`, and the input that makes the ship RAM
things, which is block 4. Chrome via `playwright`; the local server was killed
afterwards (`.scratch/w60browser.py`).

| | LOCAL (`python -m http.server`) | **DEPLOYED** `https://gbtman.pages.dev/games/ddpdoj/` |
|---|---|---|
| boot | lf 2550, clk 162 | lf 2548, clk 162 |
| after 45 s of held fire + sweeping | **lf 6190, clk 361** | **lf 6160, clk 359** |
| `#err` panel | **EMPTY** | **EMPTY** |
| page errors | one 404, `/favicon.ico` | **NONE** |
| shards | 8/8 | 8/8 |

Build `20260805053512`, confirmed on three consecutive polls. The two runs agree
to the frame-pacing noise, so this is not an E3-class local/deployed gap. The
screenshots show the ship firing at the bottom of the road with enemy bullets on
screen and tanks coming apart — i.e. **the frames on which `$2459D0` is
flagging the player are ordinary playing frames, and the build does not stop.**

---

## 9. WHAT I COULD NOT DETERMINE

* **Whether the board flags the same bullet on the same frame.** Nothing in this
  wave is compared against the cartridge. No scenario in this repo records
  `$80FA7E`, `$8103E6` bit 4 or the bullet pool's type-word bytes, and I did not
  build one. `fly-around` is 0-divergent with `$2459D0` live, but its compared
  columns do not include any of the three words this wave writes, so that is
  **evidence of no regression, not evidence of agreement.** The obvious next
  measurement is one write tap on `$245A44` on both sides.
* **What the board does when the invulnerability expires.** §3: the port's
  `($3e,A4)` is `$FF` forever because nothing writes it, so `$249F8A` is
  reachable in the ROM and unreached in the port. I did not port `$249F8A`
  (it is `$24A0E0`'s whole death/respawn machine, and its `$24A10E jsr $27E812`
  is item work), and I did not clamp anything to keep it away — it is the same
  loud named throw `src/player.js` has carried since wave 4.
* **The frame position of `$244D62` relative to type 10.** Recon 59 §9.4 and
  `38-recon` §7.1 both leave the object slot order unresolved, and this wave
  did not settle it. It does not bite yet — no rank write became reachable —
  but it will the moment `$2608D2` ships.
* **`$8171BC`.** Recon 59 §1 calls it a separate spawn-variant counter written
  by fill B (`$27F6E4`). `$244D62` never reads it, so I neither ported nor
  modelled it; I only checked that it sits between the item count and impact
  pool A's base, which is what makes the 25-slot geometry close.
* **Whether the two extra kills in §4.1 are the board's.** They are a
  consequence of `$244ED2`, which is transcribed; whether the board's ram lands
  on the same enemy on the same frame is the first bullet above.

---

## LOG (appended as findings arrived)

- opened. Read `59-recon-items`, `34-impl-damage`, `51-impl-laser-damage`,
  `54-impl-E5b-explosions`, HANDOVER, `docs/knowledge/09` and `10`,
  `src/damage.js`.
- **[M] `$2459D0` IS 610 BYTES AND TEN-WAY UNROLLED**, and it is the PLAYER vs
  the ENEMY BULLET POOL — `$817F8E` is `bullets.js`'s own pool + 2 and the
  four-rung ladder is its own `BUL.window`. Three unrollings of that ladder
  exist in build B (10-way here, 5-way at `$281506`, none at `$245902`) and all
  three give 70/110/160/190/210.
- **[M] IT MAKES `$249F8A` — PLAYER DEATH — REACHABLE**, and the only thing
  stopping it on this tree is that the seed's `($3e,A4)` is `$FF` forever.
- **[M] PORTED**: `$2459D0` and `$244D62` blocks 1, 2, 3 and 4, plus `$244D40`.
  Ledger row L16 is retired. No pool is allocated from.
- **[M] COLLECTION IS REACHABLE**: 301 block-2 walks and 7,525 flags under a
  labelled 25-item poke, `or.w $80FA72` landing on every one.
- **[M] NO RANK WRITE BECAME REACHABLE.** `$81B646`/`$81B64A`/`$81B65C`/
  `$81309E` identical between HEAD and W60 across three inputs — and `$81309E`
  cannot move at all, because `$2608D2` is absent from `src/`.
- **[M] BUT SCORE AND CHAIN DID MOVE**: ramming's one HP turned 2 shot-kills
  that the HEAD tree did not get, +16 score and +2 chain over 6,185 frames.
  Their frame position is the enemy driver's, unchanged from W34 §5.
- **[M] A PORT NOTE FIXED**, recon 59 §0 row 4 reproduced independently:
  `$27F92A` is impact pool A's reserved ten at `$817DC6`
  (`$8171BE + 70*$2C`), not the `$816B7A` item family.
- **[M] 26 MUTANTS, 26 RED, 0 SURVIVORS** — and six survived the first pass,
  all six defective checks of mine (§7). One of them, M13, was a check that
  seeded its own answer through the very constant it was testing: the shape
  `docs/knowledge/03` names and that this project has shipped twice before.
- **[M] GATE ALL GREEN — 51 passed, 0 failed, 0 SKIPPED**; unit tests
  706 -> 727. Nothing disabled, skipped, narrowed or loosened.
- **[M] DRIVEN IN CHROME, LOCAL AND DEPLOYED**, 45 s of held fire with the ship
  sweeping: `#err` EMPTY on both, lf 6190/clk 361 local against lf 6160/clk 359
  on build `20260805053512`. No E3-class local/deployed gap.
- `games/gradius/` NOT TOUCHED (`git diff --name-only` over both W60 commits
  returns no `games/gradius/` path).

status: **DONE**
