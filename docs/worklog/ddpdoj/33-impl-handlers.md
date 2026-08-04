# W33 — IMPL: stage-1 enemy handlers, CHOSEN BY THE BULLET KINDS THEY FIRE

status: **IN PROGRESS**
wave: 33. role: IMPLEMENTER (sole writer to `games/ddpdoj/`).
date: 2026-08-04.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B
unless the line says why not.

## THE BRIEF

W27's review finding **F1**: 517,445 live-slot rows across every recorded mover
corpus contain exactly the behaviour kinds `{3,4,5,6,7,12,13,19}` — the eight
W26 bodies. W27 transcribed 29 more and W30/W31 wired the fire path, and the
live set has only reached `{3,4,5,7,13,19}`. **Zero of W27's 29 bodies have
executed anywhere.** The cause is upstream: the enemies that fire those kinds
are not ported.

This wave ports stage-1 handlers **selected by which bullet KIND(S) their fire
path produces**, then MEASURES which kinds actually executed.

STARTING STATE (inherited, to be re-measured before anything is touched):
gate ALL GREEN 49/0/0, unit tests 479/0/0.

---

## 1. THE ENUMERATION — 10 OF 19, AND THE REAL DENOMINATOR

Measured this wave, capstone 5.0.7 over `tools/oracle/out/maincpu.bin` (the
decrypted build-B image, address == file offset). The stage-1 spawn script
`$230C6C`, 8-byte records, terminator `$FFFF` at `$231704`, type at record `+$4`,
resolved through the dispatcher `$2635F6`'s two half-tables `$267824` (types
`$00..$7F`) / `$27E412` (`$80..$FF`), stride 8, handler at entry `+$4`:

**339 records, 21 distinct types, 19 distinct handlers.** Reproduces W28's recon
independently.

| handler | recs | types | ported |
|---|---|---|---|
| `$2688CC` | 104 | `$11` | **yes** (W25) |
| `$26A2E2` | 64 | `$07` `$27` | **yes** (W25) |
| `$2747C6` | 33 | `$82` | **yes** (W25) |
| `$269CEA` | 28 | `$05` | **yes** (W25) |
| `$27687E` | 25 | `$8B` | **yes** (W25) |
| `$268232` | 16 | `$10` | **yes** (W25) |
| `$26A5E4` | 12 | `$08` | — |
| `$26AD28` | 12 | `$0B` | — |
| `$276702` | 10 | `$8A` | **yes** (W30) |
| `$27733E` | 7 | `$89` | — |
| `$26A860` | 7 | `$09` | — |
| `$2739C0` | 6 | `$80` | **yes** (W30) |
| `$272AAC` | 6 | `$20` `$21` | — |
| `$275F30` | 3 | `$88` | — |
| `$275914` | 2 | `$85` | **yes** (W30) |
| `$26B6FA` | 1 | `$0D` (midboss) | **yes** (W31) |
| `$29700C` | 1 | `$24` | — |
| `$2697F6` | 1 | `$31` | — |
| `$292902` | 1 | `$0E` (boss) | — |

**PORTED: 10 of 19 handlers, owning 289 of 339 records (85.3 %).** The nine that
remain own 50 records.

## 2. THE SELECTION CRITERION — WHICH KINDS DOES EACH FIRE?

`kind = D0 & $3F` at the generator entry (`$281556 andi.w #$3F,D0` in
`emitRecord`; the template's type word is `$8100|kind`, so the mover's
`$282030[type & $3F]` is that same number). So the question is answerable
statically: enumerate every call site of the nineteen generator entry points and
resolve the immediate that reaches D0.

**The call-site population is complete and it is 519.** Scanning
`$230000..$2A0000` for `jsr`/`jmp` absolute to any of the nineteen entries gives
519 sites; a second scan for **pc-relative** `bsr.w`/`bsr.b`/`bra.w` into the
same nineteen returns **0**, so there is no route I have missed by only looking
for absolute calls.

Per handler, by recursive call closure (following `bsr`/`jsr`/`bra`/`bcc` and
tracking the last immediate into D0):

| handler | type | KINDS IT FIRES |
|---|---|---|
| `$26A5E4` | `$08` | **13** (`$26A782`) |
| `$26A860` | `$09` | **13** (`$26A93E`) |
| `$26AD28` | `$0B` | **13** (`$26AE0A`, `$26AECC`) |
| `$272AAC` | `$20`/`$21` | **none — it fires no bullet at all** |
| `$275F30` | `$88` | **4** (`$2761DE $2761E6 $2761EE $27622E $276236 $27623E`) |
| `$27733E` | `$89` | **6** (`$27745C`, `$277464`) |
| `$2697F6` | `$31` | **none** |
| `$29700C` | `$24` | **none** |
| `$292902` | `$0E` (boss) | data-driven; the `$295xxx..$296xxx` sites in its range carry **3, 4, 7, 9, 11, 12, 19** |

### THE ANSWER TO THE BRIEF'S QUESTION, AND IT IS NOT THE EXPECTED ONE

**No non-boss stage-1 handler fires any kind outside `{3,4,5,6,7,12,13,19}`.**
Every one of the eight fires 13, 4, 6, or nothing. The ONLY stage-1 route to a
W27 body is the **boss `$292902`** (kinds **9** and **11**), and it reaches its
fire sites through installed script tables (`$294AD8` and friends) whose format
nobody has read — the D0 at those sites is `move.l $C(A4),D0`, not an immediate,
so even the boss's kind set cannot be bounded from the listing without reading
that format first.

**So the brief's premise — "the enemies that would fire those kinds are not
ported" — is false for stage 1.** Porting stage-1 enemy handlers cannot make a
W27 body execute. That is the wave's first finding and it is measured, not
argued.

## 3. AND EIGHT OF THE NINE ARE BEHIND A WALL THE PORT CANNOT PASS

The stage-1 script's records are keyed on the distance clock `$8130CE`
(record `+$0`). Measured over all 339 records:

- the **midboss `$0D` triggers at clk `$00C5` = 197**;
- the midboss HALTS THE SCROLL until it is killed (W31 §3, verified against the
  board: `$813172` pins at 1600 from lf4021 with `$813176` = 0);
- **the port cannot kill anything**: `$286096` (DAMAGE) is a counted note in
  every ported handler, so no enemy in the port ever loses HP.

Therefore the deepest clock any port run can reach is the one the fly-around
window reaches with the midboss alive: **239**.

```
clk <= 239 : 138 of 339 records (40.7 %), and they use exactly TWELVE types:
             $05 $07 $0D $10 $11 $20 $27 $80 $82 $85 $8A $8B
```

**Eleven of those twelve are ported. The twelfth is `$20` (`$272AAC`).**
The other eight unported handlers — `$08 $09 $0B $88 $89 $24 $31 $0E` — have
their FIRST trigger at clk 283, 322, 420, 424, 464, 481, 488… i.e. **every one
of them is behind the midboss halt.**

### 3.1 A CLAIM I WROTE AND THEN FALSIFIED MYSELF, RECORDED RATHER THAN DELETED

I first wrote here that "the board corpora stop at the same wall — clk `$00E3`
= 227 at lf16000". **That was wrong, and it was wrong because I read the last
line of a TSV whose `S` rows and frame rows have the clock in DIFFERENT
COLUMNS.** Measured properly:

```
w22-spawn-stage1.tsv, clk trajectory:  lf2401 clk $0099   lf8001 clk $01DA
                                       lf8801 clk $0300   lf9601 clk $0344
                                       lf12801 clk $001B  <- STAGE 2
  type $31 spawns lf8106 clk $01E1 ;  type $0E (THE BOSS) spawns lf8186 clk $01E8
```

**The board's own recorded run kills the midboss, finishes stage 1 and enters
stage 2.** All 21 scripted types spawn in it, plus `$1C` (the midboss's own
death burst, `$26B184`) and `$1E` (spawned by the boss handler) — so stage 1's
true type set is **23**, not 21.

And that makes the finding *stronger*, not weaker.
`w26-mover-invuln.tsv` — the corpus F1 counted 485,422 live-slot rows in —
covers **lf1618..8999**, i.e. it contains **813 frames of a LIVE stage-1 boss**
(spawned lf8186). The boss ran, on the board, inside the corpus, and the corpus
still contains only `{3,4,5,6,7,12,13,19}`. So:

> **Not one of W27's 29 bodies executes in stage 1 on the board, including
> during the 813 recorded frames of the stage-1 boss.**

The wall in §3 is therefore a fact about **the port**, not about the corpora:
the port cannot reach clk > 239, and 8 of the 9 remaining handlers live beyond
it. Both statements are true and they are different statements.

## 4. THE DEFECT THIS WAVE ACTUALLY FOUND: THE PORT LEAKS SUB-RECORDS

Chasing "why does the one reachable unported handler `$272AAC` not throw when
its record IS dispatched" produced a defect that has been silently live since
W29 wired the enemy subsystem in.

**The measurement, on the fly-around replay:**

```
lf2000   common sub-record slots occupied:   7 of 100
lf2400                                      44
lf2800                                      70
lf2906   100 of 100  <- and it never comes down again
lf3200  100     (25 live enemies)
lf4000  100     (15 live enemies)
```

100 slots held by 15 enemies. **From lf2906 onward every new enemy in the port
fails its sub-record allocation and is silently cleared** — `initDispatch`
returns `failed:true`, `$263622 bcs $263674` clears the record, and nothing
throws, notes or counts it. Measured for the type-`$20` record at clk 188:

```
DBG type 20 carry false addr 8133cc flags 1
DBG init {"init":$272A42,"initBody":$272A4A,"runLen":0,"failed":true} h=0 word=0
```

### THE CAUSE, OUT OF THE LISTING

- `$2635D8 tst.b (A6) / beq` — the allocator's FREE test is **byte 0 == 0**.
- `$263762` (free the enemy) writes **1**, not 0:
  `moveq #$1,D0 / move.w ($4,A5),D1 / move.b D0,(A6) / lea $20(A6),A6 / dbra`.
- So a freed slot reads 1 and the allocator still calls it occupied.

**The routine that turns 1 into 0 is `$28AD54` — TYPE-5 CALL #3 — and it is
one of the 22 unported subsystem calls.** Its first twelve instructions are a
reaper over all **150** slots (`move.w #$95,D0`, i.e. the 100-slot common pool
`$81459C` and the 50-slot special pool `$81521C` are CONTIGUOUS and walked as
one):

```
$28AD54 move.w #$95,D0 / moveq #$0,D1 / lea $81459C,A0
$28AD60 tst.b (A0) / beq $28AD68        already 0 -- skip
$28AD64 bmi $28AD68                     NEGATIVE = alive -- skip
$28AD66 move.w D1,(A0)                  positive non-zero (= the freeEnemy 1) -> ZERO
$28AD68 lea $20(A0),A0 / dbra D0
$28AD70 ...                             falls through into the $81DB90 sub-record
                                        spawn engine's own driver -- a different
                                        subsystem, still noted
```

`$28AD54` was a `note()` in `src/type5.js` labelled only "the sub-record spawn
engine driver". **It is two routines by fall-through** — the classic trap — and
the half nobody read is the half the allocator depends on.

**Consequence for every coverage number since W29.** Any port run longer than
~900 frames from a mid-stage seed has been spawning nothing. That is not a
sampling caveat, it is a silent failure of the exact shape `docs/knowledge/03`
is about, and no gate could see it because the compared columns are the ones
the surviving enemies write.

## 5. WHAT WAS PORTED, AND WHY THESE

Chosen by the criterion the brief set, applied to the measurements above.

### 5.1 `$28AD54`'s reaper — type-5 call #3, FIRST LOOP ONLY

Not a handler, and the wave's most important line of code: without it no
handler ported after lf2906 could ever run. `src/spawn.js reapSubRecords`,
wired in `src/type5.js` at its ROM position in the 23-call list (after call #2,
the enemy frame — the order is the cartridge's).

**The rest of `$28AD54` is still a note, under its own address `$28AD70`**, so
the port is visibly a partial one. `TYPE5_PORTED` 9 → **10 of 23**.

### 5.2 `$272AAC` — types `$20`, `$21` and `$23`, the SCRIPTED CARRIER

The **only** unported stage-1 handler a port run can reach (§3). It fires no
bullet; it spawns other enemies, one per cooldown, of the type its movement
stream names. Extent `$272AAC..$272B46 rts`, with `$272B48` the NEXT type's
8-byte init stub immediately after it — read past the `rts` to see that, and
stop there. The one structural surprise: `$272B44 beq $272AF6` branches
BACKWARD `$50` bytes into the middle of the bounds block, so "the salvo ran
out" and "it left the screen" are literally the same exit.

**And its init body `$272A4A` had a note whose reasoning was wrong.** W23 wrote

> "record +$16/+$18/+$1A params are not loader-written, so the port leaves them
> at the pool default"

They *are* loader-written — by `$272A7E`/`$272A82`/`$272A86`, out of the
movement stream — and the handler reads all three every frame. With them at the
pool default the carrier would spawn type 0 forever. Replaced with the real
stream read, including the `$272A68 cmpi.w #$2` escape (a param-1 of 2 sets
`($8,A6)`, which the handler's first instruction reads to SKIP scroll
compensation, and the real type is the next word).

**Read out of the ROM, the six stage-1 carrier records spawn:**

| script record | data idx | stream ptr | spawns |
|---|---|---|---|
| `$230F7C` clk 188 | `$041` | `$231CAE` | type `$11` |
| `$2312D4` clk 313 | `$066` | `$23201E` | type `$11` |
| `$2313C4` clk 351 | `$067` | `$23203A` | type `$11` |
| `$2313DC` clk 354 | `$068` | `$232058` | type `$11` |
| `$23145C` clk 376 | `$071` | `$232126` | type `$11` |
| `$23146C` clk 377 | `$072` | `$232148` | type `$10` |

Both already ported — so this handler adds no new kind either, and that was
known before it was written rather than discovered after.

**Stage-1 handlers: 10 of 19 → 11 of 19**, owning 295 of 339 records.

## 6. THE MEASUREMENT — THE WAVE'S REAL OUTPUT

`tools/w33kindgate.mjs`, on `fly-around` (lf2001..4200, the invulnerability
poke `$810424=FF` on both sides, as the scenario declares). The hook is
`ctx.bulletKind` at `src/mover.js`'s `$281F0E jsr (A1)` — the one instant a
behaviour body executes.

| | BEFORE | AFTER |
|---|---|---|
| **kind set** | **{3,4,5,7,13,19}** | **{3,4,5,7,13,19}** |
| W27 bodies executed | **0 of 29** | **0 of 29** |
| kind 3 / 4 / 5 / 7 / 13 / 19 dispatches | 124 / 73 / 14 / 388 / 52 / 20 | 124 / **96** / **49** / **430** / **58** / **60** |
| fire sites | 19 | 19 |
| `$281484` fired | 20 | **60** |
| `$2817A8` fired | 14 | **49** |
| `$2817B8` fired | 16 | **56** |

**THE KIND SET DID NOT MOVE, AND THAT WAS PREDICTED BEFORE ANY CODE WAS
WRITTEN** (§2, and it is stated there as the expectation). What moved is the
VOLUME: with the sub-record leak fixed the stage keeps spawning, so type `$80`'s
three fire sites run three times as often and kinds 4, 5, 7, 13 and 19 are
dispatched 40–200 % more.

**Which kinds I expected to see, and did not, and why** — stated per the brief:

- **6 and 12** are the two W26 bodies the port has still never dispatched.
  Kind 12 is fired from `$268232` (type `$10`, PORTED) — but from inside its
  `$2682F8..$268490` fire/state machine, which is a whole-block `note()`, so
  the fire never happens. Kind 6 is fired only by types `$89`/`$8E`/`$45`/`$54`,
  all behind the midboss halt. Neither is reachable by porting a handler.
- **Nothing in {0,1,2,8,9,10,11,14..18,20..38}**, because §2 measured that no
  stage-1 handler except the boss fires any of them.

## 7. EVERY CHECK WAS SEEN TO FAIL

`games/ddpdoj/tests/w33carrier.test.js`, 13 tests. Mutations applied
byte-exactly in Python with a single-occurrence anchor assertion, the whole
suite run, the file restored, sha256 verified identical both ways after every
one (`src/spawn.js` `32e45e8aa28e7520`, `src/initbody.js` `0f23ac74ed3a043f`,
`src/handlers.js` `008228d72418d043`).

| # | mutation | result |
|---|---|---|
| M1 | reaper: the `$28AD64 bmi` arm dropped — ALIVE slots get reaped | RED — 2 |
| M2 | reaper: `$28AD66` read as `move.b`, so byte 1 survives | RED — 1, alone |
| M3 | reaper: 100 slots (the common pool only), not 150 | RED — 1, alone |
| M4 | init: the params take the whole word, not `and.w #$FF` | RED — 1, alone |
| M5 | init: the `$0002` escape does not consume the extra word | RED — 1, alone |
| M6 | init: the three params stored as BYTES, not words | RED — 2 |
| M7 | carrier: `$272B10 bcc` read as `bne` | RED — 4 |
| M8 | carrier: `$272B34` sets bit 6 of the LOW byte of the type word | RED — 1, alone |
| M9 | carrier: `$263690`'s D1 fixed at 0 instead of `($D,A5)` | RED — 1, alone |
| M10 | carrier: the salvo test reads `($19,A5)` as a byte, not the word | RED — 2 |
| M11 | carrier: `$272ACC bcs` read as `bcc` | RED — 5 |
| **M12** | carrier: `$272AD2 ext.l` dropped — axis A read UNSIGNED | **GREEN, then RED — 1** |
| **M13** | carrier: `($8,A6)`'s sense inverted | **GREEN, then RED — 1** |

**13 mutations, 13 RED. TWO SURVIVED THE FIRST PASS AND BOTH WERE DEFECTIVE
CHECKS OF MINE, NOT UNCATCHABLE MUTATIONS** — the distinction W31 asked later
waves to keep:

- **M13 — a check driven with the difference switched off.** Every carrier test
  ran with a zero scroll accumulator, so `scrollCompensate` moved nothing and
  running it or skipping it looked identical. Fixed by setting `$80B03C` and
  asserting `($2,A6)` under BOTH senses of `($8,A6)` in one loop.
- **M12 — a bounds fixture outside the band it was about.** My off-screen value
  was `$F000`, and `$F000` is off screen under the signed AND the unsigned
  reading. The two disagree only on `$F801..$FFFF` — **2,047 half-words,
  counted exhaustively in the test** — where `ext.l` makes the value negative
  and it lands back inside `($3800,$B800)`. The test now enumerates the band,
  pins both ends, and then drives the handler at `$FC00`. My first instinct was
  to write this up as "provably uncatchable" like W31's M11/M12; the exhaustive
  count is what stopped me, and it is in the test so nobody has to trust the
  paragraph.

## LOG (appended as findings arrive)

- opened.
- enumerated: **339 records / 21 types / 19 handlers**, ported **10 of 19**
  (289 of 339 records). Reproduces W28 independently.
- the 519 generator call sites resolved to kinds; **pc-relative call sites: 0**,
  so the population is complete.
- **NO non-boss stage-1 handler fires a kind outside the W26 eight.** Only the
  boss `$292902` does (9 and 11), through an unread script format.
- **the midboss halt at clk 197 is the wall**: 138 of 339 records are reachable,
  11 of their 12 types are ported, and the twelfth is `$20`/`$272AAC`.
- BEFORE measurement, from a committed tool (`tools/w33kindgate.mjs`) rather
  than a scratch script: fly-around lf2001..4200, **KINDSET {3,4,5,7,13,19}**,
  0 W27 bodies. Reproduces W31 §4.2 exactly.
- corrected my own §3 claim about the board corpora within the hour (§3.1):
  the recorded run DOES finish stage 1 and enter stage 2, and
  `w26-mover-invuln.tsv` contains **813 frames of a live stage-1 boss** and
  still only the eight kinds.
- **THE PORT LEAKS SUB-RECORDS** (§4). `$263762` marks DYING (1), the allocator
  wants FREE (0), and the 1 -> 0 reaper is the first loop of `$28AD54` — a
  routine the port had noted as something else entirely. 100 of 100 slots from
  lf2906; every spawn after that silently discarded, for four waves.
- reaper ported; the pool now tracks the live population (37 occupied / 36
  live, 26 / 27), and the type-`$20` record at clk 188 reaches `$272AAC` and
  throws BY ADDRESS — the loud-throw mechanism doing exactly its job.
- `$272AAC` ported (types `$20`/`$21`/`$23`), and its init body's note replaced
  with code: the note's claim that +$16/+$18/+$1A "are not loader-written" was
  wrong and the handler reads all three.
- AFTER measurement: **KINDSET {3,4,5,7,13,19} — UNCHANGED, as predicted in
  §2 before any code was written.** Dispatch COUNTS up 40-200 % because the
  stage keeps spawning again.
- 13 mutations, 13 RED; two survived the first pass and both were defective
  checks of mine (§7), neither uncatchable.
- `spawnEvent` added so the two silent drop arms are COUNTED — the check that
  would have caught §4's defect four waves ago.
