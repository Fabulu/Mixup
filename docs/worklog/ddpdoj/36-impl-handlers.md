# W36 — IMPL: the remaining stage-1 enemy handlers

status: **DONE** — see §8.
wave: 36. role: IMPLEMENTER (sole writer to `games/ddpdoj/`).
date: 2026-08-04.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Build B = `$23xxxx..$2Axxxx`.
Any build-A address is flagged as such.

## THE BRIEF, AND ITS PREMISE

Port the remaining stage-1 enemy handlers. The brief says there are **8**, and
that W34 proved all 8 EXECUTE (they reach their loud named throws) so they are
reachable and unported. Order of work as briefed:

1. **Enumerate from the ROM FIRST** and report N of M with a real denominator
   before porting anything. Check the brief's premise — four orchestrator briefs
   today have had false premises.
2. Port.
3. MEASURE: spawn records covered (295 of 339 today), which handlers now run,
   what the gate says.
4. Use a CONTROL for every reachability claim.

Constraints carried in: `$289004` is deliberately NOT ported (its only driver is
type-5 call #5 `$288E4E`; allocating without it rebuilds W33 §4's leak).
Suspect the tooling before the port.

---

## 1. THE ENUMERATION, BEFORE ANY PORTING — `tools/oracle/w36handlers.py`

Committed, so every number below is reproducible. It reads
`tools/oracle/out/maincpu.bin` (the decrypted build-B image, address == file
offset), walks the stage-1 spawn script, resolves every record's type through
the dispatcher `$2635F6`'s two half-tables, and walks each unported handler's
body by following its own branch displacements. Its `CAN/CANNOT` header is the
`xref.py` rule: absolute `jsr`/`jmp`, PC-relative `bsr`/`bra`/`bcc`/`dbcc` and
`(d16,PC)` are visible; `jsr (An)` through a register is not. Every "N targets"
is a LOWER BOUND.

**The ported/unported split is not a constant in the tool** — it is parsed out
of `src/handlers.js` and `src/midboss.js`'s own `HANDLERS` maps at run time, so
it cannot rot.

```
STAGE-1 SPAWN SCRIPT $230C6C..$231705  ($FFFF terminator at $231704)
  339 records / 21 distinct types / 19 distinct handlers
PORTED 11 of 19 handlers, owning 295 of 339 spawn records
UNPORTED 8 owning 44
```

Reproduces W33 §1 and W28 §1 L10 independently.

## 2. THE BRIEF'S PREMISE — TRUE AS ARITHMETIC, WRONG AS A PRICE, AND SHORT BY TWO

**2.1 The count is right.** 8 handlers, 44 records: `$26A5E4` ($08, 12),
`$26AD28` ($0B, 12), `$27733E` ($89, 7), `$26A860` ($09, 7), `$275F30` ($88, 3),
`$29700C` ($24, 1), `$2697F6` ($31, 1), `$292902` ($0E, 1).

**2.2 ONE OF THE EIGHT IS THE STAGE-1 BOSS, and it is not a handler-shaped
job.** `$292902` is **10 instructions**, and every one of them is a dispatch:

```
$292902 jsr $294AD8   the boss BRAIN -- the installed script tables W33 §8
                      could not bound and W28 §6 prices as waves 12-13
$292912 jsr $243DD0   $292918 jsr $25962E   $292922 jsr $242952
$292928 jmp $263762
```

W33 §8 states plainly that it could not bound even the boss's *bullet kinds*
because "the D0 at those sites is `move.l ($C,A4),D0`, a data read", and W28 §6
item 12–13 says the format has to be READ FIRST. **Counting it as one of eight
prices a boss like a popcorn enemy.** This wave ports the OTHER SEVEN and says
so; the boss is named, not attempted.

**2.3 AND 19 IS NOT THE STAGE-1 HANDLER DENOMINATOR — IT IS 21.** A
script-only enumeration cannot see the types stage 1 reaches because an enemy
spawns them. Re-derived this wave from the ROM (every absolute `jsr`/`jmp` to
the three deferred enqueues `$263678`/`$263684`/`$263690`, 42 sites, with a
40-byte back-walk for the immediate that reaches D0):

| type | enqueued at | handler | state |
|---|---|---|---|
| `$1C` | `$26B7E2` — inside the PORTED midboss `$26B6FA` | `$26C20C` | **unported** |
| `$1E` | `$2963C2 $2963F4 $29642C $29645E` — inside the boss | `$296DD6` | unported |

`src/midboss.js:714` already executes `$26B7E0/$26B7E2` — the port enqueues type
`$1C` the moment the midboss dies. So **`$26C20C` is a stage-1 handler that this
port can dispatch today and does not have.** It is 22 instructions and it is NOT
portable this wave for a reason that has nothing to do with handlers: it writes
23 x 9 longwords to **`$9000A4`/`$9000BC`**, and `grep` over `src/` finds the
port models no `$900000` region at all. Named, not attempted.

So: **11 of 21 stage-1 handlers ported at the start of this wave**, not 11 of 19.

## 3. WHAT EACH UNPORTED BODY DRAGS IN (the W34 §1.2 measurement)

Every external target of each body, and whether the port has it:

| handler | insns | externals already ported | externals that must NOTE |
|---|---|---|---|
| `$26A5E4` `$08` | 145 | `$23D852 $23DF58 $23DF86 $2417DE $24202C $242190 $242684 $263762 $2814AC $286096 $28615E` | `$289004` `$28C2A8` |
| `$26AD28` `$0B` | 166 | (the same eleven) | `$289004` `$28C2A8` |
| `$26A860` `$09` | 129 | (the same eleven) | `$289004` `$28C2A8` |
| `$27733E` `$89` | 121 | `$242684 $2638A6 $263762 $268018 $24203E $242190 $286096 $28615E $2813F0` | `$289004 $289AF4 $28C25A $27F8EE` |
| `$275F30` `$88` | 303 | `$2638A6 $263762 $24203E $242190 $286096 $28615E $2813F0 $281442` | `$289004 $289B22 $28AC72 $28C2DC $27F8FA` |
| `$2697F6` `$31` | 63 | `$263762` | `$28C692`, + `$23F896` (NEW, an enqueue stub) |
| `$29700C` `$24` | 43 | `$24179E $2417DE $263762` | — , + `$23DECE` (NEW, an enqueue stub) |
| `$292902` `$0E` | 10 | `$263762` | **`$294AD8` — the boss brain (§2.2)** |

**ONE routine has to be newly ported and it is 13 instructions**: `$2425B2`,
the rank-selected position-box test, whose four tables `$242562/$242576/
$24258A/$24259E` are ALREADY in a window (W30's `$242560+$54`). The two "NEW"
routines `$23DECE` and `$23F896` are not new subsystems — they are members of
the `$23D762` sprite-emitter family `resolveEmitStub` already reads out of the
cartridge (`$23DECE` = bucket 0, register convention; `$23F896` = bucket 21,
record convention), and both are entries 18 and — of the very table
`$27829C` W30 already windows.

## 4. WHAT WAS PORTED

| file | what |
|---|---|
| `src/handlers.js` | the SEVEN handlers, the shared damage-first tail `$269B3E`/`$269E20`, `$2425B2` (new), and `$268018` factored out of `$267FC6` because W36 is the first caller to `jsr` it directly |
| `src/movement.js` | `$2638A6` now RETURNS D2/D3 through an optional out-object — it is a defined return on all four of its exits, and `$275F30` reads D3 four instructions after the call |
| `src/spritequeue.js` | a **FIFTH** sprite-emitter stub shape (§4.2) |
| `tools/export-tables.py` | seven new ROM windows, and the ENEMY SPEED LEVELS (§4.3) |

### 4.1 THREE THINGS THE LISTING FORCED THAT A SWEEP WOULD HAVE MISSED

1. **`$26A6F4..$26A736` IS DEAD CODE INSIDE `$26A5E4`.** Both arms of
   `$26A6E2 tst.b ($1A,A6) / bne $26A738` and `$26A6EA … / bra.w $26A738` step
   over 34 bytes containing a complete alternative state machine ending in
   `jsr $242178 / bra $269E20`. **[M]** A branch search over `$269000..$26B000`
   finds 0 references to any word of it, and an absolute-longword scan of the
   whole of build B finds 0. It is transcribed **as a comment, not as code** —
   the W34 §2.3 precedent — because writing it would give the port a path the
   cartridge has not got.
2. **`$27615C` RE-USES THREE REGISTERS FROM THE PREVIOUS ENQUEUE.** Type `$88`'s
   fourth sprite request sets only `move.w ($4,A6),D1` — a WORD — so D1's HIGH
   half is still the third request's `($2,A6)+$FF00`, and it sets neither D3 nor
   D4. Rebuilding the registers per call would put a different sprite on screen.
3. **`$269BAA move.b #$18,D4` after `$269BA6 move.w ($1C,A6),D4`.** The byte move
   replaces only D4's low byte, so the request keeps `($1C,A6)`'s high byte.

### 4.2 A FIFTH SPRITE-EMITTER STUB SHAPE — found the way W31 found the fourth

`resolveEmitStub` reads a stub's (bucket, convention) out of the cartridge
rather than carrying a typed map, and it knew four prologue shapes. Type `$31`
enqueues through **`$23F896`**, which is a member of the family with the
counter bump BEFORE the record read instead of after the writes:

```
  41F9 <buf> D0F9 <ctr> | 0679 000C <ctr> | 43EE 0002 ...
  ^at+0        ^at+6      ^at+$C            ^at+$14
```

The order is invisible to a port; the OPCODE AT `+$C` is not, and reading it as
the convention word turned a bucket-21 request into a throw. **[M] The port
threw `$23F896 continues with $679` at lf8186 before this was fixed** — the
loud-throw mechanism doing exactly its job on a shape nobody had read.

### 4.3 THE ENEMY SPEED LEVELS — a hole the new handlers walked into

**[M] The port threw `speed index 36 was not exported` on the first live type
`$0B`**, and 36 is not an invention: it is byte `+$16` of the long-form
sub-record prototype at **`$26AD0C`**, copied by `$2637A2` — code the port has
had since W23. `tools/export-tables.py`'s `speed_index_set` covered the PLAYER's
0..31, the player's spawn templates, the option pods and W31's one midboss
immediate. **It never covered the ENEMIES**, and nothing noticed because every
handler the port had either drove position from the movement stream (whose SPEED
operands are all inside 0..31 — **[M]** 15 distinct values, max 24, over all 163
stage-1 streams) or did not drive it at all.

The fix is an ENUMERATION, not a widening to stop a throw. `enemy_speed_indices`
reads three things out of the ROM:

- **the sub-record prototypes** — each stage-1 type's init body's
  `lea <proto>(pc),A0 / nop / jsr $2637A2`, decoded through BOTH of the forms
  `src/enemyproto.js` documents. **[M] {0, 4, 8, 16, 20, 29, 36}**, and every
  prototype address it derives matches the one W23 wrote in that type's window
  comment — 30 of 30.
- **the movement streams' `>= $C0` SPEED operands** — **[M] {1..6, 8, 10, 12,
  14, 16, 18, 20, 22, 24}**.
- **the RAMPS.** Three handlers step `($1A,A6)` arithmetically, at six sites,
  each between 0 and a constant it compares against (`$26A40C cmpi.b #$1C`,
  `$26A98A cmpi.b #$20`, `$26AED6 cmpi.b #$1C`), so every integer up to the
  largest of those and the prototypes is reachable.

**61 → 65 exported levels** (+33 +34 +35 +36), `player.tables.json`
446,936 → 450,531 B. Not 256: the whole table is 133 KiB of quadrants and the
owner's boot constraint is binding. §7 records the one ramp this bound does not
close.

## 5. THE MEASUREMENT, AND ITS CONTROL

`tools/w34damagegate.mjs` (W34's, unchanged), `fly-around`'s lf2000 seed, the
same INTERVENTION W34 named and for the same reason: the recorded stick plus the
owner's DOWN/left-right script, a single-frame Button-1 tap every 4 logic
frames, `--no-pods`, and a free run past the end of the 2,200-frame trace.
`docs/knowledge/09`: valid for COVERAGE, invalid for characterising play.
Nothing here is compared against MAME.

**THE CONTROL IS THIS TREE WITH THE SEVEN MAP ENTRIES REMOVED** — not a
different tree, not a citation of W34 — applied byte-exactly in Python with a
single-occurrence anchor, and `src/handlers.js` sha256 `fcdd4590337bb35a`
verified identical before and after.

| | CONTROL (seven unregistered) | AFTER |
|---|---|---|
| frames | 2,937 (lf2001..lf4937) | **6,185** (lf2001..lf8185) |
| MAX CLK `$8130CE` | 282 | **487** |
| BLOCKED by | `$27733E` at lf4938 | **`$292902` at lf8186 — THE BOSS** |
| kills reaching `$28615E` | 191 | **363** |
| kill values | `$1`x22 `$8`x92 `$10`x72 `$26`x3 `$83`x2 | + **`$34`x6** (type `$89`) and **`$115`x2** (type `$88`) |
| P1 pending `$81B4C0` | `$00168517` | `$00627145` packed BCD |
| unported stage-1 handlers dispatched | 8 | **1** |

The control reproduces W34 §4.2's number exactly — `BLOCKED at lf4938 by
$27733E` — from a different tree two waves later.

**AND THE RUN NOW STOPS EXACTLY WHERE THE SCRIPT SAYS IT SHOULD.** `$292902`'s
first record is at clk **488**; the run reaches **487** and throws on the frame
the boss spawns. W33 §3.1 read the BOARD's own `w22-spawn-stage1.tsv` and
recorded *"type `$0E` (THE BOSS) spawns lf8186 clk `$01E8`"* — **the port blocks
at lf8186.** Same logic frame, from two instruments that share no code.

**A NO-FIRE CONTROL SEPARATES THE TWO CLAIMS.** With the identical script and the
fire button never pressed: 0 hits, 0 kills, ledger `$00000000` — and still
**clk 487, blocked at lf8186 by `$292902`**. So reaching the boss is what
PORTING bought; the 363 kills and the ledger are what FIRING bought. Neither
number is carrying the other.


## 6. EVERY CHECK WAS SEEN TO FAIL

`games/ddpdoj/tests/w36handlers.test.js`, **21 tests**. Every one drives a real
routine against the REAL exported cartridge windows and asserts on a value the
ROM decides — a muzzle vector out of `$269F48`, a fan pair out of `$2732FA`, a
sprite pointer out of `$269E48`, a bucket out of a stub's own `lea` operands, an
animation frame out of `$26990E`, a threshold out of `$2680A2`. None writes a
constant and reads it back through the same constant (`docs/knowledge/03`), and
the one throw assertion pins `e.romAddress` (`27-review.md` 1A).

Mutations applied byte-exactly in Python with a single-occurrence anchor, the
whole 546-test suite run, the file restored, sha256 verified identical both ways
after every one (`src/handlers.js` `72d4a5d60ae5ce83`, `src/movement.js`
`d7cf9cdcdc7133ea`, `src/spritequeue.js` `f932564c4b3fdbbd`).

| # | mutation | result |
|---|---|---|
| M1 | `$269B3E`'s arm select inverted | RED — 2 |
| M2 | `$269BAA` read as `move.w` — D4's high byte lost | RED — 1 |
| M3 | `$269E26 andi.w #$3E` read as `#$3F` | RED — 1 |
| M4 | `$2425B2`'s two table pairs swapped | RED — 3 |
| M5 | `$2425B2`'s SECOND axis never refuses | RED — 1 |
| M6 | `$26A6CE`'s carry arm uses dir 0, not the preserved D1 | RED — 1 |
| M7 | `$0B`'s muzzle index taken from the AIM, not `($23,A5)` | RED — 1 |
| M8 | `$26A73C bcc` read as `bne` — the fire on the wrong frame | RED — 1 |
| M9 | `$27615C` rebuilds D1's HIGH half instead of inheriting it | RED — 1 |
| M10 | `$27615C`'s request rebuilds D3 instead of inheriting it | RED — 1 |
| M11 | `$275F50 neg.w D3` dropped | RED — 1 |
| **M12** | `$2638A6`'s frozen exit leaves the out-vector stale | **GREEN, then RED — 1** |
| M13 | `resolveEmitStub` loses the FIFTH prologue shape | RED — 2 |
| **M14** | `$2698D2 btst #$1`'s sense inverted | **GREEN, then RED — 1** |
| M15 | `$2698B2`'s wrap read as `#$228` | RED — 1 |
| M16 | `$269840`'s stride read as SIX (the bytes consumed), not EIGHT | RED — 1 |
| M17 | `$297086`'s byte compare read as UNSIGNED | RED — 1 |
| M18 | `$27744E` dropped — the `$89` fan stride 4, not 8 | RED — 1 |
| M19 | `$27621E`'s `subq` read as an `addq` | RED — 1 |
| M20 | `$27627E`'s `move.l #$115` read as a `moveq` | RED — 1 |

**20 mutations, 20 RED. TWO SURVIVED THE FIRST PASS AND BOTH WERE DEFECTIVE
CHECKS OF MINE, neither uncatchable** — the distinction W31 asked later waves to
keep and W33/W34/W35 kept.

- **M14 — an assertion that the two arms DIFFER, not WHICH.** `$2698D2 btst #$1`
  decides whether type `$31`'s second request sits `$40` below the first or `$40`
  above it, and my test asserted only `set.pos !== clr.pos`, which is invariant
  under swapping them. It now pins the SIDE: below in one arm, above in the other.

- **M12 — a check that could not exist where I put it, and the fix was to move
  the code, not the test.** I first asserted `$2638A6`'s frozen return through
  the handler's recoil field, and there the two readings are *identical*: the
  correct D3 is 0, a missing D3 is `undefined`, and `u16(x + undefined)` is also
  0. On top of that, `handler88` was creating its out-object as
  `{ dy: 0, dx: 0 }` — which put the cartridge's own `$2638A0`/`$263910`
  initialisation in TWO places and made the one in `src/movement.js`
  unfalsifiable by construction. **The handler now passes `{}`**, so the zeroing
  exists exactly where the ROM has it, and the test drives `stepMovement`
  DIRECTLY with a POISONED out-object (`$7777`) across all three of its
  value-bearing exits: the clean cache `$2638E8`, the frozen entry `$2638A0`,
  and the stop heading `$263910` — whose stream address the test FINDS in the
  movement window rather than carrying.

**Unit tests: 525 → 546 pass, 0 fail, 0 SKIPPED.**

### 6.1 THE FULL GATE

`python games/ddpdoj/tools/oracle/pgm.py check`, run to completion on the final
tree (MAME re-recorded every scenario; nothing was reused):

```
VERDICT: ALL GREEN -- 49 passed, 0 failed, 0 SKIPPED
# pass 546   # fail 0   # skipped 0
```

Unchanged from W32/W33/W34/W35's 49/0/0; the unit-test stage is 525 -> **546**
with **no skip**, which is the state W34 §6.2's exporter fix produced and this
wave did not disturb. **Nothing was disabled, skipped, narrowed or loosened**;
no compared column set, window or frame count moved, and no stage was added.
The stages this wave could plausibly have broken all pass on their own
recordings:

- **`fly-around: port vs board` — `RESULT 0 DIVERGENT FRAMES on 88 columns over
  2200 logic frames`**, with the seven new handlers in the dispatch map and the
  new `stepMovement` signature under every mover in the window. §7 states what
  that does and does not prove.
- `enemy stats: hitbox/HP/palette/HP-reload at spawn (W23)` — **308 of 308**,
  the stage whose prototype loader `$2637A2` §4.3's speed enumeration decodes.
  Its own accounting names types `$1C`/`$1E` as handler-spawned, which is the
  same finding as §2.3 arriving from the board.
- `scroll program` (10,431 frames, twice), the attract entry (1,364 frames,
  twice), `turret angle` (14,732 and 32,788 one-step pairs), the pattern gate
  over three corpora, the bullet mover, the spawn walker, `determinism`, and
  the display-list gate (2,207,744 px, 100.0000 %).
- `tools/webgate.mjs` re-run on the final tree as well: **14 files over HTTP,
  one frame rendered 98.8 % non-black** — the published page still boots with
  the seven new ROM windows and the four new speed levels in the bundle
  (`export-web.mjs` was re-run after `export-tables.py` changed).

## 7. WHAT I COULD NOT DETERMINE

- **Whether any of the seven agrees with the BOARD, on any frame.** Nothing in
  this wave is compared against the cartridge, and the reason is structural
  rather than a matter of effort: `fly-around` is the project's only port-vs-
  board window, it runs lf2001..4200, and **the deepest distance clock it
  reaches is 239**. The seven handlers' first triggers are at clk **283, 322,
  376, 377, 420, 464 and 481** — every one of them beyond the end of the
  compared window. So `pgm.py check`'s `fly-around: port vs board, 0 divergent
  frames` stage is green about code these handlers never execute, and the only
  honest reading of it is *this wave broke nothing that was already compared*.
  The same is true of the shared tail `$269B3E`/`$269E20`: types `$05`/`$07`
  reach it only through the fire machine they still `note()`, so it does not run
  in-window either. **Closing this needs a recording past lf4200 that FIRES**,
  which is what W34 §9 item 1 already asked for and what this wave makes worth
  more: there are now 43 more spawn records of ported code on the other side of
  it.
- **Whether type `$24`'s speed ramp is bounded.** `$29705E addq.b #$1,($1A,A6)`
  has **no ceiling in the handler** — unlike the three damage-first sites, which
  each compare against `$1C` or `$20`. `$29700C` starts the object at speed `$05`
  (`$297034 move.w #$537,($1A,A6)`, a WORD write covering speed AND heading) and
  climbs from there; the only thing that ends the object is the position test
  `$297062 cmpi.w #$DE00,($4,A6)`, which bounds its LIFETIME and not its speed.
  **What I tried:** reading the whole body for a second compare (there is none),
  and checking whether the free arm bounds the ramp (it does not, except through
  the object leaving the screen sooner as it accelerates). So §4.3's closure is a
  bound on the OTHER six and a floor on this one, and a level above it is a loud
  named throw that prints the level — not a silent wrong vector.
- **Whether `($1A,A6)` may exceed the `$2782E4` window's 24 entries.** Type
  `$88` indexes `$27829C + ($1E,A6) * 4` and `$2782E4 + ($1E,A6) * 4`, and
  `$2782E4` is `$27829C + $48`, i.e. entry 18 of the SAME 30-entry table (`[M]`
  read out of the ROM: `$27829C..$278313` are 30 pointers into the `$23D762`
  family and `$278314` is `00000000`). W30's window ends at `$27833F`, so an
  `($1E,A6)` of 23 or more reads past it — and would throw by address rather
  than fetch a neighbour. I did not bound `($1E,A6)` for type `$88`.
- **The meaning of four record fields.** `($24,A5)`/`($25,A5)` (a phase
  counter and its reload), `($26,A5)`/`($27,A5)` (the two state flags) and
  `($1F,A5)` (the per-step turn) are transcribed BY OFFSET with their ROM sites,
  not by name, because I could not establish a name that the three siblings and
  the two carrier types would all agree with. Naming them wrongly is how W23's
  `+$16/+$18/+$1A` note got its claim wrong (W33 §5.2).
- **Type `$1C`'s handler `$26C20C`.** It is 22 instructions and it is dispatched
  by this port the moment the midboss dies (`src/midboss.js:714` already
  executes `$26B7E2`'s enqueue). It writes 23 x 9 longwords into `$9000A4` /
  `$9000BC` through a `$227AF8` source, and the port has no `$900000` region at
  all. That is a VIDEO-MEMORY wave, not a handler wave, and this worklog names
  it rather than guessing at it.
- **Anything about the board this wave measured itself**, apart from the gate.
  Every dynamic figure in §5 is the PORT replayed against a TSV already on disk.

## 8. WHERE THE WAVE ENDED

**A. THE BRIEF'S "EIGHT REMAINING HANDLERS" WAS ARITHMETICALLY RIGHT AND TWICE
MISLEADING** (§2). One of the eight is the stage-1 BOSS, ten instructions of
dispatch into a script format W33 and W28 both say must be read first; and 19 is
not the denominator — types `$1C` and `$1E` are reached because an enemy spawns
them, so stage 1 has **21** handlers and the port had 11.

**B. SEVEN PORTED. 11 of 19 → 18 of 19 scripted handlers; 295 of 339 → 338 of
339 spawn records.** Counting the two unscripted types, 11 of 21 → 18 of 21.

**C. THE RUN NOW STOPS ON THE BOSS, ON THE BOARD'S OWN FRAME.** Control: clk
282, blocked at lf4938 on `$27733E`. After: clk 487, blocked at lf8186 on
`$292902` — and `w22-spawn-stage1.tsv` records the board spawning type `$0E` at
lf8186. A no-fire control reaches the same clock with 0 kills, so reaching the
boss is what PORTING bought and the 363 kills are what FIRING bought.

**D. TWO INSTRUMENT DEFECTS, BOTH FOUND BY A LOUD THROW AND BOTH CLOSED BY
ENUMERATION** (§4.2, §4.3): a fifth sprite-emitter stub shape `resolveEmitStub`
could not read, and an exported speed set that had never covered the enemies —
type `$0B` spawns at speed 36 out of its own prototype, through code the port
has had since W23.

**E. 20 MUTATIONS, 20 RED**, two first-pass survivors, both defective checks of
mine; one of them was fixed by moving the CODE (`handler88` no longer pre-zeroes
the vector `$2638A0` zeroes) rather than the test.

### RANKED, FOR THE REVIEWER

1. **§7's first bullet.** The gate is green and it is green about code the seven
   handlers do not run: every one of their first triggers is beyond
   `fly-around`'s clk-239 horizon. If a reviewer reads "ALL GREEN 49/0/0"
   anywhere in this document as evidence about the seven, that is the defect.
2. **§4.3.** The speed set is a closure over the prototypes, the streams and
   three named ramps — and §7 records the ONE ramp (`$29705E`) it does not
   close. If the closure argument is wrong, the number 36 is a measurement and
   the rest is reasoning.
3. **§4.1 item 1.** 34 bytes inside `$26A5E4` are transcribed as a comment
   because two searches found no reference. Negatives are where this project
   gets burned; the searches are named and they are what I tried, not a proof.
4. **§2.3.** Type `$1C`'s handler is dispatched by the port TODAY, the first
   time the midboss dies. It is not a hypothetical gap.
5. **§6's M12.** A check of mine could not exist where I put it because
   `u16(x + undefined)` is 0, and the port had ALSO put the cartridge's own
   initialisation in two places. Both halves matter.

## LOG (appended as findings arrive)

- opened.
- §1 [M]: **339 records / 21 types / 19 handlers, 11 ported owning 295**.
  Reproduces W33 and W28 independently, from a tool that reads the port's own
  `HANDLERS` map rather than carrying a constant.
- §2 [M]: the brief's "8 remaining" is **arithmetically right and twice
  misleading**. One of the 8 is the BOSS `$292902` (10 instructions of dispatch
  into `$294AD8`, a format W33 §8 and W28 §6 both say must be read first), and
  the denominator is **21, not 19** — types `$1C` and `$1E` are reached by
  enemies spawning enemies, and `$26C20C` (type `$1C`) is dispatched by the
  PORT's own midboss death path today.
- §3 [M]: the externals. Porting the seven needs exactly ONE new routine
  (`$2425B2`, 13 instructions, tables already windowed) and two members of an
  already-resolved enqueue family.

- §4 PORTED: the SEVEN non-boss handlers, the shared damage-first tail
  `$269B3E`/`$269E20`, `$2425B2` (13 instructions, the only new routine), and
  `$268018` factored out of `$267FC6` -- W36 is the first caller to `jsr` it
  directly, so it is a routine with its own callers and not the fire gate's
  tail.
- `$2638A6` now returns D2/D3. It is a DEFINED value on all four of its exits
  (`$2638A0`, `$2638E8`, `$263900`, `$263910`) and `$275F30` reads D3 four
  instructions after the call.
- §4.1 [M]: **`$26A6F4..$26A736` is DEAD CODE inside `$26A5E4`** -- 34 bytes
  both arms step over, 0 branch references in `$269000..$26B000` and 0
  absolute-longword references in the whole of build B. Transcribed as a
  COMMENT, per W34 §2.3.
- §4.2 [M]: a **FIFTH sprite-emitter stub shape**. `$23F896` puts its counter
  bump BEFORE the record read, so `resolveEmitStub` read the `addi` as the
  convention word. The port threw at lf8186 before this was fixed.
- §4.3 [M]: **the exported speed set had never covered the ENEMIES.** Type `$0B`
  spawns at speed 36 out of its own prototype `$26AD0C` -- W23 code. Now
  enumerated from the prototypes {0,4,8,16,20,29,36}, the streams' SPEED
  operands (15 values, max 24, over all 163 stage-1 streams) and three named
  ramps: 61 -> 65 levels, +3,595 B in `player.tables.json`, +2,164 B gzipped.
- §5 MEASURED, with the CONTROL being this tree minus the seven map entries
  (sha256 `fcdd4590337bb35a` identical both ways): clk **282 -> 487**, blocked
  by `$27733E` at lf4938 -> by **`$292902`, THE BOSS, at lf8186** -- the frame
  the board's own `w22-spawn-stage1.tsv` spawns type `$0E`. Kills 191 -> 363,
  and the two new kill values `$34` (type `$89`) and `$115` (type `$88`).
- §5 the NO-FIRE control: 0 hits, 0 kills, ledger `$00000000`, and STILL clk
  487 at lf8186. Reaching the boss is what porting bought; the kills are what
  firing bought.
- §6: 21 behavioural tests, **20 mutations, 20 RED**; two survived the first
  pass and both were defective checks of mine. One of them was fixed by moving
  the CODE -- `handler88` had been pre-zeroing the out-vector `$2638A0` zeroes,
  which put the cartridge's own initialisation in two places.
- §6.1: `pgm.py check` **ALL GREEN 49/0/0**, unit tests **546/0/0**, no skip;
  `fly-around` **0 divergent frames on 88 columns over 2,200 logic frames**, and
  the enemy-stats stage 308 of 308.
- §7: **the gate cannot see any of the seven.** `fly-around` reaches clk 239 and
  their first triggers are 283..481. The green gate says this wave broke nothing
  that was already compared, and nothing more.

status: DONE
