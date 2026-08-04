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
