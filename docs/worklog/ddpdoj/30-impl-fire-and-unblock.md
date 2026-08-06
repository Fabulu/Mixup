# W30 - IMPL: unblock `fly-around` (`$275914`), then wire the handler FIRE path

status: **DONE** -- three of the four gate blockers ported, the fourth
(the MIDBOSS `$26B6FA`) scoped out explicitly. Bullets now spawn from live
enemies in the product. THE GATE IS STILL RED. See 3.
wave: 30. role: IMPLEMENTER (sole writer to `games/ddpdoj/`).
date: 2026-08-04.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B
unless noted.

## THE BRIEF

A. Port `$275914` (enemy handler, type `$85`) and whatever it needs, so the
   `fly-around` gate scenario runs to completion instead of being BLOCKED at
   logic frame 2346 by the loud named throw W29 left. The DaiOuJou gate is red
   because of this, and that blocks publishing.
B. Then wire the handler FIRE path (W29 §5.1) so bullets actually spawn from
   live enemies - the thing that finally makes W27's 37 bullet behaviour bodies
   execute anywhere but their own unit test.

Expect divergence. Report the FIRST divergent field per scenario with its logic
frame. Never a frame count, never a percentage.

## 1. `$275914`, READ OUT OF THE ROM - THE COMPLETE ENUMERATION

`python tools/oracle/w27disasm.py 275914 275C20` from `games/ddpdoj/`, over
`tools/oracle/out/maincpu.bin` (the decrypted build-B image, address == offset).

**THE SPAN.** `$275914..$275BAA`, and the end is decided by control flow, not by
the sweep: `$275BA6 jmp $263762.l` (free the enemy) is the last instruction of
the death arm, `$275BAC` is a `nop` pad, and `$275BAE` is a DIFFERENT routine -
`move.w #$1,$4(A5) / rts`, which is **type `$86`'s init stub**, falling through
at `$275BB6` into type `$86`'s init BODY. I read past the apparent end in both
directions and this is where it stops.

**TWO TYPES SHARE THIS HANDLER.** Read straight out of the type table
(`$27E412 + (t-$80)*8`):

| type | init | handler |
|---|---|---|
| `$85` | `$275812` | **`$275914`** |
| `$86` | `$275BAE` | **`$275914`** |

and the handler's own death arm branches on it: `$275AFC cmpi.b #$86,$c(A5)`.
Stage 1's script contains 2 records of `$85` and none of `$86` (W28 §L10), but
the type byte test is transcribed rather than folded away.

### 1.1 EVERY `jsr`/`jmp` TARGET IN THE BODY, AND ITS DISPOSITION

| site | target | what it is (from the listing) | disposition |
|---|---|---|---|
| `$275914` | `$2638A6` | the movement interpreter | **PORTED** (W24 `stepMovement`) |
| `$27591A` | `$2426A4` | an off-screen test, 8 instructions | **PORTED THIS WAVE** |
| `$275928`,`$275BA6` | `$263762` | free the enemy | **PORTED** (W23 `freeEnemy`) |
| `$27596A` | `$286096` | DAMAGE | note (as every other handler) |
| `$2759A6` | `$28AC72` | the SUB-RECORD spawn engine: walks a script at `+$44(A5)`, and when `$18(A6)` (HP) crosses each threshold spawns into the pool `$81DB90` (10 slots x `$26`) - type-5 call #3's second pool | note |
| `$2759FE` | `$24203E` | aim64 CORE | **PORTED** (W20 `aim64`) |
| `$275A08` | `$242190` | the one-step slew | **PORTED** (W20 `slew64`) |
| `$275A24` | `$23D852` | the per-record enqueue stub, **bucket 7** (`$807450`/`$80AFC8`) | **PORTED** (W11 `enqueueRequest`) |
| `$275A46` | `$23DF86` | the register enqueue, **bucket 7** | **PORTED** (W11 `enqueueRegisters`) |
| `$275A84` | `$23DF58` | the register enqueue, **bucket 3** (`$80688C`/`$80AFC6`) | **PORTED** (W11 `enqueueRegisters`) |
| `$275AD0` | `$2813F0` | **A BULLET GENERATOR ENTRY** | **PORTED** (W21 `bullets.js` ENTRIES) |
| `$275AF4` | `$28615E` | explosion/score | note |
| `$275B06`,`$275B1A` | `$27E812` | spawns into the `$816B7A` pool (type-5 call #18's) | note |
| `$275B22`,`$275B4E`,`$275B76` | `$289004` | the sprite-EFFECT allocator | note |
| `$275BA0` | `$28C274` | death burst | note |

Two ROM tables are read: `$272DFA` (already in a declared window, 16 longs, the
aim-derived sprite table this type's init also reads) and **`$27327A`, a
32-entry longword MUZZLE table which was in NO declared window** - added this
wave. Extent pinned from the data: entries 0..31 are a clean circle
(`0500,0000` / `0040,03C0` / `FB80,0000` / `0040,FC40` at 0/8/16/24) and entry
32 (`$2732FA`) breaks the pattern, so the table is `$27327A..$2732F9`, `$80`
bytes, exactly what the index `((facing & $3E) * 2)` -> 0..`$7C` reaches.

### 1.2 SO `$275914` IS NOT A HALF-PORT

Of its 15 call sites, **11 resolve to code this project already has** and the
four that do not are the same four subsystems every other ported handler
already notes (`$286096`, `$28615E`, `$289004`, `$28C25A`-family) plus two new
ones named above. Nothing is smoothed: `$28AC72` not running means `+$44(A5)`
does not advance and the sub-record pool stays empty, and that is recorded here.

**IT ALSO CONTAINS A FIRE.** `$275AD0 jsr $2813F0` with D0 = `#$FFFF000D`
(speed bias `$FFFF`, kind `$D`), D1 = the facing word `$28(A5)`, D2 = the
position `$2(A6)`, D3 = the `$27327A` muzzle vector + `$F9000000`. Every one of
the four is computed IN THE HANDLER. Kind 13's spawn-init pointer
(`$2815C6[13]`) is `$2818AC` - the shared do-nothing epilogue - and its
template's `+$10` run-init word is `$0000`, so D4/D5 are not consumed.

## 2. A DEFECT FOUND WHILE READING - `$2747E8` in handler `$82`

`src/handlers.js` (W25) has, for type `$82`:

```
ram.setU32(a5 + R.sprite22, ram.u32(a6 + 0x02));     // move.l $2(A6),$22(A6)
```

The comment is right and the code is wrong. `$2747E8` is `2D6E 0002 0022`, and
bits 11..9 = `110` with mode `101` make the DESTINATION `($22,A6)`, not
`($22,A5)`. So the port wrote the position into the wrong record and never
wrote it into the right one. `$275914` has the identical instruction at
`$275936`, which is how it was found. Fixed; see §4 for the mutation that
pins it.

## 3. THE GATE IS STILL RED, AND THE REASON CHANGED THREE TIMES

`fly-around` is a 2,200-frame window from logic frame 2000 (`scenarios.json`),
so it runs to lf4200. W29 left it BLOCKED at lf2346. **It is still blocked, and
this is the honest sequence, each measured with `pgm.py flyaround --reuse` on
the tree of the moment:**

| after | frames compared | blocked at | by |
|---|---|---|---|
| W29 (the wave's starting state) | 345 | lf2346 | `$275914` |
| `$275914` ported | 633 | lf2634 | `$2739C0` |
| `$2739C0` ported | 1,097 | lf3098 | **`$26B6FA`, THE MIDBOSS** |
| `$276702` ported | 1,097 | lf3098 | `$26B6FA` |

**Porting `$275914` was never going to unblock the gate, and W29's own survey
said so** (§3.1: six distinct unported handlers reached, `$275914` first at
lf2345 and the midboss at lf3093). I did not read that as a schedule until
after the first port, and I should have: `$26B6FA` is inside the window, so
`fly-around` cannot go green without it.

**SCOPING IT HONESTLY.** `$26B6FA` is 576 instructions - W28 measured it as the
largest single body in the stage, 2.2x any other unported handler and more than
half of the whole remaining 20.4 % of spawn records. W28's own wave estimate
puts it in its own slot ("5-6: the 13 remaining stage-1 handlers (regulars,
then the midboss)"). I did not attempt it. **The gate is therefore still RED and
DaiOuJou is still not publishable, and the remaining blocker is exactly one
named routine.**

What this wave did instead was remove the other three, so the next wave's scope
is a single body rather than an unknown queue. `$276702` is in the list even
though it does not move the block point, because it was the blocker before the
midboss and leaving it would put a second item back on that scope.

### 3.1 WHAT DID NOT DIVERGE, AND WHAT DID

`python tools/oracle/pgm.py flyaround --reuse`, final tree:

```
RESULT 0 of 88 columns diverged; and the run was BLOCKED at lf3098 by $26B6FA
```

**Zero of the 88 CLAIMED columns diverged on any of the 1,097 frames** - over a
window three times longer than W29's, with three new handlers, a ported fire
gate, a wired bullet fan and four buckets receiving sprite requests for the
first time. That is the wave's strongest single result.

**THE REPORTED COLUMNS, and one of them is newly divergent.** These are traced
and deliberately not claimed (`src/state.js` `REPORTED_COLUMNS`):

| column | W29 (345 frames) | W30 (1,097 frames) |
|---|---|---|
| `nshot` | 0 divergent | 0 divergent |
| `rng` (`$803916`) | 0 divergent | **143 divergent, FIRST AT lf2955, port=63 board=64, largest gap 2** |
| `b000` | 345/345, first lf2001, port 62584 board 62800, largest gap 1092 | 1097/1097, first lf2001, port **62752** board 62800, largest gap 804 |
| `affe` | 345/345, port 65290 board 65308, gap 91 | 1097/1097, port **65304** board 65308, gap 67 |
| `affc` | 345/345, port 72 board 288, gap 1092 | 1097/1097, port **240** board 288, gap 804 |

Two things to read off that, and they point opposite ways.

1. **The three display-list columns MOVED TOWARD THE BOARD** on the very first
   frame of the window and stayed closer. `b000`/`affe`/`affc` are functions of
   all thirty bucket counters, and this wave gave four buckets (0, 3, 7 and the
   `$267F70` pair's) their first producers. The port's sprite-request budget
   converging on the board's is independent evidence that the emitter wiring is
   right - it is not something a wrong bucket index could produce.
2. **`rng` IS NEWLY DIVERGENT AND THE PORT IS BEHIND BY ONE.** It was 0-of-345
   at W29 and is now 143 of 1,097, first at **lf2955**, port `63` against board
   `64`, largest gap 2. `$803916` is the state of `$2433AE`, and the port never
   calls it, so the board took a draw the port did not. I could not identify
   which consumer: the three new handlers contain no `$2433AE` reference (I
   disassembled all three in full), so it is a routine reached *because* of this
   wave's state changes rather than one this wave wrote. **I could not reach it;
   here is what I tried:** a text search of `$2739C0..$273F02`, `$275914..
   $275BAA` and `$276702..$276818` for `2433AE`, and a check of the two W30 fire
   entries (`$2813F0`, `$281402`, `$281484`, `$2817A8`, `$2817B8`) against
   `src/bullets.js`, which draws no random number. It is 143 frames of a
   REPORTED column and it is stated here rather than left to be found.

### 3.2 THE FULL GATE

`python tools/oracle/pgm.py check`, run to completion on the FINAL tree (an
earlier run raced with this wave's edits and was discarded rather than quoted):

```
VERDICT: FAILURES -- 44 passed, 5 failed, 0 SKIPPED
  [FAIL] scroll program: the port vs the whole of stage 1 (10,431 frames)
  [FAIL] scroll program RED (9 mutations)
  [FAIL] scroll program: the ATTRACT entry clock $0038 (1,364 frames)
  [FAIL] scroll program RED [no-fast-forward] on the attract entry
  [FAIL] fly-around: port vs board, 0 divergent frames
```

**The same five as W29, and 0 SKIPPED.** The four scroll-program stages are the
pre-existing red nobody owns, failing since W22 and confirmed unchanged again
here; the fifth is `fly-around`, red because it is BLOCKED, not because a
column disagreed. **Nothing else regressed** - including the four stages that
drive a whole `Game`: `display list`, `demo gate`, `replay determinism` and the
`determinism gate`. Given that this wave added three handlers, a fire gate, two
live fire paths and four buckets receiving their first sprite requests, those
four staying green is the check that mattered.

The `fly-around` figures in §3.1 were re-taken on the trace this gate run
recorded, not on the cached one, and are identical.

## 4. WHAT THIS WAVE PORTED

### 4.1 `$275914` - types `$85` AND `$86` (§1)

156 instructions. First ported handler that EMITS SPRITES and first that FIRES
in the live path. See §1 for the full call-site enumeration.

### 4.2 `$2739C0` - type `$80`

310 instructions, span `$2739C0..$273F02` (`$273F04` is a `nop` pad, `$273F06`
is type `$81`'s init stub - read past the end). The `$85` skeleton plus:

- a SHIELD timer on `($36,A5)` pinning the HP pair at `$7FFF`, stepping by 1 or
  by 2 while `$811F72` is set, and dropping both words to `$1400` on the borrow;
- an aim256 fan: `$2422A2`, then EIGHT `$2817B8` spawns off `$2735FA` or SEVEN
  `$2817A8` off `$2736FA`, selected by stage and `($20,A5)`;
- TWO turrets alternated by `$273C3A bchg #$6,($1,A6)`, each owning its own
  facing word (`($2C,A5)`/`($32,A5)`) and sprite pointer (`($28,A5)`/`($2E,A5)`);
- two `$281484` laser fires off `$27347A`;
- four sprite requests (two bucket 7, one bucket 7, one bucket 3).

Every callee was already ported. Two new ROM windows, both pinned from BOTH
ends: `$2735FA`+`$2736FA` are `$100` each and `$2736FA + $100 == $2737FA`, which
is type `$80`'s own init stub; `$27347A` is 32 longwords and entry 32 at
`$2734FA` breaks the circle.

### 4.3 `$276702` - type `$8A`, and BUCKET 0's FIRST PRODUCER

75 instructions, span `$276702..$276818` (`$27681C` is type `$8B`'s init stub).
A scroll-locked prop. Its tail reaches an enqueue through the **24-entry
dispatch table `$27829C`**, indexed by `($1E,A6) * 4`; for this type's own
prototype that word is 0, i.e. `$23D762`, i.e. **bucket 0** - which W28 measured
at 87,545 sprite pixels, 72.1 % of the whole picture, with no producer at all.
`$242884` (the two-bit player-alive mask) came with it.

### 4.4 `$267FC6` - THE FIRE GATE, no longer a deferral

W25b demoted it to a counted note after finding the previous body had fabricated
an `$804000` RNG read; W26 and W27 left it deferred with a stated reason - "a
faithful translation would have no faithful consumer this wave". Wiring type
`$11`'s fan gives it one, and a gate that always says "fire" invents every
bullet it lets through. Ported in full: the four rank-selected position-box
tables at `$242562..$2425B1` (pinned from both ends), the octagonal player
distance, the `$2680A2` per-stage threshold.

### 4.5 `resolveEmitStub` - THE MISLABEL, AND WHY IT MATTERED

`src/handlers.js` called `($2A,A5)` and `($2E,A5)` *"indirect fire-actions ->
the `$23Dxxx` routines -> the `$281xxx` bullet fans"*. Read out of the ROM, all
twelve longwords in `$267F70` and all 24 in `$27829C` are members of the
`$23D762` sprite-ENQUEUE family - 20 distinct stubs in three shapes:

```
41F9 <buf.l> D0F9 <ctr.l> 43EE 0002 ...   the RECORD convention
48E7 80C0 41F9 <buf.l> D0F9 <ctr.l> 43EE  ...the same, registers saved
41F9 <buf.l> D0F9 <ctr.l> 2001 ...        the REGISTER convention
41FA <disp> 4E71 2206 ...                 the ZOOMING variant, a LOUD THROW
```

**The enemies' DRAW was being counted as their FIRE.** `resolveEmitStub` reads
the `lea`/`adda` operands out of the cartridge and matches them against wave
11's thirty buckets, so the bucket a pointer feeds is the ROM's answer and not a
map somebody typed. Fields renamed `emitRec2A`/`emitReg2E` so it cannot come
back. New ROM window `$23D760+$840` - 2 KB of code read as data, declared and
documented.

## 5. FOUR DEFECTS FOUND WHILE READING, ALL FIXED

1. **`$2747E8` wrote the wrong record** (§2). `2D6E 0002 0022` - both operands
   are `(d16,A6)`; the port wrote `($22,A5)` while its own comment said
   `$22(A6)`. Found because `$275936` is the identical instruction.
2. **Type `$11`'s aim CADENCE WAS INVERTED.** `$268A1A subq.b #1,($18,A5) / bcc
   $268A5A` borrows only when the byte was already 0, so the ROM aims on exactly
   the frames the old code skipped and skips the ones it aimed on. `src/turret.js`
   has had it right since W20 (`if (cad !== 0) return;`); `handlers.js` tested
   the stored result's bit 7. Mutation M4 restores the old shape and reddens the
   test that pins it.
3. **The death-animation arm never wrote `($1E,A5)`** - `$2689E2..$2689F2` is a
   frame counter that steps by `$24` and wraps at `$90`, and the port skipped
   the whole `$2689D6` block.
4. **Two `bcs` read as SIGNED.** `$268AA6 cmpi.w #$159,$8130CE` and `$268AFC
   cmpi.w #$3,$813092` are unsigned; the port used `i16(...) >= 0x159`.

## 6. EVERY CHECK WAS SEEN TO FAIL - AND TWO OF THEM COULD NOT

`games/ddpdoj/tests/w30handlers.test.js`, 25 tests, plus the existing suite.
Mutations applied byte-exactly in Python with a single-occurrence anchor
assertion, suite run, file restored, sha256 verified identical both ways
(`src/handlers.js` `1027b3174930ec3e`, `src/spritequeue.js` `7c8388a29b2f5d3f`).

| # | mutation | result |
|---|---|---|
| M1 | the record/register emit conventions swapped | RED - 12 |
| M2 | `$26809E`'s threshold compare inverted | RED - 3 |
| M3 | `$268004`'s position-box test dropped | RED - 1, alone |
| M4 | `$268A1A`'s cadence back to the pre-W30 (inverted) shape | RED - 3 |
| M5 | `$268AF2`'s muzzle table read at stride 4 instead of 8 | RED - 1, alone |
| M6 | `$275936` writes `($22,A5)` - the defect of §5.1 | RED - 1, alone |
| M6b | `$2739FA` writes `($22,A5)` - the same instruction in type `$80` | RED - 1, alone |
| M7 | `$275ABC`'s muzzle index loses its `*2` | RED - 1, alone |
| M8 | `$275AE6` reloads from `$8130B8` instead of `$8130BA` | RED - 1, alone |
| M9 | `$275A4C`'s rank gate inverted | RED - 1, alone |
| M10 | `$273A36` dropped - only half the shield expiry written | RED - 1, alone |
| M11 | `$273A18` - the shield always steps by 1 | RED - 1, alone |
| M12 | `$273C3A` `bchg` becomes a `bset` (never flips back) | RED - 1, alone |
| M13 | `$273B68`'s wide loop runs 7 times instead of 8 | RED - 1, alone |
| M14 | `$2767AA` tests the NEW bit instead of the old | RED - 3 |
| M15 | `$2767B2` ADDS `$B4` instead of EOR-ing it | **GREEN - SURVIVED** |
| M16 | `$2767BA`'s emitter index loses its `*4` | **GREEN - SURVIVED** |

**TWO MUTATIONS SURVIVED THE FIRST PASS, AND BOTH ARE REPORTED AS FINDINGS
RATHER THAN QUIETLY FIXED**, because the shape of each is one this project keeps
re-discovering:

- **M15** - the test's fixture value was `$001C0900`, whose low byte is 0, and
  `x ^ $B4 == x + $B4` for every such value. The check agreed with itself
  whatever the operation was. Fixed by choosing `$001C09FF`, and the test now
  asserts *out loud* that its own fixture can distinguish the two.
- **M16** - the test drove `($1E,A6) = 0`, and `0 * 4 == 0`. A scale factor
  cannot be tested at the one input where it does not apply. Fixed by adding a
  test at index 5, which resolves to `$23D852` = bucket 7 and lands in a
  different bucket the moment the `*4` goes.

Both mutations were re-applied after the fixes: **RED, one named test each.**
**17 mutations, 17 reds, no survivors**, and every source file byte-identical
after every one.

## 7. THE STATE OF THE BULLET STACK - W27's F1, PARTLY CLOSED

W29 §5.1: no W27 behaviour body executed anywhere but its own unit test, and
`27-review.md` F1 measured that the 29 W27 kinds have never appeared on the
board at all.

**BULLETS NOW SPAWN FROM LIVE ENEMIES IN THE PRODUCT.** A scratch survey (not
committed) runs the page's own loop over `fly-around`'s input words from the
seed, and on an `Unreached` records the address, frees the record the throw
names and carries on. **Everything after the first throw is off-distribution by
construction** (`docs/knowledge/09`), so this is an INVENTORY and may not be
quoted as "the port survives N frames".

| | W29 | after this wave |
|---|---|---|
| peak live enemies | 41 of 58 | **45 of 58** |
| peak live bullets | **0 of 210** | **27 of 210** |
| first live bullet | never | **lf2040** |
| bullet KINDS ever live | none | **{4, 5, 13, 19}** |
| distinct handler throws in the window | 4 | **1** (`$26B6FA`) |

**EVERY FIRE, BY THE ROM ADDRESS OF THE `jsr` THAT MADE IT** (`Game.bulletSpawns`,
same survey; fired / spawned / declined by the freeze gate / DROPPED because the
pool was full):

```
$268B14  fired 37  spawned 37  declined 0  dropped 0   type $11's kind-$D fan
$275AD0  fired 15  spawned 15  declined 0  dropped 0   type $85's kind-$D fan
$2817B8  fired 16  spawned 16  declined 0  dropped 0   type $80's WIDE aim256 loop
$2817A8  fired 14  spawned 14  declined 0  dropped 0   type $80's NARROW loop
$281484  fired 20  spawned 20  declined 0  dropped 0   type $80's laser pair
```

**Five distinct fire sites, 102 spawns, 0 dropped.** Zero dropped is worth
saying out loud rather than passing over: the pool's free-slot search only
examines 70 of its 210 slots until the `$81B414..$81B41A` window ladder opens,
and this path never came close. It is also the number that would move first if
a later wave wired the six fire/state machines still noted.

**BUT F1 IS NOT CLOSED, AND SAYING SO IS THE POINT.** The four kinds that
execute - 4, 5, 13, 19 - are all **W26** bodies, and all four are already in the
set `{3,4,5,6,7,12,13,19}` that `27-review.md` measured as the only kinds any
board recording contains. **Zero of W27's 29 bodies have executed even now.**
The fire paths this wave wired (`$2813F0` kind `$D`, `$281402` kind `$D`,
`$2817A8`/`$2817B8` kind 4, `$281484` kind `$13`) simply do not produce them on
this path. Closing F1 needs the kinds themselves, not more fire sites; the
denominator is 37 bodies and the numerator is still 8.

## 6.1 COVERAGE, AS TABLE ENTRIES

Measured this wave by walking the stage-1 script `$230C6C..$231703` (339 records
of 8 bytes, the type at record `+$4`) and resolving each type through
`$267824`/`$27E412` - not quoted from W28:

> **9 of the 19 distinct handlers stage 1's script references are ported, and
> those nine own 288 of the 339 spawn records. The other 10 handlers own 51
> records and every one of them throws by its own ROM address.**

W25's headline was 6 handlers / 270 records; this wave adds 3 handlers and 18
records. The 18 is small and the block-point movement is not: the three are what
stood between the gate and the midboss.

Bullet behaviour bodies: **8 of 37 have executed anywhere** - unchanged in
kind by this wave (see §7), though they now execute in the PRODUCT rather than
only in a unit test.

Type-5 subsystem calls: **9 of 23** - unchanged; W30 added no call.

## 7.1 WHAT WAS DELIBERATELY NOT TURNED ON

- **`PRODUCED_BUCKETS` is unchanged** (`src/main.js`: 5, 14, 15, 19). Buckets 0,
  3 and 7 now have a producer, but a PARTIAL one - exactly one enemy type feeds
  bucket 0 and two feed bucket 7, out of a stage that fills them from dozens.
  Adding them would make `pgm.py shipgate` substitute the port's near-empty
  bucket for the board's full one and the picture would get WORSE, not better.
  The right trigger is "every producer of that bucket is ported", and this wave
  is not it. Recorded here rather than left to be inferred from an absence.
- **`Game.bulletSpawns`** (new, `src/main.js` `#ctx()`) counts every enemy fire
  by the ROM address of the `jsr` that made it, split into
  fired/spawned/declined/dropped. Until this wave no handler fire reached the
  pool at all, and "the fan ran and the pool refused it" must not look the same
  as "the fan never ran".
- **The page now dies at logic frame 3098 instead of 2346.** That is still a
  product regression and it is still not behind a flag, for W29 §5.4's reason: a
  flag defaulting to off is a green achieved by not running code. The fix is to
  port `$26B6FA`.

## 7.2 THE PAGE DID NOT GET SLOWER - MEASURED

The owner's standing constraint is that boot must not get slower than it is
today, and this wave added a per-emit ROM read (`resolveEmitStub` resolves a
stub's bucket out of the cartridge on every sprite request rather than from a
transcribed map). Measured, headless, same harness as §7:

```
construct 44.2 ms; 1,000 logic frames in 604.3 ms = 0.604 ms/frame
                                     (the budget at 59.185606 Hz is 16.9 ms)
```

3.6 % of a frame, with up to 45 live enemies each doing 1-4 resolutions.
Caching the resolution would be a defensible optimisation and is not needed, so
it was not done - the ROM stays the authority for every lookup.

## 7.3 A REGENERATION STEP A LATER WAVE WILL TRIP OVER

This wave added **five ROM windows** (`$273270`, `$23D760`, `$278290`,
`$242560`, `$2735F0`, `$273470`). `tools/export-web.mjs` line 671 embeds
`rip/port/player.tables.json` verbatim in the web bundle, so **a tree with new
windows and a stale bundle makes the PAGE throw "outside every ROM window"
while every gate and test is green** - the gates read the JSON directly.

Both were re-run here (`python tools/export-tables.py`, then
`node games/ddpdoj/tools/export-web.mjs`; 94 windows / 179,846 bytes, bundle
977.3 KiB). Recorded because the failure mode is silent in exactly the
instruments a wave normally trusts.

## 8. WHAT I COULD NOT DETERMINE

- **Which routine consumes the extra `$2433AE` draw** behind the new `rng`
  divergence at lf2955 (§3.1). Ruled out: the three handlers this wave ported
  (disassembled in full, no `$2433AE` reference) and the five bullet generator
  entries they call.
- **Whether the midboss is the LAST blocker.** `$26B6FA` is the only throw the
  survey reaches inside the 2,200-frame window today, but the survey frees the
  record a throw names and carries on, so every frame after lf3098 is
  off-distribution. A run that actually simulates the midboss can reach handlers
  this one cannot.
- **Anything about the board.** No MAME was run this wave. Every dynamic number
  above is either the PORT against a seeded RAM dump, or `portdiff.mjs` against
  the trace W29 recorded. The seed is a fly-around capture with the
  invulnerability poke.
- **The extent of `$278320`** (type `$8A`'s death-effect word table). Entries
  0..11 are plausible bucket indices and entry 12 onwards is not, but the read
  is inside the noted `$289004` gap so nothing in the port touches it.

## LOG (appended as findings arrive)

- opened; read `$275914` in full out of the ROM (§1).
- found and fixed the `$2747E8` destination-register defect (§2).
- `$275914` ported and committed; gate 345 -> 633 frames, blocker moved.
- `$267FC6` ported, type `$11`'s fan wired, the emitter mislabel corrected;
  the three display-list REPORTED columns moved toward the board.
- `$2739C0` and `$276702` ported; gate 633 -> 1,097 frames; the MIDBOSS is the
  sole remaining blocker.
- 17 mutations run; two survived, both were defective checks, both fixed and
  re-run RED.

## 9. WHERE THE WAVE ENDED, AND WHAT THE REVIEWER SHOULD LOOK AT FIRST

**A. IS `fly-around` UNBLOCKED? NO.** It went from 345 compared frames to 1,097,
and the blocker went `$275914` -> `$2739C0` -> `$26B6FA`. The midboss is 576
instructions and is a wave of its own. **DaiOuJou is still not publishable and
the reason is one named routine.**

**B. DO ANY W27 BULLET BODIES EXECUTE LIVE? NO** - and this is the wave's second
shortfall, stated as plainly as the first. Bullets DO now spawn from live
enemies (102 spawns across five fire sites, peak 27 of 210 in the pool, first at
lf2040, where W29 had zero and W28 measured the whole stack as dead code). But
every kind those fire sites produce -- 4, 5, 13, 19 -- is a **W26** body, and
all four were already inside the set `{3,4,5,6,7,12,13,19}` that
`27-review.md` F1 measured as the only kinds any board recording has ever
contained. **8 of 37 bodies have executed; the other 29 still have exactly one
check each, written by the wave that wrote them.** F1 is not closed.

**C. WHAT DIVERGED.** Nothing in the claimed set: 0 of 88 columns over all 1,097
frames. In the REPORTED set, `rng` is newly divergent -- **first at lf2955,
port `63` against board `64`, largest gap 2** -- and I could not identify the
consumer (§8). The three display-list columns diverge as they always have and
they moved TOWARD the board.

### RANKED, FOR THE REVIEWER

1. **§3** -- the gate is red and the midboss is the only thing left in the
   window. Check that claim: it rests on a survey that frees the record each
   throw names and carries on, which is off-distribution after the first one.
2. **§7 / B above** -- no W27 body executes even now. The fire sites are wired
   and they produce the wrong kinds to close F1.
3. **§6's M15 and M16** -- two of my own checks could not fail, both for the
   classic reason (a fixture value at which two operations agree; a scale factor
   tested at input 0). If two got through, look for a third.
4. **§5** -- four defects found by reading, three of them in W25 code that has
   been green since. The inverted cadence (§5.2) is the one to re-derive.
5. **§4.5** -- the `($2A,A5)`/`($2E,A5)` mislabel. Confirm from `$267F70` that
   all twelve longwords really are enqueue stubs; the whole emitter wiring
   rests on it.
6. **§3.1's `rng`** -- 143 frames of an unexplained extra draw.
7. **§7.1** -- `PRODUCED_BUCKETS` deliberately not extended.

status: DONE
