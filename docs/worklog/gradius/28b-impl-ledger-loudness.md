# Wave 28b IMPL — the per-stage ledger + non-mode-5 loudness

status: IN PROGRESS
wave: 28b   role: implementer (sole src/ writer)   started: 2026-08-03

Wave 1 of the whole-game plan (29-plan-whole-game.md W28). Two parts, both
measured, both re-derived from `assets/prg.bin` + `src/`. Nothing ROM-derived
is committed; the baseline below is COVERAGE (the port's own state).

CONTEXT: stage 1 (`$19 = 0`) shipped W22-W27; stages 2-7 recon is
28-recon-stages-2-7.md. This wave builds the regression-tracking ledger (so
every later stages-2-7 wave gets free regression coverage) and makes the
non-mode-5 modes LOUD (they were a silent miss per 20-plan sec 5 / the W21
loudness note).

## PART A -- THE LEDGER

A new tool, `games/gradius/tools/oracle/stageledger.py`, wired into
`tools/test-all.mjs` as a coverage stage ("per-stage coverage ledger"). For
each of the 7 stages it prints one line and FAILS if any stage's coverage
moved backward relative to a frozen baseline inside the tool.

RECORD-COUNTING CONVENTION (one, documented): a "record" is a DISTINCT ROM
ADDRESS in the stage's wave lists. Chunk streams share tails, so "record
reads" overcounts; the honest denominator is distinct addresses -- the same
convention `wavecensus.py` prints and the recon table (28-recon sec 1) used.

A record is PORTED if the port can dispatch its spawn: single/formation
records (cmd < $F0) need their `$AE1C` handler in `src/enemies.js dispatch()`
(read live, so it cannot drift); inline-5 records (cmd >= $F0) are the
unported `$A37A` route and count as UNPORTED. "first unported" is the earliest
scroll at which the port cannot dispatch (handler-missing OR inline-5).

### MEASURED (the freeze point, 2026-08-03)

```
stage  distinct  ported  unported  inline5  ported %  first unported
0      92        92      0         0        100.0     NONE (shipped)
1      93        88      5         0         94.6     scroll $09A0 (@$A9B5)
2      78        28      5         45        35.9     scroll $00E0 (@$A9CB)
3      98        96      2         0         98.0     scroll $0160 (@$AAFA)
4      28        8       16        4         28.6     scroll $0000 (@$ABB6)
5      98        47      51        0         48.0     scroll $03B0 (@$AC2E)
6      111       95      16        0         85.6     scroll $0340 (@$AD02)
ALL    598       454     95        49        75.9
```

The `unported` column agrees with wavecensus.py exactly (distinct = ported +
unported + inline5). Only stage 0 (in-game stage 1) is fully shipped; the
other six are the W29+ stages-2-7 work.

### RULE 4 -- the gate was seen to fail

Broke a ported handler (`case 0xB205` -> `0xB204` in src/enemies.js) and the
ledger went RED, exit 1:

  stage 0 regressed: was fully shipped, now first unported at $02C0
  stage 0 regressed: ported 73 < baseline floor 92
  (+ 8 more across stages 1-6)

Restored, SHA-verified `src/enemies.js`
`f190eeee...357c28` both ways, ledger GREEN again. A SKIP IS NOT A PASS.

## PART B -- LOUDNESS

Two throws, both from the W21 loudness note (20-plan sec 5 / 21-impl sec "the
THREE LOUDNESS FIXES"). The non-mode-5 modes were a SILENT miss: nmi.js's mode
dispatch had no else, so the 76 title/attract windows the sweep measured
(20-recon-sweep-harness.md, modes 0,1,2) were quiet wrong frames. Now both
unported paths throw the ROM address.

### B1 -- nmi.js mode dispatch `else throw` ($80D1/$80D4)

`$80CF LDA $00 / $80D1 JSR $83E4` dispatches the mode byte through jt_80D4, the
7-entry table verified straight out of prg.bin:

```
jt_80D4: [0]$80E2 [1]$8116 [2]$8121 [3]$8137 [4]$8165 [5]$9650 [6]$816C
```

Only [5] ($9650 = MODE_STAGE) is ported. nmi.js now throws on any other mode,
citing the entry + target. MODE_TARGETS is exported (fixed ROM data, measured
out of prg.bin -- it cannot go stale the way a ported-set literal would).

### B2 -- oam.js `$8BD9`/`$8C06` terrain-object sprite pass throw

`$8B8D LDA $19 / CMP #$04 / BEQ $8BD9` -- stage 5's terrain-object sprite pass
inside buildDisplayList ($8B10, run at $80A7). When `$19 == 4` the cartridge
walks $0600,X (cursor $90, step -$30) and calls $8C06 per live cell to draw the
moai wall / destructible scenery. NOT ported (one stage loaded, stage 1).
oam.js now throws on `state.zp19 === 4`, cited to `$8BD9`.

ORDERING NOTE (the fall-through trap, RULE: read past the apparent end).
buildDisplayList runs at $80A7, BEFORE the state machine at $80AA, so for
`$19 == 4` this `$8BD9` throw fires BEFORE nmi.js's `$9663` stage-5 census arm.
`$9663` stays in the code as a defense-in-depth tripwire (it becomes the first
throw once `$8BD9` is ported, in the stage-5 wave). flow.test.js's `$19 == 4`
assertion was updated `/\$9663/` -> `/\$8BD9/` to match the real first-failure
address; weapons.test.js's `$19 == 4` case calls `missileLoop` (not nmi), so it
is unaffected.

### RULE 4 -- both throws seen to fire

A quick probe entering each state:
  mode 0  -> throws `$80D1: game mode 0 is not ported -- jt_80D4 entry 0 -> $80E2 ...`
  zp19=4  -> throws `$8BD9: stage-5 ($19 = 4) terrain-object sprite pass ...`

And the 76 non-mode-5 windows: the port boots straight to mode 5 (src/main.js
`s.mode = MODE_STAGE`) and never transitions out, so neither throw fires in the
47-scenario corpus or any mode-5 frame -- they are tripwires that turn a future
silent wrong frame into a named ROM address.

### node --test

`node --test games/gradius/tests/` -> 475 pass, 0 fail, 0 skipped (was 475
before; the one edited assertion is the same count, different address). The
flow.test.js `$19 == 4` row is the only behaviour change and it still asserts a
throw, just at the earlier `$8BD9`.
