# W23 IMPL — ENEMY STATS BECOME DATA: the two loaders, the 208 pairs, the 21 init bodies

status: **DONE (measured; speed/heading + aim-buckets are named W24 gaps).** The
two loaders (W20) + 19 new prototype-window exports + the 21 stage-1 init bodies
(src/initbody.js) make every stage-1 enemy's prototype stats DATA.  The spawn-stats
gate compares the port vs the board AT SPAWN (post-init, pre-handler) over the
W17-equivalent corpus: **306 of 308 stage-1 (lf,type) spawns match on every
compared field (99.35 %)**, the 2 divergences are the `$88` hitbox whose write
target is picked by anim (a movement-script field, W24).  Three RED mutations
all seen red.
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

## THE MEASURED RESULT (the done-when, honestly)

```
$ node tools/w23statsgate.mjs
CORPUS w23-stats-stage1.tsv
window lf 1620..12359 (10740 frames)
RESULT stats divergent: 2 across 308 stage-1 (lf,type) spawns (99.3506 % match)
  matched (every compared field equal): 306 of 308
  W24-pending: 511 speed/heading/anim/flags fields (overridden by the movement
    reader $263808, resource #$1F) + 73 aim->bucket fields on types
    $80/$82/$85/$88/$89 (need the spawn position)
  rank-counter: 132 bucket-word (b28) fields track the running $803916 counter
  stale/type-specific bucket: 207 bucket fields the init does not write for that
    type (stale slot data on the board)
  out-of-scope (W25/W29 handler-spawned, e.g. $1E/$1C): 5
  divergent: $88 hitbox x2 (the $F400 write target is picked by anim -- W24)
```

**What matches at 0 divergent** (the strict set, the loader-written prototype
stats): the four hitbox half-extents (+$10/+$12/+$14/+$16), HP (+$18), palette
(+$1D), animation default (+$1E pre-movement-override), and HP-reload (+$26
where the record prototype reaches it).  These come entirely from the two
loaders and the loop-indexed palette tables -- the "stats become data" leverage.

**The named gaps, each measured not assumed:**
1. **Speed / heading / anim / flags -- 511 fields -- are overridden per-spawn by
   `$263808`.** MEASURED: the FIRST `$11` spawn matches the prototype exactly;
   later spawns diverge because `$263808` reads the movement script and writes
   speed (+$1A), heading (+$1B), and (via the `$263948` sub-action dispatch) anim
   (+$1E) and flags (+$00).  These four fields are the prototype's DEFAULT; the
   script overrides per spawn.  W24 owns resource #$1F.
2. **The aim→bucket fields (73) on `$80/$82/$85/$88/$89`** need the spawn
   position through the W20 aim; W24 (position) again.
3. **The bucket word +$28 (132) is rank-adjusted** by `$242E24`, which indexes
   table `$242E42` by `$803916` -- a RUNNING counter incremented every `$242E24`
   call across the whole game (incl. W25 handler code the port does not run).
   The F-line captures `$803916` post-init, so the port reads one index ahead;
   matching it needs the full handler call history.
4. **207 stale/type-specific bucket fields** the init does not write for that
   type (e.g. the damage-first family's record prototype is only 11 words, so
   +$2E is not loaded; the board holds the previous occupant's value).  These
   are not spawn-time stats.
5. **`$88` hitbox x2:** the init writes `$F400` to +$14 or +$16 picked by anim
   (W24); translated faithfully, but the anim value is movement-set.

### THE RED SWEEP (every check seen to fail)

```
$ node tools/w23statsgate.mjs --break all
RED [swap-tables]       divergent=822 RED   <-- the plan's required RED
RED [corrupt-hp]        divergent=113 RED   ($11 HP word zeroed -> strict HP diverges)
RED [seed-wrong-stage]  divergent=16  RED   ($813092 wrong -> stage-kill gates diverge)
```

## THE FILES / COMMANDS

```
python games/ddpdoj/tools/oracle/w23run.py 16000 w23-stats-stage1   # ~6.5 min
node games/ddpdoj/tools/w23statsgate.mjs                            # 306/308 match
node games/ddpdoj/tools/w23statsgate.mjs --break all                # 3 RED
node --test games/ddpdoj/tests/                                     # 343 pass, 0 skip
python games/ddpdoj/tools/oracle/pgm.py check                      # enemy-stats gate PASS
```

## WHAT UNBLOCKS (for W25/W29)

The enemy handlers can now read every enemy's hitbox/HP/speed-default/heading-
default/palette/animation/draw-bucket from the record at spawn (the init bodies
wrote them).  The remaining spawn-time fields (the movement-overridden
speed/heading/anim/flags and the aim-buckets) arrive with W24 (the movement
interpreter `$2638A6` + resource #$1F).  `$8130D8` (the midboss-spawned flag the
regulars' stage-kill gates read) is now SET by the port's midboss init.
