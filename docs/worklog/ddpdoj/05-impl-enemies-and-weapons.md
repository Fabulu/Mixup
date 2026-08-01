# WAVE 5 — enemies and the three weapons

status: **BLOCKED** on the wave's own "done when" — with the measured reason,
the exact remaining work item list, and the parts that ARE ported and verified.
Nothing here is a guess dressed as a result.
wave: 5   role: impl   started: 2026-08-01

All addresses are **VERSION-B** (`$23xxxx`–`$28xxxx`, 2002.10.07 BLACK VER)
unless a line says build A. Machine pin printed on every run:
`maincpu_fnv64=D4C25CA9C91B9D47`, 6,291,456 bytes.

## The task, as I understood it

`PLAN-vertical-slice.md` §"Wave 5". Enemy movement and spawn timing, shot/laser/
bomb, the kill chain, driven through wave 4's budget-carrying object driver;
allocation behaviour from wave 2 item 3's measurement; the sprite-list cap
measured rather than assumed.

**Done when:** `stage1-open-shot`, `stage1-open-laser`, `stage1-open-bomb` (each
≥1,800 logic frames, each firing, connecting AND missing) compare **0 divergent
frames** on full sprite-list digest, object slots processed, player block,
score/chain words identified in wave 2, lag census columns.

**That exit condition is not reachable in this wave and I did not fake it.**
§"Why the done-when is blocked" gives the measurement that says so, in numbers,
so the next wave can plan against it instead of rediscovering it.

## THE HEADLINE

```
python games/ddpdoj/tools/oracle/pgm.py flyaround
  COLS   34 compared  (was 31: c3910 c3912 c3914 are new)
  ALLOC events ($24111E/$241182/$2411E2/$241238): none -- no object was
        created, evicted or killed in this window
  DIGEST c752ac4c2ed0d9733cefbd95908f5b5eabb32b6df7af1c36d140f9a3c3c73209
  RESULT 0 DIVERGENT FRAMES on 34 columns over 2200 logic frames

python pgm.py flyaround --reuse --break no-phase-mask
  DIVERGE c3910 first at lf=2001: port=1302 board=2
  DIVERGE c3912 first at lf=2001: port=1302 board=6
  DIVERGE c3914 first at lf=2001: port=1302 board=6
  RED OK: mutation 'no-phase-mask' diverged, as it must

node --test games/ddpdoj/tests/      35 pass, 0 fail, 0 SKIPPED   (was 18)
node tools/determinism.mjs ...       three runs, one digest c752ac4c...
python pgm.py gate                   635bb92f1a9dc81e...  IDENTICAL   (unmoved)
```

**THE SPRITE-LIST CAP, REACHED AND MEASURED** (`pgm.py spritecap`, new):

```
CONTROL                          sprite_queue_high_water=$5A0 (120/251) full=0
POKE $80AFC0=$0900 (192/251)     high_water=$BC4 (251/251) queue_full_events=544
                                 buckets_cut[80AFC2:11 80AFC4:23 80AFC6:41
                                 80AFC8:181 80AFD0:62 80AFD6:141 80AFDA:11
                                 80AFDC:12 80AFDE:1 80AFE2:6 80AFE6:55]
                                 halt_loop_interrupts=0, still build B
```

---

## What I MEASURED

### 1. THE ENEMY SUB-DRIVER — `$263502`, 58 slots × `$50` at `$81332C`

Wave 2 located the TOP-LEVEL driver and wrote, in its own "what I could not do":
*"each of the 20 handlers walks its own sub-tables … and I did not disassemble
those loops"*. That is where the enemies are, so wave 5 went there.

**How, in order:**

```
$ python .../w5/hunt.py stage1-open OBJ_LO=810000 OBJ_HI=81FDFF OBJ_TOP=70
  W pc=268900 n=8153 off=813662..813D92 span=1840 stride=80 perframe 1..18
  W pc=26352E n=10375 off=8145A0..8148A0 ... (and eleven more $50-stride PCs)
$ python xref.py lea 81364C        -> $162782 (build A), $263708 (build B)
# the ONLY `lea ($50,A5),A5` in $200000-$300000 besides the top-level driver's
# $2410E8 is $263568 -- and disassembling backwards from it gives the driver:
$ python xref.py dasm 2634F0 180
```

```
263502: clr.w $815E9C / $815E9E / $815EA0
263514: lea $81332C,A5              THE ENEMY TABLE
26351A: move.w #$39,D6              58 SLOTS
26351E: tst.w (A5) / beq $263568
263524: movea.l ($6,A5),A6          the record's SUB-record
263528: move.w $813176,D0
26352E: sub.w D0,($4,A6)            SCROLL COMPENSATION, once per live enemy
263532: movea.l ($4C,A5),A1         THE HANDLER IS A POINTER IN THE RECORD
263538: jsr (A1)
263542: tst.w (A5) / bpl $263568    the handler may have killed it
263546: addq.w #1,$815E9C           live count
26354C..263566                      $815E9E / $815EA0 split on ($D,A5)
263568: lea ($50,A5),A5
26356C: dbra D6,$26351E
263570: clr.w $815EA2 / $815EA4 / $815EA6
```

**Geometry — one table, three BANDS**, from the allocator `$2636D6`:

| band | base | slots | chosen when |
|---|---|---|---|
| special | `$81332C` | 2 | `D1 < 0` |
| boss | `$8133CC` | 8 | `$20 <= D0 <= $23` |
| common | `$81364C` | 48 | everything else |

58 × `$50` = `$1220`, i.e. `$81332C..$81454B` — and **`$81454C`, the byte after
the table, is the DUMMY the allocator returns when a band is full.** The
driver's `move.w #$39,D6` walks all 58 in one pass. The three bands and the
58-slot walk are the same table; that is why `lea $81364C` and `move.w #$39`
looked inconsistent until both were read.

**ALLOCATION FAILURE — a THIRD convention, different from both of the ones
already recorded:**

```
263744: movem.l (A7)+,D0-D2
263748: lea $81454C,A0        the dummy, one past the end of the table
26374E: ori #$1,SR            CARRY SET
263752: rts
```

so: **object table** → dummy `$80D51C` **and D0 = 0**; **enemy table** → dummy
`$81454C` **and carry**; **sprite queue** → **carry** and the caller's count
zeroed. Three subsystems, three signalling conventions, nothing evicted in any
of them. That is what the brief means by "allocation failure is gameplay".

**A quirk that is not a disassembly slip:** `moveq #$0,D3` at `$263710` is only
on the 48-slot band's fall-through path. The other two bands `bra $263712` past
it and `$2636D6`'s `movem.l D0-D2,-(A7)` does not save D3 — so the type word
those bands store is `(the CALLER's D3 + band index) | $8000`. Ported as
written (`src/enemies.js` `allocEnemy(ram, d0, d1, d3)`).

**And the number that decides wave 5's cost.** `w5recon.lua` (new) hooks the
driver's own `sub.w D0,($4,A6)` write at `$26352E` — a WRITE, so a real 68000
execution hook — which runs exactly once per live enemy with A5 still the
record, and censuses `($4C,A5)`:

```
$ python .../w5/recon.py stage1-open
ENEMY handler pointers dispatched (from ($4C,A5)): 5 DISTINCT
ENEMY handlers 2688CC:8411 268232:740 26A2E2:662 269CEA:429 275914:133
ENEMY type words (A5+0): 24 distinct  8002:620 8000:612 ... 8017:295
ENEMY bands C_common48:10375   (nothing in the 2- or 8-slot bands)
ENEMY live per logic frame max=24 hist 0:1962 19:103 17:90 16:70 20:54 ...
```

**Five routines.** The 24 "type words" are `slotIndexInBand | $8000` and carry
no type information — the enemy's identity IS the handler pointer. So "port
some enemies" is exactly: translate `$2688CC`, `$268232`, `$26A2E2`, `$269CEA`,
`$275914`. **None of the five is translated in wave 5**; every dispatch is a
loud named throw carrying the handler address and the census counts.

The `MISMATCH_vs_815E9C` line in that census fired on 44 of 2,600 frames and is
not a bug in either side: the tap counts every enemy *dispatched*, `$815E9C`
counts the ones still alive after their handler ran.

### 2. THE PLAYER-SHOT SUB-DRIVER — `$253A70`, 36 slots × `$30`, TWICE

Same method: `objhunt` gave `W pc=253AA6 n=10048 off=810576..810A26 stride=48`;
`xref.py lea 810572` gave `$253A70`; `xref.py callers 253A70` gave **exactly one
caller, `$28B610`** — inside top-level object type **5** (`$28B5E0`, dispatch
entry [5], priority `$18`).

```
253A70: lea $810572,A6        THE P1 SHOT TABLE
253A76: move.w $813176,D6     the scroll delta
253A7C: clr.w $81295C         THE LIVE SHOT COUNT
253A92: swap D6 / move.w #$1,D6 / swap D6   <- the two-player counter is parked
253A9A: moveq #$23,D7            in D6's HIGH word while its LOW word carries
253A9C: move.w (A6),D1 / beq     the scroll
253AA0: addq.w #1,$81295C
253AA6: sub.w D6,($4,A6)      SCROLL COMPENSATION
253AAA: D0 = (D1 & $F) * 4
253AB2: lea ($253ADE,PC),A0 / adda.w D0,A0 / movea.l (A0),A0 / jsr (A0)
253ABE: lea ($30,A6),A6 / dbra D7
253AC6: lea $810448,A4 ...  / swap D6 / dbra D6,$253A98
```

36 slots × `$30` per player; A6 is simply left where the first pass ended, so
P2's table is `$810572 + 36*$30 = $810C32` — independently confirmed by the
spawn at `$249D3E`, which loads `$810C32` by name.

**`$81295C` IS NOT BOOKKEEPING.** Wave 4's frame-sync governor `$23C272` sums
`$81B40C + $81295C + 2*$81295E` against a threshold. The number of live player
shots feeds the arm/hysteresis decision — a port that leaves it at 0 while
shots are on screen changes *when* the frame is armed, not just what is drawn.

Dispatch table `$253ADE`, 16 longwords (`xref.py ptrtable 253ADE 4 16`):

```
[ 0] $253B1E  [ 4] $254078  [ 8] $253BDA  [12] $254136
[ 1] $253C98  [ 5] $2541BC  [ 9] $253D52  [13] $25427A
[ 2] $253E34  [ 6] $254300  [10] $253EC6  [14] $2543A4
[ 3] $253F56  [ 7] $25442A  [11] $253FE8  [15] $2544CE
```

Measured type words over `stage1-open` (same census, hooking `$253AA6`):

```
SHOT kind words: 16 distinct
  8048:3842 814A:2585 83CA:1285 82C8:668 8000:259 8040:256 8140:255 8042:252
  8002:252 80C8:169 81CA:165 80C2:21 8082:21 83C8:12 81C0:3 80C0:3
SHOT live per logic frame max=20 hist 0:2025 20:267 19:108 10:44 15:39 ...
```

16 distinct words but only **FOUR distinct low nibbles — 0, 2, 8, A** — so only
`$253B1E`, `$253E34`, `$253BDA`, `$253EC6` are ever reached in the opening.
**None is translated.** `$253B1E` ends in `jmp $23F3AE`, the sprite ENQUEUE, so
translating one shot handler pulls in the sprite request pipeline (wave 6).

### 3. THE SPRITE-LIST CAP — reached by intervention, and the guard is fragile

The brief: *"find out what happens at the cap rather than assuming it never
fills."* Wave 2 answered from the listing and said so. This wave measured it.

**First, a listing result wave 2 explicitly left open.** Wave 2: *"whether any
caller acts on [the carry] I did not establish"* — because the call sites are
`bsr`, invisible to an absolute-long xref. A static scan of every `bsr` in
`$200000-$2A0000` whose target is `$23D726` finds **29 sites, `$23D3EC` ..
`$23D61A`, and ALL 29 are followed by `bcs $23D624`**:

```
23d3e0: lea $805104,A0 / lea $80AFC2,A1 / bsr $23D726 / bcs $23D624
23d3f4: lea $805CC8,A0 / lea $80AFC4,A1 / bsr $23D726 / bcs $23D624
... 29 of these, one per BUCKET, in a fixed order ...
23d624: (the emit)
```

So the cap does **not** merely drop the next request. `$23D75A` zeroes the
CURRENT bucket's remaining count and every one of the 29 call sites then jumps
straight to the emit — **the current bucket's remainder AND every later bucket
are abandoned wholesale.** Because the buckets are appended in a fixed order,
what is lost is a whole low-priority TAIL. (`bsr` is what this scan sees; a call
through a register would not be.)

**Second, a SECOND appender with NO cap test at all:**

```
23d762: lea $80397C,A0 / adda.w $80AFC0,A0 / ... / 23d794: addi.w #$c,$80AFC0
```

`$23D794` increments the shared write pointer and never compares it against
`$BC4`. It is reached from the object handlers in main-loop call #2, i.e. before
the guarded chain in call #4 runs.

**Third, the guard is EQUALITY, not `>=`:** `$23D746 cmpi.w #$BC4,$80AFC0 /
beq $23D75A`. It is only safe because the pointer starts at 0 and steps by
exactly 12, so it can never straddle `$BC4`. A port that writes `>=` there is
not translating this instruction.

**The measurement, `pgm.py spritecap` (new, permanent).** `$80AFC0` is poked at
the sample point — a multiple of 12 below the cap, i.e. a value the board itself
holds every frame — and a new standing census counts executions of `$23D75A`
by hooking its `clr.w (A1)` write:

```
CONTROL                     high_water=$5A0 (120/251)  queue_full_events=0
POKE $0600 (128/251)        high_water=$BA0 (248/251)  queue_full_events=0
POKE $0900 (192/251)        high_water=$BC4 (251/251)  queue_full_events=544 <--
POKE $0A80 (224/251)        high_water=$FE4 (339/251)  queue_full_events=31
POKE $0B40 (240/251)        high_water=$10A4 (355/251) queue_full_events=0
POKE $0B70 (244/251)        high_water=$10D4 (359/251) queue_full_events=0
POKE $0BB8 (250/251)        high_water=$111C (365/251) queue_full_events=0
```

Read that table twice, because both halves are results:

1. **At `$0900` the cap is genuinely reached, 544 times, and the board takes it
   in its stride** — `halt_loop_interrupts=0`, still build B, the object driver
   still processing its usual slot counts. The buckets cut were `$80AFC2`,
   `C4`, `C6`, `C8`, `D0`, `D6`, `DA`, `DC`, `DE`, `E2`, `E6`.
2. **At `$0A80` and above the guard is STEPPED OVER ENTIRELY** and the pointer
   runs to 339–365 records, well past the 251 cap — because the *unguarded*
   appender in call #2 carries it past `$BC4` before the guarded chain starts,
   and the equality test can then never match. Nothing is corrupted: the queue
   buffer `$80397C..$80AFBF` is 30,276 bytes ≈ 2,523 records, far larger than
   the cap, and the emitter's independent clamp (`$23D65E cmpi.w #$BC4,D0 /
   bls` else `move.w #$BC4,D0`) bounds the hardware list regardless. **The cap
   is a display-list limit, not a buffer limit.**

Why 251 and not 256, re-confirmed from the listing: the emitter inserts a filler
entry every 52 records (`$23D676 moveq #$33,D4`, then `moveq #$32`), and
251 + 5 = 256 = the IGS023 maximum.

**Honest limit of the intervention:** the poke makes the emitter read the bytes
already at those queue offsets — last frame's requests — so `sprites`, `d_spr`
and `pix` move for two reasons at once and are NOT a clean measure of *which*
sprites are lost. That comes from the listing above. `d_ram` is likewise
over-determined (the poke writes `$80AFC0`, which is inside the digest). The
command says all of this in its own output and claims only what it can.

### 4. THE WAVE-4 REVIEW DEFECT THAT BLOCKED THIS WAVE — fixed, red-validated

`04-review.md` §4: `$23BE8C` was ported only as far as `$23BEB2`. Re-derived
here rather than taken on trust:

```
$ python xref.py dasm 23BE8C 100
23beb2: move.w $80390a,$803910
23bebc: andi.w #$3,$803910          <- NOT PORTED in wave 4
23bec4: move.w $80390a,$803912      <- NOT PORTED
23bece: andi.w #$7,$803912          <- NOT PORTED
23bed6: move.w $80390a,$803914      <- NOT PORTED
23bee0: andi.w #$f,$803914          <- NOT PORTED
```

The review's reason for caring is the wave-5 reason: `xref.py abs` finds 13 / 20
/ 4 absolute-long readers of `$803910` / `$803912` / `$803914` in build B (a
LOWER BOUND — register-relative reads are invisible), at sites like `$252A7C`,
`$25E54C`, `$26A3DE`, `$27EE68`, `$28000C`, `$26FAC2`. Mod-4 / mod-8 / mod-16
phase is what stage and enemy scripts key off.

Fixed in `src/main.js` `#counters()`; `RAM.frameCounterCopy` renamed to
`frameCounterMod4/8/16`; `tests/player.test.js:271` (which asserted the
*unmasked* value and cited the instruction whose next line masks it) corrected.

**And it is now a compared column and permanently red.** The reason nothing
caught it in wave 4 was structural — `CLAIMED` was 31 named columns and the
full-RAM digest `d_ram` is in the oracle's TSV but is *not* compared, so an
unported write to unwatched RAM was invisible by construction. `c3910`,
`c3912`, `c3914` are now in `WATCH_SPEC` and `CLAIMED`, and the new mutation
`no-phase-mask` restores wave 4's behaviour exactly:

```
DIVERGE c3910 first at lf=2001: port=1302 board=2
DIVERGE c3912 first at lf=2001: port=1302 board=6
DIVERGE c3914 first at lf=2001: port=1302 board=6
```

### 5. THE OBJECT ALLOCATOR — ported, with all four failure paths

Wave 4 threw here (`ctx.queueNotEmpty`). Every routine re-disassembled in this
wave before translation: `$2410F2`, `$24110A`, `$24111E..$241180`,
`$241182..$2411E0`, `$2411E2..$241236`, `$241238..$241260`, `$241262..$241290`.

| # | ROM | what happens |
|---|---|---|
| 1 | `$2411D4` | create queue full (20 staged) → dummy `$80D51C`, D0 = 0, spawn SILENTLY DROPPED |
| 2 | `$24116E` | the priority walk ran off all 20 slots → staged record DISCARDED |
| 3 | `$241158` | table full but the new object outranks a slot → the tail memmoves DOWN and **slot 19's contents are destroyed** |
| 4 | `$241246` | kill queue full (20) → the kill request is dropped, the object stays alive |

Two quirks translated rather than tidied:

* **`$2411FC cmp.w D0,D1` compares the object's unique ID as a WORD**, although
  `$2411CA` stores it as a longword from the 32-bit counter `$80E882`. IDs alias
  every 65,536 spawns and a delete can match the wrong object. Pinned by a test.
* **`$241254` steps the kill queue's write pointer by `$50` per LONGWORD
  entry**, so the queue occupies `$80DBFE + k*$50` and its `$640` cap is 20
  entries, not 320 — and `$24126C` decrements *before* reading, so kills drain
  **LIFO**. Both pinned by tests.

`ALLOC events` is printed by `portdiff.mjs` on every run, empty line included:
on the fly-around window it is `none`, which is also the regression evidence
that the translation is inert where wave 4 measured the queues empty.

### 6. THE PLAYER'S WEAPON BLOCK — the cadence machine ported, the spawn not

Wave 4 threw at `$249B50`, the first instruction of the shot branch. Wave 5
carries `$249B2C..$249BE2` — the whole per-frame cadence machine:

* `$249B2C..$249B3C` the power byte `($54/$55,A6)` → `($56,A6)`;
* `$249B48` the shot edge (mirror bit 4), `$249B56..$249B70` the reload of the
  shot counter `($2b,A6)` = `((D0 >> 1) & 6) + ($2d,A6)` — a WORD shift then a
  BYTE mask, in that order, so bit 0 of the shifted value is discarded;
* `$249B74`/`$249B86` the two `bclr` gates, `$249B96..$249BBC` the release path
  and its countdown, `$249BC2..$249BDE` the delay reload of `($2a,A6)`.

It stops at `$249BE2`'s two-entry jump table on the ship type, with a loud named
throw naming `$249BFC` (ship 0) or `$249D2C` (ship 2) and saying why: the spawn
fills a record through `$24A222`/`$24A2D6` out of PC-relative pattern tables
(`$2554EA`, `$255502`, `$25551A`, `$255332`) indexed by ship, power `($20,A6)`
and formation `($5A,A6)`, and every record it creates is driven by the four
UNPORTED shot handlers. It also feeds back: `$249CA8`/`$249CEA` clear `($2b,A6)`
and bit 3 of `(A6)` when the 36-slot table has no free record, so **the shot
table's occupancy is an input to the player record** — which is why the player
block cannot be compared in a firing scenario without the shot subsystem.

**THE BUTTON MAP**, which wave 2 item 5 left open and wave 4 measured:
mirror **bit 4 = shot/laser** (`$249B48`), **bit 5 = bomb** (`$24980A`),
**bit 6 = AUTO-SHOT** — `$2497B2` finds the operator byte `$80380F` set to `$01`
and *synthesises* a shot edge into `($19,A6)` on alternate frames
(`bchg #4,($1,A6)` / `bset #4,($19,A6)`). So Button 3 is not a third weapon; it
is Button 1 on a 2-frame cadence. The three weapons are **shot** (tap B1),
**laser** (hold B1 — the speed ramp 22→12 in the OPTION object, wave 4 §4) and
**bomb** (B2 with stock ≥ 4 at `$2497FE`).

---

## Why the done-when is BLOCKED — the measurement, not an opinion

The exit condition needs `0 divergent frames` on the **full sprite-list digest**
for three firing scenarios. Working outward from the player, here is everything
that sits between the port and that number, each item with the measurement that
sizes it:

1. **The player's weapon branch cannot be closed without the shot subsystem.**
   Measured above: the free-slot scan's failure feeds back into `($2b,A6)` and
   `(A6)` bit 3. So no button can be pressed in a compared scenario until the
   36-slot driver AND its four reached handlers exist.
2. **A shot handler ends in the sprite ENQUEUE** (`$253B1E: jmp $23F3AE`). So
   the first shot handler pulls in the request pipeline, which is main-loop call
   #4 (`$23D2AE`) — explicitly wave 6's integration job in the plan.
3. **The full sprite-list digest requires ALL of it.** `d_spr` hashes
   `$800000..$8009FF`, built by call #4 from 29 buckets fed by every live
   object. The port implements 2 of the 20 top-level dispatch entries; the
   `UNPORTED calls` census on the fly-around run shows `$240F62[0]`, `[1]`,
   `[4]` ×2, `[5]`, `[10]`, `[11]` running every frame, unported.
4. **Top-level type 5 — the one that owns the weapons — is 15 subsystem calls.**
   `$28B5E0` is `jsr $289B80 / $2634F4 / $28AD54 / $27F95A / $288E4E / $2890F2 /
   $255DD8 / $253A70 / $24C096 / $254680 / $255042 / $28A098 / $2527CE /
   $24A458`. Porting "the shot" means porting the one of those fifteen, plus the
   enemy driver reached from `$2634F4` in the same handler.
5. **Five enemy handlers, none translated**, and each is entered through a
   record pointer, so there is no static call graph to bound them from — they
   were enumerated by measurement (§1) and that enumeration is scenario-bounded:
   a longer scenario may find a sixth.
6. **`score/chain words identified in wave 2` DO NOT EXIST.** The wave-5
   done-when depends on a wave-2 output that wave 2 did not produce — wave 2's
   §7 is about the operator RANK byte `$80380C`, and its items 6 (hitbox) and 8
   (protection cross-check) came back BLOCKED. I did not locate the score or
   chain words either, and I am not going to name a plausible address.
7. **The kill chain needs the hitbox, which is still unmeasured.** Wave 2 item 6
   was BLOCKED; wave 4 left the lead (`$2458C0`, half-extents `($14,A6)` /
   `($16,A6)`, flag `bset #4,(A6)` at `$2458D8`) and so does this wave. Wave 4's
   fly-around still MASKS `pst` bit 12 for exactly this reason (109 of 2,200
   frames).

So the three scenarios are not written. **Writing `stage1-open-shot` with a
button script and letting it throw would have produced a scenario that exists
and proves nothing**, and the corpus is where this project's credibility lives.

## What I could not do, and why

1. **The three scenarios and their 0-divergent-frames comparison.** §"Why the
   done-when is BLOCKED", items 1–5. Not attempted, not stubbed.
2. **No enemy handler, no shot handler, no bomb.** `$2688CC $268232 $26A2E2
   $269CEA $275914` and `$253B1E $253E34 $253BDA $253EC6`, plus the bomb block
   `$249814..$249A80` (which calls `$28C8DA`, `$243D14`, `$2532EA`, `$2875B4`,
   `$285AF2`, `$285C1C`, `$242AC6` …). Every one is a loud named throw with its
   address.
3. **The score and chain words were not located.** See item 6 above. The
   done-when's dependency on wave 2 for them is an inherited gap and it is named
   here rather than quietly satisfied with a guess.
4. **The hitbox is still not measured.** Third wave running. It is the entry
   point to the kill chain and it is one write tap on `($14,A6)`/`($16,A6)` away
   — wave 4 wrote that down and so do I; neither of us ran it.
5. **The `stage1-open` object-table census is scenario-bounded.** The top-level
   table holds exactly 8 live objects in steady state — types `10, 2, 1, 5, 11,
   4, 4, 0` at priorities `1F 1C 1A 18 0A 09 09 09` — measured over
   lf1960..2600. A different point of the stage may hold a different set; this
   is presence, not coverage.
6. **The enemy driver's `runEnemyDriver` and the shot driver's `runShotDriver`
   are NOT reached by any scenario**, because the top-level handlers that call
   them (types 5 and 10) are unported. They are covered by unit tests against
   the listing and by nothing else, and that is stated in the test file's own
   header rather than implied.
7. **I did not re-run `pgm.py check` in full** (gfx gate, zoomcov, sound,
   sprites, rtc, drc, overrun, seedstate, pixred). I ran: the port unit suite,
   `flyaround` fresh and under three mutations, `determinism.mjs`, `gate`, and
   the new `spritecap`. The `frame.lua` edit is a CENSUS line only — no TSV
   column — and `pgm.py gate` reproducing `635bb92f1a9dc81e…` to the character
   is the evidence that no digest in the corpus moved.
8. **`04-review.md`'s remaining smaller items are untouched:** the
   `clamp-first` / `no-tilt-decay` mutations are still broader than their names,
   `src/main.js`'s per-call cycle costs still lack the "MAME-timed,
   uncalibrated" label, and `NOTES-oracle.md:136`'s `armed_vblanks` legend still
   contradicts its own correction 280 lines below. I fixed the three the review
   listed under "before wave 5 touches the object table" (the counters, the
   test, and `lsr-not-asr` → `dy-off-by-one`) plus the `CLAMP_ORDER` leak, and
   left the rest.

## If someone picks this up cold

```
python games/ddpdoj/tools/oracle/pgm.py flyaround              THE GATE (34 cols)
python games/ddpdoj/tools/oracle/pgm.py flyaround --reuse --break no-phase-mask
python games/ddpdoj/tools/oracle/pgm.py spritecap              THE CAP, MEASURED
node --test games/ddpdoj/tests/                                35 pass, 0 skipped
python games/ddpdoj/tools/oracle/xref.py dasm 263502 180       the enemy driver
python games/ddpdoj/tools/oracle/xref.py dasm 253A70 120       the shot driver
python games/ddpdoj/tools/oracle/xref.py ptrtable 253ADE 4 16  the shot dispatch
```

`games/ddpdoj/tools/oracle/w5recon.lua` is the census that produced the handler
enumeration; drive it with a five-line python wrapper (`W5_FRAMES`, `W5_INPUT`,
`W5_REQUIRE_BUILD`).

**Seven things that will save you the hours they cost me:**

1. **The enemies are NOT in the top-level object table.** That table holds 8
   live *systems* (`10 2 1 5 11 4 4 0`), one of which is the player. The
   enemies are 58 records at `$81332C` driven by `$263502`, reached from
   type 10; the player's shots are 36 records at `$810572` driven by `$253A70`,
   reached from type 5. Wave 2's 20-slot walk is a scheduler of schedulers.
2. **An enemy's identity is a FUNCTION POINTER at `+$4C`, not a type word.**
   The word at `+$0` is `slotIndexInBand | $8000`. Enumerate the handlers by
   measurement; there is no table to read.
3. **`$81295C` (live shots) and `$815E9C` (live enemies) are read by the frame
   sync's governor.** They are not statistics.
4. **The sprite queue has TWO appenders and only one of them checks the cap.**
   `$23D726` guards with `beq #$BC4`; `$23D794` does not check at all. And the
   guard is equality, so a pointer that is not on the 12-byte grid — or that is
   already past `$BC4` — slips through it forever.
5. **A full sprite queue abandons whole BUCKETS, not the last few requests.**
   All 29 call sites `bcs $23D624`.
6. **Three allocators, three failure conventions**: D0=0 + dummy `$80D51C`
   (objects), carry + dummy `$81454C` (enemies), carry + caller's count zeroed
   (sprite queue). Do not assume the one you already read.
7. **A compared column is the only thing that is checked.** `d_ram` is in every
   TSV and is compared by nothing; that is how wave 4 shipped three wrong phase
   counters through a green gate. If you port a write, put it in `WATCH_SPEC`
   in the same commit.
