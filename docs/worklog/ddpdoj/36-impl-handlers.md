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
