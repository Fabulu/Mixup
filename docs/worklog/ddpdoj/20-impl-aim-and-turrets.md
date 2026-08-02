# W20 IMPL — the aim pair, the prototype loaders, and the first turrets

status: **DONE**
wave: 20   role: implementer (DAIOUJOU)   started: 2026-08-02
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Addresses are build B
(`$23xxxx`–`$2Axxxx`) unless the line says otherwise; `$2xxxxx` below `$230000`
is shared DATA/library, not build-A code (`NOTES-build-split.md`). **No build-A
address is introduced anywhere in this wave.**

Brief: port the aim pair + its five tables (260 call sites), the enemy
prototype loaders (2 routines + 208 table pairs behind 124 of 126 types), and
the first stage-1 enemies **including their turret rotation**; validate on
**turret angle per frame** in a scenario where the ship MOVES.

---

## 0. THE HEADLINE

**47,520 one-step pairs and 47,520 closed-loop steps across two board corpora,
0 divergent on the turret's FACING, its AIM CADENCE and its 32-direction SPRITE
POINTER.** 21,339 of those steps executed the aim itself. Eight gate mutations
and three source breaks, every one seen RED and every source break restored
byte-identical (sha256 verified both ways).

```
$ node tools/w20turretgate.mjs                       # THE PLAYING RUN
CORPUS w20-turret-play.tsv  frames=6000 Frows=6000 Erows=27415
ONE-STEP(a) pairs=14732 facing_divergent=338 (97.7057 %)  cadence_divergent=6  gfx_divergent=160
ONE-STEP(b) pairs=14732 facing_divergent=0 (100.0000 %)  cadence_divergent=0  gfx_divergent=0
CLOSED-LOOP steps=14732 divergent=0 (100.0000 %) seeded=66 resyncs=0
EXCLUDED death-path=1523 record-vanished=60 driver-did-not-run=11094 (measured at $263502)
AIMED steps that actually reached $24200A = 4885 of 14732 pairs
TYPE $10 pairs=978 divergent=0     TYPE $11 pairs=13754 divergent=0
COVERAGE distinct board facings=43/64  distinct aim outputs produced=37/64  octants=0,2,8,10,12 (5/8)
RESULT 0 DIVERGENT on facing, cadence and sprite over 14732 one-step pairs and 14732 closed-loop steps

$ node tools/w20turretgate.mjs --corpus tools/oracle/out/w20-turret-invuln.tsv
CORPUS w20-turret-invuln.tsv  frames=9500 Frows=9500 Erows=36151
ONE-STEP(a) pairs=32788 facing_divergent=1027 (96.8678 %)  cadence_divergent=0  gfx_divergent=511
ONE-STEP(b) pairs=32788 facing_divergent=0 (100.0000 %)  cadence_divergent=0  gfx_divergent=0
CLOSED-LOOP steps=32788 divergent=0 (100.0000 %) seeded=158 resyncs=0
EXCLUDED death-path=3205 record-vanished=158 driver-did-not-run=0
AIMED steps that actually reached $24200A = 16454 of 32788 pairs
TYPE $10 pairs=5499 divergent=0    TYPE $11 pairs=27289 divergent=0
COVERAGE distinct board facings=48/64  distinct aim outputs produced=37/64  octants=5/8
RESULT 0 DIVERGENT ... over 32788 one-step pairs and 32788 closed-loop steps
```

---

## 1. WHAT I BUILT

| file | what |
|---|---|
| `games/ddpdoj/src/aim.js` | the player-tracking library's LIVE subset: `aim64` core `$24203E`, `aim256` core `$2422A2`, wrappers `$24200A $24202C $242178 $24226E $242290`, the three target selectors `$24270A $242730 $242748`, the slews `$24218C $242190 $2421AC`. The 23 unreferenced entries are LOUD NAMED THROWS carrying their measured reference count. |
| `games/ddpdoj/src/enemyproto.js` | the two prototype loaders `$26377A` and `$2637A2` — **both forms of `$2637A2`**, see §3 |
| `games/ddpdoj/src/turret.js` | the turret block `$268A0E..$268A5A` (type `$11`, handler `$2688CC`) and `$268376..$2683C2` (type `$10`, handler `$268232`) — one function, the sprite table as a parameter, because the two blocks are otherwise instruction-identical |
| `games/ddpdoj/tools/export-tables.py` | **+8 ROM windows** (96 → 29,520 B total): aim64's three tables, aim256's three, both halves of the enemy type table, both turret types' record and sub-record prototypes, and both 32-direction sprite tables |
| `games/ddpdoj/tools/oracle/w20turret.lua` | THE TURRET LEDGER: every live enemy record's facing/cadence/graphic/position + the player position + the enemy-driver execution count, at the board's own sample point |
| `games/ddpdoj/tools/oracle/w20run.py` | drives it through `pgm.run` (the ONE entry point) — default is the PLAYING run |
| `games/ddpdoj/tools/w20turretgate.mjs` | THE GATE: one-step and closed-loop, two sample-point hypotheses, 8 mutations, `--break all` |
| `games/ddpdoj/tests/aim.test.js` (15) `tests/turret.test.js` (13) | the suite goes 210 → **238 pass, 0 fail** |
| `games/ddpdoj/tools/oracle/pgm.py` | `check` now runs the turret gate on both corpora + the 8 mutations |

**NOT wired into the port's frame loop, and this is the honest limit of the
wave.** `turretStep` is a state transition on one record. To run it live the
port needs the spawn walker `$263336`/`$2633BE` (W21), the movement interpreter
`$2638A6` (W24) and the enemy record allocation, none of which exist. So the
turret is *validated against the board* frame by frame, and it is *not yet
producing anything on the page*. `state.js`'s `WATCH_SPEC`/`CLAIMED` are
therefore unchanged — there is no new ported write inside the live frame, and
adding one would have been a claim I could not back.

---

## 2. THE SCENARIOS — which kind each one is, and what rank they ran at

Both runs press the VERSION-B chooser, coin, start, and then drive the owner's
own routine: **sit bottom-centre, hold auto-shot (P1 Button 3, `$2497B2`), drift
left/right on 12-frame legs, throw a bomb (Button 2, `$2497FE`) periodically.**

| run | kind | frames | turret rows | bombs | deaths | reach |
|---|---|---|---|---|---|---|
| `w20-turret-play` | **PLAYING — on-distribution. NO invulnerability poke.** | 6,000 | 27,415 | 4 | **2 (real)** | 11 enemy types, the midboss `$0D` |
| `w20-turret-invuln` | INVULNERABLE (`$810424:=$FF` from lf1250) — coverage only | 9,500 | 36,151 | 6 | 0 | **23 types, 21 handlers, the boss `$0E` (1,561 dispatches)** |

`20-OWNER-scenarios-must-play.md` §2 and `docs/knowledge/09` both prefer the
playing run, and the verdict is taken on BOTH. The playing run is the primary:
it fires, kills, bombs, and dies twice, so every number from it is
on-distribution. The invulnerable run is carried because it reaches three times
as much of the stage — it is labelled coverage-only on every line it appears.

**RANK.** `$81309E` is the rank word and it is recomputed every frame by
`$2608D2` (W19). Neither run pokes it. **`$813098` (the loop) read 0 on every
frame of both runs, as it has on every frame this project has ever measured.**
`$813092` (the stage index) was 0 throughout stage 1.

**IS ANY AIM BEHAVIOUR RANK-GATED, AND THEREFORE UNTESTED? NO — and that is a
listing fact, not an absence of measurement.** `$24203E..$2420C4` and
`$2422A2..$242318` touch only D0–D4, A0, A7 and three PC-relative ROM tables:
no global, no RNG, no stage, no rank (`20-recon-aiming.md` §6, re-read here).
There is no Gradius-style randomised lead: 2 of the 260 aim sites have an RNG
within ±$60 bytes and both are on the random-*direction* branch `$242A48`, not
on the aim. **Rank cannot change what this file computes.** What rank *does*
change, and what this wave therefore does NOT validate, is listed in §6.

---

## 3. TWO THINGS THE ROM DOES THAT THE RECONS DID NOT REPORT

### 3.1 `$2637A2` HAS TWO FORMS, PICKED BY BIT 15 OF THE PROTOTYPE'S FLAGS WORD

`20-recon-enemy-census.md` §2 transcribes the sub-record loader as one straight
line and concludes "exactly `$20` bytes per sub-record". The listing has a
branch two instructions in that the recon did not report:

```
2637a2: move.w ($4,A5),D7            the run length
2637a6: movea.l A6,A1
2637a8: move.w (A0)+,(A1)+           the flags word -- AND IT SETS THE CCR
2637aa: bpl $2637c2                  <-- THE BRANCH
2637ac: addq.w #4,A1 / move.l (A0)+,(A1)+ x6 / move.w (A0)+,(A1)+   LONG: 28 B
2637bc: dbra D7,$2637a8
2637c2: bset #$7,(-$2,A1)            SHORT: turn the stored word NEGATIVE, then
2637c8: addq.w #4,A1 / move.l x2 / move.w / THREE ZERO LONGS / move.l   16 B
2637da: dbra D7,$2637a8
```

Both forms write `$20` record bytes; they consume **28 and 16 table bytes**
respectively, and the form is re-decided for **every** sub-record, so one
prototype can mix them. A port carrying only the long form advances its table
pointer by 12 too many on every short sub-record and reads everything after it
from the wrong offset. The recon's worked example (type `$11`, flags `$A200`)
is right precisely because bit 15 is set; its general statement is not.

Both types this wave validates take the long form, so **the board corpus cannot
see the short form at all** — which is why `tests/turret.test.js` asserts it
from the listing, and why breaking it (`if (true)` in place of
`if (flags & 0x8000)`) was one of the three source breaks.

### 3.2 THE ENEMY DRIVER DOES NOT RUN ON EVERY FRAME, AND INFERRING THAT WOULD HAVE BEEN CIRCULAR

The first pass of the gate reported **9,888 cadence divergences** on the playing
corpus. The port was right: on those frames the enemy records were
BYTE-IDENTICAL from one sample point to the next — position, facing, cadence,
everything — while `$8130D2` read 0. The enemy driver never executed. (It is
the player-death / respawn window; the top-level object driver stops dispatching
the enemy object.)

"Nothing changed, so nothing ran" is the thing under test, so it is **measured**
instead, with the only reliable 68000 execution hook there is — a WRITE tap:

```
$263502 clr.w $815E9C     ONCE per enemy-driver pass (the first instruction)
$263546 addq.w #1,$815E9C once per surviving record inside the pass
CENSUS $815E9C writer PCs (3) 263546:35310 263502:2533 263328:1     [playing run]
CENSUS $815E9C writer PCs (3) 263546:67860 263502:7882 263328:1     [invuln run]
```

So the driver ran on **2,533 of the playing run's 6,000 frames** and **7,882 of
the invulnerable run's 9,500** — and the gate excludes the rest by measurement.
(`$263328` writes it once, in both runs: a third writer, unread, noted for W21.)

**This changes a denominator, so it is stated loudly:** the playing corpus's
14,732 compared pairs are 14,732 pairs *on frames the driver actually ran*, not
25,826 pairs of which 11,094 were tautologies.

---

## 4. WHERE THE SAMPLE POINT SITS — MEASURED, AND PREDICTED BY THE LISTING

The board row is taken at the `$803940` arm write. Whether that instant precedes
or follows the object driver decides whether the inputs to the N→N+1 transition
are row N's positions or row N+1's. **The gate evaluates both and prints both**:

```
ONE-STEP(a) inputs from row N     facing_divergent = 338 / 14,732  and 1,027 / 32,788
ONE-STEP(b) inputs from row N+1   facing_divergent =   0 / 14,732  and     0 / 32,788
```

This is not a fitted parameter. `$2688CC` opens `jsr $2638A6` — the movement
interpreter — and reaches the aim 260 bytes later at `$268A30`, so the position
the aim sees is the POST-move position of the same frame, which is exactly the
one the next sample point reports. The listing predicts (b); 47,520 rows with a
6-bit output confirm it; (a) is left in the output so the difference stays
visible rather than being quietly absorbed.

---

## 5. THE MUTATIONS AND THE BREAKS — every one SEEN RED

### 5.1 Gate mutations (`--break`), on the PLAYING corpus

| mutation | what it does | facing div | gfx div | cadence div |
|---|---|---|---|---|
| `plain-atan2` | drops `$24205C`'s 1.5 axis scale | **3,689** | 1,986 | 0 |
| `no-p2-fallback` | honours `($3,A5)` without `$242722`'s alive test | **2,176** | 1,188 | 0 |
| `aim-every-frame` | ignores `$268A1A`'s cadence | **930** | 459 | 0 |
| `no-muzzle` | drops `$268A2C addi.w #$200,D0` | **924** | 507 | 0 |
| `no-slew` | snaps to the aim instead of `$242190`'s one step | **572** | 544 | 0 |
| `round-toward-zero` | drops `$24207C`'s round-to-nearest | **173** | 89 | 0 |
| `lut-generated` | computes the arctan instead of reading `$2420F6` | **149** | 70 | 0 |
| `no-freeze-gate` | ignores `$8130D2` | 0 | 0 | **3,348** |

**`no-freeze-gate` is the one to look at.** It leaves the FACING column
untouched — during a freeze nothing moves, so the aim would return the same
answer — and it is caught **only** by the cadence column. Without comparing
`($18,A5)` this gate would have shipped a mutation it could not see, i.e. a
check that cannot fail. It is the eighth-defective-check shape, caught by
comparing three columns instead of one.

### 5.2 Source breaks — the TESTS seen red, then restored byte-identical

```
sha256 BEFORE and AFTER all three (identical):
  5e982e3614228ffa1b2d6a11cdff965f2a73335ace713e404730de25f20af370  src/aim.js
  df9c4293a975a834c7db76ea316f8b2d21675f6fa215cff4f8c763ec66d78db1  src/turret.js
  9e64cfbca39f480c9dfab3665ac87fa0b18a19b51643b0a0cf6a56edfe6eca3d  src/enemyproto.js
```

| break | edit | result |
|---|---|---|
| A | `aim64` loses the 1.5 (`asrw(d1,1)` → `0`) | aim tests 3 and 15 RED; gate `facing_divergent=3689` |
| B | the sprite index loses the `addq.b #1` | turret test 6 RED; gate `facing_divergent=0`, **`gfx_divergent=2441`** |
| C | `$2637A2` always takes the long form (the recon's reading) | turret tests 11 and 12 RED |

Break B is the cleanest evidence in the wave: the facing column stays perfect
while the sprite column goes to 2,441 — proving the sprite pointer is a genuinely
independent compared column and not a function of the facing the gate already
checks.

**Two of my own tests failed the first time I ran them, and the PORT was right
both times** (I had expected the turret to step *up* where the geometry says
*down*, and I had labelled `+$0E` as the first hitbox half-extent where the
census says `+$10`). Recorded because the brief asks whether the checks were
watched going red: these two went red without being pushed.

---

## 6. WHAT I DID NOT DO, AND WHY

1. **The turret is not in the frame loop.** See §1. It needs W21's spawn walker
   and W24's movement interpreter. The full handler dispatch is a LOUD NAMED
   THROW (`turretHandler`) that lists every block of `$2688CC` this wave did not
   translate.
2. **The fire block is not ported.** `$268A5A btst #$5,(A6)` → `$268A62 subq.b
   #1,($28,A5)` → `$268A86` → the rank-gated wrapper `$281402` with kind 13, and
   the 16-entry muzzle table `$268B1E`. That is W26/W27. The `($28,A5)` fire
   cadence is captured in the corpus so W27 has it.
3. **aim256 is ported and thinly measured.** 111 call sites; the recon saw **12
   executions at 2 sites** in 3,600 frames, and neither of this wave's turret
   types calls it. My aim256 is listing-exact and validated only by its
   cardinals and by the shared front half. `20-plan` §7 item 4 stands.
4. **Only 5 of the 8 octants were exercised: 0, 2, 8, 10, 12.** Stage-1 enemies
   enter from the top and the ship sits at the bottom, so `dY` is positive at
   essentially every aim. The three unreached octants are the ones where the
   target is ABOVE the shooter. The port covers them (the back-half test
   enumerates all 8 × 129 states and all 64 outputs from the tables), but no
   BOARD row exercised them. This is a named gap, not a claim.
5. **37 of 64 aim outputs and 48 of 64 facings** appeared. Same reason.
6. **The 23 dead library entries are not ported**, on purpose: each has zero
   references in the whole 6 MB image, and each throws by address if reached.
   Also not ported: the eleven distance functions (`$24249A`'s family, 24 call
   sites, an **octagonal** metric with 3/4 on the VERTICAL axis where the aim
   uses 3/2 on the horizontal — the two must not be unified), and
   `$242A48`'s random-direction generator (7 sites).
7. **The 91 CORE call sites are still unclassified** (recon gap 2). At least one
   (`$293224`) aims at a fixed world point, so "260 player-tracking sites" is an
   upper bound. Unchanged by this wave.
8. **`$263328` writes `$815E9C` once per run** in both corpora — a third writer
   of the live-enemy counter that nobody has read. One disassembly for W21.
9. **The prototype export covers only types `$10` and `$11`.** The loaders are
   general; the *data* is not exported for the other 124 types, so a read of any
   other prototype is a LOUD THROW BY ADDRESS rather than a plausible enemy.
   W23 widens the windows.

---

## 7. FOR THE REVIEWER — where to look hardest

1. **§4, the sample-point hypothesis.** I chose (b) because 47,520 rows say so
   AND because `$2688CC` moves before it aims. If you think that is a fit, the
   falsifier is cheap: hypothesis (a) is red at 338 and 1,027 on the two corpora
   and is printed on every run.
2. **§3.2, the driver-did-not-run exclusion.** 11,094 of the playing corpus's
   pairs are dropped by it. It is measured at `$263502` by a write tap, but the
   *sufficiency* of that tap is my inference: I claim that if the driver pass
   ran, every present record was dispatched (the walk at `$26351E..$26356C` is
   an unconditional `dbra` over all 58 slots). Check that claim.
3. **`$2637A2`'s short form** — I am correcting a recon here, from the listing,
   with no board evidence, because no stage-1 type reaches it. Re-read
   `$2637A2..$2637DE` and check the byte counts (28 vs 16) and the `bset
   #$7,(-$2,A1)` target (the word's HIGH byte, i.e. bit 15).
4. **FALL-THROUGH.** I read past the end of every routine I ported:
   `$2420C4` is the `rts` the `beq` at `$242070` targets and `$2420C6` is the
   OPS TABLE, not code; `$242318` is aim256's shared `rts` and `$24231A` is the
   next stub; `$2421A8..$2421AA` is the tail `$242196`'s `beq` jumps to (the
   recon's transcript of `$242190` stops one instruction early, at `subq.b #2` —
   the real tail is `and.w D2,D0 / move.w D0,D1 / rts` and the mask is NOT
   redundant); `$24272E` is the `rts` both `bmi` arms of `$24270A` reach;
   `$2637A0`/`$2637C0`/`$2637DE` are three separate `rts`s and `$2637E0` is a
   different routine. `$2688CC`'s turret block falls through into the FIRE block
   at `$268A5A`, which is unported and named.
5. **The gate's `key()`** is `slot:subptr:handler`. If a slot were recycled
   within one frame to a record with the same sub-record pointer, the gate would
   compare two different enemies. That direction produces a false FAILURE, never
   a false pass — but check the reasoning.
6. **`AimTables`'s constructor checks** `$2420C6`'s eight longwords against the
   two dispatch targets and `$242312`'s eight stubs against `$9240`/`$D240`.
   That is the one place a stale export turns into a wrong quadrant instead of a
   throw; make sure the check is on the right bytes.

---

## 8. THE COMMANDS

```
python games/ddpdoj/tools/export-tables.py                     28 windows, 29,520 B
python games/ddpdoj/tools/oracle/w20run.py 6000 w20-turret-play          THE PLAYING RUN
python games/ddpdoj/tools/oracle/w20run.py 9500 w20-turret-invuln --poke 1250
node games/ddpdoj/tools/w20turretgate.mjs
node games/ddpdoj/tools/w20turretgate.mjs --corpus games/ddpdoj/tools/oracle/out/w20-turret-invuln.tsv
node games/ddpdoj/tools/w20turretgate.mjs --break all           8 mutations, all RED
node --test games/ddpdoj/tests/                                 238 pass, 0 fail
python games/ddpdoj/tools/oracle/pgm.py check --quick
```

Nothing ROM-derived is committed: the two TSVs, `rip/port/player.tables.json`
and `tools/oracle/out/` are gitignored, and the commit went through the private
index `.git/dojB.index` with `read-tree HEAD` immediately before staging.
