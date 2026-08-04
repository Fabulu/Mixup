# W36 — IMPL: the remaining stage-1 enemy handlers

status: **IN PROGRESS**
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
owner's boot constraint is binding. §8 records the one ramp this bound does not
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
