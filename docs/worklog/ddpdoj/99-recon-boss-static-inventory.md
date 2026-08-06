# 99 -- RECON: the stage-1 boss, enumerated from the ROM, complete

status: **DONE.** (opened IN PROGRESS 2026-08-06, closed same day)

started: 2026-08-06. wave: 99. role: RECON (READ-ONLY; the only tree file I
write is this one; scratch lives in `.scratch/w99/`, gitignored).
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B.
instrument: `games/ddpdoj/tools/oracle/out/maincpu.bin` (address == file
offset), capstone `CS_MODE_M68K_030`. Scripts: `.scratch/w99/inventory.py`,
`remaining.py`, `globalapi.py`, `refs.py`, `w99dis.py`.

`[M]` = measured by me, this session, from the image or this tree. The ported
column is DERIVED from the port's own `registerScript` calls (W95's mechanism),
snapshotted while W98 (boss art, scripts untouched) is in progress.

---

## 0. THE HEADLINE

`[M]` **The boss has 111 scheduler entry points and the ROM says so in five
closed tables. 59 are ported. 44 remain and are live. THE OTHER 8 ARE DEAD
CODE: script ids E 2, E 7, E 9 and E 10 have NO START SITE ANYWHERE IN THE
IMAGE, and E 9/E 10 are the two kind-9 guns.** Recon 48's promise that porting
this boss executes bullet kind 9 is therefore false: **kind 9 can never fire in
build B.** The cartridge still queries all four dead scripts (F 2 and F 3 wait
for them to "finish") and still computes 9-or-10 into D0 at `$2954FA` before a
`moveq #5` throws it away -- the wiring survived whatever cut removed the
starts.

`[M]` **Remaining live work, measured: 44 entry points, 44 boss-local routines,
937 instructions / 4,126 bytes, plus two scheduler accessors (~25 insns) and
the type-`$1E` spawn closure (3 routines / 200 insns).** Every one of the 44 is
started by F 2 or F 3 or by a script F 2/F 3 starts -- the remaining job is
exactly one wave-shaped unit, and its denominator is now from the ROM, not from
what threw last.

**The brief's premise held where it matters and needed two corrections** (§1).

---

## 1. THE PREMISE, CHECKED

1. **The six-family list is COMPLETE and closed.** `[M]` The installer
   `$259554` takes exactly five table pointers (A0 MAIN, A1 E, A2 OBJECT, A3 D,
   A4 F) and nothing else; each of the five stage-1 table base addresses occurs
   **exactly once** in the whole 6 MB image, at the five `lea`s of the boss
   init (`$292710..$29272A`); `$259554` has exactly five callers (five bosses).
   There is no sixth table.
2. **Correction A: the OBJECT list is NOT walked by `$2596C6`.** `[M]`
   `$2596C6` walks four lists -- F (5 slots), MAIN (1), E (10, with the bit-1
   skip at `$2597AA`), D (10) -- and returns at `$25980A`. The OBJECT slots (20)
   are walked by `$25962E`'s tail at `$259682..$2596BA`, which ALSO runs when
   the pause word `$8130D2` skips the script passes. The brief's "walked by
   $2596C6" is wrong for OBJECT; the walk-order censorship argument is
   unaffected (F is still first).
3. **Correction B: the boss is not strictly one object.** It is the type-`$0E`
   object (handler `$292902`, init `$2926E2`, 7 sub-records), but E 8's STEP
   spawns a **second enemy object**, type `$1E` (`$296DD6`), with its own
   closure (§6).
4. **No bypass around the scheduler API.** `[M]` The slot RAM
   (`$812980..$812E07`) is written only by `$2595xx` and by a **byte-identical
   twin copy of the scheduler at `$158AEA`** in the low bank. Build B's code
   makes exactly one absolute call below `$200000` (`$257470 jmp $13B7C0`, a
   stack-reset thunk), which does not reach the twin. Register-computed writes
   remain invisible to this check, as always.
5. **`$2595F2` returns 4** -- re-verified against the image this session:
   `$25962A` = `70 04` and nothing branches over it.

---

## 2. THE TABLE -- every entry point, its routine, its size, its state

Method for the size columns: per-routine closure over intra-routine branches
(`.scratch/w99/inventory.py`); where an INIT falls through into its STEP the
INIT figure INCLUDES the STEP body, so per-id cost is roughly max(INIT, STEP),
and all totals in this file are unions of unique instruction addresses, never
sums of rows. `jsr (An)` is invisible: every figure is a lower bound.

"rung" = the id is live in a slot at one of the 72 `stage1-sweep` seeded
instants. **That column is SAMPLED presence, not reachability** -- MAIN 0, the
whole arrival, is "never" because it runs between rungs.

started-by resolves every start site in the image (`jsr` AND `jmp` -- see §4).

### 2.1 MAIN -- `$293104`, 9 ids, 1 slot

| id | INIT | insn | STEP | insn | state | rung | started by |
|---:|---|---:|---|---:|---|---|---|
| 0 | `$293204` | 128 | `$29321C` | 124 | PORTED | never | F 0 |
| 1 | `$2933C2` | 7 | same | | PORTED | rung | boss death `$294E2C` |
| 2 | `$293420` | 72 | `$293432` | 68 | PORTED | rung | MAIN 0 `$2932F0`, MAIN 5 `$2935CE` |
| 3 | `$2934A2` | 68 | `$2934AC` | 66 | **unported** | never | F 3 INIT `$29542C` |
| 4 | `$2934F8` | 71 | `$293506` | 68 | **unported** | rung | MAIN 3 `$2934E4`, MAIN 8 `$2936F6` |
| 5 | `$293578` | 70 | `$29359E` | 62 | PORTED | rung | F 1 `$295004`, F 2 `$2953BE`, F 3 `$29550A` |
| 6 | `$2935DE` | 68 | `$2935E8` | 66 | PORTED | rung | F 6 `$2956F0` |
| 7 | `$293634` | 72 | `$293642` | 69 | PORTED | rung | MAIN 6 `$293620` |
| 8 | `$2936B4` | 68 | `$2936BE` | 66 | **unported** | rung | F 2 `$2952FE` |

### 2.2 F -- `$294F68`, 7 ids, 5 slots (walked FIRST)

| id | INIT | insn | STEP | insn | state | rung | started by |
|---:|---|---:|---|---:|---|---|---|
| 0 | `$294FA0` | 10 | `$294FA6` | 9 | PORTED | rung | boss init `$29273E` |
| 1 | `$295002` | 165 | `$295120` | 101 | PORTED | rung | MAIN 0 `$2932F8`, F 2 `$295402` |
| 2 | `$2952D8` | 71 | `$295304` | 61 | **unported** | rung | F 6 `$29584C` |
| 3 | `$29540C` | 74 | `$295432` | 65 | **unported** | rung | F 1 `$2952C8` |
| 4 | `$29554A` | 44 | `$29556C` | 38 | PORTED | rung | damage pass `$294DAA`/`$294DC6` (one part destroyed) |
| 5 | `$295616` | 17 | `$295626` | 14 | PORTED | rung | damage pass `$294D8E` (both parts destroyed) |
| 6 | `$295684` | 109 | `$2956F6` | 83 | PORTED | rung | F 3 `$295540` |

### 2.3 E -- `$295856`, 15 ids, 10 slots (the guns)

| id | INIT | insn | STEP | insn | state | rung | started by |
|---:|---|---:|---|---:|---|---|---|
| 0 | `$2958F2` | 18 | `$295948` | 36 | PORTED | rung | F 5 `$29565C` |
| 1 | `$295A7E` | 21 | `$295AE0` | 102 | PORTED | rung | F 1 `$29514C` |
| 2 | `$295CAC` | 8 | `$295CD8` | 64 | **DEAD** | never | **NOTHING** (queried by F 2 `$2953D6`) |
| 3 | `$295E0E` | 75 | `$295E5E` | 59 | PORTED | never | F 1 `$29523C` |
| 4 | `$295F44` | 132 | `$295F94` | 59 | PORTED | rung | F 1 `$2951D8`/`$295254` |
| 5 | `$296082` | 55 | `$2960F4` | 34 | **unported** | rung | D 14 `$294620` |
| 6 | `$296188` | 56 | `$296200` | 34 | **unported** | rung | D 14 `$294638` |
| 7 | `$296294` | 7 | `$2962BA` | 36 | **DEAD** | never | **NOTHING** (queried by F 3 `$29551C`) |
| 8 | `$296362` | 67 | `$2963A2` | 54 | **unported** | never | F 3 `$2954B8` -- spawns type `$1E` |
| 9 | `$2964BE` | 32 | `$2964DA` | 24 | **DEAD** | never | **NOTHING** (queried `$295528`; kind 9) |
| 10 | `$29655E` | 33 | `$296580` | 24 | **DEAD** | never | **NOTHING** (queried `$295534`; kind 9) |
| 11 | `$2965F8` | 32 | `$296614` | 26 | PORTED | rung | F 4 `$2955C2` |
| 12 | `$29669C` | 40 | `$2966B8` | 34 | **unported** | never | F 4 `$29560A` |
| 13 | `$296752` | 14 | `$296790` | 99 | PORTED | never | F 6 `$2957D2` (kind 11) |
| 14 | `$2968E6` | 72 | `$2968FE` | 68 | **unported** | rung | D 14 `$294650` |

### 2.4 D -- `$29370A`, 21 ids, 10 slots (the limbs)

| id | INIT | insn | STEP | insn | state | rung | started by |
|---:|---|---:|---|---:|---|---|---|
| 0 | `$2937B6` | 5 | `$2937CC` | 17 | PORTED | rung | MAIN 0 `$29330C` |
| 1 | `$293800` | 5 | `$293816` | 17 | PORTED | rung | MAIN 0 `$293314` |
| 2 | `$29384A` | 2 | `$293852` | 12 | PORTED | rung | MAIN 0 `$29331C`, D 12 `$2947DE`, D 18 `$294A26` |
| 3 | `$29387C` | 2 | `$293884` | 12 | PORTED | rung | MAIN 0 `$293324`, D 13 `$294868`, D 19 `$294AB0` |
| 4 | `$29393A` | 8 | `$293966` | 40 | PORTED | never | part-1 death `$294E8A` (**jmp**) |
| 5 | `$293B82` | 8 | `$293BAE` | 80 | PORTED | never | part-2 death `$294EE0` (**jmp**) |
| 6 | `$293DC6` | 11 | `$293E04` | 176 | PORTED | rung | boss death `$294E36` (**jmp**) |
| 7 | `$2943B0` | 14 | same | | PORTED | rung | MAIN 0 `$29332C`, F 6 `$295844` |
| 8 | `$2943EE` | 3 | `$2943FC` | 26 | **unported** | never | F 2 `$29532E` |
| 9 | `$294466` | 3 | `$294474` | 26 | **unported** | never | F 2 `$295336` |
| 10 | `$2944DE` | 2 | `$2944E6` | 12 | **unported** | rung | D 8 `$29445C`, D 16 `$294924` |
| 11 | `$294512` | 2 | `$29451A` | 12 | **unported** | rung | D 9 `$2944D4`, D 17 `$29499C` |
| 12 | `$29475E` | 4 | `$294772` | 29 | **unported** | never | F 2 `$2953A8` |
| 13 | `$2947E8` | 4 | `$2947FC` | 29 | **unported** | never | F 2 `$2953B0` |
| 14 | `$294566` | 54 | `$294658` | 61 | **unported** | rung | F 2 `$295384` |
| 15 | `$294872` | 18 | `$294878` | 17 | **unported** | rung | F 2 `$2953FA`, F 6 `$295834` |
| 16 | `$2948B6` | 3 | `$2948C4` | 26 | **unported** | rung | F 3 `$29545C` |
| 17 | `$29492E` | 3 | `$29493C` | 26 | **unported** | rung | F 3 `$295464` |
| 18 | `$2949A6` | 4 | `$2949BA` | 29 | **unported** | never | F 3 `$2954CC` |
| 19 | `$294A30` | 4 | `$294A44` | 29 | **unported** | never | F 3 `$2954D4` |
| 20 | `$294ABA` | 6 | `$294AC0` | 5 | PORTED | rung | F 6 `$295718` |

### 2.5 OBJECT -- `$292932`, 7 routines, `$FFFFFFFF`-terminated, 20 slots

| idx | routine | insn | B | state | armed by | disarmed by |
|---:|---|---:|---:|---|---|---|
| 0 | `$292972` | 33 | 114 | PORTED | MAIN 0 `$293334` | D 4 `$293ABA` |
| 1 | `$292B08` | 31 | 110 | PORTED | MAIN 0 `$29333C` | D 5 `$293CFE` |
| 2 | `$292952` | 6 | 30 | PORTED | MAIN 0 `$293344` | D 6 `$293F20` |
| 3 | `$292BFA` | 13 | 46 | PORTED | MAIN 0 `$29334C` | D 6 `$294108` |
| 4 | `$292E0A` | 9 | 38 | PORTED | MAIN 0 `$293354` | D 6 `$293F28` |
| 5 | `$292E3E` | 36 | 138 | PORTED | MAIN 0 `$29335C` | D 6 `$293F30` |
| 6 | `$292F4A` | 13 | 56 | PORTED | boss init `$292736` | MAIN 0 `$293364` |

### 2.6 The driver entries outside the tables (all ported)

`$2926E2` (type-`$0E` init), `$292902` (per-frame handler, 10 insns),
`$294AD8` (damage pass, whose intra-routine span includes `$294D70` the phase
driver, `$294DD4` the death chain, `$294E3E`/`$294E94` the part deaths,
`$294F32` the timeout kill), `$294AD6` (bare `rts`). Inside those ported bodies
two counted notes remain: **`$243DD0`** (hit-stop/screen-shake, 170 insns
[CITED W62]; drives `$8130CA`, W96 §5.2's 8 records) and **`$2440E0`** (death
explosion, `[M]` 555 insns / 2,542 B; `src/effects.js` sizes the port at ~30
lines now that pool B landed).

---

## 3. THE TOTALS, replacing the stale ones

`[M]` Whole-boss closure from all 111 entries + the driver (unique-instruction
union, lower bound): **219 routines, 5,943 insns, 24,644 B** -- boss-local
124 routines / 3,023 insns / 13,108 B, shared 95 / 2,920 / 11,536. (Recon 48's
257/7,816/31,768 summed per-routine and so double-counted INIT/STEP overlap;
not comparable row for row.)

| population | entry points | routines | insns | bytes |
|---|---:|---:|---:|---:|
| PORTED (registry-derived) | **59** | -- | -- | -- |
| **REMAINING, LIVE** | **44** | 44 | **937** | 4,126 |
| . of which MAIN 3/4/8 | 6 | 6 | 111 | 452 |
| . of which F 2/3 | 4 | 4 | 145 | 626 |
| . of which E 5/6/8/12/14 | 10 | 10 | 290 | 1,336 |
| . of which D 8..19 | 24 | 24 | 391 | 1,712 |
| DEAD (E 2/7/9/10) | 8 | 8 | 179 | 734 |
| **total** | **111** | | | |

Plus, outside the tables: two scheduler accessors the remaining scripts call
and the port lacks -- **`$2599B4`** (D.running, needed by F 2 and F 3; named in
a `bossarrival.js` comment only) and **`$259B08`** (E.stop, 13 insns, needed by
D 14) -- and the **type-`$1E` spawn** closure from `$296DD6` reached by E 8:
`[M]` 8 routines / 283 insns / 1,004 B, of which **3 routines / 200 insns**
(`$296DD6`, `$23F7C6`, `$2813F0`) are new against everything already ported.
Its generator sites are kinds 3/4/5, all live.

> **So the honest full remainder is ~1,160 measured instructions (44 script
> routines + 2 accessors + the spawn), plus the two counted notes (`$2440E0`
> 555, `$243DD0` 170 [CITED]).** The old figures -- "2,173 instructions / 80
> routines" (W82, a rung-need estimate) and "39 unported" -- are superseded.
> 111 entry points stands, but only 103 of them are live.

The transitive check agrees the job is closed: `[M]` the closure of the 44
minus the closure of everything ported adds exactly **three** shared routines
(`$2599B4`, `$259B08`, `$263684` -- the last already cited in `src/`). Nothing
else new is reachable.

---

## 4. WHY EARLIER GRAPHS MISSED STARTS: THREE OF THEM ARE `jmp`, NOT `jsr`

`[M]` D 4, D 5 and D 6 are started by TAIL CALLS: `$294E8A`, `$294EE0`,
`$294E36` are `moveq #4/#5/#6, d0 / jmp $259962.l` at the ends of the three
death routines. A scan for `jsr` sites (recon 48's `xref.py` rule, and my own
first pass) reports them as never started. Every count in this file comes from
scanning **both** opcodes over the full image (`.scratch/w99/globalapi.py`).
With that fix the activation graph is total: `[M]` **210 API call sites in the
closure, 0 with an unresolved D0** (the only register-fed start sites in the
image, `$29926E` and `$2A0A20`, belong to later bosses).

---

## 5. THE DEAD QUARTET -- what static analysis finds that execution never can

`[M]` E 2, E 7, E 9, E 10 have **no start site in the entire image**: no
`jsr`/`jmp` to `$259A18` anywhere loads their id (full-image scan, plus the
slot-RAM write check of §1.4). They are unreachable in build B, full stop. Yet
the shipped code still references all four:

* **F 3 STEP state 4 (`$295510`) waits for E 7, E 9 and E 10 to stop running**
  (`moveq #7/#9/#$a / jsr $259A4A / bcs`) before starting F 6 -- a wait that
  always passes instantly, because nothing ever starts them.
* **F 2 STEP does the same for E 2 at `$2953D6`.**
* **`$2954EC..$2954FA` computes 9-or-10** (`moveq #9,d7 / jsr $242FDE / bne /
  moveq #$a,d7 / move.w d7,d0`) **and then `$295508 moveq #5` overwrites D0**
  and starts MAIN 5. The discarded value is an E-script id, and E 9/E 10 are
  the kind-9 guns (recon 48 §5: all 8 kind-9 generator sites are in their
  bodies). The original code almost certainly started one of the two at random;
  the shipped game starts MAIN 5 instead and the fall-through idiom (the
  `$2595F2` trap, instance five) is the surviving scar.

Consequences, stated plainly:

1. **Bullet kind 9 is dead content in build B.** `src/mover.js:848`'s
   transcription will never execute via this boss. Recon 48's "the boss reaches
   kinds 9 and 11" is half wrong; the site list was right, the reachability
   claim was not. The boss's live kind set is `{3,4,7,11,12,19}` from the
   tables plus `{3,4,5}` from the type-`$1E` spawn.
2. **Dynamic discovery could NEVER have found this.** No scenario, no rank, no
   player count, no loop reaches a script with no start site -- the ladder
   would simply never throw on them, and a throw-driven port would carry four
   phantom scripts in its TODO forever. This is the enumerate-then-validate
   argument (`docs/knowledge/09`) in its sharpest form: only the listing proves
   absence.
3. **A port must still model the QUERIES.** F 2/F 3 call `$259A4A` on the dead
   ids; the correct behaviour is "not running", which an empty slot table gives
   for free -- but a port that threw on "unknown script id" at QUERY time would
   be wrong. Worth one test.

## 5.1 What is reachable but off the ladder's route (branch level, not entry level)

At ENTRY-POINT granularity there is nothing live that the ladder's single route
cannot eventually reach: all 44 remaining entries hang off F 2/F 3, which F 1
and F 6 start unconditionally. The route-blind material is one level down:

* **MAIN 3 is skipped if both side parts are already destroyed when F 3 arms**
  (`$29540C..$295418`: `$3F(a6)+$7F(a6) == 2` branches to `$29553E`, which
  starts F 6 directly). A fast-killing player gets a different phase graph;
  both arms use already-enumerated entries.
* **Two-player state:** E 4 INIT's both-players-dead arm branches into E 3's
  STEP (`$295F82`, the cartridge's copy-paste bug, W95 §2.8); the `bchg` target
  alternation on `$3(a5)` only matters with P2 alive. No 2P-only entry points
  exist.
* **Rank:** none. `$2595F2` always returns 4, so the boss is rank-invariant by
  construction; the other seven columns of the six parameter tables W95
  enumerated are dead DATA.
* **The timeout kill** (`$294F32`, boss self-destructs when `$22(a5)` expires)
  is ported but no board trace in this repo has ever exercised it -- the
  ladder's runs kill the boss. Port-vs-listing only.

---

## 6. WHAT STATIC ANALYSIS CANNOT SETTLE HERE

* **`jsr (An)` is invisible.** Every closure and every size is a lower bound.
  The known indirect families (`$23E78C`'s 64 size routines, the generator
  entries) are modelled; an unknown one would not be.
* **Register-computed RAM writes.** The no-bypass claim (§1.4) is proved for
  absolute-long operands only.
* **Whether the wait-on-dead-scripts loops ever mattered on real hardware** is
  history, not analysis; only the shipped bytes are in evidence.
* **Dynamic counts** -- how many E-slot copies coexist, real phase durations,
  what the double-pass arm at `$25967E` does in practice -- stay the oracle's.
* **The stage-end release after the boss dies** -- recon 48 §4.2's open item --
  is untouched by this wave and still open.

---

## 7. WHAT THE LADDER'S SAMPLING ACTUALLY SAW, against this denominator

`[M]` Of 111 entries, only 75 ever appear live in a slot at one of the 72
seeded instants; 36 (18 ids) never do, and of those 36, **28 are provably
live** (the whole arrival's MAIN 0 among them -- it runs between rungs, as do
E 3 and E 13, which W95 PORTED and oracled without any rung ever holding them)
and 8 are the dead quartet. The walk-order census's famous "41-entry union" was never a
denominator; this table is. Completeness ledger, knowledge-09 format:

```
stage-1 boss scheduler:  111 entry points   ported 59   live-unported 44   dead 8
  remaining measured:    44 routines / 937 insns + 2 accessors + $1E spawn (200)
  noted inside ported:   $2440E0 (555), $243DD0 (170 CITED)
```

status: DONE
