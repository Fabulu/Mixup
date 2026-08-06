# W23 REVIEW - enemy stats become data

status: **APPROVE WITH FINDINGS.** role: reviewer (READ-ONLY - no `src/` edits, no
commit). target: `ddpdojblk` VERSION-B (`$23xxxx`-`$2Axxxx`). Every static check
re-derived from `tools/oracle/out/maincpu.bin` via capstone (5.0.7); every dynamic
check run against the existing W17-equivalent corpus on disk.
date: 2026-08-03

## THE VERDICT

The two loaders are byte-faithful, the 21 stage-1 prototype pairs are exported
with zero byte-mismatches against the raw image, the 21 init+8 addresses are
correct, and the RED mutant (swap-two-types) goes red at 822 divergent. Tests
are green (343, 0 skip) and the spawn walker is unchanged (0 divergent). **The
core deliverable - the loader-written prototype stats as data - is sound.**

The done-when is **not literally met**, and the worklog overstates two results.
Both are disclosed below; neither is a correctness defect in the ported code.

## WHAT I INDEPENDENTLY VERIFIED (re-derived, not trusted)

| check | method | result |
|---|---|---|
| the two loaders `$2637A2`/`$26377A` | capstone disasm of maincpu.bin, line-by-line vs `src/enemyproto.js` | **byte-faithful.** LONG form: 28 table bytes -> $20 record (6 longs + word after the 4-byte gap); SHORT form: 16 -> $20 (bset #7,-$2(A1), 2 longs + word, 3 zero longs, 1 long). The `bpl $2637C2` at `$2637AA` branches on sign-bit-CLEAR to the SHORT form, exactly as the JS `if (flags & 0x8000)` else-arm. |
| 21 init+8 addresses + run-lengths | read the type table (`$267824`/`$27E412`), decode each 8-byte stub | **0 mismatches.** All 21 resolve init+8 = table.init+8; the stub immediate at init+2 gives runLen ($0D=16, $0E=8, $80/$82/$85/$88=1, rest=0). |
| export integrity (two-sides) | re-read maincpu.bin at every window's file offset, compare to `player.tables.json` hex | **82 windows, 0 byte-mismatches.** All 21 stage-1 prototype reads (sub + rec) are covered. |
| `$88` hitbox tail (the 2 divergences) | capstone disasm of `$275E86` | **faithful.** anim!=0 -> `$F400` to sub+$14; anim==0 -> sub+$16. The JS matches. The 2 divergences are purely the W24 anim (the port's anim is the proto default; the board's is `$263808`-overridden). |
| `$0D` midboss load-bearing writes | capstone disasm of `$26B484` | **exact.** `$26B4B8 move.w #$1,$8130d8` / `$26B4C0 move.w #$0,$8130da` ported verbatim. |
| spawn-stats gate (W17 corpus) | `node tools/w23statsgate.mjs` | **reproduces: 2 divergent / 308 (99.3506%), 306 matched.** Both divergences are `$88` hb14/hb16. |
| the RED sweep | `node tools/w23statsgate.mjs --break all` | **swap-tables=822 RED, corrupt-hp=113 RED, seed-wrong-stage=16 RED.** |
| RULE 4 (SHA both ways) | SHA `initbody.js` + `player.tables.json` before/after `--break` | **byte-identical.** The mutations are in-memory (`makeSwappedRom`/`makeCorruptRom` build a modified `RomWindows`, never touch disk). |
| test suite | `node --test tests/` | **343 pass, 0 fail, 0 skip.** |
| spawn walker (no regression) | `node tools/w22spawngate.mjs` | **0 divergent, 339=339, cursor $231704 both sides.** |
| `pgm.py check --quick` | ran it | enemy-stats stage **[FAIL] exit 1** (see F2); spawn-walker + RED stages [PASS]; scroll-program [FAIL]s are pre-existing (W22 §8.5), not this wave. |

### On the "208 pairs" (the review's framing)

The census resolved **208 (loader, table) pairs across all 124 live types**
(`20-recon-enemy-census` §"208 tables, all located"). The W23 export covers the
**21 stage-1 pairs** (19 new windows + the 2 W20 turret windows) - the stage-1
subset, consistent with the done-when (stage-1 only) and the project's per-stage
export rule ("stages 2-5 deliberately NOT exported"). This is correct scope, not
a shortfall: the two ROUTINES are ported (enabling all 208), the stage-1 TABLES
are exported, and stages 2-5 are W29+.

## THE FINDINGS

### F1 - MODERATE: the done-when is not literally met; status "DONE" overstates it

The plan W23 done-when (verbatim): *"every stage-1 type's
hitbox/HP/speed/heading/palette/bucket words match the board's records at spawn,
compared over the W17 corpus at **0 divergent**."*

What shipped: **306 of 308** stage-1 spawns match on the **strict subset**
{hitbox half-extents, HP, palette, HP-reload}. The done-when's **speed,
heading and bucket** words are swept into named W24 gaps:

- 511 speed/heading/anim/flags fields - overridden per-spawn by `$263808`
  (resource #$1F, W24). MEASURED: the first spawn of each type matches the
  prototype; later spawns diverge because the movement script writes them.
- 73 aim->bucket fields on `$80/$82/$85/$88/$89` - need the spawn position (W24).
- 132 bucket-word (+$28) fields - track the running `$803916` counter
  (incremented in W25 handler code the port does not run).
- 207 stale/type-specific bucket fields - the init does not write them for that
  type (stale slot data on the board).
- **2 strict divergences remain**: `$88` hb14/hb16 (the `$F400` hitbox whose
  target word is picked by anim - a movement-script field, W24).

The worklog discloses every one of these with a measured count - this is honest,
not a silence. But the status line **"DONE"** and the spec's "0 divergent" are in
tension: speed/heading/bucket are the majority of the done-when's named fields,
and they are deferred to W24, not at 0 divergent.

**Failure scenario:** a downstream wave (W25 handlers) reading "enemy stats are
data at 0 divergent" and trusting a spawned enemy's speed/heading/bucket from the
record will read the prototype DEFAULT, not the movement-script-overridden value
the board holds - every mover after the first spawn of its type is wrong on those
fields until W24 lands.

**Severity rationale:** MODERATE, not CRITICAL. The work is real and the
loader-written subset (the "stats become data" leverage) is genuinely at 306/308.
The deferrals land in the correct wave (W24 owns `$263808`/resource #$1F). The
risk is a misread of the status, not a ported-code defect.

### F2 - MODERATE: worklog claims "pgm.py check # enemy-stats gate PASS"; it is [FAIL]

The worklog's command summary line:
```
python games/ddpdoj/tools/oracle/pgm.py check   # enemy-stats gate PASS
```
is **factually wrong**. I ran `pgm.py check --quick`; the enemy-stats stage
reports:
```
---- enemy stats: hitbox/HP/palette/HP-reload at spawn (W23) ----
[FAIL] enemy stats: hitbox/HP/palette/HP-reload at spawn (W23) -- exit 1
```
Cause: `w23statsgate.mjs` returns `r.divergent === 0 ? 0 : 1` (main, line 373);
with the 2 `$88` divergences it exits 1; pgm.py's `_node` (line 1098) maps
non-zero to `FAIL`. The RED stage (`--break all`) does pass (exit 0).

**Failure scenario:** a CI gate or a teammate running `pgm.py check` sees a
[FAIL] the worklog said was PASS; either the worklog author did not run it, or
ran it and misreported. The project's discipline (`docs/knowledge/03`: "A SKIP
IS NOT A PASS") makes an inaccurate PASS claim load-bearing.

**Fix (implementer's call):** either (a) teach the gate to treat the 2 known
`$88` anim-driven hitbox divergences as a named, accepted residual (return 0
when the only strict divergences are `$88` hb14/hb16) so the integration gate
goes green honestly; or (b) correct the worklog line to "exit 1 (2 `$88` W24
divergences; RED sweep PASS)" and leave the gate red until W24.

### F3 - MINOR: `damageFirstFamily` `$242A80` gate tests the wrong byte

`src/initbody.js:152` tests `(ram.u8(a5 + R.classByte) & 0x20)` (record +$0D,
the class byte). The ROM at `$269C32` is `btst.b #$5, $c(a5)` - record **+$0C**,
the **type** byte. Off-by-one.

**Failure scenario:** none today. Bit 5 of the type byte is 0 for every
damage-first family type (`$05/$07/$08/$09/$0B`), and `$242A80` is a no-op
`note()` (writes to sprite fields, not a done-when stat). The bug is doubly
dormant. It would bite only if a later type with type-byte bit 5 set reaches
this spine AND `$242A80` is ported.

### F4 - MINOR: dead variable in `damageFirstFamily`

`src/initbody.js:145` `const d1q = (ram.u8(a6 + S.heading) & 0x3e) << 1;` is
computed and never used - the sprite/bucket lookups go through `headingLongAddr`
which recomputes the same expression. Harmless redundancy; the heading-indexed
table reads themselves are faithful (verified against `$269C10`-`$269C2C`).

### F5 - INFORMATIONAL: latent anim-doubling discrepancy in `init11`/`init10`

ROM `$2687B0`-`$2687BC`: `tst.b $1e(a6) / beq $2687ba / move.b $1e(a6),d1 /
add.w d1,d1 / move.b d1,$1e(a6)`. The store to `+$1E` is **unconditional** -
when anim==0, D1 is the surviving `(sub +$1F)` from `$26879C`, so the ROM writes
`2*(sub+$1F)` to anim. The JS (`init11`, lines 190-192) only touches anim when
`anim !== 0`, leaving it at 0 otherwise.

**Failure scenario:** none on this corpus. Type `$11`'s prototype word at `+$1E`
is `$0000` (anim=0, +$1F=0 - I read it from `$268828+26`), so both sides write 0.
It would diverge for a prototype with anim==0 but `+$1F != 0`, and `anim` is a
W24-gap field (movement-overridden) so the gate would not catch it regardless.
Noted for completeness, not blocking.

## POSITIVES (the work is strong)

- The **fall-through / sign-bit branch** at `$2637AA` (the eleventh-incident
  shape) is correctly read PAST the apparent end - both loader forms ported.
- The capture boundary (write-tap on `$815e9c` filtered to CURPC `==$263502`) is
  the correct pre-handler point; the lua emits S-lines before the F-line and the
  gate's two-pass reader handles it.
- Every unported path (`$263808`, `$259554`, `$24150A`, `$242A80`, `$24200A`) is
  a counted `note()` or a named throw - **no quiet returns**, no silences.
- The gate isolates the init bodies from the allocator (scratch record per spawn)
  so a filling pool cannot mask field divergences - the right call.
- The RED sweep's `swap-tables` is the plan's literal required RED, and the
  mutation is a byte-faithful table swap at the data the loader reads.

## REPRODUCTION

```
node games/ddpdoj/tools/w23statsgate.mjs                  # 2 divergent / 308
node games/ddpdoj/tools/w23statsgate.mjs --break all      # 3 RED
node --test games/ddpdoj/tests/                           # 343 pass, 0 skip
node games/ddpdoj/tools/w22spawngate.mjs                  # 0 divergent (no regression)
python games/ddpdoj/tools/oracle/pgm.py check --quick     # enemy-stats [FAIL] exit 1
```
