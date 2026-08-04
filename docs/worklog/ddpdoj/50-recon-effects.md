# 50 — RECON: EXPLOSIONS, DEATH EFFECTS AND THE IMPACT POOL (wave E5)

status: **DONE** — see the WAVE ESTIMATE (§8) and the work list (§9).

Headline: **there is no "spawn an explosion" routine.** Every enemy's death arm
inlines `moveq #kind,D0 / jsr $289004` and then writes six to nine fields into
the record the allocator returns — 327 such sites in the image. **There are FIVE
effect pools, not two**, and the brief names two of them. **`$289004` +
`$288E4E` alone still leak**, because `$288E4E` sub-allocates into a *third*
pool (`$81C8EC`) whose only consumer is type-5 call #6 `$2890F2`. And **0 of the
269 sprite streams the effect scripts name are in the shipped sheet** — E5 has a
hard art dependency of **218.4 KiB gz**, priced with the port's own chain solver.

wave: 50. role: RECON (read-only; this file is the only thing I write or commit).
date: 2026-08-04.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Build B = `$23xxxx..$2Axxxx`.
Any build-A address is flagged on the line with its reason. **There are none
below** — every address in this document is build B.

instrument: `games/ddpdoj/tools/oracle/out/maincpu.bin` — the decrypted build-B
image, **address == file offset**, 6,291,456 B (gitignored, `derive.py`).
Disassembly: `tools/oracle/xref.py dasm` (unidasm); cross-references:
`xref.py callers/abs/lea`, which sees **absolute-long operands only** — every
caller count is a LOWER BOUND and a clean result is "no absolute-long site",
never "nothing does this". Art priced with the PORT's own
`src/render/spritedir.js streamExtent` and the PORT's own coalesce + `gzip -9`,
i.e. the same arithmetic `tools/export-web.mjs` uses.

`[M]` = measured by me this session. Anything cited from another document says
so and names it. **No MAME was run.** Every dynamic figure is the PORT replayed
against a TSV already on disk.

tree: HEAD `4c7f13e`; `git status --porcelain games/ddpdoj/` was EMPTY at the
time of every run. An implementer is editing `games/ddpdoj/src/` and
`games/ddpdoj/tools/` concurrently — **every statement below about the PORT is a
snapshot of a tree that may be mid-edit** and is dated to that hash. Nothing in
§1–§3 or §5 depends on `src/` at all; §2.3, §2.4 and §6 do, and say so.

---

## 0. THE BRIEF'S PREMISE, CHECKED

**The brief is right about everything load-bearing.** `$288E4E` is the effect
pool's driver, `$27F95A` is the impact pool's, both dispatch through PC-relative
tables no `bsr` scan can see, the impact pool really is `$8171BE` with 80 slots,
and `$289004` really must not ship without `$288E4E`. I reproduced all of that
independently.

**Four things in its shape are wrong, and each changes the wave.**

| the brief / its inputs say | [M] this session |
|---|---|
| the two large unported type-5 calls are the effect pool `$288E4E` and the impact pool `$27F95A` | **There are FIVE pools** stacked contiguously in `$8171BE..$81DB8D`, each with its own allocator, its own type-5 driver and its own PC-relative emitter table (§1). Two more of them — `$2890F2` (#6) and `$28A098` (#12) — are on the death path, and **`$2890F2` is exactly the call W40 §7.2 left UNRESOLVED. It is emission. §1.6 closes it.** |
| E5 = "the effect pool `$288E4E` + `$289004`", `$289004`'s only driver is `$288E4E` | **`$288E4E` itself allocates into a THIRD pool.** `$288EF0 jsr $289098` fills `$81C8EC` (20 slots, `$40`), whose only consumer is `$2890F2`. Shipping `$289004`+`$288E4E` alone rebuilds W33 §4's leak **one level down** (§4). No document in this repo says this. |
| `$2440E0`, 2,542 B, "the death explosion", "one effect or a dispatcher?" | **Neither.** [M] 39 copies of one 64-byte block, driven by a 624-byte parameter table at `$244ACE`, using **four** effect kinds. It is a `for` loop over a table (§3). |
| `$28A098` (type-5 #12) is "the bulk writer for bucket 20 — cheap in pixels (195 px), the first pre-emptive sacrifice" (W40 §3.3 [CITED]) | It is **the DRIVER of the PLAYER SHOT'S IMPACT SPARK** (§1.7). [M] The port drops **1,766** `$289F54` spawns into that pool over 6,185 firing frames — **4.6× as many as all 382 `$289004` death effects put together**. W11's 195 px was measured on a scenario that **never fires**, so it cannot weigh this at all. |

And one correction that REMOVES work: **`$28C714` is a SOUND CUE, not a visual
burst** (§2.5). It moves 1,766 notes per firing run out of E5.

---

## 1. THE POOLS — there are FIVE, and they are contiguous in RAM

[M] Every base, stride, slot count and count-word address was read out of an
instruction this session, and **every geometry is CHECKED by the arithmetic
closing exactly on the next pool's base**.

| # | pool | base | stride | slots | live count | ALLOCATOR | DRIVER (type-5 call) | emitter table | buckets |
|---|---|---|---:|---:|---|---|---|---|---|
| **A** | **IMPACT** | `$8171BE` | `$2C` | **80** = 70 + a reserved 10 | `$817F7E` | `$27F8F8` / `$27F8EE` (70) · `$27F92A` (10, from `$817DC6`) | **`$27F95A`** (#4) | `$27F99E`, **20 entries / 15 distinct** | 8 |
| **B** | **EFFECT** | `$81B732` | `$38` | **80** + a bit-bucket slot | `$81C8EA` | **`$289004`** | **`$288E4E`** (#5) | `$288FF0`, **5 entries** | 0,1,2,3,7 |
| **C** | sub-record | `$81CDEE` | `$30` | **48** | `$81D38E` | not located | `$289B80` (#1) | `$289C26`, **5 entries** | 0,1,2,3,7 |
| **D** | sub-effect | `$81C8EC` | `$40` | **20** (10 when `$813098` or `$81308C`) | `$81CDEC` | **`$289098`** | **`$2890F2`** (#6) | `$28924A`, **5 entries** | 0,1,2,3,7 |
| **E** | **SHOT IMPACT** | `$81D394` (P1) / `$81D790` (P2) | `$22` | **30 + 30 = 60** | `$81DB8C` | **`$289F54`** family | **`$28A098`** (#12) | `$28A140`, **4 entries / 3 distinct** | 20 |

### 1.1 The arithmetic that pins each geometry  [M]

```
A IMPACT   $817F7E - $8171BE = 3,520 = 80 x $2C           the count word ends it
           $27F8F8: `move.w #$45,D7` -> 70 slots from $8171BE
           $27F92A: `moveq  #$9,D7`  -> 10 slots from $817DC6
                    and $8171BE + 70*$2C == $817DC6        EXACT
B EFFECT   $81C8B2 - $81B732 = 4,480 = 80 x $38
           $289004's FAILURE return is `lea $81C8B2,A0` -- the one-past-the-end
           slot IS the bit bucket (W34 §1.6, reproduced independently)
           $288E0C clears (#$8DC+1)*2 = 4,538 B = 80 slots + the bit bucket +
           the count word $81C8EA.                          EXACT
C SUB-REC  $81D38E - $81CDEE = 1,440 = 48 x $30
D SUB-EFF  $81CDEC - $81C8EC = 1,280 = 20 x $40
           $289084 clears (#$280+1)*2 = 1,282 B = 20 slots + the count word. EXACT
E SHOT-IMP $81D790 - $81D394 = 1,020 = 30 x $22             P1 -> P2   EXACT
           $81DB8C - $81D790 = 1,020 = 30 x $22             P2 -> count EXACT
```

**THE BRIEF'S "`$8171BE`, 80 slots" IS CONFIRMED** — and **the 80 is split
70 + 10 between two different allocators, which no document in this repo says.**
A port that lets `$27F8F8` walk all 80 takes ten slots the cartridge reserves.

### 1.2 The EFFECT record — full field map, `$38` bytes  [M]

Read out of `$289004` (the initialiser) and `$288E4E` (the stepper). Every
offset is an instruction I read this session.

| off | sz | what |
|---|---|---|
| `+$00` | w | **STATUS.** bit15 = allocated (`ori.w #$8000,D0 / move.w D0,(A0)`); **bit 6 = "the script has been started"** (`$288E7A bset #6,(A6)`); low byte = **the KIND**, and **bit 7 of the low byte selects script table `$221630` instead of `$221520`**. `clr.w (A6)` = FREE. |
| `+$02` | l | position — **hi word = long axis (X), lo word = short axis (Y)** |
| `+$06` | l | the two sprite OFFSET words, loaded by an escape command |
| `+$0A` | l | **the sprite DESCRIPTOR** (`($a,A6)`: pri bit + 23-bit `sprmask` word offset) |
| `+$0E` | w | width/height, loaded by an escape command |
| `+$10` | w | non-zero → `jsr $24179E` every frame. init 0; `$2440E0` writes 1, or **2 when `$813092 == 4`** |
| `+$12` | w | **sub-spawn parameter**; `$289004` inits it to `$FFFF` = NONE. `bmi` skips the `$289098` call. Cleared to 0 by every death arm and by all 39 of `$2440E0`'s blocks, and reset to `$FFFF` after the one shot |
| `+$14` | w | second sub-spawn parameter (D0 for `$289098`) |
| `+$16` | b | init `$1E`; copied to `+$1D` at the sub-spawn |
| `+$18` | w | **SPAWN DELAY** — counted down before anything else runs (init 0) |
| `+$1A` | b | non-zero → turn (`+$1A` angle, `+$1B` speed) into a velocity via `$241D34`, then clear |
| `+$1B` | b | the speed for the above |
| `+$1C` | b | init 0; pushed/popped across the sub-spawn |
| `+$1D` | b | init `$1E` |
| `+$1E` | w | **THE BUCKET SELECTOR** — a BYTE offset (0/4/8/`$C`/`$10`) into `$288FF0`. init 0 |
| `+$20` | b | friction countdown; `+$21` its reload |
| `+$22` | l | friction delta (init 0) |
| `+$26` | l | one-shot position delta, added to `+$02` when the script starts (init 0) |
| `+$2A` | l | cursor into the DESCRIPTOR list |
| `+$2E` | l | cursor into the DURATION list |
| `+$32` | w | frames left on the current animation cell |
| `+$34` | l | velocity, hi = X, lo = Y (init 0) |

### 1.3 `$288E4E` — the stepper, read in full  [M]

`$288E4E..$288FEF`, **418 B**. `move.w #$4F,D7` + `dbra` = **80 slots every
frame, unconditionally** — there is no live-count shortcut; `$81C8EA` is
RE-COUNTED each frame (`clr.w` at the top, `addq.w #1` per live slot).

Per live slot, in ROM order: spawn-delay countdown → first-run script load
(`bset #6`) → the `$289098` **SUB-SPAWN into pool D** → subtract `$813176` (the
scroll) from Y → the `$24179E` hook → angle→velocity (`$241D34`) → friction →
position += velocity → **the off-screen cull** → the animation advance → **the
LASER interlock** → emit.

Three semantics that will be got wrong if they are not transcribed:

* **THE OFF-SCREEN CULL FREES THE SLOT, and it is the pool's main consumer.**
  `$288F68..$288F9C`: `addi.w #$1000` / `addi.w #-$5800` on Y and
  `addi.w #$1000` / `addi.w #$7000` on X; **either carry does `clr.w (A6)`** —
  the same `clr.w (A6)` the script's `$FFFF` terminator reaches. A port that
  frees only on the terminator will still leak on a fast-moving effect.
* **THE LASER INTERLOCK.** `$288FBC lea $811F72,A0 / tst.w (A0) / bpl $288FD6` —
  when the LASER's beam record is negative the effect is emitted **only on
  frames where `$80390A & 1`**. Effects FLICKER at half rate while the laser is
  on. `$811F72` is `37-recon-laser.md`'s own record [CITED].
* **THE EMITTER TABLE IS FIVE ENTRIES AND ENTRY [5] IS CODE.**
  [M] `$288FF0` = `$23D762 $23D79E $23D7DA $23D816 $23D852` → buckets
  **0, 1, 2, 3, 7**; the longword at `$289004` is `48E7C07E`, i.e. `$289004`'s
  own `movem.l`. This reproduces W40 §3.2 exactly, from an independent dump.
  `($1E,A6)` is used as a raw byte offset, so **a value outside 0/4/8/`$C`/`$10`
  `jsr`s into code** — range-check it and throw.

### 1.4 `$288E20` — the descriptor-list walker, and the escape format  [M]

`$288E20..$288E4D`, **46 B**. Reads the longword at the cursor. **Positive → it
is a sprite stream address, stop.** Negative → an 8-byte COMMAND:

```
first word == $FFFF :  ($E,A6) := next word (w/h) ; ($6,A6) := next long (offsets)
first word != $FFFF :  skip one word             ; ($2,A6) += next long (a nudge)
```

Both commands are 8 bytes. So a descriptor list is a stream of 4-byte stream
addresses interleaved with 8-byte negative-tagged commands, walked in **lockstep
with the duration list**: one stream address is consumed per duration word.

**Verified end to end on kind 0** [M]: `$221740` = `FFFF0618 FA00FD00` (w/h
`$0618`, offsets `$FA00FD00`), then **12** longwords `$21F344..$21F688` stepping
`$4C`; `$221778` = **12** words of `$0000` then `$FFFF`. Both lists end at 12.

### 1.5 `$27F95A` — the IMPACT stepper  [M]

`$27F95A..$27F99D`, **68 B**. Live-count driven (`$817F7E`), skips free slots,
subtracts `$813176` from `($4,A6)`, then
`moveq #$7C,D0 / and.w D1,D0 / lea ($27F99E,PC),A0 / adda.w D0,A0 /
movea.l (A0),A0 / jsr (A0)`.

* `$27F982 tst.b D1 / bmi $2810CA` — **bit 7 of the status low byte routes to a
  wholly different body at `$2810CA`, bypassing the table.** A port that reads
  only the table misses that arm.
* **The mask is `$7C` — 5 bits, 32 possible indices — and the table has 20
  entries.** [M] The longword at `$27F9EE` is `7001 41F9` (`moveq #1,D0 / lea
  $817F86,A0`), i.e. code. Entries 20..31 would `jsr` into the middle of a
  routine. **Range-check and throw**; do not trust the mask.
* [M] the 20 entries resolve to **15 DISTINCT bodies**: `$27FA30 $27FACC
  $27FE0E $27FED2 $27FF9A $280082 $28016A $280252 $28036A $280486 $2805A2
  $2806BE $2807D6 $2808F2 $280A0E`. Entries 4/16/17/18/19 duplicate 0/1/5/6/7.
  All twelve absolute-long callers of bucket 8's stub `$23EBA0` lie inside that
  range — **reproducing W40 §3.2 independently.**
* **The allocator initialises from a ROM TEMPLATE, not from code.** [M]
  `$280B3E` (the success tail) does `lea ($280E4A,PC),A3 / movea.l (A3,D0.w),A3`
  and copies **22 bytes** (`4+4+2+4+4+2 +2`) into the new slot. `$280E4A` is a
  **20-entry** table resolving to **7 distinct 22-byte templates** at
  `$280E9A $280EB0 $280EC6 $280EDC $280EF2 $280F08 $280F1E`. **Export these as a
  ROM window; do not transcribe them as literals.**

### 1.6 `$2890F2` (type-5 call #6) — W40's OPEN ITEM, CLOSED. It IS emission.  [M]

W40 §7.2: *"I did not find their PC-relative dispatch tables … `$2890F2` has a
pool (`$81C8EC`, stride `$40`, count `$81CDEC`) that looks exactly like the two
that DO emit."* It does, and here are its two tables:

```
$2891CC  lea ($289224,PC),A0 / adda.w D0,A0 ...   D0 = ($1E,A6)
[M] $289224 : $289610 $289610 $289610 $289610 $289610   -- 5 entries, ONE target
              (entry [5] is $0C140002 = `cmpi.b #$2,(A4)`, code)

$2891E6 and $28920A  lea ($28924A,PC),A0 / adda.w D0,A0 / movea.l (A0),A0 / jsr (A0)
                                            D0 = ($24,A6)
[M] $28924A : $23D762 $23D79E $23D7DA $23D816 $23D852   -- THE FIVE BUCKET STUBS
              -> buckets 0, 1, 2, 3, 7
```

**Pool D emits into the same five buckets as the effect pool.** `$289610`
advances `($A,A6)` through a longword list at `($14,A6)` with cursor `($10,A6)`
and its own 5-entry table at `$289644` (`$28979E $2897E0 x4`).
Free: `$289238 clr.w (A6) / subq.w #1,$81CDEC`.

### 1.7 `$28A098` (type-5 call #12) — it is NOT just "bucket 20's bulk writer"  [M]

`$28A098..$28A1D9`, **322 B**. It is the DRIVER of pool E:

```
$28A0E6 lea $81D394,A6        <- pool E, P1 base
$28A0EC lea $808FA4,A4        <- bucket 20's staging buffer
$28A0B0 move.w $81DB8C,D7     <- pool E's LIVE COUNT (it walks P1 and P2 as one
                                 60-slot array)
$28A106 lea ($28A140,PC),A0 / adda.w D0,A0 / movea.l (A0),A0 / jmp (A0)
[M] $28A140 : $28A132 $28A150 $28A15C $28A150   -- 4 entries, 3 distinct
              (entry [4] is $532E0016 = `subq.b #1,($16,A6)`, code)
$28A1B4 move.w A4,$80AFDE     <- bucket 20's counter.  W40's label is right...
$28A1A4 subq.w #1,$81DB8C     <- ...and it is also the pool's FREE
```

**Its allocator is the `$289F54` family** (`$289F54 $289F96 $289FC0 $289FDA
$289FF4 …`, common tail `$28A060`): `moveq #$1D,D2` = **30 slots**, or `moveq
#$E,D2` = **15** when `$81308C` is set; `lea ($22,A0),A0`; `$81D394` for P1 and
`$81D790` for P2, chosen by `cmpa.l #$8103E6,A4`. `$28A1DA` fills the record
from a PC-relative template at `($28A506,PC)` / `($28A786,PC)`.

**W11's ablation figure of 195 px for bucket 20 was measured on
`stage1-open`, which never fires** (W40 §2.1's own caveat: nineteen buckets
scored 0 because they carried zero records in that scenario). It is not evidence
about this pool. §2.4's control is.

---

## 2. WHO SPAWNS AN EXPLOSION — there is no shared spawner

### 2.1 The mechanism, from two ported handlers' death arms  [M]

Read out of the listing this session. Type `$10`'s death arm `$2682BA` and type
`$11`'s `$268952` are **the same nine instructions**, inlined:

```
$2682BA  moveq   #$3,D0                 <- THE EFFECT KIND, an immediate
$2682BC  lea     ($267FAC,PC),A1        <- a bucket REMAP table
$2682C0  jsr     $289004.l              <- ALLOCATE.  A0 = the record (or the
                                           bit bucket $81C8B2 on failure)
$2682C6  move.l  ($2,A6),($2,A0)        <- the dying enemy's POSITION
$2682CC  moveq   #$0,D0
$2682CE  move.b  ($1e,A6),D0            <- the ENEMY's own bucket byte
$2682D2  move.w  (A1,D0.w),($1e,A0)     <- remapped into the EFFECT's bucket
$2682D8  move.w  #$1,($10,A0)           <- the $24179E hook
$2682DE  move.w  #$FE00,($26,A0)        <- a one-shot upward nudge
$2682E4  move.w  #$0,($12,A0)
$2682EA  move.w  #$0,($14,A0)           <- ($12)=0 ARMS THE POOL-D SUB-SPAWN
```

[M] `$267FAC` is an 18-word table at `$267FA0..$267FC3`, three 6-entry rows
(`0 0 4 8 C 10` / `4 4 8 C 10 10` / `0 0 4 8 C 10`) — enemy bucket → effect
bucket, i.e. the explosion is drawn at a depth derived from the enemy's own.

**So the answer to "what actually creates the effect" is: THE HANDLER DOES, in
line, and there are 327 such places.** No `$28615E`, no `$286096`, no
`$263762`, no shared death routine is involved — which is why W34 §1.2 found
`$244D62` naming exactly one external target.

### 2.2 The call-site census  [M]

`xref.py callers 289004` (absolute-long `jsr`/`jmp` only → a LOWER BOUND):

```
[M] 327 sites, ALL in build B.
    294 in $23xxxx..$29xxxx   <- reproduces W34 §1.1's 294 EXACTLY
     33 in $2Axxxx            <- W34's scan stopped at $2A0000
     39 of the 294 are inside $2440E0 alone (§3)
    255 are in the enemy/boss handler banks $263xxx..$27Exxx and $29xxxx
```

The corresponding chain for the other pools:

| pool | allocator | [M] absolute-long callers |
|---|---|---|
| A IMPACT | `$27F8F8` | 4 — `$281D2E $281E3A $282016` (**the BULLET block**) and `$29EC6A` |
| A IMPACT | `$27F8EE` | 7 — `$27665A $276908 $2774C8 $2777E2 $27A380 $27EF90 $27F294` (enemy handlers) |
| A IMPACT | `$27F92A` | 1 — `$2767E6` |
| D SUB-EFFECT | `$289098` | 2 — `$267ECA` and **`$288EF0`, inside `$288E4E` itself** |
| B EFFECT clear | `$288E0C` | 5 — `$2440E0 $25FD40 $27C73A $28B5B4 $2A5A30` |
| B/D drivers | `$288E4E` / `$2890F2` / `$27F95A` | **1 each** — `$28B5FE` / `$28B604` / `$28B5F8`, i.e. type-5 `$28B5E0` and nothing else |

### 2.3 The path the port already walks, end to end

`$28B670` (type 5's tail, **ported**, W34) → `$244D62` blocks 5/6a/6b
(**ported**) → the handler's damage-reaction arm (**ported**) → its death arm →
`jsr $289004` → **the port stops here and counts a note.** `src/shots.js`'s
`$253BDE`/`$253ECA` (**ported**) reach `$289F54` and `$28C714` on the same path.

[M] `src/handlers.js` at HEAD `4c7f13e` carries **17** `noteEffect(u, 0x289004,
…)` sites plus **3** midboss-arm notes = **20 named `$289004` gaps in ported
code**. That is the implementer's shopping list and it already exists.

### 2.4 THE MEASUREMENT, WITH A CONTROL  [M]

Method: `tools/w34damagegate.mjs survey()` — W34's own tool, so the intervention
is W34's own and named there: `fly-around`'s seed at lf2000, `--stick` (the
owner's script from `docs/knowledge/09`), `--no-pods` (`$24C164` throws on the
first held fire frame), `--free 12000`, and single-frame Button-1 taps every 4
logic frames. **Valid for coverage, invalid for characterising play.** Nothing
compared against the board. Both runs blocked identically at **lf8186 by
`$292902`, the stage-1 boss** (W48's subject), so both are 6,185 frames.

| note | `--fire 4` | `--no-fire` (THE CONTROL) |
|---|---:|---:|
| kills reaching `$28615E` | **363** | **0** |
| **`$289004`** death/hit effects (pool B) | **382** | **0** |
| **`$289F54`** the SHOT'S IMPACT SPARK (pool E) | **1,766** | **0** |
| `$27F8EE` enemy-handler impacts (pool A) | **31** | **0** |
| `$27F8F8` the bullet block's impact (pool A) | 2,283 | **2,628** |
| `$28C714` (see §2.5 — it is SOUND) | 1,766 | 0 |
| `$288E4E` / `$27F95A` / `$2890F2` / `$28A098` driver calls | 6,185 each | 6,185 each |

The control does exactly what a control must: **every damage-driven family goes
to zero and the bullet-driven one does not** (it goes UP, because more enemies
survive to shoot).

**The `$289004` breakdown by KIND, `--fire 4`** [M] — this is the denominator
for the art in §5:

```
  137 x D0=$7   death     120 x D0=$3  hit        45 x D0=$2  death
   25 x D0=$1   death      20 x D0=$3  death      11 x D0=$D  death
   10 x D0=$C   death       6 x D0=$84 death       5 x D0=$85 death
    3 x D0=$85  midboss arm death ($26B884)
  ---------------------------------------------------------------
  382 spawns, EIGHT distinct kinds: $1 $2 $3 $7 $C $D $84 $85
```

### 2.5 A CORRECTION TO THE PORT: `$28C714` IS A SOUND CUE  [M]

`src/shots.js`'s note (quoted in the run above) calls it *"the shot's impact
BURST, one of the `$28Cxxx` effect family, unported"*.

```
$28C714  tst.b $81DEB8      <- a debounce byte
$28C722  move.w #$24,D0 / move.w #$62,D1 / move.w #$3,D2 / jsr ($28C0AE,PC)
$28C732  move.b #$3,$81DEB8

$28C3BA  move.w #$D,D0  / move.w #$5D,D1 / move.w #$A,D2 / jsr ($28C02A,PC)
         -- and the port ALREADY labels $28C3BA "the shot fire SOUND"
```

[M] `$28C02A` and `$28C0AE` share a body: both gate on `$80380A`, `$80392A` and
`$803926` and both end at `$28BFEC`, which does `add.w $81DEB4,D1` and clamps D1
to `0..$FF` — **`$81DEB4` is a master volume and D1 is a per-cue volume.**
`$28C714` is a sound request. **It is not E5's, and 1,766 notes per firing run
belong to the sound wave the owner deferred** (`27-OWNER-sound-queued-after-stage-1.md`).

---

## 3. `$2440E0` — it is a `for` loop over a 624-byte table

[M] `$2440E0..$244ACD` = **2,542 B** (W48's figure, reproduced), and
`$244ACE..$244D3D` = **624 B** of parameters. `$244D40` is the next routine
(`$244D62`'s no-player entry, W34 §1.4) — **both ends pinned, 2 bytes of slack.**

```
$2440E0 jsr $288E0C          <- CLEARS THE WHOLE EFFECT POOL, all 80 slots
$2440E6 move.w #$14,$803930
$2440EE lea ($244ACE,PC),A1
   x39:  move.w (A1)+,D0
         jsr $289004
         move.l ($2,A6),($2,A0)      the dying object's position
         move.w (A1)+,($1e,A0)       bucket
         move.w (A1)+,($26,A0)       one-shot delta, hi
         move.w (A1)+,($28,A0)       one-shot delta, lo
         move.w (A1)+,($1a,A0)       angle:speed
         move.w (A1)+,($12,A0)       sub-spawn param
         move.w (A1)+,($14,A0)
         move.w (A1)+,($18,A0)       SPAWN DELAY -- this is what staggers it
         move.w #$1,($10,A0)
         cmpi.w #$4,$813092 / beq -> move.w #$2,($10,A0)
$244ABA jsr $260E36 / jsr $23C4E0 / jsr $23C4B0 / rts
```

[M] **39 blocks, stride 64 bytes** (one is 70 — an extra `move.w (A2),(A0)`
variant at `$244A70`), **8 words = 16 bytes per table entry, 39 × 16 = 624
EXACT.**

[M] **It uses FOUR effect kinds and TWO buckets:**

```
  kind histogram : $0C x1   $0D x17   $84 x3   $85 x18
  buckets        : $0C (-> $288FF0[3] = bucket 3) and $10 (-> [4] = bucket 7)
  spawn delays   : 4,5,6,... -- the 39 pieces bloom over ~40 frames
```

**All four kinds are already in the eight the port's ported handlers reach**
(§2.4), so **`$2440E0` needs ZERO new art beyond the effect pool's own set**.
[M] its kind set costs 124 of the 269 streams = **151.4 KiB gz** — a strict
subset of §5's 218.4 KiB.

[M] **Seven absolute-long callers**: `$293EEC` (the stage-1 boss, table D id 6's
STEP — W48 §6 [CITED]), `$298E30`, `$29CC8E`, `$2A0668`, `$2A5FBA`, `$2A648C`
(the other four bosses' banks), **and `$275D10`** — which is inside the
`$275xxx` ENEMY-HANDLER block, gated on `btst #5,D0` after `jsr $23D17E`. **I
did not resolve which handler owns `$275D10`** (§10), and that is what decides
whether `$2440E0` is reachable in stage 1 without the boss.

**As a port it is ~30 lines**: one loop over a 39-entry ROM window. W48 §7 sized
wave C as "`$2440E0` (2,542 B) + `$289004` + the `$28Bxxx`/`$28Cxxx` cluster";
**the 2,542 B is 39 copies of 64 bytes and is not the cost. The pool is.**

---

## 4. THE `$289004` PROBLEM — what must ship TOGETHER

W34 §1.6's judgement is **right, and it does not go far enough.**

### 4.1 The leak W33 fixed, restated

W33 §4 [CITED]: a pool whose free test is "word 0 is zero", filled by a producer
with no consumer, silently failing after N allocations — **100 of 100 slots
consumed by lf2906, every later spawn silently discarded, through four waves of
green gates.** `$289004` has exactly that shape: it returns
`lea $81C8B2,A0`, the bit bucket, and **its caller cannot tell**. There is no
carry flag, no zero return, nothing. (Contrast `$27F8F8`, which sets carry on
failure — the impact allocator *does* report it.)

### 4.2 THE SECOND LEAK, ONE LEVEL DOWN — this is new

```
$288ED0 move.w ($12,A6),D0 / bmi $288F00     <- skip if negative
$288EF0 jsr $289098                          <- ALLOCATE FROM POOL D ($81C8EC)
$288EFA move.w #$FFFF,($12,A6)               <- one-shot: never again
```

`$289004` inits `($12) = $FFFF`, so a bare allocation does nothing. **But every
death arm I read writes `move.w #$0,($12,A0)`** (`$2682E4`, `$26897C`) **and all
39 of `$2440E0`'s blocks load `$12` from the table, where [M] every one of the
39 is `$0000`.** So **every death effect the port would spawn sub-allocates once
into pool D**, which has **20 slots** and whose only consumer is
`$289238 clr.w (A6) / subq.w #1,$81CDEC` inside **`$2890F2`, type-5 call #6**.

> **[M] Porting `$289004` + `$288E4E` and nothing else rebuilds W33 §4's leak
> exactly, in pool D, after 20 spawns instead of 80.**

### 4.3 THE MINIMUM SHIPPABLE SET, named

Everything in this list must land in ONE commit, or the port gets a silent pool:

1. **`$289004`** — the allocator (128 B), **including its bit-bucket return**;
   the port must COUNT a bit-bucket allocation as an event (the `spawnEvent`
   precedent W33 §4 established), never treat it as success.
2. **`$288E4E`** — the stepper (418 B), **including the off-screen cull**
   (§1.3), which is the pool's main free.
3. **`$288E20`** — the descriptor walker (46 B). Without it `($A,A6)` is never
   loaded and nothing draws.
4. **`$288FF0`** — the 5-entry emitter table, **range-checked**.
5. **`$289098`** (90 B) **and `$2890F2`** (344 B core + `$28924A` + `$289610`)
   — pool D's allocator AND its driver, together, for §4.2's reason.
6. **`$288E0C`** and **`$289084`** — the two pool clears (20 B each). `$2440E0`
   calls `$288E0C`; `$25FD40` and `$28B5B4` call it on stage/round boundaries.
   Without them a pool survives a reset it should not.
7. **The two 34-entry script tables and their data as ROM WINDOWS** — [M]
   `$221520..$222617`, **4,344 B** (§5.1). Not JS literals: a wrong extent must
   throw by address.
8. **The art** (§5). Without it 269 of 269 records draw the wrong picture or are
   skipped, and E5 is invisible.

**What may safely be left out:** the impact pool A (its allocator reports
failure, and its four `$27F8F8` callers are the bullet block's — see §6), and
pool E (self-contained, §7).

---

## 5. THE ART — 0 of 269. E5 HAS A HARD ART DEPENDENCY.

### 5.1 The script tables, enumerated complete  [M]

```
$288E4E: kind = (A6) low byte.  bit 7 -> table $221630, else $221520.
         index = kind & $7F, and $289004 range-checks `0 <= D1 <= $21` -> 34.
         stride 8: [+0] descriptor list, [+4] duration list.

[M] $221520 + 34*8 == $221630   EXACT   (table A ends where table B begins)
[M] $221630 + 34*8 == $221740   EXACT   ($221740 IS kind 0's descriptor list)
[M] walking all 68 entries: the data runs $221740..$222617
    -> TABLES + DATA = $221520..$222617 = 4,344 B, both ends pinned by data
```

**68 script entries → [M] 23 DISTINCT scripts** (the entries repeat: A0..A16
are unique, A17..A33 repeat them; B0..B5 are unique; B6..B16 alias A10..A16;
B17..B33 repeat B0..B16). Cell counts 12..36. **That is the coverage
denominator: 68 of 68 entries, 23 of 23 scripts.**

### 5.2 Against the shipped sheet  [M]

Method: walk all 68 entries, collect every `($A,A6)` longword, and test
membership in `games/ddpdoj/assets/spr/streams.u32.gz` (378 `[romOffs,
packedBase, maskWords]` triples, the W44/W47 format).

```
[M] EFFECT SCRIPT STREAMS, distinct : 269      range $2016B4..$227FA4
[M] SHIPPED ROM STREAM KEYS          : 378      range $000000..$1DF780
[M] IN THE SHEET                     : 0 of 269
```

**Zero. And the reason is structural, not accidental: every effect stream lies
ABOVE the highest address the sheet contains.** The effect art is a region of
the mask/colour ROMs nothing in this port has ever touched.

### 5.3 Priced, with the port's own solver  [M]

`src/render/spritedir.js streamExtent` over the assembled `sprmask`/`sprcol`,
coalesced and `gzipSync level 9` the way `tools/export-web.mjs` does it
(~0.4 % below what the exporter writes, for RECON 2 §1.1's power-of-two reason
[CITED]).

| set | streams | unresolvable | mask+col RAW | **GZ** |
|---|---:|---:|---:|---:|
| **all 68 script entries / 23 scripts** | **269** | **0** | 742.3 KiB | **218.4 KiB** |
| **the 8 kinds the port reaches TODAY** (§2.4) | **204** | 0 | 667.4 KiB | **195.8 KiB** |
| `$2440E0`'s 4 kinds (`$C $D $84 $85`) | 124 | 0 | 526.3 KiB | 151.4 KiB |

**0 of 269 unresolvable** is itself a result: all 269 are valid stream starts in
the cartridge's chain, so this is a harvest-by-address exactly like W47's, not a
hunt.

Cut points, if the wave must be sharded (top 6 of 23, gz):

```
  $2223AE (kind $D)  36 cells  62.1 KiB     $22208A (kind $9)  33  59.0 KiB
  $221D78 (kind $85) 35 cells  48.7 KiB     $221CA6 (kind $5)  32  45.4 KiB
  $2222D2 (kind $C)  31 cells  25.0 KiB     $221BCA (kind $84) 31  24.8 KiB
  ... the cheapest 5 are 1.6, 2.5, 2.6, 3.4 and 4.6 KiB
```

For scale [CITED from `assets/manifest.json` as shipped]: the whole sprite
bundle today is six shards, boot shard 0 is 40.1 KiB gz and the largest deferred
shard (type `$31`'s 70-frame animation) is 119.5 KiB.

> **E5 THEREFORE DEPENDS ON THE E2/E3 MACHINERY — AND THAT MACHINERY ALREADY
> EXISTS.** W47 built harvest-by-ROM-address, the `shards`/`harvest` manifest
> rows and the deferred-promote path. The effect art is one more `harvest` row
> with a table that is not a flat array but a script walk. **It is not blocked
> on E2/E3; it consumes them.**

### 5.4 What is NOT priced

The impact pool A and pool E do **not** read `$221520`/`$221630`. Pool A's
records are initialised from the 22-byte ROM templates at `$280E9A`
(§1.5); pool E's from `($28A506,PC)` / `($28A786,PC)`. **I did not walk either
to a stream address and I did not price their art.** That is a named gap and it
is the first thing to close if E4 and E5 are merged.

---

## 6. BULLETS (E4) — YES, THEY MEET E5, IN TWO PLACES

E4 is not mine, but the brief asks, and the answer is **the two waves overlap at
two pools and the overlap is worth planning around.**

**They do NOT share the effect pool's emission path.** [M] The player's shots go
to bucket 14 via the per-record stub `$23F3AE` (`src/shots.js`, ported), and the
enemy bullets to buckets 22/23 via the bulk writer `$281D9A`
(`src/bulletdriver.js`, ported, sink-less). Neither touches `$288FF0`.

**But:**

1. **The IMPACT pool A belongs to the bullet block.** [M] `$27F8F8`'s only four
   absolute-long callers are `$281D2E`, `$281E3A`, `$282016` — all inside the
   `$281xxx` bullet code — and `$29EC6A`. The port's `src/bulletdriver.js`
   already throws at `$27F8F8` **2,283 times with fire and 2,628 without**
   (§2.4). So **pool A is E4's dependency, not E5's**, and W40's ranking of it
   as "#2, bullet hits" is right about what it draws and wrong about who calls
   it.
2. **The SHOT-IMPACT pool E is the visible half of "shooting works".** [M] 1,766
   `$289F54` spawns per firing run, 0 in the control. The owner's sentence was
   *"shooting enemies with bullets works, but you can't see the bullets and no
   explosions"* — **pool E is the spark at the point of impact, and it is 4.6×
   more frequent than every death explosion combined.** It is 652 B, a 4-entry
   table, and one bucket.

**Recommendation to the architect: move pool E (`$289F54` + `$28A098`) to the
FRONT, ahead of both E4 and the rest of E5.** It is the smallest routine set in
this whole document and the highest-frequency thing on the owner's own
complaint.

---

## 7. SIZE IT — routines, bytes, slots, table entries

All [M], spans between landmarks I read this session.

| subsystem | span | bytes | routines | table entries |
|---|---|---:|---:|---|
| **B EFFECT core** | `$288E0C..$289083` | **632** | 5 (`$288E0C $288E20 $288E4E $288FF0 $289004`) | 5 emitter |
| **D SUB-EFFECT core** | `$289084..$28925D` | **474** | 4 (`$289084 $289098 $2890F2 $28924A`) | 5 + 5 |
| — its dispatch body | `$289610..$289657` | 72 | 1 + a 5-entry table | 5 |
| **the effect SCRIPTS** | `$221520..$222617` | **4,344** (ROM window) | — | **68 entries / 23 scripts / 1,538 cells** |
| **the effect ART** | — | **218.4 KiB gz** | — | **269 streams, 0 in the sheet** |
| **`$2440E0`** | `$2440E0..$244D3D` | **3,166** (2,542 code + 624 table) | 1 | 39 blocks / 4 kinds / 2 buckets |
| **E SHOT-IMPACT** | `$289F4E..$28A1D9` | **652** | ~7 entry points + 1 driver | 4 / 3 distinct |
| **A IMPACT whole** | `$27F8EE..$280F33` | **5,702** | 3 allocators + 1 stepper + **15 bodies** + 1 fill tail | 20 dispatch / 15 distinct · 20 template / **7 distinct 22-B templates** |
| — its bit-7 arm | `$2810CA..` | not sized | 1 | — |

**Pools: 80 (B) + 20 (D) + 60 (E) + 80 (A) = 240 slots to model.**

---

## 8. WAVE ESTIMATE

**E5 IS NOT ONE WAVE. IT IS THREE, AND THE ORDER IS NOT THE BRIEF'S.**

| wave | scope | size | why it is its own wave |
|---|---|---|---|
| **E5a — THE SHOT SPARK** | pool E: `$289F54` family + `$28A098` (#12) + the 4-entry table `$28A140` + its ROM templates + its art (unpriced, §5.4) | **652 B**, 60 slots, 4 table entries | Self-contained: its own allocator, its own driver, one bucket, no dependency on pools B/C/D. [M] **1,766 spawns per firing run against a 0 control — the most frequent visible effect on the damage path.** Smallest and highest-value item in the layer. |
| **E5b — THE EFFECT POOL** | pools B **and D together** (§4.3's eight items): `$288E0C $288E20 $288E4E $288FF0 $289004 $289084 $289098 $2890F2 $28924A $289610`, the `$221520..$222617` ROM window, and the **218.4 KiB** art shard | **1,178 B** of code + 4,344 B window + 218.4 KiB gz art; 100 slots; 68 script entries / 23 scripts; 5+5 table entries | This is the wave the brief describes, plus pool D. It cannot be cut smaller without rebuilding W33's leak (§4.2). Its art is 5× its code. R3 in `43-plan` §7 says "expect it to split" — [M] **it does not need to; the script format is 4-byte streams + 8-byte escapes and I read it end to end (§1.4).** |
| **E5c — `$2440E0`** | 1 routine, 39 blocks, a 624-byte ROM window | **3,166 B**, ~30 lines of JS, **0 new art** | Only after E5b (it calls `$288E0C` and `$289004` 39 times). [M] Its only stage-1-reachable caller may be `$275D10`; every other caller is a boss, and W48 says the stage-1 boss is **0 of 111 script entry points ported** [CITED]. **Do not schedule it before the boss unless `$275D10` is resolved (§10).** |

**NOT E5, and say so in the plan:** the **IMPACT pool A** (5,702 B, 15 bodies,
20+20 table entries). [M] Its allocator's absolute-long callers are the bullet
block's, the port already throws there 2,628 times *without firing*, and it
draws into bucket 8. **It belongs to E4.**

**MUST SHIP TOGETHER (the one-sentence answer to the brief's Q4):**
`$289004` + `$288E4E` + `$288E20` + `$288FF0` + **`$289098` + `$2890F2`** +
`$288E0C` + `$289084` + the `$221520..$222617` ROM window + the art shard —
**and the bit-bucket return must be counted as an event, not as success.**

---

## 9. IMPLEMENTER-READY WORK LIST

1. **Port pool E first** (§8 E5a). `$289F54`'s family shares one tail at
   `$28A060` (`moveq #$1D,D2` = 30, `moveq #$E,D2` = 15 when `$81308C`); the
   P1/P2 fork is `cmpa.l #$8103E6,A4`. `$28A098` walks P1 and P2 as ONE 60-slot
   array off `$81DB8C`. Its bucket-20 counter write is `$28A1B4 move.w
   A4,$80AFDE`. Emitter table `$28A140`, 4 entries, `$28A132 $28A150 $28A15C
   $28A150`, entry [4] is code.
2. **Export the two script tables and their data as ONE ROM WINDOW**,
   `$221520..$222617` (4,344 B), and read the pointers out of the cartridge —
   the precedent is W48 §8.4 and W36 §4.2's `resolveEmitStub`. A wrong extent
   must throw by address. Assert `$221520 + 34*8 == $221630` and
   `$221630 + 34*8 == $221740` **on every build**; both are exact today and both
   are how the 34 is pinned.
3. **Port `$289004` with its FAILURE PATH VISIBLE.** `lea $81C8B2,A0` is the bit
   bucket; A0 is deliberately not restored by the closing `movem.l`. **A
   bit-bucket allocation must be a counted event** with the kind and the caller
   — that check is the one W33 §4 says would have caught the sub-record leak
   four waves earlier.
4. **Port `$288E4E` whole, including the off-screen cull and the laser
   interlock** (§1.3). Red-validate the cull: an effect driven off screen must
   free its slot, and with the cull removed the pool must reach 80 of 80 and
   start discarding — **that is the leak, seen to happen.**
5. **Port `$289098` + `$2890F2` in the same commit** (§4.2). Pool D is 20 slots
   (10 when `$813098` or `$81308C`), and every death effect sub-allocates once.
6. **Harvest the art by ROM address**, exactly as `tools/export-web.mjs`'s
   `harvest` rows already do — but the "table" here is a SCRIPT WALK, not a flat
   longword array, so the harvester needs the §1.4 walker. [M] 269 streams,
   0 unresolvable, 218.4 KiB gz; **204 / 195.8 KiB buys the eight kinds the port
   reaches today.** Deferred shard, promoted by the miss guard, "named, never
   black" (`src/web/assets.js BgShards`' existing contract).
7. **`$267FAC` is a ROM window too** — 18 words at `$267FA0..$267FC3`, the
   enemy-bucket → effect-bucket remap every death arm indexes.
8. **`$2440E0`** (§3): one loop, `$244ACE` as a 39×16-byte ROM window, and note
   that `$2440E0` **clears the entire pool first** via `$288E0C` — an
   implementer who skips that will have the boss's explosion fight 80 live
   records for slots.
9. **Do not port pool A in this wave.** If it is wanted, its extra pieces are
   the 20-entry template table `$280E4A` (7 distinct 22-byte templates), the
   bit-7 arm `$2810CA`, and a range check for indices 20..31 which the `$7C`
   mask admits and the table does not have.
10. **Fix the two notes this recon falsifies**: `src/shots.js`'s `$28C714`
    ("the shot's impact BURST") is a **SOUND CUE** (§2.5); and W40 §3.3's
    `$28A098` row ("bucket 20's bulk writer, 195 px") is the **shot-impact
    pool's driver** (§1.7). Both will send an implementer to the wrong wave.

---

## 10. WHAT I COULD NOT DETERMINE

Stated the way `docs/knowledge` requires — what I looked for, and where.

1. **Which handler owns `$275D10`**, `$2440E0`'s only non-boss caller. I read
   `$275CD0..$275D1A` and found a straight-line block gated on `btst #5,D0`
   after `jsr $23D17E`; `xref.py callers` on six candidate entry points
   `$275CE8..$275D00` returned **nothing** (absolute-long only, so the entry is
   reached by `bsr`/`jsr (An)`). **This decides whether `$2440E0` is reachable
   in stage 1 without the boss**, and it is a 20-minute listing read.
2. **The ART for pools A and E** (§5.4). Neither reads `$221520`/`$221630`;
   both initialise from PC-relative ROM templates (`$280E9A`, `($28A506,PC)`,
   `($28A786,PC)`). I read the templates' addresses and did **not** walk them to
   a stream address, so **E5a and E4 have unpriced art** and my "652 B" for
   pool E is code only.
3. **`$28925E..$28960F`** — 434 bytes between pool D's emitter table and
   `$289610`. `$28925E` is `cmpi.b #$2,(A4)`, the same shape as `$289610`'s
   `cmpi.b #$E,(A4)`, so it looks like a sibling emitter, but I did not find the
   table that reaches it. **What I tried:** the two tables `$289224` and
   `$28924A` (both dumped, both accounted for) and a read of `$2891DC..$289249`.
4. **Pool C's allocator** (`$81CDEE`, 48 slots, driver `$289B80` = type-5 call
   #1). I sized the pool from `$81D38E - $81CDEE` and did **not** find who
   fills it. `$28AD70`'s note in the port names a `$81DB90` sub-record cue pool,
   which is a *different* base.
5. **`$2810CA`'s extent** — the impact pool's bit-7 arm. I read its first 15
   instructions and did not walk it to an `rts`.
6. **Whether the effect records, once drawn, look RIGHT.** Nothing here is
   compared against MAME. Every dynamic number is the port replayed against a
   TSV already on disk. A record with a correct kind and a correct bucket can
   still be the wrong picture — and §5 proves nothing in the current bundle can
   even be *asked* for one.
7. **Whether the impact pool's 20-entry dispatch can be indexed above 19 in
   play.** The mask is `$7C` (32) and the table is 20. I found no writer that
   sets bits 5–6 of an impact record's low byte, but I did not enumerate the
   writers — **and the fill tail `$280B3E` uses the SAME D0 against a 20-entry
   template table**, so both would go out of range together.
8. **`$803930`, `$813092` and `$81DEB4`.** `$2440E0` writes `$14` to the first,
   branches on the second (`== 4` doubles `($10,A0)`), and `$28BFEC` adds the
   third as a volume. None traced.

---

## LOG

- opened.
- **[M] FIVE pools, not two** (§1), contiguous in `$8171BE..$81DB8D`; every
  geometry closes exactly on the next pool's base.
- **[M] the brief's `$8171BE` / 80 slots is CONFIRMED**, and the 80 is 70 + a
  reserved 10 with two different allocators (`$27F8F8` and `$27F92A`), which no
  document here says.
- **[M] the impact dispatch `$27F99E` is 20 entries / 15 distinct**, and the
  mask `$7C` admits 32 — entries 20..31 would `jsr` into code.
- **[M] the full `$38`-byte effect record field map** (§1.2), and the
  `$221520`/`$221630` script format read end to end and verified on kind 0
  (§1.4): 12 descriptor longwords, 12 duration words, both lists ending together.
- **[M] the off-screen cull, not the animation, is the effect pool's main
  consumer**, and there is a LASER INTERLOCK that halves the effect frame rate
  while `$811F72` is negative.
- **[M] W40 §7.2's OPEN ITEM CLOSED: `$2890F2` (type-5 #6) IS EMISSION** — two
  PC-relative tables, `$289224` (5 entries, all `$289610`) and `$28924A` (the
  five bucket stubs → buckets 0,1,2,3,7).
- **[M] W40 §3.3's `$28A098` row is wrong about what it is.** It is not merely
  bucket 20's bulk writer; it is the DRIVER of the player shot's impact spark
  (pool E, `$81D394`/`$81D790`, 60 slots), whose allocator is `$289F54`.
- **[M] THERE IS NO SHARED EXPLOSION SPAWNER.** Each handler's death arm inlines
  `moveq #kind,D0 / lea ($267FAC,PC),A1 / jsr $289004` + six to nine field
  writes. **327 absolute-long sites**, of which **294 in `$23xxxx..$29xxxx`
  reproduce W34 §1.1 exactly** and 33 more are in `$2Axxxx`, which W34's scan
  did not cover.
- **[M] MEASURED, 6,185 frames, with a CONTROL**: 363 kills → **382 `$289004`**,
  **1,766 `$289F54`**, 31 `$27F8EE`, against **0 / 0 / 0** in the no-fire
  control. `$27F8F8` is 2,283 with fire and **2,628 without** — it is the
  bullet block's, not damage's.
- **[M] EIGHT distinct effect kinds on the port's damage path**: `$1 $2 $3 $7
  $C $D $84 $85`.
- **[M] `$2440E0` IS NOT A DISPATCHER**: 39 copies of one 64-byte block over a
  624-byte table at `$244ACE`; **four kinds, two buckets, staggered spawn
  delays**; it clears the whole pool first via `$288E0C`; body and table both
  pinned, `$244D40` next. **It needs zero new art.**
- **[M] THE SECOND LEAK, which no document has**: `$288EF0 jsr $289098` inside
  `$288E4E` allocates from pool D (20 slots), and **every death arm and all 39
  of `$2440E0`'s blocks write `($12) = 0`, which arms it.** `$289004 + $288E4E`
  alone rebuild W33 §4's leak one level down (§4.2).
- **[M] THE ART DOES NOT EXIST. 0 of 269.** Every effect stream
  (`$2016B4..$227FA4`) lies above the shipped sheet's highest key (`$1DF780`).
  **218.4 KiB gz for all 269, 195.8 KiB for the 204 the port's eight kinds
  need**, priced with the port's own `streamExtent` + coalesce + `gzip -9`,
  0 unresolvable.
- **[M] `$28C714` IS A SOUND CUE**, not a visual burst — same shape as
  `$28C3BA`, which the port already labels the shot fire sound. 1,766 notes per
  firing run leave E5.
- **[M] SIZED**: pool B core 632 B, pool D core 474 B, pool E 652 B, pool A
  5,702 B, `$2440E0` 3,166 B, the script window 4,344 B; 240 pool slots;
  68 script entries / 23 scripts.
- **WAVE ESTIMATE: THREE** (§8) — E5a the shot spark (652 B, highest frequency),
  E5b the effect pool + pool D + 218.4 KiB of art (the wave the brief means),
  E5c `$2440E0` (cheap, boss-gated). **The impact pool A is E4's, not E5's.**
- eight things I could not determine (§10), the first of which — who calls
  `$275D10` — decides whether `$2440E0` is reachable in stage 1 at all.

status: DONE
