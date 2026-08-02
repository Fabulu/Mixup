# W23 IMPL — ENEMY STATS BECOME DATA: the two loaders, the 208 pairs, the 21 init bodies

status: **IN PROGRESS**
wave: 23 (plan W23)   role: implementer (sole `src/` writer this wave)
date: 2026-08-02
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B
(`$23xxxx`–`$2Axxxx`) unless the line says otherwise. **No build-A address is
introduced anywhere in this wave.**

## THE SPEC (plan §3, verbatim)

> **W23 — enemy stats become data.** The two loaders + the 208 exported pairs +
> the 21 stage-1 init BODIES at init+8. *Done when:* every stage-1 type's
> hitbox/HP/speed/heading/palette/bucket words match the board's records at
> spawn, compared over the W17 corpus at 0 divergent; red: swap two types'
> tables. *Leverage: 124 of 126 types, two routines.*

## WHAT IS ALREADY PORTED (reused, not re-touched)

- **The two prototype loaders `$2637A2`/`$26377A`** — `src/enemyproto.js` (W20).
  `loadSubProto` (the long/short form, the sign-bit branch at `$2637AA`) and
  `loadRecordProto` (D0+1 words → `($16,A5)`). W20 validated them for the two
  turret types; W23 extends their TABLE COVERAGE to all 21 stage-1 types.
- **The aim pair `$24200A`/`$24202C`** — `src/aim.js` (W20). Several init bodies
  call these to pick a sprite/bucket from the spawn-position-relative aim; the
  routines are ported and are reused unchanged.
- **The spawn walker + init+8 dispatch** — `src/spawn.js` (W22). `initDispatch`
  resolves init+8 and `runInitBody` currently THROWS. W23 replaces the throw
  with the 21 translated bodies.

## THE 21 STAGE-1 INIT BODIES (the work)

Each init+8 body, disassembled and translated. The common spine, then the
per-type bespoke stats adjustments:

| type | n | init+8 | sub-proto | rec-proto | runLen | flags | notes |
|---|---|---|---|---|---|---|---|
| `$11` | 104 | `$26871C` | `$268828` | `$268808` | 0 | `$A200` | bucket `$267F70`/palette `$2687FE` tables, HP/palette rank adj via `$8130B2/$8130BC/$242E24` |
| `$10` | 16 | `$2680B8` | `$2681B2` | `$268192` | 0 | `$A200` | bucket `$267F70`/palette `$268188`, HP adj via `$8130B4/$8130BC`, sprite `$268694` |
| `$05` | 28 | `$269BCE` | `$269CCE` | `$269CB4` | 0 | `$A201` | damage-first family, shared sprite `$269E48/$269EC8`, HP adj `$8130BA`, stage-kill tails |
| `$07`/`$27` | 64 | `$26A1EA` | `$26A2C6` | `$26A2B0` | 0 | `$A201` | damage-first family (alias pair) |
| `$08` | 12 | `$26A4BC` | `$26A5C8` | `$26A5B2` | 0 | `$A201` | damage-first |
| `$09` | 7 | `$26A794` | `$26A844` | `$26A82E` | 0 | `$A201` | damage-first |
| `$0B` | 12 | `$26ABA0` | `$26AD0C` | `$26ACF6` | 0 | `$A201` | damage-first, long stage-4 tail |
| `$80` | 6 | `$273802` | `$27394E` | `$27392C` | 1 | `$A001` | sprite/bucket via aim `$272F7A`, palette `$273922`, loop-flag HP |
| `$82` | 33 | `$27462A` | `$274770` | `$274754` | 1 | `$A001` | sprite/bucket via aim `$272DFA`, palette `$27474A` |
| `$85` | 2 | `$27581A` | `$2758B0` | `$27589A` | 1 | `$A001` | sprite/bucket via aim `$272DFA`, palette `$275890` |
| `$88` | 3 | `$275DA0` | `$275ECC` | `$275EAC` | 1 | `$A000` | sprite/bucket via aim `$272D7A`, sub-rec sprite `$2763D8`, palette `$275EA2` |
| `$89` | 7 | `$277278` | `$277322` | `$277316` | 0 | `$A000` | sprite via `$24202C`+`$272E7A`, palette `$27730C` |
| `$8A` | 10 | `$2766AE` | `$2766E6` | `$2766E0` | 0 | `$8100` | scroll-locked ground gun |
| `$8B` | 25 | `$276824` | `$276862` | `$27685E` | 0 | `$A200` | scroll-locked ground gun, stage/clock gate |
| `$20`/`$21` | 6 | `$272A4A` | `$272A90` | — | 0 | `$8000` | scripted carriers, no rec proto, reads params from movement |
| `$24` | 1 | `$296FB0` | `$296FF2` | — | 0 | `$8000` | boss-approach prop, resource install |
| `$31` | 1 | `$269754` | `$2697DA` | `$2697CE` | 0 | `$8000` | boss-approach prop, palette `$2697B0/$2697BA` |
| `$0D` | 1 | `$26B484` | `$26B50E` | `$26B4FA` | 16 | `$A000` | THE MIDBOSS (runLen 16 → 17 sub-records), sets `$8130D8/$8130DA` |
| `$0E` | 1 | `$2926E2` | `$292806` | `$2927F6` | 8 | `$A001` | THE BOSS (runLen 8), bespoke state machine `$259554` (W30) |

## THE CAPTURE BOUNDARY (pre-handler, measured)

The enemy driver `$263502` is the per-frame walk that calls each enemy's handler.
Its FIRST instruction is `clr.w $815e9c` (the live-count clear) — a WRITE I can
tap. At CURPC `==$263502`, the spawn walker has finished (all this-frame spawns
are initialised) and NO handler has run yet this frame. So a write-tap on
`$815e9c` filtered to CURPC `==$263502` is the exact PRE-HANDLER capture point:
every spawned enemy holds its init-time stats fields, untainted by a handler
iteration. This is the "AT SPAWN" the done-when names.

The capture records, per freshly-claimed slot (the allocator-claim tap from W22
identifies which slots spawned this frame): the type byte (+$0C), and the
stats fields — sub-record (via +$06): flags/hitbox(+10..16)/HP(+18)/speed(+1A)/
heading(+1B)/palette(+1D)/anim(+1E); record: HP-reload(+26)/bucket(+28/+2A/+2E).
Plus the globals the bespoke adjustments read (`$813092/$813094/$813098/$8130B2/
$8130B4/$8130BA/$8130BC/$8130CE` and the stage-kill flags `$8130D8..`).

## WHAT I RULED OUT / DEFERRED (named, not silent)

- **`$263808` (movement-script INITIAL-position reader) → W24.** It reads
  resource #$1F (resolved through the IGS027A protection at `$246CAC`, NOT
  portable without the resource base). Position (+$02/+$04) is NOT a done-when
  field. For the aim→bucket types ($80/$82/$85/$88/$89), the spawn bucket
  depends on the spawn position through the aim; that dependency is a NAMED W24
  gap on the bucket field for those five types, not a silence.
