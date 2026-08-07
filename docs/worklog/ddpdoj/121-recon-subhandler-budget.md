# 121 -- RECON: do any per-type sub-handler loops truncate under load (mechanism C)

status: **DONE.** (opened IN PROGRESS 2026-08-07 before the MAME runs, closed
same day once the evidence was on disk.)

started: 2026-08-07. wave: 121. role: RECON (READ-ONLY; the only tree files I
wrote are this worklog; throwaway scripts and probe outputs live in
`.scratch/w121/` and `games/ddpdoj/.scratch/w121/`, both gitignored, NOT
committed). target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER), ROM
`C:\oldpcsx2\ddpdojblk.7z`. Every address is build B. Instrument: MAME 0.288
driven by `games/ddpdoj/tools/oracle/pgm.py`, Lua taps inside MAME, and static
disassembly of `games/ddpdoj/tools/oracle/out/maincpu.bin` (capstone
`CS_MODE_M68K_030`).

`[M]` = measured by me, this session, from MAME or the image.

This is the W119 Phase-0b correctness guard, open since W2 (item 3 of "what I
could not do"). It is the #2 strategic correctness item. The question: W2
proved the TOP-LEVEL object driver (`$2410BC`, `moveq #$13,D0 / dbra`, 20
slots) does NOT truncate under forced load (`object_slots_processed ==
object_slots_live` on all 696 overrun frames). But the per-type handlers' OWN
sub-table loops were never examined. If any truncates, the port is "a different
game that runs slowly" and the object driver cannot be retrofitted without a
rewrite.

---

## 0. PREMISE CHECK (the most important section) -- the brief is a category error

The brief's framing -- "the 20 per-type handlers ... each walks its own sub-
table in RAM (the ranges `$813660`, `$8145A0`, `$810570`, `$81C8FC`,
`$80B058`)" -- is imprecise in three load-bearing ways. None changes the
substantive question, but each would mislead a future wave.

1. **`$80B058` is NOT a per-type handler sub-table at all.** `[M]` confirmed
   via W112/W114/W116 (and re-read this session): `$80B058` is the ISR's
   deferred-(address,value)-write buffer, walked by the gated ISR6 routine
   `$240F26` (build B) / `$141258` (build A), flushed to the text tilemap at
   `$904000`. It is reached from the INTERRUPT, never from the 20 object
   handlers. Listing it among the per-type sub-tables is the same category
   error W105's section 0 caught for the HUD. It is excluded below.

2. **None of the 20 handlers walks the four remaining ranges directly.** `[M]`
   static scan: there are ZERO absolute-long references anywhere in build B to
   `$813660`, `$8145A0`, `$810570`, or `$81C8FC`; and a closure-walk of all 20
   handlers (`.scratch/w121/static_loops.py`) finds NO handler loop that
   references any of them. The four ranges are written by deeply-nested
   CALLEES, reached through handler[type 5] = `$28B5E0` (the type-5 "subsystem
   bus") and the enemy/bullet/effect drivers it dispatches. So "the handlers'
   own sub-table loops" really means "the sub-table loops reachable from the
   handlers' callees".

3. **The four ranges are not walked by a `lea $BASE, An` loop.** They are
   reached through POINTER tables. `[M]` the cleanest example: `$8145A0` is the
   target of pointers held in the entity table at `$81332C`. The outer walk is
   `lea $81332c.l,a5 / move.w #$39,d6 / tst.w (a5); beq skip / movea.l
   $6(a5),a6 / ... sub.w d0,$4(a6) / lea $50(a5),a5 / dbra d6` (`$263514` -
   `$26356C`). The write at `$26352E` lands in `$8145A0..$8148A0` because
   `$6(a5)` is a pointer. So the "sub-table" is the pointer table at
   `$81332C`; `$8145A0` is the structure its slots point into.

The substantive question (do any sub-table loops reached from the 20 handlers
truncate under load) is still well-posed and is answered below. The five-range
hand-list is superseded: stage A found EIGHT stride-based per-slot sub-tables
in the enemy/bullet/effect RAM region, and all eight are tested.

---

## 1. METHOD -- the airtight test is baseline-vs-overrun, frame by frame

W2's top-level proof compared `object_slots_processed` to `object_slots_live`
ON THE SAME FRAME. The direct analog for a sub-table would need each table's
own live-count word, which is not known for these pools and is awkward to
derive for pointer-mediated tables. So I used the stronger, cleaner test:

**Run the deterministic `stage1-open` scenario twice -- once baseline, once
with the W2 NOP-sled inject (`60000` nops = `240,012` added cycles/frame armed
at lf1900). On every frame, count the writes to each sub-table range. The
scenario input is identical and deterministic; the ONLY difference between the
runs is the injected load. W2 proved `object_slots_live` stays EQUAL between
the two runs (it diverges no earlier than lf2512). So on every dilated frame
with equal `objlive`, the live population of every enemy/bullet/effect table is
identical, and the per-frame write count MUST be identical too -- UNLESS a loop
truncated for budget. A lower count in the overrun run on one of those frames
IS mechanism (C).**

This is airtight because it never depends on a live-count heuristic: it is a
differential measurement on the same game state. The inject machinery is
copied verbatim from `frame.lua` (the proven sled; W2's control established
that a zero-nop sled moves only `{cyc, work, spin, d_top}`). The probe
(`.scratch/w121/subtap.lua`) keys per-frame bucketing on the `$803940` 0->nonzero
vblank semaphore, exactly like `frame.lua`/`objhunt.lua`, and keeps tap handles
in GLOBALS.

---

## 2. THE EIGHT SUB-TABLES (Stage A discovery, `[M]`)

`.scratch/w121/discover.py` drove `objhunt.lua` over `$810000-$81DFFF` under the
gate scenario. CURPC-attributed write map found eight steady-stride per-slot
sub-tables written during stage-1 gameplay (the four W2 named ones plus four
more W2's "at least" did not name):

| range | stride | slots | primary walker PCs `[M]` | what it is |
|---|---|---|---|---|
| `$813660` | $50 | 24 | `$268900` `$268A1A` `$268A62` (per-slot, stride 80) | enemy/entity field table (per-slot writes inside the entity driver) |
| `$8145A0` | $20 | 25 | `$26352E` `$2638F2` `$26898A` | entity movement table (target of `$81332C` pointers) |
| `$810570` | $30 | 25 | `$253AA6` `$253B9A` `$253BC6` | element/bullet-position table |
| `$81C8FC` | $40 | ~10 | `$289630` (inner dbra D2) `$28962A` | pool B/E sub-effect table |
| `$81CDF0` | $30 | ~12 | `$289BEA` `$289BCC` | pool C sub-record table (type-5 call #1 `$289B80`) |
| `$81D390` | $22 | ~18 | `$28A16A` `$28A150` `$28A132` | a stride-$22 (2x17) sub-table in the `$28A1xx` driver |
| `$81B730` | $38 | ~14 | `$288E48` `$288FB4` | a stride-$38 sub-table in the `$288Exx` driver |
| `$81332C` | $50 | 25 | (the OUTER pointer table; see premise check 3) | entity pointer table whose slots point into `$8145A0` |

`$80B058` is excluded (premise check 1: ISR defer buffer, not a handler table).

---

## 3. THE EVIDENCE -- no truncation, frame for frame `[M]`

Instrument: `.scratch/w121/subtap.lua` + `.scratch/w121/extra.lua`, run via
`pgm.run()`. Two run pairs (the four W2 ranges; then all eight). Raw outputs in
`.scratch/w121/{base,over_60000,extra_base,extra_over}.out`.

**The inject fired and the run dilated, exactly as W2 measured:**
```
INJECT sled at $340000 nops=60000 jmp_at=$35D4C0 site=$23BFE8 orig=$2410BC added_cyc=240012
INJECT armed at lf=1900 vf=1936
DONE logicframes=2600 videoframes=2636 fails=0   <- baseline (1.014 vf/lf)
DONE logicframes=2600 videoframes=3252 fails=0   <- overrun  (1.251 vf/lf)
```
616 extra video frames over 2600 logic frames = **616 dilated logic frames**
(W2 measured 614 at the same inject). The object driver ran under heavy time
pressure on those 616 frames.

**`object_slots_live` is equal between the two runs on ALL 701 post-inject
frames (lf1900..lf2600); it never diverges in this scenario.** So the live
population of every table is identical run-to-run on every compared frame.

**The per-frame write count to each sub-table range is BYTE-IDENTICAL between
baseline and overrun on all 701 frames. Diff = overrun - baseline:**
```
r813660:          frames_compared=701  diff range 0..0  frames_overrun_lower=0
r8145A0:          frames_compared=701  diff range 0..0  frames_overrun_lower=0
r810570:          frames_compared=701  diff range 0..0  frames_overrun_lower=0
r81C8FC:          frames_compared=701  diff range 0..0  frames_overrun_lower=0
poolC_81CDF0_s48: frames_compared=701  diff range 0..0  frames_overrun_lower=0
poolD_81D390_s22: frames_compared=701  diff range 0..0  frames_overrun_lower=0
poolB_81B730_s38: frames_compared=701  diff range 0..0  frames_overrun_lower=0
ent_81332C_s50:   frames_compared=701  diff range 0..0  frames_overrun_lower=0
```
**Not one frame, on any of the eight sub-tables, shows fewer writes under
load.** The busiest dilated frames under overrun sit at the absolute peak of
the run's write activity (e.g. `$813660`: `lf2522=235w/live24`, `lf2506=213w`;
`$81C8FC`: `lf2478=182w/live10`), which is the opposite of what a budget cap
would produce.

**The wide-range control** (`.scratch/w121/wide.lua`, one tap over all of
`$810000-$81DFFF`) does show a small nonzero diff (`-5..9`, 116 frames lower).
That signal is NOT in any sub-table walk: all eight stride-tables are `0..0`.
It is single-field STATE divergence (score / chain / combo / animation cursors
in `$81Bxxx`, `$8130xx`, `$815Exx`), which W2 already documented: `d_ram`
diverges at lf1903 because the IRQ6 (A) gate skips the palette upload / scroll
register / defer-buffer flush on dilated frames. That is mechanism (A), not
mechanism (C). The sub-table walks themselves are provably unaffected.

---

## 4. THE STRUCTURAL REASON -- fixed-count `dbra`, no budget test

The loops do not truncate because, statically, they CANNOT. `[M]` the outer
walk that drives `$8145A0` (and indirectly `$813660`), at `$263514`:
```
$263514  lea.l  $81332c.l, a5      ; entity pointer-table base
$26351A  move.w #$39, d6           ; counter = 0x39 = 57  (58 iterations, FIXED)
$26351E  tst.w  (a5)               ; loop head
$263520  beq.w  $263568            ; skip empty slot
$263524  movea.l $6(a5), a6        ; follow the slot's pointer
$26352E  sub.w  d0, $4(a6)         ; the write (lands in $8145A0 via the pointer)
...
$263568  lea.l  $50(a5), a5        ; stride $50
$26356C  dbra   d6, $26351e        ; back edge, 58 times, NO budget test inside
```
This is structurally identical to the top-level driver (`moveq #$13,D0` / ...
/ `dbra D0,$2410CC`): a FIXED-COUNT walk over a fixed slot extent, skipping
empties, with no per-iteration budget compare and no time test. The per-frame
write COUNT varies 1..24 in the discovery map only because the live population
varies (empty slots are skipped); the LOOP always runs its full 58 iterations
every frame, regardless of how much frame budget remains. The other outer
walks are the same shape (fixed-count `dbra` / live-count-driven `dbra` /
sentinel walk; the static scan in `.scratch/w121/static_loops.py` and
`findloops.py` found no in-loop budget-capped exit on any of them).

A fixed-count `dbra` cannot retroact on frame budget. That is the listing's
answer, and the MAME measurement in section 3 confirms it runs to completion on
every dilated frame.

---

## 5. VERDICT

**None of the per-type sub-handler (sub-table) loops truncate under load. All
are unbounded/correct.** Under a forced 60,000-nop overrun (240,012 added
cycles/frame, 616 dilated logic frames, matching W2's 614), on all 701
post-inject frames where `objlive` was equal between runs, the per-frame write
count to each of the eight stride-based per-slot sub-tables in the
enemy/bullet/effect RAM region was BYTE-IDENTICAL to the no-load baseline
(diff `0..0`, zero frames lower). Mechanism (C) is absent at the sub-handler
level just as W2 proved it absent at the top level.

**`src/budget.js`'s single calibration constant `NEVER_TRIGGERS` stands for the
sub-handlers too.** No per-type budget test is needed; no fix is required. The
file is already shaped to absorb a per-type answer as one constant, and the
answer is: never. (`budget.js` lines 30, 39: `unitsPerFrame = NEVER_TRIGGERS`;
the truncate path at line 50 remains a loud throw, never reached.)

---

## RULED OUT

- **Mechanism (C) at the sub-handler level, for all eight stride-tables.**
  `[M]` baseline-vs-overrun diff `0..0` on 701 dilated frames each.
- **`$80B058` as a per-type sub-table.** `[M]` it is the ISR6 gated defer
  buffer walked by `$240F26`/`$141258`; nothing to do with the 20 object
  handlers. (W112/W114/W116.)
- **That the four W2 ranges are walked by `lea $BASE` loops in the handlers.**
  `[M]` zero abs.long refs to any of the four bases in build B; the ranges are
  reached through pointer tables (e.g. `$81332C` -> `$8145A0`).

## COULD NOT REACH (measured reasons)

- **The exact identity of every sub-table's live-count word.** Not needed: the
  baseline-vs-overrun differential is airtight without it. A per-table
  "processed vs live" read (the strict W2 analog) was attempted as
  corroboration, but my heuristic live-count (stride-aligned record with
  nonzero word 0) overcounts for `$810570` and `$81C8FC` (some records have a
  nonzero word 0 but are not written that frame, e.g. dormant slots). This
  does NOT affect the verdict: the differential test does not use the live
  count, and shows identical writes under load regardless.
- **The four unattributed type-5 calls** (`$2527CE`/`$252BD0`/`$25292A`/
  `$252A52`, W105 section 4.2) and the 14 unported object types' bodies were
  not closure-walked. They are not on the (C) critical path: (C) is about
  per-slot loops under the top-level driver, and the eight stride-tables that
  survive under that driver are the eight tested above. If a future wave ports
  one of those bodies and it contains a NEW per-slot loop, the same
  baseline-vs-overrun differential settles it in one run.
- **Loads higher than 60,000 nops.** W2's sweep went to 60,000 (0.5309 logic/
  video, the slowest the sled reaches without other side effects). I tested at
  the same 60,000. A larger sled would just add more dilation, not change
  whether a fixed-count loop truncates (it cannot).
- **The MiSTer FPGA core as a second witness.** Not used (research item W119
  Phase 5b; this is Phase 0b). The verdict here does not depend on MAME's
  timing accuracy: the inject is a deterministic what-code-runs perturbation,
  and the write-count equality is a code-structure fact, not a timing claim.

---

## LOG

- opened IN PROGRESS; read CATCHUP (7b-7d), HANDOVER, W105 (sec 4.1), W119
  (Phase 0b), W2 (impl + review), `src/budget.js`, `src/objdriver.js`.
- `[M]` static: read the 20-entry dispatch table `$240F62` out of the image
  (matches W2/W105). Closure-walked all 20 handlers
  (`.scratch/w121/static_loops.py`): no handler loop references any of the four
  ranges; zero abs.long refs to any base. The prior partial run's
  `games/ddpdoj/.scratch/w121/findloops.py` (static only, no worklog) reached
  the same negative conclusion ("loops walking the brief's five RAM ranges":
  empty).
- `[M]` Stage A discovery: `objhunt.lua` over `$810000-$81DFFF`, CURPC write
  map, identified the eight stride-based per-slot sub-tables and their walker
  PCs (section 2).
- `[M]` disassembled the outer walks; confirmed fixed-count `dbra` shape, no
  budget test (section 4; e.g. `$26351A move.w #$39,d6`).
- `[M]` Stage B dynamic: built `.scratch/w121/subtap.lua` (inject + per-range
  per-frame write taps + objlive, semaphore-keyed, handles in GLOBALS). Fixed
  two bugs found by a short sanity run (the Coin input `N` lives on the
  `:Service` port not `:P1P2`; and `pgm.run()` strips the `PROBE ` tag so the
  parser must match `TSVCOLS` not `PROBE TSVCOLS`). Ran baseline + 60,000-nop
  overrun (`.scratch/w121/runsub.py`); parsed with `.scratch/w121/analyze.py`.
- `[M]` extended to all eight sub-tables (`.scratch/w121/extra.lua`) and ran a
  wide-range control (`.scratch/w121/wide.lua`) to localise the small nonzero
  wide diff to single-field state, not sub-table walks.
- Machine pin on every MAME run: `maincpu_fnv64=D4C25CA9C91B9D47`,
  `cycles_per_frame=337920`, `refresh_hz=59.185606061`. Private
  `-cfg_directory`/`-nvram_directory`, `-noreadconfig -nowriteconfig`,
  `-video none -sound none -nothrottle`. ONE pgm.py instance at a time.

status: **DONE**
