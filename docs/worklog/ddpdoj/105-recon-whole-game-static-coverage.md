# 105 -- RECON: whole-game static coverage (stage 1 subsystems past the boss)

status: **DONE.** (opened IN PROGRESS 2026-08-06 before digging, closed same day)

started: 2026-08-06. wave: 105. role: RECON (READ-ONLY; the only tree file I
write is this one; throwaway scripts live in `.scratch/w105/`, gitignored, NOT
committed). target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address
is build B. instrument: `games/ddpdoj/tools/oracle/out/maincpu.bin` (address ==
file offset, big-endian), capstone `CS_MODE_M68K_030`. Reuses
`bosscoverage.py`'s `Rom` reader by import.

`[M]` = measured by me, this session, from the image or this tree. The ported
set is DERIVED from source (each subsystem's own registration mechanism), never
a hand list.

This is the W99-style sweep for every stage-1 subsystem that is NOT the boss.
Per subsystem: dispatch model, closed entry-point enumeration out of the ROM,
ported set, gap, dead-code finds, and a one-line verdict on how
`bosscoverage.py` generalizes.

---

## 0. PREMISE CHECK (the most important section) -- the brief is a CATEGORY ERROR

**"Point bosscoverage at the HUD/medals" is a CATEGORY ERROR, and forcing the
boss tool onto those subsystems would produce nonsense.** The boss scheduler is
ONE of THREE distinct dispatch mechanisms in stage 1, and `bosscoverage.py`'s
CONFIG block describes that one alone. Concretely, `walk_tables` reads each
table as stride-8 `(INIT, STEP)` longword pairs; applying it to the HUD's
object-type table `$240F62` would read type 0 as `INIT=$28D520` (the real
handler) and `STEP=$00090000` -- which is the PRIORITY WORD, not a routine
address. `[M]` verified: `$240F62[0+4] == $00090000`, and type 10 (RANK) reads
`STEP=$001F0000`. Those "STEP routines" do not exist.

The three dispatch mechanisms `[M]`:

| # | mechanism | table(s) | walker | entry shape | stride | what lives here |
|---|---|---|---|---|---|---|
| 1 | **boss scheduler** | MAIN/F/E/D + OBJECT (`$293104`/`$294F68`/`$295856`/`$29370A`/`$292932`) | `$2596C6` + `$25962E` tail | `(INIT, STEP)` pairs + `$FFFFFFFF` pointer list | 8 | the stage-1 boss ONLY |
| 2 | **top-level object driver** | `$240F62`, **20 entries (types 0-19)** | `$2410BC` -> `$2410CC..$2410EC`, `jsr $240F62[type<<3]` | `(handler, priority)` single pointer + data long | 8 | background, P1/P2, RANK, HUD ledger, type-5 bus, stage-clear, and 13 unported types |
| 3 | **type-5 call list** (the "subsystem bus") | inline `jsr.l` sequence inside `$28B5E0` (`$28B5E6..$28B66A`), **23 entries** | the type-5 object's per-frame handler | bare `jsr.l` targets in PC order | none (not a table) | enemies, bullets, all 6 pools (impact/bee, effect, sub-record, sub-effect, spark, item), options, beam, bomb, ship-draw, damage |

A FOURTH shape sits inside mechanism #3: each pool has its own KIND dispatch
table (pool A `$27F99E` stride-4 single pointers; item pool `$27E9F8` stride-4
single pointers; pool B's script interpreter; etc.). Those are walker-extend
territory (stride-4 single pointer, not stride-8 INIT/STEP).

**So the answer is NOT "one config block per subsystem". It is:**
- subsystems on mechanism #1: direct config block (bosscoverage as-is). DONE.
- subsystems on mechanism #2: a DIFFERENT config shape (single-pointer stride-8,
  activation = "type byte appears in a live object-table slot at some rung", not
  a `$2598xx` API). walker-extend.
- subsystems on mechanism #3: a different ENUMERATOR (scan `jsr.l` sites in a PC
  range, not walk a table). The ported set comes from `TYPE5_PORTED`, already
  source-derived.
- pool-kind tables: walker-extend (stride-4 single pointer).
- HUD draw routines and the result screen: NOT table-scheduled at all -- they
  are subroutines of an already-dispatched object. The tool is closure-over-a-
  handler (follow `bsr`/`jsr` out of `$28444E`, `$28D9AA`, etc.), which
  `bosscoverage.routine`/`closure` already does; the CONFIG block does not.

---

## 1. SUBSYSTEM: YELLOW 500-PT MEDALS (ground truth A) -- the BEE, pool A

### 1.1 dispatch model

The medal IS the bee, already fully enumerated by recon 73, and I verified
every load-bearing claim against the image this session. It is NOT an item-pool
kind (item kinds score `$10`/`$1000`, never 500; `[M]` `medal`/`bee` appear
nowhere in `games/ddpdoj/src/`). It is **kind index 1 (and 16) of POOL A**, the
"impact" pool at `$8171BE`, driven by **type-5 call #4 `$27F95A`** (mechanism
#3), with its own internal 20-kind dispatch at `$27F99E` (stride-4 single
pointer).

### 1.2 closed entry-point inventory `[M]`

Pool A geometry closes exactly (recon 73 sec 1.1, re-verified):
```
$8171BE + 70*$2C == $817DC6        (general arena)
$817DC6 + 10*$2C == $817F7E        (RESERVED ten + the live count word)
$27F87C clear = $6E7 words = 80*$2C + 7 trailing words  EXACT
```
Seven trailing words, three bee-relevant: `$817F7E` live count, `$817F80` the
per-stage bee counter (cap 10), `$817F82` the per-game base-value cursor.

Driver `$27F95A` `[M]`: `move.w $817F7E,D7 / beq rts / lea $8171BE,A6 / ...
moveq #$7C,D0 / and.w D1,D0 / ... jsr (A0)` -- live-count-driven walk over all
80 slots as one array, then a stride-4 kind dispatch. The `$7C` mask is 5 bits
= 32 indices against **20 valid longwords** at `$27F99E`; index 20+ runs off the
end into code (`$27F9EE` disassembles as `moveq #$1,D0`).

The 20 kind entries `[M]` (kinds 1 and 16 are the bee, both `$27FACC`):
```
[ 0] $27FA30  [ 1] $27FACC BEE  [ 2] $27FE0E  [ 3] $27FED2
[ 4] $27FA30  [ 5] $27FF9A  [ 6] $280082  [ 7] $28016A
[ 8] $280252  [ 9] $28036A  [10] $280486  [11] $2805A2
[12] $2806BE  [13] $2807D6  [14] $2808F2  [15] $280A0E
[16] $27FACC BEE  [17] $27FF9A  [18] $280082  [19] $28016A
```

The three allocators `[M]` (absolute-long `jsr`/`jmp` site counts, lower bound
-- `bsr` and `jsr (An)` invisible):
- `$27F8EE` (general, 70-slot arena): **7 callers** (`$27665A`, `$276908`,
  `$2774C8`, `$2777E2`, `$27A380`, `$27EF90`, `$27F294`).
- `$27F8F8` (general, alt entry): **4 callers** (`$281D2E`, `$281E3A`,
  `$282016`, `$29EC6A`).
- `$27F92A` (the reserved-ten bee arena): **exactly ONE caller, `$2767E6`**
  (the type-`$8A` carrier death arm). Recon 53's "one caller" claim held.

### 1.3 the 500-pt award, transcribed from the listing `[M]`

The base ladder at `$27FD22` is **ten BCD longwords**: `$00000100 $00000200
$00000300 $00000400 $00000500 ... $00001000` (100, 200, ..., 1000). The award
is `base x live-hit-count` as a four-pass BCD digit-multiply through `$286128`
(the item adder), NOT the chain machine -- so collecting a bee does NOT tick
the chain. The cursor `$817F82` ratchets `+4` once per stage you collect all 10
(`$27FC0C`), gated on `count == 10 AND $81293C == 0`. The x2 is `add.l D0,D0`
on a BCD long -- the documented overflow bug, in the listing.

**"500-pt medal" = the bee whose base ladder entry is `$00000500` (index 4, the
fifth perfected stage) OR, on stage 1 with a fresh cursor, `base x hits` where
base = `$00000100` and hits can carry the award to 500 in BCD.** Either way the
award comes through `$286128` and is entirely unported.

The medal/bee count gate `[M]`: `$27FBFA cmpi.w #$A,$817F80` (bytes `0c79 000a
00817f80` at `$27FBFA`). The hyper-gauge gate `$27FBA2 tst.w $81B63E / bne`,
the chain-meter gate `$27FBAC tst.w D4 / beq`, and the `$200` clamp
(`$27FBBA cmpi.w #$200,D5`) all SKIP, recon 73 sec 1.3, not re-walked here.

### 1.4 ported set

**ZERO.** `[M]` derived from source: no file under `games/ddpdoj/src/` ports any
of `$27F95A`, `$27F8EE`, `$27F8F8`, `$27F92A`, `$27FACC`, the kind table, the
base ladder, or any collect arm. The carrier's death note `$2767E6 jsr $27F92A`
is a counted `ctx.unportedLog.note(...)` in `handlers.js deathSeq8A` that does
nothing. `type5.js` lists `$27f95a` at index 3 in `TYPE5.calls` and falls into
the `default` (counted-note) case. `[M]` `$817F7E` (pool A live count) is 0 on
every run this port has ever made (recon 73 sec 5, not re-measured but the code
path is unchanged).

### 1.5 gap, dead-code, verdict

- **Gap: the entire pool-A bee subsystem is live-unported** -- the driver and
  all 20 kind bodies (the other 18 kinds are unattributed; recon 73 sec 8 item
  8 left them unnamed). Plus the type-5 call itself (#4).
- **Dead code:** none found in pool A by this scan. `$27F92A`'s single caller is
  a real death arm. (The 18 non-bee kinds are unattributed, not provably dead --
  their activation comes from `$27F8F8`'s four callers taking D0 from
  registers I did not trace, recon 73 sec 8 item 3.)
- **bosscoverage verdict: WALKER-EXTEND.** Pool A's kind table is stride-4
  single pointers (not stride-8 INIT/STEP), activated through mechanism #3 (a
  type-5 `jsr.l`) plus pool writes, not through `$2598xx`. A config block for
  "stride-4 single-pointer kind table driven by type-5 call N" is the
  generalization; the activation graph must scan pool-status writes and the
  allocator call sites, not a scheduler API.

### 1.6 GROUND-TRUTH CONFIRMATION (medal)

The extended tool MUST flag, or it has a hole: **pool A (`$8171BE`, 80 slots +
live count `$817F7E`) is driven by type-5 call #4 `$27F95A`, which the port
lists but does not call; the bee (kind 1/16, body `$27FACC`) is therefore never
allocated, driven, drawn, collected or scored. The base ladder `$27FD22`
(`$100..$1000`) and the `base x hits` award through `$286128` never run. `$817F7E`
is 0 on every run. That is the medal gap.**

---

## 2. SUBSYSTEM: REAL HUD (ground truth B)

### 2.1 dispatch model

The HUD is **object type 0 in the top-level table** (`$240F62[0] = $28D520`,
priority `$0009`) -- mechanism #2, NOT the boss scheduler. The object's per-frame
handler `$28444E` (the "ledger") `bsr`s into ~28 draw subroutines. Those
subroutines are NOT table-scheduled; they are reachable only as callees of
`$28444E` (and a couple of banner arms).

### 2.2 what IS ported (state) and what is NOT (picture)

`src/hud.js` is neither a stub nor a full port -- it is the STATE machine
without the PICTURE, and that is the nuance the brief asked for. Ported
(derived from `defaultHandlers` in `main.js` and the bodies in `hud.js`):
- `$28D520` the object shell (states 0/1/2), `$2842B0` the pending->total BCD
  drain (both players), `$2843A8`/`$2843BE` the score digit machine,
  `$286FDA` the extend threshold advance, `$285F8A`/`$285F52` the two animation
  cursors, `$284CF2` the slide-in, `$28444E` the whole per-frame ledger, both
  hyper guards (`$285A12`/`$285B3C`), both banner arms (`$2847FE`/`$284B6C`),
  `$284A3E` the boss-HP-bar guard (refuses the null pointer by address), and
  **`$284636`/`$2847D4` the two chain-meter decrements** -- frame-exact, last
  within the frame, in the cartridge's own priority slot (W63).

### 2.2.1 the draw routines -- NOTED, not transcribed

`hud.js`'s `DRAWS` dict lists **28 draw addresses** that are `ctx.unportedLog`
notes, never transcribed. `[M]` all 28 exist as real code (none is a bare `rts`;
first bytes verified at `$240DC2`, `$285C5E`, `$285C62`, `$2859DC`, `$2878CC`,
`$286ED6`, etc.). They include the two HUD panels (`$285C5E`/`$285DD8`, 104
instr each), the two score rows (`$285C62`/`$285DDC`, 102 instr each), the
chain-meter bar (`$2859DC`), the chain-break popup (`$2855B6`), the lives rows
(`$2878CC`/`$28795C`), the bomb-stock rows (`$287ABE`/`$287AF0`), the hyper
labels, the credit row, and the high-score digit walk. All reach the
text/sprite printer `$240DC2` (a subsystem no wave has touched) and the sprite
emitters `$23FA96`/`$23FAC4` into bucket 25.

### 2.3 ported set / gap / verdict

- Ported entry points (the state machine): 1 object type (`$240F62[0]`) +
  its sub-callees above. The owner REMOVED the recorded HUD in W100, so the
  upper-left is now empty and honest.
- **Gap: every DRAW routine.** A player sees no score row, no chain meter, no
  chain number, no bomb icons, no lives. The state is correct (totals, chain,
  decrement all run); the picture is absent.
- **Dead code:** the stage-clear tally `$2853DC..$285568` is unreachable BY
  CONSTRUCTION in this port (hud.js header: its only gate producer is `$28DB52`
  inside the unported result screen `$28D9AA`). The boss-HP bar `$284A3E` is
  null-pointer-refused (its pointer writer `$2927BA` is in the unported boss
  init tail `BOSS_TAIL`). Both are noted, not bugs.
- **bosscoverage verdict: DIFFERENT TOOL (closure-over-handler).** The HUD is
  one entry in mechanism #2 (single-pointer stride-8) and its draws are
  subroutine callees of `$28444E`, not a table. The closure walker
  (`bosscoverage.routine`/`closure`) already follows `bsr`/`jsr` out of a root;
  the missing piece is a CONFIG that says "root = `$28444E`; enumerate every
  `bsr.l`/`jsr.l` callee; the ported set = callees whose bodies appear in
  `src/hud.js`". The activation-graph and stride-8 INIT/STEP machinery is
  irrelevant.

### 2.4 GROUND-TRUTH CONFIRMATION (HUD)

The extended tool MUST flag: **~28 draw routines called from `$28444E`
(enumerated in `hud.js` `DRAWS`) are unported; the HUD's score/chain/combo
numbers never appear on screen. The state is ported; the rendering is not. The
chain-meter decrement IS frame-exact (last within the frame, owner decision 3).**

---

## 3. SUBSYSTEM: ITEMS (powerups) -- mechanism #3, already well-covered

### 3.1 dispatch model

Items are pool family six, driven by **type-5 call #18 `$27E99E`** (mechanism
#3), with their own stride-4 single-pointer kind dispatch at `$27E9F8` (8
entries, mask `$3C`). Allocator `$27E812`. Recon 59 is the full enumeration;
`src/items.js` is the near-complete port.

### 3.2 ported set / gap / verdict

`[M]` derived from `TYPE5_PORTED`: `$27E99E` IS ported (call #18). `items.js`
ports the allocator, the driver, the fill, the four live bodies (kinds `$0`/`$4`
/`$8`/`$10`), the free, both collect tails, and both collected-animation
steppers. The two REFUSED kinds (`$0C`/`$14`, hyper stock) are deliberately not
allocated (items.js section THE REFUSAL -- rank safety, W61). Sound cues
(`$28Cxxx`) are deferred whole (W53).

- **Gap: small and deliberate.** `$27E88A` (loop allocator) has no caller and is
  correctly not transcribed. `$27E912`/`$27F6E4` (fill B) are inside the
  unported hyper-stock machine `$2875B4` (I3). The HUD draws the item icons
  would use (`$25349A` etc.) reach `$240DC2`, unported.
- **Dead code:** `$27E88A` (zero callers, both scan kinds) is the one dead
  entry -- transcribed as a named note, not code. This is the items-subsystem
  analogue of the boss's dead quartet, already found.
- **bosscoverage verdict: WALKER-EXTEND (stride-4 single-pointer kind table),
  but the value is low -- the port is nearly complete and recon 59 already
  enumerated it.** A config block here would mostly confirm what is known.

---

## 4. SWEEP: every OTHER stage-1 subsystem, with "how to enumerate statically"

### 4.1 mechanism #2 -- the 14 unported top-level object types `[M]`

The `$240F62` table is **20 entries (types 0-19)**; type 20+ is data (bytes at
`$240F62 + 20*8` = `$36390080...`, disassembles as `move.w $80??,D3`, i.e. code,
not a pointer). Ported set derived from `main.js defaultHandlers`:
**{0 HUD-ledger, 1 background, 2 P1, 3 P2, 5 type-5 bus, 6 stage-clear} = 6.**

The 14 unported types, each "enumerate statically by reading its init body and
closure-walking its `bsr` callees":

| type | handler `[M]` | pri | likely identity / how to cover |
|---|---|---|---|
| 4 | `$260B30` | `$09` | unattributed stage object. closure-walk. |
| 7 | `$290BE8` | `$1E` | high priority; possibly 2P-only or attract. closure-walk. |
| 8 | `$25A770` | `$0A` | unattributed. |
| 9 | `$25CACA` | `$0A` | unattributed. |
| **10** | **`$260794`** | **`$1F`** | **THE RANK OBJECT -- highest priority, runs FIRST every frame.** `[M]` first instr `tst.b ($2,A6)`. The rank ARITHMETIC is partly ported inside `score.js` (`bombRankFeed`, etc.) but the OBJECT is not in `defaultHandlers`. **This is a likely-coverage gap a static tool must flag: the per-frame rank recompute `$2608D2` may or may not run in the port's slot.** Closure-walk + check whether `score.js`'s rank work is a substitute. |
| 11 | `$25DBB4` | `$0A` | unattributed. |
| 12 | `$28F3AC` | `$09` | unattributed. |
| 13 | `$288A60` | `$0B` | unattributed. |
| 14 | `$288C6C` | `$14` | unattributed. |
| 15 | `$291F66` | `$1E` | unattributed. |
| 16 | `$256E7A` | `$1E` | unattributed. |
| 17 | `$25CEB8` | `$0A` | unattributed. |
| 18 | `$24902A` | `$0A` | unattributed (near P1 `$2491C0`; possibly P1-adjacent logic). |
| 19 | `$28EE88` | `$1E` | unattributed. |

**How bosscoverage generalizes for mechanism #2: WALKER-EXTEND.** A config
shape "single-pointer stride-8 table indexed by type byte, extent pinned by the
first entry whose low-longword is not a valid priority (`$000A..$001F`)" plus an
activation check "type byte present in any live object-table slot across the
checkpoint ladder's RAM dumps" (the ladder already records the 20-slot table at
`$80E240`). The boss tool's stride-8 INIT/STEP reader and `$2598xx` activation
scan are both wrong here.

### 4.2 mechanism #3 -- the 7 unported type-5 calls `[M]`

The 23-entry type-5 call list (`TYPE5.calls`, source-derived but read from the
ROM's `jsr.l` sequence at `$28B5E6..$28B66A`): **16 ported, 7 unported.** Each
unported call has exactly one abs caller -- the type-5 dispatch site itself --
so all 7 are LIVE-unported (called every frame), not dead:

| call # | addr `[M]` | identity / how to cover |
|---|---|---|
| 1 | `$289B80` | pool C sub-record cue-pool driver (effects.js sec 1). closure-walk. |
| **4** | **`$27F95A`** | **pool A impact/bee driver -- THE MEDAL (section 1).** |
| 6 | `$2890F2` | pool D sub-effect driver (effects.js THE REFUSAL -- deliberately not allocated, so the driver would operate on an always-empty pool). |
| 13 | `$2527CE` | unattributed; closure-walk. |
| 19 | `$252BD0` | unattributed; closure-walk. |
| 22 | `$25292A` | unattributed; closure-walk. |
| 23 | `$252A52` | unattributed; closure-walk. |

**How bosscoverage generalizes for mechanism #3: DIFFERENT ENUMERATOR.** There
is no table to walk -- the entries are the `jsr.l` targets in a PC range.
`bosscoverage`'s `walk_tables` is useless here. The enumerator is "scan
`\x4E\xB9` (jsr.l) sites in `$28B5E0..$28B680`; each target is an entry point".
The ported set is `TYPE5_PORTED` (already source-derived). The activation
graph is trivial (every call runs every frame type-5 runs). The prize here is
naming the four unattributed calls (`$2527CE`/`$252BD0`/`$25292A`/`$252A52`).

### 4.3 other candidates the brief named, with how to enumerate each

- **The hyper (four linked pieces, rank multiplier).** Dispatch: object type 0's
  `$28444E` `bsr`s the two hyper guards (`$285A12`/`$285B3C`, PORTED as
  guards-only); the activation/tail/flash bodies (`$285A24`, `$285A96`,
  `$285AF2`, `$2873B4`) are unreached because `$81B63E` is always 0. Enumerate
  statically: closure-walk from `$285A12`/`$285B3C`; the ported set = the two
  guards in `hud.js`. Verdict: closure-over-handler (same as HUD draws).
- **Enemy loaders / the 58-slot driver / 21 init bodies / 37 bullet behaviours.**
  Dispatch: mechanism #3 calls #2 (`$2634F4`) and #20 (`$281D9A`), already
  ported (W29). The enemy TYPE table is `$27E412 + 8*(t-$80)`, `[init, handler]`
  (recon 73 sec 2.1 correction). Enumerate statically: stride-8 `(init,
  handler)` walk of `$27E412` for types `$80..$8B`; the ported set derived from
  `spawn.js SPAWN.TYPE_HI` + `handlers.js` + `enemyframe.js`. **This IS a
  stride-8 pair table -- a config block could work, with a different
  activation model (records in the spawn script + the live enemy pool).**
  Verdict: walker-extend (stride-8 but single-dispatch, not scheduler; and the
  activation is "type appears in stage-1 spawn script" rather than a `$2598xx`
  API). Worth doing -- the enemy table is the second-biggest denominator after
  the boss.
- **The 800 missing palette words.** Not dispatch-scheduled at all -- a DATA
  export. `[M]` not re-measured; CATCHUP quotes "1,760 of 2,560 words cartridge-
  sourced". Enumerate statically: the palette RAM region (`$814000`-ish) and the
  cartridge's palette source tables; coverage = exported-words / RAM-words.
  bosscoverage does not apply; this is `tablecoverage.py` territory (a Gradius-
  style "every indexed table is exported" gate), already named in plan 100.
- **Stage 2's column stream / `$228658` / `$229DF8`.** `[M]` both are ROM DATA
  windows (`$228658` = `00520000 00530000`, a table of longs; `$229DF8` =
  `73326ed0...`, code/data). W104 says `$229DF8` is "a 2 KB ROM data window the
  exporter has not exported, reached at the stage-1 tail". Enumerate statically:
  data-export coverage (which ROM windows the exporter has decoded), not
  dispatch. Different tool (the exporter's own manifest).
- **The result screen `$28D9AA`.** `[M]` NOT a top-level object type (no entry
  in `$240F62` matches). It is a subroutine reached via the stage-clear object
  (type 6, `$28D63C`, which IS ported as `makeStageClear`). 819 instructions,
  declared unported by W62; it is the producer of `$8130F9` bit 3 that arms the
  stage-clear tally. Enumerate statically: closure-walk from `$28D9AA`; ported
  set = empty. Verdict: closure-over-handler.
- **The 4,017 records still without art.** Sprite-art coverage, not dispatch.
  `tablecoverage.py` territory (the sprite-stream manifest). bosscoverage does
  not apply.
- **The boss init tail `BOSS_TAIL` (`$292794..$2927F4`).** Already cited in
  `hud.js` as the unported tail of `$2926E2`; it runs three unported boss
  routines (`$294AD6`/`$294EEA`/`$294F0A`) and writes the boss-HP-bar pointer.
  Enumerate statically: closure-walk from `$292794`; this is really part of the
  boss subsystem and bosscoverage's closure over `$2926E2` should be extended to
  include it. Verdict: bosscoverage closure gap (the boss init body's closure
  stops at `$29272E` in `initbody.js`).

---

## 5. THE GENERALIZATION, SUMMARISED

`bosscoverage.py` is a CONFIG block (TABLES/OBJ_BASE/API/BOSS_LO/HI) on a
general M68K walker (`walk_tables`, `routine`, `closure`, `activation_graph`,
`ported_set`, `board_observed`). To cover the rest of stage 1 the walker needs
THREE new config shapes and the activation model broadened:

1. **stride-8 single-pointer type table** (mechanism #2, `$240F62`): add a
   `kind = "single"` table descriptor; activation = type byte in any live
   `$80E240` slot across the ladder. Covers 14 unported object types (notably
   RANK, type 10).
2. **jsr-site-list enumerator** (mechanism #3, type-5 calls): not a `walk_tables`
   at all; a new `walk_jsr_list(pc_start, pc_end)` that scans `jsr.l` targets.
   Covers the 7 unported type-5 calls (notably the bee driver, call #4).
3. **stride-4 single-pointer kind table** (pool A `$27F99E`, item pool
   `$27E9F8`): add a `stride = 4, kind = "single"` descriptor; activation =
   status-word writes / allocator calls. Covers the bee's 20 kinds and the
   item pool's 8 kinds.
4. **closure-over-handler** (HUD draws, result screen, hyper bodies): no table,
   no activation graph -- just `closure(rom, [root])` and diff its callees
   against source. `bosscoverage.routine`/`closure` already do this; only a
   CONFIG that names the root and derives the ported set from source is missing.

The header comment in `bosscoverage.py` ("Generalize by adding a config block;
the walker below it is general") is HALF right: the walker is general for
mechanism #1 and item 4, but items 1-3 above need the walker extended (new
`walk_tables` kinds and a new `walk_jsr_list`), exactly as the header's own
caveat warns ("non-stride-8 tables need the walker extended, flag the hole
honestly, never fake"). The activation-graph scan (`_scan_api_sites` for
`$2598xx`) is mechanism-1-specific and must NOT be reused for #2/#3.

---

## RULED OUT

- **"medal" as a literal name in the port.** `[M]` `grep -rni medal
  games/ddpdoj/src/` returns nothing. The medal is the bee (pool A kind 1/16),
  confirmed.
- **The item pool (family six) as the medal source.** `[M]` item kinds score
  `$10` (collect) or `$1000` (at-max) through `$286128`; no kind awards 500.
  The medal is pool A.
- **`$27F92A` having multiple callers (a possible source of uncontrolled bee
  spawns).** `[M]` exactly one abs caller, `$2767E6`. Reserved-ten arena is
  bee-only.
- **The result screen being a top-level object type.** `[M]` `$28D9AA` is not in
  `$240F62`; it is a callee of the stage-clear object (type 6).

## COULD NOT REACH (measured reasons)

- **The 18 non-bee pool-A kinds (call sites, dead-or-live).** Their activation
  comes from `$27F8F8`'s four callers (`$281D2E`, `$281E3A`, `$282016`,
  `$29EC6A`) taking D0 from registers I did not trace this session. Recon 73
  sec 8 item 8 left the same 18 unnamed. A `bsr`/`jsr (An)` scan plus a D0
  dataflow trace at each of the four sites would resolve it; that is the
  walker-extension job described in section 5.3.
- **Which object types 4/7/8/9/11-19 actually are.** I read their handler
  addresses and priorities but did not closure-walk the 14 bodies. Each is one
  `closure(rom, [handler])` call away; that is the mechanism-#2 coverage job.
- **The four unattributed type-5 calls (`$2527CE`/`$252BD0`/`$25292A`/
  `$252A52`).** I confirmed each has exactly one abs caller (the type-5 site)
  but did not disassemble their bodies. Each is a closure-walk away.
- **Whether the RANK object (type 10, `$260794`) is covered by `score.js`'s
  in-line rank arithmetic or not.** This is the single highest-value open
  question from the sweep: if the port's rank recompute is NOT a substitute for
  the rank object's per-frame `$2608D2`, scoring routes silently diverge. Not
  resolved here; flagged for the next coverage block.
- **Dynamic confirmation.** No MAME, no `seedcmp`, no gate run this wave. Every
  "is 0 on every run" claim is read out of source (the code path is unchanged
  since recon 73), not re-measured.

---

## LOG

- opened IN PROGRESS, then read CATCHUP (sec 7a/8), `bosscoverage.py` (full),
  W99/W100/W101-104, `hud.js`, `score.js`, `items.js`, `objdriver.js`,
  `type5.js`, `effects.js` (head), recon 73 (full), bee owner doc 89.
- `[M]` verified the three-mechanism split out of the image: `$240F62` (20
  single-pointer entries), the type-5 `jsr.l` list (23 entries), and confirmed
  bosscoverage's `walk_tables` would misread `$240F62` as `(handler, priority)`
  -> bogus STEP.
- `[M]` verified recon 73's bee enumeration: pool geometry closes exactly, the
  20-kind table at `$27F99E` (kinds 1/16 = `$27FACC`), the base ladder `$27FD22`
  (`$100..$1000`, fifth entry is BCD 500 = the "500-pt medal"), the count gate
  `$27FBFA cmpi.w #$A,$817F80`, and `$27F92A`'s single caller `$2767E6`.
- `[M]` enumerated mechanism #2: 20 object types, 6 ported (from
  `main.js defaultHandlers`), 14 unported (notably type 10 = RANK `$260794`).
- `[M]` enumerated mechanism #3: 23 type-5 calls, 16 ported (from `TYPE5_PORTED`),
  7 unported (notably call #4 `$27F95A` = the bee/pool A driver).
- `[M]` confirmed all 28 HUD draw routines in `hud.js DRAWS` exist as real code;
  none is ported.
- `[M]` confirmed the result screen `$28D9AA` is NOT in `$240F62`; it is a
  subroutine of the stage-clear object.

status: **DONE**
