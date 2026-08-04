# 28 — recon: what EXACTLY remains before DaiOuJou stage 1 is complete

status: IN PROGRESS
started: 2026-08-04
role: recon (read-only; the only file I wrote is this one; no commits)
target: `ddpdojblk` **VERSION-B**, decrypted image
`games/ddpdoj/rip/rosetta/img-ddpdojblk.bin` (6,291,456 B, address == file
offset — verified by decoding known routines at their addresses)

**THE QUESTION.** "Stage 1 complete" has a precise definition:
`games/ddpdoj/PLAN-no-recordings.md` §1 — the CAPTURE LEDGER empty and
`games/ddpdoj/assets/capture.bin` deleted, every pixel produced by ported code.
`27-OWNER-sound-queued-after-stage-1.md` makes that the trigger for the sound
round, so the answer has to be defensible.

**METHOD.** `docs/knowledge/09` — enumerate statically from the ROM, then
validate. Every count below marked **[M]** is one I measured in this session
with capstone 5.0.7 over the image named above, or by reading
`games/ddpdoj/src`. Counts marked **[CITED]** name the document they come from
and were **not** re-measured by me. Coverage is branches and table entries,
never frames.

**IN-FLIGHT.** An implementer is writing `games/ddpdoj/src/mover.js` right now
(W27, families A–L). Every mover number below is a snapshot of the file at
**2026-08-04 06:26** and says so.

---

## 0. THE HEADLINE, FIRST

Three facts decide the answer, and the first is not on the ledger at all:

1. **[M] The ported enemy and bullet subsystems are not connected to anything
   that runs.** `src/spawn.js`, `src/handlers.js`, `src/mover.js` and
   `src/turret.js` are imported by **no module under `src/`** — only by their own
   tests and their own gates (`grep` for every import of each file across
   `src/`, `tests/`, `tools/`). `Game.step()` (`src/main.js:228`) runs the object
   driver over `defaultHandlers()`, which holds **4 of the 20** top-level
   dispatch entries (1 background, 2/3 player, 5 partial) and reaches none of
   W21–W27's code.
2. **[M] The board's own wiring point is a list of 23 calls, and the port has
   1.** Top-level type 5 = `$28B5E0`; `$28B5E0..$28B66A` is 23 consecutive
   `jsr`s and nothing else. Call #2 is `$2634F4` — the spawn walker plus the
   58-slot enemy driver (`$263502`, `$81332C`, `move.w #$39,D6`). Call #20 is
   `$281D9A` — the bullet driver whose mover W26 ported. The port implements
   call #8, `$253A70` (player shots). **1 of 23.**
3. **[M] The page still draws the recording.** `src/web/app.js:322 draw()` takes
   the capture's frame state and replaces `st.bg` and four scroll registers with
   the port's; the display list is still `capture.bin`'s `spritebuffer` with
   eight records spliced in. `assets/capture.bin.gz` (67,630 B) is on disk and
   `manifest.capture.layout` still supplies **palette, spritebuffer, tx,
   rowscroll, zoomram** per frame [M].

So: the background is genuinely the port's, the ship is genuinely the port's,
and **everything else in the picture is still 161 recorded frames** — not
because the code does not exist, but because for the enemy half the code exists
and is not plugged in.

---

## 1. THE LEDGER, ROW BY ROW

Rows L1–L18 as `20-plan-level-and-patterns.md` §1 defines them.

### L1 — the contents of the thirty sprite buckets

- **Produced:** `PRODUCED_BUCKETS` in `src/main.js:50` = **4 of 30** — 5
  (shadows), 14 (shots), 15 (pods), 19 (ship) **[M]**.
- **Still the capture's:** 26 buckets, including every bucket that carries the
  fight. **[M]** No file under `src/` outside `player.js`/`options.js`/
  `shots.js` calls the enqueue API: `grep enqueue` over `handlers.js`,
  `mover.js`, `turret.js`, `spawn.js`, `initbody.js`, `movement.js` returns
  **zero** call sites. Buckets 0, 7, 22, 23 and 20 have no producer at all.
- **Weight, arithmetic mine over W11's measured ablation table**
  (`11-impl-display-list-keystone.md` §6, pass 1, four frames of
  `stage1-open`) **[CITED numbers, my sum]**: 121,460 sprite pixels lost across
  all buckets; the four produced buckets account for **10,798 (8.9 %)**; bucket
  0 alone is **87,545 (72.1 %)** and has no producer.
- **Blocks:** everything visible. L10, L11, L12, L13 cannot show a pixel until
  their producers enqueue.

### L2 / L3 — ship, pods, aura, glow, shadows

**REPLACED** (W12), with the standing caveat from `12-review.md` F3 [CITED]
that words 4–7 of eight records still come from the capture's own list slots.
Confirmed structurally: `app.js` splices the port's records into the recorded
list rather than building the list from producers **[M]**.

### L4 — player shots

- **[M]** `src/shots.js` and `src/weapons.js` reference all four reached shot
  handlers (`$253B1E $253E34 $253BDA $253EC6`), and bucket 14 is in
  `PRODUCED_BUCKETS`.
- **[M]** What is missing is PIXELS: `assets/manifest.json` `spr.streams` holds
  **166** sprite streams and `tools/export-web.mjs` builds that set by walking
  the **capture's** display-list records (the ship's 16 bank frames are the only
  by-address harvest). A shot the recording never contained has no art.
- **Verdict:** the logic side is done, the asset side is open, and it is the
  same asset problem as L10–L13. See §4.

### L5 — video registers

- **REPLACED for bg x/y and tx scroll** (W13) **[CITED `13-impl`]**.
- **[M] Still the capture's:** `ctrl`, `bg_scale`, `rowscroll` (4,096 B/frame)
  and `zoomram` (64 B/frame) are still layout entries in
  `manifest.capture.layout` and still what `render/index.js` consumes.
  `src/zoomtable.js` exists, so zoomram is a duplicate rather than a gap;
  `ctrl`/`bg_scale` are two constants with named writers.
- **Size: tiny.** Two register constants plus deleting three capture parts.

### L6 — BG tilemap ring and its motion program

**REPLACED, program half** (W13/W16). **[M]** The remainder is one dependency:
`Game`'s constructor takes `opts.bgSeed = cap.part(0,'bg')` — 63 ring columns
the board wrote before the recording began (`src/main.js:96-102`,
`src/web/app.js:243`). Deleting `capture.bin` requires the port to build the
ring from the stage's own column stream at stage entry (the pre-fill `$2611FC`
is ported; what is missing is starting at the stage's beginning instead of
mid-stage).

### L7 — BG tile pixels + palette

**Effectively REPLACED.** **[M]** `manifest.gfx.bg.tiles = 2026` in eight
shards, `map.ncols = 224`, `secondMap.entries = 207`, palette 1,024 words
exported with `agreesWithBoard = 1020`. **Open remainder: 4 palette entries**
(bank 21 pens 0..3) animated by an unported routine — that is L14, not L7.

### L8 — the TX tilemap (HUD, score digits, all text)

- **[M] Nothing is ported.** `grep` for `240CF0` / `240D2C` over `src/` returns
  **zero** hits.
- **[M] Denominator:** the block printer `$240CF0` has **8** absolute call sites
  (`$23CDA0 $256F3E $256F68 $256F8E $257BAE $259FE8 $25A13A $25A166`) and
  `$240D2C` has **3** (`$24101E $25A6D0 $25A758`) — **11 call sites**, which is
  the number `20-plan` §3 W19 predicted, now measured.
- **Blocked by:** nothing. It is a small, self-contained wave that W19 deferred.

### L9 — the score/chain VALUES

- **[M] Nothing is ported.** `grep 286626` over `src/` — zero hits.
- **[M] Denominator:** the BCD adder `$286626` has **0** absolute references and
  **24** pc-relative `bsr`s inside `$230000..$2A0000`. (`19-impl` says 28
  pc-rel callers [CITED]; my scanner decodes `bsr.b`/`bsr.w` only and does not
  see `jsr (d16,PC)`, so treat 24 as a floor, not a refutation.)
- The enumeration exists (`19-impl-score-chain-rank-ledger.md`) [CITED]. The
  port does not.

### L10 — the enemies

This is the largest row, and it is the one whose true state is most easily
misread. Measured denominators, all mine:

- **[M] The type table is two halves, stride 8, 256 entries**: `$267824` for
  types `$00..$7F`, `$27E412` for `$80..$FF` (read out of the dispatcher
  `$2635F6`: `lea $267824 / cmpi.w #$80 / lea $27E412 / lsl.w #3 /
  movea.l (A0,D7.w),A1 / jsr (A1) / addq.w #8,A1`). Dummy init `$27E402`×88 and
  `$267814`×42; dummy handler `$27E40A`×88 and `$26781C`×42. So **126 live
  types, 111 distinct real handlers, 115 distinct real init bodies** — three
  numbers that reproduce `20-plan` §1 exactly, independently.
- **[M] Stage 1's script**: `$230C6C`, 8-byte records, terminator word `$FFFF`
  at `$231704` → **339 records, 21 distinct types, 19 distinct handlers**.
- **[M] Handlers ported** (`HANDLERS` map, `src/handlers.js:497`): **6 of 19**
  for stage 1, **6 of 111** for the cartridge.
- **[M] Spawn-record coverage**: those 6 handlers own **270 of 339 records =
  79.6 %**. The 13 unported handlers own **69 records = 20.4 %**.

| type | records | handler | ported |
|---|---|---|---|
| `$11` | 104 | `$2688CC` | yes |
| `$07`+`$27` | 64 | `$26A2E2` | yes |
| `$82` | 33 | `$2747C6` | yes |
| `$05` | 28 | `$269CEA` | yes |
| `$8B` | 25 | `$27687E` | yes |
| `$10` | 16 | `$268232` | yes |
| `$08` | 12 | `$26A5E4` | — |
| `$0B` | 12 | `$26AD28` | — |
| `$8A` | 10 | `$276702` | — |
| `$89` | 7 | `$27733E` | — |
| `$09` | 7 | `$26A860` | — |
| `$80` | 6 | `$2739C0` | — |
| `$20`+`$21` | 6 | `$272AAC` | — |
| `$88` | 3 | `$275F30` | — |
| `$85` | 2 | `$275914` | — |
| `$0D` | 1 | `$26B6FA` (midboss) | — |
| `$24` | 1 | `$29700C` | — |
| `$31` | 1 | `$2697F6` | — |
| `$0E` | 1 | `$292902` (boss) | — |

- **[M] THE SHAPE OF THE REMAINING 20.4 %** — instruction counts of each
  handler's own body (closure over its intra-routine branches, subroutine
  bodies excluded, my `span.py`):
  - the 6 ported: 179 + 115 + 222 + 182 + 47 + 191 = **936 instructions**
  - the 13 unported: 148 + 129 + 75 + 121 + 92 + 310 + 37 + 303 + 156 + **576**
    + 43 + 63 + 10 = **2,063 instructions**
  So the last fifth of the spawns is **2.2× the code of the first four fifths**,
  and that is before the boss: `$292902`'s own body is only **10 instructions**
  because it dispatches into the boss brain `$294AD8` and five installed script
  tables that nobody has read [the unread-format claim is CITED, `20-plan` W30].
  The midboss `$26B6FA` alone is **576 instructions**, the largest single body
  in the stage.
- **[M] Motion, stats, aim are ported and gated but unwired**: `src/movement.js`
  (interpreter `$2638A6`), `src/enemyproto.js` (both loaders), `src/initbody.js`
  (21 stage-1 init bodies), `src/aim.js`, `src/turret.js`. All reachable only
  from tests and gates.
- **[CITED, `25-impl`/`25-review`] two open correctness gaps** inside the six
  ported handlers: type `$11` 2,221 divergent samples of 39,062, and the
  `$05`/`$07` spawn-Y offset of `$2C00` (7,900 and 4,123 divergent). I did not
  re-run those gates.

### L11 — enemy bullets

- **[M] The 39-entry behaviour table `$282030`** resolves to **37 distinct
  bodies** (kinds 14 and 15 alias kind 10's `$282840`), bodies from `$282104`.
- **[M] As of `src/mover.js` at 06:26 today: 23 of 37 distinct bodies, covering
  25 of 39 kind slots.** Missing kinds are the contiguous tail **25..38**
  (`$282F6E $2830B2 $283148 $283260 $28330C $283430 $2834FE $2835CC $2836A8
  $28371C $283850 $2838C6 $2839DE $283AF6`). W27 is writing them now.
- **[M] Those 14 are SMALL**: their initialiser bodies are 7–14 instructions
  each except `$2830B2` (69) and `$283430`/`$2834FE` (42 each, and those two
  reach a shared epilogue at `$2841BE`). This row's behaviour half is nearly
  done.
- **[M] 19 of 19 generator entry points** are in `src/bullets.js` (`ENTRIES`).
- **[M] Untouched:** the 20-entry dispatch at `$27F99E`
  (`$27FA30..$280A0E`, entries 0..19, four of them repeats) appears **nowhere in
  `src/`**. I did not determine what dispatches through it — I ruled out its
  being the generator table (that is `$2813F0..$2817C2`, all 19 ported) and its
  being the behaviour table (that is `$282030`, 39 entries).
- **Bucket side:** buckets 22/23 have no producer **[M]**, so no bullet can be
  drawn regardless of how many behaviours land.

### L12 — explosions, death effects, items

- **[M] Nothing is ported.** `$289004` appears in `src/handlers.js` only as a
  counted `note`.
- **[M] Denominator, read out of `$289004..$28905E`**: the effect index is
  range-checked `0 <= D1 <= $21` → **34 effect kinds**; the pool is at
  `$81B732` with `move.w #$4F,D1` → **80 slots**; **294 absolute call sites**
  reference `$289004`, plus **87** for `$28615E` and **85** for `$286096`.
- **[M]** Bucket 20's bulk writer `$28A098` is call #11 of type 5's 23 and is
  referenced in `src/type5.js` as an unported note.
- I did **not** locate the per-effect behaviour dispatch (the analogue of
  `$282030`). Ruled out: it is not `$282030`, and `src/` contains no candidate.

### L13 — laser, bomb flash, hyper

**[M] Nothing ported.** `$24536E` (laser) has exactly **1** call site,
`$24CE46`, inside the option object — i.e. behind the named throw W12 left.
`$2453C2` (the laser collision block that executed zero times in 580 live-beam
frames [CITED `10-recon-combat` §8.7]) has **1** caller, `$245364`. `$249814`
(bomb) is referenced in `src/player.js` as a throw. `$24989E` (hyper) is absent
from `src/`.

### L14 — the palette during gameplay

**Open, and still unowned.** **[M]** 1,020 of 1,024 palette words agree with the
board and ship in the bundle; the remaining 4 (bank 21 pens 0..3) are animated
by a routine nobody has named, so the page still draws the capture's palette
every frame. W19's palette-writer census was not run [CITED `20-plan` §1 L14].

### L15 — the 161-frame loop bound

**Half closed.** Background half done (W13/W16/W17: the stage runs 7,317 frames
to the boss lock and holds) [CITED]. Foreground half is L10+L12+L16.

### L16 — the ship is never hit

**[M] Nothing ported.** The life machine `$25FF7A` has exactly **2** callers,
`$26059E` and `$2605C2`, both inside top-level type 10 (`$260794`) — an entry
the port's dispatch map does not have. Collision (`$2459D0`), damage
(`$286096`, 85 sites) and the death spawn are counted notes in `handlers.js`,
never code.

### L17 / L18 — zoom table, bucket identity

**REPLACED** (W11). L17's zoom blob is still *also* shipped inside
`capture.bin`'s `zoomram` part [M] — a duplicate to delete, not a gap.

---

## 2. WHAT BLOCKS WHAT

```
  [A] INTEGRATION  (type-5 call list: 1 of 23 ported)
        |  everything below is written and unreachable until this lands
        +-- L10 enemies (spawn walker -> 58-slot driver -> handlers -> movement)
        +-- L11 bullets (driver $281D9A -> mover -> behaviours)
        |
  [B] SPRITE EMISSION (buckets 0/7/20/22/23 have no producer)
        |  blocks every pixel of L10/L11/L12 even after [A]
        |
  [C] SPRITE ART  (166 streams, all enumerated from the CAPTURE's own records)
        |  blocks DELETING capture.bin even after [A] and [B]
        |
  [D] L12 effects  -> needed by every handler's death path (294 call sites)
  [E] L16 death/lives -> needs [B] (the ship must be hittable) + L13's hitbox work
  [F] L9 score     -> needs [D] (the score's sources are the damage/effect paths)
  [G] L8 TX        -> blocked by NOTHING; the digits it prints need [F]
  [H] boss $292902 -> needs the boss script format READ first (unread)
```

Two rows are blocked by nothing and can be done at any time: **L8** (11 measured
call sites) and the **L5/L17 tail** (two register constants, delete three
capture parts).

---

## 3. NEARLY-DONE vs LARGE

**Nearly done** (hours-to-one-wave each):
- L11's behaviour bodies — 14 of 37 left, mostly 7–14 instructions **[M]**, in
  flight now.
- L5's leftovers — `ctrl`, `bg_scale`, rowscroll, zoomram: four constants **[M]**.
- L7 — done but for four palette entries **[M]**.
- L8 — 11 call sites, one block printer, no dependencies **[M]**.

**Large:**
- **[A] Integration.** 22 of 23 type-5 subsystem calls unported **[M]**. This is
  not a wiring chore: calls #1, #3, #4, #5, #6, #9, #10, #11, #12, #13–#16,
  #17–#19, #21–#23 are *subsystems* (`$289B80 $28AD54 $27F95A $288E4E $2890F2
  $255DD8 $254680 $255042 $28A098 $2527CE $24A440/44C/458/46C $27E99E $252BD0
  $25354C $25292A $252A52`), and I cannot say from the listing alone which of
  them stage 1 needs — that needs one tap run, which I could not do here.
- **[C] Sprite art.** The plan calls sprites "harvest-only, no static
  denominator" (`20-plan` §5). **That is too pessimistic, and I can show it:**
  `src/mover.js` already contains **29 distinct sprite-descriptor addresses**
  (`$1BF58C … $1C2108`) recovered as *immediates inside the behaviour bodies*
  **[M]**, and `export-web.mjs` already harvests by address for the ship's 16
  bank frames **[M]**. So a static, address-driven sprite export is possible for
  bullets today and for enemies via the prototype tables. Nobody has scheduled
  it, and **it is the item that actually gates deleting `capture.bin`.**
- **L10's remaining 13 handlers** — 2,063 instructions **[M]**, 2.2× the ported
  six, with the midboss (576) inside it.
- **[H] The boss.** Ten instructions of dispatch over an unread script format.
- **L12/L16/L9/L13** — four unstarted subsystems with measured denominators
  (34 effect kinds/80 slots/294 sites; 2 callers of the life machine; 24+
  score-adder callers; 2 laser routines behind one named throw).

**The 79.6 % trap, restated with the current numbers.** "6 handlers = 79.6 % of
stage-1 spawns" is true **[M]** and hides three things: the other 20.4 % is 2.2×
the code **[M]**; those six handlers' own fire/state machines are `note()`d
deferrals, not code (`grep note(` in `handlers.js` = 11 counted deferrals)
**[M]**; and none of the six has ever run inside a frame loop **[M]**.

---

## 4. LOOKS DONE, IS NOT VERIFIED

1. **[M] The whole W21–W27 stack is unexercised in the product.** No `src/`
   module imports `spawn.js`, `handlers.js`, `mover.js` or `turret.js`. Their
   only exercise is gates that feed them the board's own state per frame and
   unit tests. That is legitimate verification of a transcription and is *not*
   evidence that the subsystem runs.
2. **The mover gate is structurally blind to most of what W27 writes.** It
   compares slot / type&`$3F` / speed / dir / posA / posB / velA / velB [CITED
   `26-impl`]; the family-A behaviours write descriptor, renderOffs and graphic
   **only**, so their "0 divergent" is silent about them — `27-impl` says this
   itself. **[M] corroboration:** 29 of the sprite-space literals in `mover.js`
   are exactly such fields, and no gate reads any of them.
3. **[CITED `26-review`] F1–F4 all open**: `spriteEmit()` swaps the renderOffs
   half-words relative to `$284286`; kind 19's continuation omits its
   renderOffs wrap; `freeSlot()` over-notes `$27F8F8`. All latent *because* no
   sprite sink exists — i.e. they become live on the same day [B] lands.
4. **[CITED `25-impl`/`25-review`] `handlers.js` has zero dynamic coverage**:
   the W25 gate drives `movement.js` through a hardcoded per-type driver map,
   not the handlers. The handler helpers are covered by 8 smoke tests.
5. **[CITED `21b`, `26-impl`] `window-constant` is unseeable by both bullet
   gates by construction** (the drop path writes nothing). Covered by unit tests
   only — and `21b-window-constant-review` had to be written *because* the prior
   review asserted that coverage without breaking it.
6. **[CITED `21b-window-constant-review`] the documented `--matrix` invocation
   loads zero corpora and prints a vacuous all-green matrix.** Still documented
   wrongly in two files.
7. **[M] Stale comments that will mislead the next wave**: `src/render/index.js`
   still says "one of the thirty buckets has a ported feeder (14, the shots)"
   (it is four); `src/web/app.js` §NOT THERE AT ALL still describes the enemy
   situation as of W12.
8. **[CITED] a pre-existing red nobody owns**: the scroll-program stage of
   `pgm.py check` has been failing since W22 across W23/W24/W25 worklogs. I did
   not run MAME and cannot say whether it still fails.

---

## 5. WHAT I COULD NOT DETERMINE

- **Which of type 5's 23 calls stage 1 actually needs.** Needs one execution
  tap. Ruled out statically: nothing in the listing marks any of them optional,
  and 22 of 23 are absent from the port.
- **What dispatches through `$27F99E`** (20 entries). Ruled out: not the
  generator table, not the behaviour table, not referenced by `src/`.
- **The per-effect behaviour dispatch behind `$289004`'s 34 kinds.**
- **Whether the four animated palette entries matter outside stage 1's boss.**
- **Any dynamic number.** I ran no MAME, no gate and no test in this session by
  design; every dynamic figure here is labelled [CITED].

---

status: DONE

## 6. WAVE ESTIMATE

Counting a wave the way this project does — one implementer, one gate, one
review — and assuming the reviews stay paired with the implementations:

| # | wave | why here |
|---|---|---|
| 1 | finish W27's 14 behaviour bodies | in flight; small [M] |
| 2 | **INTEGRATION**: type-5 call list, enemy driver `$2634F4`, bullet driver `$281D9A`, deferred queue fed | unblocks everything already written |
| 3 | **sprite emission**: buckets 0/7/20/22/23 producers | nothing is visible without it |
| 4 | **static sprite-art export** (bullet descriptors + enemy prototype graphics, by address) | the actual gate on deleting `capture.bin` |
| 5–6 | the 13 remaining stage-1 handlers (regulars, then the midboss) | 2,063 instructions [M] |
| 7 | collision + damage + death effects (L12: 34 kinds, 80 slots, 294 sites [M]) | every handler's death path |
| 8 | score/chain port (L9) + TX printer (L8, 11 sites [M]) | frame-exact owner requirement |
| 9 | death, lives, respawn (L16) — retire the invulnerability crutch | |
| 10–11 | laser, bomb, hyper (L13) | behind W12's named throw |
| 12–13 | the boss: read `$259554`/`$294AD8` format, then port `$292902` | largest unknown |
| 14 | palette animation (L14) + `ctrl`/`bg_scale`/rowscroll/zoomram constants | |
| 15 | **delete `capture.bin`** and gate the page without it | the definition of done |

**15 waves is the floor.** Realistic range **15–20**, because waves 2, 3 and 7
each have a decent chance of splitting, and the boss is priced from a body I
measured at 10 instructions over a format nobody has read.

**Order that matters:** 2 before 5–6 (handlers are unverifiable in-frame until
they run in-frame); 3 before 4 (know which sprites are asked for before
exporting them); 7 before 8 (score's sources are the damage paths); 15 last, by
definition.

**The largest unknown is not the boss.** It is item 4 — whether every sprite the
stage draws can be enumerated by address from the ROM. The evidence says
probably yes (29 bullet descriptors are already sitting in `mover.js` as
immediates [M]; the ship's 16 bank frames were harvested by address [M]), but
the current atlas is 166 streams enumerated from the recording's own records
[M], and **no wave has ever been assigned to replace that provenance**. If it
turns out an enemy's animation extents are not statically derivable, the ledger
can go empty and `capture.bin` still cannot be deleted. The boss is the
second-largest unknown, and it is at least a known unknown with a read-first
instruction already written.
